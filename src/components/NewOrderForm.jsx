import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Search, Trash2, X, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isoWeek, isoWeekDayToDate, loadScheduleConfig, scheduleOne } from '../lib/scheduling'
import { setWoodStartOverride, clearWoodStartOverride, loadWoodStartOverrides } from '../lib/orderDeptStart'
import { useAppData } from '../store/AppDataContext'
import { useConfirm } from './ConfirmDialog'

// Inline expandable order entry form for PriorityScreen.
// Replaces the older modal — same persistence, friendlier UX:
// product/customer search dropdowns, qty stepper, dispatch by ISO week + day,
// auto-calculated production start (or manual override).

const DAY_NAMES = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' }
const dayLabel = (n) => DAY_NAMES[n] || '—'

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// If the chosen week is well behind today's week, assume the user means next year.
function pickYearForWeek(targetWeek, today) {
  const curYear = today.getFullYear()
  const curWeek = isoWeek(today)
  if (targetWeek < curWeek - 13) return curYear + 1
  return curYear
}

const styles = `
.nof-card { margin: 6px 14px 14px; background: var(--surface-2); border: 1.5px dashed var(--hairline-2); border-radius: var(--r-md); overflow: hidden; transition: border-color 160ms ease, background 160ms ease; }
.nof-card.open { border-style: solid; border-color: var(--hairline); background: var(--surface); }
.nof-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--ink-2); border-bottom: 1px solid transparent; }
.nof-card.open .nof-head { border-bottom-color: var(--hairline); color: var(--ink); }
.nof-head:hover { color: var(--amber); }
.nof-head .hint { margin-left: auto; font-size: 11px; color: var(--ink-3); font-weight: 500; }
.nof-body { padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 10px; }

.nof-row { display: grid; gap: 10px; align-items: end; justify-content: start; }
.nof-row.head { grid-template-columns: 160px minmax(240px, 360px) 180px; }
.nof-row.two { grid-template-columns: 320px 320px; }
.nof-row.compact { display: flex; gap: 12px; flex-wrap: wrap; }
.nof-row.compact .nof-field { flex: 0 0 auto; }

.nof-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.nof-field label { font-size: 11px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.nof-field .req { color: var(--red); margin-left: 2px; }

.nof-input, .nof-textarea {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink);
  font: inherit; font-size: 13px;
  padding: 7px 11px; border-radius: 9px; outline: none;
  height: 34px; width: 100%;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.nof-textarea { height: 34px; min-height: 34px; resize: vertical; }
.nof-input::placeholder, .nof-textarea::placeholder { color: var(--ink-3); }
.nof-input:focus, .nof-textarea:focus { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-soft); }

.nof-section-title { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--ink-3); text-transform: uppercase; margin-top: 2px; }

.nof-stepper {
  display: inline-flex; align-items: stretch;
  border: 1px solid var(--hairline-2); border-radius: 9px;
  background: var(--surface-2); overflow: hidden; height: 34px;
  width: 160px;
}
.nof-stepper button {
  appearance: none; border: 0; background: transparent;
  min-width: 28px; padding: 0 6px; cursor: pointer;
  font-size: 13px; font-weight: 600; color: var(--ink-2);
  display: inline-flex; align-items: center; justify-content: center;
}
.nof-stepper button.big { font-size: 11px; color: var(--ink-3); }
.nof-stepper button:hover { background: var(--hairline); color: var(--ink); }
.nof-stepper input {
  flex: 1; min-width: 0; width: 100%; border: 0; background: transparent; color: var(--ink);
  font: inherit; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
  text-align: center; outline: none;
  border-left: 1px solid var(--hairline); border-right: 1px solid var(--hairline);
}
.nof-stepper input::-webkit-outer-spin-button, .nof-stepper input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

.nof-search { position: relative; width: 100%; }
.nof-search .field {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--hairline-2); background: var(--surface-2);
  border-radius: 9px; padding: 0 11px; cursor: text; height: 34px;
}
.nof-search.open .field { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-soft); }
.nof-search .field .ic { color: var(--ink-3); flex-shrink: 0; }
.nof-search .field input { flex: 1; border: 0; outline: none; background: transparent; color: var(--ink); font: inherit; font-size: 13px; min-width: 0; }
.nof-search .field input::placeholder { color: var(--ink-3); }
.nof-search .field .clear { appearance: none; border: 0; background: transparent; color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; }
.nof-search .field .clear:hover { color: var(--red); }
.nof-search .menu {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px);
  background: var(--surface); border: 1px solid var(--hairline);
  border-radius: 10px; box-shadow: var(--shadow-pop);
  z-index: 50; max-height: 260px; overflow-y: auto;
}
.nof-search .menu .item { padding: 9px 12px; font-size: 13px; color: var(--ink); cursor: pointer; display: flex; flex-direction: column; gap: 1px; }
.nof-search .menu .item:hover, .nof-search .menu .item.active { background: var(--surface-2); }
.nof-search .menu .item small { font-size: 11px; color: var(--ink-3); }
.nof-search .menu .empty { padding: 12px; font-size: 12px; color: var(--ink-3); text-align: center; }

.nof-mode { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-width: 520px; }
.nof-mode button {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface); color: var(--ink-2);
  font: inherit; font-size: 12px; font-weight: 600;
  padding: 8px 12px; border-radius: 9px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
}
.nof-mode button[aria-pressed="true"] { background: var(--navy); color: white; border-color: var(--navy); box-shadow: var(--shadow-btn); }
.nof-mode button[aria-pressed="true"] .ic { color: var(--amber-2); }
.nof-mode button .ic { width: 13px; height: 13px; color: var(--ink-3); }

.nof-mode-info { background: var(--surface-2); border: 1px dashed var(--hairline-2); border-radius: 9px; padding: 7px 11px; font-size: 12px; color: var(--ink-2); }
.nof-mode-info b { color: var(--ink); font-weight: 700; }
.nof-mode-info.err { color: var(--red); border-color: rgba(210,83,58,0.3); background: var(--red-soft); }
.nof-mode-info.ok { background: var(--green-soft); border-color: rgba(76,175,106,0.3); color: var(--green); }
.nof-mode-info.ok b { color: var(--green); }

.nof-summary-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--navy-soft); color: var(--navy); font-size: 11px; font-weight: 600; letter-spacing: 0.02em; align-self: flex-start; }
[data-theme="dark"] .nof-summary-pill { color: var(--amber-2); }

.nof-err { background: var(--red-soft); color: var(--red); padding: 8px 11px; border-radius: 9px; font-size: 12px; font-weight: 500; }

.nof-submit {
  appearance: none; border: 0;
  background: var(--navy); color: white;
  font: inherit; font-size: 13px; font-weight: 600;
  padding: 10px 14px; border-radius: 10px; cursor: pointer;
  box-shadow: var(--shadow-btn);
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  align-self: flex-start; min-width: 160px;
}
.nof-submit:hover { background: var(--navy-2); }
.nof-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.nof-actions { display: flex; gap: 10px; align-items: center; }
.nof-cancel {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface); color: var(--ink-2);
  font: inherit; font-size: 13px; font-weight: 600;
  padding: 10px 16px; border-radius: 10px; cursor: pointer;
}
.nof-cancel:hover { background: var(--surface-2); color: var(--ink); }
.nof-delete {
  appearance: none; border: 1px solid rgba(210,83,58,0.25);
  background: var(--red-soft); color: var(--red);
  font: inherit; font-size: 13px; font-weight: 600;
  padding: 10px 14px; border-radius: 10px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  margin-left: auto;
}
.nof-delete:hover { background: rgba(210,83,58,0.18); }
.nof-delete .ic { width: 14px; height: 14px; }

.nof-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.nof-modal {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  width: 100%; max-width: 760px; max-height: 92vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.nof-modal-head {
  padding: 14px 20px;
  border-bottom: 1px solid var(--hairline);
  display: flex; align-items: center; justify-content: space-between;
  background: var(--surface-2);
}
.nof-modal-head.editing { background: var(--amber-soft); }
.nof-modal-head h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--ink); letter-spacing: -0.015em; }
.nof-modal-head.editing h3 { color: var(--amber); }
.nof-modal-head .close {
  appearance: none; border: 0; background: transparent;
  width: 32px; height: 32px; border-radius: 8px;
  color: var(--ink-3); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.nof-modal-head .close:hover { background: var(--surface); color: var(--ink); }
.nof-modal .nof-body { overflow-y: auto; }

@media (max-width: 760px) {
  .nof-row.head, .nof-row.two { grid-template-columns: 1fr; }
  .nof-mode { grid-template-columns: 1fr; max-width: none; }
  .nof-stepper { width: 100%; }
  .nof-submit { width: 100%; align-self: stretch; }
}
`

