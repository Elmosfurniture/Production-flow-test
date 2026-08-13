import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import MessageBoard from '../components/MessageBoard'
import TopbarActions from '../components/TopbarActions'
import { useAppData } from '../store/AppDataContext'
import { unmarkReadyForDispatch, unmarkShipped } from '../lib/orders'
import { isoWeek } from '../lib/scheduling'
import { effectiveShiftMinutes, shiftForDate } from '../lib/scheduleEngine'
import { dayLabel, formatCR } from '../lib/priority'

const DEPT_TAB_TO_DB = {
  steel: 'steel',
  wood: 'wood',
  uphol: 'upholstery',
  disp: 'dispatch',
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
}

function I({ n, s = 16, w = 1.8 }) {
  const Icon = iconMap[n]
  return Icon ? <Icon size={s} strokeWidth={w} className="ic" /> : null
}

const styles = `
:root {
  --bg: #f4f2ee;
  --bg-2: #ece8e0;
  --surface: #ffffff;
  --surface-2: #fbf9f5;
  --surface-3: #f1eee7;
  --ink: #1a1d24;
  --ink-2: #4a4e5a;
  --ink-3: #8a8e99;
  --hairline: rgba(26,29,36,0.08);
  --hairline-2: rgba(26,29,36,0.12);

  --navy: #1f2a44;
  --navy-2: #2a3656;
  --navy-soft: rgba(31,42,68,0.08);

  --amber: #e89a3c;
  --amber-2: #f0ae5c;
  --amber-soft: rgba(232,154,60,0.14);

  --red: #d2533a;
  --red-soft: rgba(210,83,58,0.10);
  --green: #4caf6a;
  --green-soft: rgba(76,175,106,0.12);
  --yellow: #d4a531;
  --yellow-soft: rgba(212,165,49,0.14);
  --blue: #4677c8;
  --blue-soft: rgba(70,119,200,0.14);
  --purple: #8b5fbf;
  --purple-soft: rgba(139,95,191,0.14);

  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 20px rgba(26,29,36,0.04);
  --shadow-pop:  0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.06), 0 12px 28px rgba(26,29,36,0.08);
  --shadow-btn:  0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 16px rgba(31,42,68,0.24), 0 2px 4px rgba(31,42,68,0.16);

  --r-sm: 12px;
  --r-md: 16px;
  --r-lg: 22px;
  --r-xl: 28px;
}

[data-theme="dark"] {
  --bg: #0e1118;
  --bg-2: #131722;
  --surface: #1a1f2c;
  --surface-2: #20263488;
  --surface-3: #232938;
  --ink: #f1f2f5;
  --ink-2: #b8bcc8;
  --ink-3: #7c8090;
  --hairline: rgba(255,255,255,0.07);
  --hairline-2: rgba(255,255,255,0.12);
  --navy: #2e3d63;
  --navy-2: #3a4b76;
  --navy-soft: rgba(88,114,180,0.18);
  --amber: #f0ae5c;
  --amber-2: #f5c178;
  --amber-soft: rgba(240,174,92,0.16);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px rgba(0,0,0,0.4);
  --shadow-pop:  0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.45);
  --shadow-btn:  0 1px 0 rgba(255,255,255,0.12) inset, 0 6px 16px rgba(0,0,0,0.5);
}

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; min-height: 100vh;
  font-family: 'Inter', -apple-system, 'SF Pro Text', system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  letter-spacing: -0.01em;
  background:
    radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%);
}

body { margin: 0; }

.main {
  padding: 22px 28px 60px;
  min-width: 0;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin-bottom: 18px;
}
.topbar h1 {
  font-size: 28px; font-weight: 600; letter-spacing: -0.025em;
  margin: 0; line-height: 1.1;
}
.topbar .sub {
  font-size: 14px; color: var(--ink-2); margin-top: 4px;
}

.topbar-actions { display: flex; gap: 8px; align-items: center; }
.ibtn {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface);
  color: var(--ink); font: inherit; font-size: 13px; font-weight: 500;
  padding: 9px 14px;
  border-radius: 12px;
  display: inline-flex; align-items: center; gap: 8px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(26,29,36,0.04);
  transition: transform 100ms ease, background 160ms ease;
}
.ibtn:hover { background: var(--surface-2); }
.ibtn:active { transform: scale(0.98); }
.ibtn .ic { width: 15px; height: 15px; color: var(--ink-2); }
.ibtn.primary {
  background: var(--navy); color: white; border-color: var(--navy);
  box-shadow: var(--shadow-btn);
}
.ibtn.primary .ic { color: var(--amber-2); }
.ibtn.primary:hover { background: var(--navy-2); }

.dept-tabs {
  display: flex; gap: 6px;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  margin-bottom: 16px;
  width: fit-content;
}
.dept-tab {
  appearance: none; border: 0;
  background: transparent;
  color: var(--ink-2);
  font: inherit; font-size: 13px; font-weight: 500;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  transition: background 160ms ease, color 160ms ease;
}
.dept-tab .ic { width: 15px; height: 15px; color: var(--ink-3); }
.dept-tab:hover { color: var(--ink); }
.dept-tab[aria-pressed="true"] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.06), 0 2px 6px rgba(26,29,36,0.06);
  font-weight: 600;
}
.dept-tab[aria-pressed="true"] .ic { color: var(--navy); }
[data-theme="dark"] .dept-tab[aria-pressed="true"] .ic { color: var(--amber-2); }

.banner {
  background: linear-gradient(180deg, rgba(210,83,58,0.10), rgba(210,83,58,0.05));
  border: 1px solid rgba(210,83,58,0.22);
  color: var(--red);
  border-radius: var(--r-md);
  padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; font-weight: 500;
  margin-bottom: 18px;
}
.banner b { color: var(--red); font-weight: 700; margin-right: 6px; }
.banner .icwrap {
  width: 28px; height: 28px; border-radius: 8px;
  background: rgba(210,83,58,0.16);
  display: flex; align-items: center; justify-content: center;
  color: var(--red);
  flex-shrink: 0;
}
.banner span.muted { color: var(--ink-2); font-weight: 500; }
.banner button {
  margin-left: auto; appearance: none; border: 1px solid rgba(210,83,58,0.3);
  background: transparent; color: var(--red);
  font: inherit; font-size: 12px; font-weight: 600;
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
}
.banner button:hover { background: rgba(210,83,58,0.1); }

.stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 22px;
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  padding: 16px 18px 14px;
  box-shadow: var(--shadow-card);
  display: flex; flex-direction: column; gap: 8px;
  position: relative;
  overflow: hidden;
}
.stat-card .stripe {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--navy);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
}
.stat-card.amber .stripe { background: var(--amber); }
.stat-card.red .stripe { background: var(--red); }
.stat-card.green .stripe { background: var(--green); }
.stat-card.yellow .stripe { background: var(--yellow); }
.stat-card .head {
  display: flex; align-items: center; gap: 10px; margin-top: 4px;
}
.stat-card .icwrap {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--surface-3);
  color: var(--ink-2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-card.amber .icwrap { background: var(--amber-soft); color: var(--amber); }
.stat-card.red .icwrap { background: var(--red-soft); color: var(--red); }
.stat-card.green .icwrap { background: var(--green-soft); color: var(--green); }
.stat-card.yellow .icwrap { background: var(--yellow-soft); color: var(--yellow); }
.stat-card .lbl {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  color: var(--ink-3); text-transform: uppercase;
}
.stat-card .val {
  font-size: 36px; font-weight: 600; letter-spacing: -0.03em;
  line-height: 1;
}
.stat-card.amber .val { color: var(--amber); }
.stat-card.red .val { color: var(--red); }
.stat-card .meta {
  font-size: 12px; color: var(--ink-3); font-weight: 500;
  margin-top: 2px;
}
.stat-card .meta.warn { color: var(--red); font-weight: 600; }

.section {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  margin-bottom: 18px;
}
.section-head {
  padding: 16px 20px 12px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--hairline);
}
.section-head h2 {
  margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.015em;
  display: inline-flex; align-items: center; gap: 8px;
}
.section-head h2 .ic { width: 16px; height: 16px; color: var(--ink-3); }
.section-head .meta {
  font-size: 12px; color: var(--ink-3); font-weight: 500;
}
.section.alert .section-head {
  background: var(--red-soft);
  border-bottom-color: rgba(210,83,58,0.18);
}
.section.alert .section-head h2 { color: var(--red); }
.section.alert .section-head h2 .ic { color: var(--red); }
.section-body { padding: 14px 18px 18px; }
.row-list { display: flex; flex-direction: column; gap: 8px; }
.row-card {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  padding: 12px 14px;
  display: flex; align-items: center; gap: 14px;
  transition: background 160ms ease;
}
.row-card:hover { background: var(--surface); }
.row-card .lblock { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.row-card .ord-no {
  font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  color: var(--red); background: var(--red-soft);
  padding: 4px 8px; border-radius: 6px;
  text-transform: uppercase;
}
.row-card.warn .ord-no { color: var(--yellow); background: var(--yellow-soft); }
.row-card .desc {
  display: flex; flex-direction: column; min-width: 0;
}
.row-card .desc .t {
  font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.row-card .desc .s {
  font-size: 12px; color: var(--ink-2); margin-top: 2px;
}
.row-card .qty {
  font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums;
  background: var(--surface);
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--hairline);
}
.row-card .cr {
  font-size: 11px; font-weight: 700;
  background: rgba(210,83,58,0.15); color: var(--red);
  padding: 3px 8px; border-radius: 6px;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.row-card .smbtn {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface);
  color: var(--ink); font: inherit; font-size: 12px; font-weight: 600;
  padding: 7px 12px; border-radius: 9px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.row-card .smbtn:hover { background: var(--navy); color: white; border-color: var(--navy); }
.row-card .smbtn .ic { width: 13px; height: 13px; }

.ml-head {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 14px 20px 8px;
}
.ml-head h2 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: -0.015em; }
.ml-head .meta { font-size: 12px; color: var(--ink-3); font-weight: 500; }

.week-strip {
  display: grid; grid-template-columns: repeat(5, 1fr);
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
}
.day {
  padding: 10px 14px;
  text-align: center;
  border-right: 1px solid var(--hairline);
  font-size: 12px; font-weight: 500;
  color: var(--ink-3);
  position: relative;
}
.day:last-child { border-right: 0; }
.day.today { background: var(--amber-soft); color: var(--amber); }
.day.today::after {
  content: ""; position: absolute; bottom: -1px; left: 12px; right: 12px; height: 2px;
  background: var(--amber); border-radius: 2px;
}
.day b { display: block; font-size: 13px; color: var(--ink); font-weight: 600; letter-spacing: -0.01em; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
.day.today b { color: var(--amber); }

.machines-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px 18px 20px;
}

/* ── Machine load — card per machine, 5 days inside each card ───────── */
.ml-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 12px;
  padding: 12px 18px 16px;
}
.ml-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 12px 14px 13px;
  display: flex; flex-direction: column; gap: 10px;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: box-shadow 200ms, border-color 120ms, transform 100ms;
}
.ml-card:hover { box-shadow: var(--shadow-pop); border-color: var(--hairline-2); }
.ml-card.expanded { border-color: var(--navy); box-shadow: 0 0 0 2px var(--navy-soft), var(--shadow-pop); }
.ml-card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.ml-card-head .name {
  font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em;
  display: flex; align-items: center; gap: 6px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.ml-card-head .bn-tag {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  background: var(--amber-soft); color: var(--amber);
  padding: 2px 6px; border-radius: 4px;
  flex-shrink: 0;
}
.ml-card-head .week-pct {
  font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--ink-2);
  display: inline-flex; align-items: center; gap: 4px;
  flex-shrink: 0;
}
.ml-card-head .week-pct.overbooked { color: var(--red); }
.ml-card-head .week-pct .warn { color: var(--red); font-size: 13px; }
.ml-week {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 5px;
}
.ml-day {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 9px;
  padding: 7px 4px 6px;
  display: flex; flex-direction: column;
  align-items: center; gap: 1px;
  position: relative;
  text-align: center;
  min-height: 64px;
}
.ml-day .day-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-3);
}
.ml-day .day-num {
  font-size: 10px; font-weight: 600; color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.ml-day .day-pct {
  font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--ink-2); margin-top: 3px; letter-spacing: -0.01em;
}
.ml-day .day-jobs {
  font-size: 9px; color: var(--ink-3); font-weight: 500;
}
.ml-day .day-bar {
  width: 80%;
  height: 3px; border-radius: 2px;
  background: var(--hairline);
  overflow: hidden; margin-top: 4px;
}
.ml-day .day-bar > i { display: block; height: 100%; background: var(--ink-3); border-radius: 2px; }
.ml-day.today { border-color: var(--amber); }
.ml-day.today .day-label, .ml-day.today .day-num { color: var(--amber); }
.ml-day.band-low { background: rgba(76,175,106,0.10); }
.ml-day.band-low .day-bar > i { background: var(--green); }
.ml-day.band-mid { background: rgba(76,175,106,0.22); }
.ml-day.band-mid .day-bar > i { background: var(--green); }
.ml-day.band-mid .day-pct { color: var(--green); }
.ml-day.band-high { background: rgba(232,154,60,0.20); }
.ml-day.band-high .day-bar > i { background: var(--amber); }
.ml-day.band-high .day-pct { color: var(--amber); }
.ml-day.band-full { background: rgba(232,154,60,0.36); }
.ml-day.band-full .day-bar > i { background: #b76b3a; }
.ml-day.band-full .day-pct { color: #b76b3a; }
.ml-day.band-over { background: rgba(210,83,58,0.22); border-color: rgba(210,83,58,0.45); }
.ml-day.band-over .day-bar > i { background: var(--red); }
.ml-day.band-over .day-pct { color: var(--red); font-weight: 800; }
.ml-day.holiday { background: repeating-linear-gradient(135deg, var(--surface-2) 0 4px, var(--hairline) 4px 5px); }
.ml-day.holiday .day-pct { color: var(--ink-3); }

/* Expansion strip below the day row */
.ml-card-jobs {
  padding-top: 9px;
  margin-top: 2px;
  border-top: 1px dashed var(--hairline);
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;
}
.ml-card-jobs-day { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ml-card-jobs-day .day-h {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-3);
}
.ml-card-jobs-day .day-h.today { color: var(--amber); }
.ml-card-jobs-day .empty {
  font-size: 10px; color: var(--ink-3); font-style: italic;
}
.ml-job {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 10px;
  display: flex; flex-direction: column; gap: 1px;
  min-width: 0;
}
.ml-job.working { border-color: rgba(76,175,106,0.4); background: var(--green-soft); }
.ml-job.paused { border-color: rgba(232,154,60,0.4); background: var(--amber-soft); }
.ml-job .time { color: var(--ink-3); font-variant-numeric: tabular-nums; font-weight: 600; }
.ml-job .ord { font-weight: 700; color: var(--navy); font-size: 10px; }
.ml-job .prod { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-job .meta { color: var(--ink-3); font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Machine load heatmap (legacy — kept for backwards-compat only) ───── */
.ml-table { padding: 8px 18px 16px; }
.ml-grid {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) repeat(5, minmax(90px, 1fr)) 92px;
  align-items: stretch;
}
.ml-head {
  display: contents;
}
.ml-head > div {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-3);
  padding: 10px 8px 8px;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface);
  position: sticky; top: 0; z-index: 1;
}
.ml-head .col-day { text-align: center; }
.ml-head .col-day.today { color: var(--amber); }
.ml-head .col-day.holiday { color: var(--ink-3); text-decoration: line-through; }
.ml-head .col-day .dnum { display: block; font-size: 13px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink-2); margin-top: 2px; }
.ml-head .col-day.today .dnum { color: var(--amber); }
.ml-head .col-week { text-align: right; }

.ml-row { display: contents; }
.ml-row > .ml-name,
.ml-row > .ml-cell,
.ml-row > .ml-weekcell {
  padding: 9px 8px;
  border-bottom: 1px solid var(--hairline);
  cursor: pointer;
  transition: background 120ms;
}
.ml-row.expanded > .ml-name,
.ml-row.expanded > .ml-cell,
.ml-row.expanded > .ml-weekcell {
  background: var(--surface-2);
}
.ml-row:hover > .ml-name,
.ml-row:hover > .ml-cell,
.ml-row:hover > .ml-weekcell {
  background: var(--surface-2);
}
.ml-name {
  font-size: 13px; font-weight: 600; color: var(--ink);
  display: flex; align-items: center; gap: 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ml-name .chev {
  color: var(--ink-3); font-size: 10px;
  transition: transform 180ms;
  display: inline-block;
}
.ml-row.expanded .ml-name .chev { transform: rotate(90deg); color: var(--navy); }
.ml-name .bn-tag {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  background: var(--amber-soft); color: var(--amber);
  padding: 2px 6px; border-radius: 4px;
}

/* Day cells: utilization bands. Each cell is a stack of bg-tint + percent
   text + thin progress bar. Today's column has an amber left border. */
.ml-cell {
  position: relative;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 12px; font-weight: 600;
  color: var(--ink-2);
}
.ml-cell.today { border-left: 2px solid var(--amber); }
.ml-cell.holiday { background: repeating-linear-gradient(135deg, transparent 0 4px, var(--hairline) 4px 5px); color: var(--ink-3); }
.ml-cell .pct { display: block; }
.ml-cell .bar { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; border-radius: 2px; background: var(--hairline); overflow: hidden; }
.ml-cell .bar > i { display: block; height: 100%; background: var(--ink-3); border-radius: 2px; }
.ml-cell .jobs { font-size: 9px; font-weight: 500; color: var(--ink-3); margin-top: 1px; }

/* Color bands by utilization. */
.ml-cell.band-0 { color: var(--ink-3); }
.ml-cell.band-0 .bar > i { background: transparent; }
.ml-cell.band-low { background: rgba(76,175,106,0.08); }
.ml-cell.band-low .bar > i { background: var(--green); }
.ml-cell.band-mid { background: rgba(76,175,106,0.18); }
.ml-cell.band-mid .bar > i { background: var(--green); }
.ml-cell.band-high { background: rgba(232,154,60,0.18); color: var(--amber); }
.ml-cell.band-high .bar > i { background: var(--amber); }
.ml-cell.band-full { background: rgba(232,154,60,0.32); color: #b76b3a; }
.ml-cell.band-full .bar > i { background: #b76b3a; }
.ml-cell.band-over { background: rgba(210,83,58,0.28); color: var(--red); font-weight: 700; }
.ml-cell.band-over .bar > i { background: var(--red); }

.ml-weekcell {
  text-align: right;
  font-size: 12px; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums;
  display: flex; align-items: center; justify-content: flex-end; gap: 6px;
}
.ml-weekcell.overbooked { color: var(--red); }
.ml-weekcell .warn { color: var(--red); font-size: 12px; }

/* Drill-down detail row — spans all 7 columns under the parent machine. */
.ml-detail {
  grid-column: 1 / -1;
  background: var(--surface-2);
  border-bottom: 1px solid var(--hairline);
  padding: 12px 16px 14px 32px;
}
.ml-detail-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.ml-detail-day { display: flex; flex-direction: column; gap: 6px; }
.ml-detail-day .day-h { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.ml-detail-day .day-h.today { color: var(--amber); }
.ml-detail-job {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 11px;
  display: flex; flex-direction: column; gap: 2px;
}
.ml-detail-job .time { font-size: 10px; color: var(--ink-3); font-variant-numeric: tabular-nums; font-weight: 600; }
.ml-detail-job .ord { font-weight: 700; color: var(--navy); font-size: 11px; }
.ml-detail-job .prod { color: var(--ink); }
.ml-detail-job .meta { font-size: 10px; color: var(--ink-3); }
.ml-detail-job.working { border-color: rgba(76,175,106,0.4); background: var(--green-soft); }
.ml-detail-job.paused { border-color: rgba(232,154,60,0.4); background: var(--amber-soft); }
.ml-detail-day .empty { font-size: 11px; color: var(--ink-3); font-style: italic; padding: 6px 4px; }

.ml-summary {
  padding: 12px 18px 0;
  font-size: 12px; color: var(--ink-2);
  display: flex; flex-wrap: wrap; gap: 14px; align-items: center;
}
.ml-summary b { color: var(--ink); }
.ml-summary .pill {
  background: var(--surface-2); border: 1px solid var(--hairline);
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
}
.ml-summary .pill.warn { background: var(--red-soft); color: var(--red); border-color: rgba(210,83,58,0.25); }
.ml-summary .pill.ok { background: var(--green-soft); color: var(--green); border-color: rgba(76,175,106,0.25); }
.section.collapsible .section-head { cursor: pointer; user-select: none; }
.section.collapsible .section-head:hover { background: var(--surface-2); }
.section.collapsible .section-head .chev { color: var(--ink-3); transition: transform 180ms; margin-right: 4px; }
.section.collapsible.open .section-head .chev { transform: rotate(90deg); }

.day-strip {
  display: flex; gap: 6px; padding: 10px 18px 0; flex-wrap: wrap;
  align-items: center;
}
.week-nav {
  display: inline-flex; align-items: center; gap: 4px;
  margin-right: 8px;
}
.week-nav button {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink-2);
  width: 28px; height: 28px; border-radius: 8px;
  font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 120ms, color 120ms, border-color 120ms;
}
.week-nav button:hover { background: var(--surface); color: var(--navy); border-color: var(--navy); }
.week-nav .week-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-2); padding: 0 8px; min-width: 78px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.week-nav .today-jump {
  font-size: 10px; font-weight: 600; color: var(--amber); cursor: pointer;
  background: transparent; border: 0; padding: 0 6px;
  letter-spacing: 0.05em; text-transform: uppercase;
}
.week-nav .today-jump:hover { color: var(--navy); }
.day-pill {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink-2);
  font: inherit; font-size: 12px; font-weight: 500;
  padding: 7px 12px; border-radius: 999px;
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
}
.day-pill:hover { background: var(--surface); color: var(--ink); }
.day-pill[aria-pressed="true"] {
  background: var(--navy); color: white; border-color: var(--navy);
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(31,42,68,0.18);
}
.day-pill .day-num {
  font-size: 11px; font-weight: 700; opacity: 0.65;
  font-variant-numeric: tabular-nums;
}
.day-pill .today-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--amber); margin-left: 1px;
}
.day-pill.is-holiday { opacity: 0.55; }
.day-pill.is-holiday .day-num::after { content: ' · holiday'; font-weight: 500; }

/* Dept-pill = same shape as day-pill but tinted to the dept colour when
   active so the user can read at a glance which dept's grid is showing. */
.day-pill.dept-pill[aria-pressed="true"].dept-steel { background: var(--blue); border-color: var(--blue); box-shadow: 0 2px 6px rgba(70,119,200,0.25); }
.day-pill.dept-pill[aria-pressed="true"].dept-wood { background: var(--green); border-color: var(--green); box-shadow: 0 2px 6px rgba(76,175,106,0.25); }
.day-pill.dept-pill[aria-pressed="true"].dept-upholstery { background: var(--amber); border-color: var(--amber); box-shadow: 0 2px 6px rgba(232,154,60,0.25); }
.day-pill.dept-pill[aria-pressed="true"].dept-dispatch { background: var(--purple); border-color: var(--purple); box-shadow: 0 2px 6px rgba(139,95,191,0.25); }

/* Department grouping in the Machine Load grid. Only renders when the user
   is on the "All Depts" tab — single-dept views skip the headers since the
   tab itself already names the dept. */
.dept-group + .dept-group { border-top: 1px solid var(--hairline); }
.dept-group-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px 2px;
}
.dept-group-head .pill {
  padding: 3px 9px; border-radius: 999px;
  background: var(--navy-soft); color: var(--navy);
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
}
.dept-group-head .pill.steel { background: var(--blue-soft); color: var(--blue); }
.dept-group-head .pill.wood { background: var(--green-soft); color: var(--green); }
.dept-group-head .pill.upholstery { background: var(--amber-soft); color: var(--amber); }
.dept-group-head .pill.dispatch { background: var(--purple-soft); color: var(--purple); }
.dept-group-head .count {
  font-size: 11px; color: var(--ink-3); font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dept-group-head .rule { flex: 1; height: 1px; background: var(--hairline); }
.dept-group .machines-grid { padding-top: 8px; padding-bottom: 16px; }
.mach-card {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  padding: 12px 14px 14px;
  display: flex; flex-direction: column; gap: 10px;
  position: relative; overflow: hidden;
  transition: transform 100ms ease, box-shadow 200ms ease;
}
.mach-card:hover { box-shadow: var(--shadow-pop); }
.mach-card .accent {
  position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
  background: var(--ink-3);
}
.mach-card.steel    .accent { background: #b76b3a; }
.mach-card.cutoff   .accent { background: #d2533a; }
.mach-card.swage    .accent { background: var(--amber); }
.mach-card.e40      .accent { background: #4f8ad6; }
.mach-card.e32      .accent { background: #9460c8; }
.mach-card.endcl    .accent { background: #2fa07a; }
.mach-card.weldr    .accent { background: #c84e75; }
.mach-card.welda    .accent { background: var(--yellow); }
.mach-card.weldd    .accent { background: #4f8ad6; }
.mach-card .top {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;
}
.mach-card .name {
  font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
  line-height: 1.15;
}
.mach-card .name small {
  display: inline-block; font-size: 10px; font-weight: 700;
  color: var(--navy); background: var(--navy-soft);
  padding: 2px 6px; border-radius: 5px;
  margin-left: 6px; vertical-align: middle; letter-spacing: 0.05em;
}
[data-theme="dark"] .mach-card .name small { color: var(--amber-2); background: var(--amber-soft); }
.mach-card .status {
  font-size: 11px; color: var(--ink-3); font-weight: 500;
  display: inline-flex; align-items: center; gap: 5px;
  flex-shrink: 0;
}
.mach-card .status .dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--ink-3);
}
.mach-card .status.idle .dot { background: var(--ink-3); }
.mach-card .status.running .dot { background: var(--green); }
.mach-card .status.full .dot { background: var(--amber); }
.mach-card .status.cap { color: var(--green); }
.mach-card .status.cap .dot { background: var(--green); }

.mach-card .num-row {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;
}
.mach-card .jobs-num {
  font-size: 28px; font-weight: 600; letter-spacing: -0.03em; line-height: 1;
}
.mach-card .jobs-lbl { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }
.mach-card .free {
  text-align: right;
  font-size: 12px; font-weight: 600; color: var(--amber);
}
.mach-card .free .min { font-size: 14px; }
.mach-card .free .lbl { display: block; font-size: 10px; font-weight: 500; color: var(--ink-3); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 1px; }

.mach-card .progress {
  height: 6px; border-radius: 4px;
  background: var(--surface-3);
  overflow: hidden; position: relative;
}
.mach-card .progress > i {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--navy); border-radius: 4px;
  display: block;
}
.mach-card.full .progress > i { background: var(--amber); }
.mach-card .progress-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: var(--ink-3); font-weight: 500;
  margin-top: -4px;
}
.mach-card .progress-row .used { color: var(--ink-2); }
.mach-card .progress-row .free-pct { color: var(--ink-3); }

.mach-card .schedule {
  font-size: 11px; color: var(--ink-3); font-style: normal;
  padding-top: 8px;
  border-top: 1px solid var(--hairline);
}
.mach-card .schedule b { color: var(--ink-2); font-weight: 600; }

.tbl-wrap { padding: 4px 0 0; }
.tbl {
  width: 100%; border-collapse: collapse;
  font-size: 13px;
}
.tbl thead th {
  text-align: left;
  padding: 12px 16px 10px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  background: var(--surface-2);
  border-bottom: 1px solid var(--hairline);
  border-top: 1px solid var(--hairline);
  white-space: nowrap;
}
.tbl thead th:first-child { padding-left: 20px; }
.tbl thead th:last-child { padding-right: 20px; text-align: right; }
.tbl tbody td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--hairline);
  color: var(--ink); font-weight: 500;
  vertical-align: middle;
}
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl tbody td:first-child { padding-left: 20px; }
.tbl tbody td:last-child { padding-right: 20px; text-align: right; }
.tbl tbody tr:hover td { background: var(--surface-2); }
.tbl tbody tr.overdue { background: rgba(210,83,58,0.04); }
.tbl tbody tr.overdue:hover td { background: rgba(210,83,58,0.07); }

.pri {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 999px;
  background: var(--amber-soft); color: var(--amber);
  font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.pri.p8 { background: var(--green-soft); color: var(--green); }
.pri.p9 { background: var(--ink); color: white; opacity: 0.92; }

.ord-id {
  font-variant-numeric: tabular-nums;
  font-weight: 700; color: var(--amber);
  letter-spacing: 0.02em;
}
.qty-num {
  font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.cr-num {
  font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--ink-2);
}
.cr-num.danger { color: var(--red); }

.wkday {
  font-size: 12px; color: var(--ink-2); font-weight: 500;
  line-height: 1.2; white-space: nowrap;
}
.wkday small {
  display: block; color: var(--ink-3); font-weight: 500; margin-top: 1px;
}

.step-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 7px;
  background: var(--navy-soft); color: var(--navy);
  font-size: 11px; font-weight: 600;
  letter-spacing: -0.01em;
}
[data-theme="dark"] .step-pill { color: var(--amber-2); }
.step-pill.cutoff { background: rgba(210,83,58,0.12); color: var(--red); }
.step-pill.paint  { background: rgba(76,175,106,0.14); color: var(--green); }
.step-pill .ic { width: 11px; height: 11px; }
.step-sub { font-size: 11px; color: var(--ink-3); margin-top: 3px; }

.progress-mini {
  width: 110px; height: 5px;
  background: var(--surface-3); border-radius: 4px; overflow: hidden;
  display: inline-block; vertical-align: middle;
}
.progress-mini > i {
  display: block; height: 100%;
  background: var(--amber); border-radius: 4px;
}
.progress-mini.zero > i { background: var(--hairline-2); }
.progress-pct {
  display: inline-block; vertical-align: middle;
  margin-left: 8px; font-size: 12px;
  color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums;
  min-width: 32px; text-align: right;
}
.progress-pct.zero { color: var(--ink-3); font-weight: 500; }

.subtabs {
  display: flex; gap: 6px; padding: 8px 18px 12px;
  border-bottom: 1px solid var(--hairline);
}
.subtab {
  appearance: none; border: 1px solid transparent;
  background: transparent;
  color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 500;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
}
.subtab .count {
  background: var(--hairline);
  color: var(--ink-2); font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 999px;
  min-width: 18px; text-align: center;
}
.subtab[aria-pressed="true"] {
  background: var(--ink); color: white;
  font-weight: 600;
}
.subtab[aria-pressed="true"] .count { background: rgba(255,255,255,0.18); color: white; }

.clear-all {
  appearance: none; border: 1px solid rgba(210,83,58,0.25);
  background: rgba(210,83,58,0.06);
  color: var(--red); font: inherit; font-size: 12px; font-weight: 600;
  padding: 7px 13px; border-radius: 9px; cursor: pointer;
}
.clear-all:hover { background: rgba(210,83,58,0.12); }

.undo-btn {
  appearance: none; border: 1px solid rgba(210,83,58,0.25);
  background: rgba(210,83,58,0.04);
  color: var(--red); font: inherit; font-size: 12px; font-weight: 600;
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.undo-btn:hover { background: rgba(210,83,58,0.10); }
.undo-btn .ic { width: 12px; height: 12px; }

.edit-btn {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface);
  color: var(--ink); font: inherit; font-size: 12px; font-weight: 600;
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.edit-btn:hover { background: var(--navy); color: white; border-color: var(--navy); }
.edit-btn .ic { width: 12px; height: 12px; }

.customer-name {
  color: var(--ink-2); font-weight: 500;
}

.ic { display: inline-block; vertical-align: middle; }

.toggle {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--ink-2); font-weight: 500;
  padding: 6px 4px;
}
.toggle .switch {
  width: 32px; height: 18px; border-radius: 999px;
  background: var(--hairline-2);
  position: relative; cursor: pointer;
  transition: background 200ms ease;
}
.toggle .switch::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: transform 200ms ease;
}
.toggle.on .switch { background: var(--navy); }
.toggle.on .switch::after { transform: translateX(14px); }

@media (max-width: 1280px) {
  .stats { grid-template-columns: repeat(3, 1fr); }
  .stat-card:nth-child(4), .stat-card:nth-child(5) { grid-column: span 1; }
}
@media (max-width: 980px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
}
`

