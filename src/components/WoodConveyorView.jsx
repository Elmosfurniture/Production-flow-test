import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAppData } from '../store/AppDataContext'
import { buildWoodConveyor } from '../lib/woodDayEngine'
import { loadWoodStartOverrides, WOOD_START_EVENT } from '../lib/orderDeptStart'
import { loadWoodJobStatus, setWoodJobStatus, woodJobKeyOf, WOOD_JOB_STATUS_EVENT } from '../lib/woodJobStatus'
import { loadAllDayPlans, PARTS_DAY_EVENT } from '../lib/partsDayPlan'
import { writeScheduleFocus } from '../lib/useDeptTab'
import { shiftForDate, timeToMin } from '../lib/scheduleEngine'
import {
  ChevronRight, AlertTriangle, Coffee, Filter, Check,
  Trees, ArrowRight, ChevronsDown, ChevronsUp,
  LayoutGrid, Route, Play, Pause, Square,
} from 'lucide-react'

// Reusable wood day-conveyor body. Rendered inside the Schedule screen's "Wood"
// department tab (and anywhere else the wood view is needed). Read-only preview
// of the wood day-conveyor: a Day 0–4 strip, a machine filter, and collapsible
// machine cards whose rows are packed into the real shift. Does NOT touch the
// live schedule / the database.
//
// All styles are scoped under `.wcv` so they never collide with the host
// screen's own styles (Schedule defines its own `.machine-card`, `.row`, etc.).

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI']

