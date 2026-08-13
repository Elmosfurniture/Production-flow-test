import { supabase } from './supabase'

// South African public holidays for 2026 (gazetted dates). When a holiday
// falls on a Sunday the Public Holidays Act automatically grants the
// following Monday — verify against the gov.za gazette before relying on
// these. Adjust via the Options UI as needed.
const SA_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-03-21', name: 'Human Rights Day' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Family Day' },
  { date: '2026-04-27', name: 'Freedom Day' },
  { date: '2026-05-01', name: "Workers' Day" },
  { date: '2026-06-16', name: 'Youth Day' },
  { date: '2026-08-09', name: "National Women's Day" },
  { date: '2026-09-24', name: 'Heritage Day' },
  { date: '2026-12-16', name: 'Day of Reconciliation' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Day of Goodwill' },
]

const KNOWN_DEPARTMENTS = ['steel', 'wood', 'upholstery', 'dispatch']
const DEFAULT_BUFFER_DAYS = 3

// ---------- holidays ----------

export async function listHolidays() {
  const { data, error } = await supabase
    .from('public_holidays')
    .select('id, date, name')
    .order('date', { ascending: true })
  if (error) throw new Error(`Listing holidays: ${error.message}`)
  return data || []
}

export async function addHoliday(date, name) {
  if (!date) throw new Error('Date is required')
  const cleanName = String(name || '').trim()
  if (!cleanName) throw new Error('Holiday name is required')
  const { data, error } = await supabase
    .from('public_holidays')
    .insert({ date, name: cleanName })
    .select('id, date, name')
    .single()
  if (error) throw new Error(`Adding holiday: ${error.message}`)
  return data
}

export async function deleteHoliday(id) {
  if (!id) throw new Error('Holiday id is required')
  const { error } = await supabase.from('public_holidays').delete().eq('id', id)
  if (error) throw new Error(`Deleting holiday: ${error.message}`)
}

// Idempotent: skip rows that already exist on the same date.
export async function seedSaHolidays2026() {
  const { error } = await supabase
    .from('public_holidays')
    .upsert(SA_HOLIDAYS_2026, { onConflict: 'date', ignoreDuplicates: true })
  if (error) throw new Error(`Seeding SA holidays: ${error.message}`)
  return { count: SA_HOLIDAYS_2026.length }
}

// ---------- department settings ----------

// Returns Map<department, buffer_days>. Defaults missing departments to 3.
export async function listDepartmentBuffers() {
  const { data, error } = await supabase
    .from('department_settings')
    .select('department, buffer_days')
  if (error) throw new Error(`Listing department settings: ${error.message}`)
  const map = new Map((data || []).map((s) => [s.department, s.buffer_days]))
  for (const d of KNOWN_DEPARTMENTS) {
    if (!map.has(d)) map.set(d, DEFAULT_BUFFER_DAYS)
  }
  return map
}

export async function setBufferDays(department, days) {
  if (!department) throw new Error('Department is required')
  const value = Math.max(0, Math.floor(Number(days) || 0))
  const { data, error } = await supabase
    .from('department_settings')
    .upsert({ department, buffer_days: value }, { onConflict: 'department' })
    .select('department, buffer_days')
    .single()
  if (error) throw new Error(`Setting buffer days: ${error.message}`)
  return data
}
