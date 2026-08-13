// ============================================================
// Wood "day conveyor" engine v3  (side-by-side calculator)
// ============================================================
//
// A relative, capacity-levelled scheduling model for the Wood department.
// Supersedes the v2 "day 0 = Monday" build (which pinned every product's first
// day to Monday of its prod_week). The real model, confirmed with Elmo:
//
//   • wood_day on a machine is a RANK (route order), not a weekday. Machines run
//     every day. Day 0 is each PRODUCT's own first day of manufacturing; +1 the
//     next work day, etc. (weekends + SA holidays skipped — a Friday start → +1
//     is Monday).
//   • Normal beat = one stage per day. A product's route COMPRESSES the distinct
//     machine ranks it touches to 0, +1, +2… — a skipped rank simply doesn't
//     exist for that product (that is the "route jump", no flag needed).
//   • Per-step override `machine_steps.wood_day_offset` pins a step to an explicit
//     day-offset (same value on two steps = same day / collapse; a smaller value
//     than the beat = a jump). Lives right where the parts map is built.
//   • Starts STAGGER: the whole week's orders can't all start on one day (not
//     enough machine-minutes), so each order's start is computed backwards from
//     its ship day = anchor − (route lead + buffer) work days, then PULLED
//     EARLIER (most-urgent first) whenever a machine-day it needs is already
//     full. Overtime is never forced — if pulling to the cap still won't fit,
//     the residual overflows and the day is flagged.
//   • Capacity is per machine per CALENDAR date (every product hitting it that
//     day, at whatever offset). Load spreads across a step's machine pool
//     (alt_machine_names) — the whole job lands on the least-loaded member.
//   • Residual overflow packs into the shift and spills the remainder to the
//     FRONT of that machine's next work day (splitting the straddling job).
//
// PURE + read-only: never touches the database. Used by the Wood Conveyor
// preview so the new model can be compared to the live schedule before wood is
// switched over. The live scheduler (scheduling.js / scheduleEngine.js) is
// untouched.

import { orderSendDate, isoWeekDayToDate } from './scheduling'
import { woodStartFor } from './orderDeptStart'
import {
  shiftForDate,
  effectiveShiftMinutes,
  isWorkDay,
  nextWorkDay,
  timeToMin,
  placeJobOnShift,
} from './scheduleEngine'

// Minutes a part takes to move from one machine to the next — the shop allows
// ~5 min. A step can't start until its predecessor is done + this travel.
const TRAVEL_MIN = 5

// Auto pull-earlier is OFF: the shop pulls parts forward MANUALLY (a "pull
// forward" button on the board). The engine places every item on its LITERAL
// day offsets and never silently shifts a start to relieve a jam — an over-full
// day is shown as over-capacity for the boss to resolve by hand.
const MAX_PULL_DAYS = 0
const DEFAULT_BUFFER = 3

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
const isoDow = (d) => { const j = d.getDay(); return j === 0 ? 7 : j }

function prevWorkDay(date, holidaySet) {
  const d = new Date(date)
  do { d.setDate(d.getDate() - 1) } while (!isWorkDay(d, holidaySet))
  return d
}
function addWorkDays(date, n, holidaySet) {
  let d = new Date(date)
  for (let i = 0; i < n; i++) d = nextWorkDay(d, holidaySet)
  return d
}
function subWorkDays(date, n, holidaySet) {
  let d = new Date(date)
  for (let i = 0; i < n; i++) d = prevWorkDay(d, holidaySet)
  return d
}

