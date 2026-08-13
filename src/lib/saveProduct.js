import { supabase } from './supabase'

const STEP_COLS = 'id, part_id, sequence, machine_name, alt_machine_names, seconds_per_part, setup_time, wood_day_offset'
const STEP_COLS_LEGACY = 'id, part_id, sequence, machine_name, alt_machine_names, seconds_per_part, setup_time'

// Insert machine_steps, tolerating a database that hasn't run migration 024 yet
// (no wood_day_offset column). On that specific failure we strip the field and
// retry so product saves keep working before the migration lands.
async function insertMachineSteps(stepRows) {
  let res = await supabase.from('machine_steps').insert(stepRows).select(STEP_COLS)
  if (res.error && /wood_day_offset/.test(res.error.message || '')) {
    const stripped = stepRows.map((r) => { const c = { ...r }; delete c.wood_day_offset; return c })
    res = await supabase.from('machine_steps').insert(stripped).select(STEP_COLS_LEGACY)
  }
  return res
}

// createProductWithParts({ ... }) — single entry point used by the Products
// screen's "Add New Product" form. Inserts a products row, then its parts,
// then a flat list of machine_steps keyed by part. If parts/steps fail we
// roll back the product row so a half-saved product never lingers.
//
// Shape:
//   {
//     code, description,            // required
//     abbreviations,                // string[]
//     default_priority,             // 1-9, defaults to 5
//     department,                   // 'steel' | 'wood' | 'upholstery' | 'dispatch'
//                                   //   For multi-dept products this is the
//                                   //   first tab added (legacy products.department
//                                   //   column stays for folder/badge backward-
//                                   //   compat; aggregated depts come from
//                                   //   parts.department via deptsByCode).
//     group,                        // optional Group label
//     folder_id,                    // optional FK to folders
//     parts: [
//       {
//         name, qty_per_unit, part_priority, is_assembly,
//         department,               // each part lives on one dept tab; falls
//                                   //   back to the product's department if
//                                   //   the caller forgets to set it.
//         material_code, length, width, thickness,
//         steps: [{ machine_name, seconds_per_part, setup_time }, ...]
//       },
//       ...
//     ]
//   }
export async function createProductWithParts({
  code, description, abbreviations = [], default_priority = 5,
  department, group = null, folder_id = null,
  is_dispatch_only = false,
  parts = [],
}) {
  const cleanCode = String(code ?? '').trim()
  const cleanDesc = String(description ?? '').trim()
  if (!cleanCode) throw new Error('Product code is required')
  if (!cleanDesc) throw new Error('Product name is required')
  if (!department) throw new Error('Department is required')

  const cleanAbbr = (abbreviations || [])
    .map((a) => String(a ?? '').trim())
    .filter(Boolean)

  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({
      code: cleanCode,
      description: cleanDesc,
      abbreviations: cleanAbbr,
      default_priority,
      department,
      group,
      folder_id,
      is_dispatch_only: !!is_dispatch_only,
    })
    .select('id, code, description, department, default_priority, abbreviations, folder_id, "group", is_dispatch_only')
    .single()
  if (pErr) throw new Error(`Creating product: ${pErr.message}`)

  // Drop blank names, then dedupe by name — the DB has a unique
  // constraint on (product_id, name) and a duplicate would otherwise reject
  // the whole insert. Keep the first occurrence (the user's original entry)
  // and silently drop later ones; the form-side Copy/Sync flows pre-warn
  // about skipped names, this is a defensive net for any other path.
  const seenNames = new Set()
  const cleanParts = (parts || [])
    .map((pt) => ({ ...pt, name: String(pt.name ?? '').trim() }))
    .filter((pt) => {
      if (!pt.name) return false
      if (seenNames.has(pt.name)) return false
      seenNames.add(pt.name)
      return true
    })

  if (cleanParts.length === 0) return product

  const partRows = cleanParts.map((pt) => ({
    product_id: product.id,
    name: pt.name,
    qty_per_unit: Number(pt.qty_per_unit) || 1,
    part_priority: Number(pt.part_priority) || 1,
    is_assembly: !!pt.is_assembly,
    department: pt.department || department,
    material_code: pt.material_code || null,
    length: pt.length != null && pt.length !== '' ? Number(pt.length) : null,
    width: pt.width != null && pt.width !== '' ? Number(pt.width) : null,
    thickness: pt.thickness != null && pt.thickness !== '' ? Number(pt.thickness) : null,
  }))

  const { data: insertedParts, error: ptErr } = await supabase
    .from('parts')
    .insert(partRows)
    .select('id, product_id, name, qty_per_unit, length, width, thickness, material_code, part_priority, is_assembly, department')
  if (ptErr) {
    await supabase.from('products').delete().eq('id', product.id)
    throw new Error(`Creating parts: ${ptErr.message}`)
  }

  // Map step rows back to parts by index — Supabase returns inserted rows in
  // the same order they were sent, which is the order in cleanParts.
  const stepRows = []
  cleanParts.forEach((pt, i) => {
    const inserted = insertedParts[i]
    if (!inserted) return
    const validSteps = (pt.steps || []).filter((s) => s.machine_name)
    validSteps.forEach((s, idx) => {
      // Pool members: machine_name (primary) plus any alts. Strip blanks and
      // any alt that duplicates the primary so the array stays clean.
      const altMachines = Array.isArray(s.alt_machine_names) ? s.alt_machine_names : []
      const cleanAlts = altMachines
        .map((m) => String(m ?? '').trim())
        .filter((m) => m && m !== s.machine_name)
      stepRows.push({
        part_id: inserted.id,
        sequence: idx + 1,
        machine_name: s.machine_name,
        alt_machine_names: cleanAlts,
        seconds_per_part: Number(s.seconds_per_part) || 0,
        setup_time: Number(s.setup_time) || 0,
        // Wood conveyor v3: null = auto (compressed machine rank); a number pins
        // this step to that day-offset. Only meaningful for wood steps.
        wood_day_offset:
          s.wood_day_offset != null && s.wood_day_offset !== ''
            ? Number(s.wood_day_offset)
            : null,
      })
    })
  })

  let insertedSteps = []
  if (stepRows.length > 0) {
    const { data, error: msErr } = await insertMachineSteps(stepRows)
    if (msErr) {
      await supabase.from('products').delete().eq('id', product.id)
      throw new Error(`Creating machine steps: ${msErr.message}`)
    }
    insertedSteps = data || []
  }

  return { product, parts: insertedParts || [], steps: insertedSteps }
}

