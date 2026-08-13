import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import OrderDetailView from './OrderDetailView'
import { useAppData } from '../store/AppDataContext'

// Global "Find Order" search dialog. Available from every screen's topbar
// except Options. Type to filter all orders by Kwitasie #, product code/name,
// or customer code/name. Click an order to see every field we have for it,
// including a freshly-computed CR.

const styles = `
.fom-overlay {
  position: fixed; inset: 0; z-index: 250;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.fom-modal {
  background: var(--surface, #fff);
  border: 1px solid var(--hairline, rgba(0,0,0,0.08));
  border-radius: var(--r-lg, 20px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.12);
  width: 100%; max-width: 640px; max-height: 92vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.fom-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08));
  background: var(--surface-2, #fafafa);
}
.fom-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--ink, #1a1d24); letter-spacing: -0.015em; }
.fom-head .fom-close, .fom-head .fom-back {
  appearance: none; border: 0; background: transparent;
  width: 30px; height: 30px; border-radius: 7px;
  color: var(--ink-3, #8a8e99); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.fom-head .fom-close { margin-left: auto; }
.fom-head .fom-close:hover, .fom-head .fom-back:hover { background: var(--surface, #fff); color: var(--ink, #1a1d24); }

.fom-search {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06));
}
.fom-search .ic { color: var(--ink-3, #8a8e99); flex-shrink: 0; }
.fom-search input {
  flex: 1; border: 0; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--ink, #1a1d24);
}
.fom-search input::placeholder { color: var(--ink-3, #8a8e99); }

.fom-results {
  overflow-y: auto; max-height: 60vh;
  padding: 6px;
}
.fom-result {
  appearance: none; border: 0; background: transparent;
  width: 100%; text-align: left;
  display: grid; grid-template-columns: 80px 1fr auto; gap: 12px; align-items: center;
  padding: 10px 12px; border-radius: 9px; cursor: pointer;
  font: inherit;
}
.fom-result:hover { background: var(--surface-2, #fafafa); }
.fom-result .ord-id { color: var(--amber, #e89a3c); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.fom-result .prod { font-size: 13px; color: var(--ink, #1a1d24); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fom-result .prod .qty { color: var(--ink-3, #8a8e99); font-size: 12px; font-weight: 500; margin-left: 6px; }
.fom-result .cust { font-size: 12px; color: var(--ink-2, #4a4e5a); font-weight: 500; white-space: nowrap; }

.fom-state {
  padding: 24px 16px; text-align: center;
  color: var(--ink-3, #8a8e99); font-size: 13px; font-weight: 500;
}
.fom-state.err { color: var(--red, #d2533a); }

.fom-detail-wrap { overflow-y: auto; max-height: 70vh; }
`

export default function FindOrderModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  // Read from the in-memory cache — opening this modal used to fire 3
  // separate Supabase selects, which on a slow connection felt sluggish.
  // The cache already has every order enriched with product/customer names.
  const { enrichedOrders, loading, error } = useAppData()

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(null)
  }, [open])

  const orders = enrichedOrders || []
  const err = error || ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders.slice(0, 80)
    return orders.filter((o) =>
      String(o.kwitasie_nr || '').toLowerCase().includes(q) ||
      String(o.ord_nr || '').toLowerCase().includes(q) ||
      String(o.product_code || '').toLowerCase().includes(q) ||
      String(o.product_name || '').toLowerCase().includes(q) ||
      String(o.customer_code || '').toLowerCase().includes(q) ||
      String(o.customer_name || '').toLowerCase().includes(q),
    ).slice(0, 150)
  }, [query, orders])

  if (!open) return null

  return (
    <>
      <style>{styles}</style>
      <div className="fom-overlay" onClick={onClose}>
        <div className="fom-modal" onClick={(e) => e.stopPropagation()}>
          <div className="fom-head">
            {selected && (
              <button type="button" className="fom-back" onClick={() => setSelected(null)} aria-label="Back to search">
                <ArrowLeft size={16} />
              </button>
            )}
            <h3>{selected ? `Order ${selected.ord_nr || selected.kwitasie_nr || ''}` : 'Find Order'}</h3>
            <button type="button" className="fom-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {!selected && (
            <>
              <div className="fom-search">
                <Search size={15} className="ic" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Order #, product, customer…"
                />
              </div>
              <div className="fom-results">
                {loading && <div className="fom-state">Loading…</div>}
                {err && <div className="fom-state err">{err}</div>}
                {!loading && !err && filtered.length === 0 && (
                  <div className="fom-state">{query ? 'No matches' : 'No orders yet.'}</div>
                )}
                {!loading && !err && filtered.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    className="fom-result"
                    onClick={() => setSelected(o)}
                  >
                    <span className="ord-id">
                      {o.ord_nr || o.kwitasie_nr || '—'}
                      {o.ord_nr && o.kwitasie_nr && (
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--ink-3, #8a8e99)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          kw {o.kwitasie_nr}
                        </span>
                      )}
                    </span>
                    <span className="prod">{o.product_name}<span className="qty">×{o.qty}</span></span>
                    <span className="cust">{o.customer_name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {selected && (
            <div className="fom-detail-wrap">
              <OrderDetailView order={selected} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

