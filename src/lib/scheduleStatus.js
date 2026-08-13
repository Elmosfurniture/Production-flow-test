import { supabase } from './supabase'

// Per-row status writes for the Schedule screen. Called when the boss clicks
// Start / Pause / Stop on a job row — updates schedule.status plus the
// started_at / completed_at timestamps. Once those are recorded, the per-
// machine progress bar can show a real "actually done" overlay alongside the
// "should be done by now" indicator, giving an honest ahead/behind read.
export async function setScheduleRowStatus(rowId, patch) {
  if (!rowId) throw new Error('Row id required')
  const { data, error } = await supabase
    .from('schedule')
    .update(patch)
    .eq('id', rowId)
    .select('id, status, started_at, completed_at, qty, qty_done')
    .single()
  if (error) throw new Error(`Updating schedule row: ${error.message}`)
  return data
}
