import { useEffect, useState } from 'react'
import { crBand, crReason, dayLabel, formatCR } from '../lib/priority'
import {
  bottleneckMinutes,
  fetchRoutings,
  loadScheduleConfig,
  minutesToWorkDays,
  orderSendDate,
  workDaysUntil,
} from '../lib/scheduling'

// Detail panel for a single order. Self-contained: when given a base order
// (the columns you'd select from `orders`), it computes a fresh CR via the
// routings + schedule config and renders every field we have for it.
// Used by FindOrderModal and DayModal.

const styles = `
.odv-wrap { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 20px; }
.odv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
.odv-row { display: flex; flex-direction: column; gap: 2px; }
.odv-row .lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3, #8a8e99); }
.odv-row .val { font-size: 14px; font-weight: 500; color: var(--ink, #1a1d24); font-variant-numeric: tabular-nums; }
.odv-row .val.muted { color: var(--ink-3, #8a8e99); font-style: italic; }
.odv-cr {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px;
}
.odv-cr.ok { background: var(--green-soft, rgba(76,175,106,0.12)); color: var(--green, #4caf6a); }
.odv-cr.mid { background: var(--yellow-soft, rgba(212,165,49,0.14)); color: var(--yellow, #d4a531); }
.odv-cr.warn { background: var(--amber-soft, rgba(232,154,60,0.14)); color: var(--amber, #e89a3c); }
.odv-cr.danger { background: var(--red-soft, rgba(210,83,58,0.10)); color: var(--red, #d2533a); }
.odv-cr.unknown { background: var(--surface-2, #fafafa); color: var(--ink-3, #8a8e99); }
.odv-cr b { font-size: 18px; font-variant-numeric: tabular-nums; }
.odv-cr .reason { margin-left: auto; font-size: 11px; font-weight: 500; text-align: right; max-width: 60%; }
.odv-notes {
  background: var(--surface-2, #fafafa);
  border: 1px solid var(--hairline, rgba(0,0,0,0.08));
  border-radius: 10px; padding: 10px 14px;
  font-size: 13px; line-height: 1.5; color: var(--ink, #1a1d24);
  white-space: pre-wrap;
}
.odv-due {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 12px;
  background: var(--red-soft, rgba(210,83,58,0.10));
  color: var(--red, #d2533a);
  border: 1.5px solid rgba(210,83,58,0.35);
}
.odv-due .lbl { font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.odv-due .date { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1; }
.odv-due .tag { margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
`

export default function OrderDetailView({ order }) {
  const [detail, setDetail] = useState({ ...order, cr: null, cr_band: 'unknown', bottleneck: null })

  useEffect(() => {
    if (!order) return
    let cancelled = false
    setDetail({ ...order, cr: null, cr_band: 'unknown', bottleneck: null })
    Promise.all([
      fetchRoutings([order.product_code]),
      loadScheduleConfig().catch(() => ({ holidays: new Set(), bufferDaysByDept: new Map() })),
    ]).then(([routings, config]) => {
      if (cancelled) return
      const routing = routings.get(order.product_code) || []
      const { bottleneck, totalMinutes } = bottleneckMinutes(routing, order.qty || 0)
      const ttp = totalMinutes > 0 ? minutesToWorkDays(totalMinutes) : null
      // CR target date: prefer the customer-committed due_date if it's set;
      // otherwise fall back to the planned send_week/send_day (same as the
      // Priority/Dashboard screens use). Without this fallback, orders that
      // never had a due_date imported display "n/a" here while showing a
      // real CR on every other screen — confusing.
      const targetDateStr = order.due_date || orderSendDate(order)
      const ttd = targetDateStr ? workDaysUntil(targetDateStr, config.holidays) : null
      const cr = (ttp != null && ttd != null) ? ttd / ttp : null
      setDetail({
        ...order,
        bottleneck,
        total_minutes: totalMinutes,
        ttp_days: ttp,
        ttd_days: ttd,
        cr,
        cr_band: crBand(cr),
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [order])

  if (!order) return null
  const reason = detail.cr == null ? crReason(detail) : null

  // Wood type only matters for wood-side products. Mirror detectDepartment's
  // wood-keyword list so a Furn/Chair/CNC/Moulder order shows the timber while
  // pure-steel orders hide the field.
  const groupStr = String(detail.group || '').toLowerCase()
  const showWood = /furn|chair|moulder|cnc/.test(groupStr) || detail.department === 'wood'

  return (
    <>
      <style>{styles}</style>
      <div className="odv-wrap">
        {detail.due_date && (
          <div className="odv-due">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="lbl">Due date</span>
              <span className="date">{detail.due_date}</span>
            </div>
            <span className="tag">Customer commitment</span>
          </div>
        )}

        <div className={`odv-cr ${detail.cr_band || 'unknown'}`}>
          <b>{formatCR(detail.cr)}</b>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 700 }}>CR</span>
          {reason && <span className="reason">{reason}</span>}
          {!reason && detail.bottleneck && <span className="reason">Bottleneck: {detail.bottleneck}</span>}
        </div>

        <div className="odv-grid">
          <div className="odv-row"><span className="lbl">Kwitasie #</span><span className="val">{detail.kwitasie_nr}</span></div>
          <div className="odv-row"><span className="lbl">Ord #</span><span className={`val ${!detail.ord_nr ? 'muted' : ''}`}>{detail.ord_nr || 'none'}</span></div>
          <div className="odv-row"><span className="lbl">Quantity</span><span className="val">{detail.qty}</span></div>
          <div className="odv-row"><span className="lbl">Group</span><span className={`val ${!detail.group ? 'muted' : ''}`}>{detail.group || '—'}</span></div>
          <div className="odv-row" style={{ gridColumn: '1 / -1' }}>
            <span className="lbl">Product</span>
            <span className="val">{detail.product_name}</span>
            <span className="val" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{detail.product_code}</span>
          </div>
          <div className="odv-row"><span className="lbl">Customer</span><span className="val">{detail.customer_name || detail.customer_code}</span></div>
          <div className="odv-row"><span className="lbl">Department</span><span className="val">{detail.department || '—'}</span></div>
          {showWood && (
            <div className="odv-row"><span className="lbl">Wood type</span><span className={`val ${!detail.wood_type ? 'muted' : ''}`}>{detail.wood_type || '—'}</span></div>
          )}
          <div className="odv-row">
            <span className="lbl">Production</span>
            <span className={`val ${detail.prod_week == null ? 'muted' : ''}`}>
              {detail.prod_week != null ? `Wk ${detail.prod_week} / ${dayLabel(detail.prod_day)}` : 'not scheduled'}
            </span>
          </div>
          <div className="odv-row">
            <span className="lbl">Dispatch (Send)</span>
            <span className={`val ${detail.send_week == null ? 'muted' : ''}`}>
              {detail.send_week != null ? `Wk ${detail.send_week} / ${dayLabel(detail.send_day)}` : 'no dispatch date'}
            </span>
          </div>
          <div className="odv-row"><span className="lbl">Current step</span><span className="val muted">Not tracked yet</span></div>
        </div>

        {detail.notes && (
          <div>
            <div className="odv-row" style={{ marginBottom: 6 }}><span className="lbl">Notes</span></div>
            <div className="odv-notes">{detail.notes}</div>
          </div>
        )}
      </div>
    </>
  )
}
