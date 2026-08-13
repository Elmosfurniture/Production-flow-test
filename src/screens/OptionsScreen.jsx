import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import {
  Search,
  Clock,
  Key,
  Moon,
  Sun,
  Printer,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  ShieldCheck,
  Hammer,
  Scissors,
  Activity,
  Truck,
  Users,
  UserPlus,
  Calendar,
  Sprout,
} from 'lucide-react'
import {
  listHolidays,
  addHoliday,
  deleteHoliday,
  seedSaHolidays2026,
  listDepartmentBuffers,
  setBufferDays as saveBufferDays,
} from '../lib/scheduleConfig'
import {
  listEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee as deleteEmployeeRow,
} from '../lib/employees'
import { useConfirm } from '../components/ConfirmDialog'
import { useTheme } from '../lib/useTheme'

const ROLES = ['Boss', 'Manager', 'Worker']
const DEPT_META = [
  { id: 'steel', label: 'Steel', icon: Hammer, color: '#4677c8' },
  { id: 'wood', label: 'Wood', icon: Scissors, color: '#4caf6a' },
  { id: 'uphol', label: 'Upholstery', icon: Activity, color: '#8b5fbf' },
  { id: 'disp', label: 'Dispatching', icon: Truck, color: '#e89a3c' },
]
// UI dept id → value stored in DB columns (department_settings.department,
// employees.departments[]).
const DEPT_DB_NAME = { steel: 'steel', wood: 'wood', uphol: 'upholstery', disp: 'dispatch' }
const DEPT_UI_NAME = { steel: 'steel', wood: 'wood', upholstery: 'uphol', dispatch: 'disp' }
const dbDeptsToUi = (arr) => (arr || []).map((d) => DEPT_UI_NAME[d] || d).filter(Boolean)
const uiDeptsToDb = (arr) => (arr || []).map((d) => DEPT_DB_NAME[d] || d).filter(Boolean)

// Build a UI-shape employee object from a DB row. The raw `pin` is kept on
// the object because Options is Boss-only (see App.jsx RoleGate) and Bosses
// want to see every employee's PIN.
const toUiEmployee = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  depts: dbDeptsToUi(row.departments),
  pin: row.pin || null,
  pinSet: !!row.pin,
})

const INITIAL_DEPTS = [
  { id: 'steel', allowedRoles: ['Boss', 'Manager', 'Worker'], enabled: true },
  { id: 'wood', allowedRoles: ['Boss', 'Manager', 'Worker'], enabled: true },
  { id: 'uphol', allowedRoles: ['Boss', 'Manager', 'Worker'], enabled: true },
  { id: 'disp', allowedRoles: ['Boss', 'Manager'], enabled: true },
]

const emptyForm = { name: '', role: 'Worker', depts: [], pin1: '', pin2: '' }

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
  --r-md: 16px;
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
  margin: 0; padding: 0; min-height: 100vh;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: var(--ink); letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%);
}

.main { padding: 22px 28px 60px; min-width: 0; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 22px; }
.topbar h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.025em; margin: 0; line-height: 1.1; color: var(--ink); }
.topbar .sub { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
.topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ibtn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; padding: 9px 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(26,29,36,0.04); transition: background 160ms; }
.ibtn:hover { background: var(--surface-2); }
.ibtn .ic { width: 15px; height: 15px; color: var(--ink-2); }
.ibtn.primary { background: var(--navy); color: white; border-color: var(--navy); box-shadow: 0 6px 14px rgba(31,42,68,0.22); }
.ibtn.primary:hover { background: #2a3656; }
.ibtn.primary .ic { color: white; }

/* ── Section card ───────────────────────────────────── */
.section { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 20px; margin-bottom: 24px; box-shadow: var(--shadow-card); }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-head h2 { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin: 0; }
.section-head .count { font-size: 11px; color: var(--ink-3); margin-left: 8px; font-weight: 500; letter-spacing: 0.02em; }
.section-head .add-btn { background: var(--navy); color: white; border: 0; padding: 9px 16px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 14px rgba(31,42,68,0.22); display: inline-flex; align-items: center; gap: 7px; transition: background 160ms; }
.section-head .add-btn:hover { background: #2a3656; }
.section-head .add-btn .ic { color: white; }

/* ── Employee cards ─────────────────────────────────── */
.emp-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.emp-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; transition: transform 140ms, box-shadow 140ms; }
.emp-card:hover { transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 14px 30px rgba(26,29,36,0.08); }
.emp-head { display: flex; align-items: flex-start; gap: 12px; }
.emp-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--navy); color: white; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; flex-shrink: 0; }
.emp-avatar.boss { background: var(--navy); }
.emp-avatar.manager { background: var(--amber); }
.emp-avatar.worker { background: var(--blue); }
.emp-id { flex: 1; min-width: 0; }
.emp-id .name { font-size: 15px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.emp-id .role-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.role-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; letter-spacing: 0.06em; text-transform: uppercase; }
.role-pill.boss { background: var(--navy); color: white; }
.role-pill.manager { background: var(--amber-soft); color: var(--amber); }
.role-pill.worker { background: var(--blue-soft); color: var(--blue); }

