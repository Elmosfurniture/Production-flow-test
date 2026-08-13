import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getCurrentUser, signOut, deptLabel } from '../lib/auth'
import { useAppData } from '../store/AppDataContext'
import { useMessages } from '../store/MessagesContext'
import { isSandbox, setSandbox, isTestDb } from '../lib/supabase'
import { clearDeptTabs } from '../lib/useDeptTab'
import {
  Grid,
  List,
  Calendar,
  Activity,
  CheckSquare,
  Truck,
  Package,
  HardDrive,
  Users,
  Factory,
  ArrowDown,
  ArrowUp,
  Shield,
  LogOut,
  SlidersHorizontal,
  Loader2,
  GitMerge,
  Coins,
} from 'lucide-react'

const iconMap = {
  grid: Grid,
  list: List,
  cal: Calendar,
  wave: Activity,
  'check-sq': CheckSquare,
  truck: Truck,
  pkg: Package,
  machine: HardDrive,
  users: Users,
  factory: Factory,
  down: ArrowDown,
  up: ArrowUp,
  shield: Shield,
  logout: LogOut,
  options: SlidersHorizontal,
  merge: GitMerge,
  coins: Coins,
}

function I({ n, s = 16, w = 1.8 }) {
  const Icon = iconMap[n]
  return Icon ? <Icon size={s} strokeWidth={w} className="ic" /> : null
}

function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="elmoSidebarLogoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f6f3ec" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#elmoSidebarLogoGrad)" stroke="rgba(26,29,36,0.10)" />
      <circle cx="44" cy="22" r="5" fill="var(--amber)" />
      <path d="M6 46 L20 28 L28 38 L40 22 L52 46 Z" fill="var(--navy)" />
    </svg>
  )
}