function NumberStepper({ value, onChange, min = 0, max = 9999, step = 1, jump = 0 }) {
  const clamp = (v) => Math.max(min, Math.min(max, v))
  return (
    <div className="nof-stepper">
      {jump > 0 && <button type="button" className="big" onClick={() => onChange(clamp(value - jump))}>−{jump}</button>}
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label="Decrease">−</button>
      <input type="number" value={value} onChange={(e) => onChange(clamp(parseInt(e.target.value || '0', 10)))} />
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label="Increase">+</button>
      {jump > 0 && <button type="button" className="big" onClick={() => onChange(clamp(value + jump))}>+{jump}</button>}
    </div>
  )
}

function SearchableSelect({ items, value, onChange, getKey, getLabel, getSubLabel, placeholder, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const selected = useMemo(() => items.find((it) => getKey(it) === value), [items, value, getKey])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter((it) => {
      const lbl = (getLabel(it) || '').toLowerCase()
      const sub = (getSubLabel?.(it) || '').toLowerCase()
      const k = String(getKey(it) || '').toLowerCase()
      return lbl.includes(q) || sub.includes(q) || k.includes(q)
    })
  }, [items, query, getLabel, getSubLabel, getKey])

  const displayValue = open ? query : (selected ? getLabel(selected) : '')

  return (
    <div className={`nof-search ${open ? 'open' : ''}`} ref={ref}>
      <div className="field" onClick={() => !disabled && setOpen(true)}>
        <Search size={15} className="ic" />
        <input
          type="text"
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        />
        {value && !open && (
          <button type="button" className="clear" onClick={(e) => { e.stopPropagation(); onChange(''); setQuery('') }} aria-label="Clear">
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="empty">No matches</div>
          ) : (
            filtered.slice(0, 100).map((it) => (
              <div
                key={getKey(it)}
                className={`item ${getKey(it) === value ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); onChange(getKey(it)); setQuery(''); setOpen(false) }}
                role="option"
              >
                <span>{getLabel(it)}</span>
                {getSubLabel && getSubLabel(it) && <small>{getSubLabel(it)}</small>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function NewOrderForm({ open = false, defaultDepartment = 'steel', onSaved, onDeleted, onClose, editOrder = null }) {
  const isEdit = !!editOrder
  const today = new Date()
  const currentWeek = isoWeek(today)
  // Pull live data from the shared app cache — products, customers AND
  // routings come from here so the modal always sees what's currently in
  // memory (e.g. routing the user just added to a product seconds ago).
  // Avoids the stale-cache bug from the old local routings Map that kept
  // an empty result around after the first fetch.
  const { products: liveProducts, customers: liveCustomers, routingByCode, routingByCodeByDept, deptsByCode } = useAppData()
  const products = useMemo(
    () => [...(liveProducts || [])].sort((a, b) => String(a.code).localeCompare(String(b.code))),
    [liveProducts],
  )
  const customers = useMemo(
    () => [...(liveCustomers || [])].sort((a, b) => String(a.code).localeCompare(String(b.code))),
    [liveCustomers],
  )
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // `loaded` controls placeholder text + dropdown disabled state. Since
  // useAppData blocks the whole app until the first sync, products are
  // populated by the time we render — derive from cache presence.
  const loaded = products.length > 0

  // Two distinct numbers:
  //   * kwitasie_nr — per-line ID (Access auto-generates on import; must be
  //     unique). The "Kwitasie #" input.
  //   * ord_nr      — the client's order/job number, shared across every
  //     line item that belongs to the same client order. The "Ord #" input.
  const [orderNo, setOrderNo] = useState('')   // kwitasie_nr (unique)
  const [ordNr, setOrdNr] = useState('')       // ord_nr (shared)
  const [qty, setQty] = useState(1)
  const [productCode, setProductCode] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [prodMode, setProdMode] = useState('auto') // 'auto' | 'manual'
  const [prodWeek, setProdWeek] = useState(currentWeek)
  const [prodDay, setProdDay] = useState(1)
  // Two-track items (steel + wood parts) get a SEPARATE start per department.
  const [steelMode, setSteelMode] = useState('auto')
  const [steelWeek, setSteelWeek] = useState(currentWeek)
  const [steelDay, setSteelDay] = useState(1)
  const [woodMode, setWoodMode] = useState('auto')
  const [woodWeek, setWoodWeek] = useState(currentWeek)
  const [woodDay, setWoodDay] = useState(1)
  const [sendWeek, setSendWeek] = useState(currentWeek)
  const [sendDay, setSendDay] = useState(1)
  const [notes, setNotes] = useState('')
  const [dept, setDept] = useState(defaultDepartment)
  const { confirm, dialog: confirmDialog } = useConfirm()

  // Reset / pre-fill form whenever the modal is opened.
  useEffect(() => {
    if (!open) return
    setErr('')
    if (editOrder) {
      setOrderNo(editOrder.kwitasie_nr || '')
      setOrdNr(editOrder.ord_nr || '')
      setQty(editOrder.qty || 1)
      setProductCode(editOrder.product_code || '')
      setCustomerCode(editOrder.customer_code || '')
      setSendWeek(editOrder.send_week || currentWeek)
      setSendDay(editOrder.send_day || 1)
      setProdWeek(editOrder.prod_week || currentWeek)
      setProdDay(editOrder.prod_day || 1)
      setProdMode(editOrder.prod_week != null ? 'manual' : 'auto')
      setNotes(editOrder.notes || '')
      setDept(editOrder.department || defaultDepartment)
      // Two-track starts: steel = the order's own prod day; wood = its saved
      // override if any (else auto). Default both to auto so the fresh auto
      // numbers show; the user flips to manual to override.
      setSteelMode('auto')
      setSteelWeek(editOrder.prod_week || currentWeek)
      setSteelDay(editOrder.prod_day || 1)
      const wov = loadWoodStartOverrides().get(String(editOrder.id))
      setWoodMode(wov ? 'manual' : 'auto')
      setWoodWeek(wov?.prod_week || currentWeek)
      setWoodDay(wov?.prod_day || 1)
    } else {
      setOrderNo('')
      setOrdNr('')
      setQty(1)
      setProductCode('')
      setCustomerCode('')
      setSendWeek(currentWeek)
      setSendDay(1)
      setProdWeek(currentWeek)
      setProdDay(1)
      setProdMode('auto')
      setNotes('')
      setDept(defaultDepartment)
      setSteelMode('auto'); setSteelWeek(currentWeek); setSteelDay(1)
      setWoodMode('auto'); setWoodWeek(currentWeek); setWoodDay(1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editOrder])

  useEffect(() => {
    if (!open || config) return
    let cancelled = false
    loadScheduleConfig()
      .catch(() => ({ holidays: new Set(), bufferDaysByDept: new Map() }))
      .then((cfg) => { if (!cancelled) setConfig(cfg) })
    return () => { cancelled = true }
  }, [open, config])

  const selectedProduct = useMemo(() => products.find((p) => p.code === productCode), [products, productCode])
  useEffect(() => {
    if (selectedProduct?.department) setDept(selectedProduct.department)
  }, [selectedProduct])

  const dueDate = useMemo(() => {
    const year = pickYearForWeek(sendWeek, today)
    return toDateStr(isoWeekDayToDate(year, sendWeek, sendDay))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendWeek, sendDay])

  const autoResult = useMemo(() => {
    if (!productCode || !config) return null
    const routing = routingByCode?.get(productCode) || []
    if (routing.length === 0) return null
    return scheduleOne(
      { qty, product_code: productCode, department: dept, send_week: sendWeek, send_day: sendDay },
      routing,
      config.bufferDaysByDept,
      config.holidays,
    )
  }, [productCode, qty, dept, sendWeek, sendDay, config, routingByCode])

  const effectiveProdWeek = prodMode === 'auto' ? (autoResult?.prod_week ?? null) : prodWeek
  const effectiveProdDay = prodMode === 'auto' ? (autoResult?.prod_day ?? null) : prodDay

  // Two-track detection + a separate auto start per department. Steel and wood
  // each walk back from dispatch by their OWN lead, so they land on different days.
  const productDepts = useMemo(() => deptsByCode?.get(productCode) || new Set(), [deptsByCode, productCode])
  const twoTrack = productDepts.has('steel') && productDepts.has('wood')

  const steelAuto = useMemo(() => {
    if (!twoTrack || !config) return null
    const routing = routingByCodeByDept?.get(productCode)?.get('steel') || []
    if (routing.length === 0) return null
    return scheduleOne({ qty, product_code: productCode, department: 'steel', send_week: sendWeek, send_day: sendDay }, routing, config.bufferDaysByDept, config.holidays)
  }, [twoTrack, productCode, qty, sendWeek, sendDay, config, routingByCodeByDept])
  const woodAuto = useMemo(() => {
    if (!twoTrack || !config) return null
    const routing = routingByCodeByDept?.get(productCode)?.get('wood') || []
    if (routing.length === 0) return null
    return scheduleOne({ qty, product_code: productCode, department: 'wood', send_week: sendWeek, send_day: sendDay }, routing, config.bufferDaysByDept, config.holidays)
  }, [twoTrack, productCode, qty, sendWeek, sendDay, config, routingByCodeByDept])

  // Resolved per-department starts used on save.
  const steelStart = steelMode === 'auto'
    ? (steelAuto ? { prod_week: steelAuto.prod_week, prod_day: steelAuto.prod_day } : null)
    : { prod_week: steelWeek, prod_day: steelDay }
  const woodStart = woodMode === 'auto'
    ? (woodAuto ? { prod_week: woodAuto.prod_week, prod_day: woodAuto.prod_day } : null)
    : { prod_week: woodWeek, prod_day: woodDay }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    // kwitasie_nr is the Access auto-number from CSV imports only. Manual
    // orders leave it null — the user identifies their order by Ord #.
    // On edit we keep whatever was already there (so CSV-imported orders
    // don't lose their kwitasie).
    const kwitasie = isEdit ? (editOrder.kwitasie_nr || null) : null
    if (!qty || qty <= 0) return setErr('Quantity must be a positive number.')
    if (!productCode) return setErr('Pick a product.')
    if (!customerCode) return setErr('Pick a customer.')

    // If editing and qty changed, warn — existing schedule rows still hold
    // the old qty so production will be planned for the wrong amount until
    // someone hits Regenerate on Schedule.
    if (isEdit && editOrder.qty != null && qty !== editOrder.qty) {
      const ok = await confirm({
        title: `Change qty from ${editOrder.qty} to ${qty}?`,
        body: 'Existing schedule rows for this order were planned for the old qty. After saving, click Regenerate on Schedule so the work amount catches up — otherwise the floor will produce the wrong count.',
        confirmLabel: 'Save anyway',
      })
      if (!ok) return
    }

    setSaving(true)
    try {
      // Two-track items store the STEEL start on the order (the steel Schedule
      // reads it); the wood start is saved as a local override below. Single-
      // dept items keep their one production start as before.
      const orderStart = twoTrack
        ? (steelStart || { prod_week: null, prod_day: null })
        : { prod_week: effectiveProdWeek, prod_day: effectiveProdDay }

      const payload = {
        kwitasie_nr: kwitasie,
        ord_nr: ordNr.trim() || null,
        qty,
        product_code: productCode,
        customer_code: customerCode,
        department: dept,
        due_date: dueDate,
        send_week: sendWeek,
        send_day: sendDay,
        prod_week: orderStart.prod_week,
        prod_day: orderStart.prod_day,
        description: selectedProduct?.description || null,
        notes: notes.trim() || null,
      }

      let savedRow = null
      if (isEdit) {
        // Update by id (uuid) — orders don't have a stable natural key for
        // manual entries (kwitasie is null), so always pin to the row PK.
        const { data, error: updErr } = await supabase
          .from('orders').update(payload).eq('id', editOrder.id).select().single()
        if (updErr) throw new Error(updErr.message)
        savedRow = data
      } else {
        // Manual orders always have kwitasie = null, so no duplicate
        // pre-check is meaningful. CSV importer handles its own dedup.
        const { data, error: insErr } = await supabase
          .from('orders').insert(payload).select().single()
        if (insErr) throw new Error(insErr.message)
        savedRow = data
      }

      // Persist the WOOD start (two-track only) as a local override so the wood
      // day-board starts wood on its own day. Clear it for single-dept items.
      if (savedRow?.id) {
        if (twoTrack && woodStart) setWoodStartOverride(savedRow.id, woodStart.prod_week, woodStart.prod_day)
        else clearWoodStartOverride(savedRow.id)
      }

      // Hand the freshly-saved row back so the caller can patch its local
      // cache surgically (no full table refetch needed).
      onSaved?.(savedRow)
      onClose?.()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    const ok = await confirm({
      title: `Delete order ${editOrder.kwitasie_nr}?`,
      body: 'This order will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete order',
    })
    if (!ok) return
    setSaving(true)
    setErr('')
    try {
      // Delete by id — kwitasie_nr can be shared by multiple line items.
      const { error: delErr } = await supabase
        .from('orders').delete().eq('id', editOrder.id)
      if (delErr) throw new Error(delErr.message)
      // Signal the parent so it can drop the row from its cache. Falls
      // back to onSaved() for callers that haven't wired onDeleted yet.
      if (onDeleted) onDeleted(editOrder.id)
      else onSaved?.(null)
      onClose?.()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  const formBody = (
    <form className="nof-body" onSubmit={handleSubmit}>
      {err && <div className="nof-err">{err}</div>}

      <div className="nof-row head">
        <div className="nof-field">
          <label>Ord #</label>
          <input
            className="nof-input"
            value={ordNr}
            onChange={(e) => setOrdNr(e.target.value)}
            placeholder="client order # (shared across lines)"
            autoFocus
            title="The client's order/job number. Multiple lines can share the same Ord # if they belong to the same client order."
          />
        </div>
        <div className="nof-field">
          <label>Product<span className="req">*</span></label>
          <SearchableSelect
            items={products}
            value={productCode}
            onChange={setProductCode}
            getKey={(p) => p.code}
            getLabel={(p) => `${p.code} — ${p.description || p.code}`}
            getSubLabel={(p) => p.department || ''}
            placeholder={loaded ? 'Search product…' : 'Loading…'}
            disabled={!loaded}
          />
        </div>
        <div className="nof-field">
          <label>Quantity<span className="req">*</span></label>
          <NumberStepper value={qty} onChange={setQty} min={0} jump={10} />
        </div>
      </div>

      <div className="nof-section-title">Production</div>
      {twoTrack ? (
        <>
          {/* Steel + wood start separately — they walk back from dispatch by
              each department's own lead, so they land on different days. */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em', margin: '2px 0 6px' }}>STEEL START</div>
          <div className="nof-mode">
            <button type="button" aria-pressed={steelMode === 'auto'} onClick={() => setSteelMode('auto')}><Zap size={14} className="ic" /> Auto from Dispatch</button>
            <button type="button" aria-pressed={steelMode === 'manual'} onClick={() => setSteelMode('manual')}><Pencil size={14} className="ic" /> Set Manually</button>
          </div>
          {steelMode === 'auto' && (
            !steelAuto
              ? <div className="nof-mode-info err">No steel routing yet — add steel parts/steps in Products, or set manually.</div>
              : <div className="nof-mode-info ok">Steel starts <b>Wk{steelAuto.prod_week} / {dayLabel(steelAuto.prod_day)}</b> · bottleneck <b>{steelAuto.bottleneck}</b></div>
          )}
          {steelMode === 'manual' && (
            <div className="nof-row compact">
              <div className="nof-field"><label>Steel Week</label><NumberStepper value={steelWeek} onChange={setSteelWeek} min={1} max={53} /></div>
              <div className="nof-field"><label>Steel Day</label><NumberStepper value={steelDay} onChange={setSteelDay} min={1} max={5} /></div>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em', margin: '12px 0 6px' }}>WOOD START</div>
          <div className="nof-mode">
            <button type="button" aria-pressed={woodMode === 'auto'} onClick={() => setWoodMode('auto')}><Zap size={14} className="ic" /> Auto from Dispatch</button>
            <button type="button" aria-pressed={woodMode === 'manual'} onClick={() => setWoodMode('manual')}><Pencil size={14} className="ic" /> Set Manually</button>
          </div>
          {woodMode === 'auto' && (
            !woodAuto
              ? <div className="nof-mode-info err">No wood routing yet — add wood parts/steps in Products, or set manually.</div>
              : <div className="nof-mode-info ok">Wood starts <b>Wk{woodAuto.prod_week} / {dayLabel(woodAuto.prod_day)}</b> · bottleneck <b>{woodAuto.bottleneck}</b></div>
          )}
          {woodMode === 'manual' && (
            <div className="nof-row compact">
              <div className="nof-field"><label>Wood Week</label><NumberStepper value={woodWeek} onChange={setWoodWeek} min={1} max={53} /></div>
              <div className="nof-field"><label>Wood Day</label><NumberStepper value={woodDay} onChange={setWoodDay} min={1} max={5} /></div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="nof-mode">
            <button type="button" aria-pressed={prodMode === 'auto'} onClick={() => setProdMode('auto')}>
              <Zap size={14} className="ic" /> Auto-calculate from Dispatch
            </button>
            <button type="button" aria-pressed={prodMode === 'manual'} onClick={() => setProdMode('manual')}>
              <Pencil size={14} className="ic" /> Set Manually
            </button>
          </div>
          {prodMode === 'auto' && (
            !productCode ? (
              <div className="nof-mode-info">Select a product to calculate</div>
            ) : !autoResult ? (
              <div className="nof-mode-info err">No routing yet for this product — add machine steps in Products, or use Set Manually.</div>
            ) : (
              <div className="nof-mode-info ok">
                Production starts <b>Wk{autoResult.prod_week} / {dayLabel(autoResult.prod_day)}</b> · {autoResult.work_days}d work + {autoResult.buffer_days}d buffer · bottleneck <b>{autoResult.bottleneck}</b>
              </div>
            )
          )}
          {prodMode === 'manual' && (
            <div className="nof-row compact">
              <div className="nof-field">
                <label>Production Week</label>
                <NumberStepper value={prodWeek} onChange={setProdWeek} min={1} max={53} />
              </div>
              <div className="nof-field">
                <label>Production Day</label>
                <NumberStepper value={prodDay} onChange={setProdDay} min={1} max={5} />
              </div>
            </div>
          )}
        </>
      )}

      <div className="nof-section-title">Dispatch</div>
      <div className="nof-row compact">
        <div className="nof-field">
          <label>Dispatch Week</label>
          <NumberStepper value={sendWeek} onChange={setSendWeek} min={1} max={53} />
        </div>
        <div className="nof-field">
          <label>Dispatch Day</label>
          <NumberStepper value={sendDay} onChange={setSendDay} min={1} max={5} />
        </div>
      </div>

      <div className="nof-section-title">Details</div>
      <div className="nof-row two">
        <div className="nof-field">
          <label>Customer<span className="req">*</span></label>
          <SearchableSelect
            items={customers}
            value={customerCode}
            onChange={setCustomerCode}
            getKey={(c) => c.code}
            getLabel={(c) => `${c.code} — ${c.name || c.code}`}
            placeholder={loaded ? 'Search customer…' : 'Loading…'}
            disabled={!loaded}
          />
        </div>
        <div className="nof-field">
          <label>Notes</label>
          <textarea className="nof-textarea" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requirements…" />
        </div>
      </div>

      <div className="nof-actions">
        <button type="submit" className="nof-submit" disabled={saving}>
          {saving ? 'Saving…' : (isEdit ? 'Save Changes' : '+ Add Order')}
        </button>
        <button type="button" className="nof-cancel" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        {isEdit && (
          <button type="button" className="nof-delete" onClick={handleDelete} disabled={saving} title="Delete this order">
            <Trash2 className="ic" /> Delete
          </button>
        )}
      </div>
    </form>
  )

  if (!open) return null

  return (
    <>
      <style>{styles}</style>
      <div className="nof-overlay" onClick={onClose}>
        <div className="nof-modal" onClick={(e) => e.stopPropagation()}>
          <div className={`nof-modal-head ${isEdit ? 'editing' : ''}`}>
            <h3>
              {isEdit
                ? `Edit Order ${editOrder.ord_nr || editOrder.kwitasie_nr}`
                : 'New Order'}
            </h3>
            <button type="button" className="close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {formBody}
        </div>
      </div>
      {confirmDialog}
    </>
  )
}
