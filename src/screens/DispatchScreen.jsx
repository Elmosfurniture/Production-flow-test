import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import { useAppData } from '../store/AppDataContext'
import { isoWeekDayToDate } from '../lib/scheduling'
import { markShipped } from '../lib/orders'
import {
  Hammer,
  Scissors,
  Activity,
  Truck,
  Grid,
  List,
  Calendar,
  CheckSquare,
  Package,
  HardDrive,
  Users,
  Search,
  Clock,
  Printer,
  RefreshCcw,
  Plus,
  Key,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Shield,
  X,
  Send,
  Check,
} from 'lucide-react'

const iconMap = {
  hammer: Hammer,
  saw: Scissors,
  thread: Activity,
  truck: Truck,
  grid: Grid,
  list: List,
  cal: Calendar,
  'check-sq': CheckSquare,
  pkg: Package,
  machine: HardDrive,
  users: Users,
  search: Search,
  clock: Clock,
  print: Printer,
  refresh: RefreshCcw,
  plus: Plus,
  key: Key,
  moon: Moon,
  sun: Sun,
  'chev-l': ChevronLeft,
  'chev-r': ChevronRight,
  open: ArrowUpRight,
  shield: Shield,
}

function I({ n, s = 16, w = 1.8 }) {
  const Icon = iconMap[n]
  return Icon ? <Icon size={s} strokeWidth={w} className="ic" /> : null
}

