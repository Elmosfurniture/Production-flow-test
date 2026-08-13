import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import QtyStepper from '../components/QtyStepper'
import { setScheduleRowQtyDone } from '../lib/tracking'
import { setScheduleRowStatus } from '../lib/scheduleStatus'
import { setWoodJobStatus } from '../lib/woodJobStatus'
import { useAppData } from '../store/AppDataContext'
import {
  ArrowLeft,
  X,
  Pause,
  Play,
  Check,
  Trash2,
  Flag,
  Zap,
  Target,
  TrendingUp,
  Activity,
  Coffee,
  Wrench,
  Box,
  List,
} from 'lucide-react'

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
  --teal: #3a9aaf; --teal-soft: rgba(58,154,175,0.12);
  --blue: #4677c8; --blue-soft: rgba(70,119,200,0.12);
  --purple: #8b5fbf; --purple-soft: rgba(139,95,191,0.12);
  --yellow: #d4a531; --yellow-soft: rgba(212,165,49,0.14);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 20px rgba(26,29,36,0.04);
  --r-sm: 10px; --r-md: 14px; --r-lg: 20px;
}
* { box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, system-ui, sans-serif; color: var(--ink); letter-spacing: -0.01em; background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%); }
.mes-main { padding: 18px 22px 30px; min-width: 0; }
.mes-crumb { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-3); font-weight: 500; margin-bottom: 10px; }
.mes-crumb a, .mes-crumb button.bk { background: none; border: 0; color: var(--ink-3); text-decoration: none; cursor: pointer; font: inherit; padding: 0; display: inline-flex; align-items: center; gap: 5px; }
.mes-crumb a:hover, .mes-crumb button.bk:hover { color: var(--ink); }
.mes-crumb .sep { color: var(--hairline-2); }
.mes-crumb .here { color: var(--ink); font-weight: 600; }
.mes-crumb .close { margin-left: auto; appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); border-radius: 9px; padding: 6px 11px; font: inherit; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.mes-crumb .close:hover { background: var(--surface-2); color: var(--ink); }