const styles = `
.wcv { min-width: 0; }
.wcv .preview-banner { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-2); background: var(--blue-soft, rgba(70,119,200,0.12)); border: 1px solid rgba(70,119,200,0.2); border-radius: 12px; padding: 9px 14px; margin-bottom: 12px; }
.wcv .preview-banner .ic { color: var(--blue, #4677c8); flex-shrink: 0; }

/* Day strip ──────────────────────────────────────────────── */
.wcv .day-strip { display: inline-flex; align-items: stretch; gap: 4px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; padding: 6px; margin-bottom: 12px; box-shadow: var(--shadow-card); width: fit-content; max-width: 100%; }
.wcv .day-strip .nav { width: 38px; border: 0; background: transparent; color: var(--ink-2); cursor: pointer; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; transition: background 120ms, color 120ms; }
.wcv .day-strip .nav:hover:not(:disabled) { background: var(--surface-2); color: var(--navy); }
.wcv .day-strip .nav:disabled { opacity: 0.3; cursor: not-allowed; }
.wcv .day-strip .week-pill { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 14px; border-radius: 12px; background: var(--navy); color: white; min-width: 60px; line-height: 1.05; }
.wcv .day-strip .week-pill .wk { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.75; }
.wcv .day-strip .week-pill .wn { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.wcv .day-strip .day-pill { appearance: none; border: 0; background: transparent; cursor: pointer; padding: 8px 16px; border-radius: 12px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; color: var(--ink-2); transition: background 120ms, color 120ms; position: relative; min-width: 78px; }
.wcv .day-strip .day-pill:hover { background: var(--surface-2); }
.wcv .day-strip .day-pill .dn { font-size: 13px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
.wcv .day-strip .day-pill .dd { font-size: 10px; font-weight: 700; color: var(--ink-3); letter-spacing: 0.02em; }
.wcv .day-strip .day-pill[aria-pressed="true"] { background: var(--amber); box-shadow: 0 4px 12px rgba(232,154,60,0.35); }
.wcv .day-strip .day-pill[aria-pressed="true"] .dn { color: white; }
.wcv .day-strip .day-pill[aria-pressed="true"] .dd { color: rgba(255,255,255,0.85); }
.wcv .day-strip .day-pill.holiday .dn { color: var(--red); }
.wcv .day-strip .day-pill .dot { position: absolute; top: 6px; right: 12px; width: 7px; height: 7px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 2px var(--surface); }

/* Controls row ─────────────────────────────────────────────── */
.wcv .controls-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.wcv .spacer { flex: 1; }
.wcv .ios-switch { width: 38px; height: 22px; border-radius: 999px; background: rgba(120,120,128,0.32); border: 0; padding: 2px; cursor: pointer; display: inline-flex; align-items: center; transition: background 180ms; flex-shrink: 0; }
.wcv .ios-switch.on { background: var(--green); }
.wcv .ios-switch .knob { width: 18px; height: 18px; border-radius: 50%; background: white; box-shadow: 0 1px 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.18); transition: transform 200ms cubic-bezier(0.32,0.72,0,1); }
.wcv .ios-switch.on .knob { transform: translateX(16px); }
.wcv .toggle-pill { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 999px; padding: 5px 12px 5px 14px; cursor: pointer; user-select: none; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.wcv .toggle-pill .lbl { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.wcv .mini-btn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.wcv .mini-btn:hover { background: var(--surface-2); }
.wcv .mini-btn .ic { width: 13px; height: 13px; color: var(--ink-3); }

/* Machines filter */
.wcv .filter-wrap { position: relative; }
.wcv .filter-btn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.wcv .filter-btn:hover { background: var(--surface-2); }
.wcv .filter-btn.has-filter { background: var(--amber-soft); border-color: rgba(232,154,60,0.4); color: var(--amber); }
.wcv .filter-btn .badge { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.wcv .filter-btn.has-filter .badge { background: var(--amber); color: white; }
.wcv .filter-popover { position: absolute; top: calc(100% + 8px); left: 0; z-index: 30; min-width: 280px; max-height: 440px; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 14px; box-shadow: 0 12px 32px rgba(26,29,36,0.16); overflow: hidden; }
.wcv .filter-popover .pop-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--hairline); background: var(--surface-2); }
.wcv .filter-popover .pop-head .ttl { font-size: 12px; font-weight: 700; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.06em; }
.wcv .filter-popover .pop-head .actions { display: flex; gap: 6px; }
.wcv .filter-popover .pop-head button { appearance: none; border: 0; background: transparent; color: var(--navy); font: inherit; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.wcv .filter-popover .pop-list { overflow-y: auto; padding: 4px 0; }
.wcv .filter-popover .pop-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; user-select: none; }
.wcv .filter-popover .pop-item:hover { background: var(--surface-2); }
.wcv .filter-popover .pop-item .cbx { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--hairline-2); background: var(--surface); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wcv .filter-popover .pop-item.checked .cbx { background: var(--navy); border-color: var(--navy); color: white; }
.wcv .filter-popover .pop-item .lbl { font-size: 13px; color: var(--ink); font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wcv .filter-popover .pop-item .daytag { font-size: 9px; font-weight: 700; color: var(--blue, #4677c8); background: var(--blue-soft, rgba(70,119,200,0.12)); padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
.wcv .filter-popover .pop-item .jobcount { font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; flex-shrink: 0; min-width: 14px; text-align: right; }

/* Warnings */
.wcv .warns { background: var(--surface); border: 1px solid rgba(210,83,58,0.25); border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; }
.wcv .warns h4 { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: var(--red); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.wcv .warns ul { margin: 0; padding-left: 18px; }
.wcv .warns li { font-size: 12px; color: var(--ink-2); margin-bottom: 3px; }

.wcv .state { padding: 48px 16px; text-align: center; color: var(--ink-3); font-size: 13px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; }

/* Setup prompt */
.wcv .setup { background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; box-shadow: var(--shadow-card); padding: 36px 28px; text-align: center; max-width: 620px; margin: 8px auto; }
.wcv .setup .badge { width: 52px; height: 52px; border-radius: 16px; background: var(--green-soft); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px; }
.wcv .setup .badge .ic { color: var(--green); }
.wcv .setup h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--ink); }
.wcv .setup p { margin: 0 0 8px; font-size: 13px; color: var(--ink-2); line-height: 1.5; }
.wcv .setup .prog { font-size: 13px; font-weight: 600; color: var(--ink); margin: 12px 0; }
.wcv .setup .prog b { color: var(--amber); }
.wcv .setup .names { font-size: 12px; color: var(--ink-3); background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 10px; padding: 10px 12px; margin: 12px auto 4px; text-align: left; max-width: 480px; }
.wcv .setup .names b { color: var(--ink-2); display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.wcv .setup .cta { display: inline-flex; align-items: center; gap: 7px; margin-top: 16px; background: var(--navy); color: white; text-decoration: none; font-size: 13px; font-weight: 600; padding: 11px 18px; border-radius: 11px; box-shadow: 0 6px 14px rgba(31,42,68,0.22); }
.wcv .setup .cta .ic { color: white; }

/* Machine card ──────────────────────────────────────────── */
.wcv .machine-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; margin-bottom: 10px; box-shadow: var(--shadow-card); overflow: hidden; position: relative; }
.wcv .machine-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--stripe, var(--ink-3)); }
.wcv .machine-card.idle::before { opacity: 0.35; }
.wcv .machine-card.overflowed { border-color: rgba(210,83,58,0.4); box-shadow: 0 0 0 1px rgba(210,83,58,0.15), var(--shadow-card); }
.wcv .mc-head { display: grid; grid-template-columns: 18px 1fr auto auto auto; gap: 18px; align-items: center; padding: 16px 22px 16px 26px; cursor: pointer; user-select: none; }
.wcv .mc-head .chev { color: var(--ink-3); transition: transform 180ms; flex-shrink: 0; }
.wcv .machine-card.open .mc-head .chev { transform: rotate(90deg); }
.wcv .mc-head .name-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wcv .mc-head .name { font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 8px; }
.wcv .mc-head .name .daytag { font-size: 9px; font-weight: 700; color: var(--blue, #4677c8); background: var(--blue-soft, rgba(70,119,200,0.12)); padding: 2px 7px; border-radius: 4px; letter-spacing: 0.04em; flex-shrink: 0; }
.wcv .mc-head .substats { font-size: 10px; color: var(--ink-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; }
.wcv .mc-head .substats .idle-tag { font-style: italic; text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 11px; }
.wcv .mc-head .num-stack { display: flex; align-items: baseline; gap: 14px; }
.wcv .mc-head .num-stack .num { display: flex; flex-direction: column; align-items: flex-end; line-height: 1; gap: 3px; }
.wcv .mc-head .num-stack .num .v { font-size: 18px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.wcv .mc-head .num-stack .num .v.muted { color: var(--ink-3); }
.wcv .mc-head .num-stack .num .k { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.wcv .mc-head .mini-progress { width: 160px; height: 8px; background: var(--surface-3); border-radius: 999px; position: relative; overflow: visible; }
.wcv .mc-head .mini-progress .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--stripe, var(--navy)); border-radius: 999px; }
.wcv .mc-head .mini-progress.over .fill { background: var(--red); }
/* Green "actually done" overlay + amber "where it should be by now" dot — same
   as the steel schedule bar, so wood reads identically. */
.wcv .mc-head .mini-progress .actual-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--green); border-radius: 999px; z-index: 2; box-shadow: 0 1px 2px rgba(0,0,0,0.12); transition: width 400ms ease; }
.wcv .mc-head .mini-progress .now-dot { position: absolute; top: -7px; width: 10px; height: 10px; border-radius: 50%; background: var(--amber); transform: translateX(-50%); box-shadow: 0 2px 6px rgba(232,154,60,0.55), 0 0 0 2px var(--surface); z-index: 3; }
.wcv .mc-head .mini-progress .now-dot::after { content: ''; position: absolute; left: 50%; top: 100%; transform: translateX(-50%); width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid currentColor; color: var(--amber); }
.wcv .mc-head .mini-progress .now-dot.status-good { background: var(--green); box-shadow: 0 2px 6px rgba(52,199,89,0.55), 0 0 0 2px var(--surface); }
.wcv .mc-head .mini-progress .now-dot.status-good::after { color: var(--green); }
.wcv .mc-head .mini-progress .now-dot.status-warn { background: var(--amber); }
.wcv .mc-head .mini-progress .now-dot.status-warn::after { color: var(--amber); }
.wcv .mc-head .mini-progress .now-dot.status-bad { background: var(--red); box-shadow: 0 2px 6px rgba(210,83,58,0.55), 0 0 0 2px var(--surface); }
.wcv .mc-head .mini-progress .now-dot.status-bad::after { color: var(--red); }
.wcv .mc-head .mini-progress .now-dot.status-neutral { background: var(--ink-3); }
.wcv .mc-head .mini-progress .now-dot.status-neutral::after { color: var(--ink-3); }
.wcv .mc-head .num-stack .num.done .v { color: var(--green); }
.wcv .mc-head .num-stack .num.done .v .of { font-size: 11px; font-weight: 600; color: var(--ink-3); }
.wcv .mc-head .num-stack .num.done.none .v { color: var(--ink-3); }
.wcv .mc-head .over-badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; background: var(--red); color: white; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
.wcv .mc-body { display: none; border-top: 1px solid var(--hairline); }
.wcv .machine-card.open .mc-body { display: block; }
.wcv .empty-row { padding: 18px 22px; font-size: 12px; color: var(--ink-3); font-style: italic; }

/* Rows ──────────────────────────────────────────────────── */
.wcv .row { display: grid; grid-template-columns: 26px 24px 92px 84px 1fr auto auto; gap: 14px; align-items: center; padding: 12px 18px 12px 22px; }
.wcv .row + .row { border-top: 1px solid var(--hairline); }
.wcv .row:hover { background: var(--surface-2); }
.wcv .row.st-working { background: var(--green-soft); }
.wcv .row.st-completed { opacity: 0.6; }
.wcv .row .reorder { width: 26px; }
.wcv .row .ord-pri .pri { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.wcv .action { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); font: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: filter 140ms, transform 140ms, box-shadow 200ms; min-width: 96px; justify-content: center; letter-spacing: -0.01em; }
.wcv .action:hover { filter: brightness(0.98); transform: translateY(-1px); }
.wcv .action.start { background: linear-gradient(180deg, #3fd66c 0%, #2bb058 100%); border-color: #2bb058; color: white; box-shadow: 0 0 0 4px rgba(52,199,89,0.16), 0 6px 16px rgba(52,199,89,0.45), inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.06); }
.wcv .action.pause { background: linear-gradient(180deg, #efa756 0%, #d8862e 100%); border-color: #d8862e; color: white; min-width: 78px; box-shadow: 0 4px 10px rgba(232,154,60,0.35), inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(0,0,0,0.05); }
.wcv .action.stop { background: linear-gradient(180deg, #df6a52 0%, #c44529 100%); border-color: #c44529; color: white; min-width: 72px; box-shadow: 0 4px 10px rgba(210,83,58,0.35), inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(0,0,0,0.05); }
.wcv .action.done { background: var(--surface-2); color: var(--ink-3); cursor: default; box-shadow: none; }
.wcv .action-pair { display: inline-flex; gap: 6px; justify-self: end; }
.wcv .row .seq { width: 22px; height: 22px; border-radius: 6px; background: var(--amber-soft); color: var(--amber); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
.wcv .row .when { font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.15; }
.wcv .row .when .dash { color: var(--ink-3); margin-right: 2px; }
.wcv .row .ord-pri { display: flex; flex-direction: column; gap: 2px; }
.wcv .row .ord-pri .ord { font-size: 13px; font-weight: 700; color: var(--stripe, var(--navy)); }
.wcv .row .ord-pri .carry { font-size: 8px; color: var(--amber); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; display: inline-flex; align-items: center; gap: 3px; }
.wcv .row .info { min-width: 0; }
.wcv .row .info .part { font-size: 14px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; line-height: 1.2; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; }
.wcv .row .info .asm-tag { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 5px; background: var(--blue-soft, rgba(70,119,200,0.12)); color: var(--blue, #4677c8); font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; flex-shrink: 0; }
.wcv .row .info .meta { font-size: 11px; color: var(--ink-3); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.wcv .row .info .meta .prod-tag { color: var(--ink-2); font-weight: 600; }
.wcv .row .info .meta .setup-tag { color: var(--amber); font-weight: 600; }
.wcv .row .parts { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 84px; }
.wcv .row .parts .count { font-size: 30px; font-weight: 700; color: var(--stripe, var(--ink)); line-height: 0.95; font-variant-numeric: tabular-nums; letter-spacing: -0.025em; }
.wcv .row .parts .rate-label { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 5px; font-variant-numeric: tabular-nums; }
.wcv .row .parts .rate-label .sep { color: var(--hairline-2); margin: 0 4px; font-weight: 400; }

.wcv .break-row { display: grid; grid-template-columns: 50px 92px 1fr auto; gap: 14px; align-items: center; padding: 10px 18px 10px 22px; background: var(--surface-2); }
.wcv .break-row + .row, .wcv .row + .break-row, .wcv .break-row + .break-row { border-top: 1px solid var(--hairline); }
.wcv .break-row .ic { color: var(--ink-3); }
.wcv .break-row .when { font-size: 12px; font-weight: 600; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.wcv .break-row .label { font-size: 11px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.wcv .break-row .duration { font-size: 11px; color: var(--ink-3); font-weight: 600; font-variant-numeric: tabular-nums; }

@media (max-width: 860px) {
  .wcv .mc-head { grid-template-columns: 18px 1fr auto; gap: 12px; padding: 14px 14px 14px 18px; }
  .wcv .mc-head .num-stack, .wcv .mc-head .mini-progress { display: none; }
  .wcv .row { grid-template-columns: 24px 84px 1fr; }
  .wcv .row .ord-pri, .wcv .row .parts { display: none; }
}

/* Segmented view toggle */
.wcv .seg { display: inline-flex; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 12px; padding: 3px; gap: 2px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(26,29,36,0.04); }
.wcv .seg button { appearance: none; border: 0; background: transparent; font: inherit; font-size: 12px; font-weight: 600; color: var(--ink-2); padding: 7px 14px; border-radius: 9px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.wcv .seg button.active { background: var(--navy); color: white; }

/* Per-job offset chip */
.wcv .dayoff-chip { font-size: 9px; font-weight: 800; color: var(--green); background: var(--green-soft); padding: 1px 6px; border-radius: 5px; letter-spacing: 0.03em; flex-shrink: 0; }

/* Orders route ribbon */
.wcv .ribbon-order { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; box-shadow: var(--shadow-card); padding: 14px 16px; margin-bottom: 10px; }
.wcv .ribbon-order.over { border-color: rgba(210,83,58,0.4); box-shadow: 0 0 0 1px rgba(210,83,58,0.12), var(--shadow-card); }
.wcv .ro-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.wcv .ro-head .ord { font-size: 15px; font-weight: 800; color: var(--navy); letter-spacing: -0.01em; }
.wcv .ro-head .prod { font-size: 13px; font-weight: 600; color: var(--ink); }
.wcv .ro-head .cust { font-size: 12px; color: var(--ink-3); }
.wcv .ro-head .grow { flex: 1; }
.wcv .ro-head .tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 6px; background: var(--surface-2); color: var(--ink-2); }
.wcv .ro-head .tag.pull { background: var(--amber-soft); color: var(--amber); }
.wcv .ro-head .tag.over { background: var(--red); color: white; }
.wcv .ro-track { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; align-items: stretch; }
.wcv .ro-day { min-width: 128px; flex-shrink: 0; border: 1px solid var(--hairline); border-radius: 10px; background: var(--surface-2); padding: 8px; display: flex; flex-direction: column; gap: 5px; }
.wcv .ro-day.gap { background: transparent; border-style: dashed; opacity: 0.55; align-items: center; justify-content: center; min-width: 74px; }
.wcv .ro-day .dh { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); display: flex; justify-content: space-between; gap: 6px; margin-bottom: 1px; }
.wcv .ro-day .dh .off { color: var(--green); }
.wcv .ro-step { font-size: 11px; font-weight: 600; color: var(--ink); background: var(--surface); border: 1px solid var(--hairline); border-radius: 7px; padding: 4px 7px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wcv .ro-step .m { font-weight: 700; }
.wcv .ro-step .u { color: var(--ink-3); font-variant-numeric: tabular-nums; }
.wcv .ro-step.asm { background: var(--blue-soft, rgba(70,119,200,0.12)); border-color: transparent; color: var(--blue, #4677c8); }
.wcv .ro-gap-label { font-size: 9px; color: var(--ink-3); font-style: italic; text-align: center; line-height: 1.3; }
`

