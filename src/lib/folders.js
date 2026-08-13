import { supabase } from './supabase'

// Folder CRUD + product→folder assignment. Folders are a flat list (no nesting)
// keyed by unique name; the Products screen groups products into accordions
// using folder_id.

export async function createFolder(name, department) {
  const clean = String(name ?? '').trim()
  if (!clean) throw new Error('Folder name is required')
  if (!department) throw new Error('Department is required')
  const { data, error } = await supabase
    .from('folders')
    .insert({ name: clean, department })
    .select('id, name, department, created_at')
    .single()
  if (error) throw new Error(`Creating folder: ${error.message}`)
  return data
}

// updateFolder({ name?, department? }) — patches one or both fields.
export async function updateFolder(id, patch) {
  if (!id) throw new Error('Folder id is required')
  const body = {}
  if (patch.name !== undefined) {
    const clean = String(patch.name).trim()
    if (!clean) throw new Error('Folder name is required')
    body.name = clean
  }
  if (patch.department !== undefined) body.department = patch.department
  if (Object.keys(body).length === 0) return null
  const { data, error } = await supabase
    .from('folders')
    .update(body)
    .eq('id', id)
    .select('id, name, department, created_at')
    .single()
  if (error) throw new Error(`Updating folder: ${error.message}`)
  return data
}

// Deleting a folder doesn't delete its products — folder_id is set to null
// (ON DELETE SET NULL in the migration). Products land in the "Unfiled" group.
export async function deleteFolder(id) {
  if (!id) throw new Error('Folder id is required')
  const { error } = await supabase.from('folders').delete().eq('id', id)
  if (error) throw new Error(`Deleting folder: ${error.message}`)
}

export async function moveProductToFolder(productId, folderId) {
  if (!productId) throw new Error('Product id is required')
  const { error } = await supabase
    .from('products')
    .update({ folder_id: folderId || null })
    .eq('id', productId)
  if (error) throw new Error(`Moving product: ${error.message}`)
}