// ISO week number (1..53) for grouping placed dates into week strips.
function isoWeekNum(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil((((t - ys) / 86400000) + 1) / 7)
}
// Monday of the calendar week containing d.
function mondayOf(d) {
  const x = new Date(d)
  x.setDate(x.getDate() - (isoDow(x) - 1))
  return x
}
// The work days (Mon–Fri, minus holidays) of the calendar week starting `monday`.
// Does NOT spill into the next week — a holiday just yields fewer pills.
function weekWorkDates(monday, holidaySet) {
  const out = []
  const d = new Date(monday)
  for (let i = 0; i < 5; i++) {
    if (isWorkDay(d, holidaySet)) out.push(dateToStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// LITERAL day offset from the item's day 0 — NOT a compressed rank.
//   per-part override machine_steps.wood_day_offset wins;
//   otherwise the machine's own day (machines.wood_day) is used verbatim.
// A Day 3 machine runs on day +3 even when days 1-2 are empty — gaps are kept.
// Returns null when the step has neither (unassigned machine).
function stepOffset(step, machineByName) {
  if (step.wood_day_offset != null && step.wood_day_offset !== '') {
    const n = Number(step.wood_day_offset)
    if (!Number.isNaN(n)) return n
  }
  const m = machineByName.get(step.machine_name)
  if (m && m.wood_day != null) return Number(m.wood_day)
  return null
}

// Build the wood conveyor placement for a set of orders.
//
// Returns { machines, weeks, orders, warnings, unassigned }.
//   machines : Map<name, { machineName, color, rank, days: Map<dateStr, dayPlan> }>
//     dayPlan: { jobs:[job], totalWorkMin, capacity, overMin, overflowed }
//     job    : { …, offset, startMin, endMin, setupMin, carried, split, splitTotal }
//   weeks   : [{ week, monday, dates:[work dateStr…] }] sorted by date
//   orders  : [{ orderId, ord_nr, product_code, productName, customerName, qty,
//                startDate, leadDays, bufferDays, pulledDays, over,
//                route:[{ offset, dateStr, machine, partName, isAssembly,
//                         stepSeq, units }] }]  — for the per-order route ribbon
export function buildWoodConveyor({
  orders,
  productByCode,
  partsByProduct,
  stepsByPart,
  machineByName,
  customerByCode,
  holidaySet,
  bufferDaysByDept,
  deptStartOverrides = new Map(), // Map<orderId, { prod_week, prod_day }> — manual wood-start overrides
  partDayPlans = new Map(),       // Map<dateStr, { ranks: Map<partKey,rank>, removed: Set<partKey> }>
  year = new Date().getFullYear(),
  today = new Date(),
}) {
  const warnings = []
  const unassigned = new Set()

  const isWoodMachine = (name) => {
    const m = machineByName.get(name)
    return m && m.department === 'wood'
  }
  const woodBuffer = bufferDaysByDept?.get?.('wood') ?? DEFAULT_BUFFER

  // ---- Phase 1: per-order compressed route + lead. --------------------------
  // routed: [{ order, product, leadDays, steps:[{ machine, pool, secs, units,
  //            offset, partName, isAssembly, stepSeq, baseSetupMin }],
  //            anchorStr, latestStart, urgency }]
  const routed = []

  for (const o of orders) {
    if (!o.qty || o.qty <= 0) continue
    const product = productByCode.get(o.product_code)
    if (!product) continue
    const parts = partsByProduct.get(product.id) || []
    if (parts.length === 0) continue

    // Every wood step across all parts, in sequence. Non-wood steps ignored.
    const woodStepsByPart = new Map()
    for (const p of parts) {
      const ws = (stepsByPart.get(p.id) || [])
        .filter((s) => isWoodMachine(s.machine_name))
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
      if (ws.length) woodStepsByPart.set(p.id, ws)
    }
    if (woodStepsByPart.size === 0) continue // product doesn't touch wood

    const overrides = product.wood_day_overrides || {}
    const productName = product.description || o.product_code
    const customerName = customerByCode?.get(o.customer_code)?.name || null

    // Place one part's wood steps. floorOffset lets assembly parts wait for the
    // latest non-assembly offset. Returns { steps, maxOffset }.
    const placePart = (p, ws, floorOffset) => {
      const totalParts = (p.qty_per_unit ?? 1) * o.qty
      const out = []
      let prevOff = -1
      let maxOff = floorOffset
      for (const s of ws) {
        let off = stepOffset(s, machineByName)
        // A legacy per-product override (wood_day_overrides jsonb) can still
        // pin a machine — treat it as a literal offset too.
        if (off == null && s.machine_name in overrides) {
          const v = Number(overrides[s.machine_name])
          if (!Number.isNaN(v)) off = v
        }
        if (off == null) {
          unassigned.add(s.machine_name)
          warnings.push({ type: 'unassigned', machine: s.machine_name, message: `${s.machine_name} has no conveyor rank — steps on it for ${o.product_code} were skipped.` })
          continue
        }
        // Forward-only: a step never lands earlier than a prior step of this
        // part or the assembly floor. Equal offset = runs the same day.
        const placeOff = Math.max(off, prevOff, floorOffset)
        prevOff = placeOff
        if (placeOff > maxOff) maxOff = placeOff

        const mach = machineByName.get(s.machine_name)
        const alts = Array.isArray(s.alt_machine_names) ? s.alt_machine_names : []
        const pool = [s.machine_name, ...alts]
          .map((m) => (m == null ? '' : String(m).trim()))
          .filter((m) => m && isWoodMachine(m))
        const uniquePool = [...new Set(pool)]
        const secs = s.seconds_per_part ?? 0
        out.push({
          machine: s.machine_name,
          pool: uniquePool.length ? uniquePool : [s.machine_name],
          secs,
          units: totalParts,
          workMin: Math.ceil((secs * totalParts) / 60),
          baseSetupMin: (s.setup_time && s.setup_time > 0) ? s.setup_time : (mach?.setup_time_min || 0),
          offset: placeOff,
          partName: p.name || productName,
          isAssembly: !!p.is_assembly,
          stepSeq: s.sequence,
          stepId: s.id,     // machine_step id — stable job identity for MES/status
          partId: p.id,
        })
      }
      return { steps: out, maxOffset: maxOff }
    }

    // Non-assembly parts first (to find the assembly floor), then assembly.
    let maxNonAssembly = 0
    const routeSteps = []
    for (const p of parts) {
      if (p.is_assembly) continue
      const ws = woodStepsByPart.get(p.id)
      if (!ws) continue
      const { steps, maxOffset } = placePart(p, ws, 0)
      routeSteps.push(...steps)
      if (maxOffset > maxNonAssembly) maxNonAssembly = maxOffset
    }
    for (const p of parts) {
      if (!p.is_assembly) continue
      const ws = woodStepsByPart.get(p.id)
      if (!ws) continue
      const { steps } = placePart(p, ws, maxNonAssembly)
      routeSteps.push(...steps)
    }
    if (routeSteps.length === 0) continue

    const leadDays = Math.max(...routeSteps.map((s) => s.offset)) + 1

    const anchorStr = orderSendDate(o, year) || o.due_date || null

    // Day 0 = this order's WOOD production start — SEPARATE from steel. For a
    // two-track item (steel + wood parts) wood starts on its own day; woodStartFor
    // resolves it (manual override → auto wood track → the order's own prod day).
    // Only when there's no wood start at all do we walk back from the ship date.
    const wStart = woodStartFor(o, deptStartOverrides)
    let start
    if (wStart) {
      start = isoWeekDayToDate(year, wStart.prod_week, wStart.prod_day)
      // If that lands on a weekend/holiday, slide to the next working day.
      let guard = 0
      while (!isWorkDay(start, holidaySet) && guard < 14) { start = nextWorkDay(start, holidaySet); guard++ }
    } else if (anchorStr) {
      start = subWorkDays(strToDate(anchorStr), leadDays + woodBuffer, holidaySet)
    } else {
      warnings.push({ type: 'no-anchor', message: `${o.ord_nr || o.product_code}: no production day and no ship/Due date — can't place on the day-board.` })
      continue
    }
    const latestStart = start

    // Apply the manual "Sort parts for the day" plan for this item's start day:
    // drop parts removed from that day, and tag each remaining step with its
    // part's manual rank so the day-board processes them in the order the boss
    // set (1 = first into the factory). Missing rank = Infinity (after ranked ones).
    const startDateStr = dateToStr(start)
    const dayPlan = partDayPlans.get(startDateStr)
    let steps = routeSteps
    if (dayPlan && dayPlan.removed && dayPlan.removed.size) {
      steps = steps.filter((s) => !dayPlan.removed.has(`${o.id}:${s.partId}`))
      if (steps.length === 0) continue
    }
    for (const s of steps) {
      const r = dayPlan?.ranks?.get(`${o.id}:${s.partId}`)
      s.dayRank = (r == null ? Infinity : Number(r))
    }

    // Urgency for the sort order: calendar days to ship ÷ lead. Lower = more
    // urgent. Falls back to the start date when there's no ship date.
    const anchorDate = anchorStr ? strToDate(anchorStr) : start
    const daysToShip = Math.round((anchorDate - today) / 86400000)
    const urgency = daysToShip / Math.max(leadDays, 1)

    routed.push({ order: o, productName, customerName, leadDays, steps, anchorStr, latestStart, urgency })
  }

  // ---- Phase 2/3: global pull-earlier leveling on real dates. ---------------
  // Ledger of committed minutes per machine per date.
  const ledger = new Map() // machine -> Map<dateStr, { used, seen:Set<product> }>
  const cell = (machine, dateStr) => {
    if (!ledger.has(machine)) ledger.set(machine, new Map())
    const byDate = ledger.get(machine)
    if (!byDate.has(dateStr)) byDate.set(dateStr, { used: 0, seen: new Set() })
    return byDate.get(dateStr)
  }
  const capOf = (dateStr) => effectiveShiftMinutes(shiftForDate(strToDate(dateStr)))

  // Least-loaded pool member for a date, factoring committed load + a temp
  // delta from placements made earlier in this same order.
  const leastLoaded = (pool, dateStr, temp) => {
    let best = pool[0]
    let bestLoad = Infinity
    for (const m of pool) {
      const committed = ledger.get(m)?.get(dateStr)?.used || 0
      const t = temp.get(`${m}|${dateStr}`) || 0
      const load = committed + t
      if (load < bestLoad) { bestLoad = load; best = m }
    }
    return best
  }

  // Sort most-urgent first so their starts win the capacity race.
  routed.sort((a, b) => a.urgency - b.urgency)

  const ownJobs = new Map() // machine -> Map<dateStr, job[]>
  const pushJob = (machine, dateStr, job) => {
    if (!ownJobs.has(machine)) ownJobs.set(machine, new Map())
    const byDate = ownJobs.get(machine)
    if (!byDate.has(dateStr)) byDate.set(dateStr, [])
    byDate.get(dateStr).push(job)
  }
  const orderRoutes = []

  for (const r of routed) {
    const o = r.order
    // Try increasing pull until every step fits without overflow, or give up
    // at the cap and accept overflow.
    let chosenPull = MAX_PULL_DAYS
    let fits = false
    for (let pull = 0; pull <= MAX_PULL_DAYS; pull++) {
      const start = subWorkDays(r.latestStart, pull, holidaySet)
      const temp = new Map()
      let ok = true
      for (const s of r.steps) {
        const dateStr = dateToStr(addWorkDays(start, s.offset, holidaySet))
        const member = leastLoaded(s.pool, dateStr, temp)
        const c = cell(member, dateStr)
        const setup = c.seen.has(o.product_code) ? 0 : (s.baseSetupMin || 0)
        const est = s.workMin + setup
        const already = c.used + (temp.get(`${member}|${dateStr}`) || 0)
        if (already + est > capOf(dateStr)) { ok = false; break }
        temp.set(`${member}|${dateStr}`, (temp.get(`${member}|${dateStr}`) || 0) + est)
      }
      if (ok) { chosenPull = pull; fits = true; break }
    }

    const start = subWorkDays(r.latestStart, chosenPull, holidaySet)
    const routeCells = []
    const noTemp = new Map()
    for (const s of r.steps) {
      const dateStr = dateToStr(addWorkDays(start, s.offset, holidaySet))
      const member = leastLoaded(s.pool, dateStr, noTemp)
      const c = cell(member, dateStr)
      const setup = c.seen.has(o.product_code) ? 0 : (s.baseSetupMin || 0)
      c.used += s.workMin + setup
      c.seen.add(o.product_code)
      pushJob(member, dateStr, {
        orderId: o.id,
        ord_nr: o.ord_nr || o.kwitasie_nr || null,
        product_code: o.product_code,
        productName: r.productName,
        customerName: r.customerName,
        partName: s.partName,
        isAssembly: s.isAssembly,
        stepSeq: s.stepSeq,
        stepId: s.stepId,
        partId: s.partId,
        dayRank: s.dayRank,
        seconds_per_part: s.secs,
        units: s.units,
        workMin: s.workMin,
        baseSetupMin: s.baseSetupMin,
        offset: s.offset,
      })
      routeCells.push({ offset: s.offset, dateStr, machine: member, partName: s.partName, isAssembly: s.isAssembly, stepSeq: s.stepSeq, units: s.units })
    }
    if (!fits) {
      warnings.push({ type: 'over-capacity', message: `${o.ord_nr || o.product_code}: couldn't fit at normal capacity even pulled ${MAX_PULL_DAYS} days early — overtime or a longer lead is needed.` })
    }
    orderRoutes.push({
      orderId: o.id,
      ord_nr: o.ord_nr || o.kwitasie_nr || null,
      product_code: o.product_code,
      productName: r.productName,
      customerName: r.customerName,
      qty: o.qty,
      startDate: dateToStr(start),
      leadDays: r.leadDays,
      bufferDays: woodBuffer,
      pulledDays: chosenPull,
      over: !fits,
      route: routeCells.sort((a, b) => a.offset - b.offset || a.stepSeq - b.stepSeq),
    })
  }

  // ---- Phase 4: schedule steps IN SEQUENCE across machines + days. -----------
  // THE core rule: a part physically moves machine-to-machine, so a step can't
  // START until its previous step is DONE + travel — a downstream machine never
  // begins a part before the machine before it has finished it. Each step runs
  // on its assigned day; if that day is full it spills to the next work day.
  // Every machine runs one job at a time (usedTill per machine per date).

  // Per-part ordered step list (by machine sequence), each carrying its
  // assigned machine + date from the day-offset placement above.
  const partSteps = new Map() // partKey -> [{ job, machine, dateStr }]
  for (const [machine, byDate] of ownJobs) {
    for (const [dateStr, jobs] of byDate) {
      for (const job of jobs) {
        const key = `${job.orderId}::${job.partName}`
        if (!partSteps.has(key)) partSteps.set(key, [])
        partSteps.get(key).push({ job, machine, dateStr })
      }
    }
  }
  for (const list of partSteps.values()) list.sort((a, b) => a.job.stepSeq - b.job.stepSeq)

  // One work item per part, threading its steps in order.
  const items = [...partSteps.values()].map((steps) => ({ steps, idx: 0, readyDateStr: null, readyMin: 0 }))
  const machineUsed = new Map()  // `${machine}|${dateStr}` -> usedTill minute
  const uKey = (m, d) => `${m}|${d}`
  const setupSeen = new Map()    // `${machine}|${dateStr}` -> Set<product_code>
  const placedOut = new Map()    // machine -> Map<dateStr, [placedJob]>
  const pushPlaced = (machine, dateStr, pj) => {
    if (!placedOut.has(machine)) placedOut.set(machine, new Map())
    const bd = placedOut.get(machine)
    if (!bd.has(dateStr)) bd.set(dateStr, [])
    bd.get(dateStr).push(pj)
  }
  const ssMin = (d) => timeToMin(shiftForDate(strToDate(d)).start)

  const activeSet = new Set(items.filter((it) => it.idx < it.steps.length))
  let drainGuard = 0
  while (activeSet.size > 0 && drainGuard < 50000) {
    drainGuard++
    // Pick the current step to schedule next, ordered by: earliest day, then
    // earliest ready-minute, then the boss's manual "sort parts for the day" rank
    // (so parts start in the order that was set), then part name for stability.
    let best = null, bestDate = null, bestMin = Infinity, bestRank = Infinity, bestName = ''
    for (const it of activeSet) {
      const st = it.steps[it.idx]
      let date = st.dateStr
      if (it.readyDateStr && it.readyDateStr > date) date = it.readyDateStr
      const ss = ssMin(date)
      const partEarliest = (it.readyDateStr === date) ? it.readyMin : ss
      const machTill = machineUsed.get(uKey(st.machine, date)) ?? ss
      const rmin = Math.max(partEarliest, machTill, ss)
      const rank = st.job.dayRank == null ? Infinity : st.job.dayRank
      const name = st.job.partName || ''
      const better = best === null
        || date < bestDate
        || (date === bestDate && (rmin < bestMin
        || (rmin === bestMin && (rank < bestRank
        || (rank === bestRank && name < bestName)))))
      if (better) { best = it; bestDate = date; bestMin = rmin; bestRank = rank; bestName = name }
    }

    const it = best
    const st = it.steps[it.idx]
    let placeDate = bestDate
    let placed = false
    let spill = 0
    while (!placed && spill <= 30) {
      const shift = shiftForDate(strToDate(placeDate))
      const ss = timeToMin(shift.start)
      const uk = uKey(st.machine, placeDate)
      const machTill = machineUsed.get(uk) ?? ss
      const partEarliest = (it.readyDateStr === placeDate) ? it.readyMin : ss
      const earliest = Math.max(partEarliest, machTill, ss)
      const seenSet = setupSeen.get(uk) || new Set()
      const setupMin = seenSet.has(st.job.product_code) ? 0 : (st.job.baseSetupMin || 0)
      const need = st.job.workMin + setupMin
      const slot = placeJobOnShift(shift, earliest, earliest, need)
      if (slot) {
        machineUsed.set(uk, slot.endMin)
        seenSet.add(st.job.product_code); setupSeen.set(uk, seenSet)
        pushPlaced(st.machine, placeDate, { ...st.job, setupMin, startMin: slot.startMin, endMin: slot.endMin, carried: placeDate !== st.dateStr })
        it.readyDateStr = placeDate; it.readyMin = slot.endMin + TRAVEL_MIN
        placed = true
      } else if (need > effectiveShiftMinutes(shift)) {
        // Bigger than a whole day — place it whole, flag over-capacity, don't spill.
        const endMin = timeToMin(shift.end)
        machineUsed.set(uk, endMin)
        seenSet.add(st.job.product_code); setupSeen.set(uk, seenSet)
        pushPlaced(st.machine, placeDate, { ...st.job, setupMin, startMin: earliest, endMin, overflow: true, carried: placeDate !== st.dateStr })
        it.readyDateStr = placeDate; it.readyMin = endMin + TRAVEL_MIN
        placed = true
      } else {
        // Fits some day, just not this one (late start / machine busy) → next day.
        placeDate = dateToStr(nextWorkDay(strToDate(placeDate), holidaySet))
        spill++
      }
    }
    it.idx++
    if (it.idx >= it.steps.length) activeSet.delete(it)
  }

  // Build the machine → day plans for the UI.
  const machines = new Map()
  for (const [name, byDate] of placedOut) {
    const m = machineByName.get(name)
    const machine = { machineName: name, color: m?.color || '#9aa0ad', rank: m?.wood_day ?? null, days: new Map() }
    machines.set(name, machine)
    for (const [dateStr, jobs] of byDate) {
      jobs.sort((a, b) => a.startMin - b.startMin)
      const shift = shiftForDate(strToDate(dateStr))
      const capacity = effectiveShiftMinutes(shift)
      const totalWorkMin = jobs.reduce((s, j) => s + j.workMin + (j.setupMin || 0), 0)
      machine.days.set(dateStr, {
        jobs,
        totalWorkMin,
        capacity,
        overMin: Math.max(0, totalWorkMin - capacity),
        overflowed: totalWorkMin > capacity || jobs.some((j) => j.overflow),
      })
    }
  }

  // ---- Phase 5: group all placed dates into week strips. --------------------
  const allDates = new Set()
  for (const m of machines.values()) for (const dstr of m.days.keys()) allDates.add(dstr)
  const weekByMonday = new Map()
  for (const dstr of allDates) {
    const mon = mondayOf(strToDate(dstr))
    const key = dateToStr(mon)
    if (!weekByMonday.has(key)) {
      weekByMonday.set(key, { week: isoWeekNum(mon), monday: key, dates: weekWorkDates(mon, holidaySet) })
    }
  }
  const weeks = [...weekByMonday.values()].sort((a, b) => (a.monday < b.monday ? -1 : 1))

  return { machines, weeks, orders: orderRoutes, warnings, unassigned }
}
