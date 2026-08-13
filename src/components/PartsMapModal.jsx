import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Package, Factory, ArrowRight, Edit2 } from 'lucide-react'
import { useAppData } from '../store/AppDataContext'

// Quick read-only peek at a product's parts map. Opened by double-clicking
// an order row on Priority (or anywhere else that wants to surface routing
// without taking the user to the Products page).

const STEP_COLORS = ['blue', 'purple', 'amber', 'green', 'teal']
function colorForMachine(name) {
  if (!name) return 'muted'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return STEP_COLORS[h % STEP_COLORS.length]
}

const styles = `
.pm-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.pm-modal {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg, 22px);
  box-shadow: var(--shadow-pop, 0 12px 28px rgba(26,29,36,0.18));
  width: 100%; max-width: 820px; max-height: 92vh;
  display: flex; flex-direction: column; overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
.pm-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--hairline);
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 14px; background: var(--surface-2);
}
.pm-head .ttl { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pm-head h3 {
  margin: 0; font-size: 17px; font-weight: 600; color: var(--ink);
  letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px;
}
.pm-head .sub {
  font-size: 12px; color: var(--ink-3);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}
.pm-head .dept {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 999px;
  background: var(--navy-soft); color: var(--navy);
}
.pm-head .close {
  appearance: none; border: 0; background: transparent;
  width: 32px; height: 32px; border-radius: 8px;
  color: var(--ink-3); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.pm-head .close:hover { background: var(--surface); color: var(--ink); }
.pm-head .open-edit {
  appearance: none; border: 1px solid var(--hairline-2);
  background: var(--surface); color: var(--ink-2);
  border-radius: 10px; padding: 7px 11px; font: inherit; font-size: 12px; font-weight: 500;
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  white-space: nowrap;
}
.pm-head .open-edit:hover { background: var(--navy); color: white; border-color: var(--navy); }
.pm-head .open-edit .ic { width: 12px; height: 12px; }
.pm-head .head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pm-body { overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.pm-summary {
  display: flex; flex-wrap: wrap; gap: 10px;
  font-size: 12px; color: var(--ink-2);
}
.pm-summary .pill {
  background: var(--surface-2); border: 1px solid var(--hairline);
  border-radius: 999px; padding: 3px 10px;
}
.pm-summary .pill b { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
.pm-empty {
  background: var(--amber-soft); border: 1px solid rgba(232,154,60,0.25);
  color: var(--amber); border-radius: 12px; padding: 12px 14px;
  font-size: 13px; line-height: 1.4;
}
.pm-empty b { color: inherit; }
.pm-part {
  display: grid; grid-template-columns: 36px 1fr; gap: 10px;
  padding: 12px; background: var(--surface-2);
  border: 1px solid var(--hairline); border-radius: 14px;
}
.pm-part .pri {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--navy); color: white;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 12px;
}
.pm-part .pname {
  font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 6px;
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
}
.pm-part .pname .x {
  font-size: 11px; font-weight: 500; color: var(--ink-3);
  background: var(--surface); border: 1px solid var(--hairline);
  border-radius: 6px; padding: 2px 6px;
}
.pm-part .pname .asm {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 6px;
  background: var(--purple-soft, rgba(139,95,191,0.12));
  color: var(--purple, #8b5fbf);
}
.pm-route {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  font-size: 12px;
}
.pm-step {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 8px; font-weight: 500;
  font-size: 11px; white-space: nowrap;
}
.pm-step.blue { background: var(--blue-soft); color: var(--blue); }
.pm-step.purple { background: var(--purple-soft); color: var(--purple); }
.pm-step.amber { background: var(--amber-soft); color: var(--amber); }
.pm-step.green { background: var(--green-soft); color: var(--green); }
.pm-step.teal { background: rgba(45,170,170,0.14); color: rgb(30,140,140); }
.pm-step.muted { background: var(--surface); color: var(--ink-3); border: 1px solid var(--hairline); }
.pm-step .secs { font-weight: 700; font-variant-numeric: tabular-nums; }
.pm-step .dayoff { font-weight: 800; font-variant-numeric: tabular-nums; padding: 1px 5px; border-radius: 5px; background: var(--green-soft); color: var(--green, #3a9d5a); letter-spacing: 0.02em; }
.pm-route .arrow { color: var(--ink-3); }
.pm-no-steps { font-size: 12px; color: var(--ink-3); font-style: italic; }
.pm-no-product {
  background: var(--surface-2); border: 1px dashed var(--hairline-2);
  border-radius: 12px; padding: 24px; text-align: center;
  color: var(--ink-3); font-size: 13px;
}
.pm-no-product b { color: var(--ink); font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
.pm-section-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-3); padding: 2px 4px 4px;
  display: flex; align-items: center; gap: 8px;
}
.pm-section-label .badge {
  background: var(--navy-soft); color: var(--navy);
  padding: 2px 9px; border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
}
.pm-section-label .badge.steel { background: var(--blue-soft); color: var(--blue); }
.pm-section-label .badge.wood { background: var(--green-soft); color: var(--green); }
.pm-section-label .badge.upholstery { background: var(--amber-soft); color: var(--amber); }
.pm-section-label .badge.dispatch { background: var(--purple-soft); color: var(--purple); }
.pm-section-label .badge.mixed,
.pm-section-label .badge.no-routing { background: var(--red-soft); color: var(--red); }
.pm-section { display: flex; flex-direction: column; gap: 10px; }
`

