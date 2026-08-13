import { supabase } from './supabase'
import {
  nextWorkDay, shiftForDate, placeJobOnShift, placeUnitsOnDay,
  timeToMin, minToTimeSql,
} from './scheduleEngine'

// Part Tracking helpers.
//
// "Progress" lives on schedule rows (qty / qty_done + status). One machine_step
// for one order may span several schedule rows due to day splits, so every
// aggregation here groups by (order_id, machine_step_id).
//
// Part-level "units fully through" = qty_done of the LAST machine_step in the
// part's sequence (because by the time the last step is done, every prior
// step must also be done for that piece). When there are no steps for a part
// we fall back to qty_per_unit × order.qty.

// ---------- aggregation ----------

// Build a tracking view for one order:
// {
//   parts: [{
//     part, total, lastDone, steps: [{
//       step, qty (target), qty_done, status (computed), rows (raw schedule rows)
//     }]
//   }],
//   totalUnits, doneUnits,
// }
export function buildOrderTracking({
  order, parts, stepsByPart, scheduleByOrderStep, machineById = null,
}) {
  // Assembly parts are almost always the LAST thing built (only finishing +
  // dispatch come after), so they must never lead the part list. The incoming
  // `parts` order is otherwise preserved (usually alphabetical) — a stable
  // sort just floats every assembly part to the bottom. We treat a part as
  // assembly if it's flagged is_assembly OR its name contains "assembly"
  // (older/seeded data may not carry the flag, but the name still tells us).
  const isAssemblyPart = (p) => !!p.is_assembly || /assembl/i.test(p.name || '')
  const orderedParts = (parts || []).slice().sort((a, b) => {
    return (isAssemblyPart(a) ? 1 : 0) - (isAssemblyPart(b) ? 1 : 0)
  })
  const orderParts = orderedParts.map((p) => {
    const steps = (stepsByPart.get(p.id) || []).slice().sort((a, b) => a.sequence - b.sequence)
    const partTotal = (p.qty_per_unit ?? 1) * (order.qty || 0)
    const stepRows = steps.map((s) => {
      const rows = scheduleByOrderStep.get(`${order.id}:${s.id}`) || []
      // Cap qty + qty_done at partTotal. If summed schedule rows exceed
      // partTotal, the data is corrupt (e.g. from a partially-failed
      // reschedule that re-inserted rows). Capping prevents nonsense like
      // "15/12 done" surfacing in the UI; a Regenerate cleans the underlying
      // rows.
      const summedQty = rows.reduce((sum, r) => sum + (r.qty ?? partTotal), 0) || partTotal
      // A row marked 'completed' means its whole qty is finished — trust that
      // even if qty_done wasn't written (older Schedule "Stop" set the status
      // but not the count). This keeps Tracking in lockstep with whatever
      // Schedule / MES marked done, so a step finished in one window always
      // shows finished in the other.
      const summedDone = rows.reduce((sum, r) => {
        if (r.status === 'completed') return sum + (r.qty ?? partTotal)
        return sum + (r.qty_done ?? 0)
      }, 0)
      const qty = Math.min(summedQty, partTotal)
      const qty_done = Math.min(summedDone, qty)
      const status = qty_done >= qty && qty > 0 ? 'completed' : qty_done > 0 ? 'partial' : 'queued'
      // The machine the dispatcher actually assigned. May differ from
      // step.machine_name when the step has a pool and load-balancer picked
      // an alt. Falls back to the primary if no rows yet (step un-scheduled).
      let assignedMachineName = s.machine_name
      if (machineById && rows.length > 0) {
        const m = machineById.get(rows[0].machine_id)
        if (m?.name) assignedMachineName = m.name
      }
      return { step: s, qty, qty_done, rows, status, assignedMachineName }
    })
    const lastStep = stepRows[stepRows.length - 1]
    const lastDone = lastStep ? Math.min(lastStep.qty_done, partTotal) : 0
    return { part: p, total: partTotal, lastDone, steps: stepRows }
  })

  const totalUnits = orderParts.reduce((s, p) => s + p.total, 0)
  const doneUnits = Math.min(
    orderParts.reduce((s, p) => s + p.lastDone, 0),
    totalUnits,
  )
  return { parts: orderParts, totalUnits, doneUnits }
}