const sidebarStyles = `
.app { display: grid; grid-template-columns: 256px 1fr; min-height: 100vh; }

.side {
  background: var(--surface);
  border-right: 1px solid var(--hairline);
  padding: 18px 14px 18px;
  display: flex; flex-direction: column; gap: 14px;
  position: sticky; top: 0; height: 100vh;
  overflow-y: auto;
}
.side .brand {
  display: flex; align-items: center; gap: 10px; padding: 4px 6px 8px;
  border-bottom: 1px solid var(--hairline);
}
.side .brand .mark {
  width: 38px; height: 38px; border-radius: 12px;
  border: 1px solid var(--hairline-2);
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-2);
  box-shadow: 0 1px 2px rgba(26,29,36,0.04);
  flex-shrink: 0;
}
.side .brand .name { line-height: 1.1; }
.side .brand .name b {
  font-size: 15px; font-weight: 600; letter-spacing: -0.02em;
  display: block; color: var(--ink);
}
.side .brand .name b em { font-style: normal; color: var(--amber); }
.side .brand .name span {
  font-size: 11px; color: var(--ink-3); font-weight: 500;
  letter-spacing: 0.02em;
}

.side .ctx-card {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.side .ctx-card .row {
  display: flex; align-items: center; gap: 8px;
  padding: 0;
  font-size: 12px; color: var(--ink-2); font-weight: 500;
  min-width: 0;
  grid-template-columns: none;
}
.side .ctx-card .row .ic { width: 14px; height: 14px; color: var(--ink-3); flex-shrink: 0; }
.side .ctx-card .row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side .ctx-card .row b { color: var(--ink); font-weight: 600; }
.side .ctx-card .role-pill {
  align-self: flex-start;
  background: var(--navy); color: white;
  font-size: 11px; font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.side .nav-group { display: flex; flex-direction: column; gap: 2px; }
.side .nav-title {
  font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
  color: var(--ink-3); text-transform: uppercase;
  padding: 8px 10px 6px;
}
.side .nav-item {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 11px;
  border-radius: 10px;
  font-size: 14px; font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
  text-decoration: none;
  transition: background 160ms ease, color 160ms ease;
  border: 1px solid transparent;
}
.side .nav-item .ic { width: 18px; height: 18px; flex-shrink: 0; color: var(--ink-3); }
.side .nav-item:hover { background: var(--surface-2); color: var(--ink); }
.side .nav-item[aria-current="page"] {
  background: var(--navy-soft);
  color: var(--navy);
  font-weight: 600;
}
.side .nav-item[aria-current="page"] .ic { color: var(--navy); }
[data-theme="dark"] .side .nav-item[aria-current="page"] {
  background: var(--navy-soft);
  color: var(--amber-2);
}
[data-theme="dark"] .side .nav-item[aria-current="page"] .ic { color: var(--amber-2); }
.side .nav-item .badge {
  margin-left: auto;
  background: var(--amber-soft); color: var(--amber);
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 999px;
  line-height: 1.4;
}
.side .nav-item .badge.critical {
  background: var(--red-soft, rgba(210,83,58,0.10));
  color: var(--red, #d2533a);
}

.side .side-foot {
  margin-top: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline);
}
.side .util-row { display: flex; gap: 6px; }
.side .util-btn {
  flex: 1;
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2);
  color: var(--ink-2);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit; font-size: 12px; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer;
  text-decoration: none;
}
.side .util-btn:hover { background: var(--surface); color: var(--ink); }
.side .util-btn[aria-current="page"] { background: var(--navy-soft); color: var(--navy); border-color: rgba(31,42,68,0.2); }
.side .util-btn .ic { width: 13px; height: 13px; color: var(--ink-3); }
.side .util-btn[aria-current="page"] .ic { color: var(--navy); }

.side .signout {
  width: 100%; appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface-2); color: var(--ink-2);
  border-radius: 12px; padding: 10px;
  font: inherit; font-size: 13px; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer;
}
.side .signout:hover {
  background: var(--red-soft); color: var(--red);
  border-color: var(--red);
}
.side .signout .ic { width: 14px; height: 14px; }

.side .meta-foot {
  font-size: 11px; color: var(--ink-3);
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px 4px 0;
}
.side .meta-foot .sync { display: flex; align-items: center; gap: 6px; }
.side .meta-foot .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
.side .meta-foot .sync.syncing { color: var(--amber); }
.side .meta-foot .sync.syncing .dot { background: var(--amber); }
.side .meta-foot .sync .spin { animation: side-spin 800ms linear infinite; color: var(--amber); }
@keyframes side-spin { to { transform: rotate(360deg); } }

.side .ic { display: inline-block; vertical-align: middle; }

/* ── Responsive: phones & small tablets ─────────────────────────
   Desktop (≥861px) keeps the left sidebar. Below that, the sidebar is
   hidden and replaced by a fixed, horizontally-scrollable bottom tab bar
   (.mobile-nav). Page content gets extra bottom padding to clear it. */
.mobile-nav { display: none; }

@media (max-width: 860px) {
  .app { grid-template-columns: 1fr; }
  .side { display: none; }

  .mobile-nav {
    display: flex;
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
    background: var(--surface);
    border-top: 1px solid var(--hairline-2);
    box-shadow: 0 -3px 14px rgba(26,29,36,0.08);
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px));
    gap: 2px; overflow-x: auto; overflow-y: hidden;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .mobile-nav::-webkit-scrollbar { display: none; }
  .mobile-nav .mnav-item {
    flex: 0 0 auto; min-width: 58px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    padding: 6px 8px 5px; border-radius: 12px;
    text-decoration: none; border: 0; background: transparent;
    color: var(--ink-3); font: inherit; font-size: 10px; font-weight: 600;
    cursor: pointer; position: relative; white-space: nowrap;
  }
  .mobile-nav .mnav-item .ic { width: 22px; height: 22px; color: var(--ink-3); }
  .mobile-nav .mnav-item[aria-current="page"] { color: var(--navy); background: var(--navy-soft); }
  .mobile-nav .mnav-item[aria-current="page"] .ic { color: var(--navy); }
  .mobile-nav .mnav-item.danger:active { color: var(--red); }
  .mobile-nav .mnav-badge {
    position: absolute; top: 2px; right: 9px;
    min-width: 15px; height: 15px; padding: 0 3px; border-radius: 999px;
    background: var(--amber); color: #fff; font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--surface);
  }
  .mobile-nav .mnav-badge.critical { background: var(--red); }

  /* Page content: room above the fixed bar + tighter gutters on phones. */
  .main { padding-left: 13px !important; padding-right: 13px !important; padding-bottom: 92px !important; }
  .topbar { flex-wrap: wrap; }
  .topbar h1 { font-size: 20px !important; }
  /* Wide horizontal strips scroll instead of pushing the page sideways. */
  .day-strip, .dept-tabs, .week-tabs {
    max-width: 100%; overflow-x: auto; overflow-y: hidden;
    scrollbar-width: none; -webkit-overflow-scrolling: touch;
  }
  .day-strip::-webkit-scrollbar,
  .dept-tabs::-webkit-scrollbar,
  .week-tabs::-webkit-scrollbar { display: none; }
  /* Keep tabs from squashing — let them keep their size and scroll instead. */
  .dept-tabs .dept-tab, .week-tabs .week-tab { flex-shrink: 0; white-space: nowrap; }
}
`

