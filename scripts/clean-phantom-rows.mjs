// One-off maintenance: find & remove PHANTOM schedule rows.
//
// A phantom = a queued/incomplete schedule row for an (order, machine_step)
// whose work is ALREADY fully done by other (completed) rows. These get left
// behind by an over-scheduling reschedule: the work is finished on day A but a
// duplicate queued copy sits on day B, so Tracking shows "done" (it caps the
// totals) while the Schedule still lists the leftover copy.
//
// Rule: for each (order_id, machine_step_id) group, partTotal = part.qty_per_unit
// × order.qty. If SUM(qty_done) >= partTotal (step fully done), every row in the
// group that is not 'completed' and has qty_done = 0 is a phantom → delete.
//
// Usage:
//   node scripts/clean-phantom-rows.mjs           # dry run (reports only)
//   node scripts/clean-phantom-rows.mjs --apply    # actually delete
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => {
      const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]
    }),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const APPLY = process.argv.includes('--apply')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function getAll(table, select) {
  // Paginate in 1000-row pages (PostgREST default cap).
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=${select}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    out.push(...page)
    if (page.length < 1000) break
    from += 1000
  }
  return out
}

const [orders, products, parts, steps, schedule] = await Promise.all([
  getAll('orders', 'id,product_code,qty'),
  getAll('products', 'id,code'),
  getAll('parts', 'id,product_id,qty_per_unit'),
  getAll('machine_steps', 'id,part_id'),
  getAll('schedule', 'id,order_id,machine_step_id,qty,qty_done,status,scheduled_date'),
])

const orderById = new Map(orders.map((o) => [o.id, o]))
const productById = new Map(products.map((p) => [p.id, p]))
const productByCode = new Map(products.map((p) => [p.code, p]))
const partById = new Map(parts.map((p) => [p.id, p]))
const stepById = new Map(steps.map((s) => [s.id, s]))

// Group schedule rows by `${order_id}:${machine_step_id}`.
const groups = new Map()
for (const r of schedule) {
  if (!r.order_id || !r.machine_step_id) continue
  const k = `${r.order_id}:${r.machine_step_id}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

const phantoms = []
for (const [k, rows] of groups) {
  const [orderId, stepId] = k.split(':')
  const order = orderById.get(orderId)
  const step = stepById.get(stepId)
  if (!order || !step) continue
  const part = partById.get(step.part_id)
  if (!part) continue
  const partTotal = (part.qty_per_unit ?? 1) * (order.qty || 0)
  if (partTotal <= 0) continue
  const done = rows.reduce((s, r) => s + (r.qty_done ?? 0), 0)
  if (done < partTotal) continue // step not fully done — keep everything
  for (const r of rows) {
    if (r.status !== 'completed' && (r.qty_done ?? 0) === 0) {
      phantoms.push({ ...r, _order: order.product_code, _partTotal: partTotal, _done: done })
    }
  }
}

console.log(`Scanned ${schedule.length} schedule rows across ${orders.length} orders.`)
console.log(`Found ${phantoms.length} phantom queued row(s) on fully-done steps:\n`)
for (const p of phantoms) {
  console.log(`  ${p._order.padEnd(16)} ${p.scheduled_date}  qty=${String(p.qty).padStart(4)}  (step done ${p._done}/${p._partTotal})  id=${p.id}`)
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing deleted. Re-run with --apply to delete these ${phantoms.length} row(s).`)
} else if (phantoms.length === 0) {
  console.log('\nNothing to delete.')
} else {
  let ok = 0
  for (const p of phantoms) {
    const res = await fetch(`${URL_}/rest/v1/schedule?id=eq.${p.id}`, { method: 'DELETE', headers: H })
    if (res.ok) ok += 1
    else console.error(`  FAILED ${p.id}: ${res.status} ${await res.text()}`)
  }
  console.log(`\nDeleted ${ok}/${phantoms.length} phantom row(s).`)
}