// ---------- helpers ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const strToDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const minLabel = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const durationLabel = (a, b) => {
  const t = b - a, h = Math.floor(t / 60), m = t % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}
// Work-minutes a single wood job represents (parts × rate + setup). Used to
// grow the green "done" fill and place the amber "should be here by now" dot.
const jobWorkMin = (j) => Math.max(1, Math.round(((j.units || 0) * (j.seconds_per_part || 0)) / 60) + (j.setupMin || 0))
function buildTimeline(jobs, shift) {
  const items = []
  for (const j of jobs) items.push({ type: 'job', startMin: j.startMin, endMin: j.endMin, data: j })
  for (const b of shift.breaks) items.push({ type: 'break', startMin: timeToMin(b.start), endMin: timeToMin(b.end), label: b.label })
  items.sort((a, b) => a.startMin - b.startMin)
  return items
}

function IOSSwitch({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`ios-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  )
}

function MachinesFilter({ machines, hidden, onToggle, onAll, onNone, jobCountByName, dayByName }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  const visible = machines.length - hidden.size
  return (
    <div className="filter-wrap" ref={ref}>
      <button type="button" className={`filter-btn ${hidden.size > 0 ? 'has-filter' : ''}`} onClick={() => setOpen((o) => !o)}>
        <Filter size={13} /> Machines <span className="badge">{visible}/{machines.length}</span>
      </button>
      {open && (
        <div className="filter-popover">
          <div className="pop-head">
            <span className="ttl">Show machines</span>
            <div className="actions"><button onClick={onAll}>All</button><button onClick={onNone}>None</button></div>
          </div>
          <div className="pop-list">
            {machines.map((name) => {
              const checked = !hidden.has(name)
              return (
                <div key={name} className={`pop-item ${checked ? 'checked' : ''}`} onClick={() => onToggle(name)}>
                  <span className="cbx">{checked && <Check size={12} strokeWidth={3} />}</span>
                  <span className="lbl">{name}</span>
                  {dayByName.get(name) != null && <span className="daytag" title="Route rank">R{dayByName.get(name)}</span>}
                  <span className="jobcount">{jobCountByName.get(name) || 0}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function JobRow({ job, sequence, status, onAction }) {
  const dur = durationLabel(job.startMin, job.endMin)
  const orderLabel = job.ord_nr ? `#${job.ord_nr}` : '—'
  const showProd = job.partName !== job.productName && job.productName
  const st = status?.status || 'queued'
  let actionEl
  if (st === 'working') {
    actionEl = (
      <span className="action-pair">
        <button className="action pause" onClick={() => onAction?.(job, 'pause')}><Pause size={11} /> Pause</button>
        <button className="action stop" onClick={() => onAction?.(job, 'stop')}><Square size={11} /> Stop</button>
      </span>
    )
  } else if (st === 'paused') {
    actionEl = <button className="action start" onClick={() => onAction?.(job, 'start')}><Play size={11} /> Resume</button>
  } else if (st === 'completed') {
    actionEl = <button className="action done" disabled>Done</button>
  } else {
    actionEl = <button className="action start" onClick={() => onAction?.(job, 'start')}><Play size={11} /> Start</button>
  }
  return (
    <div className={`row st-${st}`}>
      <span className="reorder" />
      <span className="seq">{sequence}</span>
      <div className="when">
        {minLabel(job.startMin)}<br />
        <span className="dash">→</span> {minLabel(job.endMin)}
      </div>
      <div className="ord-pri">
        <span className="ord">{orderLabel}</span>
        <span className="pri">{job.carried ? 'From prev day' : `Day +${job.offset ?? 0}`}</span>
      </div>
      <div className="info">
        <div className="part">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.partName}</span>
          {job.isAssembly && <span className="asm-tag" title="Assembly — waits for all other parts">ASM</span>}
        </div>
        <div className="meta">
          {showProd && <><span className="prod-tag">{job.productName}</span> · </>}
          {job.customerName || '—'} · Step {job.stepSeq} · {dur}
          {job.setupMin > 0 && <span className="setup-tag"> · +{job.setupMin}m setup</span>}
        </div>
      </div>
      <div className="parts">
        <span className="count">{job.units}</span>
        <span className="rate-label">
          {status?.qty_done > 0 && (<><span style={{ color: 'var(--green)', fontWeight: 700 }}>{status.qty_done} DONE</span><span className="sep">·</span></>)}
          {job.split ? `OF ${job.splitTotal} SPLIT` : 'PARTS'}
          <span className="sep">·</span>{job.seconds_per_part}S/PT
        </span>
      </div>
      {onAction ? actionEl : <span />}
    </div>
  )
}