.mes-job { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-card); padding: 16px 20px; display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: center; margin-bottom: 14px; }
.mes-job .swatch { width: 64px; height: 64px; border-radius: 14px; background: var(--amber-soft); border: 1px solid rgba(232,154,60,0.32); color: var(--amber); display: flex; align-items: center; justify-content: center; }
.mes-job .info { min-width: 0; }
.mes-job .info .l1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--ink-3); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.mes-job .info .ord { color: var(--amber); font-variant-numeric: tabular-nums; }
.mes-job .info .pri { background: var(--navy); color: white; font-size: 10px; padding: 2px 7px; border-radius: 5px; letter-spacing: 0.06em; }
.mes-job .info h1 { margin: 4px 0 6px; font-size: 26px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.1; }
.mes-job .info .meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--ink-2); font-weight: 500; }
.mes-job .info .meta b { color: var(--ink); font-weight: 600; }
.mes-job .info .meta .sep { color: var(--hairline-2); }
.mes-job .step-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 7px; background: var(--navy-soft); color: var(--navy); font-size: 11px; font-weight: 600; }
.mes-job .quick { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; border-left: 1px solid var(--hairline); padding-left: 18px; }
.mes-job .quick .qty { font-size: 36px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.mes-job .quick .qty small { font-size: 14px; font-weight: 500; color: var(--ink-3); }
.mes-job .quick .lbl { font-size: 10px; color: var(--ink-3); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.mes-job .quick .due { margin-top: 4px; background: var(--yellow-soft); color: var(--yellow); font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }

.mes-grid2 { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; }

.hero { position: relative; background: radial-gradient(80% 90% at 30% 0%, rgba(255,255,255,0.06) 0%, transparent 60%), linear-gradient(180deg, #1f2a44 0%, #1a2238 100%); color: white; border-radius: var(--r-lg); padding: 22px 28px 22px; overflow: hidden; box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 36px rgba(26,29,36,0.16), 0 2px 6px rgba(26,29,36,0.08); }
.hero::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 24px 24px; mask-image: radial-gradient(80% 70% at 50% 35%, black 0%, transparent 75%); pointer-events: none; }
.yield-row { position: relative; display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.yield-row label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: rgba(255,255,255,0.55); text-transform: uppercase; }
.yield-row input { width: 64px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 8px; padding: 6px 9px; font: inherit; font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; text-align: center; }
.yield-row .hint { font-size: 11px; color: rgba(255,255,255,0.4); }
.yield-row .extra-wrap { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.yield-row .extra-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: white; border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.yield-row .extra-btn:hover { background: rgba(255,255,255,0.14); }
.yield-row .extra-input { display: flex; align-items: center; gap: 4px; }
.yield-row .extra-input input { width: 60px; }
.yield-row .extra-input button { background: var(--green); border: 0; color: white; border-radius: 6px; padding: 5px 9px; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }

.hero-top { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.run-pill { display: inline-flex; align-items: center; gap: 7px; background: rgba(76,175,106,0.18); color: #6ed98a; border: 1px solid rgba(110,217,138,0.32); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; padding: 5px 11px; border-radius: 999px; text-transform: uppercase; }
.run-pill.paused { background: rgba(240,174,92,0.18); color: var(--amber-2); border-color: rgba(240,174,92,0.36); }
.run-pill.idle { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.55); border-color: rgba(255,255,255,0.10); }
.run-pill .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: mes-pulse 1.2s ease-out infinite; }
.run-pill.idle .dot, .run-pill.paused .dot { animation: none; }
@keyframes mes-pulse { 0% { box-shadow: 0 0 0 0 currentColor; opacity: 1; } 100% { box-shadow: 0 0 0 8px transparent; opacity: 0.6; } }
.part-of { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 500; font-variant-numeric: tabular-nums; }
.part-of b { color: white; font-weight: 700; font-size: 15px; margin: 0 2px; }
.wallclock { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: rgba(255,255,255,0.55); letter-spacing: 0.06em; }

.timer-wrap { position: relative; margin: 14px 0 8px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.timer { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; font-size: 120px; line-height: 1; letter-spacing: -0.04em; color: white; font-variant-numeric: tabular-nums; text-shadow: 0 1px 0 rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.25); display: inline-flex; align-items: baseline; }
.timer .sec { color: rgba(255,255,255,0.95); }
.timer .tenths { font-size: 60px; color: rgba(232,154,60,0.92); margin-left: 2px; width: 1.1ch; text-align: left; }
.timer .colon { color: rgba(255,255,255,0.4); margin: 0 2px; }
.timer.over { color: #f88a72; }
.timer.over .tenths { color: #f88a72; }
.lap-current { display: inline-flex; align-items: center; gap: 10px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; color: rgba(255,255,255,0.65); letter-spacing: 0.04em; }
.lap-current .dim { color: rgba(255,255,255,0.4); }
.lap-current b { color: white; font-weight: 700; }

.pace { margin: 12px auto 0; max-width: 540px; background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 14px; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; }
.pace .label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
.pace .bar { height: 8px; border-radius: 999px; background: linear-gradient(90deg, rgba(76,175,106,0.55) 0%, rgba(212,165,49,0.55) 50%, rgba(210,83,58,0.55) 100%); position: relative; }
.pace .bar .tick { position: absolute; top: -2px; bottom: -2px; width: 3px; background: white; border-radius: 2px; transition: left 240ms ease; }
.pace .bar .zero { position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: rgba(255,255,255,0.35); }
.pace .val { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; font-size: 14px; color: white; min-width: 56px; text-align: right; }
.pace .val.fast { color: #6ed98a; }
.pace .val.slow { color: #f88a72; }

.actions { margin-top: 18px; display: grid; grid-template-columns: 1.4fr 2fr 1.4fr; gap: 10px; }
.abtn { appearance: none; border: 0; cursor: pointer; border-radius: 16px; padding: 22px 16px 18px; color: white; font: inherit; font-weight: 700; text-align: left; display: flex; align-items: center; gap: 14px; transition: transform 80ms ease, filter 160ms ease; box-shadow: 0 8px 18px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.08) inset; }
.abtn:hover { filter: brightness(1.08); }
.abtn:active { transform: translateY(1px); }
.abtn .lbl { display: flex; flex-direction: column; gap: 2px; line-height: 1; }
.abtn .lbl b { font-size: 20px; letter-spacing: -0.01em; font-weight: 700; }
.abtn .lbl small { font-size: 11px; font-weight: 500; opacity: 0.7; letter-spacing: 0.04em; }
.abtn.pause { background: linear-gradient(180deg, #c98e3b 0%, #a86f24 100%); }
.abtn.lap { background: linear-gradient(180deg, #4faf6e 0%, #2e8c4d 100%); justify-content: center; text-align: center; }
.abtn.lap .lbl b { font-size: 26px; }
.abtn.scrap { background: linear-gradient(180deg, #cc5740 0%, #a23d2a 100%); }
.key { background: rgba(0,0,0,0.28); color: rgba(255,255,255,0.85); font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 6px; border-radius: 5px; font-weight: 600; margin-left: auto; }

.complete-btn { margin-top: 12px; width: 100%; appearance: none; border: 0; background: var(--navy); color: white; border-radius: 14px; padding: 14px; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 6px 16px rgba(31,42,68,0.28); }
.complete-btn:hover { background: var(--navy-2); }

.stats4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
.stat { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 12px 14px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 4px; }
.stat .l { font-size: 10px; font-weight: 700; letter-spacing: 0.10em; color: var(--ink-3); text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
.stat .v { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.1; font-family: 'JetBrains Mono', monospace; }
.stat .v small { font-size: 11px; color: var(--ink-3); font-weight: 500; font-family: 'Inter', sans-serif; margin-left: 4px; }
.stat .d { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.stat.bank .v { color: var(--green); }
.stat.bank.bad .v { color: var(--red); }

.spark { margin-top: 14px; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: var(--shadow-card); padding: 14px 16px; }
.spark-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.spark-head h3 { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: -0.01em; display: inline-flex; align-items: center; gap: 6px; }
.spark-head .legend { display: flex; gap: 12px; font-size: 11px; color: var(--ink-3); font-weight: 500; }
.spark-head .legend i { display: inline-block; width: 12px; height: 2px; vertical-align: middle; margin-right: 4px; border-radius: 2px; }
.spark svg { display: block; width: 100%; height: 84px; }

.log { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-card); display: flex; flex-direction: column; min-height: 0; align-self: stretch; }
.log-head { padding: 14px 18px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--hairline); }
.log-head h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; display: inline-flex; align-items: center; gap: 7px; }
.log-head .seg { display: flex; gap: 3px; padding: 3px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 8px; }
.log-head .seg button { appearance: none; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 5px; cursor: pointer; }
.log-head .seg button[aria-pressed="true"] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(26,29,36,0.06); }
.log-body { overflow-y: auto; flex: 1; padding: 4px 0; max-height: 560px; }
.lap-row { display: grid; grid-template-columns: 32px 1fr 80px 70px; gap: 10px; align-items: center; padding: 9px 18px; border-bottom: 1px solid var(--hairline); font-size: 13px; }
.lap-row .n { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-3); font-weight: 600; }
.lap-row .tag { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-2); }
.lap-row .pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 5px; letter-spacing: 0.04em; text-transform: uppercase; background: var(--green-soft); color: var(--green); }
.lap-row .pill.scrap { background: var(--red-soft); color: var(--red); }
.lap-row .pill.rework { background: var(--amber-soft); color: var(--amber); }
.lap-row .pill.first { background: var(--blue-soft); color: var(--blue); }
.lap-row .pill.pause { background: var(--purple-soft); color: var(--purple); }
.lap-row .time { color: var(--ink-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.lap-row .t { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; }
.lap-row .d { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.lap-row .d.fast { color: var(--green); }
.lap-row .d.slow { color: var(--red); }
.lap-row .d.neutral { color: var(--ink-3); }
.lap-row.pause-row { background: rgba(139,95,191,0.06); border-left: 3px solid var(--purple); }
.lap-row .note { grid-column: 2 / span 3; margin-top: 2px; font-size: 11px; color: var(--ink-3); font-style: italic; }
.log-empty { padding: 28px 18px; text-align: center; font-size: 12px; color: var(--ink-3); }
.log-foot { padding: 12px 18px; border-top: 1px solid var(--hairline); background: var(--surface-2); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-radius: 0 0 var(--r-lg) var(--r-lg); }
.log-foot .cell { display: flex; flex-direction: column; gap: 2px; padding: 0 8px; border-right: 1px solid var(--hairline); }
.log-foot .cell:last-child { border-right: 0; }
.log-foot .cell .l { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--ink-3); text-transform: uppercase; }
.log-foot .cell .v { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace; }
.log-foot .cell.good .v { color: var(--green); }
.log-foot .cell.scrap .v { color: var(--red); }
.log-foot .cell.rework .v { color: var(--amber); }

.footstrip { margin-top: 14px; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: var(--shadow-card); padding: 12px 16px; display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; }
.footstrip .l-grp { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.footstrip .reasons-lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--ink-3); text-transform: uppercase; padding-right: 8px; border-right: 1px solid var(--hairline); }
.reason { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink-2); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.reason:hover { background: var(--surface); color: var(--ink); }
.reason.material { color: var(--blue); border-color: rgba(70,119,200,0.32); background: var(--blue-soft); }
.reason.tooling { color: var(--purple); border-color: rgba(139,95,191,0.32); background: var(--purple-soft); }
.reason.brk { color: var(--teal); border-color: rgba(58,154,175,0.32); background: var(--teal-soft); }
.reason.rework { color: var(--amber); border-color: rgba(232,154,60,0.32); background: var(--amber-soft); }
.reason.fault { color: var(--red); border-color: rgba(210,83,58,0.32); background: var(--red-soft); }
.who { display: flex; align-items: center; gap: 10px; }
.who .avatar { width: 32px; height: 32px; border-radius: 9px; background: var(--navy); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
.who .who-info { display: flex; flex-direction: column; line-height: 1.2; }
.who .who-info .name { font-size: 13px; font-weight: 600; color: var(--ink); }
.who .who-info .role { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.who .machine { border-left: 1px solid var(--hairline); padding-left: 12px; margin-left: 4px; display: flex; flex-direction: column; line-height: 1.2; }
.who .machine .lbl { font-size: 10px; color: var(--ink-3); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.who .machine .name { font-size: 13px; font-weight: 600; color: var(--ink); }

.modal-back { position: fixed; inset: 0; background: rgba(20,24,32,0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-card { background: var(--surface); border-radius: var(--r-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.25); max-width: 520px; width: calc(100% - 32px); padding: 24px; }
.modal-card h2 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
.modal-card p { margin: 0 0 18px; color: var(--ink-2); font-size: 13px; }
.modal-card .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.modal-card .opt { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink); border-radius: 12px; padding: 14px 16px; font: inherit; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; cursor: pointer; text-align: left; }
.modal-card .opt:hover { background: var(--surface); border-color: var(--navy); }
.modal-card .opt .ic { color: var(--ink-3); }
.modal-card .confirm-row { display: flex; gap: 10px; justify-content: flex-end; }
.modal-card .confirm-row button { appearance: none; border: 0; border-radius: 10px; padding: 10px 18px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.modal-card .confirm-row .ghost { background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--hairline-2); }
.modal-card .confirm-row .primary { background: var(--navy); color: white; }

.app { display: grid; grid-template-columns: 256px 1fr; min-height: 100vh; }
@media (max-width: 1280px) { .mes-grid2 { grid-template-columns: 1fr; } .stats4 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 980px) { .app { grid-template-columns: 1fr; } .timer { font-size: 84px; } .timer .tenths { font-size: 42px; } .actions { grid-template-columns: 1fr; } .mes-job { grid-template-columns: 1fr; } .mes-job .quick { border-left: 0; padding-left: 0; align-items: flex-start; } }
`

const PAUSE_REASONS = [
  { id: 'material', label: 'Material wait', icon: Box, cls: 'material' },
  { id: 'tooling', label: 'Tooling change', icon: Wrench, cls: 'tooling' },
  { id: 'break', label: 'Break', icon: Coffee, cls: 'brk' },
  { id: 'rework', label: 'Rework', icon: Flag, cls: 'rework' },
  { id: 'fault', label: 'Machine fault', icon: Zap, cls: 'fault' },
]
const SCRAP_REASONS = [
  { id: 'dims', label: 'Wrong dimensions', icon: Target },
  { id: 'burr', label: 'Burr / finish', icon: Flag },
  { id: 'material', label: 'Material defect', icon: Box },
  { id: 'machine', label: 'Machine fault', icon: Zap },
  { id: 'operator', label: 'Operator error', icon: X },
]

const pad = (n, w = 2) => String(n).padStart(w, '0')
const fmtMS = (sec) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${pad(s)}`
}
const fmtDelta = (d) => (d >= 0 ? '+' : '−') + Math.floor(Math.abs(d) / 60) + ':' + pad(Math.floor(Math.abs(d) % 60))
const fmtClock = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
const fmtHM = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes())

function ReasonModal({ title, prompt, options, onChoose, lockSeconds = 0, expireHint, onLockExpire }) {
  // Anti-cheat countdown: when lockSeconds > 0 we tick down once a second
  // and fire onLockExpire at zero. The callback is held in a ref because
  // the parent re-renders ~10×/sec for the wall clock, recreating the
  // arrow-function each time — without the ref the effect would restart
  // every render and the timer would never get below the start value.
  const [remaining, setRemaining] = useState(lockSeconds)
  const onExpireRef = useRef(onLockExpire)
  useEffect(() => { onExpireRef.current = onLockExpire }, [onLockExpire])

  useEffect(() => {
    if (lockSeconds <= 0) return
    setRemaining(lockSeconds)
    const interval = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(interval)
          if (onExpireRef.current) onExpireRef.current()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [lockSeconds])

  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>{title}</h2>
        <p>{prompt}</p>
        <div className="opts">
          {options.map((o) => {
            const Icon = o.icon
            return (
              <button key={o.id} className="opt" onClick={() => onChoose(o)}>
                <Icon size={18} className="ic" strokeWidth={1.8} />
                {o.label}
              </button>
            )
          })}
        </div>
        {lockSeconds > 0 && (
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
              {remaining > 0
                ? (expireHint || `Pick a reason within ${remaining}s`)
                : 'Time up — closing'}
            </span>
            <span style={{
              minWidth: 36, textAlign: 'center', padding: '4px 10px', borderRadius: 999,
              background: remaining > 0 ? 'var(--amber-soft)' : 'var(--ink-3)',
              color: remaining > 0 ? 'var(--amber)' : 'white',
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13,
            }}>
              {remaining}s
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// "How many did you actually make?" — fires when the operator clicks
// Complete Step. Pre-filled with the running counter from the timer; they
// can correct it before submitting. The number gets written to
// schedule.qty_done so Part Tracking + the EOD walk see the real count
// instead of the planned amount.
function QtyConfirmModal({ planned, suggested, saving, error, onCancel, onSubmit }) {
  const [num, setNum] = useState(suggested)
  const exceedsPlan = num > planned
  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: 460 }}>
        <h2>Confirm parts made</h2>
        <p>
          You planned <b>{planned}</b> on this row. Check the actual count and submit —
          this updates Part Tracking + End-of-Day for the boss.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 16px' }}>
          <QtyStepper value={num} onChange={setNum} max={null} showMax={false} />
          <span style={{ marginLeft: 10, alignSelf: 'center', fontSize: 14, color: 'var(--ink-3)', fontWeight: 600 }}>/ {planned}</span>
        </div>
        {exceedsPlan && (
          <div style={{
            background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid rgba(232,154,60,0.32)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12,
          }}>
            That's more than planned — fine if you added extras, but double-check.
          </div>
        )}
        {error && (
          <div style={{
            background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid rgba(210,83,58,0.32)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12,
          }}>{error}</div>
        )}
        <div className="confirm-row">
          <button className="ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="primary" onClick={() => onSubmit(num)} disabled={saving}>
            {saving ? 'Saving…' : 'Submit & complete step'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MESStationScreen(props = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromRoute = location.state || {}
  const {
    orderId = '043',
    productName = 'Bowtie Pote',
    customerName = 'KFC South Africa',
    stepName = 'Tube Laser',
    stepNumber = 1,
    totalSteps = 4,
    standardSeconds = 90,
    batchQty = 20,
    dueDate = 'Wk19 · Fri',
    priority = 5,
    operatorName = 'J. Pretorius',
    machineName = 'Tube Laser BN',
    scheduleId = null,
    scheduledQty = null,
    qtyAlreadyDone = 0,
    woodJobKey = null, // set when opened from the wood day-board — status is
                       // written back locally instead of to a schedule row.
  } = { ...props, ...fromRoute }
  const { applyScheduleRowUpdate } = useAppData()
  // What "planned" qty are we marking off? Use the schedule row's qty when MES
  // was launched from Schedule; otherwise fall back to the full batch.
  const plannedQty = scheduledQty ?? batchQty
  const [yieldPerCut, setYieldPerCut] = useState(1)
  const [completedParts, setCompletedParts] = useState(0)
  const [runState, setRunState] = useState('running')
  const [lapStartMs, setLapStartMs] = useState(() => Date.now())
  const [pausedAt, setPausedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [laps, setLaps] = useState([])
  const [pauseModalOpen, setPauseModalOpen] = useState(false)
  const [scrapModalOpen, setScrapModalOpen] = useState(false)
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const lapCounterRef = useRef(0)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  const currentLapMs = runState === 'paused' && pausedAt ? pausedAt - lapStartMs : now - lapStartMs
  const currentLapSec = Math.max(0, currentLapMs / 1000)
  const goodLaps = useMemo(() => laps.filter((l) => l.kind === 'lap' && l.status === 'good'), [laps])
  const totalLapSeconds = useMemo(() => goodLaps.reduce((sum, l) => sum + l.durationSec, 0), [goodLaps])
  const avgCycleSec = goodLaps.length ? totalLapSeconds / goodLaps.length : 0
  const bestLapSec = goodLaps.length ? Math.min(...goodLaps.map((l) => l.durationSec)) : 0
  const banked = goodLaps.length * standardSeconds - totalLapSeconds
  const remainingParts = Math.max(0, batchQty - completedParts)
  const etaSeconds = remainingParts * (avgCycleSec || standardSeconds)
  const etaDate = new Date(now + etaSeconds * 1000)
  const totalElapsedSec = useMemo(() => {
    let total = 0
    laps.forEach((l) => { total += l.durationSec || 0 })
    if (runState !== 'idle') total += currentLapSec
    return total
  }, [laps, currentLapSec, runState])

  const delta = (currentLapSec - standardSeconds) / standardSeconds
  const clamped = Math.max(-0.5, Math.min(0.5, delta))
  const paceLeft = 50 + clamped * 100
  const pacePct = Math.round(delta * 100)
  const over = currentLapSec > standardSeconds * 1.2

  const recordLap = () => {
    if (runState !== 'running') return
    lapCounterRef.current += 1
    const durationSec = currentLapSec
    const isFirst = lapCounterRef.current === 1
    setLaps((prev) => [
      ...prev,
      {
        kind: 'lap',
        n: lapCounterRef.current,
        status: isFirst ? 'first' : 'good',
        timestamp: new Date(),
        durationSec,
        deltaSec: durationSec - standardSeconds,
        yieldUnits: yieldPerCut,
        note: isFirst ? 'First piece' : null,
      },
    ])
    setCompletedParts((c) => Math.min(batchQty, c + yieldPerCut))
    setLapStartMs(Date.now())
  }

  const openPause = () => {
    if (runState === 'paused') {
      setLapStartMs((prev) => prev + (Date.now() - (pausedAt || Date.now())))
      setPausedAt(null)
      setRunState('running')
      return
    }
    setPauseModalOpen(true)
  }

  const choosePauseReason = (reason) => {
    const t = Date.now()
    setPausedAt(t)
    setRunState('paused')
    lapCounterRef.current += 0
    setLaps((prev) => [
      ...prev,
      { kind: 'pause', n: '⏸', status: 'pause', reason: reason.label, timestamp: new Date(t), durationSec: 0 },
    ])
    setPauseModalOpen(false)
  }

  const openScrap = () => setScrapModalOpen(true)
  const chooseScrapReason = (reason) => {
    lapCounterRef.current += 1
    const durationSec = currentLapSec
    setLaps((prev) => [
      ...prev,
      {
        kind: 'lap',
        n: lapCounterRef.current,
        status: 'scrap',
        timestamp: new Date(),
        durationSec,
        deltaSec: durationSec - standardSeconds,
        yieldUnits: 0,
        note: reason.label,
      },
    ])
    setLapStartMs(Date.now())
    setScrapModalOpen(false)
  }

  const [completeSaving, setCompleteSaving] = useState(false)
  const [completeError, setCompleteError] = useState(null)
  // Tracks whether the operator actually committed work via Complete Step.
  // If they didn't, exitMes() rewinds the Start (so an accidental Start on
  // Schedule doesn't leave the row stuck on 'working' + started_at).
  const wasCompletedRef = useRef(false)
  const confirmComplete = async (finalQty) => {
    // Wood job (no schedule row): write status + qty back to local storage and
    // return to the wood day-board.
    if (woodJobKey) {
      setWoodJobStatus(woodJobKey, { status: 'completed', completed_at: new Date().toISOString(), qty_done: finalQty })
      wasCompletedRef.current = true
      setCompleteModalOpen(false)
      navigate('/schedule')
      return
    }
    // No scheduleId means MES was opened standalone (no schedule row to write
    // back to) — just navigate away as before. Standard flow always has one.
    if (!scheduleId) {
      setCompleteModalOpen(false)
      navigate('/schedule')
      return
    }
    setCompleteSaving(true)
    setCompleteError(null)
    try {
      const updated = await setScheduleRowQtyDone(scheduleId, finalQty)
      applyScheduleRowUpdate(scheduleId, updated)
      wasCompletedRef.current = true
      setCompleteModalOpen(false)
      navigate('/schedule')
    } catch (e) {
      setCompleteError(e.message || String(e))
    } finally {
      setCompleteSaving(false)
    }
  }

  // Catches EVERY exit path — header buttons, router redirects, browser tab
  // close, OS app kill. If Complete Step never fired, the Start side effects
  // (status='working' + started_at) get rolled back so the Schedule row
  // doesn't stay stuck as Pause/Stop.
  //
  // Tab-close case is best-effort: async writes may not complete on hard
  // close. The beforeunload prompt (below) gives a second line of defence.
  useEffect(() => {
    return () => {
      if (wasCompletedRef.current) return
      // Wood job: revert local status so an abandoned Start doesn't stick.
      if (woodJobKey) { setWoodJobStatus(woodJobKey, { status: 'queued', started_at: null }); return }
      if (!scheduleId) return
      setScheduleRowStatus(scheduleId, { status: 'queued', started_at: null })
        .then((updated) => applyScheduleRowUpdate(scheduleId, updated || { status: 'queued', started_at: null }))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hard-close defence — if the operator closes the tab while still inside
  // an uncomplete MES session, browser shows "Are you sure?" prompt. They
  // either come back (Complete properly) or confirm (we lose the auto-
  // revert race; the next time Schedule loads the row will still look
  // 'working', which is at least visible).
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!scheduleId || wasCompletedRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Header buttons just navigate — the unmount cleanup above handles the
  // status revert.
  const exitMes = (destination) => {
    if (destination === 'back') navigate(-1)
    else navigate('/schedule')
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (pauseModalOpen || scrapModalOpen || completeModalOpen) return
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); recordLap() }
      else if (e.key === 'p' || e.key === 'P') openPause()
      else if (e.key === 's' || e.key === 'S') openScrap()
      else if (e.key === 'c' || e.key === 'C') setCompleteModalOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const filtered = laps.filter((l) => {
    if (filter === 'all') return true
    if (filter === 'good') return l.kind === 'lap' && l.status === 'good'
    if (filter === 'flags') return l.kind === 'pause' || (l.kind === 'lap' && (l.status === 'scrap' || l.status === 'rework'))
    return true
  })
  const goodCount = laps.filter((l) => l.kind === 'lap' && l.status === 'good').length
  const reworkCount = laps.filter((l) => l.kind === 'lap' && l.status === 'rework').length
  const scrapCount = laps.filter((l) => l.kind === 'lap' && l.status === 'scrap').length

  const tMin = pad(Math.floor(currentLapSec / 60))
  const tSec = pad(Math.floor(currentLapSec % 60))
  const tTen = '.' + Math.floor((currentLapSec * 10) % 10)
  const initials = operatorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="mes-main">
          <div className="mes-crumb">
            <button className="bk" onClick={() => exitMes('schedule')}><ArrowLeft size={14} /> Schedule</button>
            <span className="sep">/</span>
            <span>Wk 19 · Day 4</span>
            <span className="sep">/</span>
            <span>Order {orderId}</span>
            <span className="sep">/</span>
            <span className="here">{productName}</span>
            <button className="close" onClick={() => exitMes('back')}><X size={13} /> Close station</button>
          </div>

          <div className="mes-job">
            <div className="swatch">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7 L11 12 L4 17 Z" />
                <path d="M20 7 L13 12 L20 17 Z" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              </svg>
            </div>
            <div className="info">
              <div className="l1">
                <span className="ord">Order {orderId}</span>
                <span className="sep">·</span>
                <span className="pri">PRI {priority}</span>
                <span className="sep">·</span>
                <span className="step-pill">● {stepName} · Step {stepNumber} of {totalSteps}</span>
              </div>
              <h1>{productName}</h1>
              <div className="meta">
                <span>Customer <b>{customerName}</b></span>
                <span className="sep">·</span>
                <span>Std cycle <b>{fmtMS(standardSeconds)}</b></span>
              </div>
            </div>
            <div className="quick">
              <div className="lbl">Batch target</div>
              <div className="qty">{batchQty} <small>pcs</small></div>
              <div className="due">Due {dueDate}</div>
            </div>
          </div>

          <div className="mes-grid2">
            <div>
              <section className="hero">
                <div className="yield-row">
                  <label htmlFor="yield-input">Yield per cut</label>
                  <QtyStepper
                    value={yieldPerCut}
                    min={1}
                    onChange={(v) => setYieldPerCut(Math.max(1, v))}
                    compact
                  />
                  <span className="hint">pcs added per lap</span>
                </div>

                <div className="hero-top">
                  <div className={`run-pill ${runState}`}>
                    <span className="dot" />
                    <span>{runState === 'running' ? 'Running' : runState === 'paused' ? 'Paused' : 'Idle'}</span>
                  </div>
                  <div className="part-of">Part <b>{Math.min(completedParts + 1, batchQty)}</b> of <b>{batchQty}</b></div>
                  <div className="wallclock">{fmtClock(new Date(now))}</div>
                </div>

                <div className="timer-wrap">
                  <div className={`timer ${over ? 'over' : ''}`}>
                    <span className="sec">{tMin}</span>
                    <span className="colon">:</span>
                    <span className="sec">{tSec}</span>
                    <span className="tenths">{tTen}</span>
                  </div>
                  <div className="lap-current">
                    <span className="dim">total elapsed</span>
                    <b>{Math.floor(totalElapsedSec / 60)}m {pad(Math.floor(totalElapsedSec % 60))}s</b>
                    <span className="dim">·</span>
                    <span className="dim">eta</span>
                    <b>{fmtHM(etaDate)}</b>
                  </div>
                </div>

                <div className="pace">
                  <div className="label">Pace vs std</div>
                  <div className="bar">
                    <div className="zero" />
                    <div className="tick" style={{ left: `${paceLeft}%` }} />
                  </div>
                  <div className={`val ${pacePct < 0 ? 'fast' : pacePct > 5 ? 'slow' : ''}`}>{pacePct >= 0 ? '+' : '−'}{Math.abs(pacePct)}%</div>
                </div>

                <div className="actions">
                  <button className="abtn pause" onClick={openPause}>
                    {runState === 'paused' ? <Play size={22} /> : <Pause size={22} />}
                    <span className="lbl"><b>{runState === 'paused' ? 'Resume' : 'Pause'}</b><small>{runState === 'paused' ? 'continue lap' : '+ reason'}</small></span>
                    <span className="key">P</span>
                  </button>
                  <button className="abtn lap" onClick={recordLap}>
                    <Check size={28} />
                    <span className="lbl"><b>Lap +{yieldPerCut}</b><small>part complete</small></span>
                    <span className="key" style={{ background: 'rgba(0,0,0,0.32)' }}>SPACE</span>
                  </button>
                  <button className="abtn scrap" onClick={openScrap}>
                    <Trash2 size={22} />
                    <span className="lbl"><b>Scrap</b><small>− log reason</small></span>
                    <span className="key">S</span>
                  </button>
                </div>

                <button className="complete-btn" onClick={() => setCompleteModalOpen(true)}>
                  <Check size={18} /> Complete Step
                </button>
              </section>

              <div className="stats4">
                <div className="stat">
                  <div className="l"><TrendingUp size={12} /> Avg Cycle</div>
                  <div className="v">{avgCycleSec ? fmtMS(avgCycleSec) : '—'}<small>per part</small></div>
                  <div className="d">{goodLaps.length} good lap{goodLaps.length === 1 ? '' : 's'}</div>
                </div>
                <div className="stat">
                  <div className="l"><Zap size={12} /> Best Lap</div>
                  <div className="v">{bestLapSec ? fmtMS(bestLapSec) : '—'}</div>
                  <div className="d">{bestLapSec ? 'fastest so far' : 'none yet'}</div>
                </div>
                <div className="stat">
                  <div className="l"><Target size={12} /> Std Time</div>
                  <div className="v">{fmtMS(standardSeconds)}<small>quoted</small></div>
                  <div className="d">from parts.sek</div>
                </div>
                <div className={`stat bank ${banked < 0 ? 'bad' : ''}`}>
                  <div className="l"><Activity size={12} /> Time Banked</div>
                  <div className="v">{banked >= 0 ? '+' : '−'}{fmtMS(Math.abs(banked))}</div>
                  <div className="d">vs std for {goodLaps.length} parts</div>
                </div>
              </div>

              <div className="footstrip">
                <div className="who" style={{ marginLeft: 'auto' }}>
                  <div className="avatar">{initials}</div>
                  <div className="who-info">
                    <span className="name">{operatorName}</span>
                    <span className="role">Operator · Shift A</span>
                  </div>
                  <div className="machine">
                    <span className="lbl">Machine</span>
                    <span className="name">{machineName}</span>
                  </div>
                </div>
              </div>
            </div>

            <aside className="log">
              <div className="log-head">
                <h2><List size={14} /> Lap Log</h2>
                <div className="seg">
                  <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                  <button aria-pressed={filter === 'good'} onClick={() => setFilter('good')}>Good</button>
                  <button aria-pressed={filter === 'flags'} onClick={() => setFilter('flags')}>Flags</button>
                </div>
              </div>
              <div className="log-body">
                {filtered.length === 0 && <div className="log-empty">No laps logged yet.</div>}
                {filtered.map((l, i) => {
                  if (l.kind === 'pause') {
                    return (
                      <div key={i} className="lap-row pause-row">
                        <span className="n">⏸</span>
                        <span className="tag">
                          <span className="pill pause">{l.reason}</span>
                          <span className="time">{fmtHM(l.timestamp)}</span>
                        </span>
                        <span className="t">—</span>
                        <span className="d neutral">paused</span>
                      </div>
                    )
                  }
                  const cls = l.status === 'scrap' ? 'scrap' : l.status === 'rework' ? 'rework' : l.status === 'first' ? 'first' : ''
                  const label = l.status === 'scrap' ? 'Scrap' : l.status === 'rework' ? 'Rework' : l.status === 'first' ? 'First piece' : 'Good'
                  const deltaPos = l.deltaSec >= 0
                  return (
                    <div key={i} className="lap-row">
                      <span className="n">{pad(l.n)}</span>
                      <span className="tag">
                        <span className={`pill ${cls}`}>{label}</span>
                        <span className="time">{fmtHM(l.timestamp)}</span>
                      </span>
                      <span className="t">{fmtMS(l.durationSec)}</span>
                      <span className={`d ${deltaPos ? 'slow' : 'fast'}`}>{fmtDelta(l.deltaSec)}</span>
                      {l.note && <span className="note">{l.note}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="log-foot">
                <div className="cell good"><span className="l">Good</span><span className="v">{goodCount}</span></div>
                <div className="cell rework"><span className="l">Rework</span><span className="v">{reworkCount}</span></div>
                <div className="cell scrap"><span className="l">Scrap</span><span className="v">{scrapCount}</span></div>
              </div>
            </aside>
          </div>
        </main>
      </div>

      {pauseModalOpen && (
        <ReasonModal
          title="Why are you pausing?"
          prompt="Pick a reason within 5 seconds — otherwise the pause is cancelled and the timer keeps running."
          options={PAUSE_REASONS}
          onChoose={choosePauseReason}
          lockSeconds={5}
          expireHint="No reason picked — pause cancelled, timer resumes"
          onLockExpire={() => setPauseModalOpen(false)}
        />
      )}
      {scrapModalOpen && (
        <ReasonModal
          title="What happened?"
          prompt="Select a scrap reason so it can be tracked."
          options={SCRAP_REASONS}
          onChoose={chooseScrapReason}
        />
      )}
      {completeModalOpen && (
        <QtyConfirmModal
          planned={plannedQty}
          suggested={Math.max(completedParts, qtyAlreadyDone)}
          saving={completeSaving}
          error={completeError}
          onCancel={() => { if (!completeSaving) { setCompleteModalOpen(false); setCompleteError(null) } }}
          onSubmit={confirmComplete}
        />
      )}
    </>
  )
}
