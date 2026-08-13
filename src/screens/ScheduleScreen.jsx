import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDeptTab, readScheduleFocus, writeScheduleFocus, clearScheduleFocus } from '../lib/useDeptTab'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import WoodConveyorView from '../components/WoodConveyorView'
import { useAppData } from '../store/AppDataContext'
import { canEdit, getCurrentUser } from '../lib/auth'
import { isoWeekDayToDate, isoWeek } from '../lib/scheduling'
import {
  buildScheduleRows, writeScheduleRows, cleanupOrphanScheduleRows,
  shiftForDate, workDatesOfWeek, timeToMin, effectiveShiftMinutes,
  comparePriority, placeJobOnShift,
} from '../lib/scheduleEngine'
import { loadAllDayPlans, PARTS_DAY_EVENT } from '../lib/partsDayPlan'
import { setScheduleRowStatus } from '../lib/scheduleStatus'
import { setOrderRanks } from '../lib/priority'
import { cleanupDoneStepPhantoms } from '../lib/tracking'
import { supabase } from '../lib/supabase'
import {
  Hammer, Activity, Truck, Grid, ChevronLeft, ChevronRight,
  Zap, AlertTriangle, Play, Pause, Square, ChevronUp, ChevronDown, Coffee,
  ChevronsDown, ChevronsUp, Clock, Filter, Check, Printer, Trees,
} from 'lucide-react'

// Daily worklist per station. Each machine is a collapsible card; inside it,
// schedule rows + shift breaks merge into one chronological list. Boss/Manager
// clicks "Regenerate" to run the dispatcher (src/lib/scheduleEngine.js).
// Workers click Start/Pause/Stop on a row to jump into MES Station for that
// step.

// Wood is a normal department tab here: it shows the wood machines' worklist in
// the same layout as steel, just filtered to wood. (The scheduling engine is
// department-agnostic, so wood machines carry schedule rows like any other.)
const DEPT_TABS = [
  { id: 'all',  label: 'All',         Icon: Grid },
  { id: 'steel', label: 'Steel',      Icon: Hammer },
  { id: 'wood', label: 'Wood',        Icon: Trees },
  { id: 'upholstery', label: 'Upholstery', Icon: Activity },
  { id: 'dispatch',   label: 'Dispatch',   Icon: Truck },
]

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI']
// Stable empty map for the pending-reorder state (avoids new refs each render).
const EMPTY_PENDING = new Map()

// Department → header tint for the machine card title. Matches the rest of
// the app's iOS-inspired palette.
const DEPT_TINT = {
  steel:      { ink: '#274d8e', soft: 'rgba(70,119,200,0.10)',  stripe: '#4677c8' },
  wood:       { ink: '#9a611e', soft: 'rgba(232,154,60,0.10)',  stripe: '#e89a3c' },
  upholstery: { ink: '#1e5d6c', soft: 'rgba(58,154,175,0.10)',  stripe: '#3a9aaf' },
  dispatch:   { ink: '#5b3c84', soft: 'rgba(139,95,191,0.10)',  stripe: '#8b5fbf' },
}

