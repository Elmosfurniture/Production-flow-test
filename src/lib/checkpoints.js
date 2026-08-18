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

// tracking      — result of buildOrderTracking() for one order
// machineByName — Map<name, machine row> from useAppData lookups
//
// Returns [{ name, done, total, complete, order }] sorted along the flow.
export function buildOrderCheckpoints({ tracking, machineByName }) {
  if (!tracking?.parts?.length || !machineByName) return []

  // checkpoint name → { order, parts: Map<partId, { steps, doneSteps }> }
  const groups = new Map()

  for (const pt of tracking.parts) {
    for (const sv of pt.steps) {
      // Prefer the machine the dispatcher actually assigned (alt pools mean
      // it can differ from the step's primary machine_name).
      const machineName = sv.assignedMachineName || sv.step.machine_name
      const machine = machineByName.get(machineName)
      const name = (machine?.checkpoint || '').trim()
      if (!name) continue

      let g = groups.get(name)
      if (!g) {
        g = { name, order: Number.POSITIVE_INFINITY, parts: new Map() }
        groups.set(name, g)
      }
      const pos = machine.display_order ?? 0
      if (pos < g.order) g.order = pos

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

// Distinct checkpoint names already in use, optionally scoped to one
// department. Feeds the Machines screen datalist so a second machine joins an
// existing group by picking the name instead of retyping (and mistyping) it.
export function checkpointNames(machines, department = null) {
  const set = new Set()
  for (const m of (machines || [])) {
    if (department && m.department !== department) continue
    const c = (m.checkpoint || '').trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
