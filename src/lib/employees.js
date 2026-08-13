import { supabase } from './supabase'

const SELECT = 'id, name, role, departments, pin'

export async function listEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select(SELECT)
    .order('name', { ascending: true })
  if (error) throw new Error(`Listing employees: ${error.message}`)
  return data || []
}

export async function addEmployee({ name, role, departments, pin }) {
  const cleanName = String(name || '').trim()
  if (!cleanName) throw new Error('Employee name is required')
  if (!role) throw new Error('Role is required')
  const payload = {
    name: cleanName,
    role,
    departments: Array.isArray(departments) ? departments : [],
    pin: pin ? String(pin) : null,
  }
  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select(SELECT)
    .single()
  if (error) throw new Error(`Adding employee: ${error.message}`)
  return data
}

// `patch` may include any of { name, role, departments, pin }.
// Pass pin: null to clear; omit pin to leave unchanged.
export async function updateEmployee(id, patch) {
  if (!id) throw new Error('Employee id is required')
  const clean = { ...patch }
  if (clean.name != null) clean.name = String(clean.name).trim()
  if (clean.pin === '') clean.pin = null
  const { data, error } = await supabase
    .from('employees')
    .update(clean)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(`Updating employee: ${error.message}`)
  return data
}

export async function deleteEmployee(id) {
  if (!id) throw new Error('Employee id is required')
  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) throw new Error(`Deleting employee: ${error.message}`)
}
