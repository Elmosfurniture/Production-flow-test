import { supabase } from './supabase'
import { parseCSV, readFile } from './importCSV'

// One-time import for the wood-side parts map. CSV shape (semicolon-separated):
//
//   Product;Part Name;Qty;Step 1;Sec;Step 2;Sec; ... Step 13;Sec
//
// One row per part. A product spans multiple rows. Step / Sec columns repeat
// up to 13 times — empty pairs are skipped. Decimal commas (7,5) are coerced
// to dots. Every product is tagged department='wood'.
//
// Idempotent: re-running just updates existing rows. Conflict keys —
//   products       (code)
//   parts          (product_id, name)
//   machine_steps  (part_id, sequence)

const cleanStr = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())

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

export async function importWoodPartsMap(file, onProgress = () => {}) {
  const result = {
    parsed: 0,
    productsUpserted: 0,
    partsUpserted: 0,
    stepsUpserted: 0,
    skipped: 0,
    errors: [],
  }

  onProgress({ stage: 'reading', current: 0, total: 0 })
  const { text } = await readFile(file)
  const grid = parseCSV(text, ';')
  if (grid.length < 2) throw new Error('CSV is empty or missing a header row')

  const dataRows = grid.slice(1)
  result.parsed = dataRows.length

  // Parse rows → { product, partName, qty, steps[] }
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

    // Step / Sec pairs start at col 3 (Step 1) and col 4 (Sec 1).
    const steps = []
    for (let s = 0; s < 13; s++) {
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
    parsed.push({ product, partName, qty, steps })
  })

  // 1. Upsert unique products (department='wood')
  const uniqueProducts = [...new Set(parsed.map((p) => p.product))]
  onProgress({ stage: 'products', current: 0, total: uniqueProducts.length })
  const productPayload = uniqueProducts.map((name) => ({
    code: name,
    description: name,
    department: 'wood',
    default_priority: 5,
  }))
  for (const part of chunk(productPayload, 200)) {
    const { error } = await supabase
      .from('products')
      .upsert(part, { onConflict: 'code' })
    if (error) throw wrap('Upserting products', error)
  }
  result.productsUpserted = productPayload.length

  // Fetch product ids for the join
  const productIdByCode = new Map()
  for (const codeChunk of chunk(uniqueProducts, 200)) {
    const { data, error } = await supabase
      .from('products').select('id, code').in('code', codeChunk)
    if (error) throw wrap('Fetching product ids', error)
    data.forEach((p) => productIdByCode.set(p.code, p.id))
  }

  // 2. Upsert parts — relies on unique (product_id, name) constraint
  // (migration 003). Re-importing now overwrites qty_per_unit for existing
  // parts. Duplicate (product, part) rows in the CSV collapse to the last
  // occurrence so the batch upsert doesn't reject itself.
  const partKey = (pid, name) => `${pid}::${name}`
  const partByKey = new Map()
  for (const p of parsed) {
    const pid = productIdByCode.get(p.product)
    if (!pid) continue
    partByKey.set(partKey(pid, p.partName), {
      product_id: pid,
      name: p.partName,
      qty_per_unit: p.qty,
      department: 'wood',
    })
  }
  const partsPayload = [...partByKey.values()]
  onProgress({ stage: 'parts', current: 0, total: partsPayload.length })
  for (const c of chunk(partsPayload, 500)) {
    const { error } = await supabase
      .from('parts')
      .upsert(c, { onConflict: 'product_id,name' })
    if (error) throw wrap('Upserting parts', error)
  }
  result.partsUpserted = partsPayload.length

  // Fetch all part ids. Tight chunks because PostgREST caps each response at
  // 1000 rows by default — wider chunks silently truncated some products'
  // parts, which then made the step upsert skip them (0 steps recorded).
  // 25 product_ids × ~15 parts max = ~375 rows per query, safely under the cap.
  const partIdByKey = new Map()
  const allProductIds = [...productIdByCode.values()]
  for (const idChunk of chunk(allProductIds, 25)) {
    const { data, error } = await supabase
      .from('parts').select('id, product_id, name').in('product_id', idChunk)
    if (error) throw wrap('Fetching part ids', error)
    data.forEach((r) => partIdByKey.set(partKey(r.product_id, r.name), r.id))
  }

  // 3. Upsert machine_steps — unique on (part_id, sequence). Collapse
  // duplicates so the batch upsert doesn't reject itself.
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