.dept-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.dept-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 999px; background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--hairline); }
.dept-tag .ic { width: 11px; height: 11px; }
.dept-tag.steel { background: var(--blue-soft); color: var(--blue); border-color: rgba(70,119,200,0.2); }
.dept-tag.wood { background: var(--green-soft); color: var(--green); border-color: rgba(76,175,106,0.22); }
.dept-tag.uphol { background: var(--purple-soft); color: var(--purple); border-color: rgba(139,95,191,0.22); }
.dept-tag.disp { background: var(--amber-soft); color: var(--amber); border-color: rgba(232,154,60,0.24); }

.pin-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; align-self: flex-start; }
.pin-status.set { background: var(--green-soft); color: var(--green); }
.pin-status.unset { background: var(--red-soft); color: var(--red); }
.pin-status .ic { width: 11px; height: 11px; }

.emp-foot { display: flex; gap: 6px; justify-content: flex-end; padding-top: 8px; border-top: 1px dashed var(--hairline); }
.btn-edit { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; font-size: 12px; font-weight: 600; color: var(--ink-2); background: var(--surface-2); border: 1px solid var(--hairline-2); border-radius: 9px; cursor: pointer; transition: background 160ms; }
.btn-edit:hover { background: var(--surface); color: var(--ink); }
.btn-edit .ic { width: 12px; height: 12px; }
.btn-del { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; font-size: 12px; font-weight: 600; color: var(--red); background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); border-radius: 9px; cursor: pointer; transition: background 160ms; }
.btn-del:hover { background: rgba(210,83,58,0.18); }
.btn-del .ic { width: 12px; height: 12px; }

/* ── Form panel ─────────────────────────────────────── */
.form-panel { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 18px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 14px; }
.form-panel h3 { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: var(--ink); margin: 0; display: flex; align-items: center; gap: 8px; }
.form-panel h3 .ic { color: var(--navy); }
.form-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; }
.form-field { display: flex; flex-direction: column; gap: 5px; }
.form-field label { font-size: 11px; font-weight: 600; color: var(--ink-2); letter-spacing: 0.02em; }
.form-field input[type="text"] { padding: 10px 12px; border: 1px solid var(--hairline-2); background: var(--surface); border-radius: 12px; font: inherit; font-size: 14px; color: var(--ink); outline: none; transition: border-color 160ms; }
.form-field input[type="text"]:focus { border-color: var(--navy); }

.role-chips { display: flex; gap: 6px; }
.role-chip { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface); color: var(--ink-2); padding: 8px 14px; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 160ms; }
.role-chip:hover { background: var(--surface-2); }
.role-chip[aria-pressed="true"] { background: var(--navy); color: white; border-color: var(--navy); }

.dept-check-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dept-check { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; background: var(--surface); border: 1px solid var(--hairline-2); border-radius: 999px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--ink-2); transition: all 160ms; }
.dept-check:hover { background: var(--surface-2); }
.dept-check input { width: 14px; height: 14px; accent-color: var(--navy); cursor: pointer; margin: 0; }
.dept-check.checked { background: var(--navy-soft); color: var(--navy); border-color: rgba(31,42,68,0.2); font-weight: 600; }
.dept-check .ic { width: 12px; height: 12px; }

