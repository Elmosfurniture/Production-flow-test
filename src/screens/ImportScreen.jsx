import { useRef, useState } from 'react'
import Sidebar from '../components/Sidebar'
import TopbarActions from '../components/TopbarActions'
import {
  Search,
  Clock,
  Key,
  Moon,
  Sun,
  Printer,
  FileSpreadsheet,
  Upload,
  Check,
  AlertTriangle,
  Loader2,
  ListChecks,
  Wrench,
  Factory,
  Activity,
} from 'lucide-react'
import { importOrders, importPartsMap } from '../lib/importCSV'
import { importWoodPartsMap, deleteProductsWithoutParts, verifyWoodPartsMap } from '../lib/importWoodPartsMap'
import { importSteelPartsMap } from '../lib/importSteelPartsMap'
import { Trash2, CheckCircle2 } from 'lucide-react'
import { seedMachines } from '../lib/seedMachines'
import { recalculateAll } from '../lib/scheduling'
import { canEdit } from '../lib/auth'
import { useAppData } from '../store/AppDataContext'

const STAGES = {
  reading: 'Reading file',
  parsing: 'Parsing CSV',
  products: 'Ensuring products',
  customers: 'Ensuring customers',
  parts: 'Ensuring parts',
  classifying: 'Classifying records',
  orders: 'Upserting orders',
  machine_steps: 'Upserting machine steps',
  done: 'Done',
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
  --blue: #4677c8; --blue-soft: rgba(70,119,200,0.12);
  --purple: #8b5fbf; --purple-soft: rgba(139,95,191,0.12);
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

.intro { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px 18px; margin-bottom: 16px; box-shadow: var(--shadow-card); font-size: 13px; color: var(--ink-2); }
.intro b { color: var(--ink); font-weight: 600; }
.intro code { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 6px; padding: 1px 6px; font-size: 12px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: var(--ink); }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }

.imp-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 14px; }
.imp-head { display: flex; align-items: center; gap: 12px; }
.imp-head .icbox { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.imp-head .icbox.orders { background: var(--blue-soft); color: var(--blue); }
.imp-head .icbox.parts { background: var(--purple-soft); color: var(--purple); }
.imp-head h2 { font-size: 17px; font-weight: 600; color: var(--ink); margin: 0; letter-spacing: -0.02em; }
.imp-head .desc { font-size: 12px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }

.drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 22px;
  border: 1.5px dashed var(--hairline-2);
  border-radius: 14px;
  background: var(--surface-2);
  color: var(--ink-3); font-size: 13px;
  cursor: pointer;
  transition: background 160ms, border-color 160ms, color 160ms;
  text-align: center;
}
.drop:hover, .drop.dragover { background: var(--surface-3); border-color: var(--navy); color: var(--ink-2); }
.drop .ic { width: 22px; height: 22px; color: var(--ink-3); margin-bottom: 6px; }
.drop .filename { color: var(--ink); font-weight: 600; font-size: 13px; }
.drop .meta { font-size: 11px; color: var(--ink-3); margin-top: 2px; }
.drop input[type="file"] { display: none; }

.imp-btn-row { display: flex; gap: 8px; align-items: center; }
.imp-btn { flex: 1; background: var(--navy); color: white; border: 0; padding: 11px 16px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 14px rgba(31,42,68,0.22); display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: background 160ms; }
.imp-btn:hover:not(:disabled) { background: #2a3656; }
.imp-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.imp-btn .ic { width: 14px; height: 14px; color: white; }
.imp-btn .ic.spin { animation: spin 800ms linear infinite; }
.btn-secondary { background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--hairline-2); padding: 11px 14px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 160ms; }
.btn-secondary:hover { background: var(--surface); color: var(--ink); }

@keyframes spin { to { transform: rotate(360deg); } }

.progress { display: flex; flex-direction: column; gap: 6px; }
.progress .label { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--ink-2); font-weight: 600; letter-spacing: 0.02em; }
.progress .bar { height: 6px; background: var(--surface-3); border: 1px solid var(--hairline); border-radius: 999px; overflow: hidden; }
.progress .bar i { display: block; height: 100%; background: var(--navy); transition: width 200ms ease; }

