// Labour costing — what one finished product costs in machine labour.
//
// For each part of the product, and each machine step that part goes through:
//   run cost   = (seconds_per_part × parts_per_unit) / 3600 × machine R/hour
//   setup cost = (setup_minutes / 60) × machine R/hour   (charged once per batch)
//
// Per-unit setup is the batch setup cost spread over `batchSize` units, so the
// per-unit total = run cost + (setup cost / batchSize).
//
// Machine rate comes from machines.rate_per_hour (migration 020). A step whose
// machine has no rate set contributes R0 and is reported in `missingRates` so
// the UI can warn that the figure is incomplete.

export function computeProductLabour({ parts, stepsByPart, machineByName, batchSize = 1 }) {
  let runCost = 0
  let setupCostBatch = 0
  const lines = []
  const missing = new Set()

  for (const part of (parts || [])) {
    const steps = stepsByPart.get(part.id) || []
    const partsPerUnit = part.qty_per_unit ?? 1
    for (const s of steps) {
      const machine = machineByName.get(s.machine_name)
      const rate = (machine && machine.rate_per_hour != null) ? Number(machine.rate_per_hour) : 0
      if (!machine || !rate) missing.add(s.machine_name || '—')

      const runSec = (s.seconds_per_part ?? 0) * partsPerUnit
      const stepRun = (runSec / 3600) * rate
      const setupMin = (s.setup_time && s.setup_time > 0) ? s.setup_time : (machine?.setup_time_min ?? 0)
      const stepSetupBatch = (setupMin / 60) * rate

      runCost += stepRun
      setupCostBatch += stepSetupBatch
      lines.push({
        partName: part.name,
        machineName: s.machine_name || '—',
        sequence: s.sequence ?? 0,
        partsPerUnit,
        secondsPerPart: s.seconds_per_part ?? 0,
        runSec,
        rate,
        runCost: stepRun,
        setupMin,
        setupCostBatch: stepSetupBatch,
        hasRate: !!(machine && rate),
      })
    }
  }

  const bs = batchSize > 0 ? batchSize : 1
  const setupPerUnit = setupCostBatch / bs
  const perUnit = runCost + setupPerUnit
  // Stable display order: by part, then step sequence.
  lines.sort((a, b) => (a.partName || '').localeCompare(b.partName || '') || a.sequence - b.sequence)

  return {
    perUnit,
    runCost,
    setupCostBatch,
    setupPerUnit,
    lines,
    missingRates: [...missing],
    hasMissing: missing.size > 0,
    hasSteps: lines.length > 0,
  }
}

// "R 12.34" — South African Rand, 2 decimals, thousands separators.
export function formatRand(n) {
  const v = Number.isFinite(n) ? n : 0
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
