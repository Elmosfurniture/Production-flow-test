import { useEffect, useMemo, useRef, useState } from 'react'
import TopbarActions from '../components/TopbarActions'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import QtyStepper from '../components/QtyStepper'
import { useAppData } from '../store/AppDataContext'
import {
  buildOrderTracking, distributeQtyAcrossRows, setStepQtyDone,
  rescheduleOrderLeftovers, cleanupDoneStepPhantoms,
} from '../lib/tracking'
import { buildOrderCheckpoints } from '../lib/checkpoints'
import { markReadyForDispatch } from '../lib/orders'
import { supabase } from '../lib/supabase'
import { isoWeek, isoWeekDayToDate } from '../lib/scheduling'
import {
  Hammer, Scissors, Activity, Truck, Grid, Search,
  ChevronRight, ChevronLeft, ChevronDown, Expand, Check, Minus, X, CalendarPlus, PackageCheck,
  CalendarDays,
} from 'lucide-react'

const DEFAULT_RESCHEDULE_QUICK = [
  { id: 'today', label: 'Today', dayOffset: 0 },
  { id: 'tomorrow', label: 'Tomorrow', dayOffset: 1 },
]

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
  --blue: #4677c8; --blue-soft: rgba(70,119,200,0.12);
  --purple: #8b5fbf; --purple-soft: rgba(139,95,191,0.12);
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
.main { padding: 14px 20px 26px; min-width: 0; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
.topbar h1 { font-size: 21px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.1; }
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
.search-box { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 10px; padding: 7px 11px; flex: 1 1 260px; min-width: 220px; max-width: 440px; transition: border-color 140ms ease, box-shadow 140ms ease; }
.search-box:focus-within { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-soft); }
.search-box.active { border-color: var(--navy); }
.search-box input { border: 0; background: transparent; outline: 0; font: inherit; font-size: 13px; color: var(--ink); width: 100%; }
.search-box .ic { color: var(--ink-3); flex-shrink: 0; }
.prod-day-filter { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.prod-day-filter .pd-trigger { display: inline-flex; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 10px; padding: 0 11px; height: 36px; font: inherit; font-size: 12px; font-weight: 600; color: var(--ink); cursor: pointer; box-shadow: 0 1px 2px rgba(26,29,36,0.04); white-space: nowrap; }
.prod-day-filter .pd-trigger:hover { background: var(--surface-2); }
.prod-day-filter .pd-trigger .ic { color: var(--ink-3); flex-shrink: 0; }
.prod-day-filter.active .pd-trigger { background: var(--navy-soft); border-color: rgba(31,42,68,0.28); color: var(--navy); }
.prod-day-filter.active .pd-trigger .ic { color: var(--navy); }
.prod-day-filter .pd-count { font-size: 11px; font-weight: 700; color: #fff; background: var(--navy); border-radius: 999px; padding: 1px 7px; }
.prod-day-filter .pd-clear { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-3); border-radius: 9px; width: 32px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.prod-day-filter .pd-clear:hover { background: var(--surface-2); color: var(--ink); }

.pd-pop { position: absolute; top: calc(100% + 8px); left: 0; z-index: 40; width: 284px; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 14px; box-shadow: 0 12px 32px rgba(26,29,36,0.16), 0 4px 8px rgba(26,29,36,0.06); padding: 12px; }
.pd-pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.pd-pop-head span { font-size: 13px; font-weight: 700; color: var(--ink); }
.pd-pop-head button { appearance: none; border: 0; background: var(--surface-2); color: var(--ink-2); border-radius: 8px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.pd-pop-head button:hover { background: var(--hairline-2); color: var(--ink); }
.pd-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.pd-dow { margin-bottom: 4px; }
.pd-dow-c { text-align: center; font-size: 10px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 0; }
.pd-cell { appearance: none; border: 0; background: transparent; font: inherit; font-size: 13px; color: var(--ink-2); height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.pd-cell.empty { visibility: hidden; cursor: default; }
.pd-cell:hover:not(.empty) { background: var(--surface-2); }
.pd-cell.has-work { font-weight: 700; color: var(--navy); text-decoration: underline; text-decoration-color: var(--amber); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.pd-cell.sel { background: var(--navy); color: #fff; }
.pd-cell.sel.has-work { color: #fff; text-decoration-color: rgba(255,255,255,0.75); }
.pd-pop-foot { margin-top: 10px; border-top: 1px solid var(--hairline); padding-top: 10px; }
.pd-all { width: 100%; appearance: none; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink-2); border-radius: 9px; padding: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.pd-all:hover { background: var(--surface); color: var(--ink); }
.search-box .search-count { font-size: 11px; font-weight: 600; color: var(--ink-3); white-space: nowrap; flex-shrink: 0; }
.search-box .search-clear { appearance: none; border: 0; background: var(--surface-2); color: var(--ink-3); border-radius: 999px; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; padding: 0; }
.search-box .search-clear:hover { background: var(--hairline-2); color: var(--ink); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.stat { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 8px 12px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 2px; }
.stat .l { font-size: 9px; font-weight: 700; color: var(--ink-3); letter-spacing: 0.08em; text-transform: uppercase; }
.stat .v { font-size: 18px; font-weight: 700; letter-spacing: -0.025em; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat .v small { font-size: 12px; font-weight: 500; color: var(--ink-3); margin-left: 4px; }
.stat .d { font-size: 10px; color: var(--ink-2); display: flex; align-items: center; gap: 5px; }
.stat .d .pos { color: var(--green); font-weight: 600; }
.stat .d .neg { color: var(--red); font-weight: 600; }
.stat.accent-amber { border-left: 3px solid var(--amber); }
.stat.accent-green { border-left: 3px solid var(--green); }
.stat.accent-blue { border-left: 3px solid var(--blue); }
.stat.accent-red { border-left: 3px solid var(--red); }
.ord-list { display: flex; flex-direction: column; gap: 7px; }
.ord-empty { padding: 36px 22px; text-align: center; color: var(--ink-3); font-size: 13px; background: var(--surface); border: 1px dashed var(--hairline-2); border-radius: var(--r-md); }
.ord-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: var(--shadow-card); overflow: hidden; }
.ord-head { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; padding: 8px 12px; align-items: center; cursor: pointer; background: var(--surface); transition: background 120ms ease; }
.ord-head:hover { background: var(--surface-2); }
.ord-head .pri { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; background: var(--amber-soft); color: var(--amber); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ord-head .pri.p1 { background: var(--red-soft); color: var(--red); }
.ord-head .pri.p2 { background: var(--red-soft); color: var(--red); }
.ord-head .pri.p5 { background: var(--amber-soft); color: var(--amber); }
.ord-head .info { min-width: 0; }
.ord-head .info .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ord-head .info .ord-num { font-size: 12px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.ord-head .info .name { font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.015em; }
.wk-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--blue-soft); color: var(--blue); font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; letter-spacing: 0.02em; }
.wk-chip.late { background: var(--red-soft); color: var(--red); }
.wk-chip.next { background: var(--green-soft); color: var(--green); }
.ord-head .info .meta { margin-top: 4px; font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ord-head .info .meta .sep { color: var(--hairline-2); }
.ord-head .info .meta .cust { color: var(--ink-2); font-weight: 500; }
.ord-head .info .progress { margin-top: 5px; display: flex; align-items: center; gap: 10px; }
.progress-bar { flex: 1; height: 5px; background: var(--surface-3); border-radius: 3px; overflow: hidden; position: relative; }
.progress-bar i { display: block; height: 100%; background: var(--amber); border-radius: 3px; transition: width 200ms ease; }
.progress-bar.done i { background: var(--green); }
.progress-bar.behind i { background: var(--red); }
.progress-text { font-size: 11px; font-weight: 600; color: var(--ink-2); font-variant-numeric: tabular-nums; min-width: 60px; }
.ord-head .right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ord-head .right .wkdone { font-size: 10px; font-weight: 700; color: var(--ink-3); letter-spacing: 0.06em; }
.ord-head .right .qty { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); line-height: 1.1; font-variant-numeric: tabular-nums; }
.ord-head .right .qty small { font-size: 11px; font-weight: 600; color: var(--ink-3); margin-left: 2px; }
.ord-head .chev { width: 24px; height: 24px; border-radius: 6px; color: var(--ink-3); display: flex; align-items: center; justify-content: center; transition: transform 180ms ease, background 120ms ease; }
.ord-head:hover .chev { background: var(--surface-3); color: var(--ink); }
.ord-card.expanded .ord-head .chev { transform: rotate(90deg); }
.steps { border-top: 1px solid var(--hairline); background: var(--surface-2); padding: 2px 0; display: none; }
.ord-card.expanded .steps { display: block; }
.step { display: grid; grid-template-columns: 24px 22px 1fr auto auto auto; gap: 10px; align-items: center; padding: 6px 12px 6px 44px; border-top: 1px solid var(--hairline); cursor: pointer; position: relative; transition: background 120ms ease; }
.step:first-child { border-top: 0; }
.step:hover { background: var(--surface); }
.step .ply { width: 20px; height: 20px; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: var(--ink-3); transition: transform 180ms ease; }
.step.open .ply { transform: rotate(90deg); }
.step .num { width: 20px; height: 20px; border-radius: 6px; background: var(--amber-soft); color: var(--amber); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.step.done .num { background: var(--green-soft); color: var(--green); }
.step.partial .num { background: var(--amber-soft); color: var(--amber); }
.step .label { font-size: 13px; font-weight: 500; color: var(--ink); }
.step.done .label { color: var(--ink-2); }
.step .label .badge { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; background: var(--blue-soft); color: var(--blue); font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.06em; text-transform: uppercase; vertical-align: middle; }
/* Steps-done count on the part row so the boss sees flow progress
   (e.g. 3/9 steps) without expanding the part to view its machines. */
.step .label .steps-count { display: inline-flex; align-items: center; margin-left: 10px; padding: 2px 8px; border-radius: 999px; background: var(--surface-3); color: var(--ink-2); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; vertical-align: middle; }
.step .label .steps-count.partial { background: var(--amber-soft); color: var(--amber); }
.step .label .steps-count.done { background: var(--green-soft); color: var(--green); }
.step .qty { font-size: 14px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.step .qty small { font-size: 10px; font-weight: 600; color: var(--ink-3); margin-left: 4px; letter-spacing: 0.04em; text-transform: uppercase; }
.step .status { font-size: 11px; font-weight: 600; color: var(--ink-3); display: inline-flex; align-items: center; gap: 4px; min-width: 60px; justify-content: flex-end; }
.step.done .status { color: var(--green); }
.step.partial .status { color: var(--amber); }
.step .status .check { width: 14px; height: 14px; }
.step.done { background: linear-gradient(90deg, var(--green-soft) 0%, transparent 60%); }

/* One-press "mark everything on this row done" pill (part header + each
   machine step). Toggles: fills to max, or clears back to 0 when already
   done — so no more tapping +10 until the count is full. */
.done-btn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
.done-btn:hover { background: var(--green-soft); color: var(--green); border-color: rgba(76,175,106,0.42); }
.done-btn .ic { width: 13px; height: 13px; }
.done-btn.is-done { background: var(--green-soft); color: var(--green); border-color: rgba(76,175,106,0.42); }
.done-btn.is-done:hover { background: var(--surface); color: var(--ink-3); border-color: var(--hairline-2); }
.mach-ctrl { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; }

.mach-list { background: var(--surface-3); border-top: 1px solid var(--hairline); padding: 2px 0; }
.mach-row { display: grid; grid-template-columns: 20px 1fr auto; gap: 12px; align-items: center; padding: 3px 12px 3px 88px; border-top: 1px solid var(--hairline); transition: background 120ms ease; font-size: 12px; min-height: 36px; }
.mach-row:first-child { border-top: 0; }
.mach-row:hover { background: var(--surface-2); }
.mach-row .seq { width: 20px; height: 20px; border-radius: 5px; background: rgba(31,42,68,0.08); color: var(--navy); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
.mach-row.done .seq { background: var(--green-soft); color: var(--green); }
.mach-row.partial .seq { background: var(--amber-soft); color: var(--amber); }
.mach-row .name { font-size: 12px; font-weight: 500; color: var(--ink-2); }
.mach-row.done .name { color: var(--ink-3); }
.mach-row.done { background: linear-gradient(90deg, var(--green-soft) 0%, transparent 80%); }
.mach-row .pill { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; min-width: 56px; text-align: center; background: rgba(138,142,153,0.12); color: var(--ink-3); }

.resched-pill {
  appearance: none; border: 1px solid rgba(70,119,200,0.32);
  background: var(--blue-soft); color: var(--blue);
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 10px; font-weight: 700;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  margin-top: 3px;
}
.resched-pill:hover { background: var(--blue); color: white; border-color: var(--blue); }
.resched-pill:disabled { opacity: 0.5; cursor: wait; }
.ready-pill {
  appearance: none; border: 1px solid rgba(76,175,106,0.32);
  background: var(--green-soft); color: var(--green);
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 10px; font-weight: 700;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  margin-top: 3px;
}
.ready-pill:hover { background: var(--green); color: white; border-color: var(--green); }
.ready-pill:disabled { opacity: 0.5; cursor: wait; }
.prod-done-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--green-soft); color: var(--green);
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
  letter-spacing: 0.04em; text-transform: uppercase;
}

/* ── Checkpoints ─────────────────────────────────────────────────────────
   A checkpoint is a named group of machines (set per machine on the Machines
   screen). Each chip rolls up one group for this order: how many of the parts
   that pass through those machines are completely through them. Ordered along
   the flow, so reading left → right shows how far the product has travelled. */
.cp-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 5px; }
.cp-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface-3); color: var(--ink-3); white-space: nowrap; line-height: 1.5; }
.cp-chip .n { font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.cp-chip.partial { background: var(--amber-soft); color: var(--amber); }
.cp-chip.done { background: var(--green-soft); color: var(--green); }

.rs-modal-back { position: fixed; inset: 0; background: rgba(20,24,32,0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
.rs-modal { background: var(--surface); border-radius: var(--r-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.25); max-width: 520px; width: 100%; padding: 22px 24px; max-height: 90vh; display: flex; flex-direction: column; }
.rs-modal h2 { margin: 0 0 2px; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
.rs-modal .sub { margin: 0 0 18px; color: var(--ink-2); font-size: 12px; }
.rs-modal .label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 8px; }
.rs-modal .quick-row { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.rs-modal .quick { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink-2); border-radius: 9px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.rs-modal .quick:hover { background: var(--surface); color: var(--ink); }
.rs-modal .quick.active { background: var(--navy); color: white; border-color: var(--navy); }
.rs-modal .date-input { width: 100%; border: 1px solid var(--hairline-2); background: var(--surface-2); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 14px; color: var(--ink); margin-bottom: 18px; }
.rs-modal .steps-box { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 10px; padding: 8px 12px; max-height: 220px; overflow-y: auto; margin-bottom: 18px; }
.rs-modal .steps-box .head { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; font-weight: 700; color: var(--ink-2); border-bottom: 1px solid var(--hairline); margin-bottom: 4px; }
.rs-modal .steps-box .ln { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: var(--ink); font-variant-numeric: tabular-nums; }
.rs-modal .steps-box .ln .pn { color: var(--ink-2); font-weight: 500; }
.rs-modal .steps-box .ln .mn { color: var(--ink); font-weight: 600; }
.rs-modal .steps-box .ln .ct { color: var(--amber); font-weight: 700; font-family: 'JetBrains Mono', ui-monospace, monospace; }
.rs-modal .empty { text-align: center; color: var(--ink-3); font-size: 12px; padding: 14px 0; }
.rs-modal .actions { display: flex; gap: 8px; justify-content: flex-end; }
.rs-modal .actions button { appearance: none; border: 0; border-radius: 10px; padding: 10px 18px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.rs-modal .actions .ghost { background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--hairline-2); }
.rs-modal .actions .primary { background: var(--navy); color: white; }
.rs-modal .actions .primary:disabled { opacity: 0.5; cursor: not-allowed; }
.rs-modal .err { background: var(--red-soft); color: var(--red); border: 1px solid rgba(210,83,58,0.32); border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }

.toast {
  position: fixed; bottom: 20px; right: 20px; z-index: 200;
  background: var(--red); color: white; padding: 12px 16px; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  box-shadow: 0 8px 20px rgba(210,83,58,0.35);
  display: flex; align-items: center; gap: 10px;
}
.toast button { background: transparent; border: 0; color: white; cursor: pointer; padding: 0; display: inline-flex; }

.app { display: grid; grid-template-columns: 256px 1fr; min-height: 100vh; }
@media (max-width: 1100px) { .stats { grid-template-columns: repeat(2, 1fr); } }

/* ── Phones: the desktop layout uses deep left indents (machine rows are
   inset 100px, part rows 52px) that crush the name column on a narrow
   screen, forcing machine names to wrap over several lines. Pull those
   indents back and compact the qty stepper so each name sits on one line
   and far more fits per screen. ───────────────────────────────────────── */
@media (max-width: 860px) {
  .stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  /* Search gets its own full-width row and a 16px input so iOS doesn't
     zoom in when it's focused. */
  .search-box { flex: 1 1 100%; max-width: none; order: -1; padding: 9px 12px; }
  .search-box input { font-size: 16px; }
  .ord-head { padding: 8px 10px; gap: 8px; }
  .step { padding: 6px 10px 6px 12px; gap: 8px; }
  .mach-row { padding: 4px 10px 4px 14px; gap: 8px; }
  .mach-row .name { font-size: 12px; }
  .mach-row .pill { min-width: 48px; padding: 4px 7px; }

  .qty-stepper { gap: 1px; padding: 2px; }
  .qty-stepper button { width: 26px; height: 26px; font-size: 12px; box-shadow: none; }
  .qty-stepper button.big { width: 26px; height: 26px; font-size: 9px; padding: 0 2px; }
  .qty-stepper .val-wrap { min-width: 18px; padding: 0; }
  .qty-stepper .val-wrap input { width: 20px; font-size: 13px; }
  .qty-stepper-wrap { gap: 5px; }
  .qty-stepper-wrap .of { font-size: 10px; }
}
`

const DEPT_TABS = [
  { id: 'all', label: 'All Depts', Icon: Grid },
  { id: 'steel', label: 'Steel', Icon: Hammer },
  { id: 'wood', label: 'Wood', Icon: Scissors },
  { id: 'upholstery', label: 'Upholstery', Icon: Activity },
  { id: 'dispatch', label: 'Dispatch', Icon: Truck },
]

const DEPT_ICON = { steel: Hammer, wood: Scissors, upholstery: Activity, dispatch: Truck, other: Grid }

function weekChipClass(orderProdWeek, currentWeek) {
  if (orderProdWeek == null || currentWeek == null) return ''
  if (orderProdWeek < currentWeek) return 'late'
  if (orderProdWeek === currentWeek + 1) return 'next'
  return ''
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

function todayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function MachStepRow({ stepView, onStepperChange }) {
  const allDone = stepView.qty_done >= stepView.qty && stepView.qty > 0
  const partial = stepView.qty_done > 0 && !allDone
  const cls = allDone ? 'done' : partial ? 'partial' : ''
  const hasRows = stepView.rows.length > 0
  // "Running on MES right now" → any of this step's schedule rows is in
  // 'working' state with a started_at timestamp. Warns the boss not to
  // hand-tick a number that conflicts with what the operator is actively
  // counting in MES.
  const runningOnMes = stepView.rows.some((r) => r.status === 'working' && r.started_at)
  return (
    <div className={`mach-row ${cls}`}>
      <div className="seq">{stepView.step.sequence}</div>
      <div className="name">
        {stepView.assignedMachineName || stepView.step.machine_name}
        {runningOnMes && (
          <span
            title="An operator is actively running this on MES Station — wait for them to Complete Step before ticking, or you may overwrite their count"
            style={{
              marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 999, background: 'var(--amber-soft)',
              color: 'var(--amber)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />
            Running on MES
          </span>
        )}
      </div>
      {hasRows ? (
        <div className="mach-ctrl">
          <button
            type="button"
            className={`done-btn ${allDone ? 'is-done' : ''}`}
            onClick={() => onStepperChange(stepView, allDone ? 0 : stepView.qty)}
            title={allDone ? 'Undo — set this step back to 0' : 'Mark this whole step done in one press'}
          >
            {allDone
              ? 'Undo'
              : <><Check size={13} strokeWidth={2.4} className="ic" /> Done</>}
          </button>
          <QtyStepper
            value={stepView.qty_done}
            max={stepView.qty}
            onChange={(v) => onStepperChange(stepView, v)}
            compact
            showMax
          />
        </div>
      ) : (
        <span className="pill">unsched</span>
      )}
    </div>
  )
}

function PartRow({ partView, index, defaultOpen, onStepperChange, onPartDone }) {
  // defaultOpen seeds the initial state only — don't sync it again, otherwise
  // typing the full qty (which flips defaultOpen false because nothing is
  // partial anymore) snaps the row shut while the user is still working in it.
  const [open, setOpen] = useState(defaultOpen)
  const allDone = partView.lastDone >= partView.total && partView.total > 0
  const partial = partView.lastDone > 0 && !allDone
  const cls = allDone ? 'done' : partial ? 'partial' : ''
  const hasSteps = partView.steps.length > 0
  // Only steps that actually have schedule rows can be ticked — a part with
  // no scheduled steps has nothing to mark.
  const hasSchedRows = partView.steps.some((s) => s.rows.length > 0)
  // Flow progress at a glance: how many of this part's machine steps are
  // fully complete, e.g. 3/9 — visible without expanding the part.
  const stepsTotal = partView.steps.length
  const stepsDone = partView.steps.filter((s) => s.qty > 0 && s.qty_done >= s.qty).length
  const stepsCls = stepsDone >= stepsTotal && stepsTotal > 0 ? 'done' : stepsDone > 0 ? 'partial' : ''
  return (
    <>
      <div className={`step ${cls} ${open ? 'open' : ''}`} onClick={() => hasSteps && setOpen((v) => !v)}>
        <div className="ply">{hasSteps ? <ChevronRight size={13} strokeWidth={1.8} /> : <Minus size={13} strokeWidth={1.8} />}</div>
        <div className="num">{index}</div>
        <div className="label">
          {partView.part.name}
          {partView.part.is_assembly && <span className="badge">Assembly</span>}
          {hasSteps && (
            <span className={`steps-count ${stepsCls}`} title="Machine steps completed for this part">
              {stepsDone}/{stepsTotal} steps
            </span>
          )}
        </div>
        <div className="qty">{partView.total}<small>parts</small></div>
        {hasSchedRows ? (
          <button
            type="button"
            className={`done-btn ${allDone ? 'is-done' : ''}`}
            onClick={(e) => { e.stopPropagation(); onPartDone(partView, !allDone) }}
            title={allDone ? 'Undo — set every step of this part back to 0' : 'Mark this whole part done — every machine step at once'}
          >
            {allDone
              ? 'Undo'
              : <><Check size={13} strokeWidth={2.4} className="ic" /> All done</>}
          </button>
        ) : <span />}
        <div className="status">
          {allDone ? <><Check size={13} strokeWidth={2.4} className="check" /> Done</>
            : partial ? <>{partView.lastDone}/{partView.total} <Check size={12} strokeWidth={2} /></>
            : <Minus size={14} strokeWidth={2} />}
        </div>
      </div>
      {open && hasSteps && (
        <div className="mach-list">
          {partView.steps.map((s) => (
            <MachStepRow
              key={s.step.id}
              stepView={s}
              onStepperChange={onStepperChange}
            />
          ))}
        </div>
      )}
    </>
  )
}

// One chip per checkpoint: "✓ Cutting" when every part is through the group,
// "5/7 Cutting" while it's still in progress.
function CheckpointRow({ checkpoints }) {
  if (!checkpoints || checkpoints.length === 0) return null
  return (
    <div className="cp-row">
      {checkpoints.map((c) => {
        const cls = c.complete ? 'done' : c.done > 0 ? 'partial' : ''
        return (
          <span
            key={c.name}
            className={`cp-chip ${cls}`}
            title={c.complete
              ? `${c.name} — all ${c.total} part(s) through this checkpoint`
              : `${c.name} — ${c.done} of ${c.total} part(s) through this checkpoint`}
          >
            {c.complete
              ? <Check size={10} strokeWidth={3} />
              : <span className="n">{c.done}/{c.total}</span>}
            {c.name}
          </span>
        )
      })}
    </div>
  )
}

function OrderCard({
  tracking, order, defaultOpen, currentWeek, leftoverSteps, checkpoints,
  productionComplete, markReadySaving,
  onStepperChange, onPartDone, onOpenReschedule, onMarkReady,
}) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { setOpen(defaultOpen) }, [defaultOpen])
  const pri = order.priority_rank ?? order.default_priority ?? 5
  const pct = tracking.totalUnits > 0 ? (tracking.doneUnits / tracking.totalUnits) * 100 : 0
  const isDone = tracking.doneUnits >= tracking.totalUnits && tracking.totalUnits > 0
  const isBehind = order.cr_band === 'overdue' || order.cr_band === 'urgent'
  const wkClass = weekChipClass(order.prod_week, currentWeek)
  const dept = (order.touched_departments || [])[0] || 'other'
  const DeptIcon = DEPT_ICON[dept] || Grid
  const wkLabel = order.prod_week != null ? `Wk${order.prod_week}` : 'Unscheduled'
  const wkdone = order.prod_week != null && order.prod_day != null
    ? `Wk${order.prod_week}/D${order.prod_day}`
    : 'Unscheduled'
  const leftoverCount = leftoverSteps.reduce((s, x) => s + (x.stepView.qty - x.stepView.qty_done), 0)

  return (
    <div className={`ord-card ${open ? 'expanded' : ''}`}>
      <div className="ord-head" onClick={() => setOpen((v) => !v)}>
        <div className={`pri p${pri}`}>{pri}</div>
        <div className="info">
          <div className="top">
            <span className="ord-num">O{order.ord_nr || order.kwitasie_nr || '—'}</span>
            <span className="name">{order.product_name}</span>
            <span className={`wk-chip ${wkClass}`}>
              <DeptIcon size={11} strokeWidth={1.8} />
              {wkLabel}
            </span>
            <span className="cust">· {order.customer_name}</span>
            {productionComplete && (
              <span className="prod-done-chip" title="Every machine step is complete">
                <Check size={10} strokeWidth={2.4} /> Production complete
              </span>
            )}
          </div>
          <div className="progress">
            <div className={`progress-bar ${isDone ? 'done' : isBehind ? 'behind' : ''}`}>
              <i style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="progress-text">{tracking.doneUnits}/{tracking.totalUnits} done</span>
          </div>
          <CheckpointRow checkpoints={checkpoints} />
        </div>
        <div className="right">
          <span className="wkdone">{wkdone}</span>
          <span className="qty">{order.qty}<small>parts</small></span>
          {leftoverSteps.length > 0 && (
            <button
              type="button"
              className="resched-pill"
              onClick={(e) => { e.stopPropagation(); onOpenReschedule({ order, leftoverSteps }) }}
              title="Move unfinished steps to another date"
            >
              <CalendarPlus size={11} strokeWidth={2} />
              Reschedule {leftoverCount}
            </button>
          )}
          {productionComplete && (
            <button
              type="button"
              className="ready-pill"
              onClick={(e) => { e.stopPropagation(); onMarkReady(order) }}
              disabled={markReadySaving}
              title="Move this order off Tracking into the Ready-for-Dispatch list"
            >
              <PackageCheck size={11} strokeWidth={2} />
              {markReadySaving ? 'Saving…' : 'Mark ready for dispatch'}
            </button>
          )}
        </div>
      </div>
      <div className="steps">
        {tracking.parts.length === 0 && (
          <div className="ord-empty" style={{ margin: 8, padding: '20px 14px', borderRadius: 10 }}>
            No parts defined for this product — set up the parts map first.
          </div>
        )}
        {tracking.parts.map((pt, i) => (
          <PartRow
            key={pt.part.id}
            partView={pt}
            index={i + 1}
            defaultOpen={pt.steps.some((s) => s.qty_done > 0 && s.qty_done < s.qty)}
            onStepperChange={(stepView, qty) => onStepperChange({ order, stepView, qty })}
            onPartDone={(partView, done) => onPartDone({ order, partView, done })}
          />
        ))}
      </div>
    </div>
  )
}

// "Move all unfinished steps for this order to:" + date picker. Today is the
// default — if the boss is checking in the morning, leftover work can still
// happen later today rather than being shoved to tomorrow.
function RescheduleModal({ ctx, saving, error, onClose, onConfirm }) {
  const todayIso = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const [dateStr, setDateStr] = useState(todayIso)

  const setQuick = (offsetDays) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    setDateStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const tomorrowIso = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  return (
    <div className="rs-modal-back" onClick={onClose}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reschedule unfinished work</h2>
        <p className="sub">O{ctx.order.ord_nr || ctx.order.kwitasie_nr || '—'} · {ctx.order.product_name}</p>

        <div className="label">Move to</div>
        <div className="quick-row">
          {DEFAULT_RESCHEDULE_QUICK.map((q) => (
            <button
              key={q.id}
              type="button"
              className={`quick ${dateStr === (q.dayOffset === 0 ? todayIso : tomorrowIso) ? 'active' : ''}`}
              onClick={() => setQuick(q.dayOffset)}
            >
              {q.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          className="date-input"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
        />

        <div className="label">Steps to move ({ctx.leftoverSteps.length})</div>
        <div className="steps-box">
          {ctx.leftoverSteps.length === 0 ? (
            <div className="empty">Nothing unfinished on this order.</div>
          ) : (
            <>
              <div className="head">
                <span>Part · Machine</span>
                <span>Leftover</span>
              </div>
              {ctx.leftoverSteps.map((x, i) => (
                <div key={i} className="ln">
                  <span>
                    <span className="pn">{x.partName}</span> · <span className="mn">{x.stepView.assignedMachineName || x.stepView.step.machine_name}</span>
                  </span>
                  <span className="ct">{x.stepView.qty - x.stepView.qty_done} of {x.stepView.qty}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {error && <div className="err">{error}</div>}

        <div className="actions">
          <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="primary"
            onClick={() => onConfirm(dateStr)}
            disabled={saving || ctx.leftoverSteps.length === 0}
          >
            {saving ? 'Rescheduling…' : `Reschedule ${ctx.leftoverSteps.length} step(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

const CAL_WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CAL_MO_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CAL_MO_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const CAL_DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Custom production-day picker. A native <input type=date> can't be styled, so
// this is a small month calendar whose days WITH work are underlined (amber).
// value = '' (all) or 'YYYY-MM-DD'. countByDate = Map<dateStr, orderCount>.
function ProdDayPicker({ value, onChange, countByDate }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const firstWorkDate = () => {
    const keys = [...countByDate.keys()].sort()
    return keys.length ? new Date(keys[0] + 'T00:00:00') : new Date()
  }
  const [view, setView] = useState(() => {
    const base = value ? new Date(value + 'T00:00:00') : firstWorkDate()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const openCal = () => {
    const base = value ? new Date(value + 'T00:00:00') : firstWorkDate()
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const y = view.getFullYear()
  const m = view.getMonth()
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const triggerLabel = value
    ? (() => { const d = new Date(value + 'T00:00:00'); return `${CAL_WD_SHORT[d.getDay()]} ${d.getDate()} ${CAL_MO_SHORT[d.getMonth()]}` })()
    : 'Production day'

  return (
    <div className={`prod-day-filter ${value ? 'active' : ''}`} ref={ref}>
      <button type="button" className="pd-trigger" onClick={() => (open ? setOpen(false) : openCal())} title="Filter by production day">
        <CalendarDays size={14} strokeWidth={1.8} className="ic" />
        {triggerLabel}
        {value && <span className="pd-count">{countByDate.get(value) || 0}</span>}
      </button>
      {value && (
        <button type="button" className="pd-clear" onClick={() => onChange('')} aria-label="Clear production-day filter">
          <X size={14} strokeWidth={2.2} />
        </button>
      )}
      {open && (
        <div className="pd-pop">
          <div className="pd-pop-head">
            <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <span>{CAL_MO_FULL[m]} {y}</span>
            <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
          <div className="pd-grid pd-dow">
            {CAL_DOW.map((d) => <span key={d} className="pd-dow-c">{d}</span>)}
          </div>
          <div className="pd-grid">
            {cells.map((d, i) => {
              if (d == null) return <span key={i} className="pd-cell empty" />
              const ds = isoOf(new Date(y, m, d))
              const cnt = countByDate.get(ds) || 0
              const isSel = ds === value
              return (
                <button
                  key={i}
                  type="button"
                  className={`pd-cell ${cnt > 0 ? 'has-work' : ''} ${isSel ? 'sel' : ''}`}
                  onClick={() => { onChange(ds); setOpen(false) }}
                  title={cnt > 0 ? `${cnt} order(s) in production` : 'No orders'}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div className="pd-pop-foot">
            <button type="button" className="pd-all" onClick={() => { onChange(''); setOpen(false) }}>All production days</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TrackingScreen() {
  const {
    enrichedOrders, partsByProduct, stepsByPart, productByCode, machineByName, machines,
    schedule, holidaySet,
    applyScheduleRowUpdate, applyScheduleReschedule, applyOrderUpdate,
  } = useAppData()
  // machine_id → machine row, used so the tracking view shows the SPECIFIC
  // machine the load-balancer assigned (may differ from step.machine_name
  // when alts are defined).
  const machineById = useMemo(() => new Map((machines || []).map((m) => [m.id, m])), [machines])

  const [dept, setDept] = useDeptTab('tracking')
  const [query, setQuery] = useState('')
  // Production-day filter — '' (all) or a picked calendar date 'YYYY-MM-DD'.
  const [prodDate, setProdDate] = useState('')
  const [expandSignal, setExpandSignal] = useState({ all: false, at: 0 })
  const [rescheduleCtx, setRescheduleCtx] = useState(null)
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
  const [rescheduleError, setRescheduleError] = useState(null)
  const [markReadyId, setMarkReadyId] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  // Per-step debounce timers + latest pending qty, keyed by machine_step_id.
  const pendingByStep = useRef({})

  const currentWeek = useMemo(() => isoWeekOf(new Date()), [])
  const today = useMemo(() => todayDateStr(), [])

  // Auto-heal: once data is loaded, sweep out phantom queued rows left on
  // finished steps by an earlier over-scheduling Regenerate (the bug where
  // "done" parts still showed on the Schedule). Runs once per mount, silently.
  const healedRef = useRef(false)
  useEffect(() => {
    if (healedRef.current) return
    if (!enrichedOrders?.length || !schedule?.length) return
    healedRef.current = true
    ;(async () => {
      try {
        const deleted = await cleanupDoneStepPhantoms({
          orders: enrichedOrders, productByCode, partsByProduct, stepsByPart,
        })
        if (deleted.length > 0) applyScheduleReschedule({ deleted })
      } catch (e) {
        console.warn('[Tracking] phantom cleanup skipped:', e.message || e)
      }
    })()
  }, [enrichedOrders, schedule, productByCode, partsByProduct, stepsByPart, applyScheduleReschedule])

  // Index: schedule rows by `${order_id}:${machine_step_id}` for O(1) lookup.
  const scheduleByOrderStep = useMemo(() => {
    const m = new Map()
    for (const r of schedule) {
      if (!r.order_id || !r.machine_step_id) continue
      const k = `${r.order_id}:${r.machine_step_id}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return m
  }, [schedule])

  // Base filter chain (status / dispatch / dept / search). Shared by both the
  // production-day filter options AND the final list, so the day dropdown shows
  // accurate counts for the current dept + search.
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enrichedOrders
      .filter((o) => o.status !== 'completed')
      // Final-ticked orders move to Dashboard's Ready-for-Dispatch + Dispatch
      // calendar. Tracking is for in-progress work only.
      .filter((o) => !o.ready_for_dispatch_at)
      .filter((o) => {
        if (dept === 'all') return true
        return (o.touched_departments || []).includes(dept)
      })
      .filter((o) => {
        if (!q) return true
        // Tracking-only search. Match everything an operator might type to find
        // an order/product fast: the order number they SEE on the card (ord_nr),
        // the import id (kwitasie_nr), product code + name, customer, AND the
        // individual part names inside the product — so searching a part finds
        // its order.
        const product = productByCode.get(o.product_code)
        const parts = product ? (partsByProduct.get(product.id) || []) : []
        const hay = [
          o.ord_nr, o.kwitasie_nr, o.product_code, o.product_name, o.customer_name,
          ...parts.map((p) => p.name),
        ]
        return hay.some((v) => String(v ?? '').toLowerCase().includes(q))
      })
  }, [enrichedOrders, dept, query, productByCode, partsByProduct])

  const prodYear = useMemo(() => new Date().getFullYear(), [])

  // An order's planned production date as 'YYYY-MM-DD' (from prod_week/prod_day),
  // or null when it has no planned day. Used to match the picked calendar date.
  const orderProdDate = (o) => {
    if (o.prod_week == null || o.prod_day == null) return null
    const d = isoWeekDayToDate(prodYear, o.prod_week, o.prod_day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Production dates present in the current view → calendar bounds + per-day
  // counts (how many orders fall on the picked day).
  const prodDateMeta = useMemo(() => {
    const countByDate = new Map()
    for (const o of baseFiltered) {
      const ds = orderProdDate(o)
      if (!ds) continue
      countByDate.set(ds, (countByDate.get(ds) || 0) + 1)
    }
    const all = [...countByDate.keys()].sort()
    return { countByDate, min: all[0] || '', max: all[all.length - 1] || '' }
  }, [baseFiltered, prodYear])

  const visible = useMemo(() => {
    let list = baseFiltered
    if (prodDate) list = list.filter((o) => orderProdDate(o) === prodDate)
    return list
      .map((o) => {
        const product = productByCode.get(o.product_code)
        const parts = product ? (partsByProduct.get(product.id) || []) : []
        const tracking = buildOrderTracking({
          order: o, parts, stepsByPart, scheduleByOrderStep, machineById,
        })
        const checkpoints = buildOrderCheckpoints({ tracking, machineByName })
        return { order: o, tracking, checkpoints }
      })
      .sort((a, b) => {
        const aCr = a.order.cr ?? Infinity
        const bCr = b.order.cr ?? Infinity
        return aCr - bCr
      })
  }, [baseFiltered, prodDate, prodYear, productByCode, partsByProduct, stepsByPart, scheduleByOrderStep, machineById, machineByName])

  const stats = useMemo(() => {
    const ordersActive = visible.length
    let stepsTotal = 0
    let stepsDone = 0
    let completedToday = 0
    let behind = 0
    for (const { order, tracking } of visible) {
      for (const pt of tracking.parts) {
        for (const s of pt.steps) {
          stepsTotal += 1
          if (s.qty_done >= s.qty && s.qty > 0) stepsDone += 1
          for (const r of s.rows) {
            if (r.status === 'completed' && r.completed_at && r.completed_at.slice(0, 10) === today) {
              completedToday += 1
            }
          }
        }
      }
      if (order.cr_band === 'overdue' || order.cr_band === 'urgent') behind += 1
    }
    return { ordersActive, stepsTotal, stepsDone, completedToday, behind }
  }, [visible, today])

  const expandAll = () => setExpandSignal({ all: true, at: Date.now() })
  const collapseAll = () => setExpandSignal({ all: false, at: Date.now() })

  // Optimistic stepper change: patch local cache instantly, debounce the
  // server write so spamming +1 ten times = one round trip, not ten.
  const handleStepperChange = ({ stepView, qty }) => {
    const rows = stepView.rows
    const patches = distributeQtyAcrossRows(rows, qty)
    for (const p of patches) applyScheduleRowUpdate(p.id, p)

    const key = stepView.step.id
    const pending = pendingByStep.current[key]
    if (pending?.timer) clearTimeout(pending.timer)
    pendingByStep.current[key] = {
      qty,
      rows, // kept so a reschedule can force-flush this write first
      timer: setTimeout(async () => {
        try {
          const results = await setStepQtyDone({ rows, totalQtyDone: qty })
          for (const r of results) applyScheduleRowUpdate(r.id, r)
        } catch (e) {
          setToastMsg(e.message || String(e))
        } finally {
          delete pendingByStep.current[key]
        }
      }, 450),
    }
  }

  // One-press "mark this whole part done" — fills (or clears, on undo) every
  // scheduled machine step of the part at once, reusing the same debounced
  // per-step write path so it's optimistic + batched like the ± pill.
  const handlePartDone = ({ partView, done }) => {
    for (const sv of partView.steps) {
      if (sv.rows.length === 0) continue
      handleStepperChange({ stepView: sv, qty: done ? sv.qty : 0 })
    }
  }

  // Force every still-debounced stepper write to land NOW and wait for them.
  // Called before a reschedule so the DB's qty_done reflects exactly what the
  // user ticked — otherwise the reschedule could move work that's really done.
  const flushPendingStepWrites = async () => {
    const entries = Object.entries(pendingByStep.current)
    for (const [key, p] of entries) {
      if (p.timer) clearTimeout(p.timer)
      try {
        const results = await setStepQtyDone({ rows: p.rows, totalQtyDone: p.qty })
        for (const r of results) applyScheduleRowUpdate(r.id, r)
      } catch (e) {
        setToastMsg(e.message || String(e))
      } finally {
        delete pendingByStep.current[key]
      }
    }
  }

  // Order-level reschedule: pick a date in the modal, then walk every
  // unfinished step of the order and run rescheduleStep on each. We do a full
  // schedule reload after the loop (success or failure) — a mid-flight error
  // can leave the DB partially mutated (some steps closed out + new rows
  // inserted, others not), so the safest thing is to re-pull the truth from
  // Supabase rather than guess at patches.
  const handleMarkReady = async (order) => {
    setMarkReadyId(order.id)
    try {
      const updated = await markReadyForDispatch(order.id)
      applyOrderUpdate(order.id, updated)
      setToastMsg(`O${order.ord_nr || order.kwitasie_nr || ''} is ready for dispatch.`)
    } catch (e) {
      setToastMsg(e.message || String(e))
    } finally {
      setMarkReadyId(null)
    }
  }

  // Order-level reschedule: hand the whole leftover-step list to the new
  // helper, which places them all in one pass — respecting step sequence
  // within each part AND assembly-waits-for-non-assembly. Reload after, so
  // any partial failure resyncs the cache to reality.
  const handleConfirmReschedule = async (dateStr) => {
    if (!rescheduleCtx) return
    setRescheduleSaving(true)
    setRescheduleError(null)
    let caught = null
    let inserted = []
    let skipped = []
    let unmappable = []
    try {
      // Make sure any just-ticked ± changes are saved before we decide what's
      // unfinished — the reschedule re-reads the DB, so this must land first.
      await flushPendingStepWrites()
      const result = await rescheduleOrderLeftovers({
        order: rescheduleCtx.order,
        leftoverSteps: rescheduleCtx.leftoverSteps,
        targetDate: dateStr,
        machineByName,
        partsByProduct,
        productByCode,
        holidaySet,
      })
      applyScheduleReschedule(result)
      inserted = result.inserted || []
      skipped = result.skipped || []
      unmappable = result.unmappable || []
    } catch (e) {
      caught = e
    } finally {
      // No reload() — applyScheduleReschedule above already patched the
      // schedule cache surgically (deleted ids, updated rows, inserted
      // rows). Falling through to the modal-close logic snaps the UI
      // instantly instead of waiting on a full table refetch.
      setRescheduleSaving(false)
    }
    if (caught) {
      setRescheduleError(caught.message || String(caught))
    } else if (inserted.length === 0 && unmappable.length === 0) {
      // Nothing happened — usually means every step's machine was missing or
      // every step was already fully done. Don't pretend success.
      setRescheduleError('Nothing was moved. Check that each step\'s machine exists in the Machines screen.')
    } else {
      setRescheduleCtx(null)
      // Date-range so the user knows which Schedule day(s) to open.
      const dates = [...new Set(inserted.map((r) => r.scheduled_date))].sort()
      const dateNote = dates.length === 0
        ? 'no new rows'
        : dates.length === 1
        ? dates[0]
        : `${dates[0]} → ${dates[dates.length - 1]}`
      const skipNote = skipped.length > 0 ? ` · ${skipped.length} didn't fit (pick a later date)` : ''
      const unmapNote = unmappable.length > 0
        ? ` · ${unmappable.length} step(s) skipped: missing machine (${unmappable.map((u) => u.machine).join(', ')})`
        : ''
      // Save the earliest landing date so Schedule auto-jumps to that day
      // on next visit. Cleared once consumed so it only fires once.
      if (dates[0]) {
        try { sessionStorage.setItem('schedule:jumpToDate', dates[0]) } catch (_) {}
        // Sync orders.prod_week + prod_day to where the work actually
        // landed — otherwise the order's "planned" prod date keeps showing
        // its original value across Dashboard / Priority / Week Plan while
        // the schedule rows are in a different week. Fire-and-forget;
        // failure here doesn't break the reschedule itself.
        const d = new Date(dates[0] + 'T00:00:00')
        const newProdWeek = isoWeek(d)
        const dow = d.getDay() === 0 ? 7 : d.getDay()
        const newProdDay = dow > 5 ? null : dow
        try {
          const { data } = await supabase
            .from('orders')
            .update({ prod_week: newProdWeek, prod_day: newProdDay })
            .eq('id', rescheduleCtx.order.id)
            .select('id, prod_week, prod_day')
            .single()
          if (data) applyOrderUpdate(rescheduleCtx.order.id, data)
        } catch (_) { /* swallow */ }
      }
      setToastMsg(`Moved ${inserted.length} row(s) to ${dateNote}.${skipNote}${unmapNote}`)
    }
  }

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Part Tracking</h1>
              <div className="sub">Use the ± pill to record what's done — when ready, click Reschedule on an order to move its leftovers to a chosen date</div>
            </div>
            <div className="topbar-actions">
              <TopbarActions />
            </div>
          </div>

          <div className="filter-bar">
            <div className="dept-tabs">
              {DEPT_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className="dept-tab"
                  aria-pressed={dept === id}
                  onClick={() => setDept(id)}
                >
                  <Icon size={12} strokeWidth={1.8} className="ic" />
                  {label}
                </button>
              ))}
            </div>
            <ProdDayPicker
              value={prodDate}
              onChange={setProdDate}
              countByDate={prodDateMeta.countByDate}
            />
            <div className={`search-box ${query ? 'active' : ''}`}>
              <Search size={14} strokeWidth={1.8} className="ic" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search product, part, order #, customer…"
                aria-label="Search tracking"
              />
              {query && (
                <>
                  <span className="search-count">{visible.length} match{visible.length === 1 ? '' : 'es'}</span>
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                </>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <button className="ibtn" onClick={expandAll}><Expand size={12} strokeWidth={1.8} className="ic" /> Expand All</button>
            <button className="ibtn" onClick={collapseAll}><ChevronDown size={12} strokeWidth={1.8} className="ic" /> Collapse All</button>
          </div>

          <div className="stats">
            <div className="stat accent-blue">
              <div className="l">Orders Active</div>
              <div className="v">{stats.ordersActive}</div>
              <div className="d">{dept === 'all' ? 'across all depts' : `in ${DEPT_TABS.find((t) => t.id === dept)?.label || dept}`}</div>
            </div>
            <div className="stat accent-amber">
              <div className="l">Steps Done</div>
              <div className="v">{stats.stepsDone}<small>/ {stats.stepsTotal}</small></div>
              <div className="d">{stats.stepsTotal > 0 ? `${Math.round((stats.stepsDone / stats.stepsTotal) * 100)}% completed` : '—'}</div>
            </div>
            <div className="stat accent-green">
              <div className="l">Completed Today</div>
              <div className="v">{stats.completedToday}</div>
              <div className="d">schedule rows finished</div>
            </div>
            <div className="stat accent-red">
              <div className="l">Behind Schedule</div>
              <div className="v">{stats.behind}</div>
              <div className="d">{stats.behind > 0 ? <span className="neg">overdue + urgent</span> : 'on track'}</div>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="ord-empty">
              No active orders match these filters. Try a different department or clear the search.
            </div>
          ) : (
            <div className="ord-list">
              {visible.map(({ order, tracking, checkpoints }, i) => {
                const leftoverSteps = []
                for (const pt of tracking.parts) {
                  for (const sv of pt.steps) {
                    if (sv.rows.length > 0 && sv.qty_done < sv.qty) {
                      leftoverSteps.push({ stepView: sv, partName: pt.part.name })
                    }
                  }
                }
                // Production complete = the order has parts AND every part is
                // fully through its last machine step.
                const productionComplete = tracking.parts.length > 0
                  && tracking.parts.every((pt) => pt.total > 0 && pt.lastDone >= pt.total)
                return (
                  <OrderCard
                    key={order.id}
                    order={order}
                    tracking={tracking}
                    defaultOpen={query.trim() ? true : (expandSignal.at ? expandSignal.all : i < 2)}
                    currentWeek={currentWeek}
                    leftoverSteps={leftoverSteps}
                    checkpoints={checkpoints}
                    productionComplete={productionComplete}
                    markReadySaving={markReadyId === order.id}
                    onStepperChange={handleStepperChange}
                    onPartDone={handlePartDone}
                    onOpenReschedule={setRescheduleCtx}
                    onMarkReady={handleMarkReady}
                  />
                )
              })}
            </div>
          )}
        </main>
      </div>
      {rescheduleCtx && (
        <RescheduleModal
          ctx={rescheduleCtx}
          saving={rescheduleSaving}
          error={rescheduleError}
          onClose={() => { if (!rescheduleSaving) { setRescheduleCtx(null); setRescheduleError(null) } }}
          onConfirm={handleConfirmReschedule}
        />
      )}
      {toastMsg && (
        <div className="toast">
          {toastMsg}
          <button onClick={() => setToastMsg(null)}><X size={16} /></button>
        </div>
      )}
    </>
  )
}
