import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, GripVertical, Info, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { useAppData } from '../store/AppDataContext'
import { isoWeekDayToDate } from '../lib/scheduling'
import { loadDayOrder, saveDayOrder, clearDayOrder, loadDayRemoved, setDayPartRemoved } from '../lib/partsDayPlan'

// Sort every part of every item (in the given department) due on a chosen DAY
// into the order the shop should manufacture them — 1 = start first that
// morning, which is also the order they enter the factory on the Schedule
// board. Per-day, manual, drag-and-drop. Saved locally (see partsDayPlan.js)
// — never synced to Supabase.

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateToStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const styles = `
.wps-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(20,22,28,0.45); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.wps { width: min(760px, 100%); max-height: 90vh; display: flex; flex-direction: column; background: var(--surface, #fff); border: 1px solid var(--hairline, rgba(0,0,0,0.08)); border-radius: 20px; box-shadow: 0 24px 60px rgba(0,0,0,0.28); overflow: hidden; }
.wps-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08)); }
.wps-head h3 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink, #1a1d24); }
.wps-head .sub { font-size: 12px; color: var(--ink-2, #4a4e5a); margin-top: 3px; }
.wps-head .x { margin-left: auto; appearance: none; border: 0; background: transparent; color: var(--ink-3, #8a8e99); cursor: pointer; padding: 4px; border-radius: 8px; }
.wps-head .x:hover { background: var(--surface-2, #f5f3ef); color: var(--ink, #1a1d24); }
.wps-days { display: flex; gap: 4px; padding: 12px 20px; border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08)); flex-wrap: wrap; }
.wps-day { appearance: none; border: 1px solid var(--hairline-2, rgba(0,0,0,0.12)); background: var(--surface-2, #f5f3ef); color: var(--ink-2, #4a4e5a); border-radius: 10px; padding: 7px 12px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 64px; }
.wps-day .dn { font-size: 12px; font-weight: 800; color: var(--ink, #1a1d24); }
.wps-day .dd { font-size: 10px; color: var(--ink-3, #8a8e99); }
.wps-day .ct { font-size: 9px; font-weight: 700; color: var(--ink-3, #8a8e99); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
.wps-day[aria-pressed="true"] { background: var(--amber, #e8944a); border-color: var(--amber, #e8944a); }
.wps-day[aria-pressed="true"] .dn, .wps-day[aria-pressed="true"] .dd, .wps-day[aria-pressed="true"] .ct { color: #fff; }
.wps-day[aria-pressed="true"] .dd { color: rgba(255,255,255,0.85); }
.wps-note { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--ink-2, #4a4e5a); background: rgba(70,119,200,0.10); border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08)); padding: 8px 20px; }
.wps-note .ic { color: #4677c8; flex-shrink: 0; }
.wps-list { overflow-y: auto; padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
.wps-empty { padding: 40px 16px; text-align: center; color: var(--ink-3, #8a8e99); font-size: 13px; }
.wps-row { display: grid; grid-template-columns: 34px 22px 1fr auto 34px; align-items: center; gap: 12px; padding: 11px 12px; background: var(--surface-2, #f7f5f1); border: 1px solid var(--hairline, rgba(0,0,0,0.08)); border-radius: 12px; transition: box-shadow 160ms, transform 120ms, background 140ms; }
.wps-del { appearance: none; border: 0; background: transparent; color: var(--ink-3, #8a8e99); cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; }
.wps-del:hover { background: var(--red-soft, rgba(210,83,58,0.10)); color: var(--red, #d2533a); }
.wps-removed { margin-top: 12px; border-top: 1px dashed var(--hairline-2, rgba(0,0,0,0.12)); padding-top: 10px; }
.wps-removed-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--ink-3, #8a8e99); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.wps-removed-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 12px; opacity: 0.75; }
.wps-removed-row .rname { font-size: 13px; color: var(--ink-2, #4a4e5a); text-decoration: line-through; }
.wps-removed-row .rname small { color: var(--ink-3, #8a8e99); text-decoration: none; }
.wps-restore { appearance: none; border: 1px solid var(--hairline-2, rgba(0,0,0,0.12)); background: var(--surface, #fff); color: var(--ink-2, #4a4e5a); font: inherit; font-size: 11px; font-weight: 600; padding: 5px 9px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.wps-restore:hover { color: var(--green, #4caf6a); border-color: rgba(76,175,106,0.4); }
.wps-row:hover { background: var(--surface, #fff); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
.wps-row.dragging { opacity: 0.4; }
.wps-row.drop-target { box-shadow: 0 -3px 0 var(--amber, #e8944a) inset; border-color: var(--amber, #e8944a); }
.wps-rank { width: 30px; height: 30px; border-radius: 999px; background: var(--navy, #1C2B4A); color: #fff; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; justify-content: center; }
.wps-row:nth-child(1) .wps-rank { background: var(--amber, #e8944a); }
.wps-grip { color: var(--ink-3, #8a8e99); cursor: grab; display: inline-flex; }
.wps-grip:active { cursor: grabbing; }
.wps-info .part { font-size: 14px; font-weight: 700; color: var(--ink, #1a1d24); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wps-info .meta { font-size: 11px; color: var(--ink-3, #8a8e99); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wps-info .meta .ord { color: var(--amber-2, #E8944A); font-weight: 700; }
.wps-qty { font-size: 20px; font-weight: 800; color: var(--ink, #1a1d24); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; text-align: right; }
.wps-qty small { display: block; font-size: 8px; font-weight: 700; color: var(--ink-3, #8a8e99); text-transform: uppercase; letter-spacing: 0.08em; }
.wps-foot { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--hairline, rgba(0,0,0,0.08)); }
.wps-foot .reset { appearance: none; border: 1px solid var(--hairline-2, rgba(0,0,0,0.12)); background: var(--surface-2, #f5f3ef); color: var(--ink-2, #4a4e5a); border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.wps-foot .reset:hover { color: var(--red, #d2533a); border-color: rgba(210,83,58,0.4); }
.wps-foot .count { margin-left: auto; font-size: 12px; color: var(--ink-2, #4a4e5a); }
.wps-foot .count b { color: var(--ink, #1a1d24); font-variant-numeric: tabular-nums; }
.wps-foot .done { appearance: none; border: 0; background: var(--navy, #1C2B4A); color: #fff; border-radius: 10px; padding: 9px 18px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
`

