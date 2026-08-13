import { supabase } from './supabase'

// Canonical Steel-department machine list. Seeded into the `machines` table by
// seedMachines(); duplicates (by name+department) are skipped.
export const STEEL_MACHINES = [
  'Chamfer',
  'Cut-Off CSM',
  'Cut-Off SLS',
  'Drill Press Manual',
  'Drill Semi Auto 2 bit',
  'Grinders Manual',
  'Ironworker',
  'Robot Welder 1400',
  'Robot Welder 1600',
  'Sander Horizontal',
  'Sander Orbital Steel',
  'Sander Osilating',
  'Spray Paint',
  'Swage Semi Auto',
  'Tube Bender E-Turn 32',
  'Tube Bender E-Turn 40',
  'Tube End Closing',
  'Tube Laser M-Rise',
  'Welder Arrie',
  'Welder Dino',
  'Welder Francis',
  'Welder Jeff',
  'Welder Kelvin',
]

// Canonical Wood-department machine list (Roberto's dept — CNC, saws, sanders,
// clamps, assembly stations, etc.).
export const WOOD_MACHINES = [
  'Band Saw Centauro',
  'Band Saw Duplex',
  'Chair Assembly 1',
  'Chair Assembly 2',
  'Clamp A frame',
  'Clamp Book',
  'Clamp Taylor 12',
  'Clamp Taylor 6',
  'Clamp Vertical',
  'CNC Biese Klever 1',
  'CNC Biese Klever 2',
  'CNC Double Jet',
  'CNC Sharp',
  'CNC Sintisi',
  'CNC Venture 2',
  'Furn Assembly 1',
  'Furn Assembly 2',
  'Lathe Intorex',
  'Linear Shaper FC4',
  'Linear Shaper FC6',
  'Moulder Unimat 500',
  'Planer Surface',
  'Putklamp',
  'Sander Edge Sander',
  'Sander Lathe',
  'Sander Orbital 150 Manual',
  'Sander Orbital 150 Semi Auto',
  'Sander Orbital 200 Semi Auto',
  'Sander Prep',
  'Sander Sanding Line',
  'Sander Top & Bot 2C2L',
  'Sander Vertical',
  'Sander Waterfall',
  'Sander Widebelts SCM',
  'Sander Widebelts Viet',
  'Sanding Manual',
  'Saw Cut-off T350',
  'Saw Double Cut-Off Friulmac',
  'Saw Panel Saw',
  'Saw Straight Line 1',
  'Saw Straight Line 2',
  'Saw Straight Line 3',
  'Saw Up Cut',
  'Saw Up Cut Tigerstop',
  'Saw Wintersteiger',
  'Seat Shaper',
  'Tenoner TSD',
  'Top & Bottom (L)',
  'Top & Bottom (S)',
]

// Look up a machine by (name, department); if absent, insert and return it.
// `extra` may include optional columns (color, area, bottleneck) — only
// included in the payload if the caller passed them, so seedMachines() can
// continue to work even when those columns are absent.
// Returns { row, inserted } so callers can count added vs skipped.
async function insertIfMissing(name, department, extra = {}) {
  const { data: existing, error: selErr } = await supabase
    .from('machines')
    .select('id, name, department')
    .eq('name', name)
    .eq('department', department)
    .maybeSingle()
  if (selErr) throw new Error(`Looking up machine "${name}" (${department}): ${selErr.message}`)
  if (existing) return { row: existing, inserted: false }

  const payload = { name, department }
  if (extra.color != null) payload.color = extra.color
  if (extra.area != null) payload.area = extra.area
  if (extra.bottleneck != null) payload.bottleneck = extra.bottleneck
  if (extra.setup_time_min != null) payload.setup_time_min = Math.max(0, Number(extra.setup_time_min) || 0)
  if (extra.wood_day != null) payload.wood_day = Math.max(0, Math.min(4, Number(extra.wood_day) || 0))

  const { data, error } = await supabase
    .from('machines')
    .insert(payload)
    .select('id, name, department')
    .single()
  if (error) throw new Error(`Inserting machine "${name}" (${department}): ${error.message}`)
  return { row: data, inserted: true }
}

// Seed all known machines for every department. Idempotent.
// onProgress({ current, total, name, department }) fires after each row.
export async function seedMachines(onProgress = () => {}) {
  const result = {
    steel: { added: 0, skipped: 0 },
    wood: { added: 0, skipped: 0 },
  }
  const plan = [
    ...STEEL_MACHINES.map(name => ({ name, department: 'steel' })),
    ...WOOD_MACHINES.map(name => ({ name, department: 'wood' })),
  ]
  let processed = 0
  for (const m of plan) {
    const { inserted } = await insertIfMissing(m.name, m.department)
    if (inserted) result[m.department].added++
    else result[m.department].skipped++
    processed++
    onProgress({ current: processed, total: plan.length, name: m.name, department: m.department })
  }
  return result
}

// Add a single machine from the UI (e.g. Machines screen "Add Machine" form).
// `opts` may include { area, color, bottleneck }. New machines are appended
// to the bottom of their department's drag-ordered list (display_order =
// current max + 10).
// If a machine with the same (name, department) already exists, returns the
// existing row rather than inserting a duplicate. After insert, re-fetches
// the rich row (including area/color/bottleneck/active) for the UI to render.
export async function addMachine(name, department, opts = {}) {
  const cleanName = String(name ?? '').trim()
  if (!cleanName) throw new Error('Machine name is required')
  if (!department) throw new Error('Department is required')
  const { row, inserted } = await insertIfMissing(cleanName, department, opts)
  if (!inserted) return row
  // Append to the bottom of the dept's ordering. Fetched after insert so the
  // freshly-added row isn't counted in the max.
  const { data: maxRow } = await supabase
    .from('machines')
    .select('display_order')
    .eq('department', department)
    .neq('id', row.id)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPos = ((maxRow?.display_order ?? 0) || 0) + 10
  await supabase.from('machines').update({ display_order: nextPos }).eq('id', row.id)
  const { data, error } = await supabase
    .from('machines')
    .select('id, name, department, color, area, bottleneck, active, display_order, setup_time_min, rate_per_hour, wood_day')
    .eq('id', row.id)
    .single()
  if (error) return row
  return data
}

// Rewrite display_order for a list of machines in the order given. Used by
// the Machines screen's drag-to-reorder. Positions are multiples of 10 so a
// later drag-in-between only needs to touch one row instead of renumbering
// the neighbours.
export async function reorderMachines(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return
  const updates = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('machines').update({ display_order: (i + 1) * 10 }).eq('id', id),
    ),
  )
  const failed = updates.find((r) => r.error)
  if (failed) throw new Error(`Reordering machines: ${failed.error.message}`)
}

// Patch one machine. `patch` is a partial machines row
// (e.g. { name, color, area, bottleneck }). Returns the updated row.
export async function updateMachine(id, patch) {
  if (!id) throw new Error('Machine id is required')
  const { data, error } = await supabase
    .from('machines')
    .update(patch)
    .eq('id', id)
    .select('id, name, department, color, area, bottleneck, active, display_order, setup_time_min, rate_per_hour, wood_day')
    .single()
  if (error) throw new Error(`Updating machine: ${error.message}`)
  return data
}

export async function deleteMachine(id) {
  if (!id) throw new Error('Machine id is required')
  const { error } = await supabase.from('machines').delete().eq('id', id)
  if (error) throw new Error(`Deleting machine: ${error.message}`)
}
