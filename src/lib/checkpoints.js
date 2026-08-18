// Manufacturing checkpoints.
//
// A checkpoint is a NAMED GROUP OF MACHINES, set per machine on the Machines
// screen (machines.checkpoint — e.g. every saw → "Cutting", every sander →
// "Sanding"). It answers one question on Tracking without expanding anything:
// how far through the factory is this order?
//
// Rules:
//   * A part COUNTS toward a checkpoint only if at least one of its machine
//     steps runs on a machine in that group. A leg that never visits Spray
//     Paint must not hold the Paint checkpoint open.
//   * A part PASSES the checkpoint once every one of its steps on that
//     group's machines is fully done (qty_done >= qty).
//   * The checkpoint is complete when every counted part has passed it.
//
// Display order comes from machines.display_order — the drag order on the
// Machines screen. The earliest machine in a group sets where that checkpoint
// sits in the flow, so cutting shows before sanding without a second column.

// The standard checkpoint set, offered as one-click pills on the Machines
// screen so the common groups are spelled the same on every machine. Listed in
// rough flow order, but this list does NOT drive the chip order on Tracking —
// that comes from machines.display_order, so a department that runs CNC before
// sanding still reads correctly. Typing a name that isn't here is still fine;
// it just becomes a custom group.
export const CHECKPOINT_PRESETS = [
  'Straight line',
  'Machining',
  'Sanding',
  'CNC',
  'Assembly',
  'Finishing',
]

// Clean a typed checkpoint name for storage: trim, collapse inner runs of
// whitespace, and snap to a preset's exact spelling when it matches
// case-insensitively — so "sanding" and "Sanding " both land in the one
// Sanding group instead of splitting it in three. Returns null for blank.
export function normalizeCheckpoint(value) {
  const clean = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!clean) return null
  const preset = CHECKPOINT_PRESETS.find((p) => p.toLowerCase() === clean.toLowerCase())
  return preset || clean
}

// tracking      — result of buildOrderTracking() for one order
// machineByName — Map<name, machine row> from useAppData lookups
//
// Returns [{ name, done, total, complete, order }] sorted along the flow.
export function buildOrderCheckpoints({ tracking, machineByName }) {
  if (!tracking?.parts?.length || !machineByName) return []

  // lowercased checkpoint name → { name, order, parts: Map<partId, {...}> }
  // Keyed case-insensitively so hand-typed variants from before the preset
  // pills existed ("sanding" / "Sanding") still read as one group. The label
  // shown is the spelling on the group's earliest machine.
  const groups = new Map()

  for (const pt of tracking.parts) {
    for (const sv of pt.steps) {
      // Prefer the machine the dispatcher actually assigned (alt pools mean
      // it can differ from the step's primary machine_name).
      const machineName = sv.assignedMachineName || sv.step.machine_name
      const machine = machineByName.get(machineName)
      const name = (machine?.checkpoint || '').trim()
      if (!name) continue

      const key = name.toLowerCase()
      let g = groups.get(key)
      if (!g) {
        g = { name, order: Number.POSITIVE_INFINITY, parts: new Map() }
        groups.set(key, g)
      }
      const pos = machine.display_order ?? 0
      if (pos < g.order) { g.order = pos; g.name = name }

      let p = g.parts.get(pt.part.id)
      if (!p) { p = { steps: 0, doneSteps: 0 }; g.parts.set(pt.part.id, p) }
      p.steps += 1
      if (sv.qty > 0 && sv.qty_done >= sv.qty) p.doneSteps += 1
    }
  }

  return [...groups.values()]
    .map((g) => {
      const total = g.parts.size
      let done = 0
      for (const p of g.parts.values()) if (p.doneSteps >= p.steps) done += 1
      return { name: g.name, done, total, complete: total > 0 && done >= total, order: g.order }
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name)))
}

// The pick-list for the Machines screen: the standard presets first (in flow
// order), then any custom names already in use, alphabetically. Scoped to one
// department when given. Picking from this list is how a second machine joins
// an existing group instead of starting a near-duplicate by retyping it.
export function checkpointNames(machines, department = null) {
  const seen = new Set(CHECKPOINT_PRESETS.map((p) => p.toLowerCase()))
  const custom = []
  for (const m of (machines || [])) {
    if (department && m.department !== department) continue
    const c = (m.checkpoint || '').trim()
    if (!c || seen.has(c.toLowerCase())) continue
    seen.add(c.toLowerCase())
    custom.push(c)
  }
  custom.sort((a, b) => a.localeCompare(b))
  return [...CHECKPOINT_PRESETS, ...custom]
}