const styles = `
:root {
  --bg: #f4f2ee; --bg-2: #ece8e0;
  --surface: #ffffff; --surface-2: #fbf9f5; --surface-3: #f1eee7;
  --ink: #1a1d24; --ink-2: #4a4e5a; --ink-3: #8a8e99;
  --hairline: rgba(26,29,36,0.08); --hairline-2: rgba(26,29,36,0.12);
  --navy: #1f2a44; --navy-soft: rgba(31,42,68,0.08);
  --amber: #e89a3c; --amber-2: #f0ae5c; --amber-soft: rgba(232,154,60,0.14);
  --red: #d2533a; --red-soft: rgba(210,83,58,0.10);
  --green: #4caf6a; --green-soft: rgba(76,175,106,0.12);
  --teal: #3a9aaf; --teal-soft: rgba(58,154,175,0.12);
  --purple: #8b5fbf; --purple-soft: rgba(139,95,191,0.12);
  --blue: #4677c8; --blue-soft: rgba(70,119,200,0.12);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 20px rgba(26,29,36,0.04);
  --shadow-pop: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.06), 0 12px 28px rgba(26,29,36,0.10);
  --r-sm: 10px; --r-md: 14px; --r-lg: 20px;
}
* { box-sizing: border-box; }
html, body {
  margin:0; padding:0; min-height: 100vh;
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  color: var(--ink); letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%);
}
.main { padding: 18px 22px 30px; min-width: 0; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.topbar h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.1; }
.topbar .sub { font-size: 12px; color: var(--ink-2); margin-top: 3px; }
.topbar-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ibtn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; font-weight: 500; padding: 7px 11px; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.ibtn:hover { background: var(--surface-2); }
.ibtn .ic { width: 13px; height: 13px; color: var(--ink-2); }
.ibtn.primary { background: var(--navy); color: white; border-color: var(--navy); box-shadow: 0 6px 14px rgba(31,42,68,0.22); }
.ibtn.primary .ic { color: white; }
.filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.dept-tabs { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 10px; }
.dept-tab { appearance: none; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 500; padding: 6px 10px; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.dept-tab .ic { width: 13px; height: 13px; color: var(--ink-3); }
.dept-tab[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 4px rgba(26,29,36,0.05); font-weight: 600; }
.dept-tab[aria-pressed="true"] .ic { color: var(--navy); }
.month-nav { display: flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; padding: 3px; }
.month-nav button { appearance: none; border: 0; background: transparent; width: 28px; height: 28px; border-radius: 7px; cursor: pointer; color: var(--ink-2); display: flex; align-items: center; justify-content: center; }
.month-nav button:hover { background: var(--surface-2); color: var(--ink); }
.month-nav .today { width: auto; padding: 0 12px; font: inherit; font-size: 12px; font-weight: 600; color: var(--ink); }
.view-switch { display: flex; gap: 2px; padding: 3px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 10px; }
.view-switch button { appearance: none; border: 0; background: transparent; font: inherit; font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 7px; cursor: pointer; color: var(--ink-2); display: inline-flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.view-switch button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 4px rgba(26,29,36,0.05); }
.month-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
.month-head h2 { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; margin: 0; line-height: 1; }
.month-head h2 small { font-size: 16px; font-weight: 500; color: var(--ink-3); margin-left: 8px; letter-spacing: -0.02em; }
.month-head .legend { display: flex; gap: 14px; align-items: center; font-size: 11px; color: var(--ink-3); background: var(--surface); border: 1px solid var(--hairline); padding: 8px 12px; border-radius: 10px; box-shadow: var(--shadow-card); }
.month-head .legend .item { display: flex; align-items: center; gap: 6px; }
.month-head .legend .swatch { width: 10px; height: 10px; border-radius: 3px; }
.cal-wrap { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: var(--shadow-card); overflow: hidden; }
.cal-head { display: grid; grid-template-columns: repeat(5, 1fr); background: var(--surface-2); border-bottom: 1px solid var(--hairline); }
.cal-head .dh { padding: 10px 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: var(--ink-3); text-transform: uppercase; border-right: 1px solid var(--hairline); }
.cal-head .dh:last-child { border-right: 0; }
.cal-grid { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: minmax(140px, auto); }
.cal-cell { border-right: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; position: relative; transition: background 140ms ease; min-width: 0; }
.cal-cell:nth-child(5n) { border-right: 0; }
.cal-cell:hover { background: var(--surface-2); }
.cal-cell.muted { background: var(--surface-2); opacity: 0.55; }
.cal-cell.weekend { background: rgba(0,0,0,0.015); }
.cal-cell.today { background: var(--amber-soft); }
.cal-cell.today::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--amber); }
.cal-cell.selected { box-shadow: inset 0 0 0 2px var(--navy); z-index: 1; }
.cell-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.cell-head .dnum { font-size: 15px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.cal-cell.today .cell-head .dnum { color: var(--amber); }
.cal-cell.muted .cell-head .dnum { color: var(--ink-3); }
.cell-head .wknum { font-size: 9px; font-weight: 700; color: var(--ink-3); background: var(--surface-3); padding: 2px 6px; border-radius: 4px; letter-spacing: 0.04em; }
.cal-cell.today .cell-head .wknum { background: rgba(232,154,60,0.2); color: var(--amber); }
.ord-list { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ord-chip { display: grid; grid-template-columns: 4px 1fr auto; align-items: center; gap: 7px; padding: 4px 7px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 6px; font-size: 11px; font-weight: 500; line-height: 1.2; min-width: 0; box-shadow: 0 1px 2px rgba(26,29,36,0.03); }
.ord-chip .bar { align-self: stretch; border-radius: 2px; background: var(--ink-3); }
.ord-chip .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-weight: 600; }
.ord-chip .qty { color: var(--ink-3); font-weight: 600; font-size: 10px; font-variant-numeric: tabular-nums; background: var(--surface-3); padding: 1px 5px; border-radius: 4px; }
.ord-chip.urgent .lbl { color: var(--red); }
.ord-chip.urgent .bar { background: var(--red); }
.ord-chip.ready .bar { background: var(--green); }
.ord-chip.done .bar { background: var(--blue); }
.more { font-size: 10px; font-weight: 600; color: var(--ink-3); padding: 2px 7px; cursor: pointer; }
.more:hover { color: var(--ink); }
.layout { display: block; }

.dm-back { position: fixed; inset: 0; background: rgba(20,24,32,0.55); backdrop-filter: blur(3px); display: flex; align-items: flex-start; justify-content: center; z-index: 100; padding: 40px 20px; overflow-y: auto; }
.dm-modal { background: var(--surface); border-radius: var(--r-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.25); max-width: 720px; width: 100%; max-height: calc(100vh - 80px); display: flex; flex-direction: column; overflow: hidden; }
.dm-head { display: flex; align-items: flex-start; gap: 14px; padding: 18px 22px; border-bottom: 1px solid var(--hairline); background: var(--surface-2); }
.dm-head .titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dm-head .when { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
.dm-head h3 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; line-height: 1.1; }
.dm-head .meta { font-size: 12px; color: var(--ink-2); font-weight: 500; margin-top: 6px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dm-head .meta b { color: var(--ink); font-weight: 700; }
.dm-head .meta .sep { color: var(--hairline-2); }
.dm-head .close { appearance: none; border: 0; background: transparent; width: 30px; height: 30px; border-radius: 7px; color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.dm-head .close:hover { background: var(--surface); color: var(--ink); }

.dm-body { padding: 16px 22px 18px; overflow-y: auto; flex: 1; }
.dm-empty { text-align: center; padding: 32px 12px; color: var(--ink-3); font-size: 13px; }

.dm-row { background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px; margin-bottom: 8px; overflow: hidden; }
.dm-row.expanded { box-shadow: 0 4px 14px rgba(26,29,36,0.06); }
.dm-row-head { display: grid; grid-template-columns: 4px 1fr auto auto; gap: 12px; align-items: center; padding: 12px 14px; cursor: pointer; transition: background 120ms ease; }
.dm-row-head:hover { background: var(--surface-2); }
.dm-row-head .bar { align-self: stretch; border-radius: 2px; background: var(--accent, var(--ink-3)); }
.dm-row.steel .dm-row-head .bar { background: var(--blue); }
.dm-row.wood .dm-row-head .bar { background: var(--green); }
.dm-row.uphol .dm-row-head .bar { background: var(--purple); }
.dm-row.disp .dm-row-head .bar { background: var(--amber); }
.dm-row.urgent .dm-row-head .bar { background: var(--red); }
.dm-row-head .info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dm-row-head .info .name { font-size: 14px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-row-head .info .meta { font-size: 11px; color: var(--ink-3); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-row-head .info .meta b { color: var(--ink-2); font-weight: 600; }
.dm-row-head .qty { font-size: 18px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.dm-row-head .qty .lbl { font-size: 9px; font-weight: 600; color: var(--ink-3); display: block; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1; margin-top: 2px; text-align: right; }
.dm-row-head .chev { color: var(--ink-3); transition: transform 180ms ease; }
.dm-row.expanded .dm-row-head .chev { transform: rotate(90deg); }
.dm-status { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase; margin-top: 3px; align-self: flex-start; }
.dm-status.ready { background: var(--green-soft); color: var(--green); }
.dm-status.done { background: rgba(70,119,200,0.12); color: var(--blue); }
.dm-status.active { background: var(--surface-3); color: var(--ink-3); }
.dm-status.urgent { background: var(--red-soft); color: var(--red); }

.dm-steps { border-top: 1px solid var(--hairline); background: var(--surface-2); padding: 12px 14px 14px; }
.dm-steps .label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 8px; }
.dm-dept { display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: center; padding: 10px 14px 10px 12px; background: var(--surface); border: 1px solid var(--hairline); border-left: 4px solid var(--ink-3); border-radius: 8px; margin-top: 6px; }
.dm-dept:first-child { margin-top: 0; }
.dm-dept .dept-tag { display: inline-flex; align-items: center; justify-content: center; padding: 4px 0; color: white; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 6px; }
.dm-dept-body { min-width: 0; }
.dm-dept .machine-line { font-size: 13px; font-weight: 600; color: var(--ink); }
.dm-dept .when-line { display: flex; align-items: baseline; gap: 8px; margin-top: 3px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.dm-dept .when-line .date { color: var(--ink); font-weight: 700; }
.dm-dept .when-line .time { color: var(--ink-2); }
.dm-dept .when-line .time b { color: var(--ink); font-weight: 700; }
.dm-dept .pill { font-size: 9px; font-weight: 700; padding: 3px 9px; border-radius: 999px; letter-spacing: 0.06em; text-transform: uppercase; background: var(--surface-3); color: var(--ink-3); }
.dm-dept.completed .pill { background: var(--green-soft); color: var(--green); }
.dm-dept.working .pill { background: var(--amber-soft); color: var(--amber); }
.dm-ready { margin-top: 10px; padding: 10px 14px; background: var(--navy-soft); border: 1px solid var(--hairline); border-radius: 8px; font-size: 12px; color: var(--ink-2); text-align: center; }
.dm-ready b { color: var(--navy); font-weight: 700; font-variant-numeric: tabular-nums; }
.dm-ready.ready { background: var(--green-soft); border-color: rgba(76,175,106,0.32); color: var(--green); font-weight: 700; }
.dm-row-head .ship-check { width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--hairline-2); background: var(--surface); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: white; transition: background 120ms ease, border-color 120ms ease; flex-shrink: 0; }
.dm-row-head .ship-check:hover { border-color: var(--green); }
.dm-row-head .ship-check.on { background: var(--green); border-color: var(--green); }
.dm-row-head .ship-check.placeholder { opacity: 0; cursor: default; pointer-events: none; }

.dm-foot { border-top: 1px solid var(--hairline); padding: 12px 18px; background: var(--surface-2); display: flex; align-items: center; gap: 10px; }
.dm-foot .hint { font-size: 12px; color: var(--ink-3); font-weight: 500; flex: 1; }
.dm-foot .hint b { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
.dm-foot .ghost { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); border-radius: 9px; padding: 8px 14px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.dm-foot .ship-btn { appearance: none; border: 0; background: var(--green); color: white; border-radius: 9px; padding: 9px 18px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 4px 12px rgba(76,175,106,0.28); transition: filter 120ms ease, transform 80ms ease; }
.dm-foot .ship-btn:hover { filter: brightness(1.06); }
.dm-foot .ship-btn:active { transform: translateY(1px); }
.dm-foot .ship-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.dm-steps .none { padding: 10px 0; font-size: 12px; color: var(--ink-3); font-style: italic; }

.ic { display: inline-block; vertical-align: middle; }
`

