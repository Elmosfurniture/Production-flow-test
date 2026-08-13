import { supabase } from './supabase'

// Mon–Thu = 515 effective minutes, Fri = 325. Average across a 5-day week:
//   (515*4 + 325) / 5 = 477 min/day. Used to convert bottleneck minutes →
//   "work days needed" before walking backwards from the Due date. Tied to
//   the SHIFT_* defs in scheduleEngine.js — if you tweak the break times
//   there, recompute this constant. (Can't import from scheduleEngine.js
//   directly without a circular dependency.)
const AVG_MIN_PER_DAY = 477

// ---------- date helpers ----------

const fromDateStr = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toDateStr = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// ISO weekday: Mon=1 .. Sun=7 (JS Date: 0=Sun .. 6=Sat)
const isoDow = (d) => { const j = d.getDay(); return j === 0 ? 7 : j }
// Mon–Fri AND not a holiday.
const isWorkDay = (d, holidays) => isoDow(d) <= 5 && !holidays.has(toDateStr(d))
// ISO week number 1..53
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil((((t - yearStart) / 86400000) + 1) / 7)
}

export const minutesToWorkDays = (mins) => (mins <= 0 ? 1 : Math.ceil(mins / AVG_MIN_PER_DAY))

// Walk N work days backwards from a due date (exclusive of due itself),
// skipping weekends and any date in `holidays` (Set of 'YYYY-MM-DD').
function walkBackWorkDays(dueDate, n, holidays) {
  const d = new Date(dueDate)
  let remaining = n
  // safety cap so a bad config (e.g. every day a holiday) can't infinite-loop.
  let guard = 0
  while (remaining > 0 && guard < 365 * 3) {
    d.setDate(d.getDate() - 1)
    if (isWorkDay(d, holidays)) remaining--
    guard++
  }
  return d
}

// Count work days from `fromDate` up to (but not including) `targetDateStr`.
// Used to compute "time-to-dispatch" for Critical Ratio. Returns 0 if target
// is today or in the past, null if no target supplied.
export function workDaysUntil(targetDateStr, holidays, fromDate = new Date()) {
  if (!targetDateStr) return null
  const target = fromDateStr(targetDateStr)
  const start = new Date(fromDate)
  start.setHours(0, 0, 0, 0)
  if (target <= start) return 0
  let days = 0
  const d = new Date(start)
  let guard = 0
  while (d < target && guard < 365 * 3) {
    d.setDate(d.getDate() + 1)
    if (isWorkDay(d, holidays)) days++
    guard++
  }
  return days
}

export { isoWeek }

// Resolve an order's Send week + Send day → ISO YYYY-MM-DD. Returns null when
// either field is missing. Year is implicit — we use today's year. TODO if this
// app ever stays open across year-end: pick the year that keeps the send date
// in the future.
export function orderSendDate(order, year = new Date().getFullYear()) {
  if (order.send_week == null || order.send_day == null) return null
  return toDateStr(isoWeekDayToDate(year, order.send_week, order.send_day))
}

// Inverse of isoWeek: given a year + ISO week number (1..53) + ISO weekday
// (1=Mon..7=Sun), return the JS Date for that day. Week 1 contains Jan 4.
export function isoWeekDayToDate(year, week, day) {
  const jan4 = new Date(year, 0, 4)
  const jan4Dow = jan4.getDay() === 0 ? 7 : jan4.getDay()
  const mondayOfWeek1 = new Date(jan4)
  mondayOfWeek1.setDate(jan4.getDate() - jan4Dow + 1)
  const target = new Date(mondayOfWeek1)
  target.setDate(mondayOfWeek1.getDate() + (week - 1) * 7 + (day - 1))
  return target
}

// ---------- routing fetch ----------

