import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import { addMachine, updateMachine, deleteMachine, reorderMachines } from '../lib/seedMachines'
import { canEdit, getCurrentUser } from '../lib/auth'
import { checkpointNames } from '../lib/checkpoints'
import { useConfirm } from '../components/ConfirmDialog'
import { useAppData } from '../store/AppDataContext'
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
  GripVertical,
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

.dept-banner { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--ink-2); }
.dept-banner .badge { display: inline-flex; align-items: center; gap: 6px; background: var(--blue-soft); color: var(--blue); font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 7px; }
.dept-banner .badge .ic { color: var(--blue); }

/* ── Card + form fields ────────────────────────────────── */
.card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px 18px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
.card h3 { font-size: 16px; font-weight: 600; margin: 0 0 12px; color: var(--ink); }
.field-grid { display: grid; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; font-weight: 600; color: var(--ink-2); }
.field input, .field select { padding: 9px 11px; border: 1px solid var(--hairline-2); background: var(--surface-2); border-radius: 10px; font: inherit; font-size: 13px; color: var(--ink); }
.field select { appearance: none; }

/* ── Stepper ───────────────────────────────────────────── */
.stepper { display: inline-flex; align-items: center; gap: 6px; }
.stepper button { width: 34px; height: 34px; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink); border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px; }
.stepper button:hover { background: var(--surface-3); }
.stepper input { width: 60px; text-align: center; border: 1px solid var(--hairline-2); border-radius: 8px; padding: 8px 10px; background: var(--surface-2); color: var(--ink); font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; }

/* ── Machines.html inline styles (copied verbatim) ────── */
.add-grid { grid-template-columns: 1.4fr 1.4fr 1fr 1fr; }
.add-grid .bottleneck { grid-column: 1 / 3; display: flex; flex-direction: column; gap: 6px; }
.add-grid .bottleneck label { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; color: var(--ink-2); cursor: pointer; }
.add-grid .bottleneck input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--navy); }
.add-grid .add-btn-cell { grid-column: 3 / -1; display: flex; align-items: flex-end; justify-content: flex-end; }
.add-btn { background: var(--navy); color: white; border: 0; padding: 10px 18px; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 14px rgba(31,42,68,0.22); display: inline-flex; align-items: center; gap: 6px; }
.add-btn .ic { color: white; }

.machines-card h3 { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 12px; }
.mach-row { display: grid; grid-template-columns: 22px 14px 1fr auto auto auto; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid var(--hairline); transition: background 120ms, opacity 120ms; }
.mach-row:first-of-type { border-top: 0; }
.mach-row.drop-above { border-top: 2px solid var(--navy); }
.mach-row.drop-below { border-bottom: 2px solid var(--navy); }
.mach-row.dragging { opacity: 0.35; }
.mach-row .drag-handle { width: 22px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--ink-3); cursor: grab; border-radius: 6px; user-select: none; }
.mach-row .drag-handle:hover { background: var(--surface-2); color: var(--ink-2); }
.mach-row .drag-handle:active { cursor: grabbing; }
.mach-row .swatch { width: 5px; height: 36px; border-radius: 3px; }
.mach-row .info .name { font-size: 14px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; }
.mach-row .info .name .bn { background: var(--amber-soft); color: var(--amber); font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.08em; text-transform: uppercase; }
.mach-row .info .name .day-badge { background: var(--blue-soft); color: var(--blue); font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.06em; text-transform: uppercase; }
.mach-row .info .name .cp-badge { background: var(--teal-soft); color: var(--teal); font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.06em; text-transform: uppercase; }
.mach-row .info .status { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }
.mach-row .info .status.active { color: var(--green); }
.mach-row .util { text-align: right; font-variant-numeric: tabular-nums; }
.mach-row .util .pct { font-size: 13px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
.mach-row .util .min { font-size: 10px; color: var(--ink-3); font-weight: 500; }
.toggle { width: 38px; height: 22px; background: var(--green); border-radius: 999px; position: relative; cursor: pointer; transition: background 160ms; }
.toggle.off { background: var(--surface-3); }
.toggle::after { content: ""; position: absolute; top: 2px; left: 18px; width: 18px; height: 18px; background: white; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 160ms; }
.toggle.off::after { left: 2px; }
.mach-row .edit-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--ink-2); background: var(--surface-2); border: 1px solid var(--hairline-2); border-radius: 7px; cursor: pointer; }
.mach-row .del-btn { display: inline-flex; align-items: center; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--red); background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); border-radius: 7px; cursor: pointer; }