// Diff the CSV against the live cache. Returns a structured report:
//   { summary: { productsExpected, productsFound, partsExpected, partsFound,
//                stepsExpected, stepsFound, mismatches }, issues: [] }
// The cache argument is { productByCode, partsByProduct, stepsByPart } —
// everything we need is already in AppDataContext, no extra DB hits.
export async function verifyWoodPartsMap(file, cache) {
  const issues = []
  const { productByCode, partsByProduct, stepsByPart } = cache

  const { text } = await readFile(file)
  const grid = parseCSV(text, ';')
  if (grid.length < 2) throw new Error('CSV is empty or missing a header row')
  const dataRows = grid.slice(1)

  // Re-parse rows the same way the importer does.
  const parsed = []
  dataRows.forEach((row, i) => {
    const product = cleanStr(row[0])
    const partName = cleanStr(row[1])
    if (!product || !partName) return
    const qty = Math.max(toFloat(row[2]) ?? 1, 0.001)
    const steps = []
    for (let s = 0; s < 13; s++) {
      const machine = cleanStr(row[3 + s * 2])
      if (!machine) continue
      const sec = toFloat(row[4 + s * 2]) ?? 0
      steps.push({ sequence: s + 1, machine_name: machine, seconds_per_part: Math.max(sec, 0) })
    }
    if (steps.length === 0) return
    parsed.push({ line: i + 2, product, partName, qty, steps })
  })

  // Roll up rows into expected[product][partName] = { qty, stepsBySeq }.
  // Duplicates collapse to last occurrence — same behaviour as the importer.
  const expected = new Map()
  for (const r of parsed) {
    if (!expected.has(r.product)) expected.set(r.product, new Map())
    const partsMap = expected.get(r.product)
    const stepsBySeq = new Map()
    for (const s of r.steps) stepsBySeq.set(s.sequence, s)
    partsMap.set(r.partName, { qty: r.qty, stepsBySeq })
  }

  let productsFound = 0
  let partsExpected = 0, partsFound = 0
  let stepsExpected = 0, stepsFound = 0

  const closeEnough = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.01

  for (const [code, partsMap] of expected) {
    const product = productByCode.get(code)
    if (!product) {
      issues.push({ kind: 'missing-product', product: code })
      continue
    }
    productsFound++

    const dbParts = partsByProduct.get(product.id) || []
    const dbPartByName = new Map(dbParts.map((p) => [p.name, p]))

    for (const [partName, expectedPart] of partsMap) {
      partsExpected++
      const dbPart = dbPartByName.get(partName)
      if (!dbPart) {
        issues.push({ kind: 'missing-part', product: code, part: partName })
        // Still count expected steps so the total is honest.
        stepsExpected += expectedPart.stepsBySeq.size
        continue
      }
      partsFound++
      if (!closeEnough(dbPart.qty_per_unit, expectedPart.qty)) {
        issues.push({
          kind: 'qty-mismatch',
          product: code, part: partName,
          expected: expectedPart.qty, actual: dbPart.qty_per_unit,
        })
      }

      const dbSteps = stepsByPart.get(dbPart.id) || []
      const dbStepBySeq = new Map(dbSteps.map((s) => [s.sequence, s]))

      for (const [seq, expectedStep] of expectedPart.stepsBySeq) {
        stepsExpected++
        const dbStep = dbStepBySeq.get(seq)
        if (!dbStep) {
          issues.push({
            kind: 'missing-step',
            product: code, part: partName, sequence: seq,
            machine: expectedStep.machine_name,
          })
          continue
        }
        stepsFound++
        if (dbStep.machine_name !== expectedStep.machine_name) {
          issues.push({
            kind: 'machine-mismatch',
            product: code, part: partName, sequence: seq,
            expected: expectedStep.machine_name, actual: dbStep.machine_name,
          })
        }
        if (!closeEnough(dbStep.seconds_per_part, expectedStep.seconds_per_part)) {
          issues.push({
            kind: 'seconds-mismatch',
            product: code, part: partName, sequence: seq,
            expected: expectedStep.seconds_per_part, actual: dbStep.seconds_per_part,
          })
        }
      }
    }
  }

  const summary = {
    productsExpected: expected.size,
    productsFound,
    partsExpected,
    partsFound,
    stepsExpected,
    stepsFound,
    mismatches: issues.length,
  }
  return { summary, issues }
}

// Delete every product that has zero parts AND zero orders pointing at it.
// Auto-stubs from the orders import that have since been replaced are the
// targets here. Bowtie products are always protected (anything with "bowtie"
// in code/description). Order-referenced products are skipped because the
// orders_product_code_fkey constraint would block the delete anyway — those
// stay until the referencing orders are deleted/reassigned.
//
// Returns { deleted, keptBowtie, keptOrderRef, total } for the UI.
const BOWTIE_RE = /bowtie/i

export async function deleteProductsWithoutParts() {
  const PAGE = 1000

  // 1. Product ids referenced by parts.
  const partRefIds = new Set()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('parts').select('product_id').range(from, from + PAGE - 1)
    if (error) throw wrap('Listing parts', error)
    if (!data || data.length === 0) break
    data.forEach((r) => { if (r.product_id) partRefIds.add(r.product_id) })
    if (data.length < PAGE) break
    from += PAGE
  }

  // 2. Product codes referenced by orders (orders.product_code → products.code).
  const orderRefCodes = new Set()
  from = 0
  while (true) {
    const { data, error } = await supabase
      .from('orders').select('product_code').range(from, from + PAGE - 1)
    if (error) throw wrap('Listing orders', error)
    if (!data || data.length === 0) break
    data.forEach((r) => { if (r.product_code) orderRefCodes.add(r.product_code) })
    if (data.length < PAGE) break
    from += PAGE
  }

  // 3. Walk every product, bucket into delete / bowtie-kept / order-kept.
  const orphanIds = []
  let totalProducts = 0
  let keptBowtie = 0
  let keptOrderRef = 0
  from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products').select('id, code, description').range(from, from + PAGE - 1)
    if (error) throw wrap('Listing products', error)
    if (!data || data.length === 0) break
    totalProducts += data.length
    for (const r of data) {
      if (partRefIds.has(r.id)) continue
      const isBowtie = BOWTIE_RE.test(r.code || '') || BOWTIE_RE.test(r.description || '')
      if (isBowtie) { keptBowtie++; continue }
      if (orderRefCodes.has(r.code)) { keptOrderRef++; continue }
      orphanIds.push(r.id)
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // 4. Delete in chunks.
  for (const c of chunk(orphanIds, 200)) {
    if (c.length === 0) continue
    const { error } = await supabase.from('products').delete().in('id', c)
    if (error) throw wrap('Deleting orphan products', error)
  }

  return {
    deleted: orphanIds.length,
    keptBowtie,
    keptOrderRef,
    total: totalProducts,
  }
}
