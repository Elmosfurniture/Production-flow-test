// Per-item WOOD manufacturing-start (local test storage).
//
// A two-track item (steel + wood parts) starts its steel and wood work on
// DIFFERENT days — each department's start is walked back from the dispatch day
// by that department's own lead + buffer, so they almost never match.
//
// Where each start lives:
//   • STEEL start → the order's own prod_week/prod_day (what the steel Schedule
//     already reads — no steel engine change needed).
//   • WOOD start  → the auto wood track by default; a manual override is stored
//     here in localStorage (like the other wood test data) so it works without
//     touching the live DB. Moves to order_tracks when we go live.

const KEY = 'pf_wood_start_overrides'
export const WOOD_START_EVENT = 'pf-wood-start-change'
function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WOOD_START_EVENT))
}

// Map<orderId(string), { prod_week, prod_day }>
export function loadWoodStartOverrides() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw)))
  } catch {
    return new Map()
  }
}

function saveAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(map))) } catch { /* ignore */ }
}

export function setWoodStartOverride(orderId, prodWeek, prodDay) {
  if (!orderId || prodWeek == null || prodDay == null) return
  const map = loadWoodStartOverrides()
  map.set(String(orderId), { prod_week: prodWeek, prod_day: prodDay })
  saveAll(map)
  announce()
}

export function clearWoodStartOverride(orderId) {
  if (!orderId) return
  const map = loadWoodStartOverrides()
  if (map.delete(String(orderId))) { saveAll(map); announce() }
}

// Resolve an order's WOOD Day-0 start. Priority:
//   1. manual wood override (this file)
//   2. two-track item → the auto wood track (order.tracks 'wood')
//   3. else the order's own prod_week/prod_day (wood-only items keep it there)
// Returns { prod_week, prod_day } or null.
export function woodStartFor(order, overrides) {
  const ov = overrides?.get?.(String(order.id))
  if (ov && ov.prod_week != null) return { prod_week: ov.prod_week, prod_day: ov.prod_day }
  const touchesSteel = (order.touched_departments || []).includes('steel')
  if (touchesSteel) {
    const wt = (order.tracks || []).find((t) => t.department === 'wood')
    if (wt && wt.prod_week != null) return { prod_week: wt.prod_week, prod_day: wt.prod_day }
  }
  if (order.prod_week != null && order.prod_day != null) {
    return { prod_week: order.prod_week, prod_day: order.prod_day }
  }
  return null
}
