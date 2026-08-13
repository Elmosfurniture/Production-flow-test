import { supabase } from './supabase'
import { scheduleAndWrite } from './scheduling'

// ============================================================
// Reconciliation: link orders with unknown Access product codes
// to real products. The mapping is stored ON the product itself
// as an entry in `products.abbreviations` (text[]), so future
// imports of the same code auto-resolve via the abbreviations
// lookup in importCSV.js.
// ============================================================

// Tokenise for fuzzy match. Splits on non-alphanum AND on CamelCase boundaries
// so "Ch-CamillePNW" → ['ch','camille','pnw'] instead of one opaque token.
// Drops tokens under 2 chars after lowercasing.
function tokenize(s) {
  if (!s) return []
  return String(s)
    // Insert a space at lower→Upper and letter→digit transitions so
    // "CamillePNW" → "Camille PNW" and "Bnc160Sgl" → "Bnc 160 Sgl".
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

// Very common tokens that exist in almost every name and shouldn't sway
// the match. "chair" matches half the catalogue; "bowtie" doesn't.
const STOPWORDS = new Set([
  'chair', 'table', 'kfc', 'rcp', 'the', 'and', 'for',
  'ch', 'tbl', 'chb', 'cho', 'ct', 'pn', 'kd', 'fo', 'sgl', 'dbl',
])

function meaningfulTokens(s) {
  return tokenize(s).filter((t) => !STOPWORDS.has(t))
}

// Jaccard similarity between two token sets, 0–1.
function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

// Rank candidate products against a single order's raw code + description.
// Same-dept candidates get a small bias so the user isn't picking Wood when
// the order is clearly Steel. Returns the top `limit` results, each shaped
// as { product, score, matches } where matches are the overlapping tokens.
export function suggestProducts({ rawCode, description, department }, products, limit = 3) {
  const queryTokens = new Set([
    ...meaningfulTokens(rawCode),
    ...meaningfulTokens(description),
  ])
  if (queryTokens.size === 0) return []

  const scored = products.map((p) => {
    const pTokens = new Set([
      ...meaningfulTokens(p.code),
      ...meaningfulTokens(p.description),
    ])
    const base = jaccard(queryTokens, pTokens)
    const sameDept = department && p.department === department ? 0.05 : 0
    const matches = []
    for (const t of queryTokens) if (pTokens.has(t)) matches.push(t)
    return { product: p, score: base + sameDept, matches }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Read current abbreviations, append the raw code (if not already there),
// write back. Caller must hold chosenProductId. Returns the new array.
async function appendAbbreviation(chosenProductId, originalCode) {
  const { data: product, error: readErr } = await supabase
    .from('products')
    .select('abbreviations')
    .eq('id', chosenProductId)
    .single()
  if (readErr) throw new Error(`Reading product abbreviations: ${readErr.message}`)

  const existing = product.abbreviations || []
  if (existing.includes(originalCode)) return existing

  const next = [...existing, originalCode]
  const { error: updErr } = await supabase
    .from('products')
    .update({ abbreviations: next })
    .eq('id', chosenProductId)
  if (updErr) throw new Error(`Saving abbreviation: ${updErr.message}`)
  return next
}

// Re-schedule a specific set of orders (by id) — used right after a reconcile
// so prod_week / prod_day populate without forcing the user to hit the global
// Recalculate button. Pulls the freshly-updated rows from the DB (the cache
// hasn't been refreshed yet by the caller) so scheduleAndWrite sees the new
// product_code values, not the stale stub ones.
async function rescheduleByIds(orderIds) {
  if (!orderIds || orderIds.length === 0) return { scheduled: 0, skipped: 0, total: 0 }
  // `id` is needed so scheduleAndWrite can write per-dept tracks rows.
  const { data, error } = await supabase
    .from('orders')
    .select('id, kwitasie_nr, qty, department, send_week, send_day, product_code, customer_code')
    .in('id', orderIds)
  if (error) throw new Error(`Loading orders for reschedule: ${error.message}`)
  return scheduleAndWrite(data || [])
}

// Merge a stub product into a real product. A "stub" is a product that was
// auto-created during a CSV import (its code is the raw Access Item code,
// e.g. "Camille" or "Ch-BowtieR") and has zero parts. The user later adds
// that code as an abbreviation on the real product — at which point this
// helper migrates every order that was pointing at the stub onto the real
// product, then deletes the stub so the catalogue stays clean.
//
// This is what makes abbreviations *permanent* rather than just a hint for
// future imports: previously-imported orders that landed on a stub get
// pulled in too, and re-scheduled so prod_week/prod_day populate.
//
// No-op when:
//   • no stub exists with code === stubCode (other than the real product itself)
//   • the would-be stub actually has parts (then it's not a stub, leave alone)
//   • stubCode === realProductCode (the abbreviation IS the product's own code)
//
// Returns { rerouted: [orderIds], scheduled, deletedStub }.
export async function mergeStubIntoProduct({ stubCode, realProductId, realProductCode }) {
  if (!stubCode) throw new Error('stubCode is required')
  if (!realProductId) throw new Error('realProductId is required')
  if (!realProductCode) throw new Error('realProductCode is required')
  if (stubCode === realProductCode) {
    return { rerouted: [], scheduled: 0, deletedStub: false }
  }

  const { data: stub, error: stubErr } = await supabase
    .from('products')
    .select('id')
    .eq('code', stubCode)
    .neq('id', realProductId)
    .maybeSingle()
  if (stubErr) throw new Error(`Looking up stub ${stubCode}: ${stubErr.message}`)
  if (!stub) return { rerouted: [], scheduled: 0, deletedStub: false }

  // Safety: if the would-be stub actually has parts, the user has wired it
  // up as a real product and we mustn't silently delete it. Bail out.
  const { data: stubParts, error: partsErr } = await supabase
    .from('parts')
    .select('id')
    .eq('product_id', stub.id)
    .limit(1)
  if (partsErr) throw new Error(`Checking parts on stub ${stubCode}: ${partsErr.message}`)
  if (stubParts && stubParts.length > 0) {
    return { rerouted: [], scheduled: 0, deletedStub: false }
  }

  // Reroute orders. Clear needs_review too — they're now linked to a real
  // routing-bearing product, so they shouldn't appear on Reconcile.
  const { data: rerouted, error: rerouteErr } = await supabase
    .from('orders')
    .update({ product_code: realProductCode, needs_review: false })
    .eq('product_code', stubCode)
    .select('id')
  if (rerouteErr) throw new Error(`Rerouting orders from ${stubCode}: ${rerouteErr.message}`)

  // products.code uses ON DELETE — no cascade on orders.product_code; the FK
  // would block this delete if any order still pointed at the stub. The
  // update above moves them all off, so the delete is safe.
  const { error: delErr } = await supabase.from('products').delete().eq('id', stub.id)
  if (delErr) throw new Error(`Deleting stub ${stubCode}: ${delErr.message}`)

  const orderIds = (rerouted || []).map((r) => r.id)
  let scheduled = 0
  if (orderIds.length > 0) {
    const sched = await rescheduleByIds(orderIds)
    scheduled = sched.scheduled
  }
  return { rerouted: orderIds, scheduled, deletedStub: true }
}

// Approve a reconciliation for every order sharing the same Access code.
// Side effects:
//   1. Append originalCode to chosen product's `abbreviations` array
//      (idempotent — won't duplicate if already present).
//   2. Update every pending order with this original_item_code to point at
//      the chosen product and clear needs_review.
//   3. Re-schedule those orders so prod_week/prod_day populate.
//
// Returns { orderIds, scheduled, skipped } so the UI can patch the local
// cache and report the schedule outcome.
export async function approveAllForCode({
  abbreviation,
  chosenProductId,
  chosenProductCode,
  orderIds,
}) {
  if (!abbreviation) throw new Error('abbreviation is required')
  if (!chosenProductId) throw new Error('chosenProductId is required')
  if (!chosenProductCode) throw new Error('chosenProductCode is required')
  if (!orderIds || orderIds.length === 0) throw new Error('orderIds is required')

  // 1. Save the alias so future imports of this code auto-link.
  await appendAbbreviation(chosenProductId, abbreviation)

  // 2. Reroute every selected order to the chosen product, unconditionally.
  //    This is the contract the user expects: "I picked this product, link
  //    these orders to it." No exceptions for whether the previous product
  //    was a stub, had parts, etc.
  const { error: updErr } = await supabase
    .from('orders')
    .update({ product_code: chosenProductCode, needs_review: false })
    .in('id', orderIds)
  if (updErr) throw new Error(`Rerouting orders: ${updErr.message}`)

  // 2b. Default missing dispatch day to Monday (1). Access sometimes exports
  //     orders with Send week set but DDay blank — the scheduler refuses
  //     without both, leaving orders permanently unscheduled. Pick a default
  //     so Approve actually completes; the user can still edit a specific
  //     day on the order later.
  const { error: ddayErr } = await supabase
    .from('orders')
    .update({ send_day: 1 })
    .in('id', orderIds)
    .is('send_day', null)
    .not('send_week', 'is', null)
  if (ddayErr) throw new Error(`Defaulting dispatch day: ${ddayErr.message}`)

  // 3. Re-schedule them so prod_week / prod_day populate immediately and
  //    they fall off the Reconcile list on next refresh.
  const sched = await rescheduleByIds(orderIds)
  return {
    orderIds,
    scheduled: sched.scheduled,
    skipped: sched.skipped,
    skippedReasons: sched.skippedReasons,
  }
}

// Single-order variant. Same semantics, just one row.
export async function approveReconciliation({
  orderId,
  originalCode,
  chosenProductId,
  chosenProductCode,
}) {
  if (!orderId) throw new Error('orderId is required')
  if (!originalCode) throw new Error('originalCode is required')
  if (!chosenProductId) throw new Error('chosenProductId is required')
  if (!chosenProductCode) throw new Error('chosenProductCode is required')

  await appendAbbreviation(chosenProductId, originalCode)

  const { error } = await supabase
    .from('orders')
    .update({ product_code: chosenProductCode, needs_review: false })
    .eq('id', orderId)
  if (error) throw new Error(`Updating order: ${error.message}`)

  const sched = await rescheduleByIds([orderId])
  return { orderIds: [orderId], ...sched }
}

// Mark a product as dispatch-only (supplier-assembled, no machine routing).
// Then re-schedule the supplied orders so the scheduler uses the dispatch
// path (send date - dispatch buffer). Used by the Reconcile card's
// "Dispatch only" quick action — flips the flag on whatever product is
// currently linked to the orders.
//
// Returns { orderIds, scheduled }.
export async function markProductDispatchOnly({ productId, orderIds = [] }) {
  if (!productId) throw new Error('productId is required')

  const { error: pErr } = await supabase
    .from('products')
    .update({ is_dispatch_only: true })
    .eq('id', productId)
  if (pErr) throw new Error(`Marking dispatch-only: ${pErr.message}`)

  // Also clear needs_review on these orders so the card disappears once the
  // schedule populates.
  if (orderIds.length > 0) {
    const { error: oErr } = await supabase
      .from('orders')
      .update({ needs_review: false })
      .in('id', orderIds)
    if (oErr) throw new Error(`Clearing needs_review: ${oErr.message}`)
  }

  const sched = await rescheduleByIds(orderIds)
  return {
    orderIds,
    scheduled: sched.scheduled,
    skipped: sched.skipped,
    skippedReasons: sched.skippedReasons,
  }
}

// Delete a batch of orders outright. Used by the Reconcile "Discard order(s)"
// action for items that aren't real production work (Transport, quote-only
// lines). Returns the number of rows removed.
export async function discardOrders(orderIds) {
  if (!orderIds || orderIds.length === 0) return { deleted: 0 }
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .in('id', orderIds)
    .select('id')
  if (error) throw new Error(`Discarding orders: ${error.message}`)
  return { deleted: (data || []).length }
}

// Flag every order that isn't on a calendar (prod_week null) as needs_review
// so it surfaces on the Reconcile screen for manual re-linking. Catches the
// full set of "needs my attention" cases — wrong product picked, routing-less
// product, missing dispatch info, anything that prevented scheduling.
//
// Returns { reflagged }.
export async function reflagOrphanStubs() {
  const { data, error } = await supabase
    .from('orders')
    .update({ needs_review: true })
    .is('prod_week', null)
    .eq('needs_review', false)
    .select('id')
  if (error) throw new Error(`Re-flagging unscheduled orders: ${error.message}`)
  return { reflagged: (data || []).length }
}

// Remove an abbreviation from a product. Any orders that resolved through
// this abbreviation get re-flagged as needs_review so they reappear on the
// Reconcile screen for re-mapping. Used by the chip editor on the Products
// page when the user clicks "X" on an abbreviation that was mis-mapped.
//
// Returns { abbreviations, reflaggedOrderIds }.
export async function removeAbbreviation({ productId, productCode, abbreviation }) {
  if (!productId) throw new Error('productId is required')
  if (!abbreviation) throw new Error('abbreviation is required')

  const { data: product, error: readErr } = await supabase
    .from('products')
    .select('abbreviations')
    .eq('id', productId)
    .single()
  if (readErr) throw new Error(`Reading product abbreviations: ${readErr.message}`)

  const next = (product.abbreviations || []).filter((a) => a !== abbreviation)
  const { error: updErr } = await supabase
    .from('products')
    .update({ abbreviations: next })
    .eq('id', productId)
  if (updErr) throw new Error(`Saving abbreviations: ${updErr.message}`)

  // Re-flag any orders that came in via this abbreviation and are still
  // pointing at this product — they need to be re-reconciled.
  const { data: reflagged, error: reflagErr } = await supabase
    .from('orders')
    .update({ needs_review: true })
    .eq('original_item_code', abbreviation)
    .eq('product_code', productCode)
    .select('id')
  if (reflagErr) throw new Error(`Re-flagging orders: ${reflagErr.message}`)

  return {
    abbreviations: next,
    reflaggedOrderIds: (reflagged || []).map((r) => r.id),
  }
}