// Bulk-load the routing for many product codes in 3 queries. Returns
// Map<code, Array<{ machine_name, secs_per_unit, setup_time }>>, where
// secs_per_unit = seconds_per_part × qty_per_unit (so multiplying by order qty
// gives the per-machine seconds for that order).
export async function fetchRoutings(productCodes) {
  if (!productCodes.length) return new Map()
  const uniq = [...new Set(productCodes)]
  const empty = new Map()
  uniq.forEach((c) => empty.set(c, []))

  const { data: products, error: pErr } = await supabase
    .from('products').select('id, code').in('code', uniq)
  if (pErr) throw new Error(`Products lookup: ${pErr.message}`)
  if (!products || products.length === 0) return empty
  const codeById = new Map(products.map((p) => [p.id, p.code]))
  const productIds = products.map((p) => p.id)

  const { data: parts, error: ptErr } = await supabase
    .from('parts').select('id, product_id, qty_per_unit').in('product_id', productIds)
  if (ptErr) throw new Error(`Parts lookup: ${ptErr.message}`)
  if (!parts || parts.length === 0) return empty
  const partInfo = new Map(parts.map((p) => [p.id, { productId: p.product_id, qpu: p.qty_per_unit ?? 1 }]))
  const partIds = parts.map((p) => p.id)

  const { data: steps, error: stErr } = await supabase
    .from('machine_steps').select('part_id, machine_name, alt_machine_names, seconds_per_part, setup_time').in('part_id', partIds)
  if (stErr) throw new Error(`Machine steps lookup: ${stErr.message}`)

  // Look up per-machine setup_time_min so we can fall back when a step's
  // own setup_time is 0/null. Step value wins when set (legacy CSV import
  // path); otherwise the machine's value applies. Same rule the dispatcher
  // and the in-memory routing builder use.
  const stepMachineNames = new Set()
  for (const s of steps || []) if (s.machine_name) stepMachineNames.add(s.machine_name)
  let setupByMachineName = new Map()
  if (stepMachineNames.size > 0) {
    const { data: mRows, error: mErr } = await supabase
      .from('machines').select('name, setup_time_min').in('name', [...stepMachineNames])
    if (mErr) throw new Error(`Machines setup lookup: ${mErr.message}`)
    setupByMachineName = new Map((mRows || []).map((m) => [m.name, m.setup_time_min || 0]))
  }

  const routings = empty
  for (const s of steps || []) {
    const part = partInfo.get(s.part_id)
    if (!part) continue
    const code = codeById.get(part.productId)
    if (!code) continue
    const effSetup = (s.setup_time && s.setup_time > 0)
      ? s.setup_time
      : (setupByMachineName.get(s.machine_name) || 0)
    routings.get(code).push({
      machine_name: s.machine_name,
      // Pool alts — bottleneckMinutes divides this step's work across
      // [primary, ...alts] so a 4-welder pool sees 1/4 of the welding work.
      // Empty array (legacy steps, no alts defined) → behaves exactly as
      // before: all work counted against the single machine_name.
      alt_machine_names: Array.isArray(s.alt_machine_names) ? s.alt_machine_names : [],
      secs_per_unit: (s.seconds_per_part ?? 0) * part.qpu,
      setup_time: effSetup,
    })
  }
  return routings
}

// Same as fetchRoutings but buckets each product's routing by the department
// of each step's machine. Returns Map<code, Map<dept, routing[]>>. Used by
// the two-track scheduler so each side (steel base, wood top) gets its own
// bottleneck and prod_week walking back from the same dispatch date.
export async function fetchRoutingsByDept(productCodes) {
  if (!productCodes.length) return new Map()
  const uniq = [...new Set(productCodes)]
  const flat = await fetchRoutings(uniq)

  // Look up dept for every machine the routings reference. Skip the query
  // entirely when there are no machines (all products empty).
  const machineNames = new Set()
  for (const list of flat.values()) for (const r of list) machineNames.add(r.machine_name)
  let deptByMachine = new Map()
  if (machineNames.size > 0) {
    const { data: machines, error } = await supabase
      .from('machines').select('name, department').in('name', [...machineNames])
    if (error) throw new Error(`Machines lookup: ${error.message}`)
    deptByMachine = new Map((machines || []).map((m) => [m.name, m.department || 'other']))
  }

  const result = new Map()
  for (const code of uniq) result.set(code, new Map())
  for (const [code, list] of flat) {
    const byDept = result.get(code)
    for (const step of list) {
      const dept = deptByMachine.get(step.machine_name) || 'other'
      if (!byDept.has(dept)) byDept.set(dept, [])
      byDept.get(dept).push(step)
    }
  }
  return result
}

