import { supabase } from './supabase'

const SESSION_KEY = 'elmos.session.v1'

// LoginScreen uses 'dispatching'; DB stores 'dispatch'. Translate at boundary.
const LOGIN_DEPT_TO_DB = {
  steel: 'steel',
  wood: 'wood',
  upholstery: 'upholstery',
  dispatching: 'dispatch',
}

// Look up an employee that matches the PIN, role and selected department.
// Returns the session object on success, or null if no match. Throws only on
// network / schema errors. PINs are currently stored as plaintext text in the
// `employees` table — sufficient for an internal factory floor; switch to a
// hashing scheme if the app ever leaves the LAN.
export async function signIn({ dept, role, pin }) {
  if (!pin || String(pin).length < 4) return null
  const dbRole = role.charAt(0).toUpperCase() + role.slice(1) // boss -> Boss
  const dbDept = LOGIN_DEPT_TO_DB[dept] || dept

  const { data, error } = await supabase
    .from('employees')
    .select('id, name, role, departments')
    .eq('pin', String(pin))
    .eq('role', dbRole)
    .contains('departments', [dbDept])
    .maybeSingle()
  if (error) throw new Error(`Sign-in lookup: ${error.message}`)
  if (!data) return null

  const session = {
    id: data.id,
    name: data.name,
    role: data.role,
    departments: data.departments || [],
    activeDepartment: dbDept,
    signedInAt: Date.now(),
  }
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch {}
  return session
}

export function signOut() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Boss and Manager may edit. Worker (and unauthenticated viewers) are
// read-only. Call without args to read the live session, or pass an explicit
// role string to test against.
export function canEdit(role) {
  const r = role ?? getCurrentUser()?.role
  return r === 'Boss' || r === 'Manager'
}

// Friendly label for the DB department name. Used by Sidebar / chrome.
export function deptLabel(dbName) {
  switch (dbName) {
    case 'steel': return 'Steel Dept'
    case 'wood': return 'Wood Dept'
    case 'upholstery': return 'Upholstery Dept'
    case 'dispatch': return 'Dispatch Dept'
    default: return '—'
  }
}