// updateProductWithParts({ id, ... }) — patches the product row, then does a
// destructive replace of its parts/machine_steps (delete all → re-insert).
// Parts/steps have no inbound FKs outside the machine_steps cascade, so the
// replace is safe and keeps the code path identical to create. The product
// row itself stays so orders/schedule referencing it keep working.
//
// products.code uses ON UPDATE CASCADE, so renaming the code propagates to
// orders.product_code automatically.
export async function updateProductWithParts({
  id, code, description, abbreviations = [], default_priority = 5,
  department, group = null, folder_id = null,
  is_dispatch_only = false,
  parts = [],
}) {
  if (!id) throw new Error('Product id is required')
  const cleanCode = String(code ?? '').trim()
  const cleanDesc = String(description ?? '').trim()
  if (!cleanCode) throw new Error('Product code is required')
  if (!cleanDesc) throw new Error('Product name is required')
  if (!department) throw new Error('Department is required')

  const cleanAbbr = (abbreviations || [])
    .map((a) => String(a ?? '').trim())
    .filter(Boolean)

  const { data: updatedProduct, error: pErr } = await supabase
    .from('products')
    .update({
      code: cleanCode,
      description: cleanDesc,
      abbreviations: cleanAbbr,
      default_priority,
      department,
      group,
      folder_id,
      is_dispatch_only: !!is_dispatch_only,
    })
    .eq('id', id)
    .select('id, code, description, "group", department, default_priority, folder_id, abbreviations, is_dispatch_only')
    .single()
  if (pErr) throw new Error(`Updating product: ${pErr.message}`)

  const { error: delErr } = await supabase.from('parts').delete().eq('product_id', id)
  if (delErr) throw new Error(`Clearing existing parts: ${delErr.message}`)

  // Drop blank names, then dedupe by name — the DB has a unique
  // constraint on (product_id, name) and a duplicate would otherwise reject
  // the whole insert. Keep the first occurrence (the user's original entry)
  // and silently drop later ones; the form-side Copy/Sync flows pre-warn
  // about skipped names, this is a defensive net for any other path.
  const seenNames = new Set()
  const cleanParts = (parts || [])
    .map((pt) => ({ ...pt, name: String(pt.name ?? '').trim() }))
    .filter((pt) => {
      if (!pt.name) return false
      if (seenNames.has(pt.name)) return false
      seenNames.add(pt.name)
      return true
    })

  if (cleanParts.length === 0) return { product: updatedProduct, parts: [], steps: [] }

  const partRows = cleanParts.map((pt) => ({
    product_id: id,
    name: pt.name,
    qty_per_unit: Number(pt.qty_per_unit) || 1,
    part_priority: Number(pt.part_priority) || 1,
    is_assembly: !!pt.is_assembly,
    department: pt.department || department,
    material_code: pt.material_code || null,
    length: pt.length != null && pt.length !== '' ? Number(pt.length) : null,
    width: pt.width != null && pt.width !== '' ? Number(pt.width) : null,
    thickness: pt.thickness != null && pt.thickness !== '' ? Number(pt.thickness) : null,
  }))

  const { data: insertedParts, error: ptErr } = await supabase
    .from('parts')
    .insert(partRows)
    .select('id, product_id, name, qty_per_unit, length, width, thickness, material_code, part_priority, is_assembly, department')
  if (ptErr) throw new Error(`Creating parts: ${ptErr.message}`)

  const stepRows = []
  cleanParts.forEach((pt, i) => {
    const inserted = insertedParts[i]
    if (!inserted) return
    const validSteps = (pt.steps || []).filter((s) => s.machine_name)
    validSteps.forEach((s, idx) => {
      // Pool members: machine_name (primary) plus any alts. Strip blanks and
      // any alt that duplicates the primary so the array stays clean.
      const altMachines = Array.isArray(s.alt_machine_names) ? s.alt_machine_names : []
      const cleanAlts = altMachines
        .map((m) => String(m ?? '').trim())
        .filter((m) => m && m !== s.machine_name)
      stepRows.push({
        part_id: inserted.id,
        sequence: idx + 1,
        machine_name: s.machine_name,
        alt_machine_names: cleanAlts,
        seconds_per_part: Number(s.seconds_per_part) || 0,
        setup_time: Number(s.setup_time) || 0,
        // Wood conveyor v3: null = auto (compressed machine rank); a number pins
        // this step to that day-offset. Only meaningful for wood steps.
        wood_day_offset:
          s.wood_day_offset != null && s.wood_day_offset !== ''
            ? Number(s.wood_day_offset)
            : null,
      })
    })
  })

  let insertedSteps = []
  if (stepRows.length > 0) {
    const { data, error: msErr } = await insertMachineSteps(stepRows)
    if (msErr) throw new Error(`Creating machine steps: ${msErr.message}`)
    insertedSteps = data || []
  }

  return { product: updatedProduct, parts: insertedParts || [], steps: insertedSteps }
}

// Hard-delete a single product. Cascade kills parts and machine_steps; orders
// referencing this product code will block the delete with an FK violation —
// surface that error to the user rather than silently swallowing it.
export async function deleteProduct(id) {
  if (!id) throw new Error('Product id is required')
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw new Error(`Deleting product: ${error.message}`)
}