// Map an order's department string to the calendar chip's dept key.
function deptKey(d) {
  if (d === 'upholstery') return 'uphol'
  if (d === 'dispatch') return 'disp'
  return d || 'other'
}

// Status tag drives the chip colour:
//   ready   = boss did the final tick (ready_for_dispatch_at set)
//   done    = production complete, awaiting tick
//   urgent  = CR overdue/urgent and not yet done
//   active  = everything else
function statusFor(o, productionComplete) {
  if (o.ready_for_dispatch_at) return 'ready'
  if (productionComplete) return 'done'
  if (o.cr_band === 'overdue' || o.cr_band === 'urgent') return 'urgent'
  return 'active'
}

// Build ordersByDate map from live data. Each entry is shaped like the mock
// chips were so the existing calendar/day-panel components keep working with
// minimal change.
function buildOrdersByDate(enrichedOrders, productionCompleteByOrderId) {
  const start = new Map()
  const ship = new Map()
  const today = new Date()
  const year = today.getFullYear()
  const push = (m, key, entry) => {
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(entry)
  }
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  for (const o of enrichedOrders) {
    if (o.needs_review) continue
    // Shipped orders leave the calendar — they live in Dashboard's Completed
    // section now, not the dispatch team's "what's leaving" view.
    if (o.status === 'completed' || o.shipped_at) continue
    const productionComplete = productionCompleteByOrderId.get(o.id) || false
    const st = statusFor(o, productionComplete)
    const base = {
      // Display label prefers ord_nr (client number); kwitasie is only set
      // by CSV imports.
      ord: o.ord_nr || o.kwitasie_nr || '—',
      name: o.product_name || o.description || o.product_code || `Order ${o.ord_nr || o.kwitasie_nr || ''}`,
      qty: o.qty || 0,
      dept: deptKey(o.department),
      urgent: st === 'urgent',
      status: st,
      orderId: o.id,
      customer: o.customer_name,
    }
    if (o.prod_week != null && o.prod_day != null) {
      const d = isoWeekDayToDate(year, o.prod_week, o.prod_day)
      push(start, fmt(d), { ...base, kind: 'start' })
    }
    if (o.send_week != null && o.send_day != null) {
      const d = isoWeekDayToDate(year, o.send_week, o.send_day)
      push(ship, fmt(d), { ...base, kind: 'ship' })
    } else if (o.due_date) {
      push(ship, o.due_date.slice(0, 10), { ...base, kind: 'ship' })
    }
  }
  return { start, ship }
}

