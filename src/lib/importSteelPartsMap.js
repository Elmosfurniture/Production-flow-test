import { supabase } from './supabase'
import { parseCSV, readFile } from './importCSV'

// Steel-side parts map. CSV shape (semicolon-separated):
//
//   Product;Part Name;Qty;Step 1;Sec;Step 2;Sec; ... Step 5;Sec
//
// Same shape as the wood map but with 5 step pairs instead of 13. Every
// product is tagged department='steel'. Parts whose name contains "assembly"
// (case-insensitive, trimmed) are flagged is_assembly=true — the scheduler
// then holds them back until every non-assembly part of the same order has
// finished every step (see project_assembly_dependency).
//
// Idempotent: re-running just updates existing rows. Conflict keys —
//   products       (code)
//   parts          (product_id, name)
//   machine_steps  (part_id, sequence)

const cleanStr = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const isAssemblyName = (name) => /assembly/i.test(name || '')

function toFloat(v) {
  if (v == null || String(v).trim() === '') return null
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function wrap(op, err) {
  if (!err) return null
  const parts = [op, ':', err.message || String(err)]
  if (err.code) parts.push(`(code ${err.code})`)
  if (err.details) parts.push(`— ${err.details}`)
  if (err.hint) parts.push(`hint: ${err.hint}`)
  return new Error(parts.join(' '))
}

export async function importSteelPartsMap(file, onProgress = () => {}) {
  const result = {
    parsed: 0,
    productsUpserted: 0,
    partsUpserted: 0,
    stepsUpserted: 0,
    assembliesFlagged: 0,
    skipped: 0,
    errors: [],
  }

  onProgress({ stage: 'reading', current: 0, total: 0 })
  const { text } = await readFile(file)
  const grid = parseCSV(text, ';')
  if (grid.length < 2) throw new Error('CSV is empty or missing a header row')

  const dataRows = grid.slice(1)
  result.parsed = dataRows.length

  onProgress({ stage: 'parsing', current: 0, total: dataRows.length })
  const parsed = []
  dataRows.forEach((row, i) => {
    const product = cleanStr(row[0])
    const partName = cleanStr(row[1])
    if (!product) { result.skipped++; return }
    if (!partName) {
      result.skipped++
      result.errors.push({ line: i + 2, reason: 'missing Part Name' })
      return
    }
    const qty = Math.max(toFloat(row[2]) ?? 1, 0.001)

    // 5 step pairs: Step at col 3 + 2s, Sec at col 4 + 2s.
    const steps = []
    for (let s = 0; s < 5; s++) {
      const machine = cleanStr(row[3 + s * 2])
      if (!machine) continue
      const sec = toFloat(row[4 + s * 2]) ?? 0
      steps.push({
        sequence: s + 1,
        machine_name: machine,
        seconds_per_part: Math.max(sec, 0),
        setup_time: 0,
      })
    }
    if (steps.length === 0) {
      result.skipped++
      result.errors.push({ line: i + 2, reason: 'no machine steps' })
      return
    }
    parsed.push({ product, partName, qty, steps, isAssembly: isAssemblyName(partName) })
  })

  // 1. Upsert unique products (department='steel')
  const uniqueProducts = [...new Set(parsed.map((p) => p.product))]
  onProgress({ stage: 'products', current: 0, total: uniqueProducts.length })
  const productPayload = uniqueProducts.map((name) => ({
    code: name,
    description: name,
    department: 'steel',
    default_priority: 5,
  }))
  for (const part of chunk(productPayload, 200)) {
    const { error } = await supabase
      .from('products')
      .upsert(part, { onConflict: 'code' })
    if (error) throw wrap('Upserting products', error)
  }
  result.productsUpserted = productPayload.length

  const productIdByCode = new Map()
  for (const codeChunk of chunk(uniqueProducts, 200)) {
    const { data, error } = await supabase
      .from('products').select('id, code').in('code', codeChunk)
    if (error) throw wrap('Fetching product ids', error)
    data.forEach((p) => productIdByCode.set(p.code, p.id))
  }

  // 2. Upsert parts (product_id, name) + is_assembly
  const partKey = (pid, name) => `${pid}::${name}`
  const partByKey = new Map()
  for (const p of parsed) {
    const pid = productIdByCode.get(p.product)
    if (!pid) continue
    partByKey.set(partKey(pid, p.partName), {
      product_id: pid,
      name: p.partName,
      qty_per_unit: p.qty,
      is_assembly: p.isAssembly,
      department: 'steel',
    })
  }
  const partsPayload = [...partByKey.values()]
  result.assembliesFlagged = partsPayload.filter((p) => p.is_assembly).length
  onProgress({ stage: 'parts', current: 0, total: partsPayload.length })
  for (const c of chunk(partsPayload, 500)) {
    const { error } = await supabase
      .from('parts')
      .upsert(c, { onConflict: 'product_id,name' })
    if (error) throw wrap('Upserting parts', error)
  }
  result.partsUpserted = partsPayload.length

  // Fetch part ids in tight chunks (PostgREST caps each response at 1000 rows
  // by default — see the wood importer for the back-story).
  const partIdByKey = new Map()
  const allProductIds = [...productIdByCode.values()]
  for (const idChunk of chunk(allProductIds, 25)) {
    const { data, error } = await supabase
      .from('parts').select('id, product_id, name').in('product_id', idChunk)
    if (error) throw wrap('Fetching part ids', error)
    data.forEach((r) => partIdByKey.set(partKey(r.product_id, r.name), r.id))
  }

  // 3. Upsert machine_steps — unique on (part_id, sequence).
  const stepByKey = new Map()
  for (const p of parsed) {
    const pid = productIdByCode.get(p.product)
    if (!pid) continue
    const partId = partIdByKey.get(partKey(pid, p.partName))
    if (!partId) continue
    for (const s of p.steps) {
      stepByKey.set(`${partId}::${s.sequence}`, {
        part_id: partId,
        sequence: s.sequence,
        machine_name: s.machine_name,
        seconds_per_part: s.seconds_per_part,
        setup_time: s.setup_time,
      })
    }
  }
  const stepsPayload = [...stepByKey.values()]
  onProgress({ stage: 'machine_steps', current: 0, total: stepsPayload.length })
  let processed = 0
  for (const c of chunk(stepsPayload, 500)) {
    const { error } = await supabase
      .from('machine_steps')
      .upsert(c, { onConflict: 'part_id,sequence' })
    if (error) throw wrap('Upserting machine_steps', error)
    processed += c.length
    onProgress({ stage: 'machine_steps', current: processed, total: stepsPayload.length })
  }
  result.stepsUpserted = stepsPayload.length

  onProgress({ stage: 'done', current: 1, total: 1 })
  return result
}
