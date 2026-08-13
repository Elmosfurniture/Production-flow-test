// Live status for wood day-board jobs (local test storage).
//
// Wood jobs are computed by the wood engine, not persisted `schedule` rows, so
// there's nothing in the DB to mark started/done. This tracks each wood job's
// status on the device (like the other wood test data) so the boss can Start /
// Pause / Complete a part from the day-board and drive the MES timer — exactly
// like steel. Moves to real schedule rows when wood goes live.
//
// Key = `${orderId}::${stepId}::${dateStr}` (one machine step of one order on a
// given day). Value = { status, started_at, completed_at, qty_done }.

const KEY = 'pf_wood_job_status'
const EVT = 'pf-wood-job-status-change'

export function woodJobKeyOf(orderId, stepId, dateStr) {
  return `${orderId}::${stepId}::${dateStr}`
}

// Map<jobKey, { status, started_at, completed_at, qty_done }>
export function loadWoodJobStatus() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw)))
  } catch {
    return new Map()
  }
}

export function setWoodJobStatus(jobKey, patch) {
  if (!jobKey) return
  const map = loadWoodJobStatus()
  const prev = map.get(jobKey) || {}
  map.set(jobKey, { ...prev, ...patch })
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(map))) } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
}

export const WOOD_JOB_STATUS_EVENT = EVT
