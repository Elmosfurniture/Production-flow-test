import { useMemo, useState } from 'react'
import {
  AlertTriangle, Check, ChevronRight, Loader2,
  PackageSearch, Search, Sparkles, Trash2, Truck, Wand2, X,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import { useAppData } from '../store/AppDataContext'
import { canEdit } from '../lib/auth'
import {
  approveAllForCode,
  discardOrders,
  markProductDispatchOnly,
  reflagOrphanStubs,
  suggestProducts,
} from '../lib/reconcile'
import { bottleneckMinutes, recalculateAll } from '../lib/scheduling'

const DEPT_LABEL = {
  steel: 'Steel', wood: 'Wood', upholstery: 'Upholstery', dispatch: 'Dispatch', other: 'Other',
}

const styles = `
:root {
  --bg: #f4f2ee; --bg-2: #ece8e0;
  --surface: #ffffff; --surface-2: #fbf9f5; --surface-3: #f1eee7;
  --ink: #1a1d24; --ink-2: #4a4e5a; --ink-3: #8a8e99;
  --hairline: rgba(26,29,36,0.08); --hairline-2: rgba(26,29,36,0.12);
  --navy: #1f2a44; --navy-2: #2a3656; --navy-soft: rgba(31,42,68,0.08);
  --amber: #e89a3c; --amber-2: #f0ae5c; --amber-soft: rgba(232,154,60,0.14);
  --red: #d2533a; --red-soft: rgba(210,83,58,0.10);
  --green: #4caf6a; --green-soft: rgba(76,175,106,0.12);
  --blue: #4677c8; --blue-soft: rgba(70,119,200,0.12);
  --purple: #8b5fbf; --purple-soft: rgba(139,95,191,0.12);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 20px rgba(26,29,36,0.04);
  --r-md: 16px;
}
[data-theme="dark"] {
  --bg: #0e1118; --bg-2: #131722;
  --surface: #1a1f2c; --surface-2: #20263488; --surface-3: #232938;
  --ink: #f1f2f5; --ink-2: #b8bcc8; --ink-3: #7c8090;
  --hairline: rgba(255,255,255,0.07); --hairline-2: rgba(255,255,255,0.12);
  --navy: #2e3d63; --navy-soft: rgba(88,114,180,0.18);
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; min-height: 100vh;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: var(--ink); letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%);
}

.main { padding: 22px 28px 60px; min-width: 0; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 22px; flex-wrap: wrap; }
.topbar h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.1; color: var(--ink); }
.topbar .sub { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
.topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ibtn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; padding: 9px 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.ibtn .ic { width: 15px; height: 15px; color: var(--ink-2); }

.empty {
  background: var(--surface); border: 1px solid var(--hairline);
  border-radius: var(--r-md); padding: 40px 24px;
  text-align: center; box-shadow: var(--shadow-card);
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.empty .ic-wrap { width: 56px; height: 56px; border-radius: 16px; background: var(--green-soft); color: var(--green); display: flex; align-items: center; justify-content: center; }
.empty h2 { font-size: 18px; font-weight: 600; margin: 0; color: var(--ink); }
.empty p { font-size: 13px; color: var(--ink-2); margin: 0; max-width: 420px; }

.intro {
  background: var(--surface); border: 1px solid var(--hairline);
  border-radius: var(--r-md); padding: 14px 18px; margin-bottom: 16px;
  box-shadow: var(--shadow-card); font-size: 13px; color: var(--ink-2);
  display: flex; align-items: center; gap: 12px;
}
.intro .badge {
  background: var(--amber-soft); color: var(--amber);
  font-size: 11px; font-weight: 700; padding: 4px 10px;
  border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase;
}
.intro b { color: var(--ink); font-weight: 600; }

.grid { display: flex; flex-direction: column; gap: 14px; }

.card {
  background: var(--surface); border: 1px solid var(--hairline);
  border-radius: var(--r-md); padding: 18px 20px;
  box-shadow: var(--shadow-card);
  display: flex; flex-direction: column; gap: 14px;
}

.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.card-head .ttl { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.card-head .code {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; color: var(--ink);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}
.card-head .code .dept {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 999px;
  background: var(--navy-soft); color: var(--navy);
}
.card-head .desc { font-size: 13px; color: var(--ink-2); line-height: 1.4; }
.card-head .count-pill {
  background: var(--amber-soft); color: var(--amber);
  font-size: 11px; font-weight: 700; padding: 4px 10px;
  border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase;
  white-space: nowrap;
}

.orders-strip {
  display: flex; flex-wrap: wrap; gap: 6px;
  font-size: 11px; color: var(--ink-3);
}
.orders-strip .chip {
  background: var(--surface-2); border: 1px solid var(--hairline);
  border-radius: 8px; padding: 3px 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  color: var(--ink-2); font-weight: 500;
  display: inline-flex; align-items: center; gap: 6px;
}
.orders-strip .chip b { color: var(--ink); font-weight: 700; }

.section-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3);
  display: flex; align-items: center; gap: 6px;
}
.section-label .ic { width: 12px; height: 12px; }

.suggestions { display: flex; flex-direction: column; gap: 8px; }
.sugg {
  display: flex; align-items: center; gap: 12px;
  background: var(--surface-2); border: 1.5px solid var(--hairline);
  border-radius: 12px; padding: 10px 14px;
  cursor: pointer; transition: border-color 160ms, background 160ms;
  text-align: left; font: inherit; color: var(--ink);
}
.sugg:hover { background: var(--surface-3); border-color: var(--hairline-2); }
.sugg.selected { border-color: var(--navy); background: var(--navy-soft); }
.sugg .radio {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--hairline-2); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface);
}
.sugg.selected .radio { border-color: var(--navy); }
.sugg.selected .radio::after {
  content: ''; width: 8px; height: 8px; border-radius: 50%;
  background: var(--navy);
}
.sugg .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sugg .body .name { font-size: 14px; font-weight: 600; color: var(--ink); }
.sugg .body .meta {
  font-size: 11px; color: var(--ink-3);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.sugg .body .meta .pcode {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  color: var(--ink-2);
}
.sugg .body .meta .tok {
  background: var(--green-soft); color: var(--green);
  padding: 1px 6px; border-radius: 6px; font-weight: 600; font-size: 10px;
}
.sugg .score {
  font-size: 12px; font-weight: 700; color: var(--ink-3);
  font-variant-numeric: tabular-nums; min-width: 36px; text-align: right;
}

.search-wrap { position: relative; }
.search-input {
  width: 100%; padding: 10px 12px 10px 36px;
  background: var(--surface-2); border: 1px solid var(--hairline-2);
  border-radius: 12px; font: inherit; font-size: 13px; color: var(--ink);
  outline: none; transition: border-color 160ms, background 160ms;
}
.search-input:focus { border-color: var(--navy); background: var(--surface); }
.search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--ink-3); pointer-events: none; }

.search-results {
  margin-top: 6px;
  max-height: 220px; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--hairline-2);
  border-radius: 12px;
  display: flex; flex-direction: column;
}
.search-results .row {
  padding: 8px 12px; font-size: 13px; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  border-bottom: 1px solid var(--hairline);
}
.search-results .row:last-child { border-bottom: 0; }
.search-results .row:hover { background: var(--surface-2); }
.search-results .row.selected { background: var(--navy-soft); }
.search-results .row .pcode {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px; color: var(--ink-3); margin-left: auto;
}

.actions {
  display: flex; align-items: center; gap: 10px;
  border-top: 1px solid var(--hairline); padding-top: 12px;
  justify-content: flex-end; flex-wrap: wrap;
}
.actions .picked {
  margin-right: auto; font-size: 12px; color: var(--ink-2);
  display: inline-flex; align-items: center; gap: 6px;
}
.actions .picked b { color: var(--ink); }
.btn-approve {
  appearance: none; background: var(--navy); color: white; border: 0;
  padding: 10px 16px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 600;
  cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 6px 14px rgba(31,42,68,0.22);
}
.btn-approve:hover:not(:disabled) { background: var(--navy-2); }
.btn-approve:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.btn-approve .ic { width: 14px; height: 14px; }
.btn-approve.spinning .ic { animation: rec-spin 800ms linear infinite; }
.btn-ghost {
  appearance: none; background: var(--surface-2); color: var(--ink-2);
  border: 1px solid var(--hairline-2); padding: 9px 12px; border-radius: 12px;
  font: inherit; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.btn-ghost:hover { background: var(--surface); color: var(--ink); }

.fail {
  background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25);
  color: var(--red); border-radius: 10px; padding: 8px 12px;
  font-size: 12px; display: flex; align-items: center; gap: 8px;
}

@keyframes rec-spin { to { transform: rotate(360deg); } }
`

// Group orders by their original_item_code so the user reconciles each raw
// code once even when many orders share it. The first order in each group
// provides the description used for fuzzy matching.
function groupByOriginalCode(pendingOrders) {
  const byCode = new Map()
  for (const o of pendingOrders) {
    const code = o.original_item_code || o.product_code
    if (!code) continue
    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code).push(o)
  }
  return [...byCode.entries()]
    .map(([code, orders]) => ({
      code,
      orders,
      description: orders[0].description || '',
      department: orders[0].department,
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

function ReconcileCard({ group, products, productByCode, onApproved, onRefresh, canModify }) {
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyKind, setBusyKind] = useState(null)
  const [err, setErr] = useState(null)

  // The product currently linked to these orders — needed for the "Mark
  // dispatch-only" quick action, which flips a flag on THIS product rather
  // than swapping the order to a different one.
  const linkedProduct = useMemo(() => {
    const firstOrderCode = group.orders[0]?.product_code
    if (!firstOrderCode || !productByCode) return null
    return productByCode.get(firstOrderCode) || null
  }, [group.orders, productByCode])

  // Top 3 fuzzy matches; recomputed only when products or this group change.
  const suggestions = useMemo(
    () => suggestProducts(
      { rawCode: group.code, description: group.description, department: group.department },
      products,
      3,
    ),
    [products, group.code, group.description, group.department],
  )

  // Search results: filter the full product list down to 30 matches against
  // either code or description, case-insensitive substring on a single query.
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return products
      .filter((p) =>
        String(p.code || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q),
      )
      .slice(0, 30)
  }, [products, search])

  const handleApprove = async () => {
    if (!selected || !canModify) return
    setBusy(true); setBusyKind('approve'); setErr(null)
    try {
      const result = await approveAllForCode({
        abbreviation: group.code,
        chosenProductId: selected.id,
        chosenProductCode: selected.code,
        orderIds: group.orders.map((o) => o.id),
      })
      // Patch local cache so the card disappears immediately. Refresh
      // populates prod_week/prod_day from the auto-reschedule.
      onApproved(group.orders.map((o) => o.id), selected.code)
      await onRefresh()
      // Heads-up if the reroute worked but scheduling silently dropped some.
      // The scheduler reports WHY (noRouting / zeroMinutes / noSendDate /
      // noQty), so surface that instead of guessing.
      if (result && typeof result.scheduled === 'number') {
        const expected = group.orders.length
        if (result.scheduled < expected) {
          const r = result.skippedReasons || {}
          const reasons = []
          if (r.noRouting) reasons.push(`${r.noRouting} no routing on chosen product`)
          if (r.zeroMinutes) reasons.push(`${r.zeroMinutes} zero machine minutes (qty_per_unit × seconds_per_part = 0)`)
          if (r.noSendDate) reasons.push(`${r.noSendDate} no dispatch date on order`)
          if (r.noQty) reasons.push(`${r.noQty} invalid order qty`)
          const why = reasons.length > 0 ? reasons.join(' · ') : 'unknown reason'
          setErr(`Linked to ${selected.code}, but ${expected - result.scheduled} of ${expected} couldn't schedule: ${why}.`)
        }
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false); setBusyKind(null)
    }
  }

  // Quick action: mark the order's currently-linked product as dispatch-only.
  // The scheduler then uses send_date - dispatch buffer for these orders, no
  // routing needed. Future orders of the same product auto-handle.
  const handleDispatchOnly = async () => {
    if (!linkedProduct || !canModify) return
    if (!window.confirm(
      `Mark "${linkedProduct.description || linkedProduct.code}" as dispatch-only?\n\n` +
      `It will schedule directly off the dispatch date — no machine routing required.\n` +
      `Every order for this product (now and in future imports) will use this path.`,
    )) return
    setBusy(true); setBusyKind('dispatch'); setErr(null)
    try {
      const result = await markProductDispatchOnly({
        productId: linkedProduct.id,
        orderIds: group.orders.map((o) => o.id),
      })
      onApproved(group.orders.map((o) => o.id), linkedProduct.code)
      await onRefresh()
      if (result.scheduled < group.orders.length) {
        const r = result.skippedReasons || {}
        const reasons = []
        if (r.noSendDate) reasons.push(`${r.noSendDate} no dispatch date`)
        if (r.noQty) reasons.push(`${r.noQty} invalid qty`)
        const why = reasons.length > 0 ? reasons.join(' · ') : 'unknown reason'
        setErr(`Marked dispatch-only, but ${group.orders.length - result.scheduled} couldn't schedule: ${why}.`)
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false); setBusyKind(null)
    }
  }

  // Quick action: delete the orders outright (Transport / quote-only lines).
  const handleDiscard = async () => {
    if (!canModify) return
    const n = group.orders.length
    if (!window.confirm(
      `Discard ${n} order${n === 1 ? '' : 's'} for "${group.code}"?\n\nThis permanently deletes them — only do this for non-production lines like Transport.`,
    )) return
    setBusy(true); setBusyKind('discard'); setErr(null)
    try {
      await discardOrders(group.orders.map((o) => o.id))
      // No local optimistic patch — deleted rows shouldn't sit in the cache
      // with a null product_code. Wait for refresh to drop them cleanly.
      await onRefresh()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false); setBusyKind(null)
    }
  }

  const totalQty = group.orders.reduce((sum, o) => sum + (o.qty || 0), 0)
  const deptLabel = DEPT_LABEL[group.department] || group.department || '—'
  const selectedFromSearch = selected && !suggestions.some((s) => s.product.id === selected.id)

  return (
    <div className="card">
      <div className="card-head">
        <div className="ttl">
          <div className="code">
            <span>{group.code}</span>
            <span className="dept">{deptLabel}</span>
          </div>
          {group.description && <div className="desc">{group.description}</div>}
        </div>
        <span className="count-pill">
          {group.orders.length} order{group.orders.length === 1 ? '' : 's'} · {totalQty} pcs
        </span>
      </div>

      <div className="orders-strip">
        {group.orders.slice(0, 8).map((o) => (
          <span key={o.id} className="chip">
            Kw <b>{o.kwitasie_nr}</b> · {o.qty}
          </span>
        ))}
        {group.orders.length > 8 && (
          <span className="chip">+{group.orders.length - 8} more</span>
        )}
      </div>

      {suggestions.length > 0 ? (
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            <Sparkles size={12} strokeWidth={2.4} /> Suggested matches (with machine routing)
          </div>
          <div className="suggestions">
            {suggestions.map(({ product, score, matches }) => {
              const isSel = selected?.id === product.id
              return (
                <button
                  key={product.id}
                  type="button"
                  className={`sugg ${isSel ? 'selected' : ''}`}
                  onClick={() => setSelected(product)}
                  disabled={busy}
                >
                  <span className="radio" />
                  <div className="body">
                    <div className="name">{product.description || product.code}</div>
                    <div className="meta">
                      <span className="pcode">{product.code}</span>
                      {matches.slice(0, 4).map((m) => (
                        <span key={m} className="tok">{m}</span>
                      ))}
                    </div>
                  </div>
                  <span className="score">{Math.round(score * 100)}%</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="fail" style={{ background: 'var(--amber-soft)', borderColor: 'rgba(232,154,60,0.25)', color: 'var(--amber)' }}>
          <PackageSearch size={14} />
          No product with machine routing matches this code. Either add routing to a similar product on the <b>&nbsp;Products&nbsp;</b> page, or search the full catalogue below.
        </div>
      )}

      <div>
        <div className="section-label" style={{ marginBottom: 8 }}>
          <Search size={12} strokeWidth={2.4} /> Search {products.length} products with routing
        </div>
        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input
            className="search-input"
            placeholder="Type a name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={busy}
          />
        </div>
        {searchHits.length > 0 && (
          <div className="search-results">
            {searchHits.map((p) => {
              const isSel = selected?.id === p.id
              return (
                <div
                  key={p.id}
                  className={`row ${isSel ? 'selected' : ''}`}
                  onClick={() => { setSelected(p); setSearch('') }}
                >
                  <span>{p.description || p.code}</span>
                  <span className="pcode">{p.code}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {err && (
        <div className="fail">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      <div className="actions">
        {selected ? (
          <span className="picked">
            <Check size={13} strokeWidth={2.4} style={{ color: 'var(--green)' }} />
            Selected <b>{selected.description || selected.code}</b>
            {selectedFromSearch && <span style={{ color: 'var(--ink-3)' }}> (from search)</span>}
          </span>
        ) : (
          <span className="picked" style={{ color: 'var(--ink-3)' }}>
            Pick a product above, or use a quick action →
          </span>
        )}
        {/* Quick action: supplier-assembled product — flag dispatch-only on
            the currently-linked product. */}
        {linkedProduct && (
          <button
            type="button"
            className="btn-ghost"
            onClick={handleDispatchOnly}
            disabled={busy || !canModify}
            title="Mark the linked product as dispatch-only — schedules off dispatch date with no machine routing"
          >
            <Truck size={12} strokeWidth={2.4} /> Dispatch-only
          </button>
        )}
        {/* Quick action: not a real production line, delete the orders. */}
        <button
          type="button"
          className="btn-ghost"
          onClick={handleDiscard}
          disabled={busy || !canModify}
          title="Delete these orders — use for Transport and other non-production line items"
          style={{ color: 'var(--red)', borderColor: 'rgba(210,83,58,0.25)' }}
        >
          <Trash2 size={12} strokeWidth={2.4} /> Discard
        </button>
        {selected && (
          <button className="btn-ghost" onClick={() => setSelected(null)} disabled={busy}>
            <X size={12} strokeWidth={2.4} /> Clear
          </button>
        )}
        <button
          className={`btn-approve ${busy && busyKind === 'approve' ? 'spinning' : ''}`}
          disabled={!selected || busy || !canModify}
          onClick={handleApprove}
        >
          {busy && busyKind === 'approve'
            ? (<><Loader2 size={14} strokeWidth={2.4} className="ic" /> Saving…</>)
            : (<><Check size={14} strokeWidth={2.4} className="ic" /> Approve {group.orders.length} order{group.orders.length === 1 ? '' : 's'} <ChevronRight size={14} strokeWidth={2.4} className="ic" /></>)
          }
        </button>
      </div>
    </div>
  )
}

export default function ReconcileScreen() {
  const { orders, products, routingByCode, productByCode, applyOrdersReconciled, refresh } = useAppData()
  const canModify = canEdit()
  const [sweepBusy, setSweepBusy] = useState(false)

  // A product is "schedulable" if either it has real routing (bottleneck
  // minutes > 0 at qty=1) OR it's flagged dispatch-only (supplier-assembled,
  // skips routing and schedules off dispatch date). Mirrors the same two
  // paths the scheduler itself uses.
  const productsWithRouting = useMemo(() => {
    const ok = new Set()
    for (const p of products) {
      if (p.is_dispatch_only) { ok.add(p.id); continue }
      const routing = routingByCode?.get(p.code) || []
      const { totalMinutes } = bottleneckMinutes(routing, 1)
      if (totalMinutes > 0) ok.add(p.id)
    }
    return ok
  }, [products, routingByCode])

  // Show anything that isn't on a calendar — no clicking, no flag-hunting.
  // After Approve, the order's prod_week populates (or needs_review clears)
  // and it drops off the list automatically.
  const pending = useMemo(
    () => orders.filter((o) => o.needs_review || o.prod_week == null),
    [orders],
  )
  const groups = useMemo(() => groupByOriginalCode(pending), [pending])

  // One-click bulk-flag for the legacy auto-stubs from older imports: any
  // product that has zero parts AND has orders pointing at it gets its orders
  // flagged needs_review, so they show up here grouped and the user can map
  // each stub to a real product in one screen instead of editing products
  // one by one.
  const handleSweep = async () => {
    if (!canModify) return
    setSweepBusy(true)
    try {
      // 1. Schedule everything that already has good routing — wipes out the
      //    easy wins and avoids cluttering Reconcile with them.
      const sched = await recalculateAll()
      // 2. Flag whatever's STILL unscheduled afterwards so it shows up here
      //    for manual re-linking.
      const { reflagged } = await reflagOrphanStubs()
      await refresh()
      const lines = []
      if (sched.scheduled > 0) lines.push(`Scheduled ${sched.scheduled} order${sched.scheduled === 1 ? '' : 's'} that already had routing.`)
      if (reflagged > 0) lines.push(`Flagged ${reflagged} order${reflagged === 1 ? '' : 's'} that still need a product picked — they're grouped on this screen.`)
      if (lines.length === 0) lines.push('Nothing to do — every order is already on a calendar.')
      alert(lines.join('\n'))
    } catch (e) {
      alert(`Sweep failed: ${e?.message || e}`)
    } finally {
      setSweepBusy(false)
    }
  }

  // Only offer products that can actually schedule. Picking a routing-less
  // product was the trap behind every "linked but couldn't schedule" failure.
  const schedulableProducts = useMemo(
    () => products
      .filter((p) => productsWithRouting.has(p.id))
      .sort((a, b) => (a.description || a.code || '').localeCompare(b.description || b.code || '')),
    [products, productsWithRouting],
  )

  return (
    <div className="app">
      <style>{styles}</style>
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Reconcile Orders</h1>
            <div className="sub">
              Link Access product codes to real products — once you confirm a match, it's remembered for future imports.
            </div>
          </div>
          <div className="topbar-actions">
            {canModify && (
              <button
                type="button"
                className="ibtn"
                onClick={handleSweep}
                disabled={sweepBusy}
                title="Scan the catalogue for stub products (no parts) and flag every order still linked to one"
              >
                {sweepBusy
                  ? (<><Loader2 size={15} strokeWidth={2} className="ic" style={{ animation: 'rec-spin 800ms linear infinite' }} /> Scanning…</>)
                  : (<><Wand2 size={15} strokeWidth={2} className="ic" /> Find unmapped products</>)}
              </button>
            )}
            <TopbarActions iconSize={15} />
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="empty">
            <div className="ic-wrap"><Check size={28} strokeWidth={2} /></div>
            <h2>Nothing to reconcile</h2>
            <p>
              Every imported order is already linked to a real product.
              Imported codes that don't match anything in the catalogue land here for you to map.
            </p>
          </div>
        ) : (
          <>
            <div className="intro">
              <span className="badge">{pending.length} pending</span>
              <span>
                <b>{groups.length}</b> unique code{groups.length === 1 ? '' : 's'} from the latest import.
                Pick the real product for each — orders move to <b>Priority</b> as soon as they're approved.
              </span>
            </div>
            <div className="grid">
              {groups.map((group) => (
                <ReconcileCard
                  key={group.code}
                  group={group}
                  products={schedulableProducts}
                  productByCode={productByCode}
                  onApproved={applyOrdersReconciled}
                  onRefresh={refresh}
                  canModify={canModify}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
