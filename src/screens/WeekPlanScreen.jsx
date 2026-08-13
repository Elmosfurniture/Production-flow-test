import { useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import { useDeptTab } from '../lib/useDeptTab'
import TopbarActions from '../components/TopbarActions'
import DayModal from '../components/DayModal'
import { useAppData } from '../store/AppDataContext'
import { isoWeekDayToDate } from '../lib/scheduling'

// UI dept-tab id → the value used in touched_departments.
const DEPT_TAB_TO_DB = { steel: 'steel', wood: 'wood', uphol: 'upholstery', disp: 'dispatch', other: 'other' }
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
  Box,
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
  box: Box,
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
[data-theme="dark"] {
  --bg: #0e1118; --bg-2: #131722;
  --surface: #1a1f2c; --surface-2: #20263488; --surface-3: #232938;
  --ink: #f1f2f5; --ink-2: #b8bcc8; --ink-3: #7c8090;
  --hairline: rgba(255,255,255,0.07); --hairline-2: rgba(255,255,255,0.12);
  --navy: #2e3d63; --navy-soft: rgba(88,114,180,0.18);
  --amber: #f0ae5c; --amber-2: #f5c178; --amber-soft: rgba(240,174,92,0.16);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px rgba(0,0,0,0.4);
  --shadow-pop: 0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.45);
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
.more { font-size: 10px; font-weight: 600; color: var(--ink-3); padding: 2px 7px; cursor: pointer; }
.more:hover { color: var(--ink); }
.layout { display: block; }
.wp-error { background: var(--red-soft); color: var(--red); padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; margin-bottom: 12px; }
.wp-loading { text-align: center; padding: 16px; color: var(--ink-3); font-size: 12px; font-weight: 500; }
.day-panel { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: var(--shadow-card); position: sticky; top: 14px; overflow: hidden; max-height: calc(100vh - 28px); display: flex; flex-direction: column; }
.dp-head { padding: 14px 16px; border-bottom: 1px solid var(--hairline); background: var(--surface-2); display: flex; flex-direction: column; gap: 6px; }
.dp-head .when { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.dp-head h3 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; line-height: 1; }
.dp-head .h-meta { display: flex; gap: 10px; font-size: 12px; color: var(--ink-2); font-weight: 500; margin-top: 4px; align-items: center; }
.dp-head .h-meta b { color: var(--ink); font-weight: 700; }
.dp-head .h-meta .sep { color: var(--hairline-2); }
.dp-body { padding: 12px 16px 16px; overflow-y: auto; flex: 1; }
.dp-section + .dp-section { margin-top: 14px; }
.dp-section h4 { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--ink-3); text-transform: uppercase; margin: 0 0 6px; display: flex; align-items: center; gap: 6px; }
.dp-section h4 .count { background: var(--surface-3); color: var(--ink-2); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.04em; }
.dp-row { display: grid; grid-template-columns: 4px 1fr auto; align-items: center; gap: 10px; padding: 9px 10px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 9px; margin-bottom: 5px; transition: background 120ms ease, border-color 120ms ease; }
.dp-row:hover { background: var(--surface-2); border-color: var(--hairline-2); }
.dp-row .bar { align-self: stretch; border-radius: 2px; background: var(--accent, var(--amber)); }
.dp-row .info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dp-row .info .name { font-size: 13px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dp-row .info .meta { font-size: 11px; color: var(--ink-3); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dp-row .info .meta b { color: var(--ink-2); font-weight: 600; }
.dp-row .qty { font-size: 14px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.dp-row .qty .lbl { font-size: 9px; font-weight: 600; color: var(--ink-3); display: block; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1; margin-top: 1px; }
.dp-row.steel { --accent: var(--blue); }
.dp-row.wood { --accent: var(--green); }
.dp-row.uphol { --accent: var(--purple); }
.dp-row.disp { --accent: var(--amber); }
.dp-row.urgent { --accent: var(--red); }
.dp-empty { text-align: center; padding: 22px 12px; color: var(--ink-3); font-size: 12px; background: repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.015) 8px, rgba(0,0,0,0.015) 16px); border-radius: 10px; }
.dp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 10px; margin-bottom: 12px; }
.dp-stats .s { display: flex; flex-direction: column; gap: 1px; }
.dp-stats .s .v { font-size: 16px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1; }
.dp-stats .s .l { font-size: 9px; font-weight: 700; color: var(--ink-3); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }
.dp-foot { border-top: 1px solid var(--hairline); padding: 10px 14px; display: flex; gap: 6px; background: var(--surface-2); }
.dp-foot button { flex: 1; appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; padding: 8px; border-radius: 9px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
.dp-foot button.primary { background: var(--navy); color: white; border-color: var(--navy); }
.ic { display: inline-block; vertical-align: middle; }
@media (max-width: 1280px) { .layout { grid-template-columns: 1fr 320px; } }
@media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } .day-panel { position: static; max-height: none; } }
`


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
  // 5 weekday columns. Walk through enough rows to cover the whole month.
  // Most months fit in 5 rows; ones like Jan 2026 (Thu start) need 6.
  const lastOfMonth = new Date(year, month + 1, 0).getDate()
  const lastWeekday = (new Date(year, month, lastOfMonth).getDay() + 6) % 7
  const lastCellDay = lastOfMonth + (4 - lastWeekday < 0 ? 0 : 4 - lastWeekday)
  const rows = Math.ceil((lastCellDay - startDay + 1) / 7)
  const cells = []
  for (let w = 0; w < rows; w++) {
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

function CalendarGrid({ year, month, ordersByDate, selectedKey, onSelect, todayKey }) {
  const cells = buildMonthCells(year, month)

  return (
    <div className="cal-wrap">
      <div className="cal-head">
        {['Mon','Tue','Wed','Thu','Fri'].map((d) => <div key={d} className="dh">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month
          const key = fmtKey(d)
          const dayOrders = ordersByDate.get(key) || []
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
                  <div key={o.id || o.kwitasie_nr || j} className={`ord-chip ${o.dept_ui || ''}`}>
                    <span className="bar" />
                    <span className="lbl">{o.product_name}</span>
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

export default function WeekPlanScreen() {
  const { enrichedOrders } = useAppData()
  const today = useMemo(() => new Date(), [])
  const todayKey = fmtKey(today)
  const [dept, setDept] = useDeptTab('week')
  const [view, setView] = useState('month')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState(null)

  // Build the calendar straight from the shared cache. This makes it instant,
  // reflects sandbox/manual edits immediately, and — crucially — filters by the
  // SAME definition of department as Priority/Tracking: touched_departments
  // (which shop the item's routing/Group actually belongs to), NOT the single,
  // import-defaulted orders.department that used to leak steel items onto the
  // Wood tab and hide the real wood ones.
  const ordersByDate = useMemo(() => {
    const wantDept = DEPT_TAB_TO_DB[dept] // undefined on "All Depts"
    const byDate = new Map()
    for (const o of (enrichedOrders || [])) {
      if (o.needs_review) continue
      // Production Calendar is for work the floor still has to do.
      if (o.ready_for_dispatch_at || o.status === 'completed') continue
      if (wantDept && !(o.touched_departments || []).includes(wantDept)) continue
      if (o.prod_week == null || o.prod_day == null) continue
      const d = isoWeekDayToDate(year, o.prod_week, o.prod_day)
      const key = fmtKey(d)
      // Chip colour: on a specific dept tab everything is that dept; on "All",
      // colour by the item's first touched dept.
      const baseDept = wantDept || (o.touched_departments || [])[0] || o.department || 'other'
      const dept_ui = baseDept === 'upholstery' ? 'uphol' : baseDept === 'dispatch' ? 'disp' : baseDept
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key).push({ ...o, dept_ui })
    }
    for (const list of byDate.values()) {
      list.sort((a, b) => String(a.kwitasie_nr ?? a.ord_nr ?? '').localeCompare(String(b.kwitasie_nr ?? b.ord_nr ?? '')))
    }
    return byDate
  }, [enrichedOrders, dept, year])
  const loading = false
  const err = ''

  const visibleWeeks = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1)
    const lastOfMonth = new Date(year, month + 1, 0)
    return {
      first: weekNum(year, month, 1),
      last: weekNum(lastOfMonth.getFullYear(), lastOfMonth.getMonth(), lastOfMonth.getDate()),
    }
  }, [year, month])

  const setMonthDelta = (delta) => {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setMonth(m)
    setYear(y)
  }

  const goToday = () => {
    setMonth(today.getMonth())
    setYear(today.getFullYear())
  }

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Production Calendar</h1>
              <div className="sub">Click any day to see what's being produced · capacity bar shows load</div>
            </div>
            <div className="topbar-actions">
              <TopbarActions />
            </div>
          </div>

          <div className="filter-bar">
            <div className="dept-tabs">
              <button className="dept-tab" aria-pressed={dept === 'all'} onClick={() => setDept('all')}><I n="grid" s={12} /> All Depts</button>
              <button className="dept-tab" aria-pressed={dept === 'steel'} onClick={() => setDept('steel')}><I n="hammer" s={12} /> Steel</button>
              {/* Wood runs its own day-conveyor model — the tab swaps the whole
                  body to the wood planning view instead of this steel calendar. */}
              <button className="dept-tab" aria-pressed={dept === 'wood'} onClick={() => setDept('wood')}><I n="saw" s={12} /> Wood</button>
              <button className="dept-tab" aria-pressed={dept === 'uphol'} onClick={() => setDept('uphol')}><I n="thread" s={12} /> Upholstery</button>
              <button className="dept-tab" aria-pressed={dept === 'disp'} onClick={() => setDept('disp')}><I n="truck" s={12} /> Dispatching</button>
              <button className="dept-tab" aria-pressed={dept === 'other'} onClick={() => setDept('other')}><I n="box" s={12} /> Other</button>
            </div>
            <div style={{ flex: 1 }} />
            <div className="month-nav">
              <button onClick={() => setMonthDelta(-1)} title="Previous month"><I n="chev-l" s={14} /></button>
              <button className="today" onClick={goToday}>Today</button>
              <button onClick={() => setMonthDelta(1)} title="Next month"><I n="chev-r" s={14} /></button>
            </div>
            <div className="view-switch">
              <button aria-pressed={view === 'month'} onClick={() => setView('month')}>Month</button>
              <button aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</button>
              <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
            </div>
          </div>

          <div className="month-head">
            <h2>{monthNames[month]} {year} <small>· Wk {visibleWeeks.first} → Wk {visibleWeeks.last}</small></h2>
            <div className="legend">
              <div className="item"><span className="swatch" style={{ background: 'var(--blue)' }} /> Steel</div>
              <div className="item"><span className="swatch" style={{ background: 'var(--green)' }} /> Wood</div>
              <div className="item"><span className="swatch" style={{ background: 'var(--purple)' }} /> Upholstery</div>
              <div className="item"><span className="swatch" style={{ background: 'var(--amber)' }} /> Dispatch</div>
            </div>
          </div>

          {err && <div className="wp-error">{err}</div>}

          <div className="layout">
            <CalendarGrid year={year} month={month} ordersByDate={ordersByDate} selectedKey={selectedKey} onSelect={setSelectedKey} todayKey={todayKey} />
          </div>
          {loading && <div className="wp-loading">Loading orders…</div>}
        </main>
      </div>
      <DayModal
        open={!!selectedKey}
        onClose={() => setSelectedKey(null)}
        dateKey={selectedKey}
        orders={selectedKey ? (ordersByDate.get(selectedKey) || []) : []}
        todayKey={todayKey}
      />
    </>
  )
}
