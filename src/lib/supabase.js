import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
}

const rawClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

// ============================================================
// Local sandbox mode  (test without touching the LIVE database)
// ============================================================
// When sandbox mode is ON, reads pass straight through but every write —
// insert / update / upsert / delete — is intercepted and *simulated locally*
// (nothing hits the network; a refresh discards it). This protects the live DB.
//
// Safety by database: the TEST project is a full copy you're meant to write to,
// so sandbox defaults OFF there (edits persist). On ANY OTHER database (e.g.
// the live/prod one) in dev, sandbox defaults ON so writes can't reach the real
// data by accident. The flag is stored per-database in localStorage, so the two
// never share a setting, and it's toggleable from the sidebar / window.setSandbox().
//
// The test project's ref — writes persist here.
const TEST_DB_REF = 'ykfcsotngkwvwqlrlcid'
const ON_TEST_DB = (supabaseUrl || '').includes(TEST_DB_REF)
const SB_KEY = `pf_sandbox_${ON_TEST_DB ? 'test' : 'live'}`

function readFlag() {
  try {
    const v = localStorage.getItem(SB_KEY)
    if (v !== null) return v === '1'
  } catch { /* no storage */ }
  // Default: OFF on the test DB (safe to persist); ON otherwise in dev.
  return ON_TEST_DB ? false : !!import.meta.env.DEV
}

let SANDBOX = readFlag()

export function isSandbox() { return SANDBOX }
// True when the app is pointed at the safe TEST copy (not the live database).
export function isTestDb() { return ON_TEST_DB }

export function setSandbox(on) {
  SANDBOX = !!on
  try { localStorage.setItem(SB_KEY, SANDBOX ? '1' : '0') } catch { /* private mode / no storage */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pf-sandbox-change', { detail: SANDBOX }))
  }
  console.warn(
    `[Supabase] Sandbox mode is now ${SANDBOX
      ? 'ON — writes stay LOCAL and are discarded on refresh (nothing sent to Supabase)'
      : 'OFF — writes will PERSIST to the LIVE database'}.`,
  )
  return SANDBOX
}

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])

function genId() {
  try { return crypto.randomUUID() } catch { return `sandbox-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
}

// Shape a plausible success payload for a simulated write, so callers that do
// `.select().single()` after an insert get a usable row (with an id) back and
// their optimistic cache update works.
function sandboxRows(method, payload) {
  if (method === 'delete') return []
  const arr = Array.isArray(payload) ? payload : (payload == null ? [] : [payload])
  if (method === 'update') return arr // echo the patch(es)
  // insert / upsert — ensure an id + created_at so cache keys exist.
  return arr.map((r) => ({
    id: (r && r.id) || genId(),
    created_at: (r && r.created_at) || new Date().toISOString(),
    ...(r || {}),
  }))
}

// A stand-in query builder that never touches the network. Chained methods
// (.eq, .in, .order, …) return itself; .single()/.maybeSingle() switch the
// result to a single row; awaiting it resolves to a success result.
function sandboxBuilder(table, method, payload) {
  let single = false
  // Captured from .eq('id', …) or .match({ id }). On an UPDATE the row id lives
  // in the filter, not the payload — so `.update(x).eq('id', id).select()
  // .single()` MUST echo the id back, or the caller can't match the row it just
  // edited and treats it as a brand-new insert (the "duplicate on edit" bug).
  let filterId
  let rows = null
  const getRows = () => {
    if (rows) return rows
    rows = sandboxRows(method, payload)
    if (method === 'update' && filterId !== undefined) {
      rows = rows.map((r) => (r && r.id == null ? { ...r, id: filterId } : r))
    }
    return rows
  }
  const result = () => ({ data: single ? (getRows()[0] ?? null) : getRows(), error: null, status: 200, statusText: 'OK (sandbox)' })
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej)
      if (prop === 'catch') return (rej) => Promise.resolve(result()).catch(rej)
      if (prop === 'finally') return (cb) => Promise.resolve(result()).finally(cb)
      if (prop === 'single' || prop === 'maybeSingle') return () => { single = true; return proxy }
      if (prop === 'eq') return (col, val) => { if (col === 'id') filterId = val; return proxy }
      if (prop === 'match') return (obj) => { if (obj && obj.id !== undefined) filterId = obj.id; return proxy }
      return () => proxy
    },
    apply() { return proxy },
  })
  return proxy
}

// Intercept from() so write entry points are simulated while sandbox is ON.
// Reads and everything else pass straight through to the real builder.
const rawFrom = rawClient.from.bind(rawClient)
rawClient.from = (table) => {
  const builder = rawFrom(table)
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (SANDBOX && typeof prop === 'string' && WRITE_METHODS.has(prop)) {
        return (payload) => sandboxBuilder(table, prop, payload)
      }
      const val = Reflect.get(target, prop, receiver)
      return typeof val === 'function' ? val.bind(target) : val
    },
  })
}

// Console convenience while testing.
if (typeof window !== 'undefined') {
  window.setSandbox = setSandbox
  window.isSandbox = isSandbox
}

export const supabase = rawClient

// Authentication methods
export const auth = {
  signUp: async (email, password) => {
    return supabase.auth.signUp({ email, password })
  },

  signIn: async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password })
  },

  signOut: async () => {
    return supabase.auth.signOut()
  },

  getCurrentUser: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user || null
  }
}
