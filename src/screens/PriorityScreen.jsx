import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import { crReason, dayLabel, formatCR, resetWeekRanks, setOrderRanks, sortByPriority } from '../lib/priority'
import { isoWeek } from '../lib/scheduling'
import { canEdit, getCurrentUser } from '../lib/auth'
import NewOrderForm from '../components/NewOrderForm'
import PartsMapModal from '../components/PartsMapModal'
import TopbarActions from '../components/TopbarActions'
import WoodPartsSortModal from '../components/WoodPartsSortModal'
import { useConfirm } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { useAppData } from '../store/AppDataContext'

// PriorityScreen reads orders straight from AppDataContext — no Supabase
// fetches happen on this screen. Writes (rank changes, deletes) still go to
// Supabase, then call refresh() to repopulate the cache.

const DEPT_TAB_TO_DB = {
  steel: 'steel',
  wood: 'wood',
  uphol: 'upholstery',
  disp: 'dispatch',
  other: 'other',
}
import {
  Hammer,
  Scissors,
  Activity,
  Truck,
  Layers,
  Grid,
  List,
  Calendar,
  Check,
  CheckSquare,
  Box,
  Factory,
  Package,
  HardDrive,
  Users,
  Search,
  DoorOpen,
  Printer,
  Clock,
  Bell,
  AlertTriangle,
  Siren,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Edit,
  Dot,
  Shield,
  LogOut,
  GripVertical,
  Plus,
  ChevronRight,
  Trash2,
  FileText,
  File,
  X,
} from 'lucide-react'

const iconMap = {
  hammer: Hammer,
  saw: Scissors,
  thread: Activity,
  truck: Truck,
  layers: Layers,
  grid: Grid,
  list: List,
  cal: Calendar,
  wave: Activity,
  check: Check,
  'check-sq': CheckSquare,
  box: Box,
  factory: Factory,
  product: Package,
  machine: HardDrive,
  users: Users,
  pkg: Package,
  search: Search,
  door: DoorOpen,
  print: Printer,
  clock: Clock,
  bell: Bell,
  alert: AlertTriangle,
  siren: Siren,
  down: ChevronDown,
  up: ChevronUp,
  arrow: ArrowRight,
  edit: Edit,
  dot: Dot,
  shield: Shield,
  logout: LogOut,
  grip: GripVertical,
  plus: Plus,
  chev: ChevronRight,
  'chev-r': ChevronRight,
  trash: Trash2,
  csv: FileText,
  tpl: File,
  x: X,
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
  --navy: #1f2a44; --navy-2: #2a3656; --navy-soft: rgba(31,42,68,0.08);
  --amber: #e89a3c; --amber-2: #f0ae5c; --amber-soft: rgba(232,154,60,0.14);
  --red: #d2533a; --red-soft: rgba(210,83,58,0.10);
  --green: #4caf6a; --green-soft: rgba(76,175,106,0.12);
  --yellow: #d4a531; --yellow-soft: rgba(212,165,49,0.14);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 20px rgba(26,29,36,0.04);
  --shadow-pop: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.06), 0 12px 28px rgba(26,29,36,0.10);
  --shadow-btn: 0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 16px rgba(31,42,68,0.24), 0 2px 4px rgba(31,42,68,0.16);
  --r-sm: 12px; --r-md: 16px; --r-lg: 22px;
}
[data-theme="dark"] {
  --bg: #0e1118; --bg-2: #131722;
  --surface: #1a1f2c; --surface-2: #20263488; --surface-3: #232938;
  --ink: #f1f2f5; --ink-2: #b8bcc8; --ink-3: #7c8090;
  --hairline: rgba(255,255,255,0.07); --hairline-2: rgba(255,255,255,0.12);
  --navy: #2e3d63; --navy-2: #3a4b76; --navy-soft: rgba(88,114,180,0.18);
  --amber: #f0ae5c; --amber-2: #f5c178; --amber-soft: rgba(240,174,92,0.16);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px rgba(0,0,0,0.4);
  --shadow-pop: 0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.45);
  --shadow-btn: 0 1px 0 rgba(255,255,255,0.12) inset, 0 6px 16px rgba(0,0,0,0.5);
}
* { box-sizing: border-box; }
html, body {
  margin:0; padding:0; min-height: 100vh;
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  color: var(--ink); letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%);
}
.main { padding: 22px 28px 60px; min-width: 0; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.topbar h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.1; }
.topbar .sub { font-size: 14px; color: var(--ink-2); margin-top: 4px; }
.topbar-actions { display: flex; gap: 8px; align-items: center; }
.ibtn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; padding: 9px 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(26,29,36,0.04); text-decoration: none; }
.ibtn:hover { background: var(--surface-2); }
.ibtn .ic { width: 15px; height: 15px; color: var(--ink-2); }
.dept-tabs { display: flex; gap: 6px; padding: 4px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 14px; margin-bottom: 16px; width: fit-content; }
.dept-tab { appearance: none; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
.dept-tab .ic { width: 15px; height: 15px; color: var(--ink-3); }
.dept-tab[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 6px rgba(26,29,36,0.06); font-weight: 600; }
.dept-tab[aria-pressed="true"] .ic { color: var(--navy); }
[data-theme="dark"] .dept-tab[aria-pressed="true"] .ic { color: var(--amber-2); }
.section { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-card); overflow: hidden; margin-bottom: 18px; }
.section-head { padding: 16px 20px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--hairline); gap: 12px; flex-wrap: wrap; }
.section-head h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
.section-head .sub { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
.week-tabs { display: flex; gap: 8px; padding: 14px 20px 0; }
.week-tab {
  appearance: none; border: 1px solid var(--hairline);
  background: var(--surface-2);
  border-radius: 12px;
  padding: 10px 16px;
  cursor: pointer; font: inherit;
  text-align: left;
  transition: all 160ms ease;
  display: flex; flex-direction: column; gap: 2px;
  min-width: 120px;
}
.week-tab .top {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--ink);
}
.week-tab .top .badge {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px; border-radius: 4px;
}
.week-tab .top .badge.overdue { background: var(--red-soft); color: var(--red); }
.week-tab .top .badge.current { background: var(--amber-soft); color: var(--amber); }
.week-tab .bot { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.week-tab[aria-pressed="true"] {
  background: var(--surface);
  border-color: var(--amber);
  box-shadow: 0 0 0 3px var(--amber-soft);
}
.meta-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 8px; }
.meta-row .l { font-size: 13px; color: var(--ink-2); font-weight: 500; }
.meta-row .l b { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
.meta-row .r { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--ink-3); font-weight: 500; }
.select-btn {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink-2);
  font: inherit; font-size: 12px; font-weight: 500;
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.select-btn:hover { color: var(--red); border-color: rgba(210,83,58,0.3); background: var(--red-soft); }
.pri-search {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface-2); border: 1px solid var(--hairline-2);
  border-radius: 8px; padding: 5px 10px; height: 30px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.pri-search:focus-within { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-soft); }