.result { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.result-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.stat { background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.stat .l { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.stat .v { font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.stat.added .v { color: var(--green); }
.stat.updated .v { color: var(--blue); }
.stat.skipped .v { color: var(--amber); }
.stat.errors .v { color: var(--red); }

.errors-list { max-height: 160px; overflow-y: auto; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; padding: 8px 12px; font-size: 12px; color: var(--ink-2); display: flex; flex-direction: column; gap: 3px; }
.errors-list .err-row { display: flex; gap: 10px; font-variant-numeric: tabular-nums; }
.errors-list .err-row b { color: var(--red); font-weight: 700; min-width: 60px; }

.fail-banner { background: var(--red-soft); border: 1px solid rgba(210,83,58,0.25); color: var(--red); border-radius: 12px; padding: 12px 14px; font-size: 13px; display: flex; align-items: flex-start; gap: 10px; }
.fail-banner .msg { white-space: pre-line; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; line-height: 1.5; word-break: break-word; }
.fail-banner svg { flex-shrink: 0; margin-top: 2px; }
`

function ImportCard({
  title, description, icon, accent,
  busy, file, setFile, onRun, progress, result, error, canModify = true,
}) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const onPick = () => inputRef.current?.click()
  const onChange = (e) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
    e.target.value = ''
  }
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : (progress?.stage === 'done' ? 100 : 0)

  return (
    <div className="imp-card">
      <div className="imp-head">
        <div className={`icbox ${accent}`}>{icon}</div>
        <div>
          <h2>{title}</h2>
          <div className="desc">{description}</div>
        </div>
      </div>

      <div
        className={`drop ${drag ? 'dragover' : ''}`}
        onClick={onPick}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" onChange={onChange} />
        {file ? (
          <>
            <FileSpreadsheet size={22} strokeWidth={1.8} className="ic" />
            <div className="filename">{file.name}</div>
            <div className="meta">{(file.size / 1024).toFixed(1)} KB · click to replace, or drop a new file</div>
          </>
        ) : (
          <>
            <Upload size={22} strokeWidth={1.8} className="ic" />
            <div>Click to choose a CSV file</div>
            <div className="meta">or drag &amp; drop · Access exports (latin-1) supported</div>
          </>
        )}
      </div>

      <div className="imp-btn-row">
        <button className="imp-btn" disabled={!file || busy || !canModify} onClick={onRun}>
          {busy
            ? (<><Loader2 size={14} strokeWidth={2.4} className="ic spin" /> Importing…</>)
            : (<><Upload size={14} strokeWidth={2.4} className="ic" /> Import to Supabase</>)}
        </button>
        {file && !busy && <button className="btn-secondary" onClick={() => setFile(null)}>Clear</button>}
      </div>
      {!canModify && (
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Read-only — sign in as Boss or Manager to import.
        </div>
      )}

      {progress && (
        <div className="progress">
          <div className="label">
            <span>{STAGES[progress.stage] || progress.stage}</span>
            <span>{progress.total > 0 ? `${progress.current} / ${progress.total}` : '…'}</span>
          </div>
          <div className="bar"><i style={{ width: `${Math.min(pct, 100)}%` }} /></div>
        </div>
      )}

      {error && (
        <div className="fail-banner">
          <AlertTriangle size={16} strokeWidth={2} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Import failed</div>
            <div className="msg">{error}</div>
          </div>
        </div>
      )}

      {result && !error && <ResultPanel result={result} kind={accent} />}
    </div>
  )
}

function ResultPanel({ result, kind }) {
  const stats = []
  if (kind === 'orders') {
    stats.push({ l: 'Added', v: result.added, mod: 'added' })
    stats.push({ l: 'Updated', v: result.updated, mod: 'updated' })
    stats.push({ l: 'Skipped', v: result.skipped, mod: 'skipped' })
    stats.push({ l: 'Errors', v: result.errors.length, mod: 'errors' })
  } else {
    stats.push({ l: 'Steps added', v: result.stepsAdded, mod: 'added' })
    stats.push({ l: 'Steps updated', v: result.stepsUpdated, mod: 'updated' })
    stats.push({ l: 'Skipped rows', v: result.skipped, mod: 'skipped' })
    stats.push({ l: 'Errors', v: result.errors.length, mod: 'errors' })
  }
  return (
    <div className="result">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
        <Check size={15} strokeWidth={2.4} /> Import complete — {result.parsed} rows processed
      </div>
      <div className="result-grid">
        {stats.map(s => (
          <div key={s.l} className={`stat ${s.mod}`}>
            <span className="l">{s.l}</span>
            <span className="v">{s.v}</span>
          </div>
        ))}
      </div>

      {(result.productsCreated > 0 || result.customersCreated > 0 || result.partsCreated > 0 || result.assembliesFlagged > 0) && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {result.productsCreated > 0 && <span>· <b style={{ color: 'var(--ink-2)' }}>{result.productsCreated}</b> products auto-created </span>}
          {result.customersCreated > 0 && <span>· <b style={{ color: 'var(--ink-2)' }}>{result.customersCreated}</b> customers auto-created </span>}
          {result.partsCreated > 0 && <span>· <b style={{ color: 'var(--ink-2)' }}>{result.partsCreated}</b> parts created </span>}
          {result.assembliesFlagged > 0 && <span>· <b style={{ color: 'var(--ink-2)' }}>{result.assembliesFlagged}</b> flagged as assembly </span>}
        </div>
      )}

      {kind === 'orders' && result.scheduled != null && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          · <b style={{ color: 'var(--green)' }}>{result.scheduled}</b> scheduled
          {result.scheduleSkipped > 0 && (
            <span>
              {' '}· {result.scheduleSkipped} skipped
              {result.scheduleSkippedReasons && (
                <span> (
                  {[
                    result.scheduleSkippedReasons.noSendDate && `${result.scheduleSkippedReasons.noSendDate} no Send date`,
                    result.scheduleSkippedReasons.noRouting && `${result.scheduleSkippedReasons.noRouting} no routing`,
                    result.scheduleSkippedReasons.zeroMinutes && `${result.scheduleSkippedReasons.zeroMinutes} zero minutes`,
                    result.scheduleSkippedReasons.noQty && `${result.scheduleSkippedReasons.noQty} no qty`,
                  ].filter(Boolean).join(' · ')}
                )</span>
              )}
            </span>
          )}
        </div>
      )}
      {kind === 'orders' && result.scheduleError && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>
          Scheduling failed: {result.scheduleError}
        </div>
      )}
      {kind === 'orders' && result.flaggedForReview > 0 && (
        <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
          ⚠️ <b>{result.flaggedForReview}</b> order{result.flaggedForReview === 1 ? '' : 's'} need{result.flaggedForReview === 1 ? 's' : ''} review — open the <b>Reconcile</b> page to link them to real products.
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="errors-list">
          {result.errors.slice(0, 50).map((e, i) => (
            <div key={i} className="err-row">
              <b>Line {e.line}</b>
              <span>{e.reason}</span>
            </div>
          ))}
          {result.errors.length > 50 && (
            <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', marginTop: 4 }}>
              …and {result.errors.length - 50} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ImportScreen() {
  const canModify = canEdit()
  const appData = useAppData()
  const { reload: reloadAppData } = appData

  const [ordersFile, setOrdersFile] = useState(null)
  const [ordersBusy, setOrdersBusy] = useState(false)
  const [ordersProgress, setOrdersProgress] = useState(null)
  const [ordersResult, setOrdersResult] = useState(null)
  const [ordersError, setOrdersError] = useState(null)

  const [partsFile, setPartsFile] = useState(null)
  const [partsBusy, setPartsBusy] = useState(false)
  const [partsProgress, setPartsProgress] = useState(null)
  const [partsResult, setPartsResult] = useState(null)
  const [partsError, setPartsError] = useState(null)

  const [woodFile, setWoodFile] = useState(null)
  const [woodBusy, setWoodBusy] = useState(false)
  const [woodProgress, setWoodProgress] = useState(null)
  const [woodResult, setWoodResult] = useState(null)
  const [woodError, setWoodError] = useState(null)

  const [steelFile, setSteelFile] = useState(null)
  const [steelBusy, setSteelBusy] = useState(false)
  const [steelProgress, setSteelProgress] = useState(null)
  const [steelResult, setSteelResult] = useState(null)
  const [steelError, setSteelError] = useState(null)

  const [seedBusy, setSeedBusy] = useState(false)
  const [recalcBusy, setRecalcBusy] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const verifyInputRef = useRef(null)

  const handleVerifyPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setVerifyBusy(true)
    try {
      const { summary, issues } = await verifyWoodPartsMap(file, appData)
      // Drop the full diff into the console for forensic inspection — the
      // alert just gives the headline numbers + the first 10 issues.
      console.log('[verifyWoodPartsMap] summary', summary)
      console.log('[verifyWoodPartsMap] issues', issues)
      const lines = [
        `Products: ${summary.productsFound} / ${summary.productsExpected}`,
        `Parts:    ${summary.partsFound} / ${summary.partsExpected}`,
        `Steps:    ${summary.stepsFound} / ${summary.stepsExpected}`,
        ``,
        summary.mismatches === 0
          ? '✅ Everything matches the CSV.'
          : `⚠️ ${summary.mismatches} mismatch${summary.mismatches === 1 ? '' : 'es'} found.`,
      ]
      if (issues.length > 0) {
        lines.push('', 'First issues (full list in console):')
        for (const it of issues.slice(0, 10)) {
          if (it.kind === 'missing-product') lines.push(`• missing product: ${it.product}`)
          else if (it.kind === 'missing-part') lines.push(`• missing part: ${it.product} → ${it.part}`)
          else if (it.kind === 'missing-step') lines.push(`• missing step ${it.sequence} (${it.machine}) on ${it.product} → ${it.part}`)
          else if (it.kind === 'qty-mismatch') lines.push(`• qty: ${it.product} → ${it.part} expected ${it.expected} got ${it.actual}`)
          else if (it.kind === 'machine-mismatch') lines.push(`• machine: ${it.product} → ${it.part} step ${it.sequence} expected "${it.expected}" got "${it.actual}"`)
          else if (it.kind === 'seconds-mismatch') lines.push(`• seconds: ${it.product} → ${it.part} step ${it.sequence} expected ${it.expected}s got ${it.actual}s`)
        }
        if (issues.length > 10) lines.push(`…and ${issues.length - 10} more (see console).`)
      }
      alert(lines.join('\n'))
    } catch (err) {
      alert(`Verify failed: ${err?.message || err}`)
    } finally {
      setVerifyBusy(false)
    }
  }

  const runCleanupOrphans = async () => {
    if (!window.confirm(
      'Delete every product that has zero parts mapped?\n\n' +
      'This removes the old auto-stub products from order imports.\n' +
      'Bowtie products are kept regardless (anything with "bowtie" in its code or description).\n\n' +
      'Cannot be undone.',
    )) return
    setCleanupBusy(true)
    try {
      const r = await deleteProductsWithoutParts()
      alert(
        `Removed ${r.deleted} orphan product${r.deleted === 1 ? '' : 's'}.\n` +
        `Kept ${r.keptBowtie} bowtie product${r.keptBowtie === 1 ? '' : 's'} (protected).\n` +
        `Kept ${r.keptOrderRef} product${r.keptOrderRef === 1 ? '' : 's'} still referenced by orders.\n` +
        `Total products scanned: ${r.total}.`,
      )
      reloadAppData()
    } catch (e) {
      alert(`Cleanup failed: ${e?.message || e}`)
    } finally {
      setCleanupBusy(false)
    }
  }

  const runRecalculate = async () => {
    setRecalcBusy(true)
    try {
      const r = await recalculateAll()
      const reasons = r.skippedReasons || {}
      const reasonLines = []
      if (reasons.noSendDate) reasonLines.push(`  · ${reasons.noSendDate} missing Send week/day`)
      if (reasons.noRouting) reasonLines.push(`  · ${reasons.noRouting} have no parts/machine routing`)
      if (reasons.zeroMinutes) reasonLines.push(`  · ${reasons.zeroMinutes} have zero machine minutes`)
      if (reasons.noQty) reasonLines.push(`  · ${reasons.noQty} have invalid Qty`)
      alert(
        'Schedule recalculated.\n' +
        `${r.scheduled} of ${r.total} orders updated\n` +
        (r.skipped > 0
          ? `${r.skipped} skipped:\n${reasonLines.join('\n')}`
          : 'No orders were skipped.'),
      )
    } catch (e) {
      alert(`Recalc failed: ${e?.message || e}`)
    } finally {
      setRecalcBusy(false)
    }
  }

  const runSeedMachines = async () => {
    setSeedBusy(true)
    try {
      const r = await seedMachines()
      alert(
        'Machines seeded.\n' +
        `Steel: ${r.steel.added} added, ${r.steel.skipped} skipped\n` +
        `Wood: ${r.wood.added} added, ${r.wood.skipped} skipped`,
      )
    } catch (e) {
      alert(`Seed failed: ${e?.message || e}`)
    } finally {
      setSeedBusy(false)
    }
  }

  const runOrders = async () => {
    setOrdersBusy(true); setOrdersError(null); setOrdersResult(null)
    setOrdersProgress({ stage: 'reading', current: 0, total: 0 })
    try {
      const r = await importOrders(ordersFile, p => setOrdersProgress(p))
      setOrdersResult(r)
      // Orders import may auto-create products/customers — refresh the cache.
      reloadAppData()
    } catch (e) {
      setOrdersError(e.message || String(e))
    } finally {
      setOrdersBusy(false)
    }
  }

  const runParts = async () => {
    setPartsBusy(true); setPartsError(null); setPartsResult(null)
    setPartsProgress({ stage: 'reading', current: 0, total: 0 })
    try {
      const r = await importPartsMap(partsFile, p => setPartsProgress(p))
      setPartsResult(r)
      reloadAppData()
    } catch (e) {
      setPartsError(e.message || String(e))
    } finally {
      setPartsBusy(false)
    }
  }

  const runWood = async () => {
    setWoodBusy(true); setWoodError(null); setWoodResult(null)
    setWoodProgress({ stage: 'reading', current: 0, total: 0 })
    try {
      const r = await importWoodPartsMap(woodFile, p => setWoodProgress(p))
      // Reshape to the "parts" panel layout so the existing ResultPanel renders
      // it without a special branch.
      setWoodResult({
        parsed: r.parsed,
        stepsAdded: r.stepsUpserted,
        stepsUpdated: 0,
        skipped: r.skipped,
        errors: r.errors,
        productsCreated: r.productsUpserted,
        partsCreated: r.partsUpserted,
      })
      reloadAppData()
    } catch (e) {
      setWoodError(e.message || String(e))
    } finally {
      setWoodBusy(false)
    }
  }

  const runSteel = async () => {
    setSteelBusy(true); setSteelError(null); setSteelResult(null)
    setSteelProgress({ stage: 'reading', current: 0, total: 0 })
    try {
      const r = await importSteelPartsMap(steelFile, p => setSteelProgress(p))
      setSteelResult({
        parsed: r.parsed,
        stepsAdded: r.stepsUpserted,
        stepsUpdated: 0,
        skipped: r.skipped,
        errors: r.errors,
        productsCreated: r.productsUpserted,
        partsCreated: r.partsUpserted,
        assembliesFlagged: r.assembliesFlagged,
      })
      reloadAppData()
    } catch (e) {
      setSteelError(e.message || String(e))
    } finally {
      setSteelBusy(false)
    }
  }

  return (
    <div className="app">
      <style>{styles}</style>
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Import Data</h1>
            <div className="sub">Bring in Orders and Parts Map CSVs from the Access exports</div>
          </div>
          <div className="topbar-actions">
            {canModify && (
              <button className="ibtn" onClick={runSeedMachines} disabled={seedBusy}>
                {seedBusy
                  ? (<><Loader2 size={15} strokeWidth={2} className="ic" style={{ animation: 'spin 800ms linear infinite' }} /> Seeding…</>)
                  : (<><Factory size={15} strokeWidth={2} className="ic" /> Seed Machines</>)}
              </button>
            )}
            {canModify && (
              <button className="ibtn" onClick={runRecalculate} disabled={recalcBusy}>
                {recalcBusy
                  ? (<><Loader2 size={15} strokeWidth={2} className="ic" style={{ animation: 'spin 800ms linear infinite' }} /> Recalculating…</>)
                  : (<><Activity size={15} strokeWidth={2} className="ic" /> Recalculate Schedule</>)}
              </button>
            )}
            {canModify && (
              <button className="ibtn" onClick={runCleanupOrphans} disabled={cleanupBusy}>
                {cleanupBusy
                  ? (<><Loader2 size={15} strokeWidth={2} className="ic" style={{ animation: 'spin 800ms linear infinite' }} /> Cleaning…</>)
                  : (<><Trash2 size={15} strokeWidth={2} className="ic" /> Delete Empty Products (keep Bowtie)</>)}
              </button>
            )}
            <button className="ibtn" onClick={() => verifyInputRef.current?.click()} disabled={verifyBusy}>
              {verifyBusy
                ? (<><Loader2 size={15} strokeWidth={2} className="ic" style={{ animation: 'spin 800ms linear infinite' }} /> Verifying…</>)
                : (<><CheckCircle2 size={15} strokeWidth={2} className="ic" /> Verify Wood Map</>)}
            </button>
            <input ref={verifyInputRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleVerifyPick} style={{ display: 'none' }} />
            <TopbarActions iconSize={15} />
          </div>
        </div>

        <div className="intro">
          Imports are <b>idempotent</b>: re-uploading the same file just updates existing rows.
          Orders match on <code>Kwitasie #</code>; machine steps match on <code>Code</code> + <code>Seq</code>.
          Missing products and customers are auto-created as stubs — classify them on the Products / Customers screens afterwards.
          Files are decoded as <b>latin-1</b> to handle the Afrikaans characters from Access exports.
        </div>

        <div className="grid">
          <ImportCard
            title="Orders"
            description="OrderW22.csv — production order rows"
            icon={<ListChecks size={20} strokeWidth={1.8} />}
            accent="orders"
            busy={ordersBusy}
            file={ordersFile}
            setFile={setOrdersFile}
            onRun={runOrders}
            progress={ordersProgress}
            result={ordersResult}
            error={ordersError}
            canModify={canModify}
          />
          <ImportCard
            title="Parts Map"
            description="PartsMapW22.csv — product → parts → machine steps routing"
            icon={<Wrench size={20} strokeWidth={1.8} />}
            accent="parts"
            busy={partsBusy}
            file={partsFile}
            setFile={setPartsFile}
            onRun={runParts}
            progress={partsProgress}
            result={partsResult}
            error={partsError}
            canModify={canModify}
          />
          <ImportCard
            title="Wood Parts Map"
            description="Wood_Parts_Map_Final.csv — semicolon-separated, up to 13 steps per part. Tags every product as department=wood."
            icon={<Wrench size={20} strokeWidth={1.8} />}
            accent="parts"
            busy={woodBusy}
            file={woodFile}
            setFile={setWoodFile}
            onRun={runWood}
            progress={woodProgress}
            result={woodResult}
            error={woodError}
            canModify={canModify}
          />
          <ImportCard
            title="Steel Parts Map"
            description="Steel_Parts_Map.csv — semicolon-separated, up to 5 steps per part. Tags every product as department=steel and auto-flags parts named *assembly* as is_assembly."
            icon={<Wrench size={20} strokeWidth={1.8} />}
            accent="parts"
            busy={steelBusy}
            file={steelFile}
            setFile={setSteelFile}
            onRun={runSteel}
            progress={steelProgress}
            result={steelResult}
            error={steelError}
            canModify={canModify}
          />
        </div>
      </main>
    </div>
  )
}