// Bulk-load which of these product codes are flagged dispatch-only — they
// skip routing entirely and schedule purely off the dispatch date minus the
// dispatch-dept buffer (see scheduleDispatchOnly).
export async function fetchDispatchOnlyCodes(productCodes) {
  if (!productCodes.length) return new Set()
  const uniq = [...new Set(productCodes)]
  const { data, error } = await supabase
    .from('products')
    .select('code')
    .in('code', uniq)
    .eq('is_dispatch_only', true)
  if (error) throw new Error(`Dispatch-only lookup: ${error.message}`)
  return new Set((data || []).map((p) => p.code))
}

// Schedule a dispatch-only order: walk back `buffer` work days from its send
// date, using the dispatch dept's buffer config (falls back to 1). No routing
// needed — these products are supplier-assembled.
export function scheduleDispatchOnly(order, bufferDaysByDept, holidays) {
  const sendStr = orderSendDate(order)
  if (!sendStr) return null
  const buffer = bufferDaysByDept.get('dispatch') ?? 1
  const startDate = walkBackWorkDays(fromDateStr(sendStr), Math.max(buffer, 1), holidays)
  return {
    prod_week: isoWeek(startDate),
    prod_day: isoDow(startDate),
    start_date: toDateStr(startDate),
    send_date: sendStr,
    bottleneck: null,
    total_minutes: 0,
    work_days: 0,
    buffer_days: buffer,
  }
}

// Pure: bottleneck machine and total bottleneck minutes for one order.
//
// Pool-aware. When a step has alternative machines (a "pool" of welders /
// sanders that can run the same operation), the unit work splits evenly
// across the pool members but each member still pays its OWN setup —
// setup is a per-machine cost, not divisible. A pool of N welders cuts the
// step's unit work to 1/N per welder, but every welder still sets up once.
//
//   per_member = (secs_per_unit × order_qty / 60) / pool_size  +  setup_time
//
// Worked example: 100-unit weld step at 60s/unit + 5min setup, pool of 2.
//   unit_work = 60 × 100 / 60 = 100 min
//   N = 2 → per_member = 100/2 + 5 = 55 min   (NOT (100+5)/2 = 52.5 min)
//   So each welder is busy 55 min — that's the bottleneck contribution.
//
// Pool size 1 collapses cleanly to the legacy formula:
//   per_member = (secs × qty / 60) + setup_time = mins ✓
//
// This is a PLANNING estimate. The actual dispatcher places work greedily on
// the least-loaded pool member at slot time, so the real per-machine load may
// differ from this even split — but it's the right number for "how many work
// days does the order need to start ahead of dispatch?".
export function bottleneckMinutes(routing, orderQty) {
  const byMachine = new Map()
  for (const s of routing) {
    const unitWork = (s.secs_per_unit * orderQty) / 60
    const setupCost = s.setup_time ?? 0
    const alts = Array.isArray(s.alt_machine_names) ? s.alt_machine_names : []
    // Dedup + drop blanks + drop any alt that duplicates the primary.
    const pool = [s.machine_name, ...alts]
      .map((m) => (m == null ? '' : String(m).trim()))
      .filter(Boolean)
    const unique = [...new Set(pool)]
    if (unique.length === 0) continue
    const perMember = unitWork / unique.length + setupCost
    for (const m of unique) {
      byMachine.set(m, (byMachine.get(m) ?? 0) + perMember)
    }
  }
  let name = null, minutes = 0
  for (const [n, m] of byMachine) {
    if (m > minutes) { name = n; minutes = m }
  }
  return { bottleneck: name, totalMinutes: minutes }
}

// Pure: schedule one order given its routing + config. The scheduling anchor
// is the Send date (send_week + send_day), NOT due_date. Due is a customer
// commitment that we surface prominently in the UI, but the production
// schedule walks back from the planned ship day so the order lands on the
// shipping truck on time.
// `order` = { qty, department, send_week, send_day, product_code? }
// Returns null if it can't be scheduled (no Send date, no routing, zero minutes).
export function scheduleOne(order, routing, bufferDaysByDept, holidays) {
  const sendStr = orderSendDate(order)
  if (!sendStr) return null
  if (!routing || routing.length === 0) return null
  const { bottleneck, totalMinutes } = bottleneckMinutes(routing, order.qty)
  if (totalMinutes <= 0) return null
  const workDays = minutesToWorkDays(totalMinutes)
  const buffer = bufferDaysByDept.get(order.department) ?? 3
  const startDate = walkBackWorkDays(fromDateStr(sendStr), workDays + buffer, holidays)
  return {
    prod_week: isoWeek(startDate),
    prod_day: isoDow(startDate),
    start_date: toDateStr(startDate),
    send_date: sendStr,
    bottleneck,
    total_minutes: totalMinutes,
    work_days: workDays,
    buffer_days: buffer,
  }
}