function weekNum(year, month, day) {
  const d = new Date(Date.UTC(year, month, day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1)
  const firstWeekday = (first.getDay() + 6) % 7
  const startDay = 1 - firstWeekday
  const cells = []
  for (let w = 0; w < 5; w++) {
    for (let d = 0; d < 5; d++) {
      const dayNumber = startDay + w * 7 + d
      cells.push(new Date(year, month, dayNumber))
    }
  }
  return cells
}

const fmtKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

function deptName(d) {
  return d === 'steel' ? 'Steel' : d === 'wood' ? 'Wood' : d === 'uphol' ? 'Upholstery' : 'Dispatch'
}

function CalendarGrid({ year, month, dateMode, selectedKey, onSelect, todayKey, ordersByDate }) {
  const cells = buildMonthCells(year, month)
  const dayMap = dateMode === 'start' ? ordersByDate.start : ordersByDate.ship

  return (
    <div className="cal-wrap">
      <div className="cal-head">
        {['Mon','Tue','Wed','Thu','Fri'].map((d) => <div key={d} className="dh">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month
          const key = fmtKey(d)
          const dayOrders = dayMap.get(key) || []
          const visible = dayOrders.slice(0, 4)
          const more = dayOrders.length - visible.length
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          return (
            <div
              key={i}
              className={`cal-cell ${!inMonth ? 'muted' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(key)}
            >
              <div className="cell-head">
                <span className="dnum">{d.getDate()}</span>
                <span className="wknum">W{weekNum(d.getFullYear(), d.getMonth(), d.getDate())}</span>
              </div>
              <div className="ord-list">
                {visible.map((o, j) => (
                  <div key={j} className={`ord-chip ${o.dept} ${o.status || ''} ${o.urgent ? 'urgent' : ''}`}>
                    <span className="bar" />
                    <span className="lbl">{o.name}</span>
                    <span className="qty">×{o.qty}</span>
                  </div>
                ))}
                {more > 0 && <div className="more">+{more} more…</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// One summary row per department for an order. Each row tells dispatch
// "when does this side of the order finish?" — the latest end_time of any
// schedule row whose machine sits in that department, plus what that final
// step actually is (Welder Arrie / Spray Paint / etc.) so they know which
// operation closes out the side. Sorted earliest-to-latest finish, so the
// bottom row is the overall "ready by" moment.
function finalStepPerDept(order, schedule, machineStepsById, machinesById) {
  const buckets = new Map() // dept -> { row, step, machine }
  for (const r of schedule) {
    if (r.order_id !== order.id || !r.machine_step_id) continue
    const machine = machinesById.get(r.machine_id)
    const dept = machine?.department || 'other'
    const step = machineStepsById.get(r.machine_step_id)
    const cur = buckets.get(dept)
    const isLater = !cur
      || r.scheduled_date > cur.row.scheduled_date
      || (r.scheduled_date === cur.row.scheduled_date && (r.end_time || '') > (cur.row.end_time || ''))
    if (isLater) buckets.set(dept, { row: r, step, machine })
  }
  const out = [...buckets.entries()].map(([dept, v]) => ({ dept, ...v }))
  out.sort((a, b) => {
    if (a.row.scheduled_date !== b.row.scheduled_date) return a.row.scheduled_date < b.row.scheduled_date ? -1 : 1
    return (a.row.end_time || '').localeCompare(b.row.end_time || '')
  })
  return out
}

function deptColor(d) {
  if (d === 'steel') return 'var(--blue)'
  if (d === 'wood') return 'var(--green)'
  if (d === 'upholstery') return 'var(--purple)'
  if (d === 'dispatch') return 'var(--amber)'
  return 'var(--ink-3)'
}
function deptLabel(d) {
  if (d === 'steel') return 'Steel'
  if (d === 'wood') return 'Wood'
  if (d === 'upholstery') return 'Upholstery'
  if (d === 'dispatch') return 'Dispatch'
  return 'Other'
}

function fmtTime(t) { return t ? t.slice(0, 5) : '—' }
function fmtShortDate(s) {
  if (!s) return '—'
  const d = new Date(`${s}T00:00:00`)
  const dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
  return `${dn} ${d.getDate()} ${monthNames[d.getMonth()].slice(0,3)}`
}

function OrderRow({ order, enrichedOrder, schedule, machineStepsById, machinesById, selected, onToggleSelect }) {
  const [open, setOpen] = useState(false)
  const deptRows = useMemo(
    () => open && enrichedOrder
      ? finalStepPerDept(enrichedOrder, schedule, machineStepsById, machinesById)
      : [],
    [open, enrichedOrder, schedule, machineStepsById, machinesById],
  )
  const lastRow = deptRows[deptRows.length - 1]
  const canShip = !!enrichedOrder?.ready_for_dispatch_at
  const cls = `dm-row ${order.dept} ${order.urgent ? 'urgent' : ''} ${open ? 'expanded' : ''}`
  return (
    <div className={cls}>
      <div className="dm-row-head" onClick={() => setOpen((v) => !v)}>
        <span className="bar" />
        <div className="info">
          <span className="name">{order.name}</span>
          <span className="meta">
            #{order.ord}
            {order.customer ? <> · <b>{order.customer}</b></> : null}
            {order.urgent && <span style={{ color: 'var(--red)', fontWeight: 700 }}> · URGENT</span>}
          </span>
          <span className={`dm-status ${order.status}`}>
            {order.status === 'ready' ? 'Ready to load' :
             order.status === 'done' ? 'Production done' :
             order.status === 'urgent' ? 'Overdue' : 'In production'}
          </span>
        </div>
        <div className="qty">{order.qty}<span className="lbl">qty</span></div>
        <span
          className={`ship-check ${canShip ? '' : 'placeholder'} ${selected ? 'on' : ''}`}
          onClick={canShip ? (e) => { e.stopPropagation(); onToggleSelect(enrichedOrder.id) } : undefined}
          role={canShip ? 'checkbox' : undefined}
          aria-checked={canShip ? selected : undefined}
          title={canShip ? 'Tick to mark this order as shipped' : ''}
        >
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
        <ChevronRight size={16} strokeWidth={2} className="chev" />
      </div>
      {open && (
        <div className="dm-steps">
          <div className="label">When each side finishes</div>
          {deptRows.length === 0 ? (
            <div className="none">No schedule rows yet — regenerate the week from Schedule.</div>
          ) : (
            <>
              {deptRows.map(({ dept, row, step }) => (
                <div key={dept} className={`dm-dept ${row.status || ''}`} style={{ borderLeftColor: deptColor(dept) }}>
                  <span className="dept-tag" style={{ background: deptColor(dept) }}>{deptLabel(dept)}</span>
                  <div className="dm-dept-body">
                    <div className="machine-line">{step?.machine_name || 'Unknown machine'}</div>
                    <div className="when-line">
                      <span className="date">{fmtShortDate(row.scheduled_date)}</span>
                      <span className="time">{fmtTime(row.start_time)} → <b>{fmtTime(row.end_time)}</b></span>
                    </div>
                  </div>
                  <span className="pill">
                    {row.status === 'completed' ? 'done'
                      : row.status === 'working' ? 'running'
                      : row.status || 'queued'}
                  </span>
                </div>
              ))}
              {(() => {
                // "Order ready by" semantics:
                //   * Boss already ticked Ready-for-Dispatch  → "Ready to load now"
                //   * Every dept row is status=completed       → "Production complete"
                //   * Otherwise                                → latest end_time of any
                //                                                still-incomplete dept row
                const allDone = deptRows.every((d) => d.row.status === 'completed')
                if (enrichedOrder?.ready_for_dispatch_at) {
                  return <div className="dm-ready ready">Ready to load now</div>
                }
                if (allDone) {
                  return <div className="dm-ready ready">Production complete — awaiting final tick</div>
                }
                const incomplete = deptRows.filter((d) => d.row.status !== 'completed')
                const target = incomplete[incomplete.length - 1]
                if (!target) return null
                return (
                  <div className="dm-ready">
                    Order ready by <b>{fmtShortDate(target.row.scheduled_date)} {fmtTime(target.row.end_time)}</b>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DayModal({ dateKey, ordersByDate, dateMode, todayKey, onClose }) {
  const { schedule, enrichedOrders, machines, machineSteps, productionCompleteByOrderId, applyOrderUpdate } = useAppData()
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [shipping, setShipping] = useState(false)
  const [error, setError] = useState(null)
  // Reset selection when the day changes (re-opening on a new day shouldn't
  // inherit ticks from the previous day's modal).
  useEffect(() => { setSelectedIds(new Set()); setError(null) }, [dateKey])
  const ordersById = useMemo(
    () => new Map((enrichedOrders || []).map((o) => [o.id, o])),
    [enrichedOrders],
  )
  const machinesById = useMemo(
    () => new Map((machines || []).map((m) => [m.id, m])),
    [machines],
  )
  const machineStepsById = useMemo(
    () => new Map((machineSteps || []).map((s) => [s.id, s])),
    [machineSteps],
  )

  const toggleSelect = (orderId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId)
      return next
    })
  }

  const handleBulkShip = async () => {
    if (selectedIds.size === 0) return
    // Safety check: any selected order whose production isn't actually
    // complete (schedule rows still queued / partial) needs an explicit
    // override — otherwise we'd ship work that never got recorded as done.
    const ids = [...selectedIds]
    const incomplete = ids.filter((id) => !productionCompleteByOrderId.get(id))
    if (incomplete.length > 0) {
      const ok = window.confirm(
        `${incomplete.length} of ${ids.length} selected order(s) still have unfinished schedule rows.\n\n` +
        `Shipping them anyway will leave those rows un-recorded. Reports will be wrong.\n\n` +
        `Are you sure you want to ship?`
      )
      if (!ok) return
    }
    setShipping(true)
    setError(null)
    let shipped = 0
    try {
      for (const id of ids) {
        const updated = await markShipped(id)
        applyOrderUpdate(id, updated)
        shipped += 1
      }
      setSelectedIds(new Set())
    } catch (e) {
      setError(`Shipped ${shipped} of ${ids.length} before this failed: ${e.message || String(e)}`)
    } finally {
      setShipping(false)
    }
  }

  if (!dateKey) return null

  const d = new Date(`${dateKey}T00:00:00`)
  const dayMap = dateMode === 'start' ? ordersByDate.start : ordersByDate.ship
  const dayOrders = dayMap.get(dateKey) || []
  const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
  const totalParts = dayOrders.reduce((s, o) => s + o.qty, 0)
  const urgent = dayOrders.filter((o) => o.urgent).length
  const ready = dayOrders.filter((o) => o.status === 'ready').length
  const isToday = dateKey === todayKey

  return (
    <div className="dm-back" onClick={onClose}>
      <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dm-head">
          <div className="titles">
            <span className="when">{isToday ? 'Today' : (dateMode === 'ship' ? 'Shipping' : 'Production start')} · Wk{weekNum(d.getFullYear(), d.getMonth(), d.getDate())}</span>
            <h3>{dayName} · {monthNames[d.getMonth()]} {d.getDate()}</h3>
            <div className="meta">
              <span><b>{dayOrders.length}</b> orders</span>
              <span className="sep">·</span>
              <span><b>{totalParts}</b> parts</span>
              {ready > 0 && <><span className="sep">·</span><span style={{ color: 'var(--green)', fontWeight: 700 }}><b style={{ color: 'var(--green)' }}>{ready}</b> ready</span></>}
              {urgent > 0 && <><span className="sep">·</span><span style={{ color: 'var(--red)', fontWeight: 700 }}><b style={{ color: 'var(--red)' }}>{urgent}</b> urgent</span></>}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="dm-body">
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid rgba(210,83,58,0.32)', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{error}</div>
          )}
          {dayOrders.length === 0 ? (
            <div className="dm-empty">No orders {dateMode === 'ship' ? 'shipping' : 'starting'} this day.</div>
          ) : null}
          {dayOrders.length > 0 && (
            dayOrders.map((o) => {
              const eo = ordersById.get(o.orderId)
              return (
                <OrderRow
                  key={`${o.kind}-${o.orderId || o.ord}`}
                  order={o}
                  enrichedOrder={eo}
                  schedule={schedule}
                  machineStepsById={machineStepsById}
                  machinesById={machinesById}
                  selected={eo ? selectedIds.has(eo.id) : false}
                  onToggleSelect={toggleSelect}
                />
              )
            })
          )}
        </div>
        {dayOrders.length > 0 && (
          <div className="dm-foot">
            <span className="hint">
              {selectedIds.size > 0
                ? <><b>{selectedIds.size}</b> selected to ship</>
                : 'Tick the boxes on the right of any ready orders, then click Mark shipped.'}
            </span>
            {selectedIds.size > 0 && (
              <button className="ghost" onClick={() => setSelectedIds(new Set())} disabled={shipping}>
                Clear
              </button>
            )}
            <button
              className="ship-btn"
              onClick={handleBulkShip}
              disabled={selectedIds.size === 0 || shipping}
            >
              <Send size={13} strokeWidth={2.4} />
              {shipping ? 'Shipping…' : `Mark ${selectedIds.size || ''} shipped`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DispatchScreen() {
  const { enrichedOrders, productionCompleteByOrderId } = useAppData()
  const today = new Date()
  const todayKey = fmtKey(today)
  const [dateMode, setDateMode] = useState('ship')
  const [view, setView] = useState('month')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState(null)

  const ordersByDate = useMemo(
    () => buildOrdersByDate(enrichedOrders, productionCompleteByOrderId),
    [enrichedOrders, productionCompleteByOrderId],
  )

  const setMonthDelta = (delta) => {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setMonth(m)
    setYear(y)
  }

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Dispatch Calendar</h1>
              <div className="sub">Toggle between order start dates and shipping dates · click any day for details</div>
            </div>
            <div className="topbar-actions">
              <TopbarActions />
            </div>
          </div>

          <div className="filter-bar">
            <div className="dept-tabs">
              <button className="dept-tab" aria-pressed={dateMode === 'start'} onClick={() => setDateMode('start')}><I n="hammer" s={12} /> Start Dates</button>
              <button className="dept-tab" aria-pressed={dateMode === 'ship'} onClick={() => setDateMode('ship')}><I n="truck" s={12} /> Shipping Dates</button>
            </div>
            <div style={{ flex: 1 }} />
            <div className="month-nav">
              <button onClick={() => setMonthDelta(-1)} title="Previous month"><I n="chev-l" s={14} /></button>
              <button className="today" onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); setSelectedKey(todayKey) }}>Today</button>
              <button onClick={() => setMonthDelta(1)} title="Next month"><I n="chev-r" s={14} /></button>
            </div>
            <div className="view-switch">
              <button aria-pressed={view === 'month'} onClick={() => setView('month')}>Month</button>
              <button aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</button>
              <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
            </div>
          </div>

          <div className="month-head">
            <h2>{monthNames[month]} {year} <small>· {dateMode === 'start' ? 'Order start dates' : 'Shipping dates'}</small></h2>
            <div className="legend">
              <div className="item"><I n={dateMode === 'start' ? 'hammer' : 'truck'} s={12} /> {dateMode === 'start' ? 'Production starts' : 'Out the door'}</div>
              <div className="item"><span className="swatch" style={{ background: 'var(--red)' }} /> Urgent</div>
            </div>
          </div>

          <div className="layout">
            <CalendarGrid
              year={year}
              month={month}
              dateMode={dateMode}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              todayKey={todayKey}
              ordersByDate={ordersByDate}
            />
          </div>
          <DayModal
            dateKey={selectedKey}
            ordersByDate={ordersByDate}
            dateMode={dateMode}
            todayKey={todayKey}
            onClose={() => setSelectedKey(null)}
          />
        </main>
      </div>
    </>
  )
}
