import { supabase } from './supabase'
import { scheduleAndWrite } from './scheduling'

// ============================================================
// Config & error helpers
// ============================================================

function ensureSupabaseConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || /placeholder/i.test(url)) {
    throw new Error(
      'Supabase is not configured. Create steelflow/.env (project root, NOT src/) with:\n' +
      '  VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co\n' +
      '  VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY\n' +
      'Then restart `npm run dev`.',
    )
  }
}

// Supabase PostgrestError has { message, details, hint, code } — flatten all
// useful fields into one line so the UI can show actionable info.
function wrap(op, err) {
  if (!err) return null
  const parts = [op, ':', err.message || String(err)]
  if (err.code) parts.push(`(code ${err.code})`)
  if (err.details) parts.push(`— ${err.details}`)
  if (err.hint) parts.push(`hint: ${err.hint}`)
  const e = new Error(parts.join(' '))
  e.cause = err
  return e
}

// ============================================================
// CSV parsing
// ============================================================

// RFC-4180-ish parser. Accepts a custom field separator (',' ';' or '\t').
// Handles quoted fields, escaped "", CR/LF/CRLF endings, blank trailing rows.
export function parseCSV(text, sep = ',') {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === sep) {
        row.push(field); field = ''
      } else if (c === '\r') {
        // CR alone terminates a row (old-Mac); CRLF will hit the LF next.
        if (text[i + 1] !== '\n') {
          row.push(field); rows.push(row); row = []; field = ''
        }
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = ''
      } else {
        field += c
      }
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }

  // Drop rows that are entirely empty (Access often appends one of these).
  return rows.filter(r => r.some(c => c != null && String(c).trim() !== ''))
}

// Detect the most likely field separator by counting occurrences in the first
// non-empty line. Falls back to comma.
function detectSeparator(text) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const c of firstLine) {
    if (c === '"') { inQuotes = !inQuotes; continue }
    if (inQuotes) continue
    if (counts[c] != null) counts[c]++
  }
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return winner[1] > 0 ? winner[0] : ','
}

// Decode an ArrayBuffer with sensible fallbacks. Strategy:
//   1. If UTF-8 BOM present → decode UTF-8 + strip BOM.
//   2. Try UTF-8 strict (TextDecoder fatal:true). If it parses, use it.
//   3. Otherwise decode as latin-1 (ISO-8859-1) — the Access-export default.
function decodeBytes(buf) {
  const bytes = new Uint8Array(buf)
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const text = new TextDecoder('utf-8').decode(bytes.subarray(3))
    return { text, encoding: 'utf-8 (BOM stripped)' }
  }
  // UTF-16 LE BOM
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  // UTF-16 BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  }
  // Try strict UTF-8: if it succeeds, the file is valid UTF-8.
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, encoding: 'utf-8' }
  } catch {
    // Fall back to latin-1 (covers Access / Windows-1252 exports).
    return { text: new TextDecoder('iso-8859-1').decode(bytes), encoding: 'iso-8859-1 (latin-1)' }
  }
}

export async function readFile(file) {
  const buf = await file.arrayBuffer()
  const { text, encoding } = decodeBytes(buf)
  // Strip any leftover BOM that survived (rare, but possible after some decoders).
  const cleaned = text.replace(/^﻿/, '')
  return { text: cleaned, encoding }
}

