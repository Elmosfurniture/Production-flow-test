import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  bottleneckMinutes,
  minutesToWorkDays,
  orderSendDate,
  scheduleOne,
  workDaysUntil,
  isoWeek,
} from '../lib/scheduling'
import { crBand } from '../lib/priority'
import { loadWoodJobStatus, WOOD_JOB_STATUS_EVENT } from '../lib/woodJobStatus'

// Global in-memory cache for the whole app. The factory floor runs on tablets
// where every screen change must be instant — so on app start we pull every
// slow-moving table from Supabase once and serve every screen from this cache.
// Writes (job start/pause/stop, CSV imports) go straight to Supabase and then
// call refresh() to repopulate the cache.

const AppDataContext = createContext(null)

const ORDER_COLS = 'id, kwitasie_nr, qty, qty_done, status, product_code, customer_code, department, due_date, prod_week, prod_day, send_week, send_day, description, priority_rank, ord_nr, "group", wood_type, notes, needs_review, original_item_code, ready_for_dispatch_at, shipped_at'

// Parse the order's Group column into every dept the order touches.
// A "Chair, ST" / "Furn & St" Group lands the order on BOTH Wood and Steel
// because every keyword present contributes a dept independently. Group is
// the ONLY signal here — no description / product-code heuristics. Edit the
// pattern lists below when a new keyword shows up.
const WOOD_PATTERN = /chair|chr|cnc|finish|frn|furn|moulder/
const STEEL_PATTERN = /\bst\b|steel/
const UPHOL_PATTERN = /uphol/
const DISP_PATTERN = /disp/

function detectDepartments(group) {
  const g = String(group || '').toLowerCase().trim()
  if (!g) return []
  if (g === 'other') return ['other']
  const depts = []
  if (WOOD_PATTERN.test(g)) depts.push('wood')
  if (STEEL_PATTERN.test(g)) depts.push('steel')
  if (UPHOL_PATTERN.test(g)) depts.push('upholstery')
  if (DISP_PATTERN.test(g)) depts.push('dispatch')
  return depts
}

