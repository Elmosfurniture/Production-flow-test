import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import { useAppData } from '../store/AppDataContext'
import { useConfirm } from '../components/ConfirmDialog'
import { canEdit } from '../lib/auth'
import { createFolder, updateFolder, deleteFolder, moveProductToFolder } from '../lib/folders'
import { createProductWithParts, updateProductWithParts, deleteProduct } from '../lib/saveProduct'
import { removeAbbreviation, mergeStubIntoProduct } from '../lib/reconcile'
import {
  Hammer, Scissors, Activity, Truck, Grid, Search, ChevronRight, X, Factory, Trash2, Box,
  Folder, FolderPlus, Plus, Minus, Save, FolderOpen, Edit2,
} from 'lucide-react'

// Live product catalogue with inline "Add New Product" form and folder-based
// grouping. Folders live in the `folders` table; each product has folder_id.
// Products with folder_id=null land in an "Unfiled" group at the bottom.

const DEPT_TABS = [
  { id: 'all', label: 'All Depts', Icon: Grid },
  { id: 'steel', label: 'Steel', Icon: Hammer },
  { id: 'wood', label: 'Wood', Icon: Scissors },
  { id: 'upholstery', label: 'Upholstery', Icon: Activity },
  { id: 'dispatch', label: 'Dispatching', Icon: Truck },
  { id: 'other', label: 'Other', Icon: Box },
]

const FORM_DEPT_OPTIONS = [
  { id: 'steel', label: 'Steel' },
  { id: 'wood', label: 'Wood' },
  { id: 'upholstery', label: 'Upholstery' },
  { id: 'dispatch', label: 'Dispatch' },
]

const STEP_COLORS = ['blue', 'purple', 'amber', 'green', 'teal']
function colorForMachine(name) {
  if (!name) return 'muted'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return STEP_COLORS[h % STEP_COLORS.length]
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
  --r-pill: 999px;
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

.dept-tabs { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 12px; margin-bottom: 12px; width: fit-content; }
.dept-tab { appearance: none; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 9px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.dept-tab .ic { width: 13px; height: 13px; color: var(--ink-3); }
.dept-tab[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 4px rgba(26,29,36,0.05); font-weight: 600; }
.dept-tab[aria-pressed="true"] .ic { color: var(--navy); }

.search-row { background: var(--surface); border: 1px solid var(--hairline); border-radius: 14px; padding: 11px 16px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; box-shadow: var(--shadow-card); }
.search-row input { flex: 1; border: 0; background: transparent; outline: 0; font: inherit; font-size: 14px; color: var(--ink); }
.search-row input::placeholder { color: var(--ink-3); }
.search-row .ic { color: var(--ink-3); }

.state { padding: 28px 16px; text-align: center; color: var(--ink-3); font-size: 13px; }
.state.err { color: var(--red); }
/* ============================================================
   Card shell — outer card for Add Product + Folders sections
   ============================================================ */
.card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); overflow: hidden; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; cursor: pointer; user-select: none; }
.card-head:hover { background: var(--surface-2); }
.card-head .left { display: flex; align-items: center; gap: 10px; }
.card-head .chev { color: var(--ink-3); transition: transform 180ms; }
.card-head .chev.open { transform: rotate(90deg); }
.card-head .title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.card-head .sub-count { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-left: 4px; }
.card-head .right { display: flex; align-items: center; gap: 10px; }
.card.editing { border-color: var(--navy); box-shadow: 0 0 0 2px var(--navy-soft), var(--shadow-card); margin-top: 8px; }
.card-head.editing { cursor: default; }
.card-head.editing:hover { background: transparent; }
.card-head.editing .title { color: var(--navy); }
.card-head .sub-code { font-size: 11px; font-family: ui-monospace, "SF Mono", monospace; background: var(--amber-soft); color: var(--amber); padding: 2px 7px; border-radius: 5px; font-weight: 600; }
.head-folder { display: flex; align-items: center; gap: 8px; }
.head-folder label { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.head-folder select { font: inherit; font-size: 12px; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink); cursor: pointer; min-width: 140px; outline: 0; }
.card-body { padding: 6px 18px 18px; border-top: 1px solid var(--hairline); }

/* Form fields — iOS-style grouped inputs */
.field-row { display: grid; gap: 14px; margin-top: 14px; }
.field-row.cols-2 { grid-template-columns: 1fr 1fr; }
.field label { font-size: 10px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; display: block; margin-bottom: 7px; }
.field input, .field select { width: 100%; font: inherit; font-size: 14px; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--hairline); background: var(--surface-2); color: var(--ink); outline: 0; transition: border-color 120ms, background 120ms, box-shadow 120ms; }
.field input:focus, .field select:focus { background: var(--surface); border-color: var(--navy); box-shadow: 0 0 0 3px rgba(31,42,68,0.08); }
.field input::placeholder { color: var(--ink-3); }
.field.priority-field { display: flex; flex-direction: column; align-items: flex-start; }
.field.priority-field .stepper { margin-top: 0; }

/* Abbreviation chips — under the comma-separated input. Each chip = one
   saved alias. X removes immediately AND re-flags affected orders. */
.abbr-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.abbr-chips .chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface); border: 1px solid var(--hairline-2);
  border-radius: 999px; padding: 4px 4px 4px 10px;
  font-size: 12px; color: var(--ink-2);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}
.abbr-chips .chip.primary { background: var(--navy-soft); border-color: rgba(31,42,68,0.18); color: var(--navy); font-weight: 600; }
.abbr-chips .chip .x {
  appearance: none; border: 0; background: transparent;
  width: 20px; height: 20px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ink-3); cursor: pointer;
}
.abbr-chips .chip .x:hover { background: var(--red-soft); color: var(--red); }
.abbr-chips .chip .x:disabled { opacity: 0.3; cursor: not-allowed; }
.abbr-chips .chip .lock {
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 0 6px; color: var(--navy);
}
.abbr-chips .empty {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px; color: var(--ink-3); font-style: italic;
}
.abbr-chips .err {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px; color: var(--red); display: inline-flex; align-items: center; gap: 4px;
}

/* ============================================================
   Stepper — compact iOS-style [−] value [+] pill.
   "jump" variant adds ghost ±10 buttons either side.
   ============================================================ */
.stepper { display: inline-flex; align-items: center; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-pill); padding: 3px; height: 36px; gap: 2px; }
.stepper .btn { width: 30px; height: 30px; border-radius: 50%; background: var(--surface); border: 0; color: var(--ink-2); cursor: pointer; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: color 120ms, background 120ms; }
.stepper .btn:hover { color: var(--navy); background: var(--surface); }
.stepper .btn:active { transform: scale(0.94); }
.stepper input { width: 44px; text-align: center; border: 0; background: transparent; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); padding: 0 4px; font-variant-numeric: tabular-nums; outline: 0; }
.stepper .jump { width: 32px; height: 30px; border-radius: 999px; background: transparent; border: 0; color: var(--ink-3); cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; }
.stepper .jump:hover { background: var(--hairline); color: var(--ink-2); }
.stepper.compact { height: 30px; padding: 2px; }
.stepper.compact .btn { width: 26px; height: 26px; font-size: 12px; }
.stepper.compact input { width: 36px; font-size: 13px; }
.stepper.compact .jump { width: 28px; height: 26px; font-size: 10px; }

/* ============================================================
   iOS-style switch toggle
   ============================================================ */
.ios-switch { width: 42px; height: 26px; border-radius: 999px; background: rgba(120,120,128,0.32); border: 0; padding: 2px; cursor: pointer; display: inline-flex; align-items: center; transition: background 200ms; flex-shrink: 0; }
.ios-switch.on { background: var(--green); }
.ios-switch .knob { width: 22px; height: 22px; border-radius: 50%; background: white; box-shadow: 0 1px 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.18); transition: transform 200ms cubic-bezier(0.32,0.72,0,1); }
.ios-switch.on .knob { transform: translateX(16px); }

/* ============================================================
   Section header inside cards (uppercase, tinted)
   ============================================================ */
.section-hd { display: flex; align-items: center; justify-content: space-between; margin: 22px 0 10px; padding: 0 2px; }
.section-hd .label { font-size: 11px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }

/* ============================================================
   Editor dept tabs — one tab per department this product touches; the +Add
   button pops an inline picker with the remaining depts.
   ============================================================ */
.editor-dept-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 12px; }
.editor-dept-tab {
  display: inline-flex; align-items: center; gap: 6px;
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink-2);
  font: inherit; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 6px 6px 6px 12px; border-radius: 999px;
  cursor: pointer; transition: background 120ms, color 120ms, border-color 120ms, box-shadow 120ms;
}
.editor-dept-tab:hover { background: var(--surface); color: var(--ink); }
.editor-dept-tab.active { background: var(--surface); color: var(--navy); border-color: var(--navy); box-shadow: 0 0 0 2px var(--navy-soft); }
.editor-dept-tab.dept-steel.active { color: var(--blue); border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-soft); }
.editor-dept-tab.dept-wood.active { color: var(--green); border-color: var(--green); box-shadow: 0 0 0 2px var(--green-soft); }
.editor-dept-tab.dept-upholstery.active { color: var(--amber); border-color: var(--amber); box-shadow: 0 0 0 2px var(--amber-soft); }
.editor-dept-tab.dept-dispatch.active { color: var(--purple); border-color: var(--purple); box-shadow: 0 0 0 2px var(--purple-soft); }
.editor-dept-tab .count { font-weight: 600; opacity: 0.7; margin-left: 1px; letter-spacing: 0; text-transform: none; font-size: 10px; }
.editor-dept-tab .x {
  width: 20px; height: 20px; border-radius: 50%; border: 0; background: transparent;
  color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  margin-left: 2px;
}
.editor-dept-tab .x:hover { background: var(--red-soft); color: var(--red); }
.editor-dept-add {
  display: inline-flex; align-items: center; gap: 5px;
  appearance: none; border: 1px dashed var(--hairline-2);
  background: transparent; color: var(--ink-2);
  font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
  transition: border-color 120ms, color 120ms, background 120ms;
}
.editor-dept-add:hover { border-color: var(--navy); color: var(--navy); background: var(--navy-soft); border-style: solid; }
.editor-dept-add-pop {
  position: relative; display: inline-flex; align-items: center;
}
.editor-dept-add-menu {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 10;
  background: var(--surface); border: 1px solid var(--hairline-2);
  border-radius: 12px; padding: 6px; min-width: 160px;
  box-shadow: 0 8px 22px rgba(26,29,36,0.10);
  display: flex; flex-direction: column; gap: 2px;
}
.editor-dept-add-menu button {
  appearance: none; border: 0; background: transparent; color: var(--ink);
  font: inherit; font-size: 12px; font-weight: 500;
  padding: 8px 12px; border-radius: 8px; cursor: pointer; text-align: left;
}
.editor-dept-add-menu button:hover { background: var(--surface-2); color: var(--navy); }
.editor-dept-add-menu .empty { font-size: 11px; color: var(--ink-3); font-style: italic; padding: 8px 12px; }
.editor-empty {
  padding: 28px 18px; text-align: center; font-size: 13px; color: var(--ink-3);
  background: var(--surface-2); border: 1px dashed var(--hairline-2); border-radius: 14px;
}