function BreakRow({ startMin, endMin, label }) {
  return (
    <div className="break-row">
      <Coffee size={13} className="ic" />
      <span className="when">{minLabel(startMin)}–{minLabel(endMin)}</span>
      <span className="label">{label}</span>
      <span className="duration">{durationLabel(startMin, endMin)}</span>
    </div>
  )
}

function MachineCard({ machineName, color, rank, dayPlan, open, onToggle, onJobAction, statusMap, nowMin }) {
  const jobs = dayPlan?.jobs || []
  const date = dayPlan?._date
  const isIdle = jobs.length === 0
  const totalParts = jobs.reduce((s, j) => s + (j.units || 0), 0)
  const totalWorkMin = dayPlan?.totalWorkMin || 0
  const capacity = dayPlan?.capacity || 0
  const pct = capacity > 0 ? Math.min(100, (totalWorkMin / capacity) * 100) : 0
  const overflowed = !!dayPlan?.overflowed
  const shift = useMemo(() => (jobs.length ? shiftForDate(strToDate(dayPlan._date)) : null), [jobs, dayPlan])
  const items = useMemo(() => (shift ? buildTimeline(jobs, shift) : []), [jobs, shift])

  // How many of this machine's jobs are finished today (from the wood job
  // status store), + the work-minutes actually done, for the green fill.
  const statusOf = (j) => statusMap?.get(woodJobKeyOf(j.orderId, j.stepId, date))
  const doneJobs = useMemo(
    () => jobs.filter((j) => statusOf(j)?.status === 'completed').length,
    [jobs, statusMap, date],
  )
  const actualDoneMin = useMemo(() => {
    let done = 0
    for (const j of jobs) {
      const wmin = jobWorkMin(j)
      const st = statusMap?.get(woodJobKeyOf(j.orderId, j.stepId, date))
      if (st?.status === 'completed') done += wmin
      else if ((st?.qty_done ?? 0) > 0 && (j.units || 0) > 0) done += wmin * (st.qty_done / j.units)
      else if (st?.status === 'working' && st.started_at) {
        const startedMs = new Date(st.started_at).getTime()
        if (!isNaN(startedMs)) done += Math.min(wmin, Math.max(0, (Date.now() - startedMs) / 60000))
      }
    }
    return done
  }, [jobs, statusMap, date])
  // Where this machine SHOULD be by the current clock-time (amber dot).
  const expectedDoneMin = useMemo(() => {
    if (nowMin == null || jobs.length === 0) return null
    let done = 0
    for (const j of jobs) {
      const wmin = jobWorkMin(j)
      if (j.endMin <= nowMin) done += wmin
      else if (j.startMin < nowMin) {
        const span = Math.max(1, j.endMin - j.startMin)
        done += wmin * ((nowMin - j.startMin) / span)
      }
    }
    return done
  }, [jobs, nowMin])
  const actualPct = capacity > 0 ? Math.min(100, (actualDoneMin / capacity) * 100) : 0
  const nowMarkerPct = (expectedDoneMin != null && capacity > 0) ? Math.min(100, (expectedDoneMin / capacity) * 100) : null
  const trackStatus = useMemo(() => {
    if (expectedDoneMin == null || expectedDoneMin <= 0) return 'neutral'
    if (actualDoneMin >= expectedDoneMin) return 'good'
    const gap = expectedDoneMin - actualDoneMin
    if (gap > Math.max(15, totalWorkMin * 0.10)) return 'bad'
    return 'warn'
  }, [actualDoneMin, expectedDoneMin, totalWorkMin])

  return (
    <div data-schedmc={machineName} className={`machine-card ${open ? 'open' : ''} ${overflowed ? 'overflowed' : ''} ${isIdle ? 'idle' : ''}`} style={{ '--stripe': color }}>
      <div className="mc-head" onClick={onToggle}>
        <ChevronRight size={16} className="chev" />
        <div className="name-block">
          <span className="name">{machineName}{rank != null && <span className="daytag" title="This machine's route rank (nominal stage). Jobs below show each order's own day-offset.">Rank {rank}</span>}</span>
          <span className="substats">
            {isIdle ? <span className="idle-tag">No work this day</span> : <>{jobs.length} job{jobs.length === 1 ? '' : 's'} · <b style={{ color: doneJobs > 0 ? 'var(--green)' : 'var(--ink-3)' }}>{doneJobs} done</b> · {totalParts} parts · {totalWorkMin} of {capacity} min</>}
          </span>
        </div>
        <div className="num-stack">
          <div className="num"><span className={`v ${isIdle ? 'muted' : ''}`}>{jobs.length}</span><span className="k">Jobs</span></div>
          <div className="num"><span className={`v ${isIdle ? 'muted' : ''}`}>{totalParts}</span><span className="k">Parts</span></div>
          <div className={`num done ${doneJobs === 0 ? 'none' : ''}`}>
            <span className="v">{doneJobs}<span className="of">/{jobs.length}</span></span>
            <span className="k">Done</span>
          </div>
        </div>
        <div className={`mini-progress ${overflowed ? 'over' : ''}`} title={`${totalWorkMin} / ${capacity} min · done: ${Math.round(actualDoneMin)}${expectedDoneMin != null ? ` · expected: ${Math.round(expectedDoneMin)}` : ''}`}>
          <div className="fill" style={{ width: `${pct}%` }} />
          {actualPct > 0 && (
            <div className="actual-fill" style={{ width: `${Math.max(actualPct, 3)}%` }} />
          )}
          {nowMarkerPct != null && (
            <div className={`now-dot status-${trackStatus}`} style={{ left: `${nowMarkerPct}%` }} title={trackStatus === 'good' ? 'On track or ahead' : trackStatus === 'warn' ? 'Slightly behind' : trackStatus === 'bad' ? 'Behind schedule' : 'Where this machine should be by now'} />
          )}
        </div>
        {overflowed ? <span className="over-badge"><AlertTriangle size={11} /> Over</span> : <span style={{ width: 0 }} />}
      </div>
      {open && (
        <div className="mc-body">
          {isIdle ? (
            <div className="empty-row">No work on this machine this day.</div>
          ) : (
            (() => {
              let seq = 0
              return items.map((it, i) => {
                if (it.type === 'job') {
                  seq++
                  const jobKey = woodJobKeyOf(it.data.orderId, it.data.stepId, dayPlan._date)
                  return (
                    <JobRow
                      key={`j${i}`}
                      job={it.data}
                      sequence={seq}
                      status={statusMap?.get(jobKey)}
                      onAction={onJobAction ? (job, kind) => onJobAction(job, kind, dayPlan._date, machineName) : undefined}
                    />
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

// Per-order route ribbon: one card per order, a horizontal strip of its own
// day 0…N. A skipped middle offset (a route "jump") shows as a dashed gap.
function OrdersRibbon({ orders }) {
  if (!orders || orders.length === 0) {
    return <div className="state">No wood orders to route yet. Check that active orders have a ship/Due date and a wood route.</div>
  }
  const sorted = [...orders].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
  return (
    <div>
      {sorted.map((o) => {
        const byOff = new Map()
        for (const r of o.route) {
          if (!byOff.has(r.offset)) byOff.set(r.offset, [])
          byOff.get(r.offset).push(r)
        }
        const maxOff = o.route.length ? Math.max(...o.route.map((r) => r.offset)) : 0
        return (
          <div key={o.orderId ?? o.ord_nr} className={`ribbon-order ${o.over ? 'over' : ''}`}>
            <div className="ro-head">
              <span className="ord">{o.ord_nr ? `#${o.ord_nr}` : '—'}</span>
              <span className="prod">{o.productName}</span>
              <span className="cust">{o.customerName || '—'} · {o.qty}×</span>
              <span className="grow" />
              <span className="tag">{o.leadDays}-day route</span>
              {o.pulledDays > 0 && <span className="tag pull">Started {o.pulledDays}d early</span>}
              {o.over && <span className="tag over">Over capacity</span>}
            </div>
            <div className="ro-track">
              {Array.from({ length: maxOff + 1 }, (_, off) => {
                const cells = byOff.get(off)
                if (!cells) {
                  return (
                    <div key={off} className="ro-day gap">
                      <span className="ro-gap-label">day +{off}<br />skipped</span>
                    </div>
                  )
                }
                const dd = strToDate(cells[0].dateStr)
                return (
                  <div key={off} className="ro-day">
                    <div className="dh">
                      <span>{DAY_NAMES[dd.getDay() - 1]} {dd.getDate()} {MON[dd.getMonth()]}</span>
                      <span className="off">+{off}</span>
                    </div>
                    {cells.map((c, ci) => (
                      <div key={ci} className={`ro-step ${c.isAssembly ? 'asm' : ''}`} title={`${c.machine} · ${c.partName} · ${c.units} parts`}>
                        <span className="m">{c.machine}</span> <span className="u">· {c.units}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function WoodConveyorView({ selectedDate, restoreFocus }) {
  const {
    orders, machines: allMachines, loading, error,
    productByCode, partsByProduct, stepsByPart, machineByName, customerByCode, holidaySet,
    bufferDaysByDept,
  } = useAppData()

  // Re-read the per-order wood-start overrides whenever they change (e.g. after
  // the order form saves a manual wood start), so the board reflects it live.
  const [startsVer, setStartsVer] = useState(0)
  useEffect(() => {
    const bump = () => setStartsVer((v) => v + 1)
    window.addEventListener(WOOD_START_EVENT, bump)
    return () => window.removeEventListener(WOOD_START_EVENT, bump)
  }, [])
  // Re-read the "Sort parts for the day" plan (order + removed parts) so the
  // day-board's sequence + contents match what was set in the modal.
  const [plansVer, setPlansVer] = useState(0)
  useEffect(() => {
    const bump = () => setPlansVer((v) => v + 1)
    window.addEventListener(PARTS_DAY_EVENT, bump)
    return () => window.removeEventListener(PARTS_DAY_EVENT, bump)
  }, [])

  const woodSetup = useMemo(() => {
    const wood = (allMachines || []).filter((m) => m.department === 'wood')
    return { total: wood.length, set: wood.filter((m) => m.wood_day != null).length }
  }, [allMachines])

  const activeOrders = useMemo(
    () => (orders || []).filter((o) => o.status !== 'completed' && !o.shipped_at),
    [orders],
  )

  const result = useMemo(() => buildWoodConveyor({
    orders: activeOrders,
    productByCode, partsByProduct, stepsByPart, machineByName, customerByCode, holidaySet,
    bufferDaysByDept,
    deptStartOverrides: loadWoodStartOverrides(),
    partDayPlans: loadAllDayPlans('wood'),
  }), [activeOrders, productByCode, partsByProduct, stepsByPart, machineByName, customerByCode, holidaySet, bufferDaysByDept, startsVer, plansVer])

  const [view, setView] = useState('machines')
  const [hidden, setHidden] = useState(new Set())
  const [onlyWithWork, setOnlyWithWork] = useState(true)
  // Seed the open card with the machine the operator was working on before an
  // MES Station round-trip, so on return it's already expanded and Schedule's
  // restore effect can scroll it into view. Fresh opens start all-collapsed.
  const [openCards, setOpenCards] = useState(() => (
    restoreFocus && restoreFocus.view === 'wood' && restoreFocus.key
      ? new Set([restoreFocus.key])
      : new Set()
  ))
  const [showWarns, setShowWarns] = useState(false)

  const navigate = useNavigate()
  // Live wood-job status (Start/Pause/Done), re-read when it changes anywhere
  // (including when the MES Station writes back on Complete).
  const [statusVer, setStatusVer] = useState(0)
  useEffect(() => {
    const bump = () => setStatusVer((v) => v + 1)
    window.addEventListener(WOOD_JOB_STATUS_EVENT, bump)
    return () => window.removeEventListener(WOOD_JOB_STATUS_EVENT, bump)
  }, [])
  const statusMap = useMemo(() => loadWoodJobStatus(), [statusVer])

  // Live wall-clock minute, so the "where it should be by now" dot on each
  // machine bar moves through the day without a refresh (matches steel).
  const [nowTick, setNowTick] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })
  useEffect(() => {
    const id = setInterval(() => { const n = new Date(); setNowTick(n.getHours() * 60 + n.getMinutes()) }, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Start / Pause / Done on a wood part. Start also opens the MES Station timer
  // for that part (like steel); MES writes the status back locally on Complete.
  const handleJobAction = (job, kind, jobDate, machineName) => {
    const jobKey = woodJobKeyOf(job.orderId, job.stepId, jobDate)
    const nowIso = new Date().toISOString()
    if (kind === 'pause') { setWoodJobStatus(jobKey, { status: 'paused' }); return }
    if (kind === 'stop') { setWoodJobStatus(jobKey, { status: 'completed', completed_at: nowIso, qty_done: job.units }); return }
    // start / resume
    setWoodJobStatus(jobKey, { status: 'working', started_at: nowIso })
    // Remember which machine we're on so finishing the part at MES Station drops
    // us back at this machine, not the top of the wood day board (Schedule's
    // restore effect scrolls to the matching data-schedmc card on mount).
    writeScheduleFocus('wood', machineName, selectedDate)
    navigate('/mes-station', {
      state: {
        orderId: job.ord_nr || '—',
        productName: job.productName,
        customerName: job.customerName || '—',
        stepName: machineName || job.machine || '—',
        stepNumber: job.stepSeq || 1,
        totalSteps: 1,
        standardSeconds: job.seconds_per_part || 0,
        batchQty: job.units || 0,
        machineName: machineName || job.machine || '—',
        scheduleId: null,
        scheduledQty: job.units || 0,
        qtyAlreadyDone: statusMap.get(jobKey)?.qty_done || 0,
        woodJobKey: jobKey,
      },
    })
  }

  // Driven by the parent's shared day-strip (Schedule screen) — one date at a time.
  const dateStr = selectedDate || null

  const dayByName = useMemo(() => {
    const m = new Map()
    for (const mach of (allMachines || [])) if (mach.department === 'wood') m.set(mach.name, mach.wood_day)
    return m
  }, [allMachines])

  const { cards, jobCountByName, filterList } = useMemo(() => {
    if (!dateStr) return { cards: [], jobCountByName: new Map(), filterList: [] }
    const jobCount = new Map()
    const withWork = []
    for (const [name, mach] of result.machines) {
      const plan = mach.days.get(dateStr)
      if (plan) { jobCount.set(name, plan.jobs.length); withWork.push({ name, mach, plan }) }
    }
    const idleForDay = []
    for (const [name, wd] of dayByName) {
      if (!jobCount.has(name)) {
        idleForDay.push({ name, mach: { color: (allMachines.find((x) => x.name === name)?.color) || '#9aa0ad', rank: wd }, plan: null })
      }
    }
    let list = onlyWithWork ? withWork : [...withWork, ...idleForDay]
    list = list.filter((c) => !hidden.has(c.name))
    list.sort((a, b) => {
      const ad = a.mach.rank ?? 99, bd = b.mach.rank ?? 99
      if (ad !== bd) return ad - bd
      return a.name.localeCompare(b.name)
    })
    const flNames = new Set([...withWork.map((c) => c.name)])
    for (const c of idleForDay) flNames.add(c.name)
    const filterList = [...flNames].sort()
    return { cards: list, jobCountByName: jobCount, filterList }
  }, [result, dateStr, onlyWithWork, hidden, dayByName, allMachines])

  const toggleCard = (name) => setOpenCards((prev) => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n
  })
  const expandAll = () => setOpenCards(new Set(cards.map((c) => c.name)))
  const collapseAll = () => setOpenCards(new Set())

  const dayTotals = useMemo(() => {
    let jobs = 0, parts = 0, over = 0
    for (const c of cards) {
      if (!c.plan) continue
      jobs += c.plan.jobs.length
      parts += c.plan.jobs.reduce((s, j) => s + (j.units || 0), 0)
      if (c.plan.overflowed) over++
    }
    return { jobs, parts, over }
  }, [cards])

  const uniqueWarns = useMemo(() => {
    const seen = new Set(), out = []
    if (result.unassigned.size > 0) {
      const names = [...result.unassigned].sort()
      out.push(`${names.length} machine${names.length === 1 ? '' : 's'} still need a day (Machines → Wood): ${names.join(', ')}`)
    }
    for (const w of result.warnings) {
      if (w.type === 'unassigned') continue
      if (seen.has(w.message)) continue
      seen.add(w.message); out.push(w.message)
    }
    return out
  }, [result])

  return (
    <div className="wcv">
      <style>{styles}</style>

      {loading && <div className="state">Loading…</div>}
      {error && <div className="state" style={{ color: 'var(--red)' }}>Failed to load: {error}</div>}

      {!loading && !error && woodSetup.set === 0 && (
        <div className="setup">
          <span className="badge"><Trees size={26} strokeWidth={1.8} className="ic" /></span>
          <h3>Set up the wood day numbers</h3>
          <p>Each wood machine needs a day number — how many days after Day 0 (production start) it runs: 0 = first day, 1 = next day, up to 4. Set them on the Machines screen before the day-board can lay out the work.</p>
          <div className="prog">You've set <b>0</b> of {woodSetup.total} wood machines.</div>
          {result.unassigned.size > 0 && (
            <div className="names">
              <b>Machines your current orders use</b>
              {[...result.unassigned].sort().join(', ')}
            </div>
          )}
          <NavLink to="/machines" className="cta">Open Machines <ArrowRight size={15} className="ic" /></NavLink>
        </div>
      )}

      {!loading && !error && woodSetup.set > 0 && (
        <>
          {/* Controls row — mirrors the steel schedule's controls, with the
              by-machine/day ⇄ by-order-route toggle in the open space. */}
          <div className="controls-row">
            <div className="seg" style={{ marginBottom: 0 }}>
              <button className={view === 'machines' ? 'active' : ''} onClick={() => setView('machines')}><LayoutGrid size={13} /> By machine / day</button>
              <button className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}><Route size={13} /> By order route</button>
            </div>
            {view === 'machines' && (
              <MachinesFilter
                machines={filterList}
                hidden={hidden}
                onToggle={(name) => setHidden((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })}
                onAll={() => setHidden(new Set())}
                onNone={() => setHidden(new Set(filterList))}
                jobCountByName={jobCountByName}
                dayByName={dayByName}
              />
            )}
            {view === 'machines' && (
              <div className="toggle-pill" onClick={() => setOnlyWithWork((v) => !v)}>
                <IOSSwitch on={onlyWithWork} onChange={setOnlyWithWork} />
                <span className="lbl">Only with work</span>
              </div>
            )}
            <div className="spacer" />
            {view === 'machines' && (
              <>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>
                  <b style={{ color: 'var(--ink)' }}>{dayTotals.jobs}</b> jobs · <b style={{ color: 'var(--ink)' }}>{dayTotals.parts}</b> parts
                  {dayTotals.over > 0 && <span style={{ color: 'var(--red)' }}> · {dayTotals.over} over</span>}
                </span>
                <button className="mini-btn" onClick={expandAll}><ChevronsDown size={13} className="ic" /> Expand</button>
                <button className="mini-btn" onClick={collapseAll}><ChevronsUp size={13} className="ic" /> Collapse</button>
              </>
            )}
          </div>

          {/* Warnings (collapsed) */}
          {uniqueWarns.length > 0 && (
            <div className="warns">
              <h4 onClick={() => setShowWarns((v) => !v)}>
                <AlertTriangle size={14} /> {uniqueWarns.length} issue{uniqueWarns.length === 1 ? '' : 's'} to review {showWarns ? '▲' : '▼'}
              </h4>
              {showWarns && <ul>{uniqueWarns.slice(0, 20).map((t, i) => <li key={i}>{t}</li>)}</ul>}
            </div>
          )}

          {view === 'orders' ? (
            <OrdersRibbon orders={result.orders} />
          ) : !dateStr ? (
            <div className="state">Pick a day on the strip above.</div>
          ) : cards.length === 0 ? (
            <div className="state">No wood work on this day. Use the week/day strip above to find the days that have wood work.</div>
          ) : (
            cards.map((c) => (
              <MachineCard
                key={c.name}
                machineName={c.name}
                color={c.mach.color}
                rank={c.mach.rank}
                dayPlan={c.plan ? { ...c.plan, _date: dateStr } : null}
                open={openCards.has(c.name)}
                onToggle={() => toggleCard(c.name)}
                onJobAction={handleJobAction}
                statusMap={statusMap}
                nowMin={nowTick}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}
