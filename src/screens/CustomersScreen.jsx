import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import { canEdit } from '../lib/auth'
import {
  Hammer,
  Scissors,
  Activity,
  Truck,
  Grid,
  List,
  Calendar,
  Waves,
  CheckSquare,
  Package,
  HardDrive,
  Users,
  Search,
  Clock,
  Printer,
  Plus,
  Key,
  Moon,
  Sun,
  Shield,
  Download,
  Upload,
  LogOut,
  Factory,
  Edit2,
  X,
  Trash2,
} from 'lucide-react'

const iconMap = {
  hammer: Hammer,
  saw: Scissors,
  thread: Activity,
  truck: Truck,
  grid: Grid,
  list: List,
  cal: Calendar,
  wave: Waves,
  'check-sq': CheckSquare,
  pkg: Package,
  machine: HardDrive,
  users: Users,
  search: Search,
  clock: Clock,
  print: Printer,
  plus: Plus,
  key: Key,
  moon: Moon,
  sun: Sun,
  shield: Shield,
  down: Download,
  up: Upload,
  logout: LogOut,
  factory: Factory,
  edit: Edit2,
  x: X,
  trash: Trash2,
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
  --r-sm: 10px; --r-md: 14px; --r-lg: 20px;
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
  margin:0; padding:0; min-height: 100vh;
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  color: var(--ink); letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%);
}

/* ── Main / topbar / chips ─────────────────────────────── */
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

/* ── Card + form fields ────────────────────────────────── */
.card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px 18px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
.card h3 { font-size: 16px; font-weight: 600; margin: 0 0 12px; color: var(--ink); }
.field-grid { display: grid; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; font-weight: 600; color: var(--ink-2); }
.field input, .field select { padding: 9px 11px; border: 1px solid var(--hairline-2); background: var(--surface-2); border-radius: 10px; font: inherit; font-size: 13px; color: var(--ink); }

/* ── Customers.html inline styles (copied verbatim) ────── */
.add-grid { grid-template-columns: 1fr 1.5fr auto; align-items: end; }
.add-btn { background: var(--navy); color: white; border: 0; padding: 10px 18px; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 14px rgba(31,42,68,0.22); display: inline-flex; align-items: center; gap: 6px; height: 38px; }
.add-btn .ic { color: white; }

.cust-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.cust-summary .stat { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 12px 14px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 4px; }
.cust-summary .stat .l { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.cust-summary .stat .v { font-size: 22px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.cust-summary .stat .v em { font-style: normal; font-size: 11px; color: var(--ink-3); font-weight: 500; margin-left: 4px; }
.cust-summary .stat.accent .v { color: var(--accent, var(--navy)); }

.cust-list { display: flex; flex-direction: column; gap: 8px; }
.cust-list.dense { gap: 4px; }
.cust-row {
  display: grid; grid-template-columns: 40px 1fr auto auto auto;
  gap: 12px; align-items: center;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  padding: 12px 16px;
  box-shadow: var(--shadow-card);
  transition: background 120ms, transform 120ms;
}
.cust-list.dense .cust-row { padding: 8px 14px; border-radius: 10px; }
.cust-row:hover { background: var(--surface-2); }
.cust-row .avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--accent, var(--navy)); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; letter-spacing: -0.01em;
  flex-shrink: 0;
}
.cust-list.dense .cust-row .avatar { width: 28px; height: 28px; font-size: 12px; }
.cust-row .avatar.square { border-radius: 8px; }
.cust-row .avatar.outline { background: transparent; color: var(--accent, var(--navy)); border: 1.5px solid currentColor; }
.cust-row .avatar.dot { width: 10px; height: 10px; background: var(--accent, var(--navy)); align-self: center; justify-self: center; }
.cust-row .avatar.dot::before { content: ''; }
.cust-row .avatar.dot > * { display: none; }
.cust-row.no-avatar > .avatar { display: none; }
.cust-row.no-avatar { grid-template-columns: 1fr auto auto auto; }