// ---------- config + writers ----------

// Load holidays + per-department buffer days. Tolerant: if either table is
// missing/empty, returns sensible empty/default values so a partially-set-up
// project still imports cleanly.
export async function loadScheduleConfig() {
  const [hRes, sRes] = await Promise.all([
    supabase.from('public_holidays').select('date'),
    supabase.from('department_settings').select('department, buffer_days'),
  ])
  if (hRes.error) throw new Error(`Holidays lookup: ${hRes.error.message}`)
  if (sRes.error) throw new Error(`Department settings lookup: ${sRes.error.message}`)
  return {
    holidays: new Set((hRes.data || []).map((h) => h.date)),
    bufferDaysByDept: new Map((sRes.data || []).map((s) => [s.department, s.buffer_days])),
  }
}

// Schedule a list of orders and write prod_week / prod_day back to Supabase.
// Uses upsert with onConflict: 'kwitasie_nr' so only the schedule columns are
// touched on conflicting rows; this is safe because every order in the batch
// already exists (it was just upserted by the importer).
// `orders` = [{ kwitasie_nr, qty, department, send_week, send_day, product_code }, ...]
//
// Returns { scheduled, skipped, total, skippedReasons: { noSendDate, noRouting,
// zeroMinutes, noQty } } so the UI can explain why some orders didn't schedule.
export async function scheduleAndWrite(orders, onProgress = () => {}) {
  if (!orders || orders.length === 0) return { scheduled: 0, skipped: 0, total: 0, skippedReasons: {} }
  const config = await loadScheduleConfig()
  const codes = orders.map((o) => o.product_code).filter(Boolean)
  const [routingsByDept, dispatchOnlyCodes] = await Promise.all([
    fetchRoutingsByDept(codes),
    fetchDispatchOnlyCodes(codes),
  ])

  const updates = []          // orders rows (combined start = earliest track)
  const trackRows = []        // order_tracks rows (one per touched dept)
  const reasons = { noSendDate: 0, noRouting: 0, zeroMinutes: 0, noQty: 0 }
  const year = new Date().getFullYear()

  for (const o of orders) {
    if (!o.qty || o.qty <= 0) { reasons.noQty++; continue }
    if (!orderSendDate(o)) { reasons.noSendDate++; continue }

    // Dispatch-only path — single virtual track on 'dispatch' dept.
    if (dispatchOnlyCodes.has(o.product_code)) {
      const r = scheduleDispatchOnly(o, config.bufferDaysByDept, config.holidays)
      if (!r) continue
      updates.push({
        kwitasie_nr: o.kwitasie_nr,
        qty: o.qty,
        product_code: o.product_code,
        customer_code: o.customer_code,
        prod_week: r.prod_week,
        prod_day: r.prod_day,
      })
      if (o.id) {
        trackRows.push({
          order_id: o.id,
          department: 'dispatch',
          prod_week: r.prod_week,
          prod_day: r.prod_day,
          bottleneck: null,
          total_minutes: 0,
          work_days: 0,
        })
      }
      continue
    }

    // Multi-track path — one scheduleOne call per touched department.
    const deptMap = routingsByDept.get(o.product_code)
    if (!deptMap || deptMap.size === 0) { reasons.noRouting++; continue }

    const orderTracks = []
    for (const [dept, deptRouting] of deptMap) {
      if (!deptRouting || deptRouting.length === 0) continue
      // Pass the dept as the order's "department" so scheduleOne picks the
      // right buffer (steel buffer for steel side, wood for wood side).
      const trackOrder = { ...o, department: dept }
      const r = scheduleOne(trackOrder, deptRouting, config.bufferDaysByDept, config.holidays)
      if (!r) continue
      orderTracks.push({
        department: dept,
        prod_week: r.prod_week,
        prod_day: r.prod_day,
        bottleneck: r.bottleneck,
        // Round to an integer for the order_tracks.total_minutes column.
        // Pool-aware bottleneckMinutes can return a fractional value when a
        // step has alts (work splits N ways). Ceiling so we never UNDER-
        // estimate the bottleneck — better to allocate a planning minute
        // we don't use than to skip one we needed.
        total_minutes: Math.ceil(r.total_minutes || 0),
        work_days: r.work_days,
      })
    }

    if (orderTracks.length === 0) { reasons.zeroMinutes++; continue }

    // Earliest track sets orders.prod_week (backwards compat for screens
    // that haven't been migrated to use order_tracks directly).
    let earliest = null
    for (const t of orderTracks) {
      const d = isoWeekDayToDate(year, t.prod_week, t.prod_day)
      if (!earliest || d < earliest.d) earliest = { d, week: t.prod_week, day: t.prod_day }
    }
    updates.push({
      kwitasie_nr: o.kwitasie_nr,
      qty: o.qty,
      product_code: o.product_code,
      customer_code: o.customer_code,
      prod_week: earliest.week,
      prod_day: earliest.day,
    })

    if (o.id) {
      for (const t of orderTracks) {
        trackRows.push({ order_id: o.id, ...t })
      }
    }
  }

  onProgress({ stage: 'scheduling', current: 0, total: updates.length })

  // 1. Update orders rows.
  let processed = 0
  const chunkSize = 200
  for (let i = 0; i < updates.length; i += chunkSize) {
    const part = updates.slice(i, i + chunkSize)
    const { error } = await supabase.from('orders').upsert(part, { onConflict: 'kwitasie_nr' })
    if (error) throw new Error(`Updating schedule (batch of ${part.length}): ${error.message}`)
    processed += part.length
    onProgress({ stage: 'scheduling', current: processed, total: updates.length })
  }

  // 2. Persist per-dept tracks (preserves any existing status/started_at/
  //    completed_at so a re-schedule of an in-progress order doesn't wipe
  //    its tracking state).
  if (trackRows.length > 0) {
    const affectedOrderIds = [...new Set(trackRows.map((t) => t.order_id))]
    const { data: existing, error: exErr } = await supabase
      .from('order_tracks')
      .select('id, order_id, department, status, started_at, completed_at')
      .in('order_id', affectedOrderIds)
    if (exErr) throw new Error(`Loading existing tracks: ${exErr.message}`)
    const existingByKey = new Map(
      (existing || []).map((t) => [`${t.order_id}::${t.department}`, t]),
    )
    const now = new Date().toISOString()
    for (const t of trackRows) {
      const key = `${t.order_id}::${t.department}`
      const prev = existingByKey.get(key)
      if (prev) {
        t.status = prev.status
        t.started_at = prev.started_at
        t.completed_at = prev.completed_at
      }
      t.updated_at = now
    }
    const { error: upErr } = await supabase
      .from('order_tracks').upsert(trackRows, { onConflict: 'order_id,department' })
    if (upErr) throw new Error(`Upserting order_tracks: ${upErr.message}`)

    // 3. Delete tracks that are no longer relevant (e.g. user removed steel
    //    parts from a product so the steel track shouldn't exist anymore).
    const newKeys = new Set(trackRows.map((t) => `${t.order_id}::${t.department}`))
    const toDelete = (existing || [])
      .filter((t) => !newKeys.has(`${t.order_id}::${t.department}`))
      .map((t) => t.id)
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('order_tracks').delete().in('id', toDelete)
      if (delErr) throw new Error(`Cleaning obsolete tracks: ${delErr.message}`)
    }
  }

  const skipped = reasons.noSendDate + reasons.noRouting + reasons.zeroMinutes + reasons.noQty
  return {
    scheduled: updates.length,
    skipped,
    total: orders.length,
    skippedReasons: reasons,
    tracksWritten: trackRows.length,
  }
}

// Recompute schedule for every order in the DB. Used by the "Recalculate" UI.
// `id` is included so scheduleAndWrite can persist per-dept order_tracks rows
// (Phase 2 two-track scheduling) — without it, only orders.prod_week updates.
export async function recalculateAll(onProgress = () => {}) {
  onProgress({ stage: 'loading', current: 0, total: 0 })
  const { data, error } = await supabase
    .from('orders')
    .select('id, kwitasie_nr, qty, department, send_week, send_day, product_code, customer_code')
  if (error) throw new Error(`Loading orders: ${error.message}`)
  return scheduleAndWrite(data || [], onProgress)
}