.pin-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pin-row input { padding: 10px 12px; border: 1px solid var(--hairline-2); background: var(--surface); border-radius: 12px; font: inherit; font-size: 15px; color: var(--ink); outline: none; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 0.4em; transition: border-color 160ms; }
.pin-row input:focus { border-color: var(--navy); }
.pin-row input.mismatch { border-color: var(--red); }
.pin-hint { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.pin-hint.error { color: var(--red); }

.form-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 6px; border-top: 1px dashed var(--hairline); }
.btn-cancel { background: var(--surface); border: 1px solid var(--hairline-2); color: var(--ink-2); padding: 9px 16px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 160ms; }
.btn-cancel:hover { background: var(--surface-2); }
.btn-save { background: var(--navy); color: white; border: 0; padding: 9px 16px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 14px rgba(31,42,68,0.22); display: inline-flex; align-items: center; gap: 6px; transition: background 160ms; }
.btn-save:hover { background: #2a3656; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.btn-save .ic { width: 13px; height: 13px; }

/* ── Department rows ────────────────────────────────── */
.dept-list { display: flex; flex-direction: column; gap: 8px; }
.dept-row { display: grid; grid-template-columns: 36px 1fr auto auto; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 14px 16px; box-shadow: var(--shadow-card); transition: background 120ms; }
.dept-row:hover { background: var(--surface-2); }
.dept-row.disabled { opacity: 0.55; }
.dept-icon { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.dept-icon.steel { background: var(--blue-soft); color: var(--blue); }
.dept-icon.wood { background: var(--green-soft); color: var(--green); }
.dept-icon.uphol { background: var(--purple-soft); color: var(--purple); }
.dept-icon.disp { background: var(--amber-soft); color: var(--amber); }

.dept-info .dept-name { font-size: 15px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.dept-info .dept-meta { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-top: 2px; letter-spacing: 0.02em; }

.role-tags { display: flex; gap: 5px; }
.role-tag { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase; }
.role-tag.boss { background: var(--navy); color: white; }
.role-tag.manager { background: var(--amber-soft); color: var(--amber); }
.role-tag.worker { background: var(--blue-soft); color: var(--blue); }

.toggle { width: 44px; height: 26px; border-radius: 999px; position: relative; cursor: pointer; transition: background 200ms; flex-shrink: 0; border: 0; padding: 0; }
.toggle.on { background: var(--green); }
.toggle.off { background: var(--surface-3); border: 1px solid var(--hairline-2); }
.toggle::after { content: ""; position: absolute; top: 3px; width: 18px; height: 18px; background: white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.18); transition: left 200ms; }
.toggle.on::after { left: 22px; }
.toggle.off::after { left: 3px; }

/* ── Per-dept buffer stepper ─────────────────────────── */
.dept-row { grid-template-columns: 36px 1fr auto auto auto; }
.dept-row .buf { display: inline-flex; align-items: center; gap: 4px; background: var(--surface-2); border: 1px solid var(--hairline-2); border-radius: 10px; padding: 4px 6px; }
.dept-row .buf button { width: 26px; height: 26px; border: 0; background: transparent; color: var(--ink-2); border-radius: 6px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; }
.dept-row .buf button:hover:not(:disabled) { background: var(--surface-3); color: var(--ink); }
.dept-row .buf button:disabled { opacity: 0.45; cursor: not-allowed; }
.dept-row .buf .v { min-width: 22px; text-align: center; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--ink); font-size: 13px; }
.dept-row .buf .lbl { font-size: 10px; color: var(--ink-3); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 6px 0 4px; }

/* ── Public holidays ─────────────────────────────────── */
.hol-list { display: flex; flex-direction: column; gap: 6px; }
.hol-row { display: grid; grid-template-columns: 36px 110px 1fr auto; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 12px 16px; box-shadow: var(--shadow-card); }
.hol-row .icon { width: 36px; height: 36px; border-radius: 10px; background: var(--amber-soft); color: var(--amber); display: flex; align-items: center; justify-content: center; }
.hol-row .hol-date { font-family: ui-monospace, 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
.hol-row .hol-name { font-size: 14px; font-weight: 500; color: var(--ink); letter-spacing: -0.01em; }
.hol-row .btn-del { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; font-size: 12px; font-weight: 600; color: var(--red); background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); border-radius: 9px; cursor: pointer; }
.hol-row .btn-del:hover { background: rgba(210,83,58,0.18); }
.hol-empty { padding: 26px 16px; text-align: center; color: var(--ink-3); font-size: 13px; background: var(--surface-2); border: 1px dashed var(--hairline-2); border-radius: var(--r-md); }
.hol-actions { display: flex; gap: 8px; align-items: center; }
.hol-actions .seed-btn { background: var(--amber); color: white; border: 0; padding: 9px 16px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 14px rgba(232,154,60,0.28); display: inline-flex; align-items: center; gap: 6px; }
.hol-actions .seed-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.hol-actions .seed-btn .ic { color: white; }
.hol-form { display: grid; grid-template-columns: 160px 1fr auto auto; gap: 10px; align-items: end; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-md); margin-bottom: 10px; }
.hol-form .form-field input[type="date"] { padding: 10px 12px; border: 1px solid var(--hairline-2); background: var(--surface); border-radius: 10px; font: inherit; font-size: 13px; color: var(--ink); }
.hol-form .form-field input[type="text"] { padding: 10px 12px; border: 1px solid var(--hairline-2); background: var(--surface); border-radius: 10px; font: inherit; font-size: 13px; color: var(--ink); }