// ---------- writes ----------

// Pure: distribute a qty_done value across rows by earliest-first fill.
// Returns the patch objects (id + new fields) without touching the DB — used
// for optimistic local updates before the debounced server write lands.
//
// Status rules (intentionally restrained — the stepper records *quantity*,
// not *who's at the machine right now*):
//   * qty_done >= qty  → status='completed' (writes completed_at)
//   * was 'completed', now less than qty → revert to 'queued' (un-tick)
//   * everything else  → leave status untouched
//
// This way, only MES Start can flip a row to 'working' (and trigger the
// Pause/Stop buttons on Schedule). Marking qty on Tracking is purely
// administrative and shouldn't pretend the operator is actively at the
// station.
export function distributeQtyAcrossRows(rows, totalQtyDone) {
  const sorted = rows.slice().sort((a, b) => {
    if (a.scheduled_date !== b.scheduled_date) {
      return a.scheduled_date < b.scheduled_date ? -1 : 1
    }
    return (a.start_time || '').localeCompare(b.start_time || '')
  })
  let remaining = Math.max(0, Math.floor(totalQtyDone || 0))
  const patches = []
  for (const r of sorted) {
    const rowQty = r.qty ?? 0
    const fill = Math.min(remaining, rowQty)
    remaining -= fill
    let status = r.status
    if (fill >= rowQty && rowQty > 0) status = 'completed'
    else if (status === 'completed') status = 'queued' // un-tick from done
    const patch = { id: r.id, qty_done: fill, status }
    if (status === 'completed' && !r.completed_at) patch.completed_at = new Date().toISOString()
    if (status !== 'completed') patch.completed_at = null
    patches.push(patch)
  }
  return patches
}

// Distribute a single qty_done value across the (possibly split) schedule rows
// for one (order, machine_step) and write to Supabase. Returns server rows so
// callers can reconcile local cache.
export async function setStepQtyDone({ rows, totalQtyDone }) {
  const patches = distributeQtyAcrossRows(rows, totalQtyDone)
  const results = []
  for (const p of patches) {
    const { id, ...update } = p
    const { data, error } = await supabase
      .from('schedule')
      .update(update)
      .eq('id', id)
      .select('id, status, qty_done, completed_at, started_at')
      .single()
    if (error) throw new Error(`Updating schedule row ${id}: ${error.message}`)
    results.push(data)
  }
  return results
}

