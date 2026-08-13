import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDeptTab } from '../lib/useDeptTab'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import { useAppData } from '../store/AppDataContext'
import { computeProductLabour, formatRand } from '../lib/costing'
import {
  Hammer, Scissors, Activity, Truck, Grid, Search, X,
  ChevronRight, AlertTriangle, Coins, Clock, Wrench,
} from 'lucide-react'

// Labour Costing — what one finished product costs in machine labour, from each
// machine's R/hour rate (set on the Machines screen). Per-unit = machine
// run-time cost + setup amortised over a batch size the user picks.

const DEPT_TABS = [
  { id: 'all', label: 'All', Icon: Grid },
  { id: 'steel', label: 'Steel', Icon: Hammer },
  { id: 'wood', label: 'Wood', Icon: Scissors },
  { id: 'upholstery', label: 'Upholstery', Icon: Activity },
  { id: 'dispatch', label: 'Dispatch', Icon: Truck },
]

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
  --shadow-card: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(26,29,36,0.04), 0 8px 22px rgba(26,29,36,0.05);
}
[data-theme="dark"] {
  --bg: #0e1118; --bg-2: #131722;
  --surface: #1a1f2c; --surface-2: #20263488; --surface-3: #232938;
  --ink: #f1f2f5; --ink-2: #b8bcc8; --ink-3: #7c8090;
  --hairline: rgba(255,255,255,0.07); --hairline-2: rgba(255,255,255,0.12);
}
* { box-sizing: border-box; }
html, body { margin:0; padding:0; min-height:100vh; font-family:'Inter',-apple-system,system-ui,sans-serif; color:var(--ink); letter-spacing:-0.01em; -webkit-font-smoothing:antialiased; background: radial-gradient(120% 80% at 50% 0%, var(--surface-2) 0%, var(--bg) 40%, var(--bg-2) 100%); }
.main { padding: 18px 22px 30px; min-width: 0; }
.topbar { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
.topbar h1 { font-size:24px; font-weight:600; letter-spacing:-0.025em; margin:0; line-height:1.1; }
.topbar .sub { font-size:12px; color:var(--ink-2); margin-top:3px; }
.topbar-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }

.controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
.dept-tabs { display:flex; gap:4px; padding:3px; background:var(--surface-2); border:1px solid var(--hairline); border-radius:12px; }
.dept-tab { appearance:none; border:0; background:transparent; color:var(--ink-2); font:inherit; font-size:12px; font-weight:500; padding:7px 13px; border-radius:9px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.dept-tab .ic { width:13px; height:13px; color:var(--ink-3); }
.dept-tab[aria-pressed="true"] { background:var(--surface); color:var(--ink); box-shadow:0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 4px rgba(26,29,36,0.05); font-weight:600; }
.dept-tab[aria-pressed="true"] .ic { color:var(--navy); }

.search-box { display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--hairline-2); border-radius:10px; padding:7px 11px; flex:1 1 240px; min-width:200px; max-width:380px; }
.search-box:focus-within { border-color:var(--navy); box-shadow:0 0 0 3px var(--navy-soft); }
.search-box input { border:0; background:transparent; outline:0; font:inherit; font-size:13px; color:var(--ink); width:100%; }
.search-box .ic { color:var(--ink-3); flex-shrink:0; }
.search-box .clr { appearance:none; border:0; background:var(--surface-2); color:var(--ink-3); border-radius:999px; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0; flex-shrink:0; }

.batch-box { display:inline-flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--hairline-2); border-radius:10px; padding:0 11px; height:38px; box-shadow:0 1px 2px rgba(26,29,36,0.04); }
.batch-box .ic { color:var(--ink-3); }
.batch-box label { font-size:12px; font-weight:600; color:var(--ink-2); white-space:nowrap; }
.batch-box input { border:0; background:transparent; outline:0; font:inherit; font-size:13px; font-weight:700; color:var(--ink); width:56px; text-align:center; }

.banner { background:var(--amber-soft); border:1px solid rgba(232,154,60,0.30); border-radius:14px; padding:11px 16px; margin-bottom:14px; display:flex; align-items:center; gap:10px; font-size:13px; color:var(--ink); }
.banner .ic { color:var(--amber); flex-shrink:0; }
.banner a { color:var(--navy); font-weight:700; text-decoration:none; margin-left:auto; white-space:nowrap; border:1px solid var(--hairline-2); padding:5px 11px; border-radius:9px; background:var(--surface); }
.banner strong { font-weight:700; }

