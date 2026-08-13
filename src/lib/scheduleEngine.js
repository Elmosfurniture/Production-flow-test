import { supabase } from './supabase'
import { isoWeekDayToDate } from './scheduling'

// ============================================================
// Scheduling engine — dispatches orders to per-machine clock-time slots.
//
// Inputs: orders for a target prod_week, each order's product/parts/steps,
// the machine list, and the SA holiday set. Outputs: rows ready to insert
// into the `schedule` table (order_id, machine_id, machine_step_id,
// scheduled_date, start_time, end_time, position, status='queued',
// includes_setup).
//
// Algorithm (per spec):
//   1. Sort orders by manual priority_rank (drag order) first, then CR
//      ascending (most urgent first). Units already produced on the floor
//      are skipped — see doneByOrderStep / placeOneStep.
//   2. For each order, non-assembly parts START in parallel on prod_day at
//      shift start. Within a part, steps run sequentially — step n+1 cannot
//      start before step n's end_time on its machine.
//   3. ASSEMBLY parts (parts.is_assembly = true) wait for every non-assembly
//      part of the same order to finish on every machine before their first
//      step can start. You can't assemble a chair without the legs.
//   4. For each step, work minutes = ceil(seconds_per_part × qty_per_unit ×
//      order.qty / 60). Charge setup_time once per (product, machine, day)
//      — if the same product was the last placed on this machine today,
//      skip setup.
//   5. Find the earliest slot on the step's machine on/after the step's
//      earliest start time. Slot honours shift hours and breaks (work
//      pauses during breaks, end_time spans them).
//   6. If a step would push past shift end, overflow to the next working
//      day at shift start (which becomes the new earliestStart for
//      subsequent steps of that part).
// ============================================================

// Real factory day (confirmed with the shop): 07:00–07:20 morning 5S,
// breakfast 09:00–09:25, lunch 13:00–13:35, smoke 15:30–15:40, area cleanup
// 17:00–17:15.
// Mon–Thu effective work minutes = 615 (shift) − 105 (breaks) = 510.
// Fri    effective work minutes = 385 (shift) − 60  (breaks) = 325.
// Inter-step travel: minutes added between consecutive steps of one part as it
// physically moves from one machine to the next — the shop allows ~5 min.
const INTER_STEP_TRAVEL_MIN = 5

// ---------- lot streaming (transfer batches) ----------
// Large part quantities are split into smaller sub-batches that flow through
// the routing INDEPENDENTLY, so a downstream machine can start on the first
// finished sub-batch instead of waiting for the WHOLE quantity to clear the
// previous step. That's what keeps machines fed ("constant flow") — otherwise
// e.g. Tube Laser (leg step 3) sits idle until all 200 legs clear step 2.
//
// This does NOT multiply setup: setup is charged once per (product, machine,
// day) via machineState.productsSetup, so a part's sub-batches that land on
// the same machine the same day set up only once.
//
// Sizing: aim each sub-batch's SLOWEST step at ~SUBBATCH_TARGET_MIN minutes,
// capped at MAX_SUBBATCHES pieces so row counts stay sane. Small/fast parts
// stay a single batch. Exported for tests.
const SUBBATCH_TARGET_MIN = 50
const MAX_SUBBATCHES = 5

export function computeSubBatches(totalUnits, steps) {
  const units = Math.max(0, Math.floor(totalUnits || 0))
  if (units <= 1) return [{ unitStart: 0, size: units }]
  const maxSecs = (steps || []).reduce((m, s) => Math.max(m, s.seconds_per_part || 0), 0)
  if (maxSecs <= 0) return [{ unitStart: 0, size: units }]
  const targetUnits = Math.max(1, Math.floor((SUBBATCH_TARGET_MIN * 60) / maxSecs))
  let n = Math.ceil(units / targetUnits)
  n = Math.max(1, Math.min(MAX_SUBBATCHES, n))
  if (n <= 1) return [{ unitStart: 0, size: units }]
  const base = Math.floor(units / n)
  let rem = units - base * n
  const out = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const size = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
    if (size <= 0) continue
    out.push({ unitStart: start, size })
    start += size
  }
  return out
}

const SHIFT_MON_THU = {
  start: '07:00',
  end: '17:15',
  breaks: [
    { start: '07:00', end: '07:20', label: 'Morning 5S' },
    { start: '09:00', end: '09:25', label: 'Breakfast' },
    { start: '13:00', end: '13:35', label: 'Lunch' },
    { start: '15:30', end: '15:40', label: 'Smoke' },
    { start: '17:00', end: '17:15', label: 'Area cleanup' },
  ],
}