const sections = [
  {
    group: 'Production', items: [
      { id: 'dash', to: '/dashboard', label: 'Dashboard', icon: 'grid' },
      { id: 'pri', to: '/priority', label: 'Priority', icon: 'list', badge: 2 },
      { id: 'reconcile', to: '/reconcile', label: 'Reconcile', icon: 'merge', roles: ['Boss', 'Manager'], badgeKey: 'needsReview' },
      { id: 'week', to: '/week', label: 'Week Plan', icon: 'cal' },
      { id: 'sched', to: '/schedule', label: 'Schedule', icon: 'wave' },
      // Wood is no longer its own screen — it's a "Wood" department tab inside
      // Schedule / Priority / Week Plan / Tracking.
    ],
  },
  {
    group: 'Tracking', items: [
      { id: 'track', to: '/tracking', label: 'Tracking', icon: 'check-sq' },
      { id: 'disp', to: '/dispatch', label: 'Dispatch', icon: 'truck' },
    ],
  },
  {
    group: 'Config', items: [
      { id: 'prod', to: '/products', label: 'Products', icon: 'pkg', roles: ['Boss', 'Manager'] },
      { id: 'mach', to: '/machines', label: 'Machines', icon: 'machine', roles: ['Boss', 'Manager'] },
      { id: 'cost', to: '/costing', label: 'Costing', icon: 'coins', roles: ['Boss'] },
      { id: 'cust', to: '/customers', label: 'Customers', icon: 'users', roles: ['Boss', 'Manager'] },
      { id: 'opts', to: '/options', label: 'Options', icon: 'options', roles: ['Boss'] },
    ],
  },
]

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatSyncTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatToday(d) {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} · ${DAYS_FULL[d.getDay()]}`
}

export default function Sidebar() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const { isLoading, lastSynced, orders } = useAppData()
  const { unread: msgUnread } = useMessages()
  // Live-mirror the sandbox flag (see src/lib/supabase.js) so the badge and
  // toggle below always reflect the true state, even if flipped from console.
  const [sandbox, setSb] = useState(isSandbox())
  useEffect(() => {
    const onChange = (e) => setSb(e.detail)
    window.addEventListener('pf-sandbox-change', onChange)
    return () => window.removeEventListener('pf-sandbox-change', onChange)
  }, [])
  // Live counters surfaced as sidebar badges. Lookup by `badgeKey` on each
  // nav item — keeps the sections config declarative. Reconcile badge counts
  // only orders that NEED MANUAL ACTION (product code couldn't be matched
  // from CSV import). Unscheduled-but-valid orders are noise here.
  const liveBadges = {
    needsReview: (orders || []).filter((o) => o.needs_review).length,
  }
  const handleLogout = () => {
    signOut()
    navigate('/login')
  }
  // Flattened, role-filtered destinations for the mobile bottom bar — same
  // source of truth as the desktop sidebar sections.
  const mobileNavItems = sections
    .flatMap((s) => s.items)
    .filter((item) => !item.roles || item.roles.includes(user?.role))
  return (
    <>
      <style>{sidebarStyles}</style>
      <aside className="side">
        <div className="brand">
          <div className="mark"><Logo /></div>
          <div className="name">
            <b>Production<em>Flow</em></b>
            <span>Steelworks · Plant 2</span>
          </div>
        </div>

        <div className="ctx-card">
          <div className="role-pill">{user?.role || 'Guest'}</div>
          <div className="row"><I n="factory" s={14} /> <span>{deptLabel(user?.activeDepartment)}</span></div>
          <div className="row"><I n="users" s={14} /> <span>signed in as <b>{user?.name || '—'}</b></span></div>
        </div>

        {sections.map((section) => {
          const visible = section.items.filter((item) => !item.roles || item.roles.includes(user?.role))
          if (visible.length === 0) return null
          return (
            <div key={section.group} className="nav-group">
              <div className="nav-title">{section.group}</div>
              {visible.map((item) => {
                const liveBadge = item.badgeKey ? liveBadges[item.badgeKey] : null
                // Dashboard carries the unread-messages badge.
                const dashUnread = item.id === 'dash' ? msgUnread : 0
                const badge = dashUnread > 0
                  ? dashUnread
                  : (liveBadge != null && liveBadge > 0 ? liveBadge : item.badge)
                // Reconcile pending + new messages = needs attention → mark red.
                const isCritical = (item.badgeKey === 'needsReview' && liveBadge > 0) || dashUnread > 0
                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    end
                    className="nav-item"
                    onClick={clearDeptTabs}
                  >
                    <I n={item.icon} s={18} />
                    <span>{item.label}</span>
                    {badge && <span className={`badge ${isCritical ? 'critical' : ''}`}>{badge}</span>}
                  </NavLink>
                )
              })}
            </div>
          )
        })}

        <div className="side-foot">
          {user?.role !== 'Worker' && (
            <div className="util-row">
              <button className="util-btn"><I n="down" s={13} /> Export</button>
              <button className="util-btn"><I n="shield" s={13} /> Backups</button>
              <NavLink to="/import" end className="util-btn"><I n="up" s={13} /> Import</NavLink>
            </div>
          )}
          {(() => {
            // Three states: sandbox (no save), test DB (safe — writes persist to
            // the test copy), live (danger — writes hit the real database).
            const onTest = isTestDb()
            const tone = sandbox ? 'blue' : (onTest ? 'green' : 'red')
            const colors = {
              blue: ['rgba(70,119,200,0.5)', 'var(--blue-soft, rgba(70,119,200,0.12))', 'var(--blue, #4677c8)'],
              green: ['rgba(76,175,106,0.5)', 'var(--green-soft, rgba(76,175,106,0.12))', 'var(--green, #4caf6a)'],
              red: ['rgba(210,83,58,0.5)', 'var(--red-soft, rgba(210,83,58,0.10))', 'var(--red, #d2533a)'],
            }[tone]
            const label = sandbox ? '🧪 Sandbox — no save' : (onTest ? '🟢 Test DB — changes save' : '⚠ LIVE — writes persist')
            const title = sandbox
              ? 'Sandbox — add/edit/reorder freely; changes stay on this device and vanish on refresh. Click to let writes save.'
              : (onTest
                  ? 'Connected to the TEST database (a copy of live data). Changes save and persist — production is untouched. Click for sandbox (no save).'
                  : 'LIVE — changes persist to the REAL database. Click to switch to safe sandbox mode.')
            return (
              <button
                type="button"
                onClick={() => setSandbox(!sandbox)}
                title={title}
                style={{
                  width: '100%', appearance: 'none', cursor: 'pointer',
                  border: `1px solid ${colors[0]}`, background: colors[1], color: colors[2],
                  borderRadius: 12, padding: '9px 10px', font: 'inherit', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {label}
              </button>
            )
          })()}
          <div className="meta-foot">
            <div className={`sync ${isLoading ? 'syncing' : ''}`}>
              {isLoading
                ? (<><Loader2 size={11} strokeWidth={2.4} className="spin" /> Syncing…</>)
                : (<><span className="dot" /> Synced {lastSynced ? formatSyncTime(lastSynced) : '—'}</>)}
            </div>
            <div>{formatToday(new Date())}</div>
          </div>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Main navigation">
        {mobileNavItems.map((item) => {
          const liveBadge = item.badgeKey ? liveBadges[item.badgeKey] : null
          const dashUnread = item.id === 'dash' ? msgUnread : 0
          const badge = dashUnread > 0
            ? dashUnread
            : (liveBadge != null && liveBadge > 0 ? liveBadge : item.badge)
          const isCritical = (item.badgeKey === 'needsReview' && liveBadge > 0) || dashUnread > 0
          return (
            <NavLink key={item.id} to={item.to} end className="mnav-item" onClick={clearDeptTabs}>
              <I n={item.icon} s={22} />
              <span>{item.label}</span>
              {badge ? <span className={`mnav-badge ${isCritical ? 'critical' : ''}`}>{badge}</span> : null}
            </NavLink>
          )
        })}
        {user?.role !== 'Worker' && (
          <NavLink to="/import" end className="mnav-item">
            <I n="up" s={22} />
            <span>Import</span>
          </NavLink>
        )}
        <button className="mnav-item danger" onClick={handleLogout}>
          <I n="logout" s={22} />
          <span>Logout</span>
        </button>
      </nav>
    </>
  )
}