export default function PartsMapModal({ productCode, onClose }) {
  const { getProductWithParts, machineByName } = useAppData()
  const navigate = useNavigate()
  const product = useMemo(
    () => (productCode ? getProductWithParts(productCode) : null),
    [productCode, getProductWithParts],
  )

  // Group parts by the dept(s) their machines belong to. A part whose first
  // step is a steel welder goes into the Steel bucket; a part using a wood
  // CNC into the Wood bucket. Parts that mix machines from multiple depts
  // (rare) appear in a "Mixed" bucket so the user can see something's off.
  const groupedParts = useMemo(() => {
    if (!product) return []
    const buckets = new Map() // dept -> parts[]
    for (const pt of product.parts) {
      const stepDepts = new Set()
      for (const s of pt.steps) {
        const m = machineByName?.get(s.machine_name)
        stepDepts.add(m?.department || 'other')
      }
      const key = stepDepts.size === 0 ? 'no-routing'
        : stepDepts.size === 1 ? [...stepDepts][0]
        : 'mixed'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(pt)
    }
    // Order: product's primary dept first, then the rest alphabetical
    const sortKey = (d) => {
      if (d === product.department) return ''
      if (d === 'mixed') return 'zzz1'
      if (d === 'no-routing') return 'zzz2'
      return d
    }
    return [...buckets.entries()]
      .sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])))
      .map(([dept, partsList]) => ({ dept, parts: partsList }))
  }, [product, machineByName])

  const openInProducts = () => {
    if (!product?.id) return
    onClose?.()
    // ProductsScreen reads location.state.editProductId on mount and pops
    // straight into edit mode for that row.
    navigate('/products', { state: { editProductId: product.id, editProductDept: product.department } })
  }

  useEffect(() => {
    if (!productCode) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [productCode, onClose])

  if (!productCode) return null

  const totalSteps = product
    ? product.parts.reduce((s, pt) => s + pt.steps.length, 0)
    : 0
  const totalSeconds = product
    ? product.parts.reduce(
        (s, pt) => s + pt.steps.reduce((ss, st) => ss + (st.seconds_per_part || 0), 0),
        0,
      )
    : 0

  return (
    <div className="pm-overlay" onClick={onClose}>
      <style>{styles}</style>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <div className="ttl">
            <h3>
              <Package size={17} strokeWidth={2} />
              {product?.description || productCode}
              {product?.department && (
                <span className="dept"><Factory size={10} />{product.department}</span>
              )}
            </h3>
            <span className="sub">{productCode}</span>
          </div>
          <div className="head-actions">
            {product?.id && (
              <button
                type="button"
                className="open-edit"
                onClick={openInProducts}
                title="Jump to this product on the Products page (edit mode)"
              >
                <Edit2 size={12} strokeWidth={2.4} className="ic" />
                Open in Products
              </button>
            )}
            <button type="button" className="close" onClick={onClose} title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="pm-body">
          {!product ? (
            <div className="pm-no-product">
              No product in the catalogue with code <b>{productCode}</b>.
            </div>
          ) : (
            <>
              <div className="pm-summary">
                <span className="pill"><b>{product.parts.length}</b> parts</span>
                <span className="pill"><b>{totalSteps}</b> steps</span>
                {totalSeconds > 0 && <span className="pill"><b>{totalSeconds}</b>s per unit (sum)</span>}
                {product.is_dispatch_only && <span className="pill" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><b>Dispatch-only</b></span>}
              </div>
              {product.parts.length === 0 ? (
                <div className="pm-empty">
                  <b>No parts mapped yet.</b> Open the product on the Products page to add parts and machine routing.
                </div>
              ) : (
                groupedParts.map(({ dept, parts: partsList }) => (
                  <div key={dept} className="pm-section">
                    {groupedParts.length > 1 && (
                      <div className="pm-section-label">
                        <span className={`badge ${dept}`}>{dept === 'no-routing' ? 'No routing' : dept}</span>
                        <span>{partsList.length} part{partsList.length === 1 ? '' : 's'}</span>
                      </div>
                    )}
                    {partsList.map((pt) => (
                      <div key={pt.id} className="pm-part">
                        <span className="pri" title={`Priority ${pt.part_priority ?? 1}`}>{pt.part_priority ?? 1}</span>
                        <div>
                          <div className="pname">
                            <span>{pt.name}</span>
                            <span className="x">×{pt.qty_per_unit ?? 1} / unit</span>
                            {pt.is_assembly && <span className="asm">Assembly</span>}
                          </div>
                          {pt.steps.length === 0 ? (
                            <div className="pm-no-steps">No machine steps recorded.</div>
                          ) : (
                            <div className="pm-route">
                              {pt.steps.map((s, i) => (
                                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <span className={`pm-step ${colorForMachine(s.machine_name)}`}>
                                    {s.machine_name}
                                    {s.seconds_per_part > 0 && <span className="secs">{s.seconds_per_part}s</span>}
                                    {s.setup_time > 0 && <span className="secs">+{s.setup_time}m SU</span>}
                                    {s.wood_day_offset != null && machineByName?.get(s.machine_name)?.department === 'wood' && (
                                      <span className="dayoff" title={`Pinned to conveyor day +${s.wood_day_offset}`}>d+{s.wood_day_offset}</span>
                                    )}
                                  </span>
                                  {i < pt.steps.length - 1 && <ArrowRight size={11} className="arrow" />}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