.state { padding:48px 16px; text-align:center; color:var(--ink-3); font-size:13px; background:var(--surface); border:1px solid var(--hairline); border-radius:18px; }
.state.err { color:var(--red); }

.card { background:var(--surface); border:1px solid var(--hairline); border-radius:16px; margin-bottom:10px; box-shadow:var(--shadow-card); overflow:hidden; }
.card-head { display:grid; grid-template-columns:18px 1fr auto; gap:16px; align-items:center; padding:15px 20px; cursor:pointer; user-select:none; }
.card-head:hover { background:var(--surface-2); }
.card-head .chev { color:var(--ink-3); transition:transform 180ms; }
.card.open .card-head .chev { transform:rotate(90deg); }
.name-block { min-width:0; }
.name-block .code { font-size:11px; font-weight:700; color:var(--navy); letter-spacing:0.02em; }
.name-block .desc { font-size:14px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25; }
.name-block .meta { font-size:11px; color:var(--ink-3); margin-top:2px; }
.name-block .miss { color:var(--amber); font-weight:600; display:inline-flex; align-items:center; gap:4px; }

.cost-block { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
.cost-block .total { font-size:22px; font-weight:800; color:var(--ink); letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1; }
.cost-block .total.zero { color:var(--ink-3); }
.cost-block .split { font-size:10px; color:var(--ink-3); font-weight:600; }
.cost-block .split b { color:var(--ink-2); }
.cost-block .per { font-size:9px; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.07em; font-weight:700; }

.card-body { border-top:1px solid var(--hairline); padding:6px 10px 12px; display:none; }
.card.open .card-body { display:block; }
.brk { width:100%; border-collapse:collapse; }
.brk th { font-size:9px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-3); font-weight:700; text-align:left; padding:8px 10px 6px; border-bottom:1px solid var(--hairline); }
.brk th.num, .brk td.num { text-align:right; font-variant-numeric:tabular-nums; }
.brk td { font-size:12px; color:var(--ink-2); padding:7px 10px; border-bottom:1px solid var(--hairline); }
.brk tr:last-child td { border-bottom:0; }
.brk .pn { font-weight:600; color:var(--ink); }
.brk .mn { color:var(--ink-2); }
.brk .no-rate { color:var(--amber); font-weight:600; }
.brk tfoot td { font-weight:700; color:var(--ink); border-top:2px solid var(--hairline-2); padding-top:9px; font-size:12px; }
.brk .rcost { color:var(--navy); font-weight:700; }
.empty-row { padding:14px; font-size:12px; color:var(--ink-3); font-style:italic; }