// Normalise header names for tolerant lookup: trim, collapse internal
// whitespace, lowercase. Keeps duplicate detection working positionally.
const normHeader = (h) => String(h ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

function buildHeaderIndex(headerRow) {
  const map = new Map()           // first-seen index per normalised name
  const dupes = new Map()         // every index per normalised name
  headerRow.forEach((h, idx) => {
    const key = normHeader(h)
    if (!map.has(key)) map.set(key, idx)
    if (!dupes.has(key)) dupes.set(key, [])
    dupes.get(key).push(idx)
  })
  return { map, dupes, raw: headerRow }
}

// ============================================================
// Value coercion
// ============================================================

const blank = v => v == null || String(v).trim() === ''
const cleanStr = v => (blank(v) ? null : String(v).trim())

function toInt(v) {
  if (blank(v)) return null
  const n = parseInt(String(v).replace(',', '.').replace(/\s/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function toFloat(v) {
  if (blank(v)) return null
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}

// Clamp an integer to [min, max] inclusive; null if outside or not a number.
// Used for prod_week/send_week/prod_day/send_day which have CHECK constraints.
function clampInt(v, min, max) {
  const n = toInt(v)
  if (n == null) return null
  return n >= min && n <= max ? n : null
}

// Parse a date string → ISO YYYY-MM-DD for Postgres `date`. Accepts both the
// Access-era DD/MM/YYYY shape and the newer YYYY/MM/DD export shape; "-" is
// also accepted as the separator. Returns null on blank input, on an
// unrecognised shape, or when components are out of range.
function parseAccessDate(v) {
  if (blank(v)) return null
  const parts = String(v).trim().split(/[/-]/)
  if (parts.length !== 3) return null
  let day, month, year
  if (parts[0].length === 4) {
    // YYYY/MM/DD (ISO-ish)
    year = parseInt(parts[0], 10)
    month = parseInt(parts[1], 10)
    day = parseInt(parts[2], 10)
  } else {
    // DD/MM/YYYY (Access export)
    day = parseInt(parts[0], 10)
    month = parseInt(parts[1], 10)
    year = parseInt(parts[2], 10)
  }
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function existingKeys(table, column, values, chunkSize = 200) {
  const found = new Set()
  for (const part of chunk([...new Set(values)], chunkSize)) {
    if (part.length === 0) continue
    const { data, error } = await supabase.from(table).select(column).in(column, part)
    if (error) throw wrap(`Reading existing ${table}.${column}`, error)
    data.forEach(r => found.add(r[column]))
  }
  return found
}

// Route an order to a department based on the Group column. First-match wins;
// 'st' is intentionally checked after the wood keywords so things like
// "Chair-ST" don't accidentally route to steel. Exact match on "Other" wins
// first so custom orders are quarantined to the Other tab until someone maps
// their parts manually.
function detectDepartment(group) {
  if (!group) return 'wood'
  const g = String(group).toLowerCase().trim()
  if (g === 'other') return 'other'
  if (/furn|chair|moulder|cnc/.test(g)) return 'wood'
  if (/st/.test(g)) return 'steel'
  if (/uphol/.test(g)) return 'upholstery'
  if (/disp/.test(g)) return 'dispatch'
  return 'wood'
}

// ============================================================
// Orders import
//   Columns (normalised, case-insensitive):
//     kwitasie #, qty, item, beskrywing, hout, ord #, group,
//     week, dag, send, dday, tak, note
// ============================================================
export async function importOrders(file, onProgress = () => {}) {
  ensureSupabaseConfigured()

  const result = {
    parsed: 0, added: 0, updated: 0, skipped: 0,
    errors: [],
    productsCreated: 0, customersCreated: 0,
    flaggedForReview: 0,
  }

  onProgress({ stage: 'reading', current: 0, total: 0 })
  const { text, encoding } = await readFile(file)
  const sep = detectSeparator(text)
  console.log('[importOrders] encoding=%s separator=%j chars=%d', encoding, sep, text.length)

  const grid = parseCSV(text, sep)
  if (grid.length < 2) throw new Error('CSV is empty or missing a header row')
  console.log('[importOrders] rows=%d headers=%o', grid.length - 1, grid[0])

  const idx = buildHeaderIndex(grid[0])
  const dataRows = grid.slice(1)
  result.parsed = dataRows.length

  // Helper that looks up by normalised name. Returns null if not present.
  const pick = (row, name) => {
    const i = idx.map.get(normHeader(name))
    return i == null ? null : row[i]
  }
  const pickAt = (row, i) => (i == null ? null : row[i])

  // Sanity-check that the essential headers exist.
  const required = ['Kwitasie #', 'Qty', 'Item', 'Tak']
  const missingHeaders = required.filter(h => idx.map.get(normHeader(h)) == null)
  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missingHeaders.join(', ')}. ` +
      `Detected headers: ${JSON.stringify(grid[0])}. Separator detected: ${JSON.stringify(sep)}.`,
    )
  }

  // 1. Parse / validate rows --------------------------------------------------
  // `rawItemCode` is the Access CSV's Item value verbatim — kept on the order
  // row as `original_item_code` even after we redirect product_code via aliases
  // or fuzzy-match, so the Reconcile screen can re-suggest if needed.
  onProgress({ stage: 'parsing', current: 0, total: dataRows.length })
  const orders = []
  dataRows.forEach((row, i) => {
    const kwitasie = cleanStr(pick(row, 'Kwitasie #'))
    const qty = toInt(pick(row, 'Qty'))
    const rawItemCode = cleanStr(pick(row, 'Item'))
    const customerCode = cleanStr(pick(row, 'Tak'))

    if (!kwitasie) { result.skipped++; result.errors.push({ line: i + 2, reason: 'missing Kwitasie #' }); return }
    if (!qty || qty <= 0) { result.skipped++; result.errors.push({ line: i + 2, reason: 'invalid Qty' }); return }
    if (!rawItemCode) { result.skipped++; result.errors.push({ line: i + 2, reason: 'missing Item (product code)' }); return }
    if (!customerCode) { result.skipped++; result.errors.push({ line: i + 2, reason: 'missing Tak (customer code)' }); return }

    const groupStr = cleanStr(pick(row, 'Group'))
    // Only the customer-committed Due date drives anything. RDate is a soft
    // request; it never falls back into due_date or scheduling. (For now RDate
    // is dropped; if you want it stored for display add an `rdate` column.)
    const dueDate = parseAccessDate(pick(row, 'Due'))
    // prod_week / prod_day are intentionally NOT taken from the CSV's Week/Dag
    // columns — those are Access's old plan and we disregard them. The scheduler
    // is the sole writer of prod_week/prod_day, derived backwards from Send.
    orders.push({
      kwitasie_nr: kwitasie,
      qty,
      // product_code is filled in below by the alias-resolution pass.
      product_code: rawItemCode,
      original_item_code: rawItemCode,
      needs_review: false,
      description: cleanStr(pick(row, 'Beskrywing')),
      customer_code: customerCode,
      ord_nr: cleanStr(pick(row, 'Ord #')),
      group: groupStr,
      department: detectDepartment(groupStr),
      prod_week: null,
      prod_day: null,
      send_week: clampInt(pick(row, 'Send'), 1, 53),
      // DDay is sometimes blank on Access exports. Default to Monday so the
      // scheduler can still place the order — Reconcile/Edit lets the user
      // override per-order if they want a specific day.
      send_day: clampInt(pick(row, 'DDay'), 1, 7) ?? 1,
      wood_type: cleanStr(pick(row, 'Hout')),
      notes: cleanStr(pick(row, 'Note')),
      due_date: dueDate,
    })
  })
  console.log('[importOrders] parsed=%d skipped=%d valid=%d', result.parsed, result.skipped, orders.length)

  // 2. Resolve product_code via abbreviations / exact match -------------------
  // The Access "Item" column uses abbreviated codes like "Ch-BowtieR" that
  // don't match our product codes directly. Each product carries a text-array
  // `abbreviations` column listing every Access code that should resolve to
  // it. Anything still unresolved gets stub-created + flagged needs_review=true
  // so it shows up on the Reconcile screen for manual mapping.
  const rawCodes = [...new Set(orders.map(o => o.original_item_code))]

  // 2a. Find products whose abbreviations overlap any raw code in this batch.
  //     aliasMap: raw Access code -> real product.code
  const aliasMap = new Map()
  for (const part of chunk(rawCodes, 200)) {
    if (part.length === 0) continue
    const { data, error } = await supabase
      .from('products')
      .select('code, abbreviations')
      .overlaps('abbreviations', part)
    if (error) throw wrap('Reading product abbreviations', error)
    data.forEach(p => {
      for (const abbr of p.abbreviations || []) {
        // Only record matches that are actually in this batch — `overlaps`
        // returns the full abbreviations array of any matching product.
        if (rawCodes.includes(abbr)) aliasMap.set(abbr, p.code)
      }
    })
  }

  // 2b. Apply aliases: rewrite product_code to the real product code.
  for (const o of orders) {
    const realCode = aliasMap.get(o.original_item_code)
    if (realCode) o.product_code = realCode
  }

  // 2c. Now find which product_codes (after alias rewrite) already exist.
  //     The codes that DON'T exist are the ones we need to stub-create and
  //     flag the related orders as needs_review.
  const productCodes = [...new Set(orders.map(o => o.product_code))]
  const customerCodes = [...new Set(orders.map(o => o.customer_code))]

  onProgress({ stage: 'products', current: 0, total: productCodes.length })
  const existingProducts = await existingKeys('products', 'code', productCodes)
  const missingProductCodes = productCodes.filter(c => !existingProducts.has(c))
  const missingCodeSet = new Set(missingProductCodes)

  // Flag orders pointing at a missing product (i.e. that the importer is about
  // to stub-create) as needing review.
  orders.forEach(o => { if (missingCodeSet.has(o.product_code)) o.needs_review = true })
  result.flaggedForReview = orders.filter(o => o.needs_review).length

  const missingProducts = missingProductCodes.map(c => {
    const stub = orders.find(o => o.product_code === c)
    return {
      code: c,
      description: stub?.description || c,
      department: detectDepartment(stub?.group),
      default_priority: 5,
    }
  })
  for (const part of chunk(missingProducts, 500)) {
    if (part.length === 0) continue
    const { error } = await supabase.from('products').insert(part)
    if (error) throw wrap('Inserting products', error)
    result.productsCreated += part.length
  }

  onProgress({ stage: 'customers', current: 0, total: customerCodes.length })
  const existingCustomers = await existingKeys('customers', 'code', customerCodes)
  const missingCustomers = customerCodes
    .filter(c => !existingCustomers.has(c))
    .map(c => ({ code: c, name: c }))
  for (const part of chunk(missingCustomers, 500)) {
    if (part.length === 0) continue
    const { error } = await supabase.from('customers').insert(part)
    if (error) throw wrap('Inserting customers', error)
    result.customersCreated += part.length
  }

  // 3. Decide added vs updated ------------------------------------------------
  onProgress({ stage: 'classifying', current: 0, total: orders.length })
  const orderKeys = orders.map(o => o.kwitasie_nr)
  const existingOrders = await existingKeys('orders', 'kwitasie_nr', orderKeys)
  orders.forEach(o => {
    if (existingOrders.has(o.kwitasie_nr)) result.updated++
    else result.added++
  })

  // 4. Upsert ------------------------------------------------------------------
  let processed = 0
  for (const part of chunk(orders, 500)) {
    if (part.length === 0) continue
    const { error } = await supabase
      .from('orders')
      .upsert(part, { onConflict: 'kwitasie_nr' })
    if (error) throw wrap(`Upserting orders (batch of ${part.length})`, error)
    processed += part.length
    onProgress({ stage: 'orders', current: processed, total: orders.length })
  }

  // 5. Backwards-schedule each order from its due_date ---------------------
  // Non-fatal: if scheduling tables / routings aren't set up yet, the import
  // itself is still considered a success.
  try {
    const sched = await scheduleAndWrite(orders, p => onProgress({ ...p, stage: 'scheduling' }))
    result.scheduled = sched.scheduled
    result.scheduleSkipped = sched.skipped
    result.scheduleSkippedReasons = sched.skippedReasons
    console.log('[importOrders] scheduling result', sched)
  } catch (e) {
    result.scheduleError = e.message || String(e)
    console.warn('[importOrders] scheduling step failed (non-fatal):', result.scheduleError)
  }

  onProgress({ stage: 'done', current: orders.length, total: orders.length })
  console.log('[importOrders] DONE', result)
  return result
}

// ============================================================
// Parts Map import — w21.csv shape (semicolon-separated):
//   Item;PartDescription;Qty;Length;Note;ProductCode;Process;Seq;Proces;sek;SUT;PriorityS
//
//   Item            → product code (the product this part belongs to)
//   PartDescription → parts.name
//   Qty             → parts.qty_per_unit
//   Length          → parts.length (informational)
//   Note            → ignored (no column on parts)
//   ProductCode     → parts.material_code (CSV name is misleading — it's the
//                     material/tube code like RT16(0.9)CR)
//   Process         → ignored (numeric process code, not used yet)
//   Seq             → machine_steps.sequence
//   Proces          → machine_steps.machine_name (NB: distinct from "Process")
//   sek             → machine_steps.seconds_per_part
//   SUT             → machine_steps.setup_time (minutes)
//   PriorityS       → ignored
//
// Uniqueness:
//   parts → (product_id, name) — first row wins for qty/length/material
//   machine_steps → (part_id, sequence) — last row wins (Map collapse)
// ============================================================
export async function importPartsMap(file, onProgress = () => {}) {
  ensureSupabaseConfigured()

  const result = {
    parsed: 0,
    productsCreated: 0, partsCreated: 0,
    stepsAdded: 0, stepsUpdated: 0,
    skipped: 0, errors: [],
  }

  onProgress({ stage: 'reading', current: 0, total: 0 })
  const { text, encoding } = await readFile(file)
  const sep = detectSeparator(text)
  console.log('[importPartsMap] encoding=%s separator=%j chars=%d', encoding, sep, text.length)

  const grid = parseCSV(text, sep)
  if (grid.length < 2) throw new Error('CSV is empty or missing a header row')
  console.log('[importPartsMap] rows=%d headers=%o', grid.length - 1, grid[0])

  const idx = buildHeaderIndex(grid[0])
  const dataRows = grid.slice(1)
  result.parsed = dataRows.length

  const required = ['Item', 'PartDescription', 'Seq', 'Proces']
  const missing = required.filter(h => idx.map.get(normHeader(h)) == null)
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missing.join(', ')}. ` +
      `Detected headers: ${JSON.stringify(grid[0])}. Separator: ${JSON.stringify(sep)}.`,
    )
  }

  const pick = (row, name) => {
    const i = idx.map.get(normHeader(name))
    return i == null ? null : row[i]
  }

  // 1. Parse all rows ---------------------------------------------------------
  onProgress({ stage: 'parsing', current: 0, total: dataRows.length })
  const parsed = []
  dataRows.forEach((row, i) => {
    const code = cleanStr(pick(row, 'Item'))
    const partName = cleanStr(pick(row, 'PartDescription'))
    const seq = toInt(pick(row, 'Seq'))
    const machineName = cleanStr(pick(row, 'Proces'))

    if (!code) { result.skipped++; result.errors.push({ line: i + 2, reason: 'missing Item' }); return }
    if (!partName) { result.skipped++; result.errors.push({ line: i + 2, reason: 'missing PartDescription' }); return }
    if (!seq || seq < 1) { result.skipped++; result.errors.push({ line: i + 2, reason: 'invalid Seq' }); return }
    if (!machineName) { result.skipped++; result.errors.push({ line: i + 2, reason: 'missing Proces (machine name)' }); return }

    parsed.push({
      productCode: code,
      part: {
        name: partName,
        qty_per_unit: Math.max(toFloat(pick(row, 'Qty')) ?? 1, 0.001),
        length: toFloat(pick(row, 'Length')),
        material_code: cleanStr(pick(row, 'ProductCode')),
      },
      step: {
        sequence: seq,
        machine_name: machineName,
        seconds_per_part: Math.max(toFloat(pick(row, 'sek')) ?? 0, 0),
        setup_time: Math.max(toInt(pick(row, 'SUT')) ?? 0, 0),
      },
    })
  })
  console.log('[importPartsMap] parsed=%d skipped=%d valid=%d', result.parsed, result.skipped, parsed.length)

  // 2. Ensure products exist --------------------------------------------------
  const productCodes = [...new Set(parsed.map(p => p.productCode))]
  onProgress({ stage: 'products', current: 0, total: productCodes.length })

  const existingProducts = await existingKeys('products', 'code', productCodes)
  const missingProducts = productCodes
    .filter(c => !existingProducts.has(c))
    .map(c => ({ code: c, description: c, department: 'steel', default_priority: 5 }))
  for (const part of chunk(missingProducts, 500)) {
    if (part.length === 0) continue
    const { error } = await supabase.from('products').insert(part)
    if (error) throw wrap('Inserting products', error)
    result.productsCreated += part.length
  }

  // Fetch ids
  const productIdByCode = new Map()
  for (const part of chunk(productCodes, 200)) {
    const { data, error } = await supabase.from('products').select('id, code').in('code', part)
    if (error) throw wrap('Fetching product ids', error)
    data.forEach(p => productIdByCode.set(p.code, p.id))
  }

  // 3. Find or insert parts (key: product_id + name) --------------------------
  const partKey = (productId, name) => `${productId}::${name}`
  const partKeys = new Map()
  // Track each part's lowest-sequence step so we can stamp parts.department
  // from the first machine routed. Mirrors how the editor groups parts into
  // department tabs.
  const partFirstStep = new Map()
  parsed.forEach(p => {
    const pid = productIdByCode.get(p.productCode)
    if (!pid) return
    const k = partKey(pid, p.part.name)
    if (!partKeys.has(k)) partKeys.set(k, { product_id: pid, ...p.part })
    const cur = partFirstStep.get(k)
    if (!cur || p.step.sequence < cur.sequence) {
      partFirstStep.set(k, { sequence: p.step.sequence, machine_name: p.step.machine_name, productCode: p.productCode })
    }
  })

  onProgress({ stage: 'parts', current: 0, total: partKeys.size })
  const partIdByKey = new Map()
  const uniqueProductIds = [...new Set([...partKeys.values()].map(p => p.product_id))]
  for (const idChunk of chunk(uniqueProductIds, 200)) {
    const { data, error } = await supabase
      .from('parts').select('id, product_id, name').in('product_id', idChunk)
    if (error) throw wrap('Fetching existing parts', error)
    data.forEach(r => partIdByKey.set(partKey(r.product_id, r.name), r.id))
  }

  // Resolve each new part's department: machine.department of its first step
  // → product.department → 'wood' (matches migration-015 backfill order).
  const { data: machinesData, error: machErr } = await supabase
    .from('machines').select('name, department')
  if (machErr) throw wrap('Loading machines for dept stamping', machErr)
  const machineDeptByName = new Map((machinesData || []).map(m => [m.name, m.department]))
  const productDeptByCode = new Map()
  for (const codeChunk of chunk(productCodes, 200)) {
    if (codeChunk.length === 0) continue
    const { data, error } = await supabase
      .from('products').select('code, department').in('code', codeChunk)
    if (error) throw wrap('Fetching product departments', error)
    data.forEach(p => productDeptByCode.set(p.code, p.department))
  }

  const newParts = []
  partKeys.forEach((p, k) => {
    if (partIdByKey.has(k)) return
    const first = partFirstStep.get(k)
    const machDept = first ? machineDeptByName.get(first.machine_name) : null
    const prodDept = first ? productDeptByCode.get(first.productCode) : null
    newParts.push({ ...p, department: machDept || prodDept || 'wood' })
  })
  for (const part of chunk(newParts, 500)) {
    if (part.length === 0) continue
    const { data, error } = await supabase.from('parts').insert(part).select('id, product_id, name')
    if (error) throw wrap('Inserting parts', error)
    data.forEach(r => partIdByKey.set(partKey(r.product_id, r.name), r.id))
    result.partsCreated += part.length
  }

  // 4. Upsert machine_steps (unique key: part_id + sequence) ------------------
  const rawSteps = []
  parsed.forEach(p => {
    const pid = productIdByCode.get(p.productCode)
    if (!pid) return
    const partId = partIdByKey.get(partKey(pid, p.part.name))
    if (!partId) return
    rawSteps.push({
      part_id: partId,
      sequence: p.step.sequence,
      machine_name: p.step.machine_name,
      seconds_per_part: p.step.seconds_per_part,
      setup_time: p.step.setup_time,
    })
  })

  // Collapse duplicate (part_id, sequence) rows — last occurrence wins, since
  // the DB unique constraint would reject the whole batch otherwise.
  const stepByKey = new Map()
  rawSteps.forEach(s => stepByKey.set(`${s.part_id}::${s.sequence}`, s))
  const steps = [...stepByKey.values()]

  const stepPartIds = [...new Set(steps.map(s => s.part_id))]
  const existingStepKeys = new Set()
  for (const idChunk of chunk(stepPartIds, 200)) {
    const { data, error } = await supabase
      .from('machine_steps').select('part_id, sequence').in('part_id', idChunk)
    if (error) throw wrap('Fetching existing machine_steps', error)
    data.forEach(r => existingStepKeys.add(`${r.part_id}::${r.sequence}`))
  }
  steps.forEach(s => {
    if (existingStepKeys.has(`${s.part_id}::${s.sequence}`)) result.stepsUpdated++
    else result.stepsAdded++
  })

  let processed = 0
  for (const part of chunk(steps, 500)) {
    if (part.length === 0) continue
    const { error } = await supabase
      .from('machine_steps')
      .upsert(part, { onConflict: 'part_id,sequence' })
    if (error) throw wrap(`Upserting machine_steps (batch of ${part.length})`, error)
    processed += part.length
    onProgress({ stage: 'machine_steps', current: processed, total: steps.length })
  }

  onProgress({ stage: 'done', current: steps.length, total: steps.length })
  console.log('[importPartsMap] DONE', result)
  return result
}