.ic { display: inline-block; vertical-align: middle; }

.edit-back { position: fixed; inset: 0; background: rgba(20,24,32,0.55); display: flex; align-items: center; justify-content: center; z-index: 100; }
.edit-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); box-shadow: 0 20px 60px rgba(0,0,0,0.25); padding: 22px 24px; width: calc(100% - 32px); max-width: 480px; display: flex; flex-direction: column; gap: 14px; }
.edit-card h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
.edit-card .e-sub { font-size: 12px; color: var(--ink-3); margin-top: -8px; }
.edit-card .e-field { display: flex; flex-direction: column; gap: 6px; }
.edit-card .e-field label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
.edit-card .e-field input[type="text"] { padding: 9px 11px; border: 1px solid var(--hairline-2); background: var(--surface-2); border-radius: 10px; font: inherit; font-size: 13px; color: var(--ink); }
.edit-card .swatches { display: grid; grid-template-columns: repeat(10, 1fr); gap: 7px; }
.edit-card .swatch { width: 100%; aspect-ratio: 1 / 1; border-radius: 8px; border: 2px solid transparent; cursor: pointer; padding: 0; transition: transform 100ms ease; }
.edit-card .swatch:hover { transform: translateY(-1px); }
.edit-card .swatch.on { border-color: var(--ink); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
.edit-card .custom-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-2); }
.edit-card .custom-row input[type="color"] { width: 36px; height: 36px; padding: 0; border: 1px solid var(--hairline-2); border-radius: 8px; background: var(--surface-2); cursor: pointer; }
.edit-card .e-actions { display: flex; gap: 8px; align-items: center; padding-top: 10px; border-top: 1px dashed var(--hairline); }
.edit-card .e-actions button { padding: 9px 16px; font: inherit; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.edit-card .e-cancel { background: var(--surface-2); border-color: var(--hairline-2); color: var(--ink-2); }
.edit-card .e-save { background: var(--navy); color: white; box-shadow: 0 6px 14px rgba(31,42,68,0.22); }
.edit-card .e-save:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.edit-card .e-delete { background: var(--red-soft); color: var(--red); border-color: rgba(210,83,58,0.25); }
.edit-card .e-delete:hover:not(:disabled) { background: var(--red); color: white; border-color: var(--red); }
.edit-card .e-delete:disabled { opacity: 0.55; cursor: not-allowed; }
.edit-card .e-err { font-size: 12px; color: var(--red); }
.edit-card .bn-toggle { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 500; color: var(--ink-2); cursor: pointer; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--hairline-2); border-radius: 10px; }
.edit-card .bn-toggle input { width: 16px; height: 16px; accent-color: var(--navy); cursor: pointer; }
.edit-card .cp-picks { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.edit-card .cp-pick { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink-2); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.edit-card .cp-pick:hover { background: var(--teal-soft); color: var(--teal); border-color: rgba(58,154,175,0.35); }
.edit-card .cp-pick.on { background: var(--teal); color: #fff; border-color: var(--teal); }
`

// UI tab id → value stored in `machines.department`.
const UI_TO_DB_DEPT = {
  steel: 'steel',
  wood: 'wood',
  uphol: 'upholstery',
  disp: 'dispatch',
}
const DEPT_LABEL = {
  all: 'All Departments',
  steel: 'Steel Department',
  wood: 'Wood Department',
  uphol: 'Upholstery Department',
  disp: 'Dispatching Department',
}

const COLOR_SWATCHES = [
  { name: 'Red', hex: '#d2533a' },
  { name: 'Amber', hex: '#e89a3c' },
  { name: 'Yellow', hex: '#d4a531' },
  { name: 'Green', hex: '#4caf6a' },
  { name: 'Teal', hex: '#3a9aaf' },
  { name: 'Blue', hex: '#4677c8' },
  { name: 'Purple', hex: '#8b5fbf' },
  { name: 'Navy', hex: '#1f2a44' },
  { name: 'Slate', hex: '#4a4e5a' },
  { name: 'Grey', hex: '#9aa0ad' },
]
const DEFAULT_COLOR = '#9aa0ad'

// Wood "day conveyor": each wood machine runs on a fixed day of the production
// week. 0 = Monday (first day of manufacturing) … 4 = Friday (finishing). A part
// can only advance to a machine on that machine's day. '' = unassigned.
const WOOD_DAY_OPTIONS = [
  { value: '', label: 'Unassigned' },
  { value: 0, label: 'Day 0 — Mon (start)' },
  { value: 1, label: 'Day 1 — Tue' },
  { value: 2, label: 'Day 2 — Wed' },
  { value: 3, label: 'Day 3 — Thu' },
  { value: 4, label: 'Day 4 — Fri (finishing)' },
]
const woodDayShort = (d) =>
  d == null || d === '' ? null : `Day ${d}`

function MachRow({
  m, onEdit, onToggle, toggleBusy, canModify = true,
  draggable = false, isDragging = false, dropAbove = false, dropBelow = false,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) {
  const on = m.active !== false
  const statusText = !on ? 'Disabled' : (m.area || 'Active')
  const classes = ['mach-row']
  if (isDragging) classes.push('dragging')
  if (dropAbove) classes.push('drop-above')
  if (dropBelow) classes.push('drop-below')
  return (
    <div
      className={classes.join(' ')}
      style={{ opacity: on && !isDragging ? 1 : isDragging ? 0.35 : 0.55 }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {canModify ? (
        <span className="drag-handle" title="Drag to reorder">
          <GripVertical size={14} />
        </span>
      ) : <span />}
      <span className="swatch" style={{ background: m.color }} />
      <div className="info">
        <div className="name">
          {m.name} {m.bn && <span className="bn">Bottleneck</span>}
          {m.woodDay != null && m.woodDay !== '' && (
            <span className="day-badge">{woodDayShort(m.woodDay)}</span>
          )}
          {m.checkpoint && (
            <span className="cp-badge" title="Checkpoint group this machine belongs to">{m.checkpoint}</span>
          )}
        </div>
        <div className={`status ${on ? 'active' : ''}`}>{statusText}</div>
      </div>
      <div className="util">
        <div className="pct">{m.util}%</div>
        <div className="min">{m.min}min</div>
      </div>
      {canModify && (
        <div
          className={`toggle ${on ? '' : 'off'}`}
          style={{ opacity: toggleBusy ? 0.5 : 1, pointerEvents: toggleBusy ? 'none' : 'auto' }}
          onClick={onToggle}
        />
      )}
      {canModify && (
        <button className="edit-btn" onClick={onEdit}><I n="edit" s={11} /> Edit</button>
      )}
    </div>
  )
}

function EditMachineModal({ machine, allMachines, onCancel, onSaved, onDeleted }) {
  const [name, setName] = useState(machine.name || '')
  const [area, setArea] = useState(machine.area || '')
  const [color, setColor] = useState(machine.color || DEFAULT_COLOR)
  const [bottleneck, setBottleneck] = useState(Boolean(machine.bottleneck))
  const [setupTime, setSetupTime] = useState(Number(machine.setup_time_min) || 0)
  const [woodDay, setWoodDay] = useState(machine.wood_day == null ? '' : machine.wood_day)
  const [checkpoint, setCheckpoint] = useState(machine.checkpoint || '')
  const isWood = machine.department === 'wood'
  // Existing groups in THIS department — picking one from the list is how a
  // machine joins an existing checkpoint instead of starting a new one by typo.
  const cpOptions = useMemo(
    () => checkpointNames(allMachines, machine.department),
    [allMachines, machine.department],
  )
  const [rate, setRate] = useState(machine.rate_per_hour != null ? String(machine.rate_per_hour) : '')
  // Labour rate is sensitive — only the Boss can see or edit it.
  const isBoss = getCurrentUser()?.role === 'Boss'
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const trimmedName = name.trim()
  const trimmedArea = area.trim()
  const dirty =
    trimmedName !== (machine.name || '').trim() ||
    trimmedArea !== (machine.area || '').trim() ||
    color !== (machine.color || DEFAULT_COLOR) ||
    bottleneck !== Boolean(machine.bottleneck) ||
    setupTime !== (Number(machine.setup_time_min) || 0) ||
    checkpoint.trim() !== (machine.checkpoint || '').trim() ||
    (isWood && (woodDay === '' ? null : Number(woodDay)) !== (machine.wood_day ?? null)) ||
    (isBoss && (rate === '' ? null : Math.max(0, Number(rate) || 0)) !== (machine.rate_per_hour ?? null))
  const busy = saving || deleting
  const canSave = trimmedName.length > 0 && dirty && !busy

  const save = () => {
    // Optimistic close: build the patch the user just made, hand it to
    // onSaved synchronously so the modal closes + cache updates with no
    // wait, then fire-and-forget the Supabase write. The heavy cache
    // recompute (lookups/enrichedOrders) used to block the modal close
    // for several seconds — now it happens AFTER the modal is gone.
    const patch = {
      name: trimmedName,
      area: trimmedArea || null,
      color,
      bottleneck,
      setup_time_min: Math.max(0, Number(setupTime) || 0),
      checkpoint: checkpoint.trim() || null,
    }
    // Wood machines carry a conveyor day; other depts ignore the column.
    if (isWood) patch.wood_day = woodDay === '' ? null : Number(woodDay)
    // Only the Boss may write the labour rate.
    if (isBoss) patch.rate_per_hour = rate === '' ? null : Math.max(0, Number(rate) || 0)
    onSaved({ ...machine, ...patch })
    updateMachine(machine.id, patch).catch((e) => {
      // Local cache shows the new value but server didn't take it. Surface
      // the failure prominently so the user knows to retry.
      // eslint-disable-next-line no-alert
      alert(`Saved locally but server rejected the change: ${e.message || e}\n\nThe page will revert on next refresh.`)
    })
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this machine?',
      body: `${machine.name} will be removed from ${machine.department}. Any orders routed through it will lose this step.`,
      confirmLabel: 'Delete machine',
    })
    if (!ok) return
    setDeleting(true)
    setError(null)
    try {
      await deleteMachine(machine.id)
      onDeleted(machine.id)
    } catch (e) {
      setError(e.message || String(e))
      setDeleting(false)
    }
  }

  return (
    <div className="edit-back" role="dialog" aria-modal="true" onClick={busy ? undefined : onCancel}>
      <div className="edit-card" onClick={(e) => e.stopPropagation()}>
        <h3>Edit machine</h3>
        <div className="e-sub">{machine.department}</div>
        <div className="e-field">
          <label>Machine name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="e-field">
          <label>Area / station</label>
          <input type="text" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Cutting Bay" />
        </div>
        <div className="e-field">
          <label>Colour</label>
          <div className="swatches">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`swatch ${color.toLowerCase() === c.hex.toLowerCase() ? 'on' : ''}`}
                style={{ background: c.hex }}
                title={c.name}
                onClick={() => setColor(c.hex)}
              />
            ))}
          </div>
          <div className="custom-row">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <span>Custom: <b style={{ color: 'var(--ink)' }}>{color}</b></span>
          </div>
        </div>
        <div className="e-field">
          <label>Bottleneck</label>
          <label className="bn-toggle">
            <input type="checkbox" checked={bottleneck} onChange={(e) => setBottleneck(e.target.checked)} />
            <span>Treat as bottleneck — scheduler uses this machine to set production duration</span>
          </label>
        </div>
        <div className="e-field">
          <label>Setup time (min)</label>
          <Stepper value={setupTime} onChange={setSetupTime} step={5} min={0} />
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            Charged once per product per day on this machine. Same product back-to-back skips setup.
          </div>
        </div>
        <div className="e-field">
          <label>Checkpoint</label>
          <input
            type="text"
            list={`cp-list-${machine.id}`}
            value={checkpoint}
            onChange={(e) => setCheckpoint(e.target.value)}
            placeholder="e.g. Cutting — leave blank for none"
          />
          <datalist id={`cp-list-${machine.id}`}>
            {cpOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
          {cpOptions.length > 0 && (
            <div className="cp-picks">
              {cpOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cp-pick ${checkpoint.trim() === c ? 'on' : ''}`}
                  onClick={() => setCheckpoint(checkpoint.trim() === c ? '' : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            Machines sharing a checkpoint name form one group. Tracking shows how many parts of an order are through the whole group.
          </div>
        </div>
        {isWood && (
        <div className="e-field">
          <label>Conveyor day</label>
          <select
            value={woodDay}
            onChange={(e) => setWoodDay(e.target.value === '' ? '' : Number(e.target.value))}
            style={{ padding: '9px 11px', border: '1px solid var(--hairline-2)', background: 'var(--surface-2)', borderRadius: 10, font: 'inherit', fontSize: 13, color: 'var(--ink)', appearance: 'none' }}
          >
            {WOOD_DAY_OPTIONS.map((o) => (
              <option key={String(o.value)} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            Which day of the production week this machine runs. Parts only reach it on this day.
          </div>
        </div>
        )}
        {isBoss && (
        <div className="e-field">
          <label>Labour rate (R / hour)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>R</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.00"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>/ hour</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            Used by the Labour Costing screen to price machine time. Leave blank if unknown.
          </div>
        </div>
        )}
        {error && <div className="e-err">{error}</div>}
        <div className="e-actions">
          <button className="e-delete" type="button" onClick={handleDelete} disabled={busy}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="e-cancel" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="e-save" type="button" onClick={save} disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}

function Stepper({ value = 0, onChange, step = 5, min = 0 }) {
  // Controlled when onChange is provided; otherwise local-state fallback
  // (legacy behaviour for any call site that doesn't yet wire up state).
  const [local, setLocal] = useState(value)
  const v = onChange ? value : local
  const set = (next) => {
    const clamped = Math.max(min, next)
    if (onChange) onChange(clamped)
    else setLocal(clamped)
  }
  return (
    <div className="stepper">
      <button type="button" onClick={() => set(v - step)}>−{step}</button>
      <button type="button" onClick={() => set(v - 1)}>−</button>
      <input value={v} onChange={(e) => set(Number(e.target.value) || 0)} />
      <button type="button" onClick={() => set(v + 1)}>+</button>
      <button type="button" onClick={() => set(v + step)}>+{step}</button>
    </div>
  )
}

export default function MachinesScreen() {
  const {
    machines: allMachines, loading, error,
    applyMachineUpsert, applyMachineDelete, applyMachineReorder,
  } = useAppData()
  const [dept, setDept] = useDeptTab('machines')
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const canModify = canEdit()

  // Add Machine form state
  const [formName, setFormName] = useState('')
  const [formArea, setFormArea] = useState('')
  const [formColor, setFormColor] = useState(COLOR_SWATCHES[0].hex)
  const [formBottleneck, setFormBottleneck] = useState(false)
  const [formSetupTime, setFormSetupTime] = useState(0)
  const [formWoodDay, setFormWoodDay] = useState('')
  const [formCheckpoint, setFormCheckpoint] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  const dbDept = UI_TO_DB_DEPT[dept] // null when dept === 'all'
  const cpOptions = useMemo(() => checkpointNames(allMachines, dbDept), [allMachines, dbDept])
  const canAdd = !!dbDept && formName.trim().length > 0 && !adding

  // Drag-to-reorder state.
  //  - dragIndex     : the row being dragged (in the sorted list)
  //  - dragOverIndex : the row the pointer is currently over
  //  - pendingOrder  : optimistic local override of machine IDs while the
  //                    server-side reorder + refresh round-trips. Lets the
  //                    user see the new position instantly instead of a flash
  //                    back to the old order until refresh lands.
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [pendingOrder, setPendingOrder] = useState(null)

  // Switching dept tabs invalidates any pending reorder — that ID list was
  // for the previous dept's slice.
  useEffect(() => {
    setPendingOrder(null)
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dept])

  // Filter the cached machines by the active dept tab — pure in-memory.
  // Sort by display_order (the drag-and-drop position); fall back to name
  // for ties or for legacy rows with display_order=0.
  const machines = useMemo(() => {
    const baseList = dbDept ? allMachines.filter((m) => m.department === dbDept) : allMachines
    if (pendingOrder) {
      const byId = new Map(baseList.map((m) => [m.id, m]))
      const ordered = pendingOrder.map((id) => byId.get(id)).filter(Boolean)
      // Surface any rows that arrived since the pending order was captured —
      // they get appended so they're not silently hidden.
      const seen = new Set(pendingOrder)
      for (const m of baseList) if (!seen.has(m.id)) ordered.push(m)
      return ordered
    }
    return [...baseList].sort((a, b) => {
      const aO = a.display_order ?? 0
      const bO = b.display_order ?? 0
      if (aO !== bO) return aO - bO
      return a.name.localeCompare(b.name)
    })
  }, [allMachines, dbDept, pendingOrder])

  const handleDragStart = (i) => (e) => {
    setDragIndex(i)
    // Required for Firefox to actually start the drag.
    try { e.dataTransfer.setData('text/plain', String(i)) } catch { /* noop */ }
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (i) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== i) setDragOverIndex(i)
  }
  const handleDragLeave = () => {
    // No-op — leaving one row immediately means we're entering another and
    // its onDragOver will set the index. Clearing here causes flicker.
  }
  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }
  const handleDrop = (toIndex) => async (e) => {
    e.preventDefault()
    const from = dragIndex
    setDragIndex(null)
    setDragOverIndex(null)
    if (from == null || from === toIndex) return
    const next = [...machines]
    const [moved] = next.splice(from, 1)
    // If the destination is after the source, the array index shifts by 1
    // because we already pulled the source out.
    const insertAt = toIndex > from ? toIndex - 1 : toIndex
    next.splice(insertAt, 0, moved)
    const orderedIds = next.map((m) => m.id)
    setPendingOrder(orderedIds)
    try {
      await reorderMachines(orderedIds)
      // Patch the cache with the new positions so the sort settles instantly
      // — pendingOrder can drop because the underlying display_order is now
      // correct in the cache too.
      applyMachineReorder(orderedIds)
      setPendingOrder(null)
    } catch (err) {
      setPendingOrder(null)
      alert(`Reorder failed: ${err.message || err}`)
    }
  }

  const handleAdd = async () => {
    if (!canAdd) return
    setAdding(true)
    setAddError(null)
    try {
      const created = await addMachine(formName.trim(), dbDept, {
        area: formArea.trim() || null,
        color: formColor,
        bottleneck: formBottleneck,
        setup_time_min: formSetupTime,
        wood_day: dbDept === 'wood' && formWoodDay !== '' ? Number(formWoodDay) : null,
        checkpoint: formCheckpoint.trim() || null,
      })
      setFormName('')
      setFormArea('')
      setFormColor(COLOR_SWATCHES[0].hex)
      setFormBottleneck(false)
      setFormSetupTime(0)
      setFormWoodDay('')
      setFormCheckpoint('')
      applyMachineUpsert(created)
    } catch (e) {
      setAddError(e.message || String(e))
    } finally {
      setAdding(false)
    }
  }

  const handleToggle = async (machine) => {
    const next = machine.active === false
    setTogglingId(machine.id)
    try {
      const updated = await updateMachine(machine.id, { active: next })
      applyMachineUpsert(updated)
    } catch (e) {
      alert(`Failed to toggle machine: ${e.message || e}`)
    } finally {
      setTogglingId(null)
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
              <h1>Machines</h1>
              <div className="sub">Add and manage production stations</div>
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

          <div className="dept-banner">
            <span className="badge"><I n="factory" s={12} /> {DEPT_LABEL[dept]}</span>
            <span>— {loading ? 'loading…' : `${machines.length} machine${machines.length === 1 ? '' : 's'}`}</span>
          </div>

          {canModify && (
          <div className="card">
            <h3 style={{ marginBottom: 14 }}>Add Machine / Station</h3>
            <div className="field-grid add-grid">
              <div className="field">
                <label>Machine Name</label>
                <input
                  placeholder="e.g. Tube Laser"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Area / Station</label>
                <input
                  placeholder="e.g. Cutting Bay"
                  value={formArea}
                  onChange={(e) => setFormArea(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Setup Time (min)</label>
                <Stepper value={formSetupTime} onChange={setFormSetupTime} step={5} min={0} />
              </div>
              {dept === 'wood' && (
              <div className="field">
                <label>Conveyor Day</label>
                <select value={formWoodDay} onChange={(e) => setFormWoodDay(e.target.value)}>
                  {WOOD_DAY_OPTIONS.map((o) => (
                    <option key={String(o.value)} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              )}
              <div className="field">
                <label>Checkpoint</label>
                <input
                  list="cp-list-add"
                  placeholder="e.g. Cutting"
                  value={formCheckpoint}
                  onChange={(e) => setFormCheckpoint(e.target.value)}
                />
                <datalist id="cp-list-add">
                  {cpOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="field">
                <label>Colour</label>
                <select value={formColor} onChange={(e) => setFormColor(e.target.value)}>
                  {COLOR_SWATCHES.map(c => (
                    <option key={c.hex} value={c.hex}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="bottleneck">
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', letterSpacing: 0.02 }}>Bottleneck Machine</label>
                <label>
                  <input
                    type="checkbox"
                    checked={formBottleneck}
                    onChange={(e) => setFormBottleneck(e.target.checked)}
                  /> Priority feed (never idle)
                </label>
              </div>
              <div className="add-btn-cell" style={{ flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {dept === 'all' && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Pick a department tab first.</div>
                )}
                {addError && (
                  <div style={{ fontSize: 11, color: 'var(--red)', maxWidth: 280, textAlign: 'right' }}>{addError}</div>
                )}
                <button className="add-btn" onClick={handleAdd} disabled={!canAdd}>
                  <I n="plus" s={12} /> {adding ? 'Adding…' : 'Add Machine'}
                </button>
              </div>
            </div>
          </div>
          )}

          <div className="card machines-card">
            <h3>Machines</h3>
            {loading && <div style={{ padding: '14px 0', color: 'var(--ink-3)', fontSize: 12 }}>Loading machines…</div>}
            {error && <div style={{ padding: '14px 0', color: 'var(--red)', fontSize: 12 }}>Failed to load: {error}</div>}
            {!loading && !error && machines.length === 0 && (
              <div style={{ padding: '14px 0', color: 'var(--ink-3)', fontSize: 12 }}>
                No machines for this department yet. Use "Seed Machines" on the Import screen, or add one above.
              </div>
            )}
            {!loading && !error && machines.map((m, i) => {
              // dropAbove/below shows a 2px navy line where the row will land
              // when released. When dragging downward we land BELOW the
              // hovered row; upward we land ABOVE. Encoded as the relationship
              // between dragIndex and dragOverIndex.
              const isHover = dragOverIndex === i && dragIndex != null && dragIndex !== i
              const dropAbove = isHover && dragIndex > i
              const dropBelow = isHover && dragIndex < i
              return (
                <MachRow
                  key={m.id}
                  m={{
                    name: m.name,
                    color: m.color || DEFAULT_COLOR,
                    area: m.area,
                    bn: m.bottleneck,
                    woodDay: m.department === 'wood' ? m.wood_day : null,
                    checkpoint: m.checkpoint,
                    active: m.active,
                    util: 0,
                    min: 0,
                  }}
                  onEdit={() => setEditing(m)}
                  onToggle={() => handleToggle(m)}
                  toggleBusy={togglingId === m.id}
                  canModify={canModify}
                  draggable={canModify}
                  isDragging={dragIndex === i}
                  dropAbove={dropAbove}
                  dropBelow={dropBelow}
                  onDragStart={handleDragStart(i)}
                  onDragOver={handleDragOver(i)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop(i)}
                  onDragEnd={handleDragEnd}
                />
              )
            })}
          </div>
          {editing && (
            <EditMachineModal
              machine={editing}
              allMachines={allMachines}
              onCancel={() => setEditing(null)}
              onSaved={(updated) => { setEditing(null); applyMachineUpsert(updated) }}
              onDeleted={(id) => { setEditing(null); applyMachineDelete(id) }}
            />
          )}
        </main>
      </div>
    </>
  )
}