// Reschedule every unfinished step of an order to a target date in ONE go,
// honouring the same dependencies the main scheduler uses:
//
//   * Within a part: step N+1 can't start before step N ends on the new day.
//   * Assembly parts wait for every non-assembly part to finish on the new
//     day before their first step can begin.
//   * On each machine on the new day: rows queue after whatever is already
//     scheduled there (existing rows + previously-placed rows in this batch).
//
// This is the same algorithm as buildScheduleRows in scheduleEngine.js, but
// applied to a single date and only to the steps the user picked.
//
// Args:
//   order              — { id, product_code, qty }
//   leftoverSteps      — [{ stepView, partName, ... }] from TrackingScreen
//   targetDate         — Date or YYYY-MM-DD string
//   machineByName      — Map from useAppData lookups
//   partsByProduct     — Map from useAppData
//   productByCode      — Map from useAppData
//
// Returns { deleted, updated, inserted } for the caller to patch the cache.
export async function rescheduleOrderLeftovers({
  order, leftoverSteps, targetDate,
  machineByName, partsByProduct, productByCode, holidaySet,
}) {
  if (!order?.id) throw new Error('Order required')
  if (!leftoverSteps || leftoverSteps.length === 0) return { deleted: [], updated: [], inserted: [], skipped: [] }

  // ---------- 0. Re-read the order's CURRENT rows from the DB ----------
  // The leftoverSteps handed in are derived from the in-memory cache, which a
  // debounced tick or a mid-flight reload could leave stale. Rescheduling off
  // stale data is exactly what re-creates already-finished work on the new
  // day. So we re-pull the truth here and recompute each step's qty_done from
  // it — fully-done steps are then dropped and only the real remainder moves.
  const { data: freshRows, error: freshErr } = await supabase
    .from('schedule')
    .select('id, machine_step_id, qty, qty_done, status, completed_at, scheduled_date, start_time')
    .eq('order_id', order.id)
  if (freshErr) throw new Error(`Reading current rows: ${freshErr.message}`)
  const freshByStep = new Map()
  for (const r of (freshRows || [])) {
    if (!r.machine_step_id) continue
    if (!freshByStep.has(r.machine_step_id)) freshByStep.set(r.machine_step_id, [])
    freshByStep.get(r.machine_step_id).push(r)
  }
  const activeLeftovers = leftoverSteps
    .map((ls) => {
      const stepId = ls.stepView.step.id
      const rows = freshByStep.get(stepId) || ls.stepView.rows || []
      const summedQty = rows.reduce((s, r) => s + (r.qty ?? 0), 0)
      const summedDone = rows.reduce((s, r) => s + (r.qty_done ?? 0), 0)
      const qty = summedQty || ls.stepView.qty
      const qty_done = Math.min(summedDone, qty)
      return { ...ls, stepView: { ...ls.stepView, rows, qty, qty_done } }
    })
    // Drop steps that are now fully done — nothing to close, nothing to move.
    .filter((ls) => ls.stepView.qty_done < ls.stepView.qty)

  if (activeLeftovers.length === 0) {
    return { deleted: [], updated: [], inserted: [], skipped: [], unmappable: [] }
  }

  // ---------- 1. Close out the old rows for every leftover step ----------
  const deletedIds = []
  const updatedRows = []
  for (const ls of activeLeftovers) {
    for (const r of (ls.stepView.rows || [])) {
      const qty = r.qty || 0
      const done = r.qty_done || 0
      if (done >= qty && qty > 0) continue
      if (done > 0) {
        const patch = {
          qty: done,
          status: 'completed',
          completed_at: r.completed_at || new Date().toISOString(),
        }
        const { data, error } = await supabase
          .from('schedule').update(patch).eq('id', r.id)
          .select('id, qty, qty_done, status, completed_at').single()
        if (error) throw new Error(`Closing partial row ${r.id}: ${error.message}`)
        updatedRows.push(data)
      } else {
        const { error } = await supabase.from('schedule').delete().eq('id', r.id)
        if (error) throw new Error(`Removing empty row ${r.id}: ${error.message}`)
        deletedIds.push(r.id)
      }
    }
  }

  // ---------- 2. Enrich + dependency-sort the steps ----------
  const product = productByCode.get(order.product_code)
  const allParts = product ? (partsByProduct.get(product.id) || []) : []
  const partById = new Map(allParts.map((p) => [p.id, p]))

  // Steps whose machine_name doesn't resolve to a real machine record (renamed
  // or deleted from the Machines screen) can't be placed. Collect them as
  // unmappable so the UI can warn rather than silently dropping work.
  const unmappable = []
  const stepsLeft = activeLeftovers
    .map((ls) => {
      const machine = machineByName.get(ls.stepView.step.machine_name)
      const partId = ls.stepView.step.part_id
      const part = partById.get(partId)
      const leftover = ls.stepView.qty - ls.stepView.qty_done
      return {
        stepView: ls.stepView,
        machine,
        part,
        partId,
        sequence: ls.stepView.step.sequence ?? 0,
        isAssembly: !!part?.is_assembly,
        remaining: leftover,
      }
    })
    .filter((x) => {
      if (x.remaining <= 0) return false
      if (!x.machine) {
        unmappable.push({
          machine: x.stepView.step.machine_name,
          part: x.part?.name || 'unknown part',
          remaining: x.remaining,
        })
        return false
      }
      return true
    })

  // Sort: non-assembly first, then by partId (keeps a part's steps together),
  // then by sequence (step N before step N+1).
  stepsLeft.sort((a, b) => {
    if (a.isAssembly !== b.isAssembly) return a.isAssembly ? 1 : -1
    if (a.partId !== b.partId) return String(a.partId).localeCompare(String(b.partId))
    return a.sequence - b.sequence
  })

  // ---------- 3. Walk dates, placing steps day by day ----------
  // Key differences from the old single-day version:
  //   * placeUnitsOnDay produces a SEGMENT per work-block (breaks split a step
  //     into multiple rows) — so welding across lunch shows as two rows,
  //     not one row that looks like it works through the break.
  //   * If a step's units don't all fit today, the remainder rolls to the
  //     next workday — Spray Paint no longer "falls away" when the target
  //     day fills up.
  const machineIds = [...new Set(stepsLeft.map((x) => x.machine.id))]
  const newRows = []
  let curDate = targetDate instanceof Date
    ? new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    : new Date(targetDate + 'T00:00:00')
  const safe = holidaySet || new Set()

  let safety = 30 // hard cap on days to walk — should never trip
  while (stepsLeft.some((s) => s.remaining > 0) && safety-- > 0) {
    const dateStr = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(curDate.getDate()).padStart(2, '0')}`
    const shift = shiftForDate(curDate)

    // Seed per-machine state from existing rows on this date (positions
    // unique + sit AFTER whatever is already scheduled).
    const { data: existing, error: existingErr } = await supabase
      .from('schedule')
      .select('machine_id, position, end_time')
      .in('machine_id', machineIds)
      .eq('scheduled_date', dateStr)
    if (existingErr) throw new Error(`Reading existing rows for ${dateStr}: ${existingErr.message}`)
    const mState = new Map()
    for (const mid of machineIds) mState.set(mid, { usedTillMin: 0, maxPos: -1 })
    for (const r of (existing || [])) {
      const st = mState.get(r.machine_id)
      if (!st) continue
      if (r.position != null && r.position > st.maxPos) st.maxPos = r.position
      if (r.end_time) {
        const em = timeToMin(r.end_time.slice(0, 5))
        if (em > st.usedTillMin) st.usedTillMin = em
      }
    }

    // Per-date deps: part end-time on this date (drives within-part sequence),
    // non-asm max end-time (drives assembly wait), and which (machine, day)
    // pairs have already paid setup so we don't charge it twice today.
    const partEndMin = new Map()
    let nonAsmMaxEnd = 0
    const setupPaid = new Set() // `${machineId}:${dateStr}` strings

    for (const step of stepsLeft) {
      if (step.remaining <= 0) continue
      const ms = mState.get(step.machine.id)
      if (!ms) continue

      let earliestStart = partEndMin.get(step.partId) || 0
      if (step.isAssembly) earliestStart = Math.max(earliestStart, nonAsmMaxEnd)

      const secsPerUnit = step.stepView.step.seconds_per_part ?? 60
      const setupMin = step.stepView.step.setup_time ?? 0
      const setupKey = `${step.machine.id}:${dateStr}`
      const setupForCall = setupPaid.has(setupKey) ? 0 : setupMin

      const { segments, unitsPlaced } = placeUnitsOnDay({
        shift,
        machineUsedTillMin: ms.usedTillMin,
        earliestStartMin: earliestStart,
        unitsNeeded: step.remaining,
        secsPerUnit,
        setupMin: setupForCall,
      })

      for (const seg of segments) {
        ms.maxPos += 1
        ms.usedTillMin = seg.endMin
        partEndMin.set(step.partId, seg.endMin)
        if (!step.isAssembly && seg.endMin > nonAsmMaxEnd) nonAsmMaxEnd = seg.endMin
        if (seg.includesSetup) setupPaid.add(setupKey)
        newRows.push({
          order_id: order.id,
          machine_id: step.machine.id,
          machine_step_id: step.stepView.step.id,
          scheduled_date: dateStr,
          start_time: minToTimeSql(seg.startMin),
          end_time: minToTimeSql(seg.endMin),
          position: ms.maxPos,
          status: 'queued',
          qty: seg.units,
          qty_done: 0,
          includes_setup: seg.includesSetup,
        })
      }
      step.remaining -= unitsPlaced
    }

    curDate = nextWorkDay(curDate, safe)
  }

  const skipped = stepsLeft
    .filter((s) => s.remaining > 0)
    .map((s) => ({
      machine: s.machine.name,
      part: s.part?.name,
      remaining: s.remaining,
    }))

  // ---------- 4. Insert new rows ----------
  let inserted = []
  if (newRows.length > 0) {
    const { data, error } = await supabase
      .from('schedule')
      .insert(newRows)
      .select('id, order_id, machine_id, machine_step_id, scheduled_date, start_time, end_time, position, status, includes_setup, qty, qty_done, started_at, completed_at')
    if (error) throw new Error(`Inserting rescheduled rows: ${error.message}`)
    inserted = data || []
  }

  return { deleted: deletedIds, updated: updatedRows, inserted, skipped, unmappable }
}

// Mark a part's qty as fully done across EVERY machine step it goes through.
// Used by the End of Day walk: if the boss says "10 of 20 Pote are done",
// that means 10 physical pieces have been through every station — so the
// qty_done on every machine_step's schedule rows for this (order, part) gets
// set to 10 (distributed across day-split rows by setStepQtyDone).
//
// stepViews: the .steps array from buildOrderTracking for one part.
// Returns the patched schedule rows so callers can refresh the local cache.
export async function setPartQtyDone({ stepViews, totalQtyDone }) {
  const all = []
  for (const sv of stepViews) {
    if (!sv.rows || sv.rows.length === 0) continue
    const results = await setStepQtyDone({ rows: sv.rows, totalQtyDone })
    all.push(...results)
  }
  return all
}

// Reschedule the unfinished part of a machine step.
//
// What this does:
//   1. Walk this step's existing schedule rows. For each partially-done or
//      untouched row that we're moving:
//        - If qty_done > 0, shrink the row to that count + mark completed
//          (the work that DID happen still counts in history).
//        - If qty_done == 0, delete the row (nothing happened, nothing to keep).
//   2. Insert a new queued row on the target date for the leftover qty, on
//      the same machine, at shift start. Times are coarse — the user can
//      Regenerate the week from Schedule for precise slot placement.
//
// targetDate: explicit Date the new row lands on. When omitted (or null), we
// fall back to nextWorkDay(max(today, earliestRowDate)) — useful for an
// auto-bump that always pushes forward, never earlier.
//
// Returns { deleted, updated, inserted } so the caller can patch local cache.
export async function rescheduleStep({ stepView, machineId, orderId, holidaySet, today = new Date(), targetDate = null }) {
  const rows = stepView.rows || []
  if (rows.length === 0) throw new Error('No schedule rows to reschedule')

  const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0)
  const totalDone = rows.reduce((s, r) => s + (r.qty_done || 0), 0)
  const leftover = totalQty - totalDone
  if (leftover <= 0) throw new Error('Nothing left to reschedule on this step')

  const deletedIds = []
  const updatedRows = []
  for (const r of rows) {
    if ((r.qty_done || 0) >= (r.qty || 0) && r.qty > 0) continue // already fully done — leave it
    if ((r.qty_done || 0) > 0) {
      // Shrink + close out
      const patch = {
        qty: r.qty_done,
        status: 'completed',
        completed_at: r.completed_at || new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('schedule')
        .update(patch)
        .eq('id', r.id)
        .select('id, qty, qty_done, status, completed_at')
        .single()
      if (error) throw new Error(`Closing partial row ${r.id}: ${error.message}`)
      updatedRows.push(data)
    } else {
      const { error } = await supabase.from('schedule').delete().eq('id', r.id)
      if (error) throw new Error(`Removing empty row ${r.id}: ${error.message}`)
      deletedIds.push(r.id)
    }
  }

  // Either honour the explicit targetDate the caller picked, or auto-bump
  // forward past today + the step's current earliest date.
  let dateStr
  if (targetDate) {
    const d = targetDate instanceof Date ? targetDate : new Date(targetDate + 'T00:00:00')
    dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } else {
    const earliestStr = rows.map((r) => r.scheduled_date).sort()[0]
    const earliestDate = earliestStr ? new Date(earliestStr + 'T00:00:00') : today
    const base = earliestDate > today ? earliestDate : today
    const nextDate = nextWorkDay(base, holidaySet || new Set())
    dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`
  }
  const nextDate = new Date(dateStr + 'T00:00:00')
  const shift = shiftForDate(nextDate)

  // Pull existing rows on this (machine, date) to compute BOTH the next free
  // slot (based on max end_time) AND the next unique position. Doing it in
  // one query keeps the writeback honest with the unique constraint on
  // (machine_id, scheduled_date, position).
  const { data: existing, error: existingErr } = await supabase
    .from('schedule')
    .select('position, end_time')
    .eq('machine_id', machineId)
    .eq('scheduled_date', dateStr)
  if (existingErr) throw new Error(`Reading existing rows for ${dateStr}: ${existingErr.message}`)
  let maxPos = -1
  let maxEndMin = 0
  for (const r of (existing || [])) {
    if (r.position != null && r.position > maxPos) maxPos = r.position
    if (r.end_time) {
      const m = timeToMin(r.end_time.slice(0, 5))
      if (m > maxEndMin) maxEndMin = m
    }
  }
  const nextPos = maxPos + 1

  // Real start/end times: workMin from this step's seconds_per_part, then ask
  // the engine's slot allocator where it fits after the last job on this
  // machine (it'll skip breaks correctly). Falls back to shift.start → end
  // only if the work won't fit on the chosen day at all.
  const secsPerUnit = stepView.step.seconds_per_part ?? 60
  const setupMin = stepView.step.setup_time ?? 0
  const workMin = Math.max(1, Math.ceil((leftover * secsPerUnit) / 60) + setupMin)
  const placement = placeJobOnShift(shift, maxEndMin, 0, workMin)
  const startTimeSql = placement ? minToTimeSql(placement.startMin) : `${shift.start}:00`
  const endTimeSql = placement ? minToTimeSql(placement.endMin) : `${shift.end}:00`

  const insertRow = {
    order_id: orderId,
    machine_id: machineId,
    machine_step_id: stepView.step.id,
    scheduled_date: dateStr,
    start_time: startTimeSql,
    end_time: endTimeSql,
    position: nextPos,
    status: 'queued',
    qty: leftover,
    qty_done: 0,
    includes_setup: setupMin > 0,
  }
  const { data: inserted, error: insErr } = await supabase
    .from('schedule')
    .insert(insertRow)
    .select('id, order_id, machine_id, machine_step_id, scheduled_date, start_time, end_time, position, status, includes_setup, qty, qty_done, started_at, completed_at')
    .single()
  if (insErr) throw new Error(`Inserting rescheduled row: ${insErr.message}`)

  return { deleted: deletedIds, updated: updatedRows, inserted }
}