.pri-search .ic { color: var(--ink-3); flex-shrink: 0; }
.pri-search input {
  border: 0; outline: none; background: transparent;
  font: inherit; font-size: 12px; color: var(--ink);
  width: 180px;
}
.pri-search input::placeholder { color: var(--ink-3); }
.pri-search .clear {
  appearance: none; border: 0; background: transparent;
  color: var(--ink-3); cursor: pointer; padding: 0;
  display: inline-flex; align-items: center;
}
.pri-search .clear:hover { color: var(--red); }
.filter-wrap { position: relative; display: inline-flex; }
.filter-btn {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink-2);
  font: inherit; font-size: 12px; font-weight: 500;
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.filter-btn:hover { background: var(--surface); color: var(--ink); }
.filter-btn.active { border-color: var(--navy); background: var(--navy-soft); color: var(--navy); font-weight: 600; }
[data-theme="dark"] .filter-btn.active { color: var(--amber-2); border-color: var(--amber); background: var(--amber-soft); }
.filter-btn .n {
  font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums;
  background: var(--navy); color: white; border-radius: 999px;
  min-width: 16px; height: 16px; padding: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
}
/* Portalled to <body> with fixed coords — the Week Planning card clips
   overflow for its rounded corners, which used to cut the popover off. */
