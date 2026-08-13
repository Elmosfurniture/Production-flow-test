import { supabase } from './supabase'
import {
  bottleneckMinutes,
  fetchRoutings,
  isoWeek,
  loadScheduleConfig,
  minutesToWorkDays,
  orderSendDate,
  workDaysUntil,
} from './scheduling'

// Dept tab id (UI) → orders.department value (DB)
const DEPT_TAB_TO_DB = {
  steel: 'steel',
  wood: 'wood',
  uphol: 'upholstery',
  disp: 'dispatch',
  other: 'other',
}

const DAY_LABELS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' }
export const dayLabel = (n) => DAY_LABELS[n] || '—'

// CR colour band per project spec: <1 danger, 1-3 warn, 3-5 mid, ≥5 ok.
export function crBand(cr) {
  if (cr == null || !Number.isFinite(cr)) return 'unknown'
  if (cr < 1) return 'danger'
  if (cr < 3) return 'warn'
  if (cr < 5) return 'mid'
  return 'ok'
}

// Format CR for display. Returns 'n/a' for unscheduled / missing.
export function formatCR(cr) {
  if (cr == null || !Number.isFinite(cr)) return 'n/a'
  return cr.toFixed(1)
}

// Tooltip text when CR couldn't be computed. Returns null when CR is known.
export function crReason(order) {
  if (order.cr != null && Number.isFinite(order.cr)) return null
  if (order.send_week == null || order.send_day == null) {
    return 'No Send date — set Send week/day so CR can be computed.'
  }
  if (!order.bottleneck) return 'No routing for this product — add machine steps in Products.'
  return 'CR could not be computed.'
}

// Pretty week label: { num: 19, label: 'Wk 19' }
const wkLabel = (n) => `Wk ${n}`