.cust-row .name { font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; min-width: 0; }
.cust-list.dense .cust-row .name { font-size: 13px; }
.cust-row .name .notes { display: block; font-size: 11px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }
.cust-row .stat-cell { font-size: 11px; color: var(--ink-3); font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; min-width: 86px; }
.cust-row .stat-cell b { color: var(--ink); font-weight: 700; font-size: 13px; display: block; letter-spacing: -0.01em; }

.cust-row .edit-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--ink-2); background: var(--surface-2); border: 1px solid var(--hairline-2); border-radius: 7px; cursor: pointer; }
.cust-row .del-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--red); background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); border-radius: 7px; cursor: pointer; }

.cust-row .avatar.c1 { background: var(--navy); }
.cust-row .avatar.c2 { background: var(--amber); }
.cust-row .avatar.c3 { background: var(--blue); }
.cust-row .avatar.c4 { background: var(--green); }
.cust-row .avatar.c5 { background: var(--purple); }
.cust-row .avatar.c6 { background: var(--teal); }
.cust-row .avatar.c7 { background: var(--red); }
.cust-row .avatar.outline.c1 { background: transparent; color: var(--navy); }
.cust-row .avatar.outline.c2 { background: transparent; color: var(--amber); }
.cust-row .avatar.outline.c3 { background: transparent; color: var(--blue); }
.cust-row .avatar.outline.c4 { background: transparent; color: var(--green); }
.cust-row .avatar.outline.c5 { background: transparent; color: var(--purple); }
.cust-row .avatar.outline.c6 { background: transparent; color: var(--teal); }
.cust-row .avatar.outline.c7 { background: transparent; color: var(--red); }

.cust-row.hide-stats > .stat-cell { display: none; }

.cust-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.cust-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 14px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 10px; transition: transform 140ms, box-shadow 140ms; }
.cust-card:hover { transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 14px 30px rgba(26,29,36,0.08); }
.cust-card .head { display: flex; align-items: center; gap: 10px; }
.cust-card .head .avatar { width: 36px; height: 36px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
.cust-card .head .name { font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.cust-card .head .name .notes { display: block; font-size: 11px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }
.cust-card .meta { display: flex; gap: 14px; font-size: 11px; color: var(--ink-3); font-weight: 500; padding-top: 10px; border-top: 1px dashed var(--hairline); }
.cust-card .meta b { display: block; color: var(--ink); font-weight: 700; font-size: 14px; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.cust-card .actions { display: flex; gap: 6px; justify-content: flex-end; }
.cust-card .edit-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--ink-2); background: var(--surface-2); border: 1px solid var(--hairline-2); border-radius: 7px; cursor: pointer; }
.cust-card .del-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--red); background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); border-radius: 7px; cursor: pointer; }
.cust-card .avatar.c1 { background: var(--navy); }
.cust-card .avatar.c2 { background: var(--amber); }
.cust-card .avatar.c3 { background: var(--blue); }
.cust-card .avatar.c4 { background: var(--green); }
.cust-card .avatar.c5 { background: var(--purple); }
.cust-card .avatar.c6 { background: var(--teal); }
.cust-card .avatar.c7 { background: var(--red); }

.cust-search { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; box-shadow: var(--shadow-card); }
.cust-search input { flex: 1; border: 0; background: transparent; outline: 0; font: inherit; font-size: 13px; color: var(--ink); }
.cust-search .ic { color: var(--ink-3); }
.cust-search .count { font-size: 11px; color: var(--ink-3); font-weight: 500; padding: 3px 8px; background: var(--surface-2); border-radius: 999px; border: 1px solid var(--hairline); }