const SHIFT_FRI = {
  start: '07:00',
  end: '13:25',
  breaks: [
    { start: '07:00', end: '07:20', label: 'Morning 5S' },
    { start: '09:00', end: '09:25', label: 'Breakfast' },
    { start: '13:10', end: '13:25', label: 'Area cleanup' },
  ],
}

export const SHIFTS = { monThu: SHIFT_MON_THU, fri: SHIFT_FRI }

// ---------- time + date helpers ----------

export const timeToMin = (s) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
export const minToTime = (m) => {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
// time-suffixed to fit PostgreSQL TIME literal (HH:MM:SS).
export const minToTimeSql = (m) => `${minToTime(m)}:00`

const dateToStr = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const strToDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const cloneDate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const isoDow = (d) => { const j = d.getDay(); return j === 0 ? 7 : j }

export function shiftForDate(date) {
  // ISO weekday: Mon=1..Fri=5..Sun=7. Mon-Thu use the long shift, Fri short.
  const dow = isoDow(date)
  if (dow === 5) return SHIFT_FRI
  return SHIFT_MON_THU
}

// Total effective work minutes in a shift (clock minutes minus break/clean
// minutes). Used by the Dashboard's machine-load grid and by the dispatcher
// when figuring out how many minutes are left on a given day. Auto-derived
// so changes to the break list in SHIFT_MON_THU / SHIFT_FRI propagate.
// Current values: Mon–Thu = 515 min, Fri = 325 min.
export function effectiveShiftMinutes(shift) {
  const total = timeToMin(shift.end) - timeToMin(shift.start)
  const breakMin = shift.breaks.reduce((sum, b) => sum + (timeToMin(b.end) - timeToMin(b.start)), 0)
  return Math.max(0, total - breakMin)
}

export function isWorkDay(date, holidaySet) {
  const dow = isoDow(date)
  if (dow > 5) return false
  return !holidaySet.has(dateToStr(date))
}

export function nextWorkDay(date, holidaySet) {
  const d = cloneDate(date)
  let guard = 0
  do {
    d.setDate(d.getDate() + 1)
    guard++
  } while (!isWorkDay(d, holidaySet) && guard < 30)
  return d
}

// All 5 candidate working dates of an ISO week, minus holidays.
export function workDatesOfWeek(weekNumber, year, holidaySet) {
  const out = []
  for (let dow = 1; dow <= 5; dow++) {
    const d = isoWeekDayToDate(year, weekNumber, dow)
    if (isWorkDay(d, holidaySet)) out.push(dateToStr(d))
  }
  return out
}

// Order sequencing comparator, shared by the ready-time queue tiebreak and
// the Schedule screen's pre-sort. When two work items are ready at the SAME
// moment, this decides which runs first: a manual priority_rank (set by
// dragging on the Priority screen) wins — lower rank first, unranked last —
// otherwise fall back to CR (lower = more urgent). It only reorders items
// within the same moment; it never changes which DAY an order lands on (that
// is fixed by the order's prod_day). Returns <0 if a should run before b.
export function comparePriority(a, b) {
  const aR = a?.priority_rank
  const bR = b?.priority_rank
  if (aR != null && bR != null) { if (aR !== bR) return aR - bR }
  else if (aR != null) return -1
  else if (bR != null) return 1
  const aCR = (a?.cr != null && Number.isFinite(a.cr)) ? a.cr : Number.POSITIVE_INFINITY
  const bCR = (b?.cr != null && Number.isFinite(b.cr)) ? b.cr : Number.POSITIVE_INFINITY
  if (aCR === bCR) return 0 // equal (incl. both unscheduled) — avoid Infinity−Infinity = NaN
  return aCR - bCR
}

// ---------- slot allocator ----------

// Place a job of `workMin` work-minutes on `shift`, starting no earlier than
// max(machineUsedTillMin, earliestStartMin). Returns { startMin, endMin } in
// minutes-since-midnight, or null if the job can't finish before shift end.
// end - start spans any breaks the job runs through, but only work-minutes
// are consumed.
export function placeJobOnShift(shift, machineUsedTillMin, earliestStartMin, workMin) {
  if (workMin <= 0) return null
  const shiftStart = timeToMin(shift.start)
  const shiftEnd = timeToMin(shift.end)
  const breaks = shift.breaks
    .map((b) => ({ start: timeToMin(b.start), end: timeToMin(b.end) }))
    .sort((a, b) => a.start - b.start)

  // 1) Compute the actual start: never before shift start, never inside a break.
  let startMin = Math.max(machineUsedTillMin, earliestStartMin, shiftStart)
  for (const b of breaks) {
    if (startMin >= b.start && startMin < b.end) startMin = b.end
  }
  if (startMin >= shiftEnd) return null

  // 2) Walk forward consuming workMin work-time, skipping breaks (clock
  //    advances through them but no work counted).
  let cursor = startMin
  let remaining = workMin
  while (remaining > 0) {
    const nextBreak = breaks.find((b) => b.start > cursor)
    const blockEnd = nextBreak ? nextBreak.start : shiftEnd
    const blockCap = blockEnd - cursor
    if (blockCap >= remaining) {
      cursor += remaining
      remaining = 0
    } else {
      if (!nextBreak) return null
      remaining -= blockCap
      cursor = nextBreak.end
    }
  }
  if (cursor > shiftEnd) return null
  return { startMin, endMin: cursor }
}

// Total work-minutes available on `shift` between the latest of
// (machineUsedTillMin, earliestStartMin, shift.start) and the shift end,
// skipping breaks. Used by the splitter to figure out how many units of work
// can fit in the remaining day.
export function computeAvailableWorkMin(shift, machineUsedTillMin, earliestStartMin) {
  const shiftStart = timeToMin(shift.start)
  const shiftEnd = timeToMin(shift.end)
  const breaks = shift.breaks
    .map((b) => ({ start: timeToMin(b.start), end: timeToMin(b.end) }))
    .sort((a, b) => a.start - b.start)
  let cursor = Math.max(machineUsedTillMin, earliestStartMin, shiftStart)
  for (const b of breaks) {
    if (cursor >= b.start && cursor < b.end) cursor = b.end
  }
  if (cursor >= shiftEnd) return 0
  let total = 0
  let pos = cursor
  while (pos < shiftEnd) {
    const nextBreak = breaks.find((b) => b.start > pos)
    const blockEnd = nextBreak ? Math.min(nextBreak.start, shiftEnd) : shiftEnd
    total += blockEnd - pos
    if (!nextBreak) break
    pos = nextBreak.end
    if (pos >= shiftEnd) break
  }
  return total
}

// Distribute a step's units across the work-blocks of one day (the gaps
// between breaks and the shift end). Each work-block yields ONE segment —
// one schedule row will be written per segment, so the operator gets a clean
// "do X parts before the next break" boundary instead of one row that spans
// breaks.
//
// Returns { segments, unitsPlaced } where each segment is
//   { startMin, endMin, units, includesSetup }
// and unitsPlaced = sum of segment.units. Setup time is consumed on whichever
// segment is the FIRST to place a unit on this machine today.
export function placeUnitsOnDay({
  shift, machineUsedTillMin, earliestStartMin,
  unitsNeeded, secsPerUnit, setupMin,
}) {
  const shiftStart = timeToMin(shift.start)
  const shiftEnd = timeToMin(shift.end)
  const breaks = shift.breaks
    .map((b) => ({ start: timeToMin(b.start), end: timeToMin(b.end) }))
    .sort((a, b) => a.start - b.start)

  let cursor = Math.max(machineUsedTillMin, earliestStartMin, shiftStart)
  for (const b of breaks) {
    if (cursor >= b.start && cursor < b.end) cursor = b.end
  }
  if (cursor >= shiftEnd) return { segments: [], unitsPlaced: 0 }

  const segments = []
  let remaining = unitsNeeded
  let setupApplied = false

  while (remaining > 0 && cursor < shiftEnd) {
    const nextBreak = breaks.find((b) => b.start > cursor)
    const blockEnd = nextBreak ? nextBreak.start : shiftEnd
    let workMinAvail = blockEnd - cursor
    if (workMinAvail <= 0) {
      if (!nextBreak) break
      cursor = nextBreak.end
      continue
    }

    // Setup, if any, consumes clock-time from THIS block. It must fit
    // contiguously inside one block — if not, push to after the next break.
    let segSetup = 0
    if (!setupApplied && setupMin > 0) {
      if (setupMin >= workMinAvail) {
        if (!nextBreak) break
        cursor = nextBreak.end
        continue
      }
      segSetup = setupMin
      workMinAvail -= setupMin
    }

    const unitsFit = Math.floor((workMinAvail * 60) / secsPerUnit)
    if (unitsFit <= 0) {
      // Not enough room for a whole unit in this block (after setup).
      if (!nextBreak) break
      cursor = nextBreak.end
      continue
    }

    const unitsForThis = Math.min(unitsFit, remaining)
    const workMin = Math.ceil((unitsForThis * secsPerUnit) / 60)
    const segStart = cursor
    const segEnd = segStart + segSetup + workMin

    segments.push({
      startMin: segStart,
      endMin: segEnd,
      units: unitsForThis,
      includesSetup: segSetup > 0,
    })

    if (segSetup > 0) setupApplied = true
    remaining -= unitsForThis
    cursor = segEnd
    // If the segment ended inside (or at the start of) a break, jump past it.
    for (const b of breaks) {
      if (cursor >= b.start && cursor < b.end) { cursor = b.end; break }
    }
  }

  return { segments, unitsPlaced: unitsNeeded - remaining }
}

// ---------- main dispatcher ----------

// Generate schedule rows for one ISO week. Pure-ish — reads from the cached
// maps the screen passes in, returns the rows to insert plus a summary. The
// screen calls writeScheduleForWeek() after to persist + clear old queued
// rows.
//
// `orders` should already be sorted by CR ascending. Orders missing
// prod_day, product, or routing are silently skipped (counted in summary).
//
// Setup time is charged once per (product_code, machine_id, scheduled_date):
// the engine remembers the last product placed on each machine each day and
// drops setup if the next placement matches.
export function buildScheduleRows({
  weekNumber, year,
  orders,                // [{ id, kwitasie_nr, qty, product_code, prod_day, cr, department, ... }]
  partsByProductId,      // Map<product_id, parts[]>  (parts have qty_per_unit)
  stepsByPartId,         // Map<part_id, steps[]>     (sequence, machine_name, seconds_per_part, setup_time)
  productByCode,         // Map<code, product>
  machineByName,         // Map<name, { id, name, department }>
  holidaySet,
  doneByOrderStep = new Map(), // Map<`${order_id}::${machine_step_id}`, units already produced>
}) {
  const rows = []
  const skipped = { noProdDay: 0, noProduct: 0, noParts: 0, noSteps: 0, noMachine: 0 }
  const overflowedMachines = new Set()
  // machineState: Map<machine_id, Map<dateStr, { usedTillMin, lastProductCode, count }>>
  const machineState = new Map()
  // Jig ownership: there's one physical jig per product per step type, so
  // once a product's step lands on a machine on a given date, every other
  // order of the SAME product running the SAME step on that date must use
  // the SAME machine. Without this lock, the load-balancer would happily
  // place Order A's Product X welds on Dino and Order B's Product X welds
  // on Francis at the same time — but the jig is physically on Dino's
  // station; Francis would be stuck waiting. Key = `${product_code}::${step.id}::${dateStr}`.
  const jigOwner = new Map()
  const getState = (machineId, dateStr) => {
    let perDate = machineState.get(machineId)
    if (!perDate) { perDate = new Map(); machineState.set(machineId, perDate) }
    let st = perDate.get(dateStr)
    // productsSetup: set of product codes already set up on this machine this
    // day. Setup is charged the FIRST time a product runs on the machine that
    // day and skipped thereafter — even if other products run in between — so
    // lot-streamed sub-batches don't re-pay setup. (Matches the documented
    // "once per product/machine/day" rule; the old code only skipped it for
    // strictly back-to-back jobs.)
    if (!st) { st = { usedTillMin: 0, lastProductCode: null, count: 0, productsSetup: new Set() }; perDate.set(dateStr, st) }
    return st
  }

  // Year-fenced safety: an order should never schedule beyond the year. If
  // overflow ever pushes 30+ days into the future, abandon that step.
  const MAX_OVERFLOW_DAYS = 30

  // Ready-time queue: every part across every order contributes one "work
  // item" tracking its current step index and the earliest time that step
  // can start (its predecessor's end_time, or the prod_day shift start for
  // the first step). At every drain iteration we pick the item whose current
  // step is ready EARLIEST — that way an idle machine slot gets filled by
  // whichever part is ready to use it, instead of being blocked waiting for
  // some other part's later-ready step. CR breaks ties.
  const queue = []
  // Per-order tracker for the assembly dependency: assembly parts are held
  // out until every non-assembly part of the same order has finished its
  // last step.
  const orderAssemblyInfo = new Map()

  for (const order of orders) {
    if (!order.prod_day || order.prod_day < 1 || order.prod_day > 5) { skipped.noProdDay++; continue }
    const product = productByCode.get(order.product_code)
    if (!product) { skipped.noProduct++; continue }
    const parts = partsByProductId.get(product.id) || []
    if (parts.length === 0) { skipped.noParts++; continue }

    // prod_day Mon=1..Fri=5 within the order's prod_week. If that exact day
    // is a holiday, slide forward to the next work day.
    let prodDate = isoWeekDayToDate(year, weekNumber, order.prod_day)
    let slideGuard = 0
    while (!isWorkDay(prodDate, holidaySet) && slideGuard < 14) {
      prodDate = nextWorkDay(prodDate, holidaySet)
      slideGuard++
    }
    const prodDateStr = dateToStr(prodDate)
    const prodShiftStart = timeToMin(shiftForDate(prodDate).start)

    const nonAssemblyItems = []
    const assemblyItems = []
    for (const part of parts) {
      const steps = [...(stepsByPartId.get(part.id) || [])].sort((a, b) => a.sequence - b.sequence)
      if (steps.length === 0) { skipped.noSteps++; continue }
      // Diagnostic — log each part's full routing as the engine sees it.
      // eslint-disable-next-line no-console
      console.log(
        `[Schedule] ${order.kwitasie_nr || order.id} · ${part.name}${part.is_assembly ? ' (ASM)' : ''}: ` +
        steps.map((s) => `${s.sequence}.${s.machine_name}(${s.seconds_per_part}s)`).join(' → '),
      )
      // Lot streaming: split this part's total quantity into sub-batches that
      // flow through the routing independently. Each carries its unit offset
      // (unitStart) so completion accounting can tell which units it covers.
      const partTotalUnits = (order.qty ?? 0) * (part.qty_per_unit ?? 1)
      for (const sb of computeSubBatches(partTotalUnits, steps)) {
        if (sb.size <= 0) continue
        const item = {
          order, part, steps, stepIdx: 0,
          unitStart: sb.unitStart,
          totalUnits: sb.size,
          readyDateStr: prodDateStr,
          readyMin: prodShiftStart,
          placedAny: false,
        }
        if (part.is_assembly) assemblyItems.push(item)
        else { nonAssemblyItems.push(item); queue.push(item) }
      }
    }

    orderAssemblyInfo.set(order.id, {
      remaining: nonAssemblyItems.length,
      latestDateStr: prodDateStr,
      latestMin: prodShiftStart,
      assemblyItems,
    })
    // Order has only assembly parts (rare) — queue them immediately since
    // there are no non-assembly parts to wait for.
    if (nonAssemblyItems.length === 0) {
      for (const ai of assemblyItems) queue.push(ai)
    }
  }

  // Place one step of one item, splitting across days if the work doesn't
  // fit in a single shift. Returns the placement's FINAL end time (so the
  // caller can advance the item's readyTime to wait for the last partial),
  // or null if no units could be placed at all (e.g. machine doesn't exist).
  //
  // When splitting, the engine fills today's available time with as many
  // units as fit (rounded down), then carries the remainder to the next
  // working day. Setup is charged once per (product, machine, day) on each
  // day's portion, so a split that crosses two days incurs setup twice.
  const placeOneStep = (item) => {
    const step = item.steps[item.stepIdx]
    // Completion-aware planning: how many units of THIS (order, step) are
    // already produced on the floor (surviving completed/working/paused
    // rows). A fully-done step consumes no machine time and emits no rows —
    // we skip it entirely (return null → drain loop advances stepIdx without
    // charging time), so the engine stops re-planning finished fabrication
    // and burying the ready assembly behind it. A partially-done step only
    // plans its leftover units. Skip early, before claiming a jig for work
    // that won't be placed.
    // Units already produced for this (order, step). The first `stepDone` units
    // of the part are the finished ones, so this sub-batch's finished share is
    // the overlap of [unitStart, unitStart+size) with [0, stepDone).
    const stepDone = doneByOrderStep.get(`${item.order.id}::${step.id}`) || 0
    const size = item.totalUnits ?? 0
    const doneInBatch = Math.max(0, Math.min(size, stepDone - (item.unitStart || 0)))
    const stepRemaining = size - doneInBatch
    if (stepRemaining <= 0) return null
    // Resolve the pool — primary + alts. Defensive: drop blanks, dedup, drop
    // names that don't resolve to a real machine, drop inactive machines.
    // The picker below scores each pool member by current queue load and
    // picks the freest one. With NO alts defined this still works — pool has
    // exactly one member and the picker returns it (identical to legacy).
    const altNames = Array.isArray(step.alt_machine_names) ? step.alt_machine_names : []
    const rawPoolNames = [step.machine_name, ...altNames]
      .map((n) => (n == null ? '' : String(n).trim()))
      .filter(Boolean)
    const uniqPoolNames = [...new Set(rawPoolNames)]
    const poolMachines = uniqPoolNames
      .map((n) => machineByName.get(n))
      .filter((m) => m && m.active !== false)
    if (poolMachines.length === 0) {
      // Either the primary doesn't resolve at all (truly broken routing), or
      // every pool member is inactive. Skip with the existing noMachine
      // counter so the summary reflects reality.
      skipped.noMachine++
      return null
    }
    // JIG CONSTRAINT (one physical jig per product per step): if this
    // product's step has already been placed somewhere on the target date,
    // every subsequent order of the same product running the same step must
    // route to the SAME machine. Locks the jig in place rather than letting
    // the load-balancer split work across machines that don't actually have
    // the fixture set up.
    const targetDateStr = item.readyDateStr
    const jigKey = `${item.order.product_code}::${step.id}::${targetDateStr}`
    const lockedMachineId = jigOwner.get(jigKey)
    let candidates = poolMachines
    let jigLocked = false
    if (lockedMachineId) {
      const owner = poolMachines.find((m) => m.id === lockedMachineId)
      if (owner) {
        candidates = [owner]
        jigLocked = true
      }
      // If the jig owner isn't in this pool, the pool composition changed
      // since the jig was claimed — fall through to free choice. Rare; only
      // happens if someone edits the alt list mid-regenerate, which the UI
      // doesn't allow.
    }
    // Pick the candidate with the LEAST current load on the target date.
    // Score = usedTillMin (minutes already booked on that machine that day).
    // Lower score = freer. Ties broken by (a) preferring same lastProductCode
    // so we save the setup, then (b) the order the user listed in the pool —
    // primary first, then alts in the order they typed them in the editor.
    let pickedMachine = candidates[0]
    let pickedScore = Infinity
    let pickedSameProduct = false
    for (const m of candidates) {
      const s = getState(m.id, targetDateStr)
      const score = s.usedTillMin
      const sameProduct = s.productsSetup.has(item.order.product_code)
      if (score < pickedScore) {
        pickedMachine = m
        pickedScore = score
        pickedSameProduct = sameProduct
      } else if (score === pickedScore && sameProduct && !pickedSameProduct) {
        pickedMachine = m
        pickedSameProduct = true
      }
    }
    const machine = pickedMachine
    // Claim the jig for this (product, step, date) so subsequent placements
    // are forced to the same machine.
    jigOwner.set(jigKey, machine.id)
    // Demo + diagnostic visibility: when the pool has alts and we picked a
    // non-primary member, log the decision so it's visible in the console.
    // Stays silent for single-machine steps to avoid log spam.
    if (poolMachines.length > 1) {
      // eslint-disable-next-line no-console
      console.log(
        `[Schedule] ⚖ pool-pick: ${item.order.kwitasie_nr || item.order.id} · ${item.part.name} step ${step.sequence} → ` +
        `${machine.name} (${pickedScore}m queued)` +
        (jigLocked ? ' [JIG-LOCK]' : '') +
        ` from pool [${poolMachines.map((m) => `${m.name}:${getState(m.id, targetDateStr).usedTillMin}m`).join(', ')}]` +
        ` on ${targetDateStr}`,
      )
    }
    const secsPerUnit = step.seconds_per_part ?? 0
    if (secsPerUnit <= 0) return null
    // Only the leftover (not-yet-produced) units need machine time.
    let remainingUnits = stepRemaining
    if (remainingUnits <= 0) return null

    let dateCursor = strToDate(item.readyDateStr)
    let earliestMinForDay = item.readyMin
    let lastEnd = null
    let dayAttempts = 0
    const originalUnits = remainingUnits

    while (remainingUnits > 0 && dayAttempts < MAX_OVERFLOW_DAYS) {
      const dateStr = dateToStr(dateCursor)
      const shift = shiftForDate(dateCursor)
      const state = getState(machine.id, dateStr)
      // Setup time: prefer the step's setup_time when it's been set (legacy
      // CSV import path used to populate this), otherwise fall back to the
      // machine's setup_time_min (the new per-machine model the user now
      // edits via the Machines screen). Charged once per product per machine
      // per day — skipped if this product was already set up here today.
      const baseSetup = (step.setup_time && step.setup_time > 0)
        ? step.setup_time
        : (machine.setup_time_min || 0)
      const setupMin = state.productsSetup.has(item.order.product_code) ? 0 : baseSetup

      const { segments, unitsPlaced } = placeUnitsOnDay({
        shift,
        machineUsedTillMin: state.usedTillMin,
        earliestStartMin: earliestMinForDay,
        unitsNeeded: remainingUnits,
        secsPerUnit,
        setupMin,
      })

      if (segments.length > 0) {
        for (const seg of segments) {
          state.usedTillMin = seg.endMin
          state.lastProductCode = item.order.product_code
          state.productsSetup.add(item.order.product_code)
          state.count++
          rows.push({
            order_id: item.order.id,
            machine_id: machine.id,
            machine_step_id: step.id,
            scheduled_date: dateStr,
            start_time: minToTimeSql(seg.startMin),
            end_time: minToTimeSql(seg.endMin),
            position: state.count - 1,
            status: 'queued',
            includes_setup: seg.includesSetup,
            qty: seg.units,
          })
          item.placedAny = true
          lastEnd = { dateStr, endMin: seg.endMin }
        }
        remainingUnits -= unitsPlaced

        if (segments.length > 1) {
          // eslint-disable-next-line no-console
          console.log(
            `[Schedule] ⚙ break-split: ${item.order.kwitasie_nr || item.order.id} · ${item.part.name}${item.part.is_assembly ? ' (ASM)' : ''} step ${step.sequence} (${step.machine_name}) ${dateStr} → ${segments.length} segments (${segments.map((s) => s.units).join('+')} = ${unitsPlaced})`,
          )
        }
        if (remainingUnits > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[Schedule] ⚙ day-split: ${item.order.kwitasie_nr || item.order.id} · ${item.part.name}${item.part.is_assembly ? ' (ASM)' : ''} step ${step.sequence} placed ${unitsPlaced} of ${originalUnits} on ${dateStr}, ${remainingUnits} units to next day`,
          )
        }
        if (remainingUnits === 0) break
      } else {
        // No segments fit today (e.g. machine fully booked or huge setup).
        overflowedMachines.add(machine.id)
        // eslint-disable-next-line no-console
        console.log(
          `[Schedule] ⚠ overflow: ${item.order.kwitasie_nr || item.order.id} · ${item.part.name}${item.part.is_assembly ? ' (ASM)' : ''} step ${step.sequence} (${step.machine_name}) no slot ${dateStr} — pushing to next day`,
        )
      }

      dateCursor = nextWorkDay(dateCursor, holidaySet)
      earliestMinForDay = 0
      dayAttempts++
    }

    return lastEnd ? { dateStr: lastEnd.dateStr, endMin: lastEnd.endMin } : null
  }

  // ---- Drain loop ----
  // Pick the item whose current step is ready EARLIEST and place it. Tiebreak
  // by order CR (lower = more urgent), then by stability. After placement,
  // advance that item's stepIdx + readyTime. When an item's last step is
  // placed, decrement its order's assembly-remaining counter — if it reaches
  // zero, queue the order's assembly parts with readyTime = max end across
  // all of that order's non-assembly parts.
  while (queue.length > 0) {
    let bestIdx = 0
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i], b = queue[bestIdx]
      if (a.readyDateStr < b.readyDateStr) { bestIdx = i; continue }
      if (a.readyDateStr > b.readyDateStr) continue
      if (a.readyMin < b.readyMin) { bestIdx = i; continue }
      if (a.readyMin > b.readyMin) continue
      // Ready at the same moment — break the tie by manual priority_rank
      // (drag order), then CR. Doesn't move anything to a different day.
      if (comparePriority(a.order, b.order) < 0) bestIdx = i
    }
    const item = queue[bestIdx]
    const result = placeOneStep(item)
    item.stepIdx++
    if (result) {
      item.readyDateStr = result.dateStr
      item.readyMin = result.endMin
      // Inter-step travel: add a flat 3-min walk/forklift time before the
      // next step on this part can start on its next machine. Last step of
      // the part doesn't pay travel (work is done).
      if (item.stepIdx < item.steps.length) {
        item.readyMin += INTER_STEP_TRAVEL_MIN
      }
    }
    if (item.stepIdx >= item.steps.length) {
      // Part done (success or all-skipped). If non-assembly, decrement the
      // order's assembly-remaining counter and update the order's latest end.
      const info = orderAssemblyInfo.get(item.order.id)
      if (info && !item.part.is_assembly) {
        if (item.placedAny && (
          item.readyDateStr > info.latestDateStr ||
          (item.readyDateStr === info.latestDateStr && item.readyMin > info.latestMin)
        )) {
          info.latestDateStr = item.readyDateStr
          info.latestMin = item.readyMin
        }
        info.remaining--
        if (info.remaining === 0 && info.assemblyItems.length > 0) {
          // Diagnostic — log when each order's assembly parts get released
          // into the queue and what time they're ready for.
          // eslint-disable-next-line no-console
          console.log(
            `[Schedule] Assembly ${item.order.kwitasie_nr || item.order.id} READY at ${info.latestDateStr} ${minToTime(info.latestMin)}` +
            ` (queueing: ${info.assemblyItems.map((ai) => ai.part.name).join(', ')})`,
          )
          for (const ai of info.assemblyItems) {
            ai.readyDateStr = info.latestDateStr
            ai.readyMin = info.latestMin
            queue.push(ai)
          }
          info.assemblyItems = []
        }
      }
      // Per-step log so we can see if assembly was placed on a later day than
      // it was ready for — that's the "spilled to next day" symptom.
      if (item.part.is_assembly && item.placedAny && rows.length > 0) {
        const lastRow = rows[rows.length - 1]
        if (lastRow.machine_step_id === item.steps[item.stepIdx - 1]?.id) {
          const placedDate = lastRow.scheduled_date
          // info may have been replaced — fetch by order id
          // eslint-disable-next-line no-console
          console.log(
            `[Schedule] Assembly ${item.order.kwitasie_nr || item.order.id} · ${item.part.name} ` +
            `placed on ${placedDate} ${lastRow.start_time.slice(0,5)}-${lastRow.end_time.slice(0,5)} (machine_id ${lastRow.machine_id.slice(0,6)})` +
            (info && placedDate > info.latestDateStr ? '  ⚠ SPILLED to later day' : ''),
          )
        }
      }
      queue.splice(bestIdx, 1)
    }
  }

  return {
    rows,
    summary: {
      scheduled: rows.length,
      skipped,
      overflowedMachineIds: [...overflowedMachines],
    },
  }
}

// Drop schedule rows whose machine_step_id no longer exists in the
// machine_steps table. These orphans appear when a product is edited (which
// destructively replaces its parts/steps) — the FK CASCADE should clean
// them, but if it didn't fire (older rows, schema-drift, etc.) this catches
// them. validStepIds = the set of step ids the caller knows about (typically
// AppDataContext.machineSteps). Returns the number of rows deleted.
export async function cleanupOrphanScheduleRows({ validStepIds, weekDates = null } = {}) {
  if (!validStepIds || validStepIds.size === 0) return 0
  let q = supabase.from('schedule').select('id, machine_step_id').eq('status', 'queued')
  if (weekDates && weekDates.length > 0) q = q.in('scheduled_date', weekDates)
  const { data, error } = await q
  if (error) throw new Error(`Auditing schedule: ${error.message}`)
  const orphanIds = (data || [])
    .filter((r) => r.machine_step_id && !validStepIds.has(r.machine_step_id))
    .map((r) => r.id)
  if (orphanIds.length === 0) return 0
  const { error: delErr } = await supabase.from('schedule').delete().in('id', orphanIds)
  if (delErr) throw new Error(`Deleting orphan schedule rows: ${delErr.message}`)
  return orphanIds.length
}

// Persist generated rows. Clears every existing queued row for the regenerated
// orders first (regardless of scheduled_date — overflowed rows on later weeks
// must be wiped too, otherwise the unique (machine_id, scheduled_date,
// position) constraint will collide on next regenerate). Started/paused/
// completed rows are never touched.
//
// After the delete, we shift each new row's `position` past the max position
// of any REMAINING row on the same (machine, date). Without this, the engine
// happily emits position=0 even when an existing completed/working/paused
// row already sits at position 0 — and the unique constraint blows up.
export async function writeScheduleRows({ orderIds, rows, onProgress = () => {} }) {
  onProgress({ stage: 'clearing', current: 0, total: rows.length })
  if (orderIds && orderIds.length > 0) {
    const { error: delErr } = await supabase
      .from('schedule')
      .delete()
      .in('order_id', orderIds)
      .eq('status', 'queued')
    if (delErr) throw new Error(`Clearing existing queued schedule: ${delErr.message}`)
  }

  if (rows.length === 0) return { inserted: 0, rows: [] }

  // Compute position offsets so the engine's 0-based positions don't collide
  // with rows that survived the delete (completed/working/paused, plus rows
  // from orders not in this batch).
  const dates = [...new Set(rows.map((r) => r.scheduled_date))]
  const machineIds = [...new Set(rows.map((r) => r.machine_id))]
  const { data: surviving, error: maxErr } = await supabase
    .from('schedule')
    .select('machine_id, scheduled_date, position')
    .in('scheduled_date', dates)
    .in('machine_id', machineIds)
  if (maxErr) throw new Error(`Reading existing positions: ${maxErr.message}`)
  const maxByCombo = new Map()
  for (const r of (surviving || [])) {
    const k = `${r.machine_id}|${r.scheduled_date}`
    const cur = maxByCombo.get(k)
    if (cur == null || r.position > cur) maxByCombo.set(k, r.position)
  }
  for (const r of rows) {
    const base = (maxByCombo.get(`${r.machine_id}|${r.scheduled_date}`) ?? -1) + 1
    r.position += base
  }

  onProgress({ stage: 'inserting', current: 0, total: rows.length })
  const chunkSize = 500
  const insertedRows = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    const part = rows.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('schedule')
      .insert(part)
      .select('id, order_id, machine_id, machine_step_id, scheduled_date, start_time, end_time, position, status, includes_setup, qty, started_at, completed_at')
    if (error) throw new Error(`Inserting schedule rows: ${error.message}`)
    if (data) insertedRows.push(...data)
    onProgress({ stage: 'inserting', current: insertedRows.length, total: rows.length })
  }
  return { inserted: insertedRows.length, rows: insertedRows }
}