const styles = `
:root {
  --bg: #f4f2ee; --bg-2: #ece8e0;
  --surface: #ffffff; --surface-2: #fbf9f5; --surface-3: #f1eee7;
  --ink: #1a1d24; --ink-2: #4a4e5a; --ink-3: #8a8e99;
  --hairline: rgba(26,29,36,0.07); --hairline-2: rgba(26,29,36,0.12);
  --navy: #1f2a44; --navy-soft: rgba(31,42,68,0.08);
  --amber: #e89a3c; --amber-soft: rgba(232,154,60,0.14);
  --red: #d2533a; --red-soft: rgba(210,83,58,0.10);
  --green: #34c759; --green-soft: rgba(52,199,89,0.14);
  --teal: #3a9aaf; --teal-soft: rgba(58,154,175,0.12);
  --blue: #4677c8; --blue-soft: rgba(70,119,200,0.12);
  --purple: #8b5fbf; --purple-soft: rgba(139,95,191,0.12);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 22px rgba(26,29,36,0.05);
}
[data-theme="dark"] {
  --bg: #0e1118; --bg-2: #131722;
  --surface: #1a1f2c; --surface-2: #20263488; --surface-3: #232938;
  --ink: #f1f2f5; --ink-2: #b8bcc8; --ink-3: #7c8090;
  --hairline: rgba(255,255,255,0.07); --hairline-2: rgba(255,255,255,0.12);
}
* { box-sizing: border-box; }
html, body { margin:0; padding:0; min-height: 100vh; font-family: 'Inter', -apple-system, system-ui, sans-serif; color: var(--ink); letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%); }
.main { padding: 18px 22px 30px; min-width: 0; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.topbar h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.1; }
.topbar .sub { font-size: 12px; color: var(--ink-2); margin-top: 3px; }
.topbar-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ibtn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; font-weight: 500; padding: 7px 11px; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.ibtn:hover { background: var(--surface-2); }
.ibtn .ic { width: 13px; height: 13px; color: var(--ink-2); }
.ibtn.primary { background: var(--navy); color: white; border-color: var(--navy); }
.ibtn.primary:hover { filter: brightness(0.95); }
.ibtn.primary .ic { color: white; }
.ibtn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Day strip ──────────────────────────────────────────────── */
.day-strip { display: inline-flex; align-items: stretch; gap: 4px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; padding: 6px; margin-bottom: 12px; box-shadow: var(--shadow-card); width: fit-content; }
.day-strip .nav { width: 38px; border: 0; background: transparent; color: var(--ink-2); cursor: pointer; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; transition: background 120ms, color 120ms; }
.day-strip .nav:hover { background: var(--surface-2); color: var(--navy); }
.day-strip .week-pill { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 14px; border-radius: 12px; background: var(--navy); color: white; min-width: 60px; gap: 0; line-height: 1.05; }
.day-strip .week-pill .wk { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.75; }
.day-strip .week-pill .wn { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.day-strip .day-pill { appearance: none; border: 0; background: transparent; cursor: pointer; padding: 8px 18px; border-radius: 12px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; color: var(--ink-2); transition: background 120ms, color 120ms; position: relative; min-width: 86px; }
.day-strip .day-pill:hover { background: var(--surface-2); }
.day-strip .day-pill .dn { font-size: 11px; font-weight: 700; color: var(--ink-3); letter-spacing: 0.08em; }
.day-strip .day-pill .dd { font-size: 22px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.05; }
.day-strip .day-pill[aria-pressed="true"] { background: var(--amber); box-shadow: 0 4px 12px rgba(232,154,60,0.35), 0 1px 2px rgba(0,0,0,0.05); }
.day-strip .day-pill[aria-pressed="true"] .dn { color: rgba(255,255,255,0.85); }
.day-strip .day-pill[aria-pressed="true"] .dd { color: white; }
.day-strip .day-pill.holiday { opacity: 0.4; cursor: not-allowed; }
.day-strip .day-pill .dot { position: absolute; top: 7px; right: 14px; width: 7px; height: 7px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 2px var(--surface); }

/* Dept tabs + collapse/expand row ─────────────────────────── */
.controls-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.dept-tabs { display: inline-flex; gap: 4px; padding: 3px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 12px; }
.dept-tab { appearance: none; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 500; padding: 7px 13px; border-radius: 9px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.dept-tab .ic { width: 13px; height: 13px; color: var(--ink-3); }
.dept-tab[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 4px rgba(26,29,36,0.05); font-weight: 600; }
.dept-tab[aria-pressed="true"] .ic { color: var(--navy); }
.spacer { flex: 1; }

/* iOS-style switch — used in the "Only with work" toggle */
.ios-switch { width: 38px; height: 22px; border-radius: 999px; background: rgba(120,120,128,0.32); border: 0; padding: 2px; cursor: pointer; display: inline-flex; align-items: center; transition: background 180ms; flex-shrink: 0; }
.ios-switch.on { background: var(--green); }
.ios-switch .knob { width: 18px; height: 18px; border-radius: 50%; background: white; box-shadow: 0 1px 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.18); transition: transform 200ms cubic-bezier(0.32,0.72,0,1); }
.ios-switch.on .knob { transform: translateX(16px); }

.toggle-pill { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 999px; padding: 5px 12px 5px 14px; cursor: pointer; user-select: none; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.toggle-pill:hover { background: var(--surface-2); }
.toggle-pill .lbl { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.toggle-pill.on .lbl { color: var(--ink); }

/* Machines filter button + popover */
.filter-wrap { position: relative; }
.filter-btn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.filter-btn:hover { background: var(--surface-2); }
.filter-btn.has-filter { background: var(--amber-soft); border-color: rgba(232,154,60,0.4); color: var(--amber); }
.filter-btn .badge { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.filter-btn.has-filter .badge { background: var(--amber); color: white; }

.filter-popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; min-width: 280px; max-height: 440px; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 14px; box-shadow: 0 12px 32px rgba(26,29,36,0.16), 0 4px 8px rgba(26,29,36,0.06); overflow: hidden; }
.filter-popover .pop-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--hairline); background: var(--surface-2); }
.filter-popover .pop-head .ttl { font-size: 12px; font-weight: 700; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.06em; }
.filter-popover .pop-head .actions { display: flex; gap: 6px; }
.filter-popover .pop-head button { appearance: none; border: 0; background: transparent; color: var(--navy); font: inherit; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.filter-popover .pop-head button:hover { background: var(--surface); }
.filter-popover .pop-list { overflow-y: auto; padding: 4px 0; }
.filter-popover .pop-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; user-select: none; }
.filter-popover .pop-item:hover { background: var(--surface-2); }
.filter-popover .pop-item .cbx { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--hairline-2); background: var(--surface); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 120ms, border-color 120ms; }
.filter-popover .pop-item.checked .cbx { background: var(--navy); border-color: var(--navy); color: white; }
.filter-popover .pop-item .lbl { font-size: 13px; color: var(--ink); font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.filter-popover .pop-item .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); flex-shrink: 0; }
.filter-popover .pop-item .dot.has-work { background: var(--green); }
.filter-popover .pop-item .jobcount { font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.filter-popover .pop-foot { padding: 10px 12px; border-top: 1px solid var(--hairline); background: var(--surface-2); }
.filter-popover .pop-foot .print-go { width: 100%; appearance: none; border: 0; background: var(--navy); color: #fff; font: inherit; font-size: 12px; font-weight: 600; padding: 9px 12px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.filter-popover .pop-foot .print-go:hover { filter: brightness(0.96); }
.filter-popover .pop-foot .print-go:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
.filter-popover .pop-empty { padding: 16px 14px; font-size: 12px; color: var(--ink-3); }

/* Top progress bar + summary ─────────────────────────────── */
.day-summary { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 16px; padding: 16px 22px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
.day-summary .endlabel { font-size: 13px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.day-summary .bar { position: relative; height: 12px; border-radius: 999px; background: var(--surface-3); overflow: visible; box-shadow: inset 0 1px 2px rgba(0,0,0,0.04); }
.day-summary .bar .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: linear-gradient(90deg, var(--navy), #2c3a5d); box-shadow: 0 1px 3px rgba(31,42,68,0.30); }
.day-summary .bar .break-tick { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, rgba(255,255,255,0.4), rgba(255,255,255,0.4) 3px, transparent 3px, transparent 6px); border-left: 1px solid rgba(0,0,0,0.06); border-right: 1px solid rgba(0,0,0,0.06); }
.day-summary .bar .cursor { position: absolute; top: -5px; height: 22px; width: 4px; background: var(--amber); border-radius: 3px; box-shadow: 0 0 0 3px rgba(232,154,60,0.18), 0 4px 12px rgba(232,154,60,0.55); }
.day-summary .bar .cursor-label { position: absolute; top: -32px; transform: translateX(-50%); background: var(--amber); color: white; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 7px; font-variant-numeric: tabular-nums; white-space: nowrap; box-shadow: 0 4px 10px rgba(232,154,60,0.35); }
.day-summary .stats { font-size: 13px; color: var(--ink-2); display: flex; align-items: center; gap: 14px; font-weight: 500; }
.day-summary .stats .item { display: inline-flex; align-items: baseline; gap: 5px; }
.day-summary .stats .n { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; font-size: 15px; letter-spacing: -0.02em; }
.day-summary .stats .lbl { font-size: 11px; color: var(--ink-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
.day-summary .stats .sep { color: var(--hairline-2); font-weight: 400; }
.day-summary .stats .warn { color: var(--amber); font-weight: 700; }
.day-summary .stats .warn .n { color: var(--amber); }

/* Banner (gen result / overflow notice) ──────────────────── */
.banner { background: var(--navy-soft); border: 1px solid rgba(31,42,68,0.18); border-radius: 14px; padding: 11px 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink); }
.banner .ic { color: var(--navy); flex-shrink: 0; }
.banner.warn { background: rgba(232,154,60,0.10); border-color: rgba(232,154,60,0.30); }
.banner.warn .ic { color: var(--amber); }
.banner strong { color: var(--ink); font-weight: 600; }

.state { padding: 48px 16px; text-align: center; color: var(--ink-3); font-size: 13px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; }
.state.err { color: var(--red); }

/* Machine card ──────────────────────────────────────────── */
.machine-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; margin-bottom: 10px; box-shadow: var(--shadow-card); overflow: hidden; position: relative; transition: box-shadow 180ms, border-color 180ms; }
.machine-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--stripe, var(--ink-3)); }
.machine-card:hover { box-shadow: 0 4px 14px rgba(26,29,36,0.06), var(--shadow-card); }
.machine-card.idle::before { opacity: 0.35; }
.machine-card.overflowed { border-color: rgba(232,154,60,0.4); box-shadow: 0 0 0 1px rgba(232,154,60,0.18), var(--shadow-card); }
.mc-head { display: grid; grid-template-columns: 18px 1fr auto auto auto; gap: 18px; align-items: center; padding: 16px 22px 16px 26px; cursor: pointer; user-select: none; }
.mc-head:hover { background: linear-gradient(90deg, var(--head-soft, transparent) 0, transparent 280px); }
.mc-head .chev { color: var(--ink-3); transition: transform 180ms; flex-shrink: 0; }
.machine-card.open .mc-head .chev { transform: rotate(90deg); color: var(--head-ink, var(--ink-2)); }
.mc-head .name-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mc-head .name { font-size: 17px; font-weight: 700; color: var(--head-ink, var(--ink)); letter-spacing: -0.02em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-head .substats { font-size: 10px; color: var(--ink-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; display: inline-flex; align-items: center; gap: 5px; }
.mc-head .substats .idle-tag { color: var(--ink-3); font-style: italic; text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 11px; }

.mc-head .num-stack { display: flex; align-items: baseline; gap: 14px; }
.mc-head .num-stack .num { display: flex; flex-direction: column; align-items: flex-end; line-height: 1; gap: 3px; }
.mc-head .num-stack .num .v { font-size: 18px; font-weight: 700; color: var(--head-ink, var(--ink)); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.mc-head .num-stack .num .v.muted { color: var(--ink-3); }
.mc-head .num-stack .num.done .v { color: var(--green); }
.mc-head .num-stack .num.done .v .of { font-size: 11px; font-weight: 600; color: var(--ink-3); }
.mc-head .num-stack .num.done.none .v { color: var(--ink-3); }
.mc-head .num-stack .num .k { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }

.mc-head .mini-progress { width: 160px; height: 8px; background: var(--surface-3); border-radius: 999px; position: relative; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.04); }
.mc-head .mini-progress { overflow: visible; }  /* allow the now-dot to extend above */
.mc-head .mini-progress .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--stripe, var(--navy)); border-radius: 999px; transition: width 240ms ease-out; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.mc-head .mini-progress.over .fill { background: var(--red); }
/* Green "actually done" overlay — sits on the LEFT portion of the navy
   fill. Width = actualDoneMin / budgetMin. Compared against the now-dot
   (expected position) to read ahead/behind at a glance. */
.mc-head .mini-progress .actual-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--green); border-radius: 999px; transition: width 600ms linear; box-shadow: 0 1px 2px rgba(0,0,0,0.12); z-index: 2; }
/* Small dot floating above the bar at the expected position. Colour-coded:
   green = on track/ahead, amber = slightly behind, red = behind. */
.mc-head .mini-progress .now-dot { position: absolute; top: -7px; width: 10px; height: 10px; border-radius: 50%; background: var(--amber); transform: translateX(-50%); box-shadow: 0 2px 6px rgba(232,154,60,0.55), 0 0 0 2px var(--surface); transition: left 600ms linear, background 200ms; z-index: 3; }
.mc-head .mini-progress .now-dot::after { content: ''; position: absolute; left: 50%; top: 100%; transform: translateX(-50%); width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid currentColor; color: var(--amber); transition: color 200ms; }
.mc-head .mini-progress .now-dot.status-good { background: var(--green); box-shadow: 0 2px 6px rgba(52,199,89,0.55), 0 0 0 2px var(--surface); }
.mc-head .mini-progress .now-dot.status-good::after { color: var(--green); }
.mc-head .mini-progress .now-dot.status-warn { background: var(--amber); box-shadow: 0 2px 6px rgba(232,154,60,0.55), 0 0 0 2px var(--surface); }
.mc-head .mini-progress .now-dot.status-warn::after { color: var(--amber); }
.mc-head .mini-progress .now-dot.status-bad { background: var(--red); box-shadow: 0 2px 6px rgba(210,83,58,0.55), 0 0 0 2px var(--surface); }
.mc-head .mini-progress .now-dot.status-bad::after { color: var(--red); }
.mc-head .mini-progress .now-dot.status-neutral { background: var(--ink-3); box-shadow: 0 1px 3px rgba(0,0,0,0.20), 0 0 0 2px var(--surface); }
.mc-head .mini-progress .now-dot.status-neutral::after { color: var(--ink-3); }
.mc-head .over-badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; background: var(--red); color: white; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; box-shadow: 0 2px 6px rgba(210,83,58,0.35); }

.mc-body { display: none; border-top: 1px solid var(--hairline); }
.machine-card.open .mc-body { display: block; }
.empty-row { padding: 18px 22px; font-size: 12px; color: var(--ink-3); font-style: italic; }

/* Rows inside machine card ──────────────────────────────── */
.row { display: grid; grid-template-columns: 26px 24px 92px 84px 1fr auto auto; gap: 14px; align-items: center; padding: 12px 18px 12px 22px; }
.row + .row { border-top: 1px solid var(--hairline); }
.row:hover { background: var(--surface-2); }
.row .reorder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.row .rbtn { width: 22px; height: 15px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--hairline); border-radius: 5px; background: var(--surface); color: var(--ink-3); cursor: pointer; transition: background 120ms, color 120ms, border-color 120ms; }
.row .rbtn:hover:not(:disabled) { color: var(--navy); border-color: var(--navy); background: var(--amber-soft); }
.row .rbtn:disabled { opacity: 0.4; cursor: default; }
.row.pending { background: color-mix(in srgb, var(--amber) 6%, transparent); }
.row.pending .when { opacity: 0.45; }
.reorder-note { display: flex; align-items: center; gap: 6px; padding: 8px 22px; font-size: 11px; font-weight: 700; color: var(--amber); background: var(--amber-soft); text-transform: uppercase; letter-spacing: 0.04em; }
.ibtn.primary.pending-pulse { position: relative; background: var(--amber); border-color: var(--amber); animation: pendingPulse 1.6s ease-in-out infinite; }
.ibtn.primary .pending-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; margin-left: 2px; }
@keyframes pendingPulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--amber) 55%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--amber) 0%, transparent); } }
.row .seq { width: 22px; height: 22px; border-radius: 6px; background: var(--amber-soft); color: var(--amber); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
.row .when { font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.15; }
.row .when .dash { color: var(--ink-3); margin: 0 2px; }
.row .ord-pri { display: flex; flex-direction: column; gap: 2px; }
.row .ord-pri .ord { font-size: 13px; font-weight: 700; color: var(--stripe, var(--navy)); }
.row .ord-pri .pri { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.row .info { min-width: 0; }
.row .info .part { font-size: 14px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; line-height: 1.2; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; }
.row .info .part.stale { color: var(--amber); font-style: italic; font-weight: 600; }
.row .info .asm-tag { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 5px; background: var(--blue-soft); color: var(--blue); font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; flex-shrink: 0; }
.row .info .meta { font-size: 11px; color: var(--ink-3); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.row .info .meta .prod-tag { color: var(--ink-2); font-weight: 600; }
.row .info .meta .setup-tag { color: var(--amber); font-weight: 600; }
.row .parts { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 84px; }
.row .parts .count { font-size: 30px; font-weight: 700; color: var(--stripe, var(--ink)); line-height: 0.95; font-variant-numeric: tabular-nums; letter-spacing: -0.025em; }
.row .parts .rate-label { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 5px; font-variant-numeric: tabular-nums; }
.row .parts .rate-label .sep { color: var(--hairline-2); margin: 0 4px; font-weight: 400; }

.action { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); font: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: filter 140ms, transform 140ms, box-shadow 200ms; min-width: 96px; justify-content: center; letter-spacing: -0.01em; }
.action:hover { filter: brightness(0.98); transform: translateY(-1px); }
.action:active { transform: translateY(0); }
.action.start {
  background: linear-gradient(180deg, #3fd66c 0%, #2bb058 100%);
  border-color: #2bb058;
  color: white;
  box-shadow:
    0 0 0 4px rgba(52,199,89,0.16),
    0 6px 16px rgba(52,199,89,0.45),
    inset 0 1px 0 rgba(255,255,255,0.25),
    0 1px 2px rgba(0,0,0,0.06);
}
.action.start:hover {
  box-shadow:
    0 0 0 5px rgba(52,199,89,0.22),
    0 10px 22px rgba(52,199,89,0.55),
    inset 0 1px 0 rgba(255,255,255,0.30),
    0 1px 2px rgba(0,0,0,0.06);
}
.action.pause {
  background: linear-gradient(180deg, #efa756 0%, #d8862e 100%);
  border-color: #d8862e; color: white; min-width: 78px;
  box-shadow: 0 4px 10px rgba(232,154,60,0.35), inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(0,0,0,0.05);
}
.action.stop {
  background: linear-gradient(180deg, #df6a52 0%, #c44529 100%);
  border-color: #c44529; color: white; min-width: 72px;
  box-shadow: 0 4px 10px rgba(210,83,58,0.35), inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(0,0,0,0.05);
}
.action.queued { background: var(--surface-2); color: var(--ink-3); cursor: default; box-shadow: none; }
.action.queued:hover { filter: none; transform: none; }
.action.done { background: var(--surface-2); color: var(--ink-3); cursor: default; box-shadow: none; }
.action.done:hover { filter: none; transform: none; }
/* Boss-only per-row "All done" — secondary to Start (outline, not filled) so
   the operator's primary action still reads first. Turns amber on the second
   tap, which is the confirm. */
.action.alldone {
  background: var(--surface); border-color: color-mix(in srgb, var(--green) 45%, var(--hairline-2));
  color: var(--green); min-width: 92px; box-shadow: none;
}
.action.alldone:hover { background: color-mix(in srgb, var(--green) 10%, var(--surface)); }
.action.alldone.confirm {
  background: linear-gradient(180deg, #efa756 0%, #d8862e 100%);
  border-color: #d8862e; color: white;
  box-shadow: 0 4px 10px rgba(232,154,60,0.35), inset 0 1px 0 rgba(255,255,255,0.20);
}
.action-pair { display: inline-flex; gap: 6px; align-items: center; }

/* Break / cleaning row ─────────────────────────────────── */
.break-row { display: grid; grid-template-columns: 22px 24px 92px 1fr auto; gap: 14px; align-items: center; padding: 10px 18px 10px 22px; background: var(--surface-2); }
.break-row + .row, .row + .break-row, .break-row + .break-row { border-top: 1px solid var(--hairline); }
.break-row .ic { color: var(--ink-3); }
.break-row .spc { /* sequence-column placeholder */ }
.break-row .when { font-size: 12px; font-weight: 600; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.break-row .label { font-size: 11px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.break-row .duration { font-size: 11px; color: var(--ink-3); font-weight: 600; font-variant-numeric: tabular-nums; }

/* ── Phones & small tablets ──────────────────────────────────
   Reflow the dense desktop grid into stacked lines so nothing runs off
   the right edge. The per-machine progress bar and the big number stack
   are desktop-only luxuries; the substats line already carries the key
   counts, so we hide them here. */
@media (max-width: 860px) {
  .day-summary { grid-template-columns: 1fr; gap: 10px; padding: 14px 16px; }
  .day-summary .endlabel { display: inline-block; }

  .mc-head { grid-template-columns: 18px 1fr auto; gap: 12px; padding: 14px 14px 14px 18px; }
  .mc-head .num-stack { display: none; }
  .mc-head .mini-progress { display: none; }

  .row { display: flex; flex-wrap: wrap; align-items: center; column-gap: 10px; row-gap: 7px; padding: 12px 14px; }
  .row .reorder { order: 0; flex-direction: row; gap: 4px; }
  .row .rbtn { width: 30px; height: 26px; }
  .row .seq { order: 1; }
  .row .when { order: 2; }
  .row .ord-pri { order: 3; }
  .row .parts { order: 4; margin-left: auto; flex-direction: row; align-items: baseline; gap: 6px; min-width: 0; }
  .row .parts .count { font-size: 22px; }
  .row .parts .rate-label { margin-top: 0; }
  .row .info { order: 5; flex: 1 1 100%; }
  .row .action, .row .action-pair { order: 6; flex: 1 1 100%; }
  .row .action-pair { display: flex; }
  .row .action-pair .action { flex: 1; }

  .break-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
}
`