function FullScreenLoader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F3EF', color: '#1f2a44', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '4px solid rgba(31,42,68,0.15)', borderTopColor: '#1f2a44',
          animation: 'elmo-spin 800ms linear infinite',
        }} />
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Loading factory data…</div>
        <div style={{ fontSize: 12, color: '#8a8e99' }}>Caching orders, products &amp; machine routings</div>
        <style>{`@keyframes elmo-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

function FullScreenError({ message, onRetry }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F3EF', color: '#1f2a44', padding: 24, fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        maxWidth: 460, background: 'white', border: '1px solid rgba(26,29,36,0.08)',
        borderRadius: 18, padding: 24, boxShadow: '0 12px 28px rgba(26,29,36,0.10)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#d2533a' }}>Can't reach Supabase</div>
        <div style={{ fontSize: 13, color: '#4a4e5a', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{message}</div>
        <button
          onClick={onRetry}
          style={{
            marginTop: 6, alignSelf: 'flex-start',
            background: '#1f2a44', color: 'white', border: 0,
            padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 6px 14px rgba(31,42,68,0.22)',
          }}
        >Retry</button>
      </div>
    </div>
  )
}

export function AppDataProvider({ children }) {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [parts, setParts] = useState([])
  const [machineSteps, setMachineSteps] = useState([])
  const [machines, setMachines] = useState([])
  const [customers, setCustomers] = useState([])
  const [employees, setEmployees] = useState([])
  const [holidays, setHolidays] = useState([])
  const [bufferDays, setBufferDays] = useState([])
  const [folders, setFolders] = useState([])
  const [schedule, setSchedule] = useState([])
  const [orderTracks, setOrderTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Paginated full-table load. PostgREST caps an un-ranged select at
      // ~1000 rows by default, which silently truncated machine_steps once the
      // wood parts map landed (~3600 steps → only the first 1000 reached the
      // cache, so most products showed "0 steps"). Walk 1000-row pages until
      // the response comes back short.
      const loadAll = async (table, cols) => {
        const PAGE = 1000
        let all = []
        let from = 0
        while (true) {
          const { data, error } = await supabase.from(table).select(cols).range(from, from + PAGE - 1)
          if (error) throw new Error(`Loading ${table}: ${error.message}`)
          if (!data || data.length === 0) break
          all = all.concat(data)
          if (data.length < PAGE) break
          from += PAGE
        }
        return all
      }

      const [oData, pData, ptData, msData, mData, cData, eData, hData, bData, fData, schData, otData] = await Promise.all([
        loadAll('orders', ORDER_COLS),
        loadAll('products', 'id, code, description, "group", department, default_priority, folder_id, abbreviations, is_dispatch_only, wood_day_overrides'),
        loadAll('parts', 'id, product_id, name, qty_per_unit, length, width, thickness, material_code, part_priority, is_assembly, department'),
        // wood_day_offset arrives with migration 024 — tolerate its absence so
        // the app still loads (and saves) before that migration is run.
        loadAll('machine_steps', 'id, part_id, sequence, machine_name, alt_machine_names, seconds_per_part, setup_time, wood_day_offset')
          .catch((err) => {
            console.warn('[AppDataContext] machine_steps.wood_day_offset missing (run migration 024?):', err.message)
            return loadAll('machine_steps', 'id, part_id, sequence, machine_name, alt_machine_names, seconds_per_part, setup_time')
          }),
        loadAll('machines', '*'),
        loadAll('customers', 'id, code, name'),
        loadAll('employees', 'id, name, role, departments, pin'),
        loadAll('public_holidays', 'date, name'),
        loadAll('department_settings', 'department, buffer_days'),
        loadAll('folders', 'id, name, department, created_at'),
        loadAll('schedule', 'id, order_id, machine_id, machine_step_id, scheduled_date, start_time, end_time, position, status, includes_setup, qty, qty_done, started_at, completed_at'),
        // order_tracks may not exist yet on older databases — tolerate the
        // table-missing error so the app still loads pre-migration-010.
        loadAll('order_tracks', 'id, order_id, department, prod_week, prod_day, bottleneck, total_minutes, work_days, status, started_at, completed_at')
          .catch((err) => {
            console.warn('[AppDataContext] order_tracks load failed (run migration 010?):', err.message)
            return []
          }),
      ])
      // Mirror the old destructured-response shape so the existing setters
      // below stay untouched.
      const [o, p, pt, ms, m, c, e, h, b, f, sch, ot] = [
        { data: oData }, { data: pData }, { data: ptData }, { data: msData },
        { data: mData }, { data: cData }, { data: eData },
        { data: hData }, { data: bData }, { data: fData }, { data: schData },
        { data: otData },
      ]
      setOrders(o.data || [])
      setProducts(p.data || [])
      setParts(pt.data || [])
      setMachineSteps(ms.data || [])
      setMachines(m.data || [])
      setCustomers(c.data || [])
      setEmployees(e.data || [])
      setHolidays(h.data || [])
      setBufferDays(b.data || [])
      setFolders(f.data || [])
      setSchedule(sch.data || [])
      setOrderTracks(ot.data || [])
      setLastSynced(new Date())
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // Optimistic local-state patches — used by ProductsScreen so saving one
  // product doesn't re-fetch every table. We update products/parts/machineSteps
  // directly from the rows that the save fn already round-tripped, so the UI
  // refreshes immediately and we skip the ~2s full reload.
  const applyProductSave = useCallback((productId, { product, parts: newParts, steps: newSteps }) => {
    if (product) {
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === productId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = product
          return next
        }
        return [...prev, product]
      })
    }
    setParts((prev) => {
      const oldPartIds = prev.filter((p) => p.product_id === productId).map((p) => p.id)
      const newPartIds = (newParts || []).map((p) => p.id)
      const partIdsToDrop = new Set([...oldPartIds, ...newPartIds])
      setMachineSteps((steps) => {
        const others = steps.filter((s) => !partIdsToDrop.has(s.part_id))
        return [...others, ...(newSteps || [])]
      })
      const others = prev.filter((p) => p.product_id !== productId)
      return [...others, ...(newParts || [])]
    })
  }, [])

  const applyProductDelete = useCallback((productId) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId))
    setParts((prev) => {
      const partIds = prev.filter((p) => p.product_id === productId).map((p) => p.id)
      const dropSet = new Set(partIds)
      setMachineSteps((steps) => steps.filter((s) => !dropSet.has(s.part_id)))
      return prev.filter((p) => p.product_id !== productId)
    })
  }, [])

  const applyProductMove = useCallback((productId, folderId) => {
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, folder_id: folderId } : p))
  }, [])

  // Patch arbitrary fields on a product row. Used by light edits like
  // removing an abbreviation chip — saves a full table refetch.
  const applyProductPatch = useCallback((productId, patch) => {
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, ...patch } : p))
  }, [])

  // Machine cache patches — used by MachinesScreen so toggling / editing /
  // adding / reordering / deleting a machine doesn't trigger a full table
  // reload (the old refresh() round-tripped 12 tables and took ~3s).
  const applyMachineUpsert = useCallback((machine) => {
    if (!machine || !machine.id) return
    setMachines((prev) => {
      const idx = prev.findIndex((m) => m.id === machine.id)
      if (idx >= 0) {
        const next = [...prev]
        // Merge into the existing row so partial returns (e.g. a toggle
        // response that only echoes active) don't wipe other columns.
        next[idx] = { ...next[idx], ...machine }
        return next
      }
      return [...prev, machine]
    })
  }, [])

  const applyMachineDelete = useCallback((machineId) => {
    setMachines((prev) => prev.filter((m) => m.id !== machineId))
  }, [])

  // Drag-to-reorder: assigns display_order = (i+1)*10 in the given ID order.
  // Mirrors what lib/seedMachines.reorderMachines writes to Supabase, so the
  // cache stays in sync without a re-fetch.
  const applyMachineReorder = useCallback((orderedIds) => {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return
    const posById = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]))
    setMachines((prev) => prev.map((m) =>
      posById.has(m.id) ? { ...m, display_order: posById.get(m.id) } : m,
    ))
  }, [])

  const applyFolderAdd = useCallback((folder) => {
    setFolders((prev) => [...prev, folder])
  }, [])

  const applyFolderUpdate = useCallback((folderId, patch) => {
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, ...patch } : f))
  }, [])

  const applyFolderDelete = useCallback((folderId) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
    // ON DELETE SET NULL — products that pointed at this folder now have folder_id null.
    setProducts((prev) => prev.map((p) => p.folder_id === folderId ? { ...p, folder_id: null } : p))
  }, [])

  // After buildScheduleRows + writeScheduleRows, replace the local cache for
  // the affected dates without round-tripping. queuedDates: array of YYYY-MM-DD
  // strings whose existing queued rows were just deleted on the server.
  // newRows: the freshly inserted rows (server-shape; we re-load lightweight
  // ids/columns instead of full re-fetch).
  const applyScheduleRegenerate = useCallback((queuedDates, newRows) => {
    setSchedule((prev) => {
      const dropSet = new Set(queuedDates)
      const keep = prev.filter((r) => !(r.status === 'queued' && dropSet.has(r.scheduled_date)))
      return [...keep, ...newRows]
    })
  }, [])

  // Same idea but keyed by order_id — used by Schedule's Regenerate, which
  // wipes queued rows for the regenerated orders (including overflow rows
  // on dates outside the current week) and inserts the freshly built ones.
  const applyScheduleByOrders = useCallback((orderIds, newRows) => {
    setSchedule((prev) => {
      const dropSet = new Set(orderIds)
      const keep = prev.filter((r) => !(r.status === 'queued' && dropSet.has(r.order_id)))
      return [...keep, ...newRows]
    })
  }, [])

  // Single-row patch for status / timestamps. Called after the Schedule
  // screen writes a status change (Start / Pause / Stop) so the local cache
  // updates immediately without a refresh.
  const applyScheduleRowUpdate = useCallback((rowId, patch) => {
    setSchedule((prev) => prev.map((r) => r.id === rowId ? { ...r, ...patch } : r))
  }, [])

  // Combined delete/update/insert patch for the Tracking reschedule flow:
  // closing out partial rows + inserting a new row on the next workday lands
  // as one transaction conceptually, so we patch the cache in one go.
  const applyScheduleReschedule = useCallback(({ deleted = [], updated = [], inserted = null }) => {
    setSchedule((prev) => {
      const deleteSet = new Set(deleted)
      const updateMap = new Map(updated.map((u) => [u.id, u]))
      const next = []
      for (const r of prev) {
        if (deleteSet.has(r.id)) continue
        if (updateMap.has(r.id)) next.push({ ...r, ...updateMap.get(r.id) })
        else next.push(r)
      }
      // `inserted` can be a single row (legacy rescheduleStep) or an array
      // (new rescheduleOrderLeftovers). Normalise to array.
      if (Array.isArray(inserted)) next.push(...inserted)
      else if (inserted) next.push(inserted)
      return next
    })
  }, [])

  // Called by ReconcileScreen after approving — flips needs_review=false and
  // points product_code at the chosen real product. Patches every matching
  // row locally so the bulk-approve path also removes them from the queue.
  const applyOrdersReconciled = useCallback((orderIds, productCode) => {
    const idSet = new Set(orderIds)
    setOrders((prev) => prev.map((o) =>
      idSet.has(o.id)
        ? { ...o, needs_review: false, product_code: productCode }
        : o,
    ))
  }, [])

  // Generic single-order patch. Used by markReadyForDispatch so the order
  // hops out of Tracking + into Dashboard's Ready-for-Dispatch section without
  // round-tripping a full reload.
  const applyOrderUpdate = useCallback((orderId, patch) => {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...patch } : o))
  }, [])

  // Single-order insert. Used by NewOrderForm so a manual entry shows up
  // immediately without a 3-second full table refetch.
  const applyOrderInsert = useCallback((order) => {
    if (!order || !order.id) return
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...order }
        return next
      }
      return [...prev, order]
    })
  }, [])

  // Bulk-delete orders + cascade their schedule rows + order_tracks from the
  // local cache. Mirrors the DB's ON DELETE CASCADE so the UI doesn't show
  // orphaned schedule rows for an order that no longer exists.
  const applyOrdersDelete = useCallback((orderIds) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) return
    const idSet = new Set(orderIds)
    setOrders((prev) => prev.filter((o) => !idSet.has(o.id)))
    setSchedule((prev) => prev.filter((r) => !idSet.has(r.order_id)))
    setOrderTracks((prev) => prev.filter((t) => !idSet.has(t.order_id)))
  }, [])

  // Pre-built lookups. Cheaper to compute once at provider level than to have
  // every consumer rebuild them from the flat arrays.
  const lookups = useMemo(() => {
    const productByCode = new Map(products.map((p) => [p.code, p]))
    const productById = new Map(products.map((p) => [p.id, p]))
    const customerByCode = new Map(customers.map((c) => [c.code, c]))
    const machineByName = new Map(machines.map((m) => [m.name, m]))

    const partsByProduct = new Map()
    for (const pt of parts) {
      if (!partsByProduct.has(pt.product_id)) partsByProduct.set(pt.product_id, [])
      partsByProduct.get(pt.product_id).push(pt)
    }
    // Sort by part_priority first (lower = higher priority, like CR for
    // orders) so the Products screen shows parts in the order the user gave
    // them; the engine also sees them in that order, so when ready-times tie
    // on shared machines, higher-priority parts grab the earlier slots.
    for (const list of partsByProduct.values()) list.sort((a, b) => {
      const aP = a.part_priority ?? 1
      const bP = b.part_priority ?? 1
      if (aP !== bP) return aP - bP
      return a.name.localeCompare(b.name)
    })

    const stepsByPart = new Map()
    for (const s of machineSteps) {
      if (!stepsByPart.has(s.part_id)) stepsByPart.set(s.part_id, [])
      stepsByPart.get(s.part_id).push(s)
    }
    for (const list of stepsByPart.values()) list.sort((a, b) => a.sequence - b.sequence)

    // Routing per product code, flattened to the shape scheduling.bottleneckMinutes
    // expects: { machine_name, secs_per_unit, setup_time }. secs_per_unit folds
    // in qty_per_unit so callers only need to multiply by order qty.
    const routingByCode = new Map()
    // Per-dept routings — same shape but bucketed by the machine's department.
    // Coffee table example: routingByCodeByDept.get('Coffee Table').get('steel')
    // returns just the steel base's steps; .get('wood') returns just the top.
    // Enables two-track scheduling: each dept gets its own bottleneck +
    // prod_week walking back from the same dispatch date.
    const routingByCodeByDept = new Map()
    // Parallel map: product code → Set of departments touched by its routing.
    // A mixed Frn & St product ends up with {'wood','steel'} so its orders
    // surface on both Priority tabs even though the order row only has one
    // `department` value.
    const deptsByCode = new Map()
    for (const p of products) {
      routingByCode.set(p.code, [])
      routingByCodeByDept.set(p.code, new Map())
      deptsByCode.set(p.code, new Set())
    }
    for (const part of parts) {
      const prod = productById.get(part.product_id)
      if (!prod) continue
      const steps = stepsByPart.get(part.id) || []
      const qpu = part.qty_per_unit ?? 1
      const list = routingByCode.get(prod.code)
      const deptMap = routingByCodeByDept.get(prod.code)
      const depts = deptsByCode.get(prod.code)
      // parts.department is the authoritative per-part dept (set explicitly
      // via the editor's dept tabs). Routing-derived dept is a fallback for
      // legacy parts whose department column never got backfilled — and for
      // mixed-machine parts where the part's tab still wins for grouping but
      // each step still funnels into its machine's dept bucket for routing.
      if (part.department) depts.add(part.department)
      for (const s of steps) {
        // Setup time fallback: step-level value wins if set (legacy CSV
        // import path), otherwise use the machine's setup_time_min (the
        // new per-machine model). Same logic as scheduleEngine + fetchRoutings.
        const stepMachine = machineByName.get(s.machine_name)
        const effSetup = (s.setup_time && s.setup_time > 0)
          ? s.setup_time
          : (stepMachine?.setup_time_min || 0)
        const stepShape = {
          machine_name: s.machine_name,
          // Pool alts feed the pool-aware bottleneckMinutes — same shape as
          // fetchRoutings produces, so live (cached) computations and the
          // server-side scheduleAndWrite path agree on every order's load.
          alt_machine_names: Array.isArray(s.alt_machine_names) ? s.alt_machine_names : [],
          secs_per_unit: (s.seconds_per_part ?? 0) * qpu,
          setup_time: effSetup,
        }
        list.push(stepShape)
        const machine = machineByName.get(s.machine_name)
        const stepDept = machine?.department || part.department || 'other'
        if (machine?.department) depts.add(machine.department)
        if (!deptMap.has(stepDept)) deptMap.set(stepDept, [])
        deptMap.get(stepDept).push(stepShape)
      }
    }

    const holidaySet = new Set(holidays.map((h) => h.date))
    const bufferDaysByDept = new Map(bufferDays.map((b) => [b.department, b.buffer_days]))

    const machinesByDept = new Map()
    for (const m of machines) {
      if (!machinesByDept.has(m.department)) machinesByDept.set(m.department, [])
      machinesByDept.get(m.department).push(m)
    }

    return {
      productByCode, productById, customerByCode, machineByName,
      partsByProduct, stepsByPart, routingByCode, routingByCodeByDept, deptsByCode,
      holidaySet, bufferDaysByDept, machinesByDept,
    }
  }, [products, parts, machineSteps, machines, customers, holidays, bufferDays])

  // Production-complete map: order_id → bool. An order is "production
  // complete" when every part's LAST machine_step has qty_done >= partTotal
  // (i.e. every piece has been through every station). Dashboard +
  // DispatchScreen use this to bucket orders alongside the boss's explicit
  // ready_for_dispatch_at tick. Tracking uses a per-card derivation since it
  // already has tracking.parts in hand.
  const productionCompleteByOrderId = useMemo(() => {
    // Index schedule rows by (order_id, machine_step_id) — same idea as
    // Tracking's scheduleByOrderStep, computed once here so all consumers
    // share it.
    const rowsByKey = new Map()
    for (const r of schedule) {
      if (!r.order_id || !r.machine_step_id) continue
      const k = `${r.order_id}:${r.machine_step_id}`
      if (!rowsByKey.has(k)) rowsByKey.set(k, [])
      rowsByKey.get(k).push(r)
    }
    const out = new Map()
    for (const o of orders) {
      const product = lookups.productByCode.get(o.product_code)
      const orderParts = product ? (lookups.partsByProduct.get(product.id) || []) : []
      if (orderParts.length === 0) { out.set(o.id, false); continue }
      let allDone = true
      for (const p of orderParts) {
        const partTotal = (p.qty_per_unit ?? 1) * (o.qty || 0)
        const steps = (lookups.stepsByPart.get(p.id) || []).slice().sort((a, b) => a.sequence - b.sequence)
        if (steps.length === 0 || partTotal <= 0) { allDone = false; break }
        const lastStep = steps[steps.length - 1]
        const rows = rowsByKey.get(`${o.id}:${lastStep.id}`) || []
        const lastDone = rows.reduce((s, r) => s + (r.qty_done ?? 0), 0)
        if (lastDone < partTotal) { allDone = false; break }
      }
      out.set(o.id, allDone)
    }
    return out
  }, [orders, schedule, lookups])

  // Wood day-board job statuses (localStorage — wood jobs aren't persisted
  // schedule rows yet). Kept in state and refreshed on the store's change
  // event so a "Done" tap on the wood conveyor or MES Station flows into
  // deptProgressByOrderId, and from there into every screen at once.
  const [woodJobStatus, setWoodJobStatusMap] = useState(() => loadWoodJobStatus())
  useEffect(() => {
    const sync = () => setWoodJobStatusMap(loadWoodJobStatus())
    window.addEventListener(WOOD_JOB_STATUS_EVENT, sync)
    window.addEventListener('storage', sync)   // other tab on the same device
    return () => {
      window.removeEventListener(WOOD_JOB_STATUS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // Per-department progress: order_id → Map<dept, { hasWork, started, complete }>.
  //
  // Same rule as productionCompleteByOrderId, but applied to each department's
  // slice of the routing: a dept is complete for an order when, for every part
  // that has steps in that dept, the LAST of those steps has qty_done >= the
  // part's total. So a coffee table whose wood top is finished reads
  // complete-for-wood while its steel base is still open — which is what the
  // Wood tab should show. Every screen derives "done" from this one map so the
  // sidebar windows can't disagree.
  const deptProgressByOrderId = useMemo(() => {
    // Schedule rows indexed by (order_id, machine_step_id).
    const rowsByKey = new Map()
    for (const r of schedule) {
      if (!r.order_id || !r.machine_step_id) continue
      const k = `${r.order_id}:${r.machine_step_id}`
      if (!rowsByKey.has(k)) rowsByKey.set(k, [])
      rowsByKey.get(k).push(r)
    }
    // Wood job statuses collapsed across dates: (order_id, step_id) → totals.
    // The wood key is `${orderId}::${stepId}::${date}`, and a part's work can
    // span several days, so sum the per-day qty_done.
    const woodByKey = new Map()
    for (const [key, st] of woodJobStatus.entries()) {
      const [orderId, stepId] = key.split('::')
      if (!orderId || !stepId) continue
      const k = `${orderId}:${stepId}`
      const acc = woodByKey.get(k) || { qty_done: 0, started: false }
      acc.qty_done += st?.qty_done ?? 0
      if (st?.started_at || st?.status === 'working' || st?.status === 'paused' || st?.status === 'completed') acc.started = true
      woodByKey.set(k, acc)
    }

    const doneQty = (orderId, stepId) => {
      const rows = rowsByKey.get(`${orderId}:${stepId}`) || []
      const fromSchedule = rows.reduce((s, r) => s + (r.qty_done ?? 0), 0)
      return fromSchedule + (woodByKey.get(`${orderId}:${stepId}`)?.qty_done ?? 0)
    }
    const isStarted = (orderId, stepId) => {
      const rows = rowsByKey.get(`${orderId}:${stepId}`) || []
      if (rows.some((r) => r.started_at || (r.qty_done ?? 0) > 0)) return true
      return !!woodByKey.get(`${orderId}:${stepId}`)?.started
    }

    const out = new Map()
    for (const o of orders) {
      const byDept = new Map()
      const product = lookups.productByCode.get(o.product_code)
      const orderParts = product ? (lookups.partsByProduct.get(product.id) || []) : []
      for (const p of orderParts) {
        const partTotal = (p.qty_per_unit ?? 1) * (o.qty || 0)
        const steps = lookups.stepsByPart.get(p.id) || []   // already sequence-sorted
        // Bucket this part's steps by the dept that actually runs them —
        // machine dept wins, part dept is the fallback (mirrors the routing
        // lookup above so both agree on where a step belongs).
        const stepsByDept = new Map()
        for (const s of steps) {
          const d = lookups.machineByName.get(s.machine_name)?.department || p.department || 'other'
          if (!stepsByDept.has(d)) stepsByDept.set(d, [])
          stepsByDept.get(d).push(s)
        }
        for (const [d, deptSteps] of stepsByDept.entries()) {
          const entry = byDept.get(d) || { hasWork: false, started: false, complete: true }
          entry.hasWork = true
          const last = deptSteps[deptSteps.length - 1]
          if (partTotal <= 0 || doneQty(o.id, last.id) < partTotal) entry.complete = false
          if (!entry.started && deptSteps.some((s) => isStarted(o.id, s.id))) entry.started = true
          byDept.set(d, entry)
        }
      }
      // Order-level completion outranks the per-dept maths: once an order is
      // shipped / marked complete / ticked ready-for-dispatch, no department
      // still owes work on it.
      if (o.status === 'completed' || o.shipped_at || o.ready_for_dispatch_at) {
        for (const entry of byDept.values()) entry.complete = true
      }
      out.set(o.id, byDept)
    }
    return out
  }, [orders, schedule, woodJobStatus, lookups])

  // Stored tracks by order id (Phase 2). Each value is a Map<dept, trackRow>
  // so screens can pick the steel/wood/etc. track without scanning.
  const tracksByOrderId = useMemo(() => {
    const m = new Map()
    for (const t of orderTracks) {
      if (!m.has(t.order_id)) m.set(t.order_id, new Map())
      m.get(t.order_id).set(t.department, t)
    }
    return m
  }, [orderTracks])

  // Orders enriched with product/customer names, CR, bottleneck. Heavy enough
  // that we memo it once and let getOrdersForWeek / screens slice into it.
  const enrichedOrders = useMemo(() => {
    const today = new Date()
    return orders.map((o) => {
      const routing = lookups.routingByCode.get(o.product_code) || []
      const { bottleneck, totalMinutes } = bottleneckMinutes(routing, o.qty || 0)
      const ttp = totalMinutes > 0 ? minutesToWorkDays(totalMinutes) : null
      const sendStr = orderSendDate(o)
      const ttd = sendStr ? workDaysUntil(sendStr, lookups.holidaySet, today) : null
      const cr = (ttp != null && ttd != null) ? ttd / ttp : null
      const product = lookups.productByCode.get(o.product_code)
      const customer = lookups.customerByCode.get(o.customer_code)
      // Departments the order touches. Four-step decision:
      //   1. Parse the order's Group column — primary, authoritative signal.
      //   2. If Group is blank/unknown, fall back to routing-derived depts
      //      (which machines this product's parts go through).
      //   3. Else fall back to the order's own department column — this is the
      //      signal for MANUALLY-added orders (NewOrderForm sets department from
      //      the product / tab but leaves Group empty and the product may not
      //      have routing yet). CSV imports always have a Group, so they never
      //      reach this branch — their noisy import-defaulted department can't
      //      leak an item onto the wrong tab.
      //   4. If all give nothing, land it on the "Other" tab.
      const groupDepts = detectDepartments(o.group)
      const routingSet = lookups.deptsByCode.get(o.product_code)
      const routingDepts = routingSet && routingSet.size > 0 ? [...routingSet] : []
      const touched = groupDepts.length > 0
        ? groupDepts
        : (routingDepts.length > 0
            ? routingDepts
            : (o.department ? [o.department] : ['other']))

      // Two-track tracks. Prefer the stored order_tracks rows (Phase 2 —
      // these were written by the scheduler with the actual prod_week each
      // dept needs to start, and carry status/started/completed timestamps).
      // Fall back to live compute when stored tracks don't exist yet — keeps
      // pre-migration orders rendering correctly and lets the UI work the
      // moment a new product gets routing without waiting for a reschedule.
      const stored = tracksByOrderId.get(o.id)
      const deptMap = lookups.routingByCodeByDept.get(o.product_code)
      const tracks = []
      if (stored && stored.size > 0) {
        // Use stored values; enrich with cr/cr_band for the current today.
        for (const [, t] of stored.entries()) {
          const trackTtp = t.work_days || (t.total_minutes > 0 ? minutesToWorkDays(t.total_minutes) : null)
          const trackCr = (trackTtp != null && ttd != null) ? ttd / trackTtp : null
          tracks.push({
            department: t.department,
            bottleneck: t.bottleneck,
            total_minutes: t.total_minutes,
            ttp_days: trackTtp,
            cr: trackCr,
            cr_band: crBand(trackCr),
            prod_week: t.prod_week,
            prod_day: t.prod_day,
            status: t.status,
            started_at: t.started_at,
            completed_at: t.completed_at,
            stored: true,
          })
        }
      } else if (deptMap) {
        for (const [dept, deptRouting] of deptMap.entries()) {
          if (!deptRouting || deptRouting.length === 0) continue
          const { bottleneck: bn, totalMinutes: tm } = bottleneckMinutes(deptRouting, o.qty || 0)
          if (tm <= 0) continue
          const trackTtp = minutesToWorkDays(tm)
          const trackCr = (trackTtp != null && ttd != null) ? ttd / trackTtp : null
          const trackOrder = { ...o, department: dept }
          const r = scheduleOne(trackOrder, deptRouting, lookups.bufferDaysByDept, lookups.holidaySet)
          tracks.push({
            department: dept,
            bottleneck: bn,
            total_minutes: tm,
            ttp_days: trackTtp,
            cr: trackCr,
            cr_band: crBand(trackCr),
            prod_week: r?.prod_week ?? null,
            prod_day: r?.prod_day ?? null,
            status: 'pending',
            started_at: null,
            completed_at: null,
            stored: false,
          })
        }
      }

      return {
        ...o,
        product_name: product?.description || o.description || o.product_code,
        customer_name: customer?.name || o.customer_code,
        send_date: sendStr,
        bottleneck,
        total_minutes: totalMinutes,
        ttp_days: ttp,
        ttd_days: ttd,
        cr,
        cr_band: crBand(cr),
        touched_departments: touched,
        tracks,
      }
    })
  }, [orders, lookups, tracksByOrderId])

  // Filter by prod_week (or 'unscheduled') and sort: manual ranks first, then
  // CR ascending with bottleneck minutes as tiebreaker — mirrors loadPriority().
  const getOrdersForWeek = useCallback((weekNumber) => {
    let base
    if (weekNumber === 'unscheduled') base = enrichedOrders.filter((o) => o.prod_week == null)
    else if (weekNumber == null) base = enrichedOrders
    else base = enrichedOrders.filter((o) => o.prod_week === weekNumber)
    return [...base].sort((a, b) => {
      const aR = a.priority_rank
      const bR = b.priority_rank
      if (aR != null && bR != null) return aR - bR
      if (aR != null) return -1
      if (bR != null) return 1
      const aHas = a.cr != null && Number.isFinite(a.cr)
      const bHas = b.cr != null && Number.isFinite(b.cr)
      if (aHas !== bHas) return aHas ? -1 : 1
      if (aHas && a.cr !== b.cr) return a.cr - b.cr
      return (b.total_minutes || 0) - (a.total_minutes || 0)
    })
  }, [enrichedOrders])

  const getProductWithParts = useCallback((productCode) => {
    const product = lookups.productByCode.get(productCode)
    if (!product) return null
    const productParts = (lookups.partsByProduct.get(product.id) || []).map((pt) => ({
      ...pt,
      steps: lookups.stepsByPart.get(pt.id) || [],
    }))
    return { ...product, parts: productParts }
  }, [lookups])

  const value = useMemo(() => ({
    orders, products, parts, machineSteps, machines, customers, employees,
    holidays, bufferDays, folders, schedule, orderTracks,
    enrichedOrders,
    tracksByOrderId,
    productionCompleteByOrderId,
    deptProgressByOrderId,
    loading, isLoading: loading, error, lastSynced,
    reload, refresh: reload,
    getOrdersForWeek, getProductWithParts,
    applyProductSave, applyProductDelete, applyProductMove, applyProductPatch,
    applyMachineUpsert, applyMachineDelete, applyMachineReorder,
    applyFolderAdd, applyFolderUpdate, applyFolderDelete,
    applyScheduleRegenerate, applyScheduleByOrders, applyScheduleRowUpdate, applyScheduleReschedule,
    applyOrdersReconciled, applyOrderUpdate, applyOrderInsert, applyOrdersDelete,
    ...lookups,
  }), [
    orders, products, parts, machineSteps, machines, customers, employees,
    holidays, bufferDays, folders, schedule, orderTracks, enrichedOrders,
    tracksByOrderId, productionCompleteByOrderId, deptProgressByOrderId,
    loading, error, lastSynced, reload, getOrdersForWeek, getProductWithParts,
    applyProductSave, applyProductDelete, applyProductMove, applyProductPatch, applyFolderAdd, applyFolderUpdate, applyFolderDelete,
    applyMachineUpsert, applyMachineDelete, applyMachineReorder,
    applyScheduleRegenerate, applyScheduleByOrders, applyScheduleRowUpdate, applyScheduleReschedule,
    applyOrdersReconciled, applyOrderUpdate, applyOrderInsert, applyOrdersDelete,
    lookups,
  ])

  // Gate the app behind a loader on the very first fetch only. Subsequent
  // refresh() calls keep the existing UI mounted so a CSV import doesn't blank
  // the screen.
  if (loading && !lastSynced && !error) return <FullScreenLoader />
  if (error && !lastSynced) return <FullScreenError message={error} onRetry={reload} />

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>')
  return ctx
}