export default function WoodPartsSortModal({ open, onClose, weekNumber, year, department = 'wood' }) {
  const { enrichedOrders, partsByProduct, productByCode, stepsByPart, machineByName } = useAppData()
  // A part belongs to this department when any of its steps runs on a machine of
  // that department (reliable — parts.department is often unset). No fallback,
  // so the other department's parts of a mixed item never leak into this list.
  const isDeptPart = (part) =>
    (stepsByPart.get(part.id) || []).some((s) => machineByName.get(s.machine_name)?.department === department)
  const [day, setDay] = useState(1) // 1=Mon … 5=Fri
  const [ordered, setOrdered] = useState([])
  const [removedList, setRemovedList] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  const yr = year || new Date().getFullYear()
  const dateStr = useMemo(
    () => (weekNumber ? dateToStr(isoWeekDayToDate(yr, weekNumber, day)) : null),
    [yr, weekNumber, day],
  )

  // Count of wood parts per weekday, for the day-strip badges.
  const partsByDay = useMemo(() => {
    const map = new Map() // day(1-5) -> [partRow]
    for (let d = 1; d <= 5; d++) map.set(d, [])
    for (const o of (enrichedOrders || [])) {
      if (o.needs_review) continue
      if (!(o.touched_departments || []).includes(department)) continue
      // Use the order's OWN prod_week/prod_day — the same value the Priority
      // list groups by — so the days here line up with what the user sees there.
      const pw = o.prod_week
      const pd = o.prod_day
      if (pw !== weekNumber || pd == null || pd < 1 || pd > 5) continue
      const product = productByCode.get(o.product_code)
      if (!product) continue
      const deptParts = (partsByProduct.get(product.id) || []).filter(isDeptPart)
      for (const part of deptParts) {
        map.get(pd).push({
          key: `${o.id}:${part.id}`,
          orderId: o.id,
          ordNr: o.ord_nr || o.kwitasie_nr || '—',
          productName: o.product_name || product.description || o.product_code,
          partId: part.id,
          partName: part.name,
          qty: (o.qty || 0) * (part.qty_per_unit || 1),
        })
      }
    }
    return map
  }, [enrichedOrders, weekNumber, partsByProduct, productByCode, stepsByPart, machineByName, department])

  // When the day (or its parts) change, load the saved order + removed set.
  useEffect(() => {
    if (!open || !dateStr) return
    const dayParts = partsByDay.get(day) || []
    const saved = loadDayOrder(department, dateStr)
    const removedSet = loadDayRemoved(department, dateStr)
    const active = dayParts.filter((p) => !removedSet.has(p.key))
    active.sort((a, b) => {
      const ra = saved.has(a.key) ? Number(saved.get(a.key)) : Number.POSITIVE_INFINITY
      const rb = saved.has(b.key) ? Number(saved.get(b.key)) : Number.POSITIVE_INFINITY
      if (ra !== rb) return ra - rb
      return a.partName.localeCompare(b.partName)
    })
    setOrdered(active)
    setRemovedList(dayParts.filter((p) => removedSet.has(p.key)))
  }, [open, dateStr, day, partsByDay, department])

  const persist = (list) => {
    if (!dateStr) return
    const ranks = new Map()
    list.forEach((p, i) => ranks.set(p.key, i + 1))
    saveDayOrder(department, dateStr, ranks)
  }

  const move = (from, to) => {
    if (from === to || from == null || to == null) return
    setOrdered((prev) => {
      const next = [...prev]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      persist(next)
      return next
    })
  }

  const resetDay = () => {
    if (dateStr) clearDayOrder(department, dateStr)
    const removedSet = loadDayRemoved(department, dateStr)
    const dayParts = [...(partsByDay.get(day) || [])].filter((p) => !removedSet.has(p.key)).sort((a, b) => a.partName.localeCompare(b.partName))
    setOrdered(dayParts)
  }

  // Drop a part from this day's manufacturing (kept locally; restorable). This
  // removes ONLY that part — the order and its other parts stay.
  const removePart = (p) => {
    if (!dateStr) return
    setDayPartRemoved(department, dateStr, p.key, true)
    setOrdered((prev) => { const next = prev.filter((x) => x.key !== p.key); persist(next); return next })
    setRemovedList((prev) => (prev.some((x) => x.key === p.key) ? prev : [...prev, p]))
  }
  const restorePart = (p) => {
    if (!dateStr) return
    setDayPartRemoved(department, dateStr, p.key, false)
    setRemovedList((prev) => prev.filter((x) => x.key !== p.key))
    setOrdered((prev) => { const next = [...prev, p]; persist(next); return next })
  }

  if (!open) return null

  const dayCount = (d) => (partsByDay.get(d) || []).length

  return createPortal(
    <div className="wps-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <style>{styles}</style>
      <div className="wps">
        <div className="wps-head">
          <div>
            <h3>Sort parts for the day</h3>
            <div className="sub">Drag the {department} parts into the order the shop should make them · 1 = start first</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="wps-days">
          {Array.from({ length: 5 }, (_, i) => {
            const d = i + 1
            const dd = weekNumber ? isoWeekDayToDate(yr, weekNumber, d) : null
            return (
              <button key={d} className="wps-day" aria-pressed={day === d} onClick={() => setDay(d)}>
                <span className="dn">{DAY_NAMES[i]}</span>
                {dd && <span className="dd">{dd.getDate()} {MON[dd.getMonth()]}</span>}
                <span className="ct">{dayCount(d)} parts</span>
              </button>
            )
          })}
        </div>

        <div className="wps-note">
          <Info size={13} className="ic" />
          <span>Saved on this device only — not synced. This sets the morning start order for {DAY_NAMES[day - 1]}{dateStr ? ` (${dateStr})` : ''}.</span>
        </div>

        <div className="wps-list">
          {ordered.length === 0 ? (
            <div className="wps-empty">No {department} parts scheduled for this day.</div>
          ) : (
            ordered.map((p, i) => (
              <div
                key={p.key}
                className={`wps-row ${dragIdx === i ? 'dragging' : ''} ${dropIdx === i && dragIdx !== i ? 'drop-target' : ''}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i) }}
                onDragOver={(e) => { e.preventDefault(); if (dropIdx !== i) setDropIdx(i) }}
                onDragLeave={() => { if (dropIdx === i) setDropIdx(null) }}
                onDrop={(e) => { e.preventDefault(); move(dragIdx, i); setDragIdx(null); setDropIdx(null) }}
                onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
              >
                <span className="wps-rank">{i + 1}</span>
                <span className="wps-grip"><GripVertical size={16} /></span>
                <div className="wps-info">
                  <div className="part">{p.partName}</div>
                  <div className="meta"><span className="ord">#{p.ordNr}</span> · {p.productName}</div>
                </div>
                <div className="wps-qty">{p.qty}<small>parts</small></div>
                <button
                  className="wps-del"
                  title="Remove this part from the day (the order and its other parts stay)"
                  onClick={(e) => { e.stopPropagation(); removePart(p) }}
                  onMouseDown={(e) => e.stopPropagation()}
                ><Trash2 size={15} /></button>
              </div>
            ))
          )}

          {removedList.length > 0 && (
            <div className="wps-removed">
              <div className="wps-removed-head"><Trash2 size={12} /> Removed from this day — won't be manufactured</div>
              {removedList.map((p) => (
                <div key={p.key} className="wps-removed-row">
                  <span className="rname">{p.partName} <small>#{p.ordNr} · {p.qty} parts</small></span>
                  <button className="wps-restore" onClick={() => restorePart(p)}><Undo2 size={12} /> Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wps-foot">
          <button className="reset" onClick={resetDay}><RotateCcw size={13} /> Reset order</button>
          <span className="count"><b>{ordered.length}</b> part{ordered.length === 1 ? '' : 's'} · <b>{ordered.reduce((s, p) => s + (p.qty || 0), 0)}</b> total</span>
          <button className="done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