// ============================================================
// Print run-sheets (dense-grid form)
// ------------------------------------------------------------
// Hidden on screen, shown only on print. One A4 portrait sheet per machine
// that has work on the selected day. Layout mirrors the floor's run sheet:
// header + counts, fill-in row, dense grid (qty boxes, "actual finish" write
// column, tick boxes), shift-break bands, and a sign-off footer. Every class
// is namespaced `pf-` so it can never touch the live app UI.
// ============================================================
const printStyles = `
.print-root { display: none; }
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  /* The app shell is a CSS grid; content inside a grid/flex item does NOT
     paginate across pages in most browsers, so every machine sheet collapsed
     toward a single page ("only one prints"). Force plain block flow for the
     print root and its ancestors so each sheet becomes its own page. */
  .app { display: block !important; }
  .app > *:not(.print-root) { display: none !important; }
  .print-root { display: block !important; width: auto !important; }
  @page { size: A4 portrait; margin: 12mm; }
  .pf-page { break-after: page; page-break-after: always; break-inside: auto; }
  .pf-page:last-child { break-after: auto; page-break-after: auto; }
  .pf-table { page-break-inside: auto; }
  .pf-table tr { break-inside: avoid; page-break-inside: avoid; }
}
.print-root {
  --pf-ink:#1c1c1a; --pf-muted:#76746e; --pf-faint:#a9a7a0;
  --pf-paper:#ffffff; --pf-line:#cdcbc4; --pf-line-strong:#8d8b84;
  --pf-zebra:#f1f0ea; --pf-accent:#1f2a44;
  --pf-break:#fbf1dc; --pf-break-line:#e6c97a; --pf-write:#fffdf5;
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  color: var(--pf-ink); -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pf-page { width:100%; background:var(--pf-paper); color:var(--pf-ink); }
.pf-page + .pf-page { margin-top:40px; }
.pf-head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; border-bottom:2.5px solid var(--pf-ink); padding-bottom:12px; margin-bottom:4px; }
.pf-machine { font-size:25px; font-weight:800; letter-spacing:-.3px; line-height:1; }
.pf-machine small { font-weight:600; font-size:13px; color:var(--pf-muted); }
.pf-logo { height:56px; width:auto; max-width:220px; object-fit:contain; flex:none; align-self:flex-start; }
.pf-meta { display:flex; gap:22px; font-size:11px; color:var(--pf-muted); margin-top:6px; }
.pf-meta b { color:var(--pf-ink); font-weight:700; }
.pf-fillrow { display:flex; margin:10px 0 14px; border:1.5px solid var(--pf-ink); }
.pf-fillrow .pf-f { flex:1; border-right:1px solid var(--pf-line-strong); padding:5px 9px; }
.pf-fillrow .pf-f:last-child { border-right:none; }
.pf-fillrow .pf-lab { font-size:9px; text-transform:uppercase; letter-spacing:.6px; color:var(--pf-muted); }
.pf-fillrow .pf-val { min-height:17px; font-size:12px; font-weight:600; padding-top:2px; }
.pf-table { width:100%; border-collapse:collapse; }
.pf-table thead th { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#fff; background:var(--pf-ink); padding:6px 7px; text-align:left; font-weight:700; border-right:1px solid #45433d; }
.pf-table thead th:last-child { border-right:none; }
.pf-table tbody td { padding:5px 7px; border-bottom:1px solid var(--pf-line); border-right:1px solid var(--pf-line); vertical-align:middle; }
.pf-table tbody td:last-child { border-right:none; }
.pf-table tbody tr.pf-job:nth-of-type(odd) td { background:var(--pf-zebra); }
.pf-c-n { width:24px; text-align:center; color:var(--pf-muted); font-weight:700; font-size:11px; }
.pf-order { color:var(--pf-accent); font-weight:800; font-size:12px; white-space:nowrap; }
.pf-part { font-weight:700; font-size:13px; line-height:1.15; }
.pf-asm { display:inline-block; margin-left:5px; padding:0 5px; border-radius:4px; background:#e6edf7; color:#2b59a8; font-size:8px; font-weight:700; letter-spacing:.5px; vertical-align:middle; }
.pf-setup { color:#b8860b; font-weight:600; font-size:9px; }
.pf-product { font-size:10.5px; color:var(--pf-muted); line-height:1.2; }
.pf-prodqty { display:inline-block; margin-top:2px; padding:0 5px; border-radius:4px; background:#eef1f6; color:#2b3a5c; font-size:9px; font-weight:700; letter-spacing:.2px; white-space:nowrap; }
.pf-tpu { font-variant-numeric:tabular-nums; font-weight:600; font-size:11px; white-space:nowrap; }
.pf-tpu small { color:var(--pf-faint); font-weight:500; }
.pf-sched { font-variant-numeric:tabular-nums; font-size:11px; white-space:nowrap; }
.pf-sched .pf-arr { color:var(--pf-faint); }
.pf-sched b { font-weight:700; }
.pf-qtybox { display:inline-flex; align-items:center; justify-content:center; min-width:34px; height:30px; padding:0 6px; border:2px solid var(--pf-ink); border-radius:5px; font-weight:800; font-size:18px; line-height:1; background:#fff; }
.pf-c-qty { text-align:center; width:54px; }
.pf-c-fin { width:96px; background:var(--pf-write); }
.pf-finline { height:24px; border-bottom:1.6px dashed var(--pf-line-strong); }
.pf-c-done { width:30px; text-align:center; }
.pf-tick { display:inline-block; width:17px; height:17px; border:1.8px solid var(--pf-ink); border-radius:3px; background:#fff; }
.pf-table tbody tr.pf-brk td { background:var(--pf-break); border-top:1.5px solid var(--pf-break-line); border-bottom:1.5px solid var(--pf-break-line); padding:5px 9px; }
.pf-brk-inner { display:flex; align-items:center; gap:12px; font-weight:700; }
.pf-brk-inner .pf-bt { font-variant-numeric:tabular-nums; font-size:11px; color:#8a6d1e; font-weight:700; }
.pf-brk-inner .pf-bl { font-size:13px; letter-spacing:1px; color:#7a5f15; text-transform:uppercase; }
.pf-brk-inner .pf-bd { margin-left:auto; font-size:11px; color:#8a6d1e; font-weight:700; }
.pf-signoff { display:flex; margin-top:16px; border:1.5px solid var(--pf-ink); }
.pf-signoff .pf-s { flex:1; padding:7px 10px 16px; border-right:1px solid var(--pf-line-strong); }
.pf-signoff .pf-s:last-child { border-right:none; }
.pf-signoff .pf-lab { font-size:9px; text-transform:uppercase; letter-spacing:.6px; color:var(--pf-muted); }
.pf-foot { display:flex; justify-content:space-between; margin-top:10px; font-size:9.5px; color:var(--pf-faint); text-transform:capitalize; }
.pf-empty { padding:60px; text-align:center; color:var(--pf-muted); font-size:13px; }
`

// ============================================================
// Helpers
// ============================================================

