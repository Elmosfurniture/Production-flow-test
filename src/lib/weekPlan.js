import { supabase } from './supabase'
import { isoWeekDayToDate } from './scheduling'

// Loader for the Production Calendar (Week Plan screen). Returns orders
// grouped by their production date — derived from prod_week + prod_day —
// keyed YYYY-MM-DD. Filterable by department.

// UI dept tab id → orders.department value
const DEPT_TAB_TO_DB = {
  steel: 'steel',
  wood: 'wood',
  uphol: 'upholstery',
  disp: 'dispatch',
  other: 'other',
}

const fmtKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Load every order for the given department (or all) and bucket them by
// production date. Year is needed to convert prod_week → calendar date.
// Returns Map<dateKey, Array<order>>.
export async function loadWeekPlan(dept, year) {
  let q = supabase
    .from('orders')
    .select('kwitasie_nr, qty, product_code, customer_code, department, due_date, prod_week, prod_day, send_week, send_day, description, ord_nr, "group", wood_type, notes, ready_for_dispatch_at, status')
    // Skip anything still awaiting reconciliation — those orders point at
    // stub products with no routing and can't be placed on the calendar.
    .eq('needs_review', false)
    // Production Calendar is for work the floor still has to do. Once an
    // order is ready-for-dispatch or shipped, production is over — those
    // belong in Dispatch / Dashboard, not here.
    .is('ready_for_dispatch_at', null)
    .neq('status', 'completed')
  const dbDept = DEPT_TAB_TO_DB[dept]
  if (dbDept) q = q.eq('department', dbDept)
  const { data, error } = await q
  if (error) throw new Error(`Load week plan: ${error.message}`)

  const orders = data || []
  const withSchedule = orders.filter((o) => o.prod_week != null && o.prod_day != null)
  console.log(
    `[loadWeekPlan] dept=${dept} year=${year} fetched=${orders.length} scheduled=${withSchedule.length}\n` +
    withSchedule.map((o) =>
      `  ${o.kwitasie_nr} dept=${o.department} prod=Wk${o.prod_week}/D${o.prod_day} send=Wk${o.send_week}/D${o.send_day}`
    ).join('\n'),
  )

  // Load product descriptions in one round trip for nicer chip labels.
  const codes = [...new Set(orders.map((o) => o.product_code).filter(Boolean))]
  let nameByCode = new Map()
  if (codes.length) {
    const { data: prods, error: pErr } = await supabase
      .from('products').select('code, description').in('code', codes)
    if (pErr) throw new Error(`Load products: ${pErr.message}`)
    nameByCode = new Map((prods || []).map((p) => [p.code, p.description || p.code]))
  }

  const byDate = new Map()
  for (const o of orders) {
    if (o.prod_week == null || o.prod_day == null) continue
    const d = isoWeekDayToDate(year, o.prod_week, o.prod_day)
    const key = fmtKey(d)
    const enriched = {
      ...o,
      product_name: nameByCode.get(o.product_code) || o.description || o.product_code,
      // UI shorthand for the dept tab — used by chip colour class.
      dept_ui: o.department === 'upholstery' ? 'uphol' : o.department === 'dispatch' ? 'disp' : o.department,
    }
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key).push(enriched)
  }
  // Stable order within each day: by kwitasie_nr.
  for (const list of byDate.values()) {
    list.sort((a, b) => String(a.kwitasie_nr).localeCompare(String(b.kwitasie_nr)))
  }
  return byDate
}