@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
  .emp-list { grid-template-columns: 1fr; }
  .dept-row { grid-template-columns: 36px 1fr; }
  .dept-row .role-tags, .dept-row .toggle, .dept-row .buf { grid-column: span 2; }
  .hol-form { grid-template-columns: 1fr; }
  .hol-row { grid-template-columns: 36px 1fr auto; }
  .hol-row .hol-name { grid-column: 2 / span 2; }
}
`

function deptMeta(id) {
  return DEPT_META.find(d => d.id === id)
}

function EmployeeCard({ employee, onEdit, onDelete }) {
  const initial = employee.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const roleLower = employee.role.toLowerCase()
  return (
    <div className="emp-card">
      <div className="emp-head">
        <div className={`emp-avatar ${roleLower}`}>{initial}</div>
        <div className="emp-id">
          <div className="name">{employee.name}</div>
          <div className="role-row">
            <span className={`role-pill ${roleLower}`}>{employee.role}</span>
          </div>
        </div>
      </div>
      <div className="dept-tags">
        {employee.depts.map(d => {
          const meta = deptMeta(d)
          if (!meta) return null
          const Icon = meta.icon
          return (
            <span key={d} className={`dept-tag ${d}`}>
              <Icon size={11} strokeWidth={2} className="ic" />
              {meta.label}
            </span>
          )
        })}
        {employee.depts.length === 0 && <span className="dept-tag">No departments</span>}
      </div>
      <div className={`pin-status ${employee.pinSet ? 'set' : 'unset'}`}>
        {employee.pinSet
          ? (
            <>
              <Check size={11} strokeWidth={2.4} className="ic" />
              PIN:&nbsp;
              <span style={{
                fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                fontSize: 13, letterSpacing: '0.18em', fontWeight: 700,
              }}>{employee.pin}</span>
            </>
          )
          : (<><X size={11} strokeWidth={2.4} className="ic" />PIN not set</>)}
      </div>
      <div className="emp-foot">
        <button className="btn-edit" onClick={() => onEdit(employee.id)}>
          <Edit2 size={12} strokeWidth={2} className="ic" /> Edit
        </button>
        <button className="btn-del" onClick={() => onDelete(employee.id)}>
          <Trash2 size={12} strokeWidth={2} className="ic" /> Delete
        </button>
      </div>
    </div>
  )
}

function EmployeeForm({ initialData, editing, onCancel, onSave }) {
  const [form, setForm] = useState(initialData)
  const pinMismatch = form.pin1.length === 4 && form.pin2.length === 4 && form.pin1 !== form.pin2
  const pinValid = form.pin1.length === 4 && form.pin1 === form.pin2
  const canSave = form.name.trim().length > 0 && form.depts.length > 0 && (editing ? true : pinValid)

  const setRole = (role) => setForm(f => ({ ...f, role }))
  const toggleDept = (id) => setForm(f => ({
    ...f,
    depts: f.depts.includes(id) ? f.depts.filter(d => d !== id) : [...f.depts, id],
  }))
  const setPin = (which, raw) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, 4)
    setForm(f => ({ ...f, [which]: cleaned }))
  }

  return (
    <div className="form-panel">
      <h3>
        {editing
          ? (<><Edit2 size={14} strokeWidth={2} className="ic" /> Edit Employee</>)
          : (<><UserPlus size={14} strokeWidth={2} className="ic" /> Add Employee</>)}
      </h3>

      <div className="form-grid">
        <div className="form-field">
          <label>Employee name</label>
          <input
            type="text"
            placeholder="e.g. Jakkals van der Merwe"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-field">
          <label>Role</label>
          <div className="role-chips">
            {ROLES.map(r => (
              <button
                key={r}
                type="button"
                className="role-chip"
                aria-pressed={form.role === r}
                onClick={() => setRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-field">
        <label>Department access</label>
        <div className="dept-check-row">
          {DEPT_META.map(d => {
            const Icon = d.icon
            const checked = form.depts.includes(d.id)
            return (
              <label key={d.id} className={`dept-check ${checked ? 'checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggleDept(d.id)} />
                <Icon size={12} strokeWidth={2} className="ic" />
                {d.label}
              </label>
            )
          })}
        </div>
      </div>

      <div className="form-field">
        <label>PIN (4 digits) {editing && <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>— leave blank to keep current</span>}</label>
        <div className="pin-row">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="enter PIN"
            value={form.pin1}
            onChange={e => setPin('pin1', e.target.value)}
            className={pinMismatch ? 'mismatch' : ''}
            maxLength={4}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="confirm PIN"
            value={form.pin2}
            onChange={e => setPin('pin2', e.target.value)}
            className={pinMismatch ? 'mismatch' : ''}
            maxLength={4}
          />
        </div>
        {pinMismatch && <span className="pin-hint error">PINs don't match</span>}
        {pinValid && !pinMismatch && <span className="pin-hint" style={{ color: 'var(--green)' }}>PIN confirmed</span>}
      </div>

      <div className="form-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-save" disabled={!canSave} onClick={() => onSave(form)}>
          <Check size={13} strokeWidth={2.4} className="ic" />
          {editing ? 'Save changes' : 'Add Employee'}
        </button>
      </div>
    </div>
  )
}

