import { useEffect, useState } from 'react'

// App-wide light/dark theme. Persisted to localStorage and applied to the
// document body (CSS variables in each screen react via the `[data-theme="dark"]`
// selector). Module-level singleton + pub-sub keeps every mounted component
// in sync without a context provider.

const KEY = 'elmos.theme.v1'

function readInitial() {
  if (typeof window === 'undefined') return 'light'
  try {
    const v = window.localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // localStorage blocked — fall through to default.
  }
  return 'light'
}

function applyToBody(theme) {
  if (typeof document !== 'undefined') {
    document.body.dataset.theme = theme
  }
}

let current = readInitial()
let listeners = []

applyToBody(current)

function setGlobal(next) {
  if (next !== 'light' && next !== 'dark') return
  if (next === current) return
  current = next
  try { window.localStorage.setItem(KEY, next) } catch {}
  applyToBody(next)
  for (const l of listeners) l(next)
}

export function useTheme() {
  const [theme, setLocal] = useState(current)
  useEffect(() => {
    const listener = (t) => setLocal(t)
    listeners.push(listener)
    return () => { listeners = listeners.filter((l) => l !== listener) }
  }, [])
  return {
    theme,
    isDark: theme === 'dark',
    setTheme: setGlobal,
    toggle: () => setGlobal(current === 'dark' ? 'light' : 'dark'),
  }
}