.filter-pop {
  position: fixed; z-index: 90;
  min-width: 224px; padding: 10px;
  background: var(--surface); border: 1px solid var(--hairline-2);
  border-radius: var(--r-md); box-shadow: var(--shadow-pop);
  display: flex; flex-direction: column; gap: 4px;
  text-align: left;
  max-height: min(70vh, 520px); overflow-y: auto; overscroll-behavior: contain;
}
.filter-pop .grp {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3);
  padding: 8px 8px 4px;
}
.filter-pop .grp:first-child { padding-top: 2px; }
.filter-pop .opt {
  appearance: none; border: 0; background: transparent; color: var(--ink);
  font: inherit; font-size: 13px; font-weight: 500;
  padding: 7px 8px; border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
}
.filter-pop .opt:hover { background: var(--surface-2); }
.filter-pop .opt[aria-pressed="true"] { background: var(--navy-soft); color: var(--ink); font-weight: 600; }
.filter-pop .opt .tick { margin-left: auto; color: var(--navy); display: inline-flex; }
[data-theme="dark"] .filter-pop .opt .tick { color: var(--amber-2); }
.filter-pop .opt .cnt { margin-left: auto; font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; font-weight: 600; }
.filter-pop .opt[aria-pressed="true"] .cnt { margin-left: 0; }
.filter-pop .sep { height: 1px; background: var(--hairline); margin: 6px 0 0; }
.filter-pop .clear-all {
  appearance: none; border: 0; background: transparent; color: var(--red);
  font: inherit; font-size: 12px; font-weight: 600;
  padding: 8px; border-radius: 8px; cursor: pointer; text-align: left;
}
.filter-pop .clear-all:hover { background: var(--red-soft); }
.reset-pill {
  appearance: none; border: 1px solid rgba(232,154,60,0.3);
  background: var(--amber-soft); color: var(--amber);
  font: inherit; font-size: 12px; font-weight: 600;
  padding: 5px 12px; border-radius: 999px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.reset-pill:hover { background: rgba(232,154,60,0.22); }
.pri-list { padding: 6px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
.pri-bulk { margin: 6px 14px 0; display: flex; align-items: center; gap: 10px; background: var(--navy); color: white; padding: 10px 14px; border-radius: 12px; font-size: 13px; font-weight: 600; box-shadow: var(--shadow-btn); }
.pri-bulk .count { font-variant-numeric: tabular-nums; }
.pri-bulk .spacer { margin-left: auto; }
.pri-bulk button { appearance: none; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: white; font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.pri-bulk button.danger { background: var(--red); border-color: var(--red); }
.pri-bulk button:hover { background: rgba(255,255,255,0.1); }
.pri-bulk button.danger:hover { background: var(--red); filter: brightness(0.92); }
.pri-bulk button:disabled { opacity: 0.5; cursor: not-allowed; }
.cbx { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--hairline-2); background: var(--surface); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background 120ms, border-color 120ms; flex-shrink: 0; }
.cbx.on { background: var(--navy); border-color: var(--navy); color: white; }
.cbx svg { display: block; }
.pri-row {
  display: grid;
  grid-template-columns: 44px 70px 1fr auto auto 70px auto;
  align-items: center;
  gap: 14px;
  padding: 14px 14px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  transition: transform 120ms ease, box-shadow 200ms ease, background 160ms ease;
}
.pri-row.with-cbx { grid-template-columns: 22px 44px 70px 1fr auto auto 70px auto; }
.pri-row.selected { border-color: var(--navy); box-shadow: 0 0 0 1px var(--navy); background: var(--surface); }
.row-actions { display: inline-flex; gap: 4px; }
.row-actions .iconbtn {
  appearance: none; border: 1px solid transparent;
  background: transparent; color: var(--ink-3); cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
}
.row-actions .iconbtn:hover { background: var(--surface); color: var(--ink); border-color: var(--hairline-2); }
.pri-row:hover {
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  transform: translateY(-1px);
}
.pri-row:active { cursor: grabbing; }
.pri-row.dragging { opacity: 0.4; background: var(--surface-3); }
.pri-row.drop-target { box-shadow: 0 -3px 0 var(--amber) inset; border-color: var(--amber); }
.rank {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 999px;
  background: var(--surface-3);
  color: var(--ink-2);
  font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.pri-row.top1 .rank { background: var(--navy); color: white; }
.pri-row.top2 .rank { background: var(--amber); color: white; }
.pri-row.top3 .rank { background: var(--amber-soft); color: var(--amber); }
.ord-id {
  display: flex; flex-direction: column; gap: 1px;
  font-size: 14px; font-weight: 700; color: var(--amber);
  font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
}
.ord-id .ordnr {
  font-size: 10px; font-weight: 600; color: var(--ink-3);
  letter-spacing: 0.04em; text-transform: uppercase;
}
.prod-name {
  font-size: 15px; font-weight: 600; color: var(--ink);
  letter-spacing: -0.01em;
  display: flex; align-items: baseline; gap: 8px;
}
.prod-name .qty {
  font-size: 15px; color: var(--amber); font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--amber-soft); padding: 2px 9px; border-radius: 6px;
  letter-spacing: -0.01em;
}
.date-block {
  display: flex; flex-direction: column; gap: 1px;
  font-size: 11px; color: var(--ink-3); font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.04em;
  text-align: center;
  min-width: 78px;
}
.date-block .v {
  font-size: 13px; font-weight: 600; color: var(--ink);
  text-transform: none; letter-spacing: -0.01em;
  margin-top: 1px;
  font-variant-numeric: tabular-nums;
}
.date-block .v .day {
  color: var(--green); font-weight: 600;
}
.date-block.dispatch .v .day { color: var(--green); }
.cr-pill {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--green-soft);
  color: var(--green);
  min-width: 56px;
}
.cr-pill b { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.cr-pill span { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; margin-top: 2px; }
.cr-pill.warn { background: var(--amber-soft); color: var(--amber); }
.cr-pill.danger { background: var(--red-soft); color: var(--red); }
.cr-pill.mid { background: var(--yellow-soft); color: var(--yellow); }
.cr-pill.unknown { background: var(--surface-3); color: var(--ink-3); }
.pstat {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.pstat.done { background: var(--green-soft); color: var(--green); }
.pstat.wip { background: var(--amber-soft); color: var(--amber); }
.pri-state {
  padding: 30px 20px; text-align: center;
  color: var(--ink-3); font-size: 13px; font-weight: 500;
}
.pri-state.err { color: var(--red); }
.grip {
  color: var(--ink-3); display: flex; align-items: center; justify-content: center;
  cursor: grab; opacity: 0.6;
}
.grip:hover { opacity: 1; color: var(--ink-2); }
.new-order {
  margin: 6px 14px 14px;
  background: var(--surface-2);
  border: 1.5px dashed var(--hairline-2);
  border-radius: var(--r-md);
  padding: 14px 16px;
  display: flex; align-items: center; gap: 10px;
  cursor: pointer;
  color: var(--ink-2);
  font-size: 14px; font-weight: 500;
  transition: all 160ms ease;
}
.new-order:hover {
  background: var(--surface);
  border-color: var(--amber);
  color: var(--amber);
}
.new-order .chev { margin-left: auto; font-size: 11px; color: var(--ink-3); }
.toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-2); font-weight: 500; padding: 6px 4px; }
.toggle .switch { width: 32px; height: 18px; border-radius: 999px; background: var(--hairline-2); position: relative; cursor: pointer; }
.toggle .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: transform 200ms ease; }
.toggle.on .switch { background: var(--navy); }
.toggle.on .switch::after { transform: translateX(14px); }
.ic { display: inline-block; vertical-align: middle; }
@media (max-width: 980px) {
  .pri-row { grid-template-columns: 36px 60px 1fr 56px; }
  .pri-row.with-cbx { grid-template-columns: 22px 36px 60px 1fr 56px; }
  .pri-row .date-block, .pri-row .grip { display: none; }
}
`

function PriRow({ rank, order, mayEdit, onEdit, onViewParts, activeDept, progress, scopeLabel, index, dragIndex, setDragIndex, dropIndex, setDropIndex, onMove, selectable, selected, onToggleSelect }) {
  const topClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : ''
  // Single CR source: always use the order's own CR. We used to overlay a
  // dept-track CR when on a specific dept tab, but it caused "row says
  // urgent but the date looks fine" confusion (track CR derived from a
  // different bottleneck than the displayed prod date). One number → one
  // story.
  const displayedProdWeek = order.prod_week
  const displayedProdDay = order.prod_day
  const displayedCr = order.cr
  const displayedCrBand = order.cr_band
  const prodWk = displayedProdWeek != null ? `Wk${displayedProdWeek}` : '—'
  const dispWk = order.send_week != null ? `Wk${order.send_week}` : '—'
  const isDragging = dragIndex === index
  const isDropTarget = dropIndex === index && dragIndex != null && dragIndex !== index
  return (
    <div
      className={`pri-row ${topClass} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${selected ? 'selected' : ''} ${selectable ? 'with-cbx' : ''}`}
      draggable={mayEdit}
      onDoubleClick={onViewParts ? () => onViewParts(order) : undefined}
      title="Double-click to see parts map"
      onDragStart={mayEdit ? (e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
        setDragIndex(index)
      } : undefined}
      onDragOver={mayEdit ? (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dropIndex !== index) setDropIndex(index)
      } : undefined}
      onDragLeave={mayEdit ? () => {
        if (dropIndex === index) setDropIndex(null)
      } : undefined}
      onDragEnd={mayEdit ? () => { setDragIndex(null); setDropIndex(null) } : undefined}
      onDrop={mayEdit ? (e) => {
        e.preventDefault()
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
        setDragIndex(null); setDropIndex(null)
        if (!Number.isNaN(from) && from !== index) onMove(from, index)
      } : undefined}
    >
      {selectable && (
        <span
          className={`cbx ${selected ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          onMouseDown={(e) => e.stopPropagation()}
          role="checkbox"
          aria-checked={selected}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </span>
      )}
      <div className="rank">{rank}</div>
      <div className="ord-id">
        {/* Ord # is the primary label (client-facing). Kwitasie # is only
            populated from CSV imports — show it as the small secondary tag
            if present, otherwise nothing. */}
        {order.ord_nr || order.kwitasie_nr || '—'}
        {order.ord_nr && order.kwitasie_nr && <span className="ordnr">{order.kwitasie_nr}</span>}
      </div>
      <div className="prod-name">
        {order.product_name} <span className="qty">×{order.qty}</span>
        {progress === 'done' && (
          <span className="pstat done" title={scopeLabel ? `Finished in ${scopeLabel}` : 'Production finished'}>
            <I n="check" s={11} /> Done{scopeLabel ? ` · ${scopeLabel}` : ''}
          </span>
        )}
        {progress === 'wip' && (
          <span className="pstat wip" title={scopeLabel ? `Started in ${scopeLabel}` : 'Started'}>Running</span>
        )}
        {(!order.total_minutes || order.total_minutes <= 0) && (
          <span
            title="This product has no machine routing — the scheduler will skip it. Open Products and add parts/steps."
            style={{
              marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999, background: 'var(--red-soft, rgba(210,83,58,0.10))',
              color: 'var(--red, #d2533a)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            ⚠ No routing
          </span>
        )}
      </div>
      <div className="date-block">
        PROD
        <div className="v">{prodWk} <span className="day">{dayLabel(displayedProdDay)}</span></div>
      </div>
      <div className="date-block dispatch">
        DISPATCH
        <div className="v">{dispWk} <span className="day">{dayLabel(order.send_day)}</span></div>
      </div>
      <div className={`cr-pill ${displayedCrBand}`} title={crReason(order) || ''}>
        <b>{formatCR(displayedCr)}</b><span>CR</span>
      </div>
      <div className="row-actions">
        {mayEdit && (
          <button type="button" className="iconbtn" onClick={() => onEdit(order)} aria-label={`Edit order ${order.ord_nr || order.kwitasie_nr || ''}`} title="Edit">
            <I n="edit" s={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// Quick filters shown in the popover next to the search box.
const PROGRESS_FILTERS = [
  { key: 'all', label: 'All items' },
  { key: 'todo', label: 'To do' },
  { key: 'wip', label: 'In progress' },
  { key: 'done', label: 'Done' },
]
const DEPT_LABEL = {
  steel: 'Steel', wood: 'Wood', upholstery: 'Upholstery', dispatch: 'Dispatch', other: 'Other',
}
const DEPT_FILTERS = [
  { key: 'all', label: 'Any department' },
  { key: 'steel', label: 'Steel only' },
  { key: 'wood', label: 'Wood only' },
  { key: 'upholstery', label: 'Upholstery only' },
  { key: 'dispatch', label: 'Dispatch only' },
]

// Progress bucket for one enriched order.
//
// `dept` scopes it: on the Wood tab an order counts as done once its WOOD work
// is finished, even if its steel base is still open — so a half-finished mixed
// order drops out of Wood's "To do" and shows up in Wood's "Done" while Steel
// still lists it as outstanding. Without a dept (All Depts) it's the whole
// order: done only when every department is.
//
// The signals come from deptProgressByOrderId in AppDataContext — the same
// map every other screen reads — so a part marked done at MES / on the wood
// day-board reflects here and everywhere else at once.
function progressOf(order, deptProgress, productionComplete, dept) {
  const orderDone = order.status === 'completed' || !!order.shipped_at || !!order.ready_for_dispatch_at
  if (dept) {
    const entry = deptProgress?.get(dept)
    // No routing in this dept yet: fall back to the order-level signals so the
    // row still buckets sensibly instead of parking in "To do" forever.
    if (!entry?.hasWork) return orderDone || productionComplete ? 'done' : 'todo'
    if (orderDone || entry.complete) return 'done'
    const track = (order.tracks || []).find((t) => t.department === dept)
    if (entry.started || track?.started_at || track?.status === 'in_progress') return 'wip'
    return 'todo'
  }
  if (orderDone || productionComplete) return 'done'
  if (order.status === 'in_progress' || (order.tracks || []).some((t) => t.status === 'in_progress' || t.started_at)) return 'wip'
  if (deptProgress && [...deptProgress.values()].some((e) => e.hasWork && e.started)) return 'wip'
  return 'todo'
}

export default function PriorityScreen() {
  const { enrichedOrders, loading, error, applyOrderUpdate, applyOrderInsert, applyOrdersDelete, productionCompleteByOrderId, deptProgressByOrderId } = useAppData()
  const [dept, setDept] = useDeptTab('priority')
  const [week, setWeek] = useState(null) // null = will auto-select once weeks are known
  const [editingOrder, setEditingOrder] = useState(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [viewingPartsCode, setViewingPartsCode] = useState(null)
  const [sortPartsOpen, setSortPartsOpen] = useState(false)
  const user = getCurrentUser()
  const mayEdit = canEdit(user?.role)
  const formOpen = creatingNew || !!editingOrder

  const handleEdit = (order) => {
    setEditingOrder(order)
  }

  const handleViewParts = (order) => {
    if (order?.product_code) setViewingPartsCode(order.product_code)
  }

  const closeForm = () => {
    setEditingOrder(null)
    setCreatingNew(false)
  }

  // Derive everything loadPriority() used to return — orders filtered to the
  // active dept + a weeks summary for the tab bar — from the cached enriched
  // orders. All in-memory, no Supabase calls.
  const data = useMemo(() => {
    const dbDept = DEPT_TAB_TO_DB[dept]
    // Hide orders whose product code hasn't been reconciled yet — they live on
    // the Reconcile screen until the user picks a real product for them, then
    // their routing/CR/department all snap into place.
    const reconciledOrders = enrichedOrders.filter((o) => !o.needs_review)
    // Show an order on a dept tab if its routing touches that dept — so a
    // coffee table with a steel base AND a wood top appears on BOTH Wood and
    // Steel Priority tabs.
    const ordersInDept = dbDept
      ? reconciledOrders.filter((o) => (o.touched_departments || []).includes(dbDept))
      : reconciledOrders
    // Group by the order's OWN prod_week — the value the user set (manually or
    // via auto-calc). Using a recomputed per-dept track here made a manually
    // scheduled order jump to a different week/day than the one that was typed.
    // Steel and wood now behave identically: what you set is where it lands.
    const effProdWeek = (o) => o.prod_week
    const currentWeek = isoWeek(new Date())
    const weekCounts = new Map()
    let unscheduledCount = 0
    ordersInDept.forEach((o) => {
      const w = effProdWeek(o)
      if (w == null) { unscheduledCount++; return }
      weekCounts.set(w, (weekCounts.get(w) || 0) + 1)
    })
    const weeks = [...weekCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, count]) => ({
        num, label: `Wk ${num}`, count,
        isCurrent: num === currentWeek,
        isOverdue: num < currentWeek,
      }))
    if (unscheduledCount > 0) {
      weeks.push({ num: 'unscheduled', label: 'Unscheduled', count: unscheduledCount, isCurrent: false, isOverdue: false })
    }
    return { orders: ordersInDept, weeks, currentWeek, effProdWeek }
  }, [enrichedOrders, dept])

  // Auto-pick the current week (or first week) once weeks are known. Re-runs
  // when the dept tab changes since the available weeks shift with it.
  useEffect(() => {
    setWeek((prev) => {
      if (prev != null && data.weeks.some((w) => w.num === prev)) return prev
      const current = data.weeks.find((w) => w.isCurrent)
      if (current) return current.num
      return data.weeks[0]?.num ?? null
    })
  }, [data.weeks])

  const [search, setSearch] = useState('')
  const [progress, setProgress] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [noRoutingOnly, setNoRoutingOnly] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterBtnRef = useRef(null)
  const [popPos, setPopPos] = useState({ top: 0, right: 0 })
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const toggleSelectOne = (kwitasie) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(kwitasie)) next.delete(kwitasie); else next.add(kwitasie)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())
  const exitSelectMode = () => { setSelectMode(false); clearSelection() }

  // Whenever the visible week / dept changes, drop any selections AND leave
  // select-mode — keeps the bar honest and prevents stale picks.
  useEffect(() => { exitSelectMode() }, [dept, week])

  const weekOrdersSorted = useMemo(() => {
    let base
    if (week === 'unscheduled') base = data.orders.filter((o) => data.effProdWeek(o) == null)
    else if (week == null) base = data.orders
    else base = data.orders.filter((o) => data.effProdWeek(o) === week)
    return sortByPriority(base)
  }, [data.orders, week, data.effProdWeek])

  // Which department the progress filter is judged against: the quick-filter
  // if one is picked, otherwise the dept tab you're standing on. Null on All
  // Depts, where "done" means done everywhere.
  const scopeDept = deptFilter !== 'all' ? deptFilter : (DEPT_TAB_TO_DB[dept] || null)
  const bucketOf = (o) => progressOf(o, deptProgressByOrderId.get(o.id), productionCompleteByOrderId.get(o.id), scopeDept)

  // Counts shown next to each filter option — computed off the unfiltered
  // week list so the numbers stay stable while you flick between filters.
  const filterCounts = useMemo(() => {
    const prog = { all: weekOrdersSorted.length, todo: 0, wip: 0, done: 0 }
    const depts = { all: weekOrdersSorted.length, steel: 0, wood: 0, upholstery: 0, dispatch: 0 }
    for (const o of weekOrdersSorted) {
      prog[bucketOf(o)]++
      for (const d of o.touched_departments || []) {
        if (depts[d] != null && d !== 'all') depts[d]++
      }
    }
    return { prog, depts }
  }, [weekOrdersSorted, productionCompleteByOrderId, deptProgressByOrderId, scopeDept])

  const activeFilterCount =
    (progress !== 'all' ? 1 : 0) + (deptFilter !== 'all' ? 1 : 0) + (urgentOnly ? 1 : 0) + (noRoutingOnly ? 1 : 0)

  const clearFilters = () => {
    setProgress('all'); setDeptFilter('all'); setUrgentOnly(false); setNoRoutingOnly(false)
  }

  const ordersForWeek = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = weekOrdersSorted
    if (progress !== 'all') rows = rows.filter((o) => bucketOf(o) === progress)
    if (deptFilter !== 'all') rows = rows.filter((o) => (o.touched_departments || []).includes(deptFilter))
    if (urgentOnly) rows = rows.filter((o) => o.cr != null && o.cr < 1)
    if (noRoutingOnly) rows = rows.filter((o) => !o.total_minutes || o.total_minutes <= 0)
    if (!q) return rows
    return rows.filter((o) =>
      String(o.kwitasie_nr || '').toLowerCase().includes(q) ||
      String(o.product_code || '').toLowerCase().includes(q) ||
      String(o.product_name || '').toLowerCase().includes(q) ||
      String(o.customer_code || '').toLowerCase().includes(q),
    )
  }, [weekOrdersSorted, search, progress, deptFilter, urgentOnly, noRoutingOnly, productionCompleteByOrderId, deptProgressByOrderId, scopeDept])

  const hasManualRanks = useMemo(() => weekOrdersSorted.some((o) => o.priority_rank != null), [weekOrdersSorted])
  const totalParts = useMemo(() => ordersForWeek.reduce((sum, o) => sum + (o.qty || 0), 0), [ordersForWeek])

  // Ranks are positions in the full week list, so any narrowing of the list
  // (search or a quick filter) has to switch drag-to-reorder off.
  const isFiltered = !!search.trim() || activeFilterCount > 0

  // A dept quick-filter from one tab makes no sense on the next one.
  useEffect(() => { setDeptFilter('all') }, [dept])

  // The popover is portalled to <body>, so it needs viewport coords: pin it
  // under the Filter button, right-aligned, and flip above when the button is
  // near the bottom of the window.
  const placePop = useCallback(() => {
    const el = filterBtnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const right = Math.max(8, window.innerWidth - r.right)
    const spaceBelow = window.innerHeight - r.bottom
    if (spaceBelow < 300 && r.top > spaceBelow) setPopPos({ bottom: window.innerHeight - r.top + 6, right })
    else setPopPos({ top: r.bottom + 6, right })
  }, [])

  useLayoutEffect(() => { if (filterOpen) placePop() }, [filterOpen, placePop])

  // Close on outside click / Escape; follow the button while the page scrolls
  // (Priority scrolls the window, but the listener is in capture mode so an
  // inner scroll container works too).
  useEffect(() => {
    if (!filterOpen) return
    const onDown = (e) => { if (!e.target.closest?.('.filter-wrap, .filter-pop')) setFilterOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', placePop, true)
    window.addEventListener('resize', placePop)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', placePop, true)
      window.removeEventListener('resize', placePop)
    }
  }, [filterOpen, placePop])

  const handleMove = async (fromIdx, toIdx) => {
    if (isFiltered) return // disable reorder while filtering
    if (fromIdx === toIdx) return
    const next = [...weekOrdersSorted]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const ranked = next.map((o, i) => ({ id: o.id, priority_rank: i + 1 }))
    try {
      await setOrderRanks(ranked)
      // Patch each affected order in the cache instead of round-tripping a
      // full table refetch. setOrderRanks already wrote to the server.
      for (const r of ranked) applyOrderUpdate(r.id, { priority_rank: r.priority_rank })
    } catch (e) {
      window.alert(`Save failed: ${e.message}`)
    }
  }

  const selectAllVisible = () => setSelected(new Set(ordersForWeek.map((o) => o.id)))

  const handleDeleteSelected = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await confirm({
      title: `Delete ${ids.length} order${ids.length === 1 ? '' : 's'}?`,
      body: 'Their schedule entries are removed too (cascade). This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setDeleting(true)
    try {
      const { error: err } = await supabase.from('orders').delete().in('id', ids)
      if (err) throw new Error(err.message)
      // Drop the deleted orders + their cascade-deleted schedule rows from
      // the local cache — DB cascade already cleaned the server side.
      applyOrdersDelete(ids)
      exitSelectMode()
    } catch (e) {
      window.alert(`Delete failed: ${e.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleResetRanks = async () => {
    if (!hasManualRanks) return
    const ids = weekOrdersSorted.map((o) => o.id)
    try {
      await resetWeekRanks(ids)
      // Clear priority_rank locally on every affected order so the sort
      // collapses back to pure CR immediately.
      for (const id of ids) applyOrderUpdate(id, { priority_rank: null })
    } catch (e) {
      window.alert(`Reset failed: ${e.message}`)
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Week Priority</h1>
              <div className="sub">Drag to set order — manual ranks override Critical Ratio for the active week</div>
            </div>
            <div className="topbar-actions">
              <TopbarActions iconSize={15} />
            </div>
          </div>

          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16, flexWrap:'wrap', gap: 12}}>
            <div className="dept-tabs">
              <button className="dept-tab" aria-pressed={dept==='all'} onClick={() => setDept('all')}><I n="grid" s={14}/> All Depts</button>
              <button className="dept-tab" aria-pressed={dept==='steel'} onClick={() => setDept('steel')}><I n="hammer" s={14}/> Steel</button>
              <button className="dept-tab" aria-pressed={dept==='wood'} onClick={() => setDept('wood')}><I n="saw" s={14}/> Wood</button>
              <button className="dept-tab" aria-pressed={dept==='uphol'} onClick={() => setDept('uphol')}><I n="thread" s={14}/> Upholstery</button>
              <button className="dept-tab" aria-pressed={dept==='disp'} onClick={() => setDept('disp')}><I n="truck" s={14}/> Dispatching</button>
              <button className="dept-tab" aria-pressed={dept==='other'} onClick={() => setDept('other')}><I n="box" s={14}/> Other</button>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <div>
                <h2>Week Planning</h2>
                <div className="sub">Stack orders by importance · 1 = next up</div>
              </div>
              <div style={{display:'flex', gap:8}}>
                {(dept === 'wood' || dept === 'steel') && (
                  <button
                    className="ibtn"
                    onClick={() => setSortPartsOpen(true)}
                    title={`Order the individual ${dept} parts for a chosen day — tells the shop which part to start first`}
                    style={{ borderColor: 'rgba(232,148,74,0.5)', background: 'var(--amber-soft)', color: 'var(--amber)' }}
                  >
                    <I n="list" s={14}/> Sort parts for the day
                  </button>
                )}
                {mayEdit && (
                  <button className="ibtn" onClick={() => setCreatingNew(true)}>
                    <I n="plus" s={14}/> Add Order
                  </button>
                )}
                <NavLink to="/import" className="ibtn"><I n="csv" s={14}/> Import CSV</NavLink>
                <NavLink to="/schedule" className="ibtn"><I n="cal" s={14}/> Month View <I n="arrow" s={13}/></NavLink>
              </div>
            </div>

            <div className="week-tabs">
              {data.weeks.length === 0 && !loading && (
                <div className="pri-state">No orders for this department yet.</div>
              )}
              {data.weeks.map((w) => (
                <button
                  key={w.num}
                  className="week-tab"
                  aria-pressed={week === w.num}
                  onClick={() => setWeek(w.num)}
                >
                  <div className="top">
                    {w.label}
                    {w.isOverdue && <span className="badge overdue">overdue</span>}
                    {w.isCurrent && <span className="badge current">current</span>}
                  </div>
                  <div className="bot">{w.count} order{w.count === 1 ? '' : 's'}</div>
                </button>
              ))}
            </div>

            <div className="meta-row">
              <div className="l"><b>{ordersForWeek.length}</b> order{ordersForWeek.length === 1 ? '' : 's'} · <b>{totalParts}</b> total parts</div>
              <div className="r">
                <div className="pri-search">
                  <I n="search" s={13} />
                  <input
                    type="text"
                    placeholder="Search this week…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button type="button" className="clear" onClick={() => setSearch('')} aria-label="Clear search">
                      <I n="x" s={12} />
                    </button>
                  )}
                </div>
                <div className="filter-wrap">
                  <button
                    type="button"
                    ref={filterBtnRef}
                    className={`filter-btn ${activeFilterCount > 0 ? 'active' : ''}`}
                    onClick={() => setFilterOpen((v) => !v)}
                    aria-expanded={filterOpen}
                    title="Filter this week's list"
                  >
                    <I n="list" s={13} /> Filter
                    {activeFilterCount > 0 && <span className="n">{activeFilterCount}</span>}
                  </button>
                  {filterOpen && createPortal(
                    <div className="filter-pop" style={popPos}>
                      <div className="grp">
                        Progress {scopeDept ? `· in ${DEPT_LABEL[scopeDept]}` : '· all depts'}
                      </div>
                      {PROGRESS_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          className="opt"
                          aria-pressed={progress === f.key}
                          onClick={() => setProgress(f.key)}
                        >
                          {f.label}
                          <span className="cnt">{filterCounts.prog[f.key]}</span>
                          {progress === f.key && <span className="tick"><I n="check" s={14} /></span>}
                        </button>
                      ))}
                      <div className="grp">Department</div>
                      {DEPT_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          className="opt"
                          aria-pressed={deptFilter === f.key}
                          onClick={() => setDeptFilter(f.key)}
                        >
                          {f.label}
                          <span className="cnt">{filterCounts.depts[f.key]}</span>
                          {deptFilter === f.key && <span className="tick"><I n="check" s={14} /></span>}
                        </button>
                      ))}
                      <div className="grp">Flags</div>
                      <button type="button" className="opt" aria-pressed={urgentOnly} onClick={() => setUrgentOnly((v) => !v)}>
                        Urgent only (CR &lt; 1)
                        {urgentOnly && <span className="tick"><I n="check" s={14} /></span>}
                      </button>
                      <button type="button" className="opt" aria-pressed={noRoutingOnly} onClick={() => setNoRoutingOnly((v) => !v)}>
                        Missing routing
                        {noRoutingOnly && <span className="tick"><I n="check" s={14} /></span>}
                      </button>
                      {activeFilterCount > 0 && (
                        <>
                          <div className="sep" />
                          <button type="button" className="clear-all" onClick={clearFilters}>Clear all filters</button>
                        </>
                      )}
                    </div>,
                    document.body,
                  )}
                </div>
                {mayEdit && hasManualRanks && (
                  <button type="button" className="reset-pill" onClick={handleResetRanks} title="Clear manual ranks for this week">
                    ↻ Reset to CR
                  </button>
                )}
                {mayEdit && !selectMode && (
                  <button type="button" className="select-btn" onClick={() => setSelectMode(true)} title="Tick rows to bulk delete">
                    <I n="trash" s={12} /> Select to delete
                  </button>
                )}
                <span>{hasManualRanks ? 'Manual order' : 'Sorted by CR'}</span>
              </div>
            </div>

            {mayEdit && selectMode && (
              <div className="pri-bulk">
                <span className="count">{selected.size} selected</span>
                <button type="button" onClick={selectAllVisible} disabled={deleting}>Select all visible</button>
                <button type="button" onClick={clearSelection} disabled={deleting || selected.size === 0}>Clear</button>
                <span className="spacer" />
                <button type="button" onClick={exitSelectMode} disabled={deleting}>Cancel</button>
                <button type="button" className="danger" onClick={handleDeleteSelected} disabled={deleting || selected.size === 0}>
                  <I n="trash" s={13} /> {deleting ? 'Deleting…' : `Delete ${selected.size}`}
                </button>
              </div>
            )}

            <div className="pri-list">
              {loading && enrichedOrders.length === 0 && <div className="pri-state">Loading…</div>}
              {error && <div className="pri-state err">{error}</div>}
              {!error && enrichedOrders.length > 0 && ordersForWeek.length === 0 && (
                <div className="pri-state">
                  {activeFilterCount > 0 ? (
                    <>Nothing matches the current filter. <button type="button" onClick={clearFilters} style={{ appearance: 'none', border: 0, background: 'transparent', font: 'inherit', fontWeight: 600, color: 'var(--navy)', cursor: 'pointer', padding: 0 }}>Clear filters</button></>
                  ) : 'No orders to show.'}
                </div>
              )}
              {!error && ordersForWeek.map((o, i) => (
                <PriRow
                  key={o.id}
                  rank={i + 1}
                  index={i}
                  order={o}
                  mayEdit={mayEdit && !isFiltered}
                  onEdit={handleEdit}
                  onViewParts={handleViewParts}
                  activeDept={DEPT_TAB_TO_DB[dept]}
                  progress={bucketOf(o)}
                  scopeLabel={scopeDept ? DEPT_LABEL[scopeDept] : null}
                  dragIndex={dragIndex}
                  setDragIndex={setDragIndex}
                  dropIndex={dropIndex}
                  setDropIndex={setDropIndex}
                  onMove={handleMove}
                  selectable={mayEdit && selectMode}
                  selected={selected.has(o.id)}
                  onToggleSelect={() => toggleSelectOne(o.id)}
                />
              ))}
            </div>

          </div>
        </main>
      </div>
      {mayEdit && (
        <NewOrderForm
          open={formOpen}
          onClose={closeForm}
          onSaved={(row) => { if (row) applyOrderInsert(row) }}
          onDeleted={(id) => applyOrdersDelete([id])}
          defaultDepartment={dept === 'uphol' ? 'upholstery' : dept === 'disp' ? 'dispatch' : (dept === 'all' ? 'steel' : dept)}
          editOrder={editingOrder}
        />
      )}
      <PartsMapModal
        productCode={viewingPartsCode}
        onClose={() => setViewingPartsCode(null)}
      />
      <WoodPartsSortModal
        open={sortPartsOpen}
        onClose={() => setSortPartsOpen(false)}
        weekNumber={typeof week === 'number' ? week : data.currentWeek}
        year={new Date().getFullYear()}
        department={dept === 'steel' ? 'steel' : 'wood'}
      />
      {confirmDialog}
    </>
  )
}
