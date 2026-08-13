import { useCallback, useState } from 'react'

// Per-screen department tab selection.
//
// Every screen used to keep its active department in a plain useState with a
// hardcoded default ('steel' on most, 'all' on a few). That local state is
// thrown away whenever the screen component unmounts — which happens on ANY
// in-app action that routes away and comes back (e.g. the wood "Start" button
// opens the MES Station, then returns to /schedule; a fresh mount ran
// useState('steel') again and snapped the user off Wood and back to Steel).
//
// This hook fixes two things at once:
//   1. It persists the choice in sessionStorage keyed per screen, so an action
//      round-trip (MES Station, import, reschedule → back) keeps you on the
//      department you were working in — no more jumping to Steel.
//   2. It defaults to 'all' so a screen shown for the first time opens on
//      "All Depts", not a specific department.
//
// Opening a screen fresh from the left nav bar should still reset to "All
// Depts". The Sidebar calls clearDeptTabs() on every nav click to wipe these
// keys, so a sidebar navigation starts clean while an action round-trip (which
// never touches the sidebar) preserves the selection.
const PREFIX = 'pf:dept:'

// The Schedule screen remembers what the operator was looking at across an MES
// Station round-trip: which DAY and which MACHINE. On remount the screen would
// otherwise snap back to today + collapsed cards + top of page. We stash
// { view: 'steel' | 'wood', key, date } here on the Start action and, on a fresh
// Schedule mount, restore the same day, re-expand that machine's card, and
// scroll it into view.
//   - `key`  : machine id on the steel board, machine NAME on the wood board
//              (that's what each board keys its open-cards set + data-schedmc by).
//   - `date` : the viewed calendar day as YYYY-MM-DD, so both boards come back to
//              the exact day being worked, not today.
// Cleared on nav-bar open (below) so opening Schedule from the sidebar still
// starts on today at the top.
export const SCHEDULE_FOCUS_KEY = 'pf:schedule:focus'

export function readScheduleFocus() {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_FOCUS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeScheduleFocus(view, key, date) {
  try { sessionStorage.setItem(SCHEDULE_FOCUS_KEY, JSON.stringify({ view, key, date })) } catch { /* ignore */ }
}

export function clearScheduleFocus() {
  try { sessionStorage.removeItem(SCHEDULE_FOCUS_KEY) } catch { /* ignore */ }
}

export function useDeptTab(key, initial = 'all') {
  const storageKey = PREFIX + key
  const [dept, setDeptState] = useState(() => {
    try {
      const v = sessionStorage.getItem(storageKey)
      return v != null ? v : initial
    } catch {
      return initial
    }
  })
  const setDept = useCallback((next) => {
    setDeptState((prev) => {
      const val = typeof next === 'function' ? next(prev) : next
      try { sessionStorage.setItem(storageKey, val) } catch { /* ignore */ }
      return val
    })
  }, [storageKey])
  return [dept, setDept]
}

// Wipe every stored department tab so screens re-open on their default ('all').
// Called by the Sidebar on nav click so opening a window from the left nav bar
// always starts on "All Depts".
export function clearDeptTabs() {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
    sessionStorage.removeItem(SCHEDULE_FOCUS_KEY)
  } catch {
    /* ignore */
  }
}