// Comparator that mirrors loadPriority's sort: manual ranks first (asc), then
// unranked by CR asc with bottleneck-minutes tiebreak. Pulled out so callers
// (e.g. PriorityScreen after a drag-drop) can re-sort locally without round-tripping.
export function sortByPriority(orders) {
  return [...orders].sort((a, b) => {
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
}

// Persist a new manual ordering. `updates` = [{ id, priority_rank }].
// Per-row update by id (UUID PK) — works for manual orders that have a
// null kwitasie_nr.
export async function setOrderRanks(updates) {
  if (!updates || updates.length === 0) return
  for (const u of updates) {
    const { error } = await supabase
      .from('orders')
      .update({ priority_rank: u.priority_rank })
      .eq('id', u.id)
    if (error) throw new Error(`Update ranks: ${error.message}`)
  }
}

// Clear manual ranks for every order in a list (back to pure CR sort).
// `orderIds` is an array of order.id UUIDs.
export async function resetWeekRanks(orderIds) {
  if (!orderIds || orderIds.length === 0) return
  const { error } = await supabase
    .from('orders')
    .update({ priority_rank: null })
    .in('id', orderIds)
  if (error) throw new Error(`Reset ranks: ${error.message}`)
}

// Load every order for a department (or all), enriched with product name,
// derived CR, bottleneck minutes, and a colour band. The returned list is
// sorted by CR ascending (most urgent first), tiebreaker bottleneck minutes
// descending. Also returns a summary of weeks present for tab rendering.
//
// `dept` is the PriorityScreen tab id ('all' | 'steel' | 'wood' | 'uphol' | 'disp').
export async function loadPriority(dept, today = new Date()) {
  // 1. Orders ----------------------------------------------------------------
  let q = supabase
    .from('orders')
    .select('kwitasie_nr, qty, product_code, customer_code, department, due_date, prod_week, prod_day, send_week, send_day, description, priority_rank, ord_nr, "group", wood_type, notes')
  const dbDept = DEPT_TAB_TO_DB[dept]
  if (dbDept) q = q.eq('department', dbDept)
  const { data: ordRows, error } = await q
  if (error) throw new Error(`Load orders: ${error.message}`)
  const orders = ordRows || []

  // 2. Product names ---------------------------------------------------------
  const codes = [...new Set(orders.map((o) => o.product_code).filter(Boolean))]
  let productNameByCode = new Map()
  if (codes.length) {
    const { data: prods, error: pErr } = await supabase
      .from('products').select('code, description').in('code', codes)
    if (pErr) throw new Error(`Load products: ${pErr.message}`)
    productNameByCode = new Map((prods || []).map((p) => [p.code, p.description || p.code]))
  }

  // 3. Routings + config (for CR computation) --------------------------------
  // Both can fail in partially-set-up projects; we degrade gracefully — orders
  // without routings simply get cr = null and render as "—".
  let routings = new Map()
  let config = { holidays: new Set(), bufferDaysByDept: new Map() }
  try {
    [routings, config] = await Promise.all([
      fetchRoutings(codes),
      loadScheduleConfig(),
    ])
  } catch (e) {
    console.warn('[priority] schedule config / routing fetch failed, CR will be best-effort:', e.message)
  }

  // 4. Enrich ----------------------------------------------------------------
  // CR's "time-to-dispatch" walks against the Send date (the planned ship day),
  // not the customer's Due date. Due is a separate commitment we flag in the UI.
  const enriched = orders.map((o) => {
    const routing = routings.get(o.product_code) || []
    const { bottleneck, totalMinutes } = bottleneckMinutes(routing, o.qty || 0)
    const ttp = totalMinutes > 0 ? minutesToWorkDays(totalMinutes) : null
    const sendStr = orderSendDate(o)
    const ttd = sendStr ? workDaysUntil(sendStr, config.holidays, today) : null
    const cr = (ttp != null && ttd != null) ? ttd / ttp : null
    return {
      kwitasie_nr: o.kwitasie_nr,
      product_code: o.product_code,
      product_name: productNameByCode.get(o.product_code) || o.description || o.product_code,
      customer_code: o.customer_code,
      qty: o.qty,
      department: o.department,
      due_date: o.due_date,
      prod_week: o.prod_week,
      prod_day: o.prod_day,
      send_week: o.send_week,
      send_day: o.send_day,
      send_date: sendStr,
      priority_rank: o.priority_rank ?? null,
      ord_nr: o.ord_nr,
      group: o.group,
      wood_type: o.wood_type,
      notes: o.notes,
      bottleneck,
      total_minutes: totalMinutes,
      ttp_days: ttp,
      ttd_days: ttd,
      cr,
      cr_band: crBand(cr),
    }
  })

  // 5. Sort: manual ranks first (ascending), then unranked by CR asc with
  // bottleneck-minutes tiebreak. Manual ranks fully override CR per spec.
  enriched.sort((a, b) => {
    const aR = a.priority_rank
    const bR = b.priority_rank
    if (aR != null && bR != null) return aR - bR
    if (aR != null) return -1
    if (bR != null) return 1
    const aHas = a.cr != null && Number.isFinite(a.cr)
    const bHas = b.cr != null && Number.isFinite(b.cr)
    if (aHas !== bHas) return aHas ? -1 : 1
    if (aHas) {
      if (a.cr !== b.cr) return a.cr - b.cr
    }
    return (b.total_minutes || 0) - (a.total_minutes || 0)
  })

  // 6. Week summary for tabs -------------------------------------------------
  // Real ISO weeks first, then a synthetic "Unscheduled" tab for any order
  // that has no prod_week (typically because it has no parts/machine routing
  // — common for Other-group orders waiting to be mapped manually).
  const currentWeek = isoWeek(today)
  const weekCounts = new Map()
  let unscheduledCount = 0
  enriched.forEach((o) => {
    if (o.prod_week == null) { unscheduledCount++; return }
    weekCounts.set(o.prod_week, (weekCounts.get(o.prod_week) || 0) + 1)
  })
  const weeks = [...weekCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, count]) => ({
      num,
      label: wkLabel(num),
      count,
      isCurrent: num === currentWeek,
      isOverdue: num < currentWeek,
    }))
  if (unscheduledCount > 0) {
    weeks.push({ num: 'unscheduled', label: 'Unscheduled', count: unscheduledCount, isCurrent: false, isOverdue: false })
  }

  return { orders: enriched, weeks, currentWeek }
}
