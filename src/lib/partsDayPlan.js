// Per-day part manufacturing PLAN, per department: the manual order the shop
// makes parts in ("Sort parts for the day"), plus parts dropped from that day.
//
// The boss picks a day, drags the day's parts into the order they should be made
// (1 = start first / enter the factory first), and can remove a part that
// shouldn't be made that day. Steel and wood each have their own plan. The
// wood day-board and the steel schedule both read this so their sequence +
// contents match what was set.
//
// Storage: browser localStorage, keyed by department + date.
//   partKey = `${orderId}:${partId}`.

const ORDER_PREFIX = (dept) => `pf_parts_order:${dept}:`
const REMOVED_PREFIX = (dept) => `pf_parts_removed:${dept}:`
export const PARTS_DAY_EVENT = 'pf-parts-day-change'

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PARTS_DAY_EVENT))
}

// ---------- manual order (ranks) ----------
export function loadDayOrder(dept, dateStr) {
  try {
    const raw = localStorage.getItem(ORDER_PREFIX(dept) + dateStr)
    return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map()
  } catch {
    return new Map()
  }
}

export function saveDayOrder(dept, dateStr, ranksByKey) {
  try {
    const obj = ranksByKey instanceof Map ? Object.fromEntries(ranksByKey) : (ranksByKey || {})
    localStorage.setItem(ORDER_PREFIX(dept) + dateStr, JSON.stringify(obj))
  } catch { /* ignore */ }
  announce()
}

export function clearDayOrder(dept, dateStr) {
  try { localStorage.removeItem(ORDER_PREFIX(dept) + dateStr) } catch { /* ignore */ }
  announce()
}

// ---------- parts removed from a day ----------
export function loadDayRemoved(dept, dateStr) {
  try {
    const raw = localStorage.getItem(REMOVED_PREFIX(dept) + dateStr)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function setDayPartRemoved(dept, dateStr, partKey, removed) {
  const set = loadDayRemoved(dept, dateStr)
  if (removed) set.add(partKey); else set.delete(partKey)
  try { localStorage.setItem(REMOVED_PREFIX(dept) + dateStr, JSON.stringify([...set])) } catch { /* ignore */ }
  announce()
}

// ---------- all day-plans for a department (for the engines / schedule) ----------
// Returns Map<dateStr, { ranks: Map<partKey,rank>, removed: Set<partKey> }>.
export function loadAllDayPlans(dept) {
  const oPrefix = ORDER_PREFIX(dept)
  const rPrefix = REMOVED_PREFIX(dept)
  const map = new Map()
  const plan = (d) => {
    if (!map.has(d)) map.set(d, { ranks: new Map(), removed: new Set() })
    return map.get(d)
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith(oPrefix)) {
        plan(k.slice(oPrefix.length)).ranks = new Map(Object.entries(JSON.parse(localStorage.getItem(k) || '{}')))
      } else if (k.startsWith(rPrefix)) {
        plan(k.slice(rPrefix.length)).removed = new Set(JSON.parse(localStorage.getItem(k) || '[]'))
      }
    }
  } catch { /* ignore */ }
  return map
}
