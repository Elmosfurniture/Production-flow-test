// One-off: copy all data from the LIVE Supabase into the TEST project.
// Reads with the prod anon key, writes with the test anon key. Each row is
// filtered to the columns the TEST schema actually has, so prod's extra/hand-
// added columns never break an insert. Safe: only READS prod, never writes it.
//
//   node copy-to-test.mjs
//
// Throwaway dev tool — delete after the test DB is seeded.
import { createClient } from '@supabase/supabase-js'

const PROD_URL = 'https://oevjemzjuorbcklkxity.supabase.co'
const PROD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldmplbXpqdW9yYmNrbGt4aXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzY2ODQsImV4cCI6MjA5NDExMjY4NH0.Nzo1PVBVS6rXrizPLT3Y3A0RFU_uCPnsBq0UJaUbT9c'

const TEST_URL = 'https://ykfcsotngkwvwqlrlcid.supabase.co'
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrZmNzb3RuZ2t3dndxbHJsY2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzEzMjQsImV4cCI6MjEwMjAwNzMyNH0.FmZG8WI5VAv9cxhJmblJGR3nZG5o5hE8mGRk2e9QhL0'

const prod = createClient(PROD_URL, PROD_KEY)
const test = createClient(TEST_URL, TEST_KEY)

// Columns the TEST schema has, per table. Parents before children (FKs).
const TABLES = {
  customers: ['id', 'code', 'name', 'active', 'created_at'],
  employees: ['id', 'name', 'role', 'departments', 'pin', 'active', 'created_at'],
  messages: ['id', 'body', 'author_id', 'author_name', 'author_role', 'author_dept', 'created_at'],
  public_holidays: ['date', 'name'],
  department_settings: ['department', 'buffer_days'],
  folders: ['id', 'name', 'department', 'created_at'],
  machines: ['id', 'name', 'department', 'setup_time_min', 'is_bottleneck', 'active', 'display_order', 'rate_per_hour', 'wood_day', 'color', 'created_at'],
  products: ['id', 'code', 'description', 'group', 'department', 'default_priority', 'folder_id', 'abbreviations', 'is_dispatch_only', 'wood_day_overrides', 'created_at'],
  parts: ['id', 'product_id', 'name', 'qty_per_unit', 'length', 'width', 'thickness', 'material_code', 'part_priority', 'is_assembly', 'department', 'created_at'],
  machine_steps: ['id', 'part_id', 'sequence', 'machine_name', 'alt_machine_names', 'seconds_per_part', 'setup_time', 'created_at'],
  orders: ['id', 'kwitasie_nr', 'qty', 'qty_done', 'status', 'product_code', 'customer_code', 'department', 'due_date', 'prod_week', 'prod_day', 'send_week', 'send_day', 'description', 'priority_rank', 'ord_nr', 'group', 'wood_type', 'notes', 'needs_review', 'original_item_code', 'ready_for_dispatch_at', 'shipped_at', 'created_at'],
  order_tracks: ['id', 'order_id', 'department', 'prod_week', 'prod_day', 'bottleneck', 'total_minutes', 'work_days', 'status', 'started_at', 'completed_at', 'created_at', 'updated_at'],
  schedule: ['id', 'order_id', 'machine_id', 'machine_step_id', 'scheduled_date', 'start_time', 'end_time', 'position', 'status', 'includes_setup', 'qty', 'qty_done', 'started_at', 'completed_at', 'created_at'],
}

async function readAll(client, table) {
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`read ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// Keep only the columns that exist in the TEST schema.
function pick(row, cols) {
  const out = {}
  for (const c of cols) if (c in row) out[c] = row[c]
  return out
}

async function insertBatched(client, table, rows) {
  const BATCH = 500
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await client.from(table).insert(chunk)
    if (error) throw new Error(`insert ${table} @${i}: ${error.message}`)
    done += chunk.length
  }
  return done
}

let ok = 0
let failed = 0
for (const [table, cols] of Object.entries(TABLES)) {
  try {
    const raw = await readAll(prod, table)
    const rows = raw.map((r) => pick(r, cols))
    const n = rows.length ? await insertBatched(test, table, rows) : 0
    console.log(`ok  ${table.padEnd(20)} copied ${n}/${raw.length}`)
    ok++
  } catch (e) {
    console.error(`ERR ${table.padEnd(20)} ${e.message}`)
    failed++
  }
}
console.log(`\nDone — ${ok} tables copied, ${failed} failed.`)
