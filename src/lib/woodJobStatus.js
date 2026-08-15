// Live status for wood day-board jobs.
//
// Wood jobs are computed by the wood engine, not persisted `schedule` rows, so
// there's no schedule row to mark started/done. Status lives in its own
// `wood_job_status` table (migration 018), keyed the same way it always was:
// `${orderId}::${stepId}::${dateStr}` — one machine step of one order on a
// given day. Value = { status, started_at, completed_at, qty_done }.
//
// Reads stay SYNCHRONOUS. Callers (AppDataContext's deptProgressByOrderId,
// WoodConveyorView) render straight off `loadWoodJobStatus()`, so this keeps an
// in-memory map that localStorage seeds instantly on boot and the server
// refills via hydrateWoodJobStatus(). Writes apply locally first and upsert in
// the background, so a tap on the floor never waits on the network.
//
// If migration 018 hasn't been run yet the table is missing; everything falls
// back to device-local behaviour and logs one warning, rather than breaking the
// board. Moves onto real schedule rows when wood goes live.

import { supabase } from './supabase'

const KEY = 'pf_wood_job_status'
const EVT = 'pf-wood-job-status-change'
const TABLE = 'wood_job_status'

export function woodJobKeyOf(orderId, stepId, dateStr) {
  return `${orderId}::${stepId}::${dateStr}`
}

function parseJobKey(jobKey) {
  const [order_id, machine_step_id, job_date] = String(jobKey).split('::')
  if (!order_id || !machine_step_id || !job_date) return null
  return { order_id, machine_step_id, job_date }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw)))
  } catch {
    return new Map()
  }
}

function writeLocal(map) {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(map))) } catch { /* ignore */ }
}

// Seeded from localStorage so the first paint has yesterday's known state
// without waiting for the round-trip; hydrate() then reconciles with the server.
let cache = readLocal()

function emit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
}

// One warning per session when the table isn't there yet, then silence.
let tableMissingWarned = false
function noteRemoteFailure(where, error) {
  const missing = error?.code === '42P01' || error?.code === 'PGRST205'
    || /wood_job_status/i.test(error?.message || '') && /(does not exist|not find)/i.test(error?.message || '')
  if (missing) {
    if (!tableMissingWarned) {
      tableMissingWarned = true
      console.warn(
        `[woodJobStatus] Table "${TABLE}" not found — wood done-marks stay on this device only. `
        + 'Run supabase/migrations/018_wood_job_status.sql to share them across devices.'
      )
    }
    return
  }
  console.warn(`[woodJobStatus] ${where} failed:`, error?.message || error)
}

// Map<jobKey, { status, started_at, completed_at, qty_done }>
export function loadWoodJobStatus() {
  return cache
}

// Pull every stored status from the server and replace the cache. Server wins:
// a row deleted centrally should disappear here too, and localStorage is only a
// warm-start cache, never a second source of truth. Safe to call repeatedly.
export async function hydrateWoodJobStatus() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('order_id, machine_step_id, job_date, status, started_at, completed_at, qty_done')
  if (error) { noteRemoteFailure('hydrate', error); return cache }

  const next = new Map()
  for (const r of data || []) {
    next.set(woodJobKeyOf(r.order_id, r.machine_step_id, r.job_date), {
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at,
      qty_done: r.qty_done ?? 0,
    })
  }
  cache = next
  writeLocal(cache)
  emit()
  return cache
}

export function setWoodJobStatus(jobKey, patch) {
  if (!jobKey) return
  const prev = cache.get(jobKey) || {}
  const merged = { ...prev, ...patch }

  // Local first — the board updates on the tap, network or not.
  cache = new Map(cache)
  cache.set(jobKey, merged)
  writeLocal(cache)
  emit()

  const parts = parseJobKey(jobKey)
  if (!parts) return
  supabase
    .from(TABLE)
    .upsert({
      ...parts,
      status: merged.status ?? 'queued',
      started_at: merged.started_at ?? null,
      completed_at: merged.completed_at ?? null,
      qty_done: merged.qty_done ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_id,machine_step_id,job_date' })
    .then(({ error }) => { if (error) noteRemoteFailure('upsert', error) })
}

export const WOOD_JOB_STATUS_EVENT = EVT