@media (max-width: 860px) {
  .card-head { grid-template-columns:16px 1fr auto; gap:10px; padding:13px 14px; }
  .brk th:nth-child(3), .brk td:nth-child(3) { display:none; } /* hide s/part detail on phones */
}
`

function ProductCostCard({ row, batchSize, open, onToggle }) {
  const { product, labour } = row
  return (
    <div className={`card ${open ? 'open' : ''}`}>
      <div className="card-head" onClick={onToggle}>
        <ChevronRight size={16} className="chev" />
        <div className="name-block">
          <div className="code">{product.code}</div>
          <div className="desc">{product.description || '—'}</div>
          <div className="meta">
            {labour.lines.length} step{labour.lines.length === 1 ? '' : 's'}
            {labour.hasMissing && (
              <> · <span className="miss"><AlertTriangle size={11} /> {labour.missingRates.length} machine(s) with no rate</span></>
            )}
          </div>
        </div>
        <div className="cost-block">
          <div className={`total ${labour.perUnit > 0 ? '' : 'zero'}`}>{formatRand(labour.perUnit)}</div>
          <div className="split">
            run <b>{formatRand(labour.runCost)}</b> + setup <b>{formatRand(labour.setupPerUnit)}</b>
          </div>
          <div className="per">labour / product</div>
        </div>
      </div>
      <div className="card-body">
        {labour.lines.length === 0 ? (
          <div className="empty-row">No parts/steps defined for this product — set up its parts map first.</div>
        ) : (
          <table className="brk">
            <thead>
              <tr>
                <th>Part</th>
                <th>Machine</th>
                <th className="num">Time / unit</th>
                <th className="num">Rate</th>
                <th className="num">Run</th>
                <th className="num">Setup / unit</th>
              </tr>
            </thead>
            <tbody>
              {labour.lines.map((ln, i) => (
                <tr key={i}>
                  <td className="pn">{ln.partName}</td>
                  <td className="mn">{ln.machineName}</td>
                  <td className="num">{ln.secondsPerPart}s × {ln.partsPerUnit} = {ln.runSec}s</td>
                  <td className="num">{ln.hasRate ? formatRand(ln.rate) : <span className="no-rate">no rate</span>}</td>
                  <td className="num rcost">{formatRand(ln.runCost)}</td>
                  <td className="num">{formatRand(ln.setupCostBatch / (batchSize > 0 ? batchSize : 1))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total labour per product (setup over batch of {batchSize})</td>
                <td className="num">{formatRand(labour.runCost)}</td>
                <td className="num">{formatRand(labour.setupPerUnit)}</td>
              </tr>
              <tr>
                <td colSpan={5}>Per-product labour cost</td>
                <td className="num rcost">{formatRand(labour.perUnit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

export default function CostingScreen() {
  const {
    products, partsByProduct, stepsByPart, machineByName,
    loading, error,
  } = useAppData()

  const [dept, setDept] = useDeptTab('costing')
  const [query, setQuery] = useState('')
  const [batchSize, setBatchSize] = useState(50)
  const [openIds, setOpenIds] = useState(() => new Set())

  const bs = batchSize > 0 ? batchSize : 1

  // Cost every product once for the current batch size.
  const rows = useMemo(() => {
    return (products || []).map((p) => {
      const parts = partsByProduct.get(p.id) || []
      const labour = computeProductLabour({ parts, stepsByPart, machineByName, batchSize: bs })
      return { product: p, labour }
    })
  }, [products, partsByProduct, stepsByPart, machineByName, bs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => dept === 'all' || r.product.department === dept)
      .filter((r) => {
        if (!q) return true
        return String(r.product.code || '').toLowerCase().includes(q) ||
          String(r.product.description || '').toLowerCase().includes(q)
      })
      // Most expensive first — surfaces the products worth pricing carefully.
      .sort((a, b) => b.labour.perUnit - a.labour.perUnit)
  }, [rows, dept, query])

  // Machines actually used in the visible products that have no rate set.
  const missingMachines = useMemo(() => {
    const s = new Set()
    for (const r of filtered) for (const m of r.labour.missingRates) s.add(m)
    return [...s]
  }, [filtered])

  const toggle = (id) => setOpenIds((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Labour Costing</h1>
              <div className="sub">Machine labour cost per product · set each machine's R/hour rate on the Machines screen</div>
            </div>
            <div className="topbar-actions"><TopbarActions /></div>
          </div>

          <div className="controls">
            <div className="dept-tabs">
              {DEPT_TABS.map(({ id, label, Icon }) => (
                <button key={id} className="dept-tab" aria-pressed={dept === id} onClick={() => setDept(id)}>
                  <Icon size={13} className="ic" /> {label}
                </button>
              ))}
            </div>
            <div className="search-box">
              <Search size={14} className="ic" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product code or name…" />
              {query && <button className="clr" onClick={() => setQuery('')} aria-label="Clear"><X size={13} /></button>}
            </div>
            <div className="batch-box" title="Setup time is spread over this many products">
              <Wrench size={14} className="ic" />
              <label>Batch size</label>
              <input
                type="number" min="1" step="1" value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
          </div>

          {missingMachines.length > 0 && (
            <div className="banner">
              <AlertTriangle size={15} className="ic" />
              <div>
                <strong>{missingMachines.length} machine(s)</strong> used by these products have no R/hour rate yet, so costs are understated: {missingMachines.slice(0, 6).join(', ')}{missingMachines.length > 6 ? '…' : ''}
              </div>
              <Link to="/machines">Set rates</Link>
            </div>
          )}

          {loading && <div className="state">Loading products…</div>}
          {error && <div className="state err">{error}</div>}

          {!loading && !error && (
            filtered.length === 0 ? (
              <div className="state">No products match. Try a different department or clear the search.</div>
            ) : (
              filtered.map((r) => (
                <ProductCostCard
                  key={r.product.id}
                  row={r}
                  batchSize={bs}
                  open={openIds.has(r.product.id)}
                  onToggle={() => toggle(r.product.id)}
                />
              ))
            )
          )}
        </main>
      </div>
    </>
  )
}