.ic { display: inline-block; vertical-align: middle; }
`

const CUSTS = [
  { name: 'KFC South Africa', notes: '12 active orders · primary account', orders: 12, lastOrder: '2 days ago' },
  { name: 'Wimpy', notes: 'Repeat — bench retrofits', orders: 6, lastOrder: '1 week ago' },
  { name: 'Burger King SA', notes: '', orders: 4, lastOrder: '2 weeks ago' },
  { name: "Nando's", notes: 'Window counters Q3', orders: 9, lastOrder: '4 days ago' },
  { name: 'Ocean Basket', notes: '', orders: 2, lastOrder: '1 month ago' },
  { name: 'Spur', notes: 'Custom 320 table base', orders: 5, lastOrder: '3 days ago' },
  { name: 'Debonairs Pizza', notes: '', orders: 3, lastOrder: '6 days ago' },
  { name: 'RCP Hospitality', notes: 'Booth bench programme', orders: 11, lastOrder: 'Today' },
  { name: 'Mugg & Bean', notes: '', orders: 2, lastOrder: '3 weeks ago' },
  { name: 'Panarottis', notes: '', orders: 1, lastOrder: '2 months ago' },
]

function CustRow({ c, idx, canModify = true }) {
  const colorClass = `c${(idx % 7) + 1}`
  return (
    <div className="cust-row hide-stats">
      <div className={`avatar ${colorClass}`}>{c.name[0]}</div>
      <div className="name">
        {c.name}
        {c.notes && <span className="notes">{c.notes}</span>}
      </div>
      <div className="stat-cell"><b>{c.orders}</b>orders</div>
      <div className="stat-cell"><b style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)' }}>last</b>{c.lastOrder}</div>
      {canModify && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="edit-btn"><I n="edit" s={11} /> Edit</button>
          <button className="del-btn"><I n="trash" s={12} /></button>
        </div>
      )}
    </div>
  )
}

export default function CustomersScreen() {
  const [dept, setDept] = useDeptTab('customers')
  const [q, setQ] = useState('')
  const canModify = canEdit()

  useEffect(() => { document.body.style.setProperty('--accent', '#e89a3c') }, [])

  const filtered = useMemo(
    () => q ? CUSTS.filter(c => c.name.toLowerCase().includes(q.toLowerCase())) : CUSTS,
    [q],
  )

  const totalOrders = CUSTS.reduce((s, c) => s + c.orders, 0)

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Customers</h1>
              <div className="sub">Manage repeat clients</div>
            </div>
            <div className="topbar-actions">
              <TopbarActions />
            </div>
          </div>

          <div className="filter-bar">
            <div className="dept-tabs">
              <button className="dept-tab" aria-pressed={dept === 'all'} onClick={() => setDept('all')}><I n="grid" s={12} /> All Depts</button>
              <button className="dept-tab" aria-pressed={dept === 'steel'} onClick={() => setDept('steel')}><I n="hammer" s={12} /> Steel</button>
              <button className="dept-tab" aria-pressed={dept === 'wood'} onClick={() => setDept('wood')}><I n="saw" s={12} /> Wood</button>
              <button className="dept-tab" aria-pressed={dept === 'uphol'} onClick={() => setDept('uphol')}><I n="thread" s={12} /> Upholstery</button>
              <button className="dept-tab" aria-pressed={dept === 'disp'} onClick={() => setDept('disp')}><I n="truck" s={12} /> Dispatching</button>
            </div>
          </div>

          <div className="cust-summary">
            <div className="stat"><span className="l">Customers</span><span className="v">{CUSTS.length}</span></div>
            <div className="stat accent"><span className="l">Active orders</span><span className="v">{totalOrders}</span></div>
            <div className="stat"><span className="l">New this month</span><span className="v">2<em>+1 vs last</em></span></div>
            <div className="stat"><span className="l">Top account</span><span className="v" style={{ fontSize: 14 }}>KFC South Africa</span></div>
          </div>

          {canModify && (
            <div className="card">
              <h3>Add Customer</h3>
              <div className="field-grid add-grid">
                <div className="field"><label>Customer Name</label><input placeholder="e.g. KFC South Africa" /></div>
                <div className="field"><label>Contact / Notes</label><input placeholder="Contact person or notes" /></div>
                <button className="add-btn"><I n="plus" s={12} /> Add Customer</button>
              </div>
            </div>
          )}

          <div className="cust-search">
            <I n="search" s={14} />
            <input placeholder="Search customers…" value={q} onChange={e => setQ(e.target.value)} />
            <span className="count">{filtered.length} of {CUSTS.length}</span>
          </div>

          <div className="cust-list dense">
            {filtered.map((c, i) => <CustRow key={c.name} c={c} idx={i} canModify={canModify} />)}
          </div>
        </main>
      </div>
    </>
  )
}