// Remove PHANTOM schedule rows: queued (qty_done = 0, not completed) rows that
// belong to a (order, machine_step) whose required quantity is ALREADY fully
// done by other rows. These come from a Regenerate that re-schedules an order's
// full quantity on top of work that's already finished — Tracking caps the
// totals so it reads "done", but the Schedule keeps listing the leftover copies.
//
// Safe by construction: we only delete queued rows on steps where
// SUM(qty_done) >= partTotal, i.e. the step needs no more work. Authoritative —
// re-reads the schedule from the DB rather than trusting the cache. Returns the
// deleted ids so the caller can patch its local cache.
export async function cleanupDoneStepPhantoms({
  orders, productByCode, partsByProduct, stepsByPart, orderIds = null,
}) {
  // Fresh schedule rows (optionally scoped to specific orders, e.g. right
  // after a Regenerate of one week).
  let q = supabase.from('schedule').select('id, order_id, machine_step_id, qty, qty_done, status')
  if (orderIds && orderIds.length > 0) q = q.in('order_id', orderIds)
  const { data: schedule, error } = await q
  if (error) throw new Error(`Reading schedule for cleanup: ${error.message}`)
  if (!schedule || schedule.length === 0) return []

  const orderById = new Map((orders || []).map((o) => [o.id, o]))
  // machine_step_id → its part (for qty_per_unit → partTotal).
  const stepToPart = new Map()
  for (const parts of (partsByProduct?.values() || [])) {
    for (const part of parts) {
      for (const s of (stepsByPart.get(part.id) || [])) stepToPart.set(s.id, part)
    }
  }

  const groups = new Map()
  for (const r of schedule) {
    if (!r.order_id || !r.machine_step_id) continue
    const k = `${r.order_id}:${r.machine_step_id}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }

  const toDelete = []
  for (const [k, rows] of groups) {
    const sep = k.indexOf(':')
    const orderId = k.slice(0, sep)
    const stepId = k.slice(sep + 1)
    const order = orderById.get(orderId)
    const part = stepToPart.get(stepId)
    if (!order || !part) continue
    const partTotal = (part.qty_per_unit ?? 1) * (order.qty || 0)
    if (partTotal <= 0) continue
    const done = rows.reduce((s, r) => s + (r.qty_done ?? 0), 0)
    if (done < partTotal) continue // step still needs work — keep everything
    for (const r of rows) {
      if (r.status !== 'completed' && (r.qty_done ?? 0) === 0) toDelete.push(r.id)
    }
  }

  if (toDelete.length === 0) return []
  for (let i = 0; i < toDelete.length; i += 100) {
    const chunk = toDelete.slice(i, i + 100)
    const { error: delErr } = await supabase.from('schedule').delete().in('id', chunk)
    if (delErr) throw new Error(`Deleting phantom rows: ${delErr.message}`)
  }
  return toDelete
}

// Mark exactly one schedule row's qty_done. Used by MES Station's
// Complete Step confirm modal — it knows its own row id and the qty the
// operator counted, no distribution needed.
export async function setScheduleRowQtyDone(rowId, qtyDone) {
  if (!rowId) throw new Error('Row id required')
  const qd = Math.max(0, Math.floor(qtyDone || 0))
  const { data: existing, error: readErr } = await supabase
    .from('schedule')
    .select('qty')
    .eq('id', rowId)
    .single()
  if (readErr) throw new Error(`Reading schedule row: ${readErr.message}`)
  const rowQty = existing?.qty ?? qd
  const status = qd >= rowQty && rowQty > 0 ? 'completed' : qd > 0 ? 'working' : 'queued'
  const patch = { qty_done: Math.min(qd, rowQty), status }
  if (status === 'completed') patch.completed_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('schedule')
    .update(patch)
    .eq('id', rowId)
    .select('id, status, qty_done, completed_at, started_at')
    .single()
  if (error) throw new Error(`Updating schedule row: ${error.message}`)
  return data
}