function Stat({ icon, lbl, val, meta, metaWarn, accent }) {
  return (
    <div className={`stat-card ${accent || ''}`}>
      <div className="stripe" />
      <div className="head">
        <div className="icwrap"><I n={icon} s={16} /></div>
        <div className="lbl">{lbl}</div>
      </div>
      <div className="val">{val}</div>
      <div className={`meta ${metaWarn ? 'warn' : ''}`}>
        {metaWarn && <I n="alert" s={11} />} {meta}
      </div>
    </div>
  )
}

export default function DashboardScreen() {
  const { enrichedOrders, orders, machines, schedule, holidaySet, productionCompleteByOrderId, applyOrderUpdate } = useAppData()
  // Imported orders the CSV couldn't match to a product. They sit invisible
  // on Tracking/Schedule/Dispatch until reconciled — surface the count
  // prominently so they don't rot.
  const needsReviewCount = useMemo(
    () => (orders || []).filter((o) => o.needs_review).length,
    [orders],
  )
  const [dept, setDept] = useDeptTab('dashboard')
  const [undoingId, setUndoingId] = useState(null)
  const [undoError, setUndoError] = useState(null)

  const handleUndoReady = async (order) => {
    if (!window.confirm(`Move #${order.ord_nr || order.kwitasie_nr || ''} back to Part Tracking?`)) return
    setUndoingId(order.id)
    setUndoError(null)
    try {
      const updated = await unmarkReadyForDispatch(order.id)
      applyOrderUpdate(order.id, updated)
    } catch (e) {
      setUndoError(e.message || String(e))
    } finally {
      setUndoingId(null)
    }
  }

  const handleUndoShipped = async (order) => {
    if (!window.confirm(`Mark #${order.ord_nr || order.kwitasie_nr || ''} as not shipped? It'll go back to the Ready for Dispatch list.`)) return
    setUndoingId(order.id)
    setUndoError(null)
    try {
      const updated = await unmarkShipped(order.id)
      applyOrderUpdate(order.id, updated)
    } catch (e) {
      setUndoError(e.message || String(e))
    } finally {
      setUndoingId(null)
    }
  }
  const currentWeek = isoWeek(new Date())

  const filtered = useMemo(() => {
    const dbDept = DEPT_TAB_TO_DB[dept]
    // Exclude orders awaiting reconciliation — they have no real product
    // linkage yet so their CR/bottleneck/dept stats would be misleading.
    const ready = enrichedOrders.filter((o) => !o.needs_review)
    return dbDept ? ready.filter((o) => o.department === dbDept) : ready
  }, [enrichedOrders, dept])

  // Three mutually-exclusive buckets:
  //   - activeOrders:   still being worked on (production NOT complete, NOT
  //                     ticked, NOT legacy-completed)
  //   - completedOrders: production done but the boss hasn't done the final
  //                     tick yet — these surface as "completed" on Dashboard
  //                     while still being editable on Tracking
  //   - readyForDispatchOrders: boss did the final tick — order is sitting in
  //                     the dispatch queue waiting to leave
  const activeOrders = useMemo(() => filtered.filter((o) => {
    if (o.status === 'completed') return false
    if (o.ready_for_dispatch_at) return false
    if (productionCompleteByOrderId.get(o.id)) return false
    return true
  }), [filtered, productionCompleteByOrderId])
  const overdueOrders = useMemo(
    () => activeOrders.filter((o) => o.cr != null && o.cr < 1),
    [activeOrders],
  )
  const atRiskOrders = useMemo(
    () => activeOrders.filter((o) => o.cr != null && o.cr >= 1 && o.cr < 3),
    [activeOrders],
  )
  const thisWeekOrders = useMemo(
    () => activeOrders.filter((o) => o.prod_week === currentWeek),
    [activeOrders, currentWeek],
  )
  // Completed includes BOTH:
  //   * Shipped (status='completed', regardless of ready_for_dispatch_at —
  //     a shipped order keeps its ready timestamp from earlier in the flow).
  //   * Production done but not yet ticked ready (boss can still see it as
  //     "ready to tick" alongside the truly-shipped ones).
  const completedOrders = useMemo(
    () => filtered.filter((o) =>
      o.status === 'completed' ||
      (productionCompleteByOrderId.get(o.id) && !o.ready_for_dispatch_at)
    ),
    [filtered, productionCompleteByOrderId],
  )
  // Ready for Dispatch = ticked, not yet shipped.
  const readyForDispatchOrders = useMemo(
    () => filtered.filter((o) => !!o.ready_for_dispatch_at && o.status !== 'completed'),
    [filtered],
  )

  const byDept = useMemo(() => {
    const counts = { steel: 0, wood: 0, upholstery: 0, dispatch: 0, other: 0 }
    for (const o of activeOrders) {
      if (counts[o.department] != null) counts[o.department]++
    }
    return counts
  }, [activeOrders])

  // CR-sorted table — most urgent first, with manual ranks taking precedence
  const tableOrders = useMemo(() => {
    return [...activeOrders].sort((a, b) => {
      const aR = a.priority_rank, bR = b.priority_rank
      if (aR != null && bR != null) return aR - bR
      if (aR != null) return -1
      if (bR != null) return 1
      const aHas = a.cr != null && Number.isFinite(a.cr)
      const bHas = b.cr != null && Number.isFinite(b.cr)
      if (aHas !== bHas) return aHas ? -1 : 1
      if (aHas && a.cr !== b.cr) return a.cr - b.cr
      return 0
    })
  }, [activeOrders])

  const totalParts = activeOrders.reduce((s, o) => s + (o.qty || 0), 0)
  const thisWeekParts = thisWeekOrders.reduce((s, o) => s + (o.qty || 0), 0)

  // ─── Machine load (per day) ─────────────────────────────────────────────
  // Sum minutes of work assigned to each machine on the selected date and
  // compare against the shift's effective minutes. Lets the boss see at a
  // glance which stations are full, idle, or have headroom. Walks the
  // current ISO week's Mon-Fri so the user can flip between days.

  // Build a date string YYYY-MM-DD without timezone juggling.
  const fmtDateStr = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  // Capacity in effective minutes for a given (date, holiday) combo —
  // derived directly from the shift defs in scheduleEngine.js so any future
  // tweak to break times propagates here without a code change.
  const capacityFor = (date, isHoliday) => {
    if (isHoliday) return 0
    const dow = date.getDay()
    if (dow === 0 || dow === 6) return 0 // weekend
    return effectiveShiftMinutes(shiftForDate(date))
  }

  const todayStr = useMemo(() => fmtDateStr(new Date()), [])

  // Week offset in 7-day steps (0 = current ISO week, 1 = next week, -1 =
  // last week, etc). Lets the boss look at machine load for next week's
  // already-scheduled work without leaving the dashboard.
  const [weekOffset, setWeekOffset] = useState(0)

  // Mon-Fri of the selected ISO week (this week + weekOffset), each with
  // date string + capacity.
  const weekDays = useMemo(() => {
    const now = new Date()
    const jsDow = now.getDay() // 0=Sun .. 6=Sat
    const isoDow = jsDow === 0 ? 7 : jsDow
    const monday = new Date(now)
    monday.setDate(now.getDate() - (isoDow - 1) + (weekOffset * 7))
    const out = []
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = fmtDateStr(d)
      const isHoliday = holidaySet?.has?.(dateStr) || false
      out.push({
        label: labels[i],
        date: d,
        dateStr,
        dayOfMonth: d.getDate(),
        isHoliday,
        capacity: capacityFor(d, isHoliday),
        isToday: dateStr === todayStr,
      })
    }
    return out
    // weekOffset MUST be a dep — without it the memo is locked to the
    // value at first render and the ‹/› buttons appear dead.
  }, [holidaySet, todayStr, weekOffset])

  // Parse 'HH:MM:SS' (or 'HH:MM') → minutes-since-midnight. Tolerant of
  // trailing fractions or nulls.
  const hmsToMin = (t) => {
    if (!t) return 0
    const parts = String(t).split(':')
    const h = parseInt(parts[0], 10) || 0
    const m = parseInt(parts[1], 10) || 0
    return h * 60 + m
  }

  // 2D load grid: machine_id → date_str → { jobs, mins, running, queued, rows }.
  // Computed once per (schedule, week) so the heatmap can show all five days
  // for every machine at once without re-scanning the schedule table per cell.
  const loadGrid = useMemo(() => {
    const map = new Map()
    const dateSet = new Set(weekDays.map((d) => d.dateStr))
    for (const r of (schedule || [])) {
      if (!dateSet.has(r.scheduled_date)) continue
      // Completed rows are sunk cost — don't double-count them against the
      // day's remaining capacity.
      if (r.status === 'completed') continue
      const dur = Math.max(0, hmsToMin(r.end_time) - hmsToMin(r.start_time))
      let perMachine = map.get(r.machine_id)
      if (!perMachine) { perMachine = new Map(); map.set(r.machine_id, perMachine) }
      let cell = perMachine.get(r.scheduled_date)
      if (!cell) { cell = { jobs: 0, mins: 0, running: 0, queued: 0, rows: [] }; perMachine.set(r.scheduled_date, cell) }
      cell.jobs += 1
      cell.mins += dur
      if (r.status === 'working') cell.running += 1
      else cell.queued += 1
      cell.rows.push(r)
    }
    return map
  }, [schedule, weekDays])

  // Which machine row is currently expanded (drill-down to per-day jobs).
  // Total weekly capacity in effective minutes for one machine's whole week.
  // Used by the heatmap's per-row "Week" cell and summary.
  const weekCapacity = useMemo(() => {
    let total = 0
    for (const d of weekDays) total += d.capacity
    return total
  }, [weekDays])

  // Collapse state — persisted so the boss's preference sticks across
  // refreshes. Default open the first time so the feature is discoverable.
  const [machinesOpen, setMachinesOpen] = useState(() => {
    try {
      const v = localStorage.getItem('dashboard.machineLoadOpen')
      return v === null ? true : v === 'true'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try { localStorage.setItem('dashboard.machineLoadOpen', String(machinesOpen)) } catch { /* noop */ }
  }, [machinesOpen])

  // Inner dept selector for the Machine Load section. Mirrors the day-pill
  // pattern: one pill per dept, click to switch which dept's machines are
  // visible. Keeps the grid focused on one dept at a time so the user
  // doesn't have to scroll through 70+ machine cards.
  const DEPT_ORDER = ['steel', 'wood', 'upholstery', 'dispatch']
  const DEPT_LABELS = { steel: 'Steel', wood: 'Wood', upholstery: 'Upholstery', dispatch: 'Dispatch' }
  const [loadDept, setLoadDept] = useState(() => {
    try {
      const v = localStorage.getItem('dashboard.machineLoadDept')
      if (v && DEPT_ORDER.includes(v)) return v
    } catch { /* noop */ }
    return 'steel'
  })
  useEffect(() => {
    try { localStorage.setItem('dashboard.machineLoadDept', loadDept) } catch { /* noop */ }
  }, [loadDept])

  // When the page-level dept tab switches to a specific dept, snap the
  // inner pill to match — keeps the dashboard feeling like one consistent
  // filter rather than two competing ones. "All Depts" leaves loadDept
  // alone so the user keeps whichever dept they were looking at.
  useEffect(() => {
    const dbDept = DEPT_TAB_TO_DB[dept]
    if (dbDept && DEPT_ORDER.includes(dbDept)) setLoadDept(dbDept)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept])

  // Count machines per dept (active only) for the pill labels. Skips depts
  // with zero active machines.
  const deptCounts = useMemo(() => {
    const counts = { steel: 0, wood: 0, upholstery: 0, dispatch: 0 }
    for (const m of (machines || [])) {
      if (m.active === false) continue
      if (counts[m.department] != null) counts[m.department]++
    }
    return counts
  }, [machines])

  // Machines visible in the load grid follow the current dept tab. Inactive
  // machines hide entirely — they're decommissioned/disabled and the user
  // doesn't need to scan past them.
  // Machines for the Machine Load grid — filtered by the inner dept-pill
  // selector (loadDept), not the page-level dept tab. The page tab still
  // drives the rest of the dashboard's filters.
  const visibleMachines = useMemo(() => {
    let list = (machines || []).filter((m) => m.active !== false)
    list = list.filter((m) => m.department === loadDept)
    return list.sort((a, b) => {
      const aO = a.display_order ?? 0
      const bO = b.display_order ?? 0
      if (aO !== bO) return aO - bO
      return a.name.localeCompare(b.name)
    })
  }, [machines, loadDept])

  // Per-machine week totals + a "busiest" pick. Iterates the load grid once.
  // Declared AFTER visibleMachines so the TDZ doesn't bite — moving these
  // earlier in the file would crash the whole dashboard with a ReferenceError.
  const machineWeekTotals = useMemo(() => {
    const out = []
    for (const m of visibleMachines) {
      const per = loadGrid.get(m.id)
      let mins = 0
      let jobs = 0
      let overbookedDays = 0
      for (const d of weekDays) {
        const cell = per?.get(d.dateStr)
        if (!cell) continue
        mins += cell.mins
        jobs += cell.jobs
        if (d.capacity > 0 && cell.mins > d.capacity) overbookedDays++
      }
      const pct = weekCapacity > 0 ? Math.round((mins / weekCapacity) * 100) : 0
      out.push({ machine: m, mins, jobs, overbookedDays, pct })
    }
    return out
  }, [visibleMachines, loadGrid, weekDays, weekCapacity])

  const weekSummary = useMemo(() => {
    let busiest = null
    let idleCount = 0
    let overbookedCount = 0
    let totalMins = 0
    for (const row of machineWeekTotals) {
      if (!busiest || row.pct > busiest.pct) busiest = row
      if (row.jobs === 0) idleCount++
      if (row.overbookedDays > 0) overbookedCount++
      totalMins += row.mins
    }
    const totalCap = weekCapacity * machineWeekTotals.length
    const avgPct = totalCap > 0 ? Math.round((totalMins / totalCap) * 100) : 0
    return { busiest, idleCount, overbookedCount, avgPct, totalMachines: machineWeekTotals.length }
  }, [machineWeekTotals, weekCapacity])

  const firstOverdue = overdueOrders[0]

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />

        <main className="main">
          <div className="topbar">
            <div>
              <h1>Dashboard</h1>
              <div className="sub">Production overview & machine load</div>
            </div>
            <div className="topbar-actions">
              <TopbarActions iconSize={15} />
            </div>
          </div>

          <div className="dept-tabs">
            <button className="dept-tab" aria-pressed={dept === 'all'} onClick={() => setDept('all')}><I n="grid" s={14} /> All Depts</button>
            <button className="dept-tab" aria-pressed={dept === 'steel'} onClick={() => setDept('steel')}><I n="hammer" s={14} /> Steel</button>
            <button className="dept-tab" aria-pressed={dept === 'wood'} onClick={() => setDept('wood')}><I n="saw" s={14} /> Wood</button>
            <button className="dept-tab" aria-pressed={dept === 'uphol'} onClick={() => setDept('uphol')}><I n="thread" s={14} /> Upholstery</button>
            <button className="dept-tab" aria-pressed={dept === 'disp'} onClick={() => setDept('disp')}><I n="truck" s={14} /> Dispatching</button>
          </div>

          <MessageBoard />

          {needsReviewCount > 0 && (
            <div className="banner">
              <div className="icwrap"><I n="siren" s={15} /></div>
              <div>
                <b>{needsReviewCount} imported order(s)</b>
                <span className="muted">
                  {' '}can't be scheduled — their product codes need to be matched in Reconcile.
                </span>
              </div>
              <NavLink to="/reconcile" className="ibtn"><I n="arrow" s={12} /> Reconcile now</NavLink>
            </div>
          )}

          {firstOverdue && (
            <div className="banner">
              <div className="icwrap"><I n="siren" s={15} /></div>
              <div>
                <b>{firstOverdue.ord_nr || firstOverdue.kwitasie_nr || '—'}</b>
                <span className="muted">
                  {' '}— overdue
                  {firstOverdue.prod_week != null
                    ? `, was planned Wk${firstOverdue.prod_week} / ${dayLabel(firstOverdue.prod_day)}.`
                    : '.'}
                </span>
              </div>
              <NavLink to="/priority" className="ibtn"><I n="arrow" s={12} /> View priority</NavLink>
            </div>
          )}

          <div className="stats">
            <Stat
              icon="list"
              lbl="Active Orders"
              val={activeOrders.length}
              meta={overdueOrders.length > 0 ? `${overdueOrders.length} overdue` : 'all on track'}
              metaWarn={overdueOrders.length > 0}
            />
            <Stat
              icon="siren"
              lbl="Overdue · CR < 1"
              val={overdueOrders.length}
              meta={overdueOrders.length > 0 ? 'needs reschedule' : 'none — clean'}
              accent={overdueOrders.length > 0 ? 'red' : 'green'}
            />
            <Stat
              icon="cal"
              lbl={`This Week (Wk ${currentWeek})`}
              val={thisWeekOrders.length}
              meta={`${thisWeekParts} parts`}
              accent="amber"
            />
            <Stat
              icon="hammer"
              lbl="Steel · active"
              val={byDept.steel}
              meta={`${machines.filter((m) => m.department === 'steel').length} machines`}
            />
            <Stat
              icon="saw"
              lbl="Wood · active"
              val={byDept.wood}
              meta={`${machines.filter((m) => m.department === 'wood').length} machines`}
              accent="green"
            />
          </div>

          <div className={`section collapsible ${machinesOpen ? 'open' : ''}`}>
            <div className="section-head" onClick={() => setMachinesOpen((o) => !o)}>
              <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="chev" style={{ display: 'inline-flex' }}>
                  <I n="arrow" s={13} />
                </span>
                <I n="machine" s={16} /> Machine Load
              </h2>
              <div className="meta">
                {machinesOpen
                  ? `${DEPT_LABELS[loadDept]} · Wk ${weekDays[0] ? isoWeek(weekDays[0].date) : '—'}${weekOffset === 0 ? ' (this week)' : weekOffset > 0 ? ` (+${weekOffset} wk)` : ` (${weekOffset} wk)`}`
                  : 'click to expand'}
              </div>
            </div>
            {machinesOpen && (
              <>
                {/* Week navigator + dept pills. Days are columns in the
                    heatmap below, so no day picker here. */}
                <div className="day-strip" onClick={(e) => e.stopPropagation()}>
                  <div className="week-nav">
                    <button type="button" onClick={() => setWeekOffset((o) => o - 1)} title="Previous week">‹</button>
                    <span className="week-label">
                      Wk {weekDays[0] ? isoWeek(weekDays[0].date) : '—'}
                      {weekOffset === 0 && ' · this week'}
                      {weekOffset === 1 && ' · next week'}
                      {weekOffset === -1 && ' · last week'}
                    </span>
                    <button type="button" onClick={() => setWeekOffset((o) => o + 1)} title="Next week">›</button>
                    {weekOffset !== 0 && (
                      <button type="button" className="today-jump" onClick={() => setWeekOffset(0)} title="Jump back to this week">Today</button>
                    )}
                  </div>
                  {DEPT_ORDER.map((deptKey) => {
                    const count = deptCounts[deptKey] || 0
                    if (count === 0) return null
                    return (
                      <button
                        key={deptKey}
                        type="button"
                        className={`day-pill dept-pill dept-${deptKey}`}
                        aria-pressed={loadDept === deptKey}
                        onClick={() => setLoadDept(deptKey)}
                        title={`${DEPT_LABELS[deptKey]} · ${count} machine${count === 1 ? '' : 's'}`}
                      >
                        <span>{DEPT_LABELS[deptKey]}</span>
                        <span className="day-num">{count}</span>
                      </button>
                    )
                  })}
                </div>
                {visibleMachines.length === 0 ? (
                  <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                    No active machines in {DEPT_LABELS[loadDept]}.
                  </div>
                ) : (
                  <>
                    <div className="ml-cards">
                      {machineWeekTotals.map(({ machine: m, pct: wkPct, overbookedDays }) => {
                        const machineRow = loadGrid.get(m.id) || new Map()
                        return (
                          <div key={m.id} className="ml-card">
                            <div className="ml-card-head">
                              <div className="name">
                                <span>{m.name}</span>
                                {m.bottleneck && <span className="bn-tag">BN</span>}
                              </div>
                              <span
                                className={`week-pct ${overbookedDays > 0 ? 'overbooked' : ''}`}
                                title={overbookedDays > 0 ? `Overbooked on ${overbookedDays} day${overbookedDays === 1 ? '' : 's'} this week` : `Week total ${wkPct}%`}
                              >
                                {wkPct}% wk
                                {overbookedDays > 0 && <span className="warn">⚠</span>}
                              </span>
                            </div>
                            <div className="ml-week">
                              {weekDays.map((d) => {
                                const cell = machineRow.get(d.dateStr) || { jobs: 0, mins: 0 }
                                const pct = d.capacity > 0 ? Math.round((cell.mins / d.capacity) * 100) : 0
                                let band = ''
                                if (d.isHoliday || d.capacity === 0) band = 'holiday'
                                else if (pct > 100) band = 'band-over'
                                else if (pct >= 96) band = 'band-full'
                                else if (pct >= 81) band = 'band-high'
                                else if (pct >= 51) band = 'band-mid'
                                else if (pct > 0) band = 'band-low'
                                return (
                                  <div
                                    key={d.dateStr}
                                    className={`ml-day ${band} ${d.isToday ? 'today' : ''}`}
                                    title={
                                      d.capacity === 0
                                        ? (d.isHoliday ? 'Public holiday — no shift' : 'Weekend / no shift')
                                        : `${cell.mins} min of ${d.capacity} min · ${pct}% · ${cell.jobs} job${cell.jobs === 1 ? '' : 's'}`
                                    }
                                  >
                                    <span className="day-label">{d.label}</span>
                                    <span className="day-num">{d.dayOfMonth}</span>
                                    <span className="day-pct">{d.capacity === 0 ? '—' : `${pct}%`}</span>
                                    {cell.jobs > 0 && <span className="day-jobs">{cell.jobs} job{cell.jobs === 1 ? '' : 's'}</span>}
                                    {d.capacity > 0 && (
                                      <div className="day-bar"><i style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="ml-summary">
                      <span><b>{weekSummary.totalMachines}</b> machine{weekSummary.totalMachines === 1 ? '' : 's'} · avg utilization <b>{weekSummary.avgPct}%</b></span>
                      {weekSummary.busiest && weekSummary.busiest.pct > 0 && (
                        <span className="pill">busiest: <b>{weekSummary.busiest.machine.name}</b> ({weekSummary.busiest.pct}%)</span>
                      )}
                      {weekSummary.idleCount > 0 && (
                        <span className="pill ok">{weekSummary.idleCount} idle this week</span>
                      )}
                      {weekSummary.overbookedCount > 0 && (
                        <span className="pill warn">⚠ {weekSummary.overbookedCount} overbooked</span>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {overdueOrders.length > 0 && (
            <div className="section alert">
              <div className="section-head">
                <h2><I n="clock" s={16} /> {overdueOrders.length} Overdue Order{overdueOrders.length === 1 ? '' : 's'}</h2>
                <div className="meta">{filtered.length === 0 ? 'no data yet' : 'CR below 1.0'}</div>
              </div>
              <div className="section-body">
                <div className="row-list">
                  {overdueOrders.slice(0, 6).map((o) => (
                    <div key={o.id} className="row-card">
                      <div className="lblock">
                        <span className="ord-no">{o.ord_nr || o.kwitasie_nr || '—'}</span>
                        <div className="desc">
                          <div className="t">
                            {o.product_name}{' '}
                            <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>×{o.qty}</span>
                          </div>
                          <div className="s">
                            {o.prod_week != null
                              ? `Was planned Wk${o.prod_week} / ${dayLabel(o.prod_day)}`
                              : 'Not scheduled yet'}
                          </div>
                        </div>
                      </div>
                      <NavLink to="/priority" className="smbtn">Reschedule <I n="arrow" s={12} /></NavLink>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(overdueOrders.length + atRiskOrders.length) > 0 && (
            <div className="section">
              <div className="section-head">
                <h2><I n="bell" s={16} /> Needs Attention</h2>
                <div className="meta">{overdueOrders.length + atRiskOrders.length} items</div>
              </div>
              <div className="section-body">
                <div className="row-list">
                  {overdueOrders.slice(0, 3).map((o) => (
                    <div key={`o-${o.id}`} className="row-card">
                      <div className="lblock">
                        <span className="ord-no">Overdue · {o.ord_nr || o.kwitasie_nr || '—'}</span>
                        <div className="desc">
                          <div className="t">{o.product_name} × {o.qty}</div>
                          <div className="s">
                            {o.prod_week != null
                              ? `was planned Wk${o.prod_week} / ${dayLabel(o.prod_day)}`
                              : 'not scheduled'}
                          </div>
                        </div>
                      </div>
                      <NavLink to="/priority" className="smbtn">Reschedule</NavLink>
                    </div>
                  ))}
                  {atRiskOrders.slice(0, 3).map((o) => (
                    <div key={`a-${o.id}`} className="row-card warn">
                      <div className="lblock">
                        <span className="ord-no" style={{ color: 'var(--yellow)', background: 'var(--yellow-soft)' }}>
                          At Risk · {o.ord_nr || o.kwitasie_nr || '—'}
                        </span>
                        <span className="cr" style={{ color: 'var(--yellow)', background: 'var(--yellow-soft)' }}>
                          CR {formatCR(o.cr)}
                        </span>
                        <div className="desc">
                          <div className="t">{o.product_name} × {o.qty}</div>
                          <div className="s">dispatch date is at risk · CR {formatCR(o.cr)}</div>
                        </div>
                      </div>
                      <NavLink to="/priority" className="smbtn"><I n="edit" s={12} /> Edit</NavLink>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="section">
            <div className="section-head">
              <h2><I n="list" s={16} /> Active Orders</h2>
              <div className="meta">{activeOrders.length} orders · {totalParts} total parts</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Order</th>
                    <th>Product</th>
                    <th>Customer</th>
                    <th>Wk/Day</th>
                    <th style={{ width: 80 }}>Send</th>
                    <th style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 80 }}>CR</th>
                    <th>Bottleneck</th>
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 22 }}>No active orders for this department.</td></tr>
                  )}
                  {tableOrders.slice(0, 60).map((o) => {
                    const isOverdue = o.cr != null && o.cr < 1
                    const crClass = isOverdue ? 'danger' : ''
                    return (
                      <tr key={o.id} className={isOverdue ? 'overdue' : ''}>
                        <td><span className="ord-id">{o.ord_nr || o.kwitasie_nr || '—'}</span></td>
                        <td>{o.product_name}</td>
                        <td className="customer-name">{o.customer_name}</td>
                        <td className="wkday">
                          {o.prod_week != null ? `Wk${o.prod_week}/${dayLabel(o.prod_day)}` : '—'}
                          {o.send_week != null && <small>→ Wk{o.send_week}/{dayLabel(o.send_day)}</small>}
                        </td>
                        <td style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                          {o.send_date || '—'}
                        </td>
                        <td><span className="qty-num">{o.qty}</span></td>
                        <td><span className={`cr-num ${crClass}`}>{formatCR(o.cr)}</span></td>
                        <td>
                          {o.bottleneck ? (
                            <div className="step-pill"><I n="dot" s={11} /> {o.bottleneck}</div>
                          ) : (
                            <span style={{ color: 'var(--ink-3)', fontSize: 11, fontStyle: 'italic' }}>no routing</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <h2><I n="truck" s={16} /> Ready for Dispatch</h2>
              <div className="meta">{readyForDispatchOrders.length} waiting to leave</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Order</th>
                    <th>Product</th>
                    <th>Customer</th>
                    <th style={{ width: 80 }}>Qty</th>
                    <th style={{ width: 130 }}>Send Wk/Day</th>
                    <th style={{ width: 130 }}>Marked Ready</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {readyForDispatchOrders.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 22 }}>Nothing waiting on dispatch.</td></tr>
                  )}
                  {readyForDispatchOrders.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <td><span className="ord-id">{o.ord_nr || o.kwitasie_nr || '—'}</span></td>
                      <td>{o.product_name}</td>
                      <td className="customer-name">{o.customer_name}</td>
                      <td><span className="qty-num">{o.qty}</span></td>
                      <td style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {o.send_week != null ? `Wk${o.send_week} / ${dayLabel(o.send_day)}` : '—'}
                      </td>
                      <td style={{ color: 'var(--ink-2)', fontSize: 12 }}>
                        {o.ready_for_dispatch_at ? new Date(o.ready_for_dispatch_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleUndoReady(o)}
                          disabled={undoingId === o.id}
                          title="Move back to Part Tracking"
                          style={{
                            appearance: 'none', border: '1px solid var(--hairline-2)', background: 'var(--surface-2)',
                            color: 'var(--ink-2)', borderRadius: 7, padding: '4px 10px',
                            font: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {undoingId === o.id ? '…' : 'Undo'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <h2><I n="check" s={16} /> Completed Orders</h2>
              <div className="meta">{completedOrders.length} total</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Order</th>
                    <th>Product</th>
                    <th>Customer</th>
                    <th style={{ width: 80 }}>Qty</th>
                    <th style={{ width: 130 }}>Send Wk/Day</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {completedOrders.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 22 }}>Nothing completed yet.</td></tr>
                  )}
                  {completedOrders.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <td><span className="ord-id" style={{ color: 'var(--ink-2)' }}>{o.ord_nr || o.kwitasie_nr || '—'}</span></td>
                      <td>{o.product_name}</td>
                      <td className="customer-name">{o.customer_name}</td>
                      <td><span className="qty-num">{o.qty}</span></td>
                      <td style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {o.send_week != null ? `Wk${o.send_week} / ${dayLabel(o.send_day)}` : '—'}
                      </td>
                      <td>
                        {o.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => handleUndoShipped(o)}
                            disabled={undoingId === o.id}
                            title="Mark not shipped — back to Ready for Dispatch"
                            style={{
                              appearance: 'none', border: '1px solid var(--hairline-2)', background: 'var(--surface-2)',
                              color: 'var(--ink-2)', borderRadius: 7, padding: '4px 10px',
                              font: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            {undoingId === o.id ? '…' : 'Unship'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
      {undoError && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 200,
          background: 'var(--red, #d2533a)', color: 'white', padding: '12px 16px',
          borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 20px rgba(210,83,58,0.35)',
        }}>
          Undo failed: {undoError}
          <button onClick={() => setUndoError(null)} style={{ marginLeft: 12, background: 'transparent', border: 0, color: 'white', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}
    </>
  )
}