function fmtTime(t) {
  // accepts "HH:MM:SS" or "HH:MM"
  return t.slice(0, 5)
}
function durationLabel(startMin, endMin) {
  const total = endMin - startMin
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Build a merged list of {type:'job'|'break', start, end, ...} from a
// machine's schedule rows + the shift's break list, sorted chronologically.
function buildTimeline(jobs, shift) {
  const items = []
  for (const j of jobs) {
    items.push({
      type: 'job',
      startMin: timeToMin(fmtTime(j.start_time)),
      endMin: timeToMin(fmtTime(j.end_time)),
      data: j,
    })
  }
  for (const b of shift.breaks) {
    items.push({
      type: 'break',
      startMin: timeToMin(b.start),
      endMin: timeToMin(b.end),
      label: b.label,
    })
  }
  items.sort((a, b) => a.startMin - b.startMin)
  return items
}

// Total work-minutes for a machine on a date — sum each job's work seconds
// (seconds_per_part × total units) / 60, plus setup if includes_setup. Used
// for the machine's progress bar against the effective shift budget.
function workMinutesForJob(j) {
  if (!j._step || !j._part || !j._order) return 0
  // Prefer the row's own qty (engine writes this on split rows). Falls back
  // to the full part quantity for legacy rows where qty is NULL.
  const units = (j.qty != null && j.qty !== '')
    ? Number(j.qty)
    : (j._order.qty ?? 0) * (j._part.qty_per_unit ?? 1)
  const workSecs = (j._step.seconds_per_part ?? 0) * units
  const workMin = Math.ceil(workSecs / 60)
  const setupMin = j.includes_setup ? (j._step.setup_time ?? 0) : 0
  return workMin + setupMin
}

// ============================================================
// Subcomponents
// ============================================================

function IOSSwitch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`ios-switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  )
}

function MachinesFilter({ machines, hiddenIds, onToggle, onShowAll, onHideAll, jobCountById }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const visibleCount = machines.length - hiddenIds.size

  // Click outside to close.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const hasFilter = hiddenIds.size > 0

  return (
    <div className="filter-wrap" ref={ref}>
      <button
        type="button"
        className={`filter-btn ${hasFilter ? 'has-filter' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Filter size={13} />
        Machines
        <span className="badge">{visibleCount}/{machines.length}</span>
      </button>
      {open && (
        <div className="filter-popover">
          <div className="pop-head">
            <span className="ttl">Show machines</span>
            <div className="actions">
              <button onClick={onShowAll}>All</button>
              <button onClick={onHideAll}>None</button>
            </div>
          </div>
          <div className="pop-list">
            {machines.map((m) => {
              const checked = !hiddenIds.has(m.id)
              const jobs = jobCountById.get(m.id) || 0
              return (
                <div
                  key={m.id}
                  className={`pop-item ${checked ? 'checked' : ''}`}
                  onClick={() => onToggle(m.id)}
                >
                  <span className="cbx">
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="lbl">{m.name}</span>
                  <span className={`dot ${jobs > 0 ? 'has-work' : ''}`} title={jobs > 0 ? `${jobs} job(s)` : 'no work'} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Dropdown that lets the user pick which machines get a printed run sheet,
// then fires the print. Lists only machines that have work on the selected
// day. Mirrors MachinesFilter's look; "checked" = will be printed.
function PrintPicker({ machines, excludedIds, onToggle, onAll, onNone, jobCountById, onPrint }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selectedCount = machines.filter((m) => !excludedIds.has(m.id)).length

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const doPrint = () => {
    setOpen(false)
    onPrint()
  }

  return (
    <div className="filter-wrap" ref={ref}>
      <button
        type="button"
        className="ibtn"
        onClick={() => setOpen((o) => !o)}
        title="Choose machines, then print a run sheet for each"
      >
        <Printer size={13} className="ic" /> Print day
      </button>
      {open && (
        <div className="filter-popover">
          <div className="pop-head">
            <span className="ttl">Print machines</span>
            <div className="actions">
              <button onClick={onAll}>All</button>
              <button onClick={onNone}>None</button>
            </div>
          </div>
          <div className="pop-list">
            {machines.length === 0 ? (
              <div className="pop-empty">No machines have work on this day.</div>
            ) : (
              machines.map((m) => {
                const checked = !excludedIds.has(m.id)
                const jobs = jobCountById.get(m.id) || 0
                return (
                  <div
                    key={m.id}
                    className={`pop-item ${checked ? 'checked' : ''}`}
                    onClick={() => onToggle(m.id)}
                  >
                    <span className="cbx">
                      {checked && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="lbl">{m.name}</span>
                    <span className="jobcount" title={`${jobs} job(s)`}>{jobs}</span>
                  </div>
                )
              })
            )}
          </div>
          <div className="pop-foot">
            <button className="print-go" onClick={doPrint} disabled={selectedCount === 0}>
              <Printer size={13} /> Print {selectedCount} sheet{selectedCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DayStrip({ week, day, year, holidaySet, overflowByDay, onWeekChange, onDayChange }) {
  return (
    <div className="day-strip">
      <button className="nav" onClick={() => onWeekChange(week - 1)} aria-label="Previous week"><ChevronLeft size={16} /></button>
      <div className="week-pill">
        <span className="wk">WK</span>
        <span className="wn">{week}</span>
      </div>
      {DAY_NAMES.map((name, i) => {
        const dayIdx = i + 1
        const date = isoWeekDayToDate(year, week, dayIdx)
        const dd = String(date.getDate()).padStart(2, '0')
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${dd}`
        const isHol = holidaySet?.has(dateStr)
        const isOverflow = overflowByDay?.get(dateStr)
        return (
          <button
            key={name}
            className={`day-pill ${isHol ? 'holiday' : ''}`}
            aria-pressed={day === dayIdx}
            onClick={() => !isHol && onDayChange(dayIdx)}
            title={isHol ? 'Public holiday' : ''}
          >
            <span className="dn">{name}</span>
            <span className="dd">{dd}</span>
            {isOverflow && <span className="dot" />}
          </button>
        )
      })}
      <button className="nav" onClick={() => onWeekChange(week + 1)} aria-label="Next week"><ChevronRight size={16} /></button>
    </div>
  )
}

function DaySummary({ shiftStart, shiftEnd, shiftBreaks, nowMin, isToday, jobsTotal, partsTotal, overflowCount }) {
  const span = shiftEnd - shiftStart
  // Cursor only shows if "today" and within shift hours; otherwise hide it.
  const cursorPct = isToday && nowMin >= shiftStart && nowMin <= shiftEnd ? ((nowMin - shiftStart) / span) * 100 : null
  return (
    <div className="day-summary">
      <span className="endlabel">{minLabel(shiftStart)}</span>
      <div className="bar">
        {shiftBreaks.map((b, i) => {
          const bs = timeToMin(b.start)
          const be = timeToMin(b.end)
          const left = ((bs - shiftStart) / span) * 100
          const width = ((be - bs) / span) * 100
          return <div key={i} className="break-tick" style={{ left: `${left}%`, width: `${width}%` }} />
        })}
        {cursorPct != null && (
          <>
            <div className="fill" style={{ width: `${cursorPct}%` }} />
            <div className="cursor" style={{ left: `${cursorPct}%` }} />
            <div className="cursor-label" style={{ left: `${cursorPct}%` }}>
              {minLabel(nowMin)}
            </div>
          </>
        )}
      </div>
      <span className="endlabel">{minLabel(shiftEnd)}</span>
      <span className="stats">
        <span className="item"><span className="n">{jobsTotal}</span><span className="lbl">jobs</span></span>
        <span className="sep">·</span>
        <span className="item"><span className="n">{partsTotal}</span><span className="lbl">parts</span></span>
        {overflowCount > 0 && (
          <>
            <span className="sep">·</span>
            <span className="item warn"><span className="n">{overflowCount}</span><span className="lbl">overflow</span></span>
          </>
        )}
      </span>
    </div>
  )
}

function BreakRow({ startMin, endMin, label }) {
  return (
    <div className="break-row">
      <Coffee size={13} className="ic" />
      <span className="spc" />
      <span className="when">{minLabel(startMin)}–{minLabel(endMin)}</span>
      <span className="label">{label}</span>
      <span className="duration">{durationLabel(startMin, endMin)}</span>
    </div>
  )
}

function minLabel(m) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
}

function JobRow({ job, sequence, onAction, onReorder, canReorder, reordering, machine, pending, isBoss }) {
  const startMin = timeToMin(fmtTime(job.start_time))
  const endMin = timeToMin(fmtTime(job.end_time))
  const dur = durationLabel(startMin, endMin)
  const orderLabel = (job._order?.ord_nr || job._order?.kwitasie_nr)
    ? `#${job._order.ord_nr || job._order.kwitasie_nr}`
    : (job.order_id ? `#${job.order_id.slice(0,6)}` : '—')
  const priority = job._order?.priority_rank ?? job._product?.default_priority ?? '—'
  // Stale rows (step deleted) can't compute exact units — fall back to
  // order.qty so the operator at least sees the order's total. The PARTS
  // label gets a "?" caveat in that case.
  const fullUnits = job._part
    ? (job._order?.qty ?? 0) * (job._part.qty_per_unit ?? 1)
    : (job._order?.qty ?? 0)
  // Row's own qty (set by the engine when the step is split across days).
  // Falls back to the full part qty when the column is NULL (legacy rows
  // or steps that fit in one shift).
  const totalUnits = (job.qty != null && job.qty !== '') ? Number(job.qty) : fullUnits
  const isSplit = job.qty != null && Number(job.qty) < fullUnits
  const ratePerPart = job._step?.seconds_per_part ?? 0
  // Effective setup minutes shown on this row, when the dispatcher charged
  // setup (includes_setup=true). Step.setup_time wins if set (legacy CSV),
  // otherwise falls back to machine.setup_time_min — same rule the engine
  // uses. Gives the operator visible proof that setup time was applied.
  const setupShown = job.includes_setup
    ? ((job._step?.setup_time && job._step.setup_time > 0)
        ? job._step.setup_time
        : (machine?.setup_time_min || 0))
    : 0
  const customer = job._customerName
  const productName = job._productName
  // Part name is what the operator actually does — promote it to the primary
  // line. When the part chain is stale, show "Stale — regenerate" so the
  // operator doesn't trust the row.
  const partName = job._part?.name || (job._stale ? 'Stale — regenerate schedule' : productName)

  const status = job.status || 'queued'

  // Boss-only "All done" shortcut. Marking a row done normally means Start →
  // MES Station → tick every part → Stop; when the boss already knows the whole
  // batch is finished that round-trip is pure friction. This button writes the
  // same end-state (status=completed + qty_done=full row qty) straight from the
  // worklist. Two-tap confirm ("Sure?") because a completed row leaves the
  // worklist immediately and there's no undo here.
  const [confirmDone, setConfirmDone] = useState(false)
  useEffect(() => {
    if (!confirmDone) return
    const t = setTimeout(() => setConfirmDone(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDone])
  // Not shown on a running row — Stop is already the "finish everything" button
  // there, and three buttons on one row is a mis-click waiting to happen.
  const allDoneEl = (isBoss && status !== 'completed' && status !== 'working') ? (
    <button
      className={`action alldone ${confirmDone ? 'confirm' : ''}`}
      title={confirmDone
        ? 'Click again to confirm'
        : `Mark all ${totalUnits || 0} parts on this row done — no timer needed`}
      onClick={() => {
        if (!confirmDone) { setConfirmDone(true); return }
        setConfirmDone(false)
        onAction(job, 'alldone', totalUnits)
      }}
    >
      <Check size={11} /> {confirmDone ? 'Sure?' : 'All done'}
    </button>
  ) : null

  let actionEl
  if (status === 'working') {
    actionEl = (
      <>
        <button className="action pause" onClick={() => onAction(job, 'pause')}><Pause size={11} /> Pause</button>
        <button className="action stop"  onClick={() => onAction(job, 'stop')}><Square size={11} /> Stop</button>
      </>
    )
  } else if (status === 'paused') {
    actionEl = <button className="action start" onClick={() => onAction(job, 'start')}><Play size={11} /> Resume</button>
  } else if (status === 'completed') {
    actionEl = <button className="action done" disabled>Done</button>
  } else {
    actionEl = <button className="action start" onClick={() => onAction(job, 'start')}><Play size={11} /> Start</button>
  }

  return (
    <div className={`row ${pending ? 'pending' : ''}`}>
      {canReorder ? (
        <span className="reorder">
          <button type="button" className="rbtn" title="Move this order earlier (regenerate to apply)"
            disabled={reordering} onClick={() => onReorder?.(job, 'up')}><ChevronUp size={13} /></button>
          <button type="button" className="rbtn" title="Move this order later (regenerate to apply)"
            disabled={reordering} onClick={() => onReorder?.(job, 'down')}><ChevronDown size={13} /></button>
        </span>
      ) : <span className="reorder" />}
      <span className="seq">{sequence}</span>
      <div className="when">
        {fmtTime(job.start_time)}<br/>
        <span className="dash">→</span> {fmtTime(job.end_time)}
      </div>
      <div className="ord-pri">
        <span className="ord">{orderLabel}</span>
        <span className="pri">PRI {priority}</span>
      </div>
      <div className="info">
        <div className={`part ${job._stale ? 'stale' : ''}`}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{partName}</span>
          {job._part?.is_assembly && <span className="asm-tag" title="Assembly part — waits for all other parts to finish first">ASM</span>}
          {job._stale && <AlertTriangle size={11} style={{ color: 'var(--amber)', flexShrink: 0 }} />}
        </div>
        <div className="meta">
          {partName !== productName && productName && productName !== '—' && (
            <><span className="prod-tag">{productName}</span> · </>
          )}
          {customer || '—'} · {job._step?.sequence ? `Step ${job._step.sequence}` : 'Step ?'} · {dur}
          {setupShown > 0 && (
            <span className="setup-tag" title={`Includes ${setupShown} min setup charged on this machine`}>
              {' '}· +{setupShown}m setup
            </span>
          )}
        </div>
      </div>
      <div className="parts">
        {/* Show qty_done from Part Tracking so the operator sees what's
            already been ticked. Big number stays the planned qty; small
            "X done" label only appears when there's progress. */}
        <span className="count">{totalUnits || 0}</span>
        <span className="rate-label">
          {(job.qty_done ?? 0) > 0 && (
            <>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                {job.qty_done} DONE
              </span>
              <span className="sep">·</span>
            </>
          )}
          {isSplit ? `OF ${fullUnits} SPLIT` : (job._stale ? 'PARTS?' : 'PARTS')}
          <span className="sep">·</span>
          {ratePerPart}S/PT
        </span>
      </div>
      <span className="action-pair">
        {allDoneEl}
        {actionEl}
      </span>
    </div>
  )
}

function MachineCard({ machine, jobs, allJobs, shift, open, onToggle, onJobAction, onReorder, canReorder, reordering, pendingSeq, nowMin, isToday, isBoss }) {
  const dept = machine.department
  const tint = DEPT_TINT[dept] || DEPT_TINT.steel

  // Bar + header stats read the FULL scheduled day (including completed jobs)
  // so the load reflects the whole day and the green "done" fill grows as
  // work finishes. The worklist body below still uses `jobs` (pending only).
  const statJobs = (allJobs && allJobs.length >= 0) ? allJobs : jobs
  const totalWorkMin = useMemo(() => statJobs.reduce((s, j) => s + workMinutesForJob(j), 0), [statJobs])
  const totalParts = useMemo(() => statJobs.reduce((s, j) => {
    const tu = (j.qty != null && j.qty !== '')
      ? Number(j.qty)
      : (j._order && j._part ? (j._order.qty ?? 0) * (j._part.qty_per_unit ?? 1) : 0)
    return s + tu
  }, 0), [statJobs])
  const doneJobs = useMemo(() => statJobs.filter((j) => j.status === 'completed').length, [statJobs])
  const budgetMin = effectiveShiftMinutes(shift)
  const pct = Math.min(100, (totalWorkMin / budgetMin) * 100)
  const overflowed = totalWorkMin > budgetMin

  // Expected scheduled progress at the current clock-time, mapped onto the
  // viewed day's schedule. Walks every scheduled row: ended-before-now rows
  // contribute their full work-min, straddle-now rows contribute the
  // proportional fraction. The marker shows regardless of whether you're
  // viewing today (so on weekends you can still see where the clock falls
  // on a workday's schedule). Returns null only when there's nothing to mark.
  const expectedDoneMin = useMemo(() => {
    if (nowMin == null || statJobs.length === 0) return null
    let done = 0
    for (const j of statJobs) {
      const startMin = timeToMin(j.start_time.slice(0, 5))
      const endMin = timeToMin(j.end_time.slice(0, 5))
      const wmin = workMinutesForJob(j)
      if (endMin <= nowMin) { done += wmin }
      else if (startMin < nowMin) {
        const elapsed = nowMin - startMin
        const span = Math.max(1, endMin - startMin)
        done += wmin * (elapsed / span)
      }
    }
    return done
  }, [statJobs, nowMin])
  const nowMarkerPct = (expectedDoneMin != null && budgetMin > 0)
    ? Math.min(100, (expectedDoneMin / budgetMin) * 100)
    : null

  // Actually-done work-min based on what we know:
  //   * status='completed'             → full wmin
  //   * status='working' + started_at  → elapsed minutes since start (capped)
  //   * has qty_done > 0 (Part Tracking) → proportional wmin × (qty_done/qty)
  //
  // Tracking partial ticks are the most accurate signal, so they take
  // priority over the "elapsed since started" estimate. The amber expected
  // dot is what the schedule SHOULD have done by now; the green fill is what
  // it ACTUALLY has done — gap between them tells you ahead/behind.
  const actualDoneMin = useMemo(() => {
    let done = 0
    for (const j of statJobs) {
      const wmin = workMinutesForJob(j)
      if (j.status === 'completed') {
        done += wmin
      } else if (j.qty > 0 && (j.qty_done ?? 0) > 0) {
        done += wmin * (j.qty_done / j.qty)
      } else if (j.status === 'working' && j.started_at) {
        const startedMs = new Date(j.started_at).getTime()
        if (!isNaN(startedMs)) {
          const elapsedMin = Math.max(0, (Date.now() - startedMs) / 60000)
          done += Math.min(wmin, elapsedMin)
        }
      }
    }
    return done
  }, [statJobs, nowMin])
  const actualPct = (budgetMin > 0)
    ? Math.min(100, (actualDoneMin / budgetMin) * 100)
    : 0
  // Status colour for the dot — green if ahead/on-time, red if behind by
  // > 5% of total scheduled load, amber otherwise (slightly behind).
  const trackStatus = useMemo(() => {
    if (expectedDoneMin == null || expectedDoneMin <= 0) return 'neutral'
    if (actualDoneMin >= expectedDoneMin) return 'good'
    const gap = expectedDoneMin - actualDoneMin
    if (gap > Math.max(15, totalWorkMin * 0.10)) return 'bad'
    return 'warn'
  }, [actualDoneMin, expectedDoneMin, totalWorkMin])

  const items = useMemo(() => buildTimeline(jobs, shift), [jobs, shift])

  // Pending manual reorder for this machine: show the rows in the user's new
  // order (grouped by order, original time-order within an order). Times are
  // last-generated values and go stale until Regenerate — flagged in the UI.
  const reorderedJobs = useMemo(() => {
    if (!pendingSeq) return null
    const byOrder = new Map()
    for (const j of jobs) {
      if (!byOrder.has(j.order_id)) byOrder.set(j.order_id, [])
      byOrder.get(j.order_id).push(j)
    }
    const out = []
    for (const oid of pendingSeq) { const g = byOrder.get(oid); if (g) out.push(...g) }
    for (const j of jobs) if (!pendingSeq.includes(j.order_id)) out.push(j)
    return out
  }, [jobs, pendingSeq])
  const isReordered = !!reorderedJobs

  const isIdle = statJobs.length === 0
  return (
    <div
      data-schedmc={machine.id}
      className={`machine-card ${open ? 'open' : ''} ${overflowed ? 'overflowed' : ''} ${isIdle ? 'idle' : ''}`}
      style={{ '--stripe': tint.stripe, '--head-ink': tint.ink, '--head-soft': tint.soft }}
    >
      <div className="mc-head" onClick={onToggle}>
        <ChevronRight size={16} className="chev" />
        <div className="name-block">
          <span className="name">{machine.name}</span>
          <span className="substats">
            {isIdle
              ? <span className="idle-tag">No work today</span>
              : <>{statJobs.length} job{statJobs.length === 1 ? '' : 's'} · <b style={{ color: doneJobs > 0 ? 'var(--green)' : 'var(--ink-3)' }}>{doneJobs} done</b> · {totalParts} parts · {totalWorkMin} of {budgetMin} min</>}
          </span>
        </div>
        <div className="num-stack">
          <div className="num">
            <span className={`v ${isIdle ? 'muted' : ''}`}>{statJobs.length}</span>
            <span className="k">Jobs</span>
          </div>
          <div className="num">
            <span className={`v ${isIdle ? 'muted' : ''}`}>{totalParts}</span>
            <span className="k">Parts</span>
          </div>
          <div className={`num done ${doneJobs === 0 ? 'none' : ''}`}>
            <span className="v">{doneJobs}<span className="of">/{statJobs.length}</span></span>
            <span className="k">Done</span>
          </div>
        </div>
        <div className={`mini-progress ${overflowed ? 'over' : ''}`} title={`${totalWorkMin} / ${budgetMin} min · done: ${Math.round(actualDoneMin)}${expectedDoneMin != null ? ` · expected: ${Math.round(expectedDoneMin)}` : ''}`}>
          <div className="fill" style={{ width: `${pct}%` }} />
          {actualPct > 0 && (
            <div className="actual-fill" style={{ width: `${Math.max(actualPct, 3)}%` }} />
          )}
          {nowMarkerPct != null && (
            <div
              className={`now-dot status-${trackStatus}`}
              style={{ left: `${nowMarkerPct}%` }}
              title={trackStatus === 'good' ? 'On track or ahead' : trackStatus === 'warn' ? 'Slightly behind' : trackStatus === 'bad' ? 'Behind schedule' : 'Where this machine should be by now'}
            />
          )}
        </div>
        {overflowed
          ? <span className="over-badge"><AlertTriangle size={11} /> Overflow</span>
          : <span style={{ width: 0 }} />}
      </div>
      {open && (
        <div className="mc-body">
          {jobs.length === 0 && items.length === 0 ? (
            <div className="empty-row">
              {statJobs.length > 0
                ? `All ${statJobs.length} job${statJobs.length === 1 ? '' : 's'} for this machine are done today.`
                : 'No work scheduled for this machine today.'}
            </div>
          ) : isReordered ? (
            <>
              <div className="reorder-note">
                <AlertTriangle size={12} /> New order — times &amp; breaks update when you Regenerate
              </div>
              {reorderedJobs.map((j, i) => (
                <JobRow key={`j${j.id}`} job={j} sequence={i + 1} onAction={onJobAction} onReorder={onReorder} canReorder={canReorder} reordering={reordering} machine={machine} isBoss={isBoss} pending />
              ))}
            </>
          ) : (
            (() => {
              let seq = 0
              return items.map((it, i) => {
                if (it.type === 'job') {
                  seq++
                  return (
                    <JobRow key={`j${it.data.id}`} job={it.data} sequence={seq} onAction={onJobAction} onReorder={onReorder} canReorder={canReorder} reordering={reordering} machine={machine} isBoss={isBoss} />
                  )
                }
                return <BreakRow key={`b${i}`} startMin={it.startMin} endMin={it.endMin} label={it.label} />
              })
            })()
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Print run-sheet subcomponents
// ============================================================

// Same display rules as JobRow, distilled to the fields the printed grid
// needs. Kept in lock-step with JobRow so the paper sheet matches the screen.
function jobPrintFields(job, machine) {
  const orderLabel = (job._order?.ord_nr || job._order?.kwitasie_nr)
    ? `${job._order.ord_nr || job._order.kwitasie_nr}`
    : (job.order_id ? job.order_id.slice(0, 6) : '—')
  const productName = job._productName
  const partName = job._part?.name || (job._stale ? 'Stale — regenerate schedule' : productName)
  const fullUnits = job._part
    ? (job._order?.qty ?? 0) * (job._part.qty_per_unit ?? 1)
    : (job._order?.qty ?? 0)
  const totalUnits = (job.qty != null && job.qty !== '') ? Number(job.qty) : fullUnits
  const ratePerPart = job._step?.seconds_per_part ?? 0
  const setupShown = job.includes_setup
    ? ((job._step?.setup_time && job._step.setup_time > 0)
        ? job._step.setup_time
        : (machine?.setup_time_min || 0))
    : 0
  return {
    orderLabel, productName, partName, totalUnits, ratePerPart, setupShown,
    orderQty: job._order?.qty ?? null,
    qtyPerUnit: job._part?.qty_per_unit ?? null,
    isAsm: !!job._part?.is_assembly,
    start: fmtTime(job.start_time),
    stop: fmtTime(job.end_time),
  }
}

function PrintSheet({ machine, jobs, shift, dateLabel, dayName, weekNum }) {
  const items = buildTimeline(jobs, shift)
  const partsTotal = jobs.reduce((s, j) => {
    const tu = (j.qty != null && j.qty !== '')
      ? Number(j.qty)
      : (j._order && j._part ? (j._order.qty ?? 0) * (j._part.qty_per_unit ?? 1) : 0)
    return s + tu
  }, 0)
  const workMin = jobs.reduce((s, j) => s + workMinutesForJob(j), 0)
  let seq = 0
  return (
    <div className="pf-page">
      <div className="pf-head">
        <div>
          <div className="pf-machine">{machine.name} <small>· run sheet</small></div>
          <div className="pf-meta">
            <span><b>{jobs.length}</b> jobs</span>
            <span><b>{partsTotal}</b> parts</span>
            <span><b>{workMin}</b> min planned</span>
          </div>
        </div>
        <img
          className="pf-logo"
          src={`${import.meta.env.BASE_URL}logo-steel.jpg`}
          alt="elmo's Furniture — Steel Department"
          onError={(e) => {
            // Steel-dept logo not on disk yet → fall back to the brand logo.
            // If that's missing too, hide rather than show a broken image.
            // BASE_URL prefix keeps paths correct under the GitHub Pages subfolder.
            const img = e.currentTarget
            if (!img.dataset.fellBack) {
              img.dataset.fellBack = '1'
              img.src = `${import.meta.env.BASE_URL}logo.png`
            } else {
              img.style.display = 'none'
            }
          }}
        />
      </div>
      <div className="pf-fillrow">
        <div className="pf-f"><div className="pf-lab">Date</div><div className="pf-val">{dateLabel}</div></div>
        <div className="pf-f"><div className="pf-lab">Day</div><div className="pf-val">{dayName} · Wk {weekNum}</div></div>
        <div className="pf-f"><div className="pf-lab">Operator</div><div className="pf-val" /></div>
        <div className="pf-f"><div className="pf-lab">Shift</div><div className="pf-val">{fmtTime(shift.start)}–{fmtTime(shift.end)}</div></div>
      </div>
      <table className="pf-table">
        <thead>
          <tr>
            <th className="pf-c-n">#</th>
            <th>Order</th>
            <th>Product</th>
            <th>Part</th>
            <th style={{ textAlign: 'center' }}>Qty</th>
            <th>T/unit</th>
            <th>Scheduled</th>
            <th>Actual finish</th>
            <th style={{ textAlign: 'center' }}>✓</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            if (it.type === 'break') {
              return (
                <tr className="pf-brk" key={`b${i}`}>
                  <td colSpan={9}>
                    <div className="pf-brk-inner">
                      <span className="pf-bt">{minLabel(it.startMin)}–{minLabel(it.endMin)}</span>
                      <span className="pf-bl">{it.label}</span>
                      <span className="pf-bd">{durationLabel(it.startMin, it.endMin)}</span>
                    </div>
                  </td>
                </tr>
              )
            }
            seq++
            const f = jobPrintFields(it.data, machine)
            return (
              <tr className="pf-job" key={`j${it.data.id}`}>
                <td className="pf-c-n">{seq}</td>
                <td className="pf-order">#{f.orderLabel}</td>
                <td className="pf-product">
                  {f.productName}
                  {f.orderQty != null && (
                    <span className="pf-prodqty">{f.orderQty} product{f.orderQty === 1 ? '' : 's'}</span>
                  )}
                </td>
                <td className="pf-part">
                  {f.partName}
                  {f.isAsm && <span className="pf-asm">ASM</span>}
                  {f.setupShown > 0 && <span className="pf-setup"> +{f.setupShown}m setup</span>}
                </td>
                <td className="pf-c-qty"><span className="pf-qtybox">{f.totalUnits || 0}</span></td>
                <td className="pf-tpu">{f.ratePerPart}<small>s/pt</small></td>
                <td className="pf-sched"><b>{f.start}</b> <span className="pf-arr">→</span> {f.stop}</td>
                <td className="pf-c-fin"><div className="pf-finline" /></td>
                <td className="pf-c-done"><span className="pf-tick" /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="pf-signoff">
        <div className="pf-s"><div className="pf-lab">Operator signature</div></div>
        <div className="pf-s"><div className="pf-lab">Parts completed</div></div>
        <div className="pf-s"><div className="pf-lab">Supervisor check</div></div>
      </div>
      <div className="pf-foot">
        <span>{machine.name} · {dateLabel}</span>
        <span>{machine.department}</span>
      </div>
    </div>
  )
}

// One sheet per visible machine that has work on the selected day. Lives in
// `.print-root`, which is screen-hidden and print-shown (see printStyles).
function PrintSheets({ machines, jobsByMachine, shift, dateLabel, dayName, weekNum }) {
  const sheets = machines
    .map((m) => ({ m, jobs: jobsByMachine.get(m.id) || [] }))
    .filter((x) => x.jobs.length > 0)
  return (
    <div className="print-root" aria-hidden="true">
      {sheets.length === 0 ? (
        <div className="pf-empty">No scheduled work to print for {dayName}, {dateLabel}.</div>
      ) : (
        sheets.map(({ m, jobs }) => (
          <PrintSheet
            key={m.id}
            machine={m}
            jobs={jobs}
            shift={shift}
            dateLabel={dateLabel}
            dayName={dayName}
            weekNum={weekNum}
          />
        ))
      )}
    </div>
  )
}

// ============================================================
// Main screen
// ============================================================
export default function ScheduleScreen() {
  const navigate = useNavigate()
  const {
    machines, schedule, machineSteps, parts,
    productById, productByCode, partsByProduct, stepsByPart,
    customerByCode, holidaySet,
    enrichedOrders, machineByName,
    loading, error,
    applyScheduleRegenerate, applyScheduleByOrders, applyScheduleRowUpdate,
    applyScheduleReschedule, applyOrderUpdate,
  } = useAppData()
  const canModify = canEdit()
  // Boss only (not Manager): the per-row "All done" shortcut bypasses the MES
  // part-by-part tick, so it stays with the person who signs off the day.
  const isBoss = getCurrentUser()?.role === 'Boss'

  const today = useMemo(() => new Date(), [])
  // Reschedule on Tracking can stash a "jump-to" date in sessionStorage
  // (key: schedule:jumpToDate, YYYY-MM-DD). When Schedule mounts and finds
  // one, we open straight to that ISO week + day so the user doesn't have to
  // hunt for where their leftovers landed. Cleared after use so it only
  // fires once.
  const jumpToDate = useMemo(() => {
    try {
      const v = sessionStorage.getItem('schedule:jumpToDate')
      if (v) sessionStorage.removeItem('schedule:jumpToDate')
      return v
    } catch (_) {
      return null
    }
  }, [])
  const jumpDateObj = jumpToDate ? new Date(jumpToDate + 'T00:00:00') : null
  // Returning from an MES Station round-trip: the Start action stashed the day +
  // machine the operator was on. Read it once here and use it to seed the day
  // (below), the open machine card, and the scroll restore (effect further down)
  // so we come back to the exact day + machine, not today + top. A Tracking
  // "jump to date" still wins over this.
  const restoreFocus = useMemo(() => readScheduleFocus(), [])
  const focusDateObj = restoreFocus?.date ? new Date(restoreFocus.date + 'T00:00:00') : null
  const baseDateObj = jumpDateObj || focusDateObj || today
  const [year] = useState(() => baseDateObj.getFullYear())
  const [week, setWeek] = useState(() => isoWeek(baseDateObj))
  const [day, setDay] = useState(() => {
    const dow = baseDateObj.getDay() === 0 ? 7 : baseDateObj.getDay()
    return dow > 5 ? 1 : dow
  })
  const [dept, setDept] = useDeptTab('schedule')
  // Seed the open card with the machine the operator was working on before an
  // MES Station round-trip, so on return it's already expanded (the restore
  // effect below then scrolls it into view). Fresh opens start all-collapsed.
  const [openMachines, setOpenMachines] = useState(() => (
    restoreFocus && restoreFocus.view === 'steel' && restoreFocus.key
      ? new Set([restoreFocus.key])
      : new Set()
  ))
  // Default to showing only machines that have work — click the toggle off to
  // reveal every (idle) station.
  const [onlyWithWork, setOnlyWithWork] = useState(true)
  const [hiddenMachineIds, setHiddenMachineIds] = useState(() => new Set())
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState(null)
  const [overflowMachineIds, setOverflowMachineIds] = useState(new Set())
  const [nowTick, setNowTick] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  // Tick the clock every minute so the live "now" markers on the day-summary
  // bar and the per-machine progress bars update without a refresh.
  useEffect(() => {
    const update = () => {
      const n = new Date()
      setNowTick(n.getHours() * 60 + n.getMinutes())
    }
    const interval = setInterval(update, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Coming back from MES Station (Start → complete/close) remounts this screen,
  // which would otherwise snap to the top. Scroll the machine the operator
  // started (stashed on the Start action) back into view — works for both the
  // steel board and the wood board, since both tag each machine card with a
  // data-schedmc attribute. The card is already expanded (steel via the
  // openMachines seed above, wood via WoodConveyorView's own seed), so it has
  // real height to align to. useLayoutEffect + rAF covers late layout; then we
  // consume the focus so a later fresh open / sidebar nav starts at the top.
  useLayoutEffect(() => {
    if (!restoreFocus || !restoreFocus.key) return
    // Safe attribute selector: only " and \ need escaping inside the quotes —
    // spaces (wood machine names like "Saw Straight Line 2") stay literal. Using
    // CSS.escape here was mangling spaced names so the wood card was never found.
    const val = String(restoreFocus.key).replace(/["\\]/g, '\\$&')
    const sel = `[data-schedmc="${val}"]`
    // Place the machine card near the top of the viewport (small gap so it isn't
    // flush). Recomputed from the live rect each pass so late layout shifts
    // (status/day recompute after the MES write) don't leave us stranded.
    // scrollIntoView (not window.scrollTo): the schedule scrolls inside an inner
    // container, not the window, so window.scrollTo is a no-op. scrollIntoView
    // scrolls whatever the real container is and lands the card at the top.
    const align = (el) => {
      el.scrollIntoView({ block: 'start' })
    }
    // The wood board builds its cards a beat after mount, so a one-shot scroll
    // finds nothing and we're stuck at the top. Poll each frame until the card
    // exists (up to ~3s), then keep re-asserting for ~500ms so the reflow that
    // follows the MES write can't knock us back. We deliberately do NOT clear
    // the focus up front — React StrictMode double-invokes effects (setup →
    // cleanup → setup) in dev, and an early clear would make the surviving
    // second pass a no-op. Focus is consumed once we're done.
    let found = false
    let stopAt = 0
    let startTs = null
    let rafId = 0
    const step = (ts) => {
      if (startTs === null) startTs = ts
      const el = document.querySelector(sel)
      if (el) {
        align(el)
        if (!found) { found = true; stopAt = ts + 500 }
      }
      const keepGoing = found ? ts < stopAt : ts - startTs < 3000
      if (keepGoing) rafId = requestAnimationFrame(step)
      else clearScheduleFocus()
    }
    // First try synchronously (no flash if the card is already there), then poll.
    const el0 = document.querySelector(sel)
    if (el0) align(el0)
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [restoreFocus])

  const selectedDate = useMemo(() => {
    const d = isoWeekDayToDate(year, week, day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [year, week, day])

  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  }, [today])

  const dayShift = useMemo(() => shiftForDate(isoWeekDayToDate(year, week, day)), [year, week, day])

  // Manual per-day parts order set in Priority → "Sort parts for the day".
  // When a plan exists for a day+department, the schedule board honors that
  // order (which is the sequence the parts enter the factory) instead of the
  // engine's start_time, and re-packs the machine timeline to match. Bumping
  // partsPlanVer on the storage event keeps this live without a refresh.
  const [partsPlanVer, setPartsPlanVer] = useState(0)
  useEffect(() => {
    const bump = () => setPartsPlanVer((v) => v + 1)
    window.addEventListener(PARTS_DAY_EVENT, bump)
    window.addEventListener('storage', bump)
    return () => {
      window.removeEventListener(PARTS_DAY_EVENT, bump)
      window.removeEventListener('storage', bump)
    }
  }, [])
  const dayPartPlans = useMemo(
    () => (dept === 'steel' || dept === 'wood') ? loadAllDayPlans(dept) : null,
    [dept, partsPlanVer],
  )

  // Machines for the current dept tab (active only). "all" shows everything.
  // Sort by the Machines screen's drag-to-reorder position (display_order)
  // so the worklist matches the order the user set up. Name is the tiebreak
  // for legacy rows whose display_order hasn't been set yet.
  const deptMachines = useMemo(() => {
    let list = (machines || []).filter((m) => m.active !== false)
    if (dept !== 'all') list = list.filter((m) => m.department === dept)
    return list.sort((a, b) => {
      const aO = a.display_order ?? 0
      const bO = b.display_order ?? 0
      if (aO !== bO) return aO - bO
      return a.name.localeCompare(b.name)
    })
  }, [machines, dept])

  // Enrich schedule rows once: join order / step / part / product / customer.
  const ordersById = useMemo(() => new Map((enrichedOrders || []).map((o) => [o.id, o])), [enrichedOrders])
  const machineStepsById = useMemo(() => new Map((machineSteps || []).map((s) => [s.id, s])), [machineSteps])
  const partsById = useMemo(() => new Map((parts || []).map((p) => [p.id, p])), [parts])

  // Map machine_id → machine record, so we can name the SPECIFIC machine the
  // row was dispatched to (which may be an alt, not the step's primary
  // machine_name). Without this, MES Station would always show the step's
  // primary machine name even when the dispatcher placed work on an alt.
  const machineById = useMemo(() => new Map((machines || []).map((m) => [m.id, m])), [machines])

  const enrichedRows = useMemo(() => {
    let staleSeen = 0
    const sample = []
    const result = (schedule || []).map((row) => {
      const step = machineStepsById.get(row.machine_step_id)
      const part = step ? partsById.get(step.part_id) : null
      const order = ordersById.get(row.order_id)
      const assignedMachine = machineById.get(row.machine_id)
      // Product resolution has two paths: through the part (step → part →
      // product) for normal rows, OR through the order's product_code as a
      // fallback when the step lookup fails (orphan schedule rows pointing
      // at deleted machine_steps — typically left over after a Products edit
      // destructively replaced parts). Order-path lookup keeps the row
      // useful even when the step chain is broken; we still mark it stale.
      const productFromPart = part ? productById.get(part.product_id) : null
      const productFromOrder = order ? productByCode?.get(order.product_code) : null
      const product = productFromPart || productFromOrder
      const stale = !step || !part || !productFromPart
      const customer = order ? customerByCode?.get(order.customer_code) : null
      if (stale) {
        staleSeen++
        if (sample.length < 5) {
          sample.push({
            schedule_id: row.id,
            machine_step_id: row.machine_step_id,
            order_id: row.order_id,
            order_kwit: order?.kwitasie_nr,
            step_found: !!step,
            part_found: !!part,
            product_from_part: !!productFromPart,
          })
        }
      }
      return {
        ...row,
        _step: step,
        _part: part,
        _product: product,
        _order: order,
        _stale: stale,
        // The machine that was actually picked at dispatch — may differ from
        // _step.machine_name when the step has alts and the load-balancer
        // chose a pool member other than the primary.
        _assignedMachineName: assignedMachine?.name || step?.machine_name || '—',
        _productName: product?.description || product?.code || (order?.product_code || '—'),
        _customerName: customer?.name || order?.customer_code || '—',
      }
    })
    if (staleSeen > 0) {
      // Diagnostic — surfaces which rows can't resolve. Click "Clean stale"
      // in the UI to delete them.
      console.warn(`[Schedule] ${staleSeen} stale row(s) detected. Sample:`, sample)
    }
    return result
  }, [schedule, machineStepsById, partsById, productById, productByCode, ordersById, customerByCode, machineById])

  // Stale rows visible on the current day → drives the "Clean stale" banner.
  const staleVisibleCount = useMemo(() => enrichedRows.filter((r) => r._stale && r.scheduled_date === selectedDate).length, [enrichedRows, selectedDate])
  // ANY stale row across the schedule cache. Banner shows whenever this is
  // non-zero so the user catches them even when viewing a clean day.
  const staleTotalCount = useMemo(() => enrichedRows.filter((r) => r._stale).length, [enrichedRows])

  // Jobs for selected day, grouped by machine, sorted by start_time.
  // Hidden from this view:
  //   * status='completed' — once Part Tracking marks a row done it's history
  //   * orders the boss has ticked "ready for dispatch" — the order has left
  //     the factory's active work, even if some queued rows remain
  // Per-machine progress bars still read from the unfiltered enrichedRows so
  // ahead/behind stays honest.
  const jobsByMachine = useMemo(() => {
    const byMachine = new Map()
    for (const m of deptMachines) byMachine.set(m.id, [])
    for (const row of enrichedRows) {
      if (row.scheduled_date !== selectedDate) continue
      if (row.status === 'completed') continue
      if (row._order?.ready_for_dispatch_at) continue
      const list = byMachine.get(row.machine_id)
      if (!list) continue
      list.push(row)
    }
    const plan = dayPartPlans ? dayPartPlans.get(selectedDate) : null
    const partKey = (row) => `${row.order_id}:${row._part?.id}`
    for (const [mid, list] of byMachine) {
      if (plan) {
        // Manual order active for this day: drop parts the user removed,
        // sort the remaining by their manual rank (the entry sequence),
        // then re-pack this machine's timeline so the displayed times line
        // up with that order instead of the engine's original start_time.
        const kept = list.filter((row) => !plan.removed.has(partKey(row)))
        kept.sort((a, b) => {
          const ra = plan.ranks.get(partKey(a)) ?? Infinity
          const rb = plan.ranks.get(partKey(b)) ?? Infinity
          if (ra !== rb) return ra - rb
          return a.start_time.localeCompare(b.start_time)
        })
        let usedTill = 0
        const repacked = []
        for (const row of kept) {
          const placed = placeJobOnShift(dayShift, usedTill, 0, workMinutesForJob(row))
          if (placed) {
            usedTill = placed.endMin
            repacked.push({
              ...row,
              start_time: `${String(Math.floor(placed.startMin / 60)).padStart(2, '0')}:${String(placed.startMin % 60).padStart(2, '0')}:00`,
              end_time: `${String(Math.floor(placed.endMin / 60)).padStart(2, '0')}:${String(placed.endMin % 60).padStart(2, '0')}:00`,
            })
          } else {
            repacked.push(row)
          }
        }
        byMachine.set(mid, repacked)
      } else {
        list.sort((a, b) => a.start_time.localeCompare(b.start_time))
      }
    }
    return byMachine
  }, [enrichedRows, deptMachines, selectedDate, dayPartPlans, dayShift])

  // Full day per machine INCLUDING completed rows. The worklist body (above)
  // hides completed jobs, but the per-machine bar needs them: the load is the
  // whole scheduled day, and the green "done" fill can only grow if finished
  // jobs are still counted. Without this the bar shrinks (and resets to grey)
  // every time a job is marked done — the exact "it doesn't move" complaint.
  const allJobsByMachine = useMemo(() => {
    const byMachine = new Map()
    for (const m of deptMachines) byMachine.set(m.id, [])
    for (const row of enrichedRows) {
      if (row.scheduled_date !== selectedDate) continue
      if (row._order?.ready_for_dispatch_at) continue
      const list = byMachine.get(row.machine_id)
      if (!list) continue
      list.push(row)
    }
    for (const list of byMachine.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return byMachine
  }, [enrichedRows, deptMachines, selectedDate])

  // Which days of the current week have overflow? Show a red dot on those
  // day pills. A day is overflowed if at least one of its machines is over
  // capacity (sum work-min > shift budget).
  const overflowByDay = useMemo(() => {
    const m = new Map()
    for (let d = 1; d <= 5; d++) {
      const date = isoWeekDayToDate(year, week, d)
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const shift = shiftForDate(date)
      const budget = effectiveShiftMinutes(shift)
      // Tally per machine for this date.
      const perMachine = new Map()
      for (const row of enrichedRows) {
        if (row.scheduled_date !== dateStr) continue
        const w = workMinutesForJob(row)
        perMachine.set(row.machine_id, (perMachine.get(row.machine_id) || 0) + w)
      }
      let overflowed = false
      for (const v of perMachine.values()) {
        if (v > budget) { overflowed = true; break }
      }
      if (overflowed) m.set(dateStr, true)
    }
    return m
  }, [enrichedRows, year, week])

  // Day-summary totals for the selected day.
  const daySummary = useMemo(() => {
    let jobs = 0, partsCount = 0, overflowCount = 0
    const budget = effectiveShiftMinutes(dayShift)
    for (const [, list] of jobsByMachine) {
      jobs += list.length
      let mWork = 0
      for (const j of list) {
        const tu = (j.qty != null && j.qty !== '')
          ? Number(j.qty)
          : (j._order && j._part ? (j._order.qty ?? 0) * (j._part.qty_per_unit ?? 1) : 0)
        partsCount += tu
        mWork += workMinutesForJob(j)
      }
      if (mWork > budget) overflowCount++
    }
    return { jobs, partsCount, overflowCount }
  }, [jobsByMachine, dayShift])

  // Collapse / expand helpers
  const toggleMachine = (id) => setOpenMachines((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // Visible machines = dept machines minus hidden ones, minus idle if the
  // "Only with work" toggle is on. Filtering happens here so every consumer
  // (rendering, collapse/expand, jobs-count badges) uses the same list.
  const visibleMachines = useMemo(() => {
    return deptMachines.filter((m) => {
      if (hiddenMachineIds.has(m.id)) return false
      if (onlyWithWork) {
        const jobs = jobsByMachine.get(m.id) || []
        if (jobs.length === 0) return false
      }
      return true
    })
  }, [deptMachines, hiddenMachineIds, onlyWithWork, jobsByMachine])

  // Job count per machine — used by the MachinesFilter popover dots.
  const jobCountByMachine = useMemo(() => {
    const m = new Map()
    for (const [id, list] of jobsByMachine) m.set(id, list.length)
    return m
  }, [jobsByMachine])

  // Print selection — which machines get a run sheet. We track the EXCLUDED
  // ids (empty set = print everything with work), so newly-busy machines on a
  // different day default to included without any per-day bookkeeping.
  const [printExcludedIds, setPrintExcludedIds] = useState(() => new Set())
  // Candidate machines for printing: visible + has work today.
  const printableMachines = useMemo(
    () => visibleMachines.filter((m) => (jobsByMachine.get(m.id)?.length || 0) > 0),
    [visibleMachines, jobsByMachine],
  )
  // Final list handed to the print layout.
  const printMachines = useMemo(
    () => printableMachines.filter((m) => !printExcludedIds.has(m.id)),
    [printableMachines, printExcludedIds],
  )
  const togglePrintMachine = (id) => setPrintExcludedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectAllPrint = () => setPrintExcludedIds(new Set())
  const selectNonePrint = () => setPrintExcludedIds(new Set(printableMachines.map((m) => m.id)))
  const handlePrint = () => {
    if (printMachines.length === 0) return
    window.print()
  }

  const expandAll = () => setOpenMachines(new Set(visibleMachines.map((m) => m.id)))
  const collapseAll = () => setOpenMachines(new Set())

  const toggleMachineVisibility = (id) => setHiddenMachineIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const showAllMachines = () => setHiddenMachineIds(new Set())
  const hideAllMachines = () => setHiddenMachineIds(new Set(deptMachines.map((m) => m.id)))

  // Click any action (Start / Pause / Stop / Resume) → MES Station for that
  // job. Status persistence happens inside MES Station.
  const handleJobAction = async (job, kind, units) => {
    // Build the status patch first — start/pause/stop write to Supabase and
    // local cache. The per-machine bar can then show real "actually done"
    // progress as a green sub-fill alongside the amber dot (expected), and
    // the gap between them = ahead/behind.
    let patch = null
    const nowIso = new Date().toISOString()
    if (kind === 'start') patch = { status: 'working', started_at: nowIso }
    else if (kind === 'pause') patch = { status: 'paused' }
    else if (kind === 'stop') {
      // "Done" means every part on this row is finished — so also set
      // qty_done to the row's full qty. Tracking measures completion from
      // qty_done, so without this the part would still read "not done" there
      // even though Schedule shows the row complete. This keeps the single
      // schedule table honest across both windows.
      patch = { status: 'completed', completed_at: nowIso }
      if (job.qty != null && job.qty !== '') patch.qty_done = Number(job.qty)
    } else if (kind === 'alldone') {
      // Boss "All done" on the row — same end-state as Stop, but reachable
      // without a Start → MES Station → tick-every-part round-trip. `units` is
      // the row's displayed part count, which already falls back to
      // order.qty × qty_per_unit when schedule.qty is NULL (legacy rows), so
      // Tracking reads the row as fully done either way.
      if (!isBoss) return
      patch = { status: 'completed', completed_at: nowIso }
      const n = Number(units)
      if (Number.isFinite(n) && n > 0) patch.qty_done = n
      else if (job.qty != null && job.qty !== '') patch.qty_done = Number(job.qty)
      if (!job.started_at) patch.started_at = nowIso
    }
    if (patch) {
      try {
        const updated = await setScheduleRowStatus(job.id, patch)
        applyScheduleRowUpdate(job.id, updated || patch)
      } catch (e) {
        window.alert(`Status update failed: ${e.message || String(e)}`)
        return
      }
    }

    // Start also navigates the operator into MES Station; stop/pause stay
    // on the Schedule screen so the boss can carry on marking rows.
    if (kind !== 'start') return

    // Remember the day + machine we're on so finishing the part at MES Station
    // drops us back at this exact day + machine, not today + top of the schedule
    // (see the restore effect and the day seed above).
    writeScheduleFocus('steel', job.machine_id, selectedDate)

    const order = job._order
    const customer = order ? customerByCode?.get(order.customer_code) : null
    const totalSteps = job._part ? (stepsByPart.get(job._part.id)?.length || 1) : 1
    navigate('/mes-station', {
      state: {
        orderId: order?.ord_nr || order?.kwitasie_nr || '—',
        productName: job._productName,
        customerName: customer?.name || order?.customer_code || '—',
        stepName: job._assignedMachineName || job._step?.machine_name || '—',
        stepNumber: job._step?.sequence || 1,
        totalSteps,
        standardSeconds: job._step?.seconds_per_part || 0,
        batchQty: order?.qty || 0,
        priority: order?.priority_rank ?? order?.default_priority ?? '—',
        machineName: job._assignedMachineName || job._step?.machine_name || '—',
        scheduledStart: fmtTime(job.start_time),
        scheduledEnd: fmtTime(job.end_time),
        scheduleId: job.id,
        scheduledQty: job.qty ?? order?.qty ?? 0,
        qtyAlreadyDone: job.qty_done ?? 0,
      },
    })
  }

  // Audit-only cleanup that the user can run independently of regenerate.
  const handleCleanStale = async () => {
    if (!canModify) return
    try {
      const validStepIds = new Set((machineSteps || []).map((s) => s.id))
      const removed = await cleanupOrphanScheduleRows({ validStepIds })
      // Refetch this week's schedule rows so local state matches server.
      const weekDates = workDatesOfWeek(week, year, holidaySet || new Set())
      const { data: refreshed, error: rErr } = await supabase
        .from('schedule')
        .select('id, order_id, machine_id, machine_step_id, scheduled_date, start_time, end_time, position, status, includes_setup, qty, qty_done, started_at, completed_at')
        .in('scheduled_date', weekDates)
      if (rErr) throw new Error(rErr.message)
      applyScheduleRegenerate(weekDates, (refreshed || []).filter((r) => r.status === 'queued'))
      setGenMsg(removed === 0
        ? 'No stale rows found. Schedule is clean.'
        : `Cleaned ${removed} orphan schedule row(s). Run Regenerate to refill the gaps.`)
    } catch (e) {
      setGenMsg(`Cleanup failed: ${e.message || String(e)}`)
    }
  }

  // ----- Manual job ordering (held locally until Regenerate) ---------------
  // The ▲/▼ arrows on each job row reorder that ORDER relative to its
  // neighbours on the same machine. Moves are kept in local state (per
  // machine) — NOT written to the DB per click — so you can stack up several
  // moves and see them reorder immediately, then commit them ALL at once with
  // Regenerate. Regenerate writes priority_rank and reschedules, so dependent
  // parts/assemblies follow. Pending order is tied to the day on screen, so we
  // drop it when you change day/week. Reset to pure urgency (CR) via the
  // Priority screen's "Reset to CR".
  // Pending order is scoped to the day+week on screen via viewKey — navigating
  // away naturally discards it, so a stale reordering can never be committed to
  // a different day (and no setState-in-effect needed to clear it).
  const viewKey = `${year}-${week}-${selectedDate}`
  const [pendingState, setPendingState] = useState({ key: null, map: EMPTY_PENDING })
  const pendingByMachine = pendingState.key === viewKey ? pendingState.map : EMPTY_PENDING
  const hasPending = pendingByMachine.size > 0

  // Distinct order ids in a jobs list, first-seen order.
  const distinctOrderIds = (list) => {
    const seen = new Set(); const out = []
    for (const j of list) if (j.order_id && !seen.has(j.order_id)) { seen.add(j.order_id); out.push(j.order_id) }
    return out
  }

  const moveJobOrder = (job, dir) => {
    if (!canModify || generating) return
    const mid = job.machine_id
    const baseSeq = pendingByMachine.get(mid) || distinctOrderIds(jobsByMachine.get(mid) || [])
    const idx = baseSeq.indexOf(job.order_id)
    if (idx < 0) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= baseSeq.length) {
      setGenMsg(dir === 'up' ? 'Already first on this machine.' : 'Already last on this machine.')
      return
    }
    const next = [...baseSeq]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setPendingState((prev) => {
      const base = prev.key === viewKey ? prev.map : new Map()
      return { key: viewKey, map: new Map(base).set(mid, next) }
    })
    setGenMsg(null)
  }

  // Build the week's desired scheduling order: current priority order, with any
  // pending per-machine reordering applied on top. Returns { sortedOrders,
  // rankUpdates } where sortedOrders carry their new dense priority_rank.
  const buildDesiredOrder = () => {
    const weekOrders = [...(enrichedOrders || [])].filter((o) => o.prod_week === week && o.id)
    const ids = weekOrders
      .slice()
      .sort((a, b) => {
        const p = comparePriority(a, b)
        if (p !== 0) return p
        return (b.total_minutes || 0) - (a.total_minutes || 0)
      })
      .map((o) => o.id)
    // Apply each machine's pending order: pull that machine's orders into the
    // slots they already occupy, but in the user's arranged sequence.
    for (const seq of pendingByMachine.values()) {
      const inList = seq.filter((id) => ids.includes(id))
      if (inList.length < 2) continue
      const positions = []
      ids.forEach((id, i) => { if (inList.includes(id)) positions.push(i) })
      positions.forEach((pos, k) => { ids[pos] = inList[k] })
    }
    const rankOf = new Map(ids.map((id, i) => [id, i + 1]))
    const byId = new Map(weekOrders.map((o) => [o.id, o]))
    const curById = new Map(weekOrders.map((o) => [o.id, o.priority_rank ?? null]))
    const rankUpdates = []
    ids.forEach((id, i) => { if (curById.get(id) !== i + 1) rankUpdates.push({ id, priority_rank: i + 1 }) })
    // Carry the fresh rank on each order object so the engine's tiebreak uses
    // it immediately (applyOrderUpdate is async and wouldn't be visible here).
    const sortedOrders = ids.map((id) => {
      const o = byId.get(id)
      return o ? { ...o, priority_rank: rankOf.get(id) } : null
    }).filter(Boolean)
    return { sortedOrders, rankUpdates }
  }

  const handleGenerate = async () => {
    if (!canModify || generating) return
    setGenerating(true)
    setGenMsg(null)
    try {
      // Pre-cleanup: orphan queued rows whose machine_step_id no longer
      // matches a known step. Belt-and-braces in case the FK CASCADE missed
      // some after a Products edit.
      const validStepIds = new Set((machineSteps || []).map((s) => s.id))
      const orphansRemoved = await cleanupOrphanScheduleRows({ validStepIds })

      // Desired scheduling order = current priority order (priority_rank, then
      // CR, then bottleneck minutes) with any pending ▲/▼ reordering applied.
      // Rank only reorders sequence — the day an order starts is still fixed by
      // its prod_day. Commit the pending reorder to priority_rank first so it
      // survives future regenerates.
      const { sortedOrders, rankUpdates } = buildDesiredOrder()

      if (sortedOrders.length === 0) {
        setGenMsg(`No orders found for week ${week}. Set prod_week from Priority screen first.`)
        return
      }
      if (rankUpdates.length > 0) {
        await setOrderRanks(rankUpdates)
        for (const u of rankUpdates) applyOrderUpdate(u.id, { priority_rank: u.priority_rank })
      }
      setPendingState({ key: viewKey, map: EMPTY_PENDING })
      const ordersWithIds = sortedOrders.filter((o) => o.id)
      const orderIds = ordersWithIds.map((o) => o.id)

      // Completion-aware planning: sum units already produced per (order,
      // step) from surviving schedule rows, so the engine skips finished work
      // instead of re-planning full quantities on top of it (which buried
      // ready assembly behind phantom fabrication and left machines idle).
      // Read BEFORE writeScheduleRows deletes the queued rows — completed/
      // working/paused rows survive and carry the qty_done we need.
      const doneByOrderStep = new Map()
      if (orderIds.length > 0) {
        const { data: doneRows, error: doneErr } = await supabase
          .from('schedule')
          .select('order_id, machine_step_id, qty_done')
          .in('order_id', orderIds)
        if (doneErr) throw new Error(`Reading production progress: ${doneErr.message}`)
        for (const r of (doneRows || [])) {
          const qd = r.qty_done ?? 0
          if (!r.order_id || !r.machine_step_id || qd <= 0) continue
          const k = `${r.order_id}::${r.machine_step_id}`
          doneByOrderStep.set(k, (doneByOrderStep.get(k) || 0) + qd)
        }
      }

      const { rows, summary } = buildScheduleRows({
        weekNumber: week, year,
        orders: ordersWithIds,
        partsByProductId: partsByProduct,
        stepsByPartId: stepsByPart,
        productByCode,
        machineByName,
        holidaySet: holidaySet || new Set(),
        doneByOrderStep,
      })
      const { inserted, rows: insertedRows } = await writeScheduleRows({ orderIds, rows })
      applyScheduleByOrders(orderIds, insertedRows)
      setOverflowMachineIds(new Set(summary.overflowedMachineIds))

      // Regenerate re-schedules each order's FULL quantity but keeps already
      // completed rows — so finished steps would get a duplicate queued copy.
      // Sweep those phantoms immediately so done work never reappears.
      let phantomsRemoved = 0
      try {
        const deleted = await cleanupDoneStepPhantoms({
          orders: enrichedOrders, productByCode, partsByProduct, stepsByPart, orderIds,
        })
        phantomsRemoved = deleted.length
        if (deleted.length > 0) applyScheduleReschedule({ deleted })
      } catch (e) {
        console.warn('[Schedule] phantom cleanup after regenerate skipped:', e.message || e)
      }

      const skippedTotal = Object.values(summary.skipped).reduce((a, n) => a + n, 0)
      setGenMsg(`Generated ${inserted} schedule rows for week ${week}.${orphansRemoved > 0 ? ` Cleaned ${orphansRemoved} orphan row(s).` : ''}${phantomsRemoved > 0 ? ` Removed ${phantomsRemoved} duplicate row(s) on finished work.` : ''}${skippedTotal > 0 ? ` Skipped ${skippedTotal} step(s).` : ''}`)
    } catch (e) {
      setGenMsg(`Generation failed: ${e.message || String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const shiftStartMin = timeToMin(dayShift.start)
  const shiftEndMin = timeToMin(dayShift.end)
  const isToday = selectedDate === todayStr

  const dayName = DAY_NAMES[day - 1] || ''

  // Wood runs the day-conveyor model, not the steel clock-slot worklist, so its
  // tab renders the day-board (WoodConveyorView). Steel-only chrome
  // (Regenerate/Print, DayStrip, machine cards) is hidden while wood is active.
  const isWood = dept === 'wood'

  // Department tab bar (extracted so the controls row reads cleanly).
  const deptTabsEl = (
    <div className="dept-tabs">
      {DEPT_TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className="dept-tab"
          aria-pressed={dept === id}
          onClick={() => setDept(id)}
        >
          <Icon size={12} className="ic" /> {label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <style>{styles}</style>
      <style>{printStyles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>{isWood ? 'Wood Day Schedule' : 'Machine Schedules'}</h1>
              <div className="sub">
                {isWood
                  ? 'Day 0 = production start · each machine runs on its own day · pull finished parts forward by hand'
                  : 'Daily worklist per station · jobs run top → bottom · click a job to open MES Station'}
              </div>
            </div>
            <div className="topbar-actions">
              <TopbarActions />
              <PrintPicker
                machines={printableMachines}
                excludedIds={printExcludedIds}
                onToggle={togglePrintMachine}
                onAll={selectAllPrint}
                onNone={selectNonePrint}
                jobCountById={jobCountByMachine}
                onPrint={handlePrint}
              />
              {canModify && (
                <button className={`ibtn primary ${hasPending ? 'pending-pulse' : ''}`} onClick={handleGenerate} disabled={generating}>
                  <Zap size={13} className="ic" /> {generating ? 'Generating…' : hasPending ? 'Regenerate to apply' : 'Regenerate'}
                  {hasPending && <span className="pending-dot" />}
                </button>
              )}
            </div>
          </div>

          {/* Wood: same topbar + shared day-strip + dept tabs, then the wood
              day-board for the selected date. Keeps the ribbon identical to steel. */}
          {isWood && (
            <>
              <DayStrip
                week={week}
                day={day}
                year={year}
                holidaySet={holidaySet || new Set()}
                overflowByDay={new Map()}
                onWeekChange={(w) => setWeek(Math.max(1, Math.min(53, w)))}
                onDayChange={setDay}
              />
              <div className="controls-row">{deptTabsEl}</div>
              <WoodConveyorView selectedDate={selectedDate} restoreFocus={restoreFocus} />
            </>
          )}

          {!isWood && (<>
          <DayStrip
            week={week}
            day={day}
            year={year}
            holidaySet={holidaySet || new Set()}
            overflowByDay={overflowByDay}
            onWeekChange={(w) => setWeek(Math.max(1, Math.min(53, w)))}
            onDayChange={setDay}
          />

          <div className="controls-row">
            {deptTabsEl}
            <span className="spacer" />
            <span
              className={`toggle-pill ${onlyWithWork ? 'on' : ''}`}
              onClick={() => setOnlyWithWork((v) => !v)}
              role="button"
            >
              <IOSSwitch on={onlyWithWork} onChange={setOnlyWithWork} label="Only machines with work" />
              <span className="lbl">Only with work</span>
            </span>
            <MachinesFilter
              machines={deptMachines}
              hiddenIds={hiddenMachineIds}
              onToggle={toggleMachineVisibility}
              onShowAll={showAllMachines}
              onHideAll={hideAllMachines}
              jobCountById={jobCountByMachine}
            />
            <button className="ibtn" onClick={collapseAll}><ChevronsUp size={13} className="ic" /> Collapse all</button>
            <button className="ibtn" onClick={expandAll}><ChevronsDown size={13} className="ic" /> Expand all</button>
          </div>

          <DaySummary
            shiftStart={shiftStartMin}
            shiftEnd={shiftEndMin}
            shiftBreaks={dayShift.breaks}
            nowMin={nowTick}
            isToday={isToday}
            jobsTotal={daySummary.jobs}
            partsTotal={daySummary.partsCount}
            overflowCount={daySummary.overflowCount}
          />

          {genMsg && (
            <div className="banner">
              <Zap size={15} className="ic" />
              <div>{genMsg}</div>
            </div>
          )}

          {overflowMachineIds.size > 0 && (
            <div className="banner warn">
              <AlertTriangle size={15} className="ic" />
              <div><strong>{overflowMachineIds.size} machine(s) overflowed</strong> during generation — work was pushed to a later working day. Open the affected machine to see what spilled.</div>
            </div>
          )}

          {staleTotalCount > 0 && canModify && (
            <div className="banner warn" style={{ alignItems: 'center' }}>
              <AlertTriangle size={15} className="ic" />
              <div style={{ flex: 1 }}>
                <strong>{staleTotalCount} stale row(s)</strong>
                {staleVisibleCount > 0 ? ` (${staleVisibleCount} on this day)` : ' (none on this day)'}
                {' '}reference deleted steps from a Products edit. Click Clean stale, then Regenerate to rebuild.
              </div>
              <button className="ibtn" onClick={handleCleanStale}>Clean stale</button>
            </div>
          )}

          {loading && <div className="state">Loading schedule…</div>}
          {error && <div className="state err">{error}</div>}

          {!loading && !error && (
            deptMachines.length === 0 ? (
              <div className="state">No machines for this department. Seed machines on the Import screen first.</div>
            ) : visibleMachines.length === 0 ? (
              <div className="state">
                {onlyWithWork
                  ? 'No machines have work today. Click "Only with work" to see idle stations, or hit Regenerate to dispatch this week.'
                  : 'All machines in this department are hidden. Open the Machines filter to bring some back.'}
              </div>
            ) : (
              visibleMachines.map((m) => (
                <MachineCard
                  key={m.id}
                  machine={m}
                  jobs={jobsByMachine.get(m.id) || []}
                  allJobs={allJobsByMachine.get(m.id) || []}
                  shift={dayShift}
                  open={openMachines.has(m.id)}
                  onToggle={() => toggleMachine(m.id)}
                  onJobAction={handleJobAction}
                  onReorder={moveJobOrder}
                  canReorder={canModify}
                  reordering={generating}
                  pendingSeq={pendingByMachine.get(m.id) || null}
                  nowMin={nowTick}
                  isToday={isToday}
                  isBoss={isBoss}
                />
              ))
            )
          )}
          </>)}
        </main>

        <PrintSheets
          machines={printMachines}
          jobsByMachine={jobsByMachine}
          shift={dayShift}
          dateLabel={selectedDate}
          dayName={dayName}
          weekNum={week}
        />
      </div>
    </>
  )
}