function DepartmentRow({ dept, onToggle, bufferDays, bufferBusy, onBufferChange }) {
  const meta = deptMeta(dept.id)
  const Icon = meta.icon
  const value = bufferDays ?? 3
  return (
    <div className={`dept-row ${dept.enabled ? '' : 'disabled'}`}>
      <div className={`dept-icon ${dept.id}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="dept-info">
        <div className="dept-name">{meta.label}</div>
        <div className="dept-meta">{dept.enabled ? 'Active · accepting work' : 'Disabled · hidden from depts'}</div>
      </div>
      <div className="buf" aria-label={`Buffer days for ${meta.label}`}>
        <button type="button" onClick={() => onBufferChange(dept.id, value - 1)} disabled={bufferBusy || value <= 0}>−</button>
        <span className="v">{value}</span>
        <button type="button" onClick={() => onBufferChange(dept.id, value + 1)} disabled={bufferBusy}>+</button>
        <span className="lbl">buf days</span>
      </div>
      <div className="role-tags">
        {dept.allowedRoles.map(r => (
          <span key={r} className={`role-tag ${r.toLowerCase()}`}>{r}</span>
        ))}
      </div>
      <button
        type="button"
        className={`toggle ${dept.enabled ? 'on' : 'off'}`}
        aria-pressed={dept.enabled}
        aria-label={`Toggle ${meta.label}`}
        onClick={() => onToggle(dept.id)}
      />
    </div>
  )
}

function HolidaysSection() {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [seedBusy, setSeedBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState('')
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const refresh = async () => {
    setError(null)
    try {
      const list = await listHolidays()
      setHolidays(list)
    } catch (e) {
      setError(e.message || String(e))
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listHolidays()
      .then(list => { if (!cancelled) { setHolidays(list); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message || String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const handleSeed = async () => {
    setSeedBusy(true)
    setError(null)
    try {
      await seedSaHolidays2026()
      await refresh()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setSeedBusy(false)
    }
  }

  const handleAdd = async () => {
    if (!formDate || !formName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const row = await addHoliday(formDate, formName.trim())
      setHolidays(prev => [...prev, row].sort((a, b) => a.date.localeCompare(b.date)))
      setFormDate('')
      setFormName('')
      setShowForm(false)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const holiday = holidays.find(h => h.id === id)
    const ok = await confirm({
      title: 'Delete this holiday?',
      body: holiday ? `${holiday.name || 'Holiday'} (${holiday.date}) will be removed from the schedule.` : 'This holiday will be removed.',
      confirmLabel: 'Delete holiday',
    })
    if (!ok) return
    try {
      await deleteHoliday(id)
      setHolidays(prev => prev.filter(h => h.id !== id))
    } catch (e) {
      alert(`Delete failed: ${e.message || e}`)
    }
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>
          <Calendar size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--ink-3)' }} />
          Public Holidays
          <span className="count">{holidays.length} dates · scheduler skips these</span>
        </h2>
        <div className="hol-actions">
          <button className="seed-btn" onClick={handleSeed} disabled={seedBusy}>
            <Sprout size={13} strokeWidth={2.2} className="ic" /> {seedBusy ? 'Seeding…' : 'Seed SA 2026'}
          </button>
          {!showForm && (
            <button className="add-btn" onClick={() => setShowForm(true)}>
              <Plus size={13} strokeWidth={2.4} className="ic" /> Add Holiday
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="hol-form">
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Name</label>
            <input type="text" placeholder="e.g. Heritage Day (observed)" value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <button className="btn-cancel" type="button" onClick={() => { setShowForm(false); setFormDate(''); setFormName('') }} disabled={saving}>Cancel</button>
          <button className="btn-save" type="button" onClick={handleAdd} disabled={!formDate || !formName.trim() || saving}>
            <Check size={13} strokeWidth={2.4} className="ic" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div className="hol-empty">Loading holidays…</div>
      ) : holidays.length === 0 ? (
        <div className="hol-empty">No holidays yet. Click "Seed SA 2026" for the standard 12 dates, or add your own.</div>
      ) : (
        <div className="hol-list">
          {holidays.map(h => (
            <div key={h.id} className="hol-row">
              <div className="icon"><Calendar size={16} strokeWidth={2} /></div>
              <span className="hol-date">{h.date}</span>
              <span className="hol-name">{h.name}</span>
              <button className="btn-del" onClick={() => handleDelete(h.id)}>
                <Trash2 size={12} strokeWidth={2} /> Delete
              </button>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  )
}

export default function OptionsScreen() {
  const { isDark, toggle: toggleTheme } = useTheme()
  const [employees, setEmployees] = useState([])
  const [empLoading, setEmpLoading] = useState(true)
  const [empError, setEmpError] = useState(null)
  const [departments, setDepartments] = useState(INITIAL_DEPTS)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [bufferDays, setBufferDays] = useState({}) // { steel: 3, wood: 3, uphol: 3, disp: 3 }
  const [bufferBusy, setBufferBusy] = useState(null) // id of dept currently saving
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    let cancelled = false
    setEmpLoading(true)
    listEmployees()
      .then((rows) => {
        if (cancelled) return
        setEmployees(rows.map(toUiEmployee))
        setEmpLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setEmpError(e.message || String(e))
        setEmpLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    listDepartmentBuffers().then((dbMap) => {
      if (cancelled) return
      const next = {}
      for (const [uiId, dbName] of Object.entries(DEPT_DB_NAME)) {
        next[uiId] = dbMap.get(dbName) ?? 3
      }
      setBufferDays(next)
    }).catch((e) => console.warn('[Options] buffer days load failed:', e.message))
    return () => { cancelled = true }
  }, [])

  const handleBufferChange = async (uiId, nextValue) => {
    const value = Math.max(0, Math.floor(nextValue))
    const previous = bufferDays[uiId] ?? 3
    setBufferDays(prev => ({ ...prev, [uiId]: value }))
    setBufferBusy(uiId)
    try {
      await saveBufferDays(DEPT_DB_NAME[uiId], value)
    } catch (e) {
      setBufferDays(prev => ({ ...prev, [uiId]: previous }))
      alert(`Failed to save buffer days: ${e.message || e}`)
    } finally {
      setBufferBusy(null)
    }
  }

  const editingEmployee = useMemo(
    () => (editingId == null ? null : employees.find(e => e.id === editingId)),
    [editingId, employees],
  )

  const initialFormData = useMemo(() => {
    if (!editingEmployee) return emptyForm
    return { name: editingEmployee.name, role: editingEmployee.role, depts: [...editingEmployee.depts], pin1: '', pin2: '' }
  }, [editingEmployee])

  const formKey = editingId == null ? 'new' : `edit-${editingId}`

  const openAdd = () => { setEditingId(null); setFormOpen(true) }
  const openEdit = (id) => { setEditingId(id); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditingId(null) }

  const saveEmployee = async (form) => {
    const dbDepts = uiDeptsToDb(form.depts)
    const newPin = form.pin1.length === 4 ? form.pin1 : null
    try {
      if (editingId != null) {
        const patch = { name: form.name.trim(), role: form.role, departments: dbDepts }
        if (newPin) patch.pin = newPin
        const updated = await updateEmployee(editingId, patch)
        setEmployees(list => list.map(e => e.id === editingId ? toUiEmployee(updated) : e))
      } else {
        const inserted = await addEmployee({
          name: form.name.trim(),
          role: form.role,
          departments: dbDepts,
          pin: newPin,
        })
        setEmployees(list => [...list, toUiEmployee(inserted)].sort((a, b) => a.name.localeCompare(b.name)))
      }
      closeForm()
    } catch (e) {
      alert(`Save failed: ${e.message || e}`)
    }
  }

  const deleteEmployee = async (id) => {
    const emp = employees.find(e => e.id === id)
    const ok = await confirm({
      title: 'Delete this employee?',
      body: emp ? `${emp.name || 'This employee'} will be permanently removed.` : 'This employee will be permanently removed.',
      confirmLabel: 'Delete employee',
    })
    if (!ok) return
    try {
      await deleteEmployeeRow(id)
      setEmployees(list => list.filter(e => e.id !== id))
      if (editingId === id) closeForm()
    } catch (e) {
      alert(`Delete failed: ${e.message || e}`)
    }
  }

  const toggleDept = (id) => {
    setDepartments(list => list.map(d => d.id === id ? { ...d, enabled: !d.enabled } : d))
  }

  return (
    <div className="app">
      <style>{styles}</style>
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Options</h1>
            <div className="sub">Manage employees, roles, PINs and department access</div>
          </div>
          <div className="topbar-actions">
            <button className="ibtn"><Key size={15} strokeWidth={2} className="ic" /> Passwords</button>
            <button className="ibtn" onClick={toggleTheme}>
              {isDark ? <Sun size={15} strokeWidth={2} className="ic" /> : <Moon size={15} strokeWidth={2} className="ic" />}
              {isDark ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <h2><Users size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--ink-3)' }} />Employees<span className="count">{employees.length} on roll</span></h2>
            {!formOpen && (
              <button className="add-btn" onClick={openAdd}>
                <Plus size={13} strokeWidth={2.4} className="ic" /> Add Employee
              </button>
            )}
          </div>

          {formOpen && (
            <EmployeeForm
              key={formKey}
              editing={editingId != null}
              initialData={initialFormData}
              onCancel={closeForm}
              onSave={saveEmployee}
            />
          )}

          {empError && (
            <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>
              Failed to load employees: {empError}
            </div>
          )}
          {empLoading && !empError && (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 10 }}>Loading…</div>
          )}
          {!empLoading && !empError && employees.length === 0 && (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 10 }}>
              No employees yet. Click "Add Employee" above.
            </div>
          )}
          <div className="emp-list">
            {employees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                onEdit={openEdit}
                onDelete={deleteEmployee}
              />
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <h2><ShieldCheck size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--ink-3)' }} />Departments<span className="count">{departments.filter(d => d.enabled).length} of {departments.length} active</span></h2>
          </div>
          <div className="dept-list">
            {departments.map(d => (
              <DepartmentRow
                key={d.id}
                dept={d}
                onToggle={toggleDept}
                bufferDays={bufferDays[d.id]}
                bufferBusy={bufferBusy === d.id}
                onBufferChange={handleBufferChange}
              />
            ))}
          </div>
        </div>

        <HolidaysSection />
      </main>
      {confirmDialog}
    </div>
  )
}
