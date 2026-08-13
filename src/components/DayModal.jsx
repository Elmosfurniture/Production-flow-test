import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import OrderDetailView from './OrderDetailView'

// Popup shown when the user taps a day on the Production Calendar.
// View 1: list of products being produced that day, grouped by department.
// View 2: click a product → full OrderDetailView (CR + everything).

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function deptLabel(d) {
  if (d === 'steel') return 'Steel'
  if (d === 'wood') return 'Wood'
  if (d === 'uphol') return 'Upholstery'
  if (d === 'disp') return 'Dispatch'
  if (d === 'other') return 'Other'
  return 'Unclassified'
}

const styles = `
.dm-overlay {
  position: fixed; inset: 0; z-index: 240;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.dm-modal {
  background: var(--surface, #fff);
  border: 1px solid var(--hairline, rgba(0,0,0,0.08));
  border-radius: var(--r-lg, 20px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.12);
  width: 100%; max-width: 560px; max-height: 92vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.dm-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08));
  background: var(--surface-2, #fafafa);
}
.dm-head .when {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3, #8a8e99);
}
.dm-head h3 {
  margin: 0; font-size: 16px; font-weight: 700;
  color: var(--ink, #1a1d24); letter-spacing: -0.015em;
}
.dm-head .titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dm-head .close, .dm-head .back {
  appearance: none; border: 0; background: transparent;
  width: 30px; height: 30px; border-radius: 7px;
  color: var(--ink-3, #8a8e99); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.dm-head .close { margin-left: auto; }
.dm-head .close:hover, .dm-head .back:hover {
  background: var(--surface, #fff); color: var(--ink, #1a1d24);
}

.dm-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06));
}
.dm-stats .s { display: flex; flex-direction: column; gap: 1px; }
.dm-stats .v {
  font-size: 18px; font-weight: 700; color: var(--ink, #1a1d24);
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1;
}
.dm-stats .l {
  font-size: 9px; font-weight: 700; color: var(--ink-3, #8a8e99);
  letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px;
}

.dm-list { overflow-y: auto; flex: 1; padding: 12px 14px 16px; }
.dm-section + .dm-section { margin-top: 12px; }
.dm-section h4 {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  color: var(--ink-3, #8a8e99); text-transform: uppercase;
  margin: 0 0 6px; display: flex; align-items: center; gap: 6px;
}
.dm-section h4 .count {
  background: var(--surface-3, #f1eee7); color: var(--ink-2, #4a4e5a);
  font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.04em;
}
.dm-row {
  appearance: none; border: 1px solid var(--hairline, rgba(0,0,0,0.08));
  background: var(--surface, #fff);
  display: grid; grid-template-columns: 4px 1fr auto; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 9px; margin-bottom: 5px;
  cursor: pointer; text-align: left; font: inherit;
  width: 100%;
  transition: background 120ms ease, border-color 120ms ease;
}
.dm-row:hover { background: var(--surface-2, #fafafa); border-color: var(--hairline-2, rgba(0,0,0,0.12)); }
.dm-row .bar { align-self: stretch; border-radius: 2px; background: var(--accent, var(--amber, #e89a3c)); }
.dm-row.steel { --accent: var(--blue, #4677c8); }
.dm-row.wood { --accent: var(--green, #4caf6a); }
.dm-row.uphol { --accent: var(--purple, #8b5fbf); }
.dm-row.disp { --accent: var(--amber, #e89a3c); }
.dm-row.other { --accent: var(--ink-3, #8a8e99); }
.dm-row .info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dm-row .info .name {
  font-size: 13px; font-weight: 600; color: var(--ink, #1a1d24);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dm-row .info .meta {
  font-size: 11px; color: var(--ink-3, #8a8e99); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dm-row .qty {
  font-size: 14px; font-weight: 700; color: var(--ink, #1a1d24);
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  text-align: right;
}
.dm-row .qty .lbl {
  font-size: 9px; font-weight: 600; color: var(--ink-3, #8a8e99);
  display: block; letter-spacing: 0.06em; text-transform: uppercase;
  line-height: 1; margin-top: 1px;
}
.dm-empty {
  text-align: center; padding: 28px 16px;
  color: var(--ink-3, #8a8e99); font-size: 13px; font-weight: 500;
}
.dm-detail-wrap { overflow-y: auto; flex: 1; }
`

export default function DayModal({ open, onClose, dateKey, orders, todayKey }) {
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!open) setSelected(null)
  }, [open])

  useEffect(() => {
    setSelected(null)
  }, [dateKey])

  const grouped = useMemo(() => {
    const map = {}
    for (const o of orders || []) {
      const key = o.dept_ui || 'other'
      if (!map[key]) map[key] = []
      map[key].push(o)
    }
    return map
  }, [orders])

  const totalParts = useMemo(
    () => (orders || []).reduce((s, o) => s + (o.qty || 0), 0),
    [orders],
  )

  if (!open || !dateKey) return null

  const d = new Date(`${dateKey}T00:00:00`)
  const isToday = dateKey === todayKey
  const dayLabel = `${DAY_NAMES[d.getDay()]} · ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`

  return (
    <>
      <style>{styles}</style>
      <div className="dm-overlay" onClick={onClose}>
        <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
          <div className="dm-head">
            {selected && (
              <button type="button" className="back" onClick={() => setSelected(null)} aria-label="Back to day list">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="titles">
              <span className="when">{isToday ? 'Today' : 'Day detail'}</span>
              <h3>{selected ? `Order ${selected.kwitasie_nr}` : dayLabel}</h3>
            </div>
            <button type="button" className="close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {!selected && (
            <>
              <div className="dm-stats">
                <div className="s"><span className="v">{(orders || []).length}</span><span className="l">Orders</span></div>
                <div className="s"><span className="v">{totalParts}</span><span className="l">Parts</span></div>
                <div className="s"><span className="v">{Object.keys(grouped).length}</span><span className="l">Depts</span></div>
              </div>
              <div className="dm-list">
                {(!orders || orders.length === 0) && (
                  <div className="dm-empty">No orders scheduled for this day.</div>
                )}
                {Object.entries(grouped).map(([deptKey, list]) => (
                  <div key={deptKey} className="dm-section">
                    <h4>{deptLabel(deptKey)}<span className="count">{list.length}</span></h4>
                    {list.map((o) => (
                      <button
                        key={o.kwitasie_nr}
                        type="button"
                        className={`dm-row ${deptKey}`}
                        onClick={() => setSelected(o)}
                      >
                        <span className="bar" />
                        <div className="info">
                          <span className="name">{o.product_name}</span>
                          <span className="meta">#{o.kwitasie_nr}{o.ord_nr ? ` · Ord ${o.ord_nr}` : ''} · {o.customer_code}</span>
                        </div>
                        <div className="qty">{o.qty}<span className="lbl">qty</span></div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {selected && (
            <div className="dm-detail-wrap">
              <OrderDetailView order={selected} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