/* ============================================================
   Parts list — single grouped container, hairline-separated rows
   ============================================================ */
.parts-list { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; overflow: hidden; }
.part-group { padding: 14px 16px; }
.part-group + .part-group { border-top: 1px solid var(--hairline); }

/* Department divider between parts in the editor — separates the wood-side
   parts from the steel-side parts on a two-track product so the user can
   see at a glance which side each part belongs to. */
.dept-divider {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  background: var(--surface-2);
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--ink-3);
}
.dept-divider:first-child { border-top: 0; }
.dept-divider .pill {
  padding: 3px 9px; border-radius: 999px;
  background: var(--navy-soft); color: var(--navy);
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
}
.dept-divider .pill.steel { background: var(--blue-soft); color: var(--blue); }
.dept-divider .pill.wood { background: var(--green-soft); color: var(--green); }
.dept-divider .pill.upholstery { background: var(--amber-soft); color: var(--amber); }
.dept-divider .pill.dispatch { background: var(--purple-soft); color: var(--purple); }
.dept-divider .pill.unrouted { background: var(--surface); color: var(--ink-3); border: 1px dashed var(--hairline-2); }
.dept-divider .rule { flex: 1; height: 1px; background: var(--hairline); }
.part-row { display: grid; grid-template-columns: 1fr auto auto auto auto; gap: 14px; align-items: center; }
.part-row .pname-wrap { min-width: 0; }
.part-row .pname-input { width: 100%; border: 0; background: transparent; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); padding: 6px 0; outline: 0; border-bottom: 1.5px solid transparent; transition: border-color 140ms; }
.part-row .pname-input:focus { border-bottom-color: var(--navy); }
.part-row .pname-input::placeholder { color: var(--ink-3); font-weight: 500; }
.field-mini { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.field-mini .mini-label { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.row-x { width: 30px; height: 30px; border-radius: 50%; border: 0; background: transparent; color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background 120ms, color 120ms; }
.row-x:hover { background: var(--red-soft); color: var(--red); }
.row-x:disabled { opacity: 0.3; cursor: not-allowed; }

/* Steps list inside a part — 3-column grid, each step a self-contained tile */
.steps { margin-top: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding-left: 4px; }
.step-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto auto auto; gap: 8px; align-items: start; padding: 8px 10px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 12px; }
.step-row .day-pick { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 1px; }
.step-row .day-pick .day-label { font-size: 8px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.06em; }
.step-row .day-pick select { font: inherit; font-size: 11px; font-weight: 600; padding: 5px 6px; border-radius: 8px; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); outline: 0; cursor: pointer; }
.step-row .day-pick select:focus { border-color: var(--green, #3a9d5a); box-shadow: 0 0 0 2px rgba(58,157,90,0.12); }
.step-row .day-pick.pinned select { border-color: var(--green, #3a9d5a); color: var(--green, #3a9d5a); background: var(--green-soft); }
.step-row .day-spacer { width: 1px; }
.step-row .num { width: 20px; height: 20px; border-radius: 50%; background: var(--amber-soft); color: var(--amber); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; margin-top: 4px; }
.step-row .machines { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.step-row .machine-pick { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px; align-items: center; }
.step-row .machine-pick.alt .machine-select { background: var(--surface-2); }
.step-row .machine-pick .alt-x { width: 20px; height: 20px; border-radius: 50%; border: 0; background: transparent; color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.step-row .machine-pick .alt-x:hover { background: var(--red-soft); color: var(--red); }
.step-row .machine-select { width: 100%; font: inherit; font-size: 12px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); outline: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.step-row .machine-select:focus { border-color: var(--navy); box-shadow: 0 0 0 2px rgba(31,42,68,0.08); }
.step-row .add-alt-btn { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; padding: 4px 9px; border: 1px dashed var(--hairline-2); background: transparent; border-radius: 999px; color: var(--ink-3); font: inherit; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; transition: color 120ms, border-color 120ms, background 120ms; }
.step-row .add-alt-btn:hover { color: var(--navy); border-color: var(--navy); border-style: solid; background: var(--navy-soft); }
.step-row .secs-with-label { display: inline-flex; align-items: center; gap: 4px; margin-top: 1px; }
.step-row .secs-with-label .unit { font-size: 9px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.step-row .row-x { width: 24px; height: 24px; margin-top: 2px; }
@media (max-width: 1200px) {
  .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .steps { grid-template-columns: 1fr; }
}
.add-step-btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; margin-left: 4px; padding: 7px 14px; background: transparent; border: 1px dashed var(--hairline-2); border-radius: var(--r-pill); color: var(--ink-2); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: border-color 140ms, color 140ms, background 140ms; }
.add-step-btn:hover { border-color: var(--navy); color: var(--navy); border-style: solid; background: var(--navy-soft); }
.steps-empty { margin-top: 12px; padding: 12px 14px; background: var(--surface-2); border: 1px dashed var(--hairline-2); border-radius: 12px; font-size: 12px; color: var(--ink-3); text-align: center; font-style: italic; }

/* Save / reset row */
.save-row { display: flex; align-items: center; gap: 14px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--hairline); }
.save-btn { flex: 1; height: 46px; border-radius: 14px; background: var(--navy); color: white; border: 0; font: inherit; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(31,42,68,0.28); transition: filter 120ms, transform 120ms; }
.save-btn:hover { filter: brightness(0.96); }
.save-btn:active { transform: translateY(1px); }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
.reset-link { background: transparent; border: 0; color: var(--ink-3); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; padding: 8px 14px; }
.reset-link:hover { color: var(--ink); }
.form-error { margin-top: 14px; padding: 11px 14px; background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); border-radius: 12px; font-size: 13px; color: var(--red); font-weight: 500; }

/* Danger zone — destructive action at the bottom of the edit form */
.danger-zone { margin-top: 12px; padding-top: 14px; border-top: 1px solid var(--hairline); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.danger-zone .label { font-size: 11px; color: var(--ink-3); font-weight: 600; }
.delete-product-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 12px; border: 1px solid rgba(210,83,58,0.3); background: var(--red-soft); color: var(--red); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: filter 120ms, background 120ms; }
.delete-product-btn:hover { background: var(--red); color: white; border-color: var(--red); }
.delete-product-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ============================================================
   Folders manager — grouped-list look (iOS Settings)
   ============================================================ */
.folder-add { display: flex; align-items: center; gap: 8px; }
.folder-add input { font: inherit; font-size: 13px; padding: 9px 14px; border-radius: 12px; border: 1px solid var(--hairline); background: var(--surface-2); color: var(--ink); outline: 0; min-width: 220px; transition: border-color 120ms, background 120ms; }
.folder-add input:focus { background: var(--surface); border-color: var(--navy); }
.folder-list { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; overflow: hidden; }
.folder-row { display: grid; grid-template-columns: 22px 1fr auto auto auto; gap: 14px; align-items: center; padding: 12px 16px; }
.folder-row + .folder-row { border-top: 1px solid var(--hairline); }
.folder-row .icn { color: var(--amber); }
.folder-row .name { font-size: 14px; font-weight: 600; color: var(--ink); }
.folder-row .count { font-size: 12px; color: var(--ink-3); font-weight: 500; font-variant-numeric: tabular-nums; }
.folder-dept { font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink-2); cursor: pointer; outline: 0; font-weight: 600; }
.folder-dept:hover { background: var(--surface); }
.folder-dept:focus { border-color: var(--navy); box-shadow: 0 0 0 2px rgba(31,42,68,0.08); }
.folder-empty { padding: 28px 16px; text-align: center; color: var(--ink-3); font-size: 13px; }

/* ============================================================
   Folder accordion — slim header, dense body
   ============================================================ */
.folder-acc { background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px; margin-bottom: 8px; overflow: hidden; }
.folder-acc-head { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; user-select: none; }
.folder-acc-head:hover { background: var(--surface-2); }
.folder-acc-head .chev { color: var(--ink-3); transition: transform 180ms; }
.folder-acc.open .folder-acc-head .chev { transform: rotate(90deg); }
.folder-acc-head .icn { color: var(--amber); }
.folder-acc.open .folder-acc-head .icn { color: var(--navy); }
.folder-acc-head .name { font-size: 13px; font-weight: 600; flex: 1; }
.folder-acc-head .count { font-size: 11px; color: var(--ink-3); font-weight: 600; font-variant-numeric: tabular-nums; }
.folder-acc-body { display: none; border-top: 1px solid var(--hairline); }
.folder-acc.open .folder-acc-body { display: block; }

/* ============================================================
   Product table — compact, table-row style. Columns:
   [chev] [name + abbrs] [code] [depts] [counts] [edit]
   ============================================================ */
:root {
  --prod-grid: 16px minmax(0, 1fr) 130px 150px 30px;
}
.prod-table-head {
  display: grid; grid-template-columns: var(--prod-grid);
  align-items: center; gap: 12px;
  padding: 6px 14px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-3);
  background: var(--surface-2);
  border-bottom: 1px solid var(--hairline);
}
.prod-table-head .right { text-align: right; }
.prod { background: var(--surface); }
.prod + .prod { border-top: 1px solid var(--hairline); }
.prod-head {
  display: grid; grid-template-columns: var(--prod-grid);
  align-items: center; gap: 12px;
  padding: 8px 14px; cursor: pointer; min-height: 38px;
}
.prod-head:hover { background: var(--surface-2); }
.prod-head .chev { color: var(--ink-3); transition: transform 180ms; }
.prod.open .prod-head .chev { transform: rotate(90deg); }
.prod-head .info { min-width: 0; }
.prod-head .info .name {
  font-size: 13px; font-weight: 600; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.prod-head .info .meta { font-size: 11px; color: var(--ink-3); margin-top: 1px; }
.prod-head .info .meta .abbr { font-family: ui-monospace, "SF Mono", monospace; }
.prod-head .info .meta .abbr + .abbr::before { content: " · "; color: var(--ink-3); margin: 0 2px; }
.prod-head .code-cell {
  font-family: ui-monospace, "SF Mono", monospace; font-size: 11px; font-weight: 600;
  background: var(--amber-soft); color: var(--amber);
  padding: 3px 8px; border-radius: 5px;
  justify-self: start; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prod-head .depts-cell { display: inline-flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.prod-head .badge { display: inline-flex; align-items: center; gap: 4px; background: var(--blue-soft); color: var(--blue); font-size: 9px; font-weight: 700; padding: 3px 7px; border-radius: 5px; letter-spacing: 0.04em; text-transform: uppercase; }
.prod-head .badge.dept-steel { background: var(--blue-soft); color: var(--blue); }
.prod-head .badge.dept-wood { background: var(--green-soft); color: var(--green); }
.prod-head .badge.dept-upholstery { background: var(--amber-soft); color: var(--amber); }
.prod-head .badge.dept-dispatch { background: var(--purple-soft); color: var(--purple); }
.prod-head .badge.dept-other { background: var(--surface-2); color: var(--ink-2); }
.prod-head .counts {
  font-size: 11px; color: var(--ink-3); font-weight: 600;
  font-variant-numeric: tabular-nums; text-align: right;
}
.prod-head .icon-btn { width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background 120ms, color 120ms, border-color 120ms; }
.prod-head .icon-btn:hover { background: var(--surface-2); color: var(--navy); border-color: var(--navy); }
.parts { display: none; border-top: 1px solid var(--hairline); background: var(--surface-2); padding: 8px 14px 10px 42px; }
.prod.open .parts { display: block; }
.part { display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start; padding: 8px 0; }
.part + .part { border-top: 1px dashed var(--hairline); }
.part .num { width: 24px; height: 24px; border-radius: 6px; background: var(--amber-soft); color: var(--amber); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.part .pname { font-size: 13px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.part .pname .x { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.part .pname .mat { font-size: 10px; color: var(--ink-3); font-family: ui-monospace, monospace; }
.part .pname .asm { background: var(--blue-soft); color: var(--blue); font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.04em; text-transform: uppercase; }
.part .route { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.part .empty { font-size: 11px; color: var(--ink-3); font-style: italic; margin-top: 6px; }
.step-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; font-size: 11px; font-weight: 600; border-radius: 6px; }
.step-chip .dot { width: 6px; height: 6px; border-radius: 50%; }
.step-chip .secs { font-weight: 500; opacity: 0.75; margin-left: 4px; }
.step-chip .alt-tail { font-weight: 500; opacity: 0.65; }
.step-chip.blue { background: var(--blue-soft); color: var(--blue); } .step-chip.blue .dot { background: var(--blue); }
.step-chip.purple { background: var(--purple-soft); color: var(--purple); } .step-chip.purple .dot { background: var(--purple); }
.step-chip.amber { background: var(--amber-soft); color: var(--amber); } .step-chip.amber .dot { background: var(--amber); }
.step-chip.green { background: var(--green-soft); color: var(--green); } .step-chip.green .dot { background: var(--green); }
.step-chip.teal { background: var(--teal-soft); color: var(--teal); } .step-chip.teal .dot { background: var(--teal); }
.step-chip.muted { background: var(--surface-3); color: var(--ink-3); } .step-chip.muted .dot { background: var(--ink-3); }
.arrow { color: var(--ink-3); }
`

// ============================================================
// Reusable controls — Stepper (compact iOS pill) + IOSSwitch
// ============================================================
function Stepper({ value, onChange, min = 0, max = Infinity, jump = false, compact = false }) {
  const clamp = (n) => Math.max(min, Math.min(max, n))
  return (
    <div className={`stepper ${compact ? 'compact' : ''}`}>
      {jump && (
        <button type="button" className="jump" onClick={() => onChange(clamp(value - 10))} title="−10">−10</button>
      )}
      <button type="button" className="btn" onClick={() => onChange(clamp(value - 1))} aria-label="Decrease">
        <Minus size={12} />
      </button>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9.]/g, ''))
          onChange(Number.isFinite(n) ? clamp(n) : min)
        }}
      />
      <button type="button" className="btn" onClick={() => onChange(clamp(value + 1))} aria-label="Increase">
        <Plus size={12} />
      </button>
      {jump && (
        <button type="button" className="jump" onClick={() => onChange(clamp(value + 10))} title="+10">+10</button>
      )}
    </div>
  )
}

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

// ============================================================
// Browse side: PartRow inside an expanded product card
// ============================================================
function PartRow({ part, index, steps }) {
  // Badge shows the part's priority (1 = highest). Lets the user see at a
  // glance which order parts run in. Parts are pre-sorted by priority in
  // AppDataContext, so the column reads top-to-bottom by ascending priority.
  return (
    <div className="part">
      <div className="num" title={`Priority ${part.part_priority ?? 1}`}>{part.part_priority ?? 1}</div>
      <div>
        <div className="pname">
          <span>{part.name}</span>
          <span className="x">×{part.qty_per_unit ?? 1} / unit</span>
          {part.is_assembly && <span className="asm">Assembly</span>}
          {part.material_code && <span className="mat">{part.material_code}</span>}
          {part.length && <span className="x">{part.length}mm</span>}
        </div>
        {steps.length === 0 ? (
          <div className="empty">No machine steps recorded.</div>
        ) : (
          <div className="route">
            {steps.map((s, i) => {
              const alts = Array.isArray(s.alt_machine_names) ? s.alt_machine_names.filter(Boolean) : []
              return (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className={`step-chip ${colorForMachine(s.machine_name)}`}>
                    <span className="dot" />
                    {s.machine_name}
                    {alts.length > 0 && (
                      <span className="alt-tail" title={`Pool: ${[s.machine_name, ...alts].join(', ')}`}>
                        {' / '}{alts.join(' / ')}
                      </span>
                    )}
                    {s.seconds_per_part > 0 && <span className="secs">{s.seconds_per_part}s</span>}
                    {s.setup_time > 0 && <span className="secs">+{s.setup_time}m SU</span>}
                  </span>
                  {i < steps.length - 1 && <span className="arrow">→</span>}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ProductCard({
  product, parts, stepsByPart,
  canModify, folders, onMoveFolder, onStartEdit,
}) {
  const [open, setOpen] = useState(false)
  const { deptsByCode, machineByName } = useAppData()
  const stepCount = parts.reduce((s, pt) => s + (stepsByPart.get(pt.id)?.length || 0), 0)
  const extraAbbr = (product.abbreviations || []).filter((a) => a !== product.code)

  // Bucket parts by their explicit `department` column (set by the editor's
  // dept tabs). Legacy parts whose column is still NULL fall back to the
  // first step's machine.department, then 'unrouted' for those with neither.
  // The product's own primary department is shown first so the most familiar
  // side of the product reads top-to-bottom.
  const partsByDept = useMemo(() => {
    const groups = new Map()
    for (const pt of parts) {
      let key = pt.department
      if (!key) {
        const steps = stepsByPart.get(pt.id) || []
        for (const s of steps) {
          const m = machineByName?.get(s.machine_name)
          if (m?.department) { key = m.department; break }
        }
      }
      if (!key) key = 'unrouted'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(pt)
    }
    const sortKey = (d) => {
      if (d === product.department) return ''
      if (d === 'unrouted') return 'zzz2'
      return d
    }
    return [...groups.entries()]
      .sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])))
      .map(([dept, items]) => ({ dept, items }))
  }, [parts, stepsByPart, machineByName, product.department])

  // Show a badge for every department this product TOUCHES — its primary
  // department plus any extras that come from parts routing through other
  // depts' machines (a coffee table with steel base + wood top gets both).
  const touchedDepts = useMemo(() => {
    const set = new Set()
    if (product.department) set.add(product.department)
    const fromRouting = deptsByCode?.get(product.code)
    if (fromRouting) for (const d of fromRouting) set.add(d)
    return [...set].sort((a, b) => {
      if (a === product.department) return -1
      if (b === product.department) return 1
      return a.localeCompare(b)
    })
  }, [product.code, product.department, deptsByCode])
  return (
    <div className={`prod ${open ? 'open' : ''}`}>
      <div
        className="prod-head"
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={canModify ? () => onStartEdit?.(product.id) : undefined}
        title={canModify ? 'Click to peek parts · double-click to edit' : undefined}
      >
        <ChevronRight size={14} className="chev" />
        <div className="info">
          <div className="name">{product.description || product.code}</div>
          {extraAbbr.length > 0 && (
            <div className="meta">
              {extraAbbr.map((a) => <span key={a} className="abbr">{a}</span>)}
            </div>
          )}
        </div>
        <span className="code-cell">{product.code}</span>
        <span className="depts-cell">
          {touchedDepts.length === 0 ? (
            <span className="badge"><Factory size={10} />—</span>
          ) : (
            touchedDepts.map((d) => (
              <span key={d} className={`badge dept-${d}`}>{d}</span>
            ))
          )}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          {canModify && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => onStartEdit?.(product.id)}
              title="Edit product"
            >
              <Edit2 size={13} />
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="parts">
          {parts.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>No parts mapped yet.</div>
          ) : (
            partsByDept.map(({ dept, items }) => (
              <Fragment key={dept}>
                <div className="dept-divider">
                  <span className={`pill ${dept}`}>{dept}</span>
                  <span className="rule" />
                </div>
                {items.map((pt, i) => (
                  <PartRow key={pt.id} part={pt} index={i} steps={stepsByPart.get(pt.id) || []} />
                ))}
              </Fragment>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Add New Product form
// ============================================================
const emptyStep = () => ({ machine_name: '', alt_machine_names: [], seconds_per_part: 0, setup_time: 0, wood_day_offset: null })
const emptyPart = (department = null) => ({
  name: '', qty_per_unit: 1, part_priority: 1, is_assembly: false, department, steps: [],
})

// Maps a product's saved parts+steps (from AppDataContext) into the form's
// internal `parts` state shape. Used to seed the editor in edit mode. The
// part's `department` is loaded straight off the column — populated by
// migration 015 for legacy rows, by saveProduct on every save since.
export function productPartsToFormState(productId, partsByProduct, stepsByPart) {
  const productParts = partsByProduct.get(productId) || []
  return productParts.map((pt) => ({
    name: pt.name,
    qty_per_unit: pt.qty_per_unit ?? 1,
    part_priority: pt.part_priority ?? 1,
    is_assembly: !!pt.is_assembly,
    department: pt.department || null,
    material_code: pt.material_code,
    length: pt.length,
    width: pt.width,
    thickness: pt.thickness,
    steps: (stepsByPart.get(pt.id) || []).map((s) => ({
      machine_name: s.machine_name,
      alt_machine_names: Array.isArray(s.alt_machine_names) ? [...s.alt_machine_names] : [],
      seconds_per_part: s.seconds_per_part ?? 0,
      setup_time: s.setup_time ?? 0,
      wood_day_offset: s.wood_day_offset ?? null,
    })),
  }))
}

// Live chip editor for products.abbreviations. Each chip = one Access-side
// code that resolves to this product on import. Removing a chip persists
// immediately AND re-flags any orders that resolved through that abbreviation
// (so they bounce back to Reconcile for re-mapping). The chip whose text
// equals the product's primary `code` is locked — the form's save flow uses
// abbreviations[0] as the product code, so removing it would orphan the FK.
function AbbreviationChips({ product, abbrStr, setAbbrStr }) {
  const [busyAbbr, setBusyAbbr] = useState(null)
  const [err, setErr] = useState(null)
  // Cache patchers — surgical updates beat a 3-second full reload.
  const { applyProductPatch, applyOrderUpdate } = useAppData()

  const abbrs = abbrStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (abbrs.length === 0) {
    return <div className="abbr-chips"><span className="empty">No abbreviations yet — type one above (comma to separate) or reconcile an import.</span></div>
  }

  const handleRemove = async (abbr) => {
    if (abbr === product.code) return
    setErr(null); setBusyAbbr(abbr)
    try {
      const { abbreviations: nextAbbrs, reflaggedOrderIds } = await removeAbbreviation({
        productId: product.id,
        productCode: product.code,
        abbreviation: abbr,
      })
      // Sync the comma input so what the user sees matches what's saved.
      setAbbrStr(abbrs.filter((a) => a !== abbr).join(', '))
      // Patch the product's abbreviations + each re-flagged order in the
      // local cache. Avoids a full 12-table refetch for what is really a
      // surgical change.
      applyProductPatch(product.id, { abbreviations: nextAbbrs })
      for (const id of (reflaggedOrderIds || [])) {
        applyOrderUpdate(id, { needs_review: true })
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusyAbbr(null)
    }
  }

  return (
    <div className="abbr-chips">
      {abbrs.map((abbr) => {
        const isPrimary = abbr === product.code
        const busy = busyAbbr === abbr
        return (
          <span key={abbr} className={`chip ${isPrimary ? 'primary' : ''}`}>
            {abbr}
            {isPrimary
              ? <span className="lock" title="Primary code — edit via the input above">Code</span>
              : (
                <button
                  type="button"
                  className="x"
                  onClick={() => handleRemove(abbr)}
                  disabled={busy}
                  title="Remove this abbreviation and re-flag any orders that used it"
                >
                  <X size={12} />
                </button>
              )}
          </span>
        )
      })}
      {err && <span className="err"><X size={11} /> {err}</span>}
    </div>
  )
}

// ProductForm — used in both create mode (collapsible card at the top of the
// screen) and edit mode (inline replacement of a product card). Branches on
// `mode` for the outer shell and for which save-fn it calls.
function ProductForm({
  mode = 'create',
  product = null,
  partsInit = null,
  folders, machines, defaultDept,
  onSaved, onCancel, onDelete,
  refresh,
}) {
  const isEdit = mode === 'edit'
  const [open, setOpen] = useState(isEdit)
  const formRef = useRef(null)
  // Scroll the form into view the first time it mounts in edit mode — the
  // big win when you deep-link from the parts-map modal's "Open in Products"
  // button in a folder with hundreds of products. Harmless when the user
  // clicked Edit on a card they were already looking at.
  useEffect(() => {
    if (!isEdit) return
    const id = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [isEdit])
  const [name, setName] = useState(product?.description || '')
  const [abbrStr, setAbbrStr] = useState(() => {
    if (!product) return ''
    const abbrs = product.abbreviations || []
    return abbrs.length > 0 ? abbrs.join(', ') : (product.code || '')
  })
  const [priority, setPriority] = useState(product?.default_priority ?? 5)
  // `department` is the dispatch-only single-dept dropdown value (a dispatch-
  // only product has no parts and so no tabs to derive a dept from). For
  // multi-dept products the top-level products.department is set on save from
  // deptTabs[0] purely for legacy column compat — the source of truth for
  // multi-dept routing is each part's own department.
  const [department, setDepartment] = useState(product?.department || defaultDept)
  const [folderId, setFolderId] = useState(product?.folder_id || '')
  const [dispatchOnly, setDispatchOnly] = useState(!!product?.is_dispatch_only)
  // Department tabs the user has opened on this product. In create mode start
  // with the Products page's current tab so the first part lands in the right
  // bucket; in edit mode derive from the existing parts' departments.
  const seedTabs = () => {
    if (isEdit) {
      const set = new Set()
      for (const pt of (partsInit || [])) {
        if (pt.department) set.add(pt.department)
      }
      if (set.size === 0 && product?.department) set.add(product.department)
      return [...set]
    }
    return defaultDept ? [defaultDept] : []
  }
  const [deptTabs, setDeptTabs] = useState(seedTabs)
  const [activeDept, setActiveDept] = useState(() => {
    const seeded = seedTabs()
    return seeded[0] || defaultDept || null
  })
  const [deptPickerOpen, setDeptPickerOpen] = useState(false)
  const [parts, setParts] = useState(() => {
    if (partsInit && partsInit.length > 0) return partsInit
    return [emptyPart(defaultDept || null)]
  })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Copy-parts-from-another-product picker — used to clone a sibling
  // product's parts onto this one (e.g. add a steel base routing onto the
  // wood-only coffee table without retyping every machine step).
  const { products: allProducts, getProductWithParts, machineByName } = useAppData()
  const { confirm: confirmDept, dialog: deptConfirmDialog } = useConfirm()

  // Department of each part — the explicit `department` column wins; falls
  // back to the first step's machine.department for legacy parts whose column
  // never got backfilled. Used by the sync-parts flow (it needs to know which
  // dept bucket each source part belongs to) and tab membership.
  const partDept = (pt) => {
    if (pt.department) return pt.department
    for (const s of pt.steps || []) {
      const m = s.machine_name && machineByName?.get(s.machine_name)
      if (m?.department) return m.department
    }
    return null
  }

  // Auto-add a tab whenever a part lands with a dept that doesn't have one
  // yet (e.g. after Copy/Sync brings in parts from a dept this product didn't
  // touch before). Keeps the tab strip honest with the underlying parts.
  useEffect(() => {
    setDeptTabs((tabs) => {
      const set = new Set(tabs)
      for (const pt of parts) {
        const d = partDept(pt)
        if (d) set.add(d)
      }
      if (set.size === tabs.length && tabs.every((t) => set.has(t))) return tabs
      return [...set]
    })
    // partDept reads machineByName for the legacy fallback path. The effect
    // is idempotent so an extra fire after machineByName changes is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, machineByName])
  const [copyPickerOpen, setCopyPickerOpen] = useState(false)
  const [copySearch, setCopySearch] = useState('')
  const [copyNote, setCopyNote] = useState(null)
  // Two-step copy picker: pick source product → pick which depts of the
  // source to copy. Lets the user copy just the steel side of a table
  // (where the base routing is shared across sizes) without overwriting
  // their wood routing.
  const [copySource, setCopySource] = useState(null)
  const [copySelectedDepts, setCopySelectedDepts] = useState(() => new Set())

  const copyCandidates = useMemo(() => {
    const q = copySearch.trim().toLowerCase()
    if (q.length < 2) return []
    return (allProducts || [])
      .filter((p) => p.id !== product?.id)
      .filter((p) =>
        String(p.code || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q),
      )
      .slice(0, 15)
  }, [allProducts, copySearch, product])

  const clonePart = (pt) => ({
    name: pt.name,
    qty_per_unit: pt.qty_per_unit ?? 1,
    part_priority: pt.part_priority ?? 1,
    is_assembly: !!pt.is_assembly,
    // Preserve the source part's department so it lands in the right tab on
    // this product. The effect that watches `parts` auto-adds the tab if it
    // wasn't there yet.
    department: pt.department || null,
    material_code: pt.material_code || '',
    length: pt.length ?? '',
    width: pt.width ?? '',
    thickness: pt.thickness ?? '',
    steps: (pt.steps || []).map((s) => ({
      machine_name: s.machine_name,
      alt_machine_names: Array.isArray(s.alt_machine_names) ? [...s.alt_machine_names] : [],
      seconds_per_part: s.seconds_per_part ?? 0,
      setup_time: s.setup_time ?? 0,
      wood_day_offset: s.wood_day_offset ?? null,
    })),
  })

  // Source-by-dept buckets, so the user can choose to copy just the steel
  // side (or just wood) instead of every part on the source product.
  const copySourceByDept = useMemo(() => {
    if (!copySource) return []
    const groups = new Map()
    for (const pt of copySource.parts || []) {
      const d = partDept(pt) || 'unrouted'
      if (!groups.has(d)) groups.set(d, [])
      groups.get(d).push(pt)
    }
    return [...groups.entries()].map(([dept, items]) => ({ dept, items }))
    // partDept reads machineByName — re-bucket if it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copySource, machineByName])

  const pickCopySource = (sourceProductCode) => {
    const source = getProductWithParts(sourceProductCode)
    if (!source) {
      setCopyNote({ kind: 'err', text: `Could not load ${sourceProductCode}` })
      return
    }
    if (!source.parts || source.parts.length === 0) {
      setCopyNote({ kind: 'err', text: `${source.description || source.code} has no parts to copy` })
      return
    }
    setCopySource(source)
    // Default: select every dept the source has parts in (matches the
    // legacy "copy everything" behaviour as the safe default; user can
    // uncheck depts they don't want).
    const depts = new Set()
    for (const pt of source.parts) depts.add(partDept(pt) || 'unrouted')
    setCopySelectedDepts(depts)
    setCopySearch('')
    setCopyNote(null)
  }

  const toggleCopyDept = (dept) => {
    setCopySelectedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept); else next.add(dept)
      return next
    })
  }

  const cancelCopy = () => {
    setCopySource(null)
    setCopySelectedDepts(new Set())
    setCopySearch('')
  }

  const applyCopy = () => {
    if (!copySource || copySelectedDepts.size === 0) return
    // Drop cloned parts whose name already exists on this product — the DB
    // unique constraint on (product_id, name) would reject them on save.
    // Skip silently and tell the user via the note.
    const existingNames = new Set(
      parts.map((p) => String(p.name || '').trim()).filter(Boolean)
    )
    const allClonedFromSelected = []
    for (const { dept, items } of copySourceByDept) {
      if (!copySelectedDepts.has(dept)) continue
      for (const pt of items) allClonedFromSelected.push(clonePart(pt))
    }
    const cloned = allClonedFromSelected.filter((p) => !existingNames.has(String(p.name || '').trim()))
    const skipped = allClonedFromSelected
      .filter((p) => existingNames.has(String(p.name || '').trim()))
      .map((p) => p.name)
    setParts((prev) => {
      const stripStarter = prev.length === 1 && !prev[0].name && (prev[0].steps || []).every((s) => !s.machine_name)
      const base = stripStarter ? [] : prev
      return [...base, ...cloned]
    })
    const deptList = [...copySelectedDepts].map((d) => d.toUpperCase()).join(' + ')
    const baseNote = `Copied ${cloned.length} part${cloned.length === 1 ? '' : 's'} from ${copySource.description || copySource.code} (${deptList})`
    const skipNote = skipped.length > 0
      ? ` · skipped ${skipped.length} already on this product: ${skipped.join(', ')}`
      : ''
    setCopyNote({
      kind: cloned.length === 0 ? 'err' : 'ok',
      text: `${baseNote}${skipNote} — review and click Save Changes.`,
    })
    setCopySource(null)
    setCopySelectedDepts(new Set())
    setCopyPickerOpen(false)
    setCopySearch('')
  }

  // Sync-parts-from-another-product: per-department REPLACE. Use case is the
  // coffee table variants — same steel base, different wood top times. User
  // picks a source product, picks which dept(s) to sync, those depts get
  // wiped on this product and replaced with the source's parts in those
  // depts. Other depts are left untouched.
  const [syncPickerOpen, setSyncPickerOpen] = useState(false)
  const [syncSearch, setSyncSearch] = useState('')
  const [syncSource, setSyncSource] = useState(null) // resolved product-with-parts
  const [syncSelectedDepts, setSyncSelectedDepts] = useState(() => new Set())
  const [syncNote, setSyncNote] = useState(null)

  const syncCandidates = useMemo(() => {
    const q = syncSearch.trim().toLowerCase()
    if (q.length < 2) return []
    return (allProducts || [])
      .filter((p) => p.id !== product?.id)
      .filter((p) =>
        String(p.code || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q),
      )
      .slice(0, 15)
  }, [allProducts, syncSearch, product])

  // After source is picked, group its parts by dept so the user can pick
  // which buckets to sync. Reuses partDept (machine → dept lookup).
  const syncSourceByDept = useMemo(() => {
    if (!syncSource) return []
    const groups = new Map()
    for (const pt of syncSource.parts || []) {
      const d = partDept(pt) || 'unrouted'
      if (!groups.has(d)) groups.set(d, [])
      groups.get(d).push(pt)
    }
    return [...groups.entries()].map(([dept, items]) => ({ dept, items }))
  }, [syncSource])

  const pickSyncSource = (sourceProductCode) => {
    const source = getProductWithParts(sourceProductCode)
    if (!source) {
      setSyncNote({ kind: 'err', text: `Could not load ${sourceProductCode}` })
      return
    }
    if (!source.parts || source.parts.length === 0) {
      setSyncNote({ kind: 'err', text: `${source.description || source.code} has no parts to sync` })
      return
    }
    setSyncSource(source)
    // Default: select every dept the source has parts in.
    const depts = new Set()
    for (const pt of source.parts) {
      depts.add(partDept(pt) || 'unrouted')
    }
    setSyncSelectedDepts(depts)
    setSyncSearch('')
    setSyncNote(null)
  }

  const toggleSyncDept = (dept) => {
    setSyncSelectedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept); else next.add(dept)
      return next
    })
  }

  const applySync = () => {
    if (!syncSource || syncSelectedDepts.size === 0) return
    // Build the new parts list: keep this product's parts whose dept is NOT
    // being synced; then append cloned source parts for each selected dept.
    const keptFromThis = parts.filter((pt) => {
      const d = partDept(pt) || 'unrouted'
      return !syncSelectedDepts.has(d)
    })
    const incoming = []
    for (const { dept, items } of syncSourceByDept) {
      if (!syncSelectedDepts.has(dept)) continue
      for (const pt of items) incoming.push(clonePart(pt))
    }
    // Drop the empty starter row from this product if it survived the filter.
    const trimmed = keptFromThis.filter((pt, i) => {
      const isStarter = i === 0 && !pt.name && (pt.steps || []).every((s) => !s.machine_name)
      return !isStarter || keptFromThis.length > 1
    })
    const next = [...trimmed, ...incoming]
    // Guard: never end up with zero parts.
    setParts(next.length > 0 ? next : [emptyPart()])
    setSyncNote({
      kind: 'ok',
      text: `Synced ${[...syncSelectedDepts].join(' + ').toUpperCase()} from ${syncSource.description || syncSource.code} — ${incoming.length} part${incoming.length === 1 ? '' : 's'} replaced. Click Save Changes.`,
    })
    setSyncSource(null)
    setSyncSelectedDepts(new Set())
    setSyncPickerOpen(false)
  }

  const cancelSync = () => {
    setSyncSource(null)
    setSyncSelectedDepts(new Set())
    setSyncSearch('')
  }

  const reset = () => {
    if (isEdit) {
      setName(product?.description || '')
      const abbrs = product?.abbreviations || []
      setAbbrStr(abbrs.length > 0 ? abbrs.join(', ') : (product?.code || ''))
      setPriority(product?.default_priority ?? 5)
      setDepartment(product?.department || defaultDept)
      setFolderId(product?.folder_id || '')
      setDispatchOnly(!!product?.is_dispatch_only)
      setParts(partsInit && partsInit.length > 0 ? partsInit : [emptyPart(product?.department || defaultDept || null)])
      const seeded = seedTabs()
      setDeptTabs(seeded)
      setActiveDept(seeded[0] || product?.department || defaultDept || null)
    } else {
      setName(''); setAbbrStr(''); setPriority(5)
      setDepartment(defaultDept); setFolderId('')
      setDispatchOnly(false)
      setParts([emptyPart(defaultDept || null)])
      setDeptTabs(defaultDept ? [defaultDept] : [])
      setActiveDept(defaultDept || null)
    }
    setDeptPickerOpen(false)
    setErrorMsg(null)
  }

  const updatePart = (i, patch) => setParts((arr) => arr.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const updateStep = (pi, si, patch) => setParts((arr) => arr.map((p, idx) => idx === pi
    ? { ...p, steps: p.steps.map((s, jdx) => jdx === si ? { ...s, ...patch } : s) }
    : p))
  const addStep = (pi) => setParts((arr) => arr.map((p, idx) => idx === pi
    ? { ...p, steps: [...p.steps, emptyStep()] }
    : p))
  const removeStep = (pi, si) => setParts((arr) => arr.map((p, idx) => idx === pi
    ? { ...p, steps: p.steps.filter((_, jdx) => jdx !== si) }
    : p))

  // Helpers for the multi-machine pool on a single step. The form-side shape
  // keeps `machine_name` (primary) + `alt_machine_names` (rest) so the save
  // payload stays flat. In the editor we expose them as one flat list so the
  // user just sees "this step can run on any of these machines" with the
  // dispatcher (Phase 2) picking the least-loaded one at slot time.
  const stepMachineList = (s) =>
    [s.machine_name || '', ...(Array.isArray(s.alt_machine_names) ? s.alt_machine_names : [])]
  const writeStepMachineList = (list) => {
    const cleaned = list.map((m) => m || '')
    return { machine_name: cleaned[0] || '', alt_machine_names: cleaned.slice(1) }
  }
  const setStepMachineAt = (pi, si, machineIdx, value) => {
    setParts((arr) => arr.map((p, idx) => {
      if (idx !== pi) return p
      return {
        ...p,
        steps: p.steps.map((s, jdx) => {
          if (jdx !== si) return s
          const list = stepMachineList(s)
          list[machineIdx] = value
          return { ...s, ...writeStepMachineList(list) }
        }),
      }
    }))
  }
  const addStepAltMachine = (pi, si) => {
    setParts((arr) => arr.map((p, idx) => {
      if (idx !== pi) return p
      return {
        ...p,
        steps: p.steps.map((s, jdx) => {
          if (jdx !== si) return s
          return { ...s, alt_machine_names: [...(s.alt_machine_names || []), ''] }
        }),
      }
    }))
  }
  const removeStepMachineAt = (pi, si, machineIdx) => {
    setParts((arr) => arr.map((p, idx) => {
      if (idx !== pi) return p
      return {
        ...p,
        steps: p.steps.map((s, jdx) => {
          if (jdx !== si) return s
          const list = stepMachineList(s)
          list.splice(machineIdx, 1)
          if (list.length === 0) list.push('')
          return { ...s, ...writeStepMachineList(list) }
        }),
      }
    }))
  }
  // New parts inherit the active tab's department so the user can't add a
  // part to the wrong bucket by accident.
  const addPart = () => setParts((arr) => [...arr, emptyPart(activeDept)])
  const removePart = (i) => setParts((arr) => {
    if (arr.length === 1) return arr
    return arr.filter((_, idx) => idx !== i)
  })

  // Department-tab helpers ----------------------------------------------------
  const addDeptTab = (dept) => {
    if (!dept || deptTabs.includes(dept)) {
      setDeptPickerOpen(false)
      return
    }
    setDeptTabs((tabs) => [...tabs, dept])
    setActiveDept(dept)
    setDeptPickerOpen(false)
    // If the only part is an untouched starter row, retag it to the new tab
    // so the user can immediately edit instead of having to add a part first.
    setParts((arr) => {
      if (arr.length === 1 && !arr[0].name && (arr[0].steps || []).every((s) => !s.machine_name)) {
        return [{ ...arr[0], department: dept }]
      }
      return arr
    })
  }

  const removeDeptTab = async (dept) => {
    const partsInDept = parts.filter((pt) => (pt.department || partDept(pt)) === dept)
    if (partsInDept.length > 0) {
      const ok = await confirmDept({
        title: `Remove ${dept.toUpperCase()} side?`,
        body: `This deletes ${partsInDept.length} part${partsInDept.length === 1 ? '' : 's'} on the ${dept} tab. Other departments stay as they are. Save Changes to commit.`,
        confirmLabel: 'Remove department',
      })
      if (!ok) return
    }
    const nextParts = parts.filter((pt) => (pt.department || partDept(pt)) !== dept)
    setParts(nextParts.length > 0 ? nextParts : [emptyPart(null)])
    setDeptTabs((tabs) => {
      const next = tabs.filter((t) => t !== dept)
      // If we just removed the active tab, hop to the first remaining one.
      if (dept === activeDept) setActiveDept(next[0] || null)
      return next
    })
  }

  const handleSave = async () => {
    setErrorMsg(null)
    const abbreviations = abbrStr.split(',').map((s) => s.trim()).filter(Boolean)
    if (!name.trim()) { setErrorMsg('Product name is required'); return }
    if (abbreviations.length === 0) {
      setErrorMsg(isEdit
        ? 'At least one abbreviation is required'
        : 'At least one abbreviation is required (first one becomes the product code)')
      return
    }
    // In edit mode the existing product code stays put — the abbreviations
    // list is purely additive/removable aliases. This avoids the silent
    // rename trap where reordering the comma list would rename the product
    // and collide with another product that already has that code.
    // In create mode the first abbreviation still becomes the new code.
    const code = isEdit ? product.code : abbreviations[0]
    // For a multi-dept product the top-level products.department column is set
    // to the first tab — purely so the legacy column has a value for folder
    // filters & badges. The true set of depts this product touches comes from
    // deptsByCode (aggregated from parts.department). Dispatch-only products
    // skip the tabs entirely and use the single-select dropdown.
    const resolvedDepartment = dispatchOnly
      ? department
      : (deptTabs[0] || department)
    if (!dispatchOnly && deptTabs.length === 0) {
      setErrorMsg('Add at least one department before saving (use the + Add Department button).')
      return
    }
    setSaving(true)
    try {
      const payload = {
        code,
        description: name.trim(),
        abbreviations,
        default_priority: priority,
        department: resolvedDepartment,
        folder_id: folderId || null,
        is_dispatch_only: dispatchOnly,
        // Dispatch-only products carry no parts; the scheduler routes them
        // straight to the dispatch buffer.
        parts: dispatchOnly ? [] : parts.map((pt) => ({
          name: pt.name,
          qty_per_unit: pt.qty_per_unit,
          part_priority: pt.part_priority,
          is_assembly: pt.is_assembly,
          // Stamp the part's department on save. Priority:
          //   1. pt.department — what the editor's tab/+Add Part assigned.
          //   2. partDept(pt) — infer from the first step's machine, so a
          //      legacy part that loaded with department=null doesn't get
          //      wrong-tagged as resolvedDepartment (deptTabs[0]) — that was
          //      the "everything turns into steel" bug.
          //   3. resolvedDepartment — last resort.
          department: pt.department || partDept(pt) || resolvedDepartment,
          steps: pt.steps,
        })),
      }
      const result = isEdit
        ? await updateProductWithParts({ id: product.id, ...payload })
        : await createProductWithParts(payload)

      // Any abbreviations NEW on this save might collide with stub products
      // auto-created by older order imports (e.g. user adds "Camille" to
      // Ch-CamillePNW while a stub product Camille already exists with
      // orders attached). Merge in parallel — each operates on its own
      // stub so there's no contention — and only refresh the cache if any
      // merge actually changed something. This is the big save-time win
      // when 2-3 abbreviations are added at once.
      const oldAbbrs = isEdit ? (product.abbreviations || []) : []
      const newlyAdded = abbreviations.filter((a) => !oldAbbrs.includes(a))
      const savedProductId = result.product?.id
      const savedProductCode = result.product?.code
      let anyMergeChanged = false
      if (savedProductId && savedProductCode && newlyAdded.length > 0) {
        const mergeResults = await Promise.allSettled(newlyAdded.map((abbr) =>
          mergeStubIntoProduct({
            stubCode: abbr,
            realProductId: savedProductId,
            realProductCode: savedProductCode,
          }),
        ))
        const failures = []
        mergeResults.forEach((res, i) => {
          if (res.status === 'rejected') {
            console.warn(`[ProductForm] merge stub ${newlyAdded[i]} failed:`, res.reason)
            failures.push(newlyAdded[i])
          } else if (res.value?.deletedStub || (res.value?.rerouted?.length ?? 0) > 0) {
            anyMergeChanged = true
          }
        })
        if (failures.length > 0) {
          setErrorMsg(`Saved, but merging ${failures.join(', ')} failed — open Reconcile to retry.`)
        }
      }

      if (isEdit) {
        await onSaved?.(result)
        onCancel?.()
      } else {
        reset()
        setOpen(false)
        await onSaved?.(result)
      }
      // Only full-reload when a merge actually mutated other rows —
      // applyProductSave (inside onSaved) already patched local cache for
      // THIS product's parts/steps, so the reload is pure overhead unless
      // orders moved or a stub was deleted.
      if (anyMergeChanged && refresh) refresh()
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // Machines grouped by department for the step dropdown. The active tab's
  // department appears first so the most-likely picks are at the top, but
  // other depts stay listed (cross-dept routing is still allowed — a wooden
  // chair frame might need spray paint from the steel dept's paint booth).
  // Active-machine filter still applies.
  const machinesByDept = useMemo(() => {
    const groups = new Map()
    for (const m of (machines || [])) {
      if (m.active === false) continue
      const d = m.department || 'other'
      if (!groups.has(d)) groups.set(d, [])
      groups.get(d).push(m.name)
    }
    for (const list of groups.values()) list.sort()
    const order = [activeDept, 'steel', 'wood', 'upholstery', 'dispatch', 'other']
      .filter((d, i, arr) => d && arr.indexOf(d) === i)
    return order
      .filter((d) => groups.has(d))
      .map((d) => ({ dept: d, names: groups.get(d) }))
  }, [machines, activeDept])

  return (
    <div className={`card ${isEdit ? 'editing' : ''}`} ref={formRef}>
      <div
        className={`card-head ${isEdit ? 'editing' : ''}`}
        onClick={isEdit ? undefined : () => setOpen((o) => !o)}
      >
        <div className="left">
          {isEdit ? (
            <>
              <Edit2 size={14} style={{ color: 'var(--navy)' }} />
              <span className="title">Edit Product</span>
              <span className="sub-code">{product.code}</span>
            </>
          ) : (
            <>
              <ChevronRight size={16} className={`chev ${open ? 'open' : ''}`} />
              <Plus size={14} style={{ color: 'var(--amber)' }} />
              <span className="title">Add New Product</span>
            </>
          )}
        </div>
        <div className="right" onClick={(e) => e.stopPropagation()}>
          <div className="head-folder">
            <label>Folder</label>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">— None —</option>
              {folders
                .filter((f) => {
                  if (!f.department) return true
                  // Multi-dept products: show folders for any tab the product
                  // touches. Dispatch-only products use the dropdown's value.
                  if (dispatchOnly) return f.department === department
                  return deptTabs.includes(f.department)
                })
                .map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {isEdit && (
            <button type="button" className="ibtn" onClick={onCancel} title="Cancel edit">
              <X size={13} className="ic" /> Cancel
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="card-body">
          {/* Top row: Name + Abbreviations + Priority on one line. The old
              Department dropdown is gone for multi-dept products — tabs below
              own that responsibility. Dispatch-only products keep a single-
              select dropdown further down because they have no parts. */}
          <div className="field-row" style={{ gridTemplateColumns: '2fr 2fr auto' }}>
            <div className="field">
              <label>Product Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bowtie Diner" />
            </div>
            <div className="field">
              <label>
                Abbreviations (comma separated)
                {isEdit && product && (
                  <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'none', letterSpacing: 0 }}>
                    · code <b style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", color: 'var(--ink-2)' }}>{product.code}</b> (locked)
                  </span>
                )}
              </label>
              <input value={abbrStr} onChange={(e) => setAbbrStr(e.target.value)} placeholder="e.g. BTD, BT Diner, RCP-BowR" />
              {isEdit && product && (
                <AbbreviationChips
                  product={product}
                  abbrStr={abbrStr}
                  setAbbrStr={setAbbrStr}
                />
              )}
            </div>
            <div className="field priority-field">
              <label>Priority</label>
              <Stepper value={priority} onChange={setPriority} min={1} max={9} />
            </div>
          </div>

          <div className="field-row" style={{ marginTop: 14 }}>
            <label
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer',
                textTransform: 'none', letterSpacing: 0,
              }}
              title="Tick if this product is supplier-assembled — the scheduler skips routing and places it at dispatch date minus the dispatch dept buffer."
            >
              <input
                type="checkbox"
                checked={dispatchOnly}
                onChange={(e) => setDispatchOnly(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--navy)' }}
              />
              Dispatch only — no machine routing (supplier-assembled)
            </label>
          </div>

          {dispatchOnly && (
            <div className="field-row" style={{ marginTop: 12, maxWidth: 260 }}>
              <div className="field">
                <label>Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {FORM_DEPT_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {!dispatchOnly && (
            <>
              <div className="section-hd" style={{ position: 'relative' }}>
                <span className="label">Parts &amp; Machine Steps</span>
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  <button
                    type="button"
                    className="ibtn"
                    onClick={() => { setCopyPickerOpen((o) => !o); setSyncPickerOpen(false); cancelCopy(); setCopyNote(null) }}
                    title="Append all parts + steps from another product onto this one. Useful for merging a steel-side and a wood-side product into one."
                  >
                    <FolderOpen size={12} className="ic" />
                    {copyPickerOpen ? 'Close picker' : 'Copy parts from…'}
                  </button>
                  <button
                    type="button"
                    className="ibtn"
                    onClick={() => { setSyncPickerOpen((o) => !o); setCopyPickerOpen(false); cancelSync(); setSyncNote(null) }}
                    title="REPLACE this product's parts (per dept) with another's. Use for variants — sync the steel base across all coffee table sizes."
                  >
                    <FolderOpen size={12} className="ic" />
                    {syncPickerOpen ? 'Close picker' : 'Sync parts from…'}
                  </button>
                  <button type="button" className="ibtn" onClick={addPart} disabled={!activeDept}>
                    <Plus size={12} className="ic" /> Add Part
                  </button>
                </div>
              </div>

              {/* Department tab strip — one tab per side of the product. The
                  +Add Department button reveals a small picker with the
                  remaining departments. Removing a tab confirms first when
                  the tab still has parts on it. */}
              <div className="editor-dept-tabs">
                {deptTabs.map((d) => {
                  const count = parts.filter((pt) => (pt.department || partDept(pt)) === d).length
                  const isActive = d === activeDept
                  return (
                    <button
                      type="button"
                      key={d}
                      className={`editor-dept-tab dept-${d} ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveDept(d)}
                      title={`${count} part${count === 1 ? '' : 's'} on the ${d} tab`}
                    >
                      <span>{d}</span>
                      <span className="count">· {count}</span>
                      <span
                        role="button"
                        tabIndex={-1}
                        className="x"
                        title={`Remove ${d} from this product`}
                        onClick={(e) => { e.stopPropagation(); removeDeptTab(d) }}
                      >
                        <X size={12} />
                      </span>
                    </button>
                  )
                })}
                <div className="editor-dept-add-pop">
                  <button
                    type="button"
                    className="editor-dept-add"
                    onClick={() => setDeptPickerOpen((o) => !o)}
                    title="Add another department to this product"
                  >
                    <Plus size={11} /> {deptTabs.length === 0 ? 'Add department' : '+ Add department'}
                  </button>
                  {deptPickerOpen && (
                    <div className="editor-dept-add-menu" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const remaining = FORM_DEPT_OPTIONS.filter((o) => !deptTabs.includes(o.id))
                        if (remaining.length === 0) {
                          return <div className="empty">All departments already added.</div>
                        }
                        return remaining.map((o) => (
                          <button key={o.id} type="button" onClick={() => addDeptTab(o.id)}>
                            {o.label}
                          </button>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              </div>
              {copyPickerOpen && (
                <div
                  style={{
                    border: '1px solid var(--hairline-2)',
                    background: 'var(--surface)',
                    borderRadius: 12, padding: 10, marginTop: 8,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  {!copySource ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                        Copy parts from… (appends to this product)
                      </div>
                      <input
                        autoFocus
                        placeholder="Type a product name or code…"
                        value={copySearch}
                        onChange={(e) => setCopySearch(e.target.value)}
                        style={{
                          padding: '9px 12px', borderRadius: 10,
                          border: '1px solid var(--hairline)', background: 'var(--surface-2)',
                          font: 'inherit', fontSize: 13, color: 'var(--ink)', outline: 0,
                        }}
                      />
                      {copySearch.trim().length >= 2 && copyCandidates.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic', padding: '4px 8px' }}>
                          No products match that.
                        </div>
                      )}
                      {copyCandidates.length > 0 && (
                        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {copyCandidates.map((cand) => (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => pickCopySource(cand.code)}
                              style={{
                                appearance: 'none', border: '1px solid transparent',
                                background: 'transparent', color: 'var(--ink)',
                                font: 'inherit', fontSize: 13, padding: '8px 10px',
                                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                display: 'flex', justifyContent: 'space-between', gap: 10,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <span>{cand.description || cand.code}</span>
                              <span style={{
                                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                                fontSize: 11, color: 'var(--ink-3)',
                              }}>{cand.code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                        Source: <b style={{ color: 'var(--ink)' }}>{copySource.description || copySource.code}</b>
                        <span style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 11, color: 'var(--ink-3)', marginLeft: 8 }}>
                          {copySource.code}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        Pick which department's parts to copy. Existing parts on this product stay as they are; same-name parts from the source are skipped (a part can only have one entry per product).
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {copySourceByDept.map(({ dept, items }) => {
                          const checked = copySelectedDepts.has(dept)
                          return (
                            <label
                              key={dept}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 12px', borderRadius: 10,
                                background: checked ? 'var(--navy-soft)' : 'var(--surface-2)',
                                border: `1px solid ${checked ? 'rgba(31,42,68,0.25)' : 'var(--hairline)'}`,
                                cursor: 'pointer', fontSize: 13,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCopyDept(dept)}
                                style={{ width: 16, height: 16, accentColor: 'var(--navy)' }}
                              />
                              <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, color: 'var(--navy)' }}>
                                {dept}
                              </span>
                              <span style={{ color: 'var(--ink-2)' }}>
                                copy <b>{items.length}</b> part{items.length === 1 ? '' : 's'} from source
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button
                          type="button"
                          className="ibtn"
                          onClick={cancelCopy}
                          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          className="ibtn primary"
                          onClick={applyCopy}
                          disabled={copySelectedDepts.size === 0}
                          style={{
                            background: copySelectedDepts.size === 0 ? 'var(--surface-3)' : 'var(--navy)',
                            color: copySelectedDepts.size === 0 ? 'var(--ink-3)' : 'white',
                            borderColor: copySelectedDepts.size === 0 ? 'var(--hairline-2)' : 'var(--navy)',
                            cursor: copySelectedDepts.size === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Apply Copy
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {copyNote && (
                <div
                  style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 10, fontSize: 12,
                    background: copyNote.kind === 'ok' ? 'var(--green-soft)' : 'var(--red-soft)',
                    color: copyNote.kind === 'ok' ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${copyNote.kind === 'ok' ? 'rgba(76,175,106,0.25)' : 'rgba(210,83,58,0.25)'}`,
                  }}
                >
                  {copyNote.text}
                </div>
              )}
              {syncPickerOpen && (
                <div
                  style={{
                    border: '1px solid var(--hairline-2)',
                    background: 'var(--surface)',
                    borderRadius: 12, padding: 10, marginTop: 8,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  {!syncSource ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                        Sync parts from… (replaces selected depts on this product)
                      </div>
                      <input
                        autoFocus
                        placeholder="Type a product name or code…"
                        value={syncSearch}
                        onChange={(e) => setSyncSearch(e.target.value)}
                        style={{
                          padding: '9px 12px', borderRadius: 10,
                          border: '1px solid var(--hairline)', background: 'var(--surface-2)',
                          font: 'inherit', fontSize: 13, color: 'var(--ink)', outline: 0,
                        }}
                      />
                      {syncSearch.trim().length >= 2 && syncCandidates.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic', padding: '4px 8px' }}>
                          No products match that.
                        </div>
                      )}
                      {syncCandidates.length > 0 && (
                        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {syncCandidates.map((cand) => (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => pickSyncSource(cand.code)}
                              style={{
                                appearance: 'none', border: '1px solid transparent',
                                background: 'transparent', color: 'var(--ink)',
                                font: 'inherit', fontSize: 13, padding: '8px 10px',
                                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                display: 'flex', justifyContent: 'space-between', gap: 10,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <span>{cand.description || cand.code}</span>
                              <span style={{
                                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                                fontSize: 11, color: 'var(--ink-3)',
                              }}>{cand.code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                        Source: <b style={{ color: 'var(--ink)' }}>{syncSource.description || syncSource.code}</b>
                        <span style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 11, color: 'var(--ink-3)', marginLeft: 8 }}>
                          {syncSource.code}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        Pick which department buckets to replace on this product. Unchecked depts stay as they are.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {syncSourceByDept.map(({ dept, items }) => {
                          const checked = syncSelectedDepts.has(dept)
                          const thisHas = parts.filter((pt) => (partDept(pt) || 'unrouted') === dept).length
                          return (
                            <label
                              key={dept}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 12px', borderRadius: 10,
                                background: checked ? 'var(--navy-soft)' : 'var(--surface-2)',
                                border: `1px solid ${checked ? 'rgba(31,42,68,0.25)' : 'var(--hairline)'}`,
                                cursor: 'pointer', fontSize: 13,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSyncDept(dept)}
                                style={{ width: 16, height: 16, accentColor: 'var(--navy)' }}
                              />
                              <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, color: 'var(--navy)' }}>
                                {dept}
                              </span>
                              <span style={{ color: 'var(--ink-2)' }}>
                                replace <b>{thisHas}</b> part{thisHas === 1 ? '' : 's'} on this product with <b>{items.length}</b> from source
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button
                          type="button"
                          className="ibtn"
                          onClick={cancelSync}
                          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          className="ibtn primary"
                          onClick={applySync}
                          disabled={syncSelectedDepts.size === 0}
                          style={{
                            background: syncSelectedDepts.size === 0 ? 'var(--surface-3)' : 'var(--navy)',
                            color: syncSelectedDepts.size === 0 ? 'var(--ink-3)' : 'white',
                            borderColor: syncSelectedDepts.size === 0 ? 'var(--hairline-2)' : 'var(--navy)',
                            cursor: syncSelectedDepts.size === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Apply Sync
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {syncNote && (
                <div
                  style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 10, fontSize: 12,
                    background: syncNote.kind === 'ok' ? 'var(--green-soft)' : 'var(--red-soft)',
                    color: syncNote.kind === 'ok' ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${syncNote.kind === 'ok' ? 'rgba(76,175,106,0.25)' : 'rgba(210,83,58,0.25)'}`,
                  }}
                >
                  {syncNote.text}
                </div>
              )}
            </>
          )}

          {!dispatchOnly && (
            deptTabs.length === 0 ? (
              <div className="editor-empty">
                Click <b>+ Add department</b> above to start adding parts.
              </div>
            ) : (() => {
              // Show only parts belonging to the active tab. Filter preserves
              // original indices so updatePart(pi, ...) still targets the
              // right entry in the flat parts array.
              const visible = parts
                .map((pt, pi) => ({ pt, pi }))
                .filter(({ pt }) => (pt.department || partDept(pt)) === activeDept)
              if (visible.length === 0) {
                return (
                  <div className="editor-empty">
                    No parts yet on the <b>{(activeDept || '').toUpperCase()}</b> side. Click <b>+ Add Part</b> to add one.
                  </div>
                )
              }
              return (
                <div className="parts-list">
                  {visible.map(({ pt, pi }) => (
                    <div key={pi} className="part-group">
                      <div className="part-row">
                        <div className="pname-wrap">
                          <input
                            className="pname-input"
                            value={pt.name}
                            onChange={(e) => updatePart(pi, { name: e.target.value })}
                            placeholder="Part name…"
                          />
                        </div>
                        <div className="field-mini">
                          <span className="mini-label">Qty</span>
                          <Stepper compact value={pt.qty_per_unit} onChange={(v) => updatePart(pi, { qty_per_unit: v })} min={1} />
                        </div>
                        <div className="field-mini">
                          <span className="mini-label">Pri</span>
                          <Stepper compact value={pt.part_priority} onChange={(v) => updatePart(pi, { part_priority: v })} min={1} max={9} />
                        </div>
                        <div className="field-mini">
                          <span className="mini-label">Asm</span>
                          <IOSSwitch on={pt.is_assembly} onChange={(v) => updatePart(pi, { is_assembly: v })} label="Assembly" />
                        </div>
                        <button type="button" className="row-x" onClick={() => removePart(pi)} title="Remove part" disabled={parts.length === 1}>
                          <X size={14} />
                        </button>
                      </div>

                      {pt.steps.length === 0 ? (
                        <div className="steps-empty">No steps — add a machine routing for this part.</div>
                      ) : (
                        <div className="steps">
                          {pt.steps.map((s, si) => {
                            const machineList = stepMachineList(s)
                            return (
                              <div key={si} className="step-row">
                                <span className="num">{si + 1}</span>
                                <div className="machines">
                                  {machineList.map((mn, mi) => (
                                    <div key={mi} className={`machine-pick ${mi > 0 ? 'alt' : ''}`}>
                                      <select
                                        className="machine-select"
                                        value={mn}
                                        onChange={(e) => setStepMachineAt(pi, si, mi, e.target.value)}
                                        title={mi === 0 ? 'Primary machine for this step' : 'Alternative machine — scheduler can route here too'}
                                      >
                                        <option value="">— Select machine —</option>
                                        {machinesByDept.map((g) => (
                                          <optgroup key={g.dept} label={g.dept.toUpperCase()}>
                                            {g.names.map((m) => <option key={m} value={m}>{m}</option>)}
                                          </optgroup>
                                        ))}
                                      </select>
                                      {machineList.length > 1 && (
                                        <button
                                          type="button"
                                          className="alt-x"
                                          onClick={() => removeStepMachineAt(pi, si, mi)}
                                          title="Remove this machine from the pool"
                                        >
                                          <X size={11} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="add-alt-btn"
                                    onClick={() => addStepAltMachine(pi, si)}
                                    title="Add another machine that can run this step. The scheduler picks the least-loaded one (Phase 2)."
                                  >
                                    <Plus size={10} /> alt machine
                                  </button>
                                </div>
                                <div className="secs-with-label">
                                  <Stepper compact jump value={s.seconds_per_part} onChange={(v) => updateStep(pi, si, { seconds_per_part: v })} />
                                  <span className="unit">s</span>
                                </div>
                                {machineByName?.get(s.machine_name)?.department === 'wood' ? (
                                  <div
                                    className={`day-pick ${s.wood_day_offset != null ? 'pinned' : ''}`}
                                    title="Wood conveyor day for this step. Auto = the normal beat (one stage per day, compressed). Pin a number to run this step on that day-offset — give two steps the same number to run them the same day, or a lower number than the beat to jump a stage."
                                  >
                                    <span className="day-label">Day</span>
                                    <select
                                      value={s.wood_day_offset ?? ''}
                                      onChange={(e) => updateStep(pi, si, { wood_day_offset: e.target.value === '' ? null : Number(e.target.value) })}
                                    >
                                      <option value="">Auto</option>
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                                        <option key={d} value={d}>{d}</option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <span className="day-spacer" />
                                )}
                                <button type="button" className="row-x" onClick={() => removeStep(pi, si)} title="Remove step">
                                  <X size={14} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <button type="button" className="add-step-btn" onClick={() => addStep(pi)}>
                        <Plus size={12} /> Add step
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()
          )}
          {deptConfirmDialog}

          {errorMsg && <div className="form-error">{errorMsg}</div>}

          <div className="save-row">
            <button type="button" className="save-btn" onClick={handleSave} disabled={saving}>
              <Save size={15} /> {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Product')}
            </button>
            {isEdit ? (
              <button type="button" className="reset-link" onClick={onCancel} disabled={saving}>Cancel</button>
            ) : (
              <button type="button" className="reset-link" onClick={reset} disabled={saving}>Reset</button>
            )}
          </div>

          {isEdit && onDelete && (
            <div className="danger-zone">
              <span className="label">Deleting a product also removes its parts and machine steps. Orders referencing it will block the delete.</span>
              <button
                type="button"
                className="delete-product-btn"
                onClick={() => onDelete(product)}
                disabled={saving}
              >
                <Trash2 size={14} /> Delete this product
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Folders manager — grouped iOS-style list
// ============================================================
function FoldersManager({ folders, productsCountByFolder, defaultDept, onAdded, onUpdated, onDeleted }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState(defaultDept)
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  const handleAdd = async () => {
    const n = newName.trim()
    if (!n) return
    setBusy(true)
    try {
      const created = await createFolder(n, newDept)
      setNewName('')
      onAdded?.(created)
    } catch (e) {
      window.alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeptChange = async (folder, department) => {
    setBusy(true)
    try {
      await updateFolder(folder.id, { department })
      onUpdated?.(folder.id, { department })
    } catch (e) {
      window.alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (folder) => {
    const ok = await confirm({
      title: `Delete folder "${folder.name}"?`,
      body: 'Products in this folder will move back to "Unfiled". The products themselves are not deleted.',
      confirmLabel: 'Delete folder',
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteFolder(folder.id)
      onDeleted?.(folder.id)
    } catch (e) {
      window.alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-head" onClick={() => setOpen((o) => !o)}>
        <div className="left">
          <ChevronRight size={16} className={`chev ${open ? 'open' : ''}`} />
          <Folder size={14} style={{ color: 'var(--amber)' }} />
          <span className="title">Folders</span>
          <span className="sub-count">{folders.length} folder{folders.length === 1 ? '' : 's'}</span>
        </div>
        <div className="right" onClick={(e) => e.stopPropagation()}>
          <div className="folder-add">
            <select
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              title="Department for new folder"
              style={{ font: 'inherit', fontSize: 13, padding: '9px 12px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', outline: 0, minWidth: 110 }}
            >
              {FORM_DEPT_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="New folder name…"
            />
            <button type="button" className="ibtn primary" onClick={handleAdd} disabled={busy || !newName.trim()}>
              <FolderPlus size={13} className="ic" /> Add
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="card-body">
          {folders.length === 0 ? (
            <div className="folder-empty">No folders yet — create one above to start organising products.</div>
          ) : (
            <div className="folder-list" style={{ marginTop: 12 }}>
              {folders.map((f) => (
                <div key={f.id} className="folder-row">
                  <FolderOpen size={16} className="icn" />
                  <span className="name">{f.name}</span>
                  <select
                    className="folder-dept"
                    value={f.department || ''}
                    onChange={(e) => handleDeptChange(f, e.target.value)}
                    disabled={busy}
                    title="Folder department"
                  >
                    {!f.department && <option value="">— Unassigned —</option>}
                    {FORM_DEPT_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <span className="count">
                    {productsCountByFolder.get(f.id) || 0} product{(productsCountByFolder.get(f.id) || 0) === 1 ? '' : 's'}
                  </span>
                  <button type="button" className="row-x" onClick={() => handleDelete(f)} disabled={busy} title="Delete folder">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {dialog}
    </div>
  )
}

// ============================================================
// Folder accordion (browse side)
// ============================================================
function FolderAccordion({
  title, icon: Icon, products, partsByProduct, stepsByPart,
  canModify, folders, machines, onMoveFolder,
  editingId, onStartEdit, onCancelEdit, onSaved, onDelete,
  refresh,
  searchActive = false,
  defaultOpen = false,
}) {
  // If the user just deep-linked to edit a product in this folder (from the
  // PartsMapModal's "Open in Products" button), force this accordion open.
  // The actual scroll-into-view is handled by ProductForm so we land on the
  // editor itself, not at the top of a 262-product list.
  // Also auto-open whenever a search query is active so matching products
  // aren't hidden inside collapsed accordions.
  const containsEditing = !!editingId && products.some((p) => p.id === editingId)
  const [open, setOpen] = useState(defaultOpen || containsEditing || searchActive)
  useEffect(() => {
    if (containsEditing || searchActive) setOpen(true)
  }, [containsEditing, searchActive])
  return (
    <div className={`folder-acc ${open ? 'open' : ''}`}>
      <div className="folder-acc-head" onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={14} className="chev" />
        <Icon size={15} className="icn" />
        <span className="name">{title}</span>
        <span className="count">{products.length} product{products.length === 1 ? '' : 's'}</span>
      </div>
      <div className="folder-acc-body">
        {products.length === 0 ? (
          <div className="state">No products in this folder match the current filter.</div>
        ) : (
          <>
            <div className="prod-table-head">
              <span />
              <span>Product</span>
              <span>Code</span>
              <span>Departments</span>
              <span />
            </div>
            {products.map((p) => p.id === editingId ? (
              <ProductForm
                key={p.id}
                mode="edit"
                product={p}
                partsInit={productPartsToFormState(p.id, partsByProduct, stepsByPart)}
                folders={folders}
                machines={machines}
                defaultDept={p.department}
                onSaved={onSaved}
                onCancel={onCancelEdit}
                onDelete={onDelete}
                refresh={refresh}
              />
            ) : (
              <ProductCard
                key={p.id}
                product={p}
                parts={partsByProduct.get(p.id) || []}
                stepsByPart={stepsByPart}
                canModify={canModify}
                folders={folders}
                onMoveFolder={onMoveFolder}
                onStartEdit={onStartEdit}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Main screen
// ============================================================
export default function ProductsScreen() {
  const {
    products, partsByProduct, stepsByPart, machines, folders, loading, error, reload,
    deptsByCode,
    applyProductSave, applyProductDelete, applyProductMove,
    applyFolderAdd, applyFolderUpdate, applyFolderDelete,
  } = useAppData()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const canModify = canEdit()
  const [dept, setDept] = useDeptTab('products')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)

  // Deep-link: if we arrived from the PartsMapModal's "Open in Products"
  // button, navigation state carries the product id. Switch to its dept tab
  // (so the product isn't filtered out) and pop it open in edit mode.
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const editId = location.state?.editProductId
    if (!editId) return
    const target = products.find((p) => p.id === editId)
    if (!target) return
    if (target.department) setDept(target.department)
    setEditingId(editId)
    // Clear the state so a refresh/back doesn't keep re-triggering it.
    navigate(location.pathname, { replace: true, state: null })
  }, [location, products, navigate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      // A two-track product (coffee table with steel base + wood top) lives
      // on BOTH dept tabs. Match if either the product's own primary dept
      // equals the tab OR its parts touch that dept via their machines.
      .filter((p) => {
        if (dept === 'all') return true
        if (p.department === dept) return true
        const touched = deptsByCode?.get(p.code)
        return touched ? touched.has(dept) : false
      })
      .filter((p) => !q
        || String(p.code || '').toLowerCase().includes(q)
        || String(p.description || '').toLowerCase().includes(q)
        || (p.abbreviations || []).some((a) => String(a).toLowerCase().includes(q)))
      .sort((a, b) => String(a.description || a.code).localeCompare(String(b.description || b.code)))
  }, [products, dept, query, deptsByCode])

  // Folders visible on the current dept tab. "All Depts" shows every folder.
  // Unassigned (null-department) folders surface on every tab so the user can
  // assign them via the Folders manager dropdown.
  const visibleFolders = useMemo(() => {
    if (dept === 'all') return folders
    return folders.filter((f) => !f.department || f.department === dept)
  }, [folders, dept])

  const grouped = useMemo(() => {
    const byFolder = new Map()
    for (const f of visibleFolders) byFolder.set(f.id, [])
    const unfiled = []
    for (const p of filtered) {
      if (p.folder_id && byFolder.has(p.folder_id)) byFolder.get(p.folder_id).push(p)
      else unfiled.push(p)
    }
    return { byFolder, unfiled }
  }, [filtered, visibleFolders])

  const productsCountByFolder = useMemo(() => {
    const m = new Map()
    for (const p of products) {
      if (p.folder_id) m.set(p.folder_id, (m.get(p.folder_id) || 0) + 1)
    }
    return m
  }, [products])

  const handleMoveFolder = async (productId, folderId) => {
    try {
      await moveProductToFolder(productId, folderId)
      applyProductMove(productId, folderId)
    } catch (e) {
      window.alert(e.message)
    }
  }

  const handleStartEdit = (productId) => setEditingId(productId)
  const handleCancelEdit = () => setEditingId(null)

  const handleSingleDelete = async (product) => {
    const ok = await confirm({
      title: `Delete "${product.description || product.code}"?`,
      body: 'Parts and machine steps are deleted too (cascade). Orders referencing this product will block the delete.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteProduct(product.id)
      if (editingId === product.id) setEditingId(null)
      applyProductDelete(product.id)
    } catch (e) {
      window.alert(`Delete failed: ${e.message}`)
    }
  }

  // Called by ProductForm after create or update. Result shape:
  //   { product, parts: [...], steps: [...] }
  // Patches local state surgically — no full reload.
  const handleProductSaved = (result) => {
    if (!result || !result.product) return
    applyProductSave(result.product.id, result)
  }

  const formDefaultDept = dept === 'all' || dept === 'other' ? 'wood' : dept

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Products</h1>
              <div className="sub">{products.length} products · {folders.length} folder{folders.length === 1 ? '' : 's'} · click to view parts &amp; routing</div>
            </div>
            <div className="topbar-actions"><TopbarActions /></div>
          </div>

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

          <div className="search-row">
            <Search size={14} className="ic" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products by name, code or abbreviation…"
            />
            {query && (
              <button className="ibtn" onClick={() => setQuery('')}>
                <X size={11} className="ic" /> Clear
              </button>
            )}
          </div>

          {canModify && (
            <ProductForm
              mode="create"
              folders={folders}
              machines={machines}
              defaultDept={formDefaultDept}
              onSaved={handleProductSaved}
            />
          )}

          {canModify && (
            <FoldersManager
              folders={visibleFolders}
              productsCountByFolder={productsCountByFolder}
              defaultDept={formDefaultDept}
              onAdded={applyFolderAdd}
              onUpdated={applyFolderUpdate}
              onDeleted={applyFolderDelete}
            />
          )}

          {loading && <div className="state">Loading catalogue…</div>}
          {error && <div className="state err">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="state">{query ? 'No matches.' : 'No products in this department yet.'}</div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <>
              {visibleFolders.map((f) => {
                const list = grouped.byFolder.get(f.id) || []
                if (list.length === 0 && query) return null
                return (
                  <FolderAccordion
                    key={f.id}
                    title={f.name}
                    icon={Folder}
                    products={list}
                    partsByProduct={partsByProduct}
                    stepsByPart={stepsByPart}
                    canModify={canModify}
                    folders={folders}
                    machines={machines}
                    onMoveFolder={handleMoveFolder}
                    editingId={editingId}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onSaved={handleProductSaved}
                    onDelete={handleSingleDelete}
                    refresh={reload}
                    searchActive={!!query.trim()}
                  />
                )
              })}
              {grouped.unfiled.length > 0 && (
                <FolderAccordion
                  title="Unfiled"
                  icon={Box}
                  products={grouped.unfiled}
                  partsByProduct={partsByProduct}
                  stepsByPart={stepsByPart}
                  canModify={canModify}
                  folders={folders}
                  machines={machines}
                  onMoveFolder={handleMoveFolder}
                  editingId={editingId}
                  onStartEdit={handleStartEdit}
                  onCancelEdit={handleCancelEdit}
                  onSaved={handleProductSaved}
                  onDelete={handleSingleDelete}
                  refresh={reload}
                  defaultOpen={folders.length === 0}
                />
              )}
            </>
          )}
        </main>
      </div>
      {confirmDialog}
    </>
  )
}
