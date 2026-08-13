import { Minus, Plus } from 'lucide-react'

// Pill-style ± quantity stepper used by Tracking, MES Complete-Step, and the
// End of Day walk. Two step sizes so the operator can dial big batches fast
// (−10/+10) without losing single-piece precision (−1/+1). The middle number
// is also a real input so they can type the count directly when they know it.
//
//   [ −10 ] [ −1 ]    N    [ +1 ] [ +10 ]   / max
//
// onChange always receives a clamped integer in [0, max].

const styles = `
.qty-stepper { display: inline-flex; align-items: center; gap: 2px; background: var(--surface-2, #fbf9f5); border: 1px solid var(--hairline, rgba(26,29,36,0.07)); border-radius: 999px; padding: 3px; }
.qty-stepper button { appearance: none; border: 0; background: var(--surface, #fff); color: var(--ink-2, #4a4e5a); font: inherit; font-size: 14px; font-weight: 600; padding: 0; width: 30px; height: 30px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; transition: color 120ms ease, background 120ms ease, transform 80ms ease; user-select: none; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.qty-stepper button:hover { color: var(--navy, #1f2a44); background: var(--surface, #fff); }
.qty-stepper button:active { transform: scale(0.94); }
.qty-stepper button.big { background: transparent; box-shadow: none; width: 32px; height: 30px; border-radius: 999px; font-size: 10px; font-weight: 700; color: var(--ink-3, #8a8e99); letter-spacing: 0.02em; padding: 0 4px; }
.qty-stepper button.big:hover { background: var(--hairline, rgba(26,29,36,0.07)); color: var(--ink-2, #4a4e5a); }
.qty-stepper button:disabled { opacity: 0.32; cursor: not-allowed; }
.qty-stepper button:disabled:hover { background: var(--surface, #fff); color: var(--ink-2, #4a4e5a); transform: none; }
.qty-stepper .val-wrap { display: inline-flex; align-items: center; justify-content: center; padding: 0 2px; min-width: 32px; }
.qty-stepper .val-wrap input { border: 0; background: transparent; outline: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink, #1a1d24); text-align: center; width: 100%; font-variant-numeric: tabular-nums; -moz-appearance: textfield; padding: 0; }
.qty-stepper .val-wrap input::-webkit-outer-spin-button, .qty-stepper .val-wrap input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.qty-stepper-wrap { display: inline-flex; align-items: center; gap: 8px; }
.qty-stepper-wrap .of { font-size: 12px; color: var(--ink-3, #8a8e99); font-weight: 600; font-variant-numeric: tabular-nums; }
.qty-stepper.compact { padding: 2px; }
.qty-stepper.compact button { width: 26px; height: 26px; font-size: 12px; }
.qty-stepper.compact button.big { width: 28px; height: 26px; font-size: 10px; padding: 0 4px; }
.qty-stepper.compact .val-wrap { min-width: 22px; padding: 0; }
.qty-stepper.compact .val-wrap input { font-size: 13px; width: 22px; }
.qty-stepper-wrap .of { font-size: 11px; }
`

let stylesInjected = false
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const el = document.createElement('style')
  el.setAttribute('data-qty-stepper', 'true')
  el.textContent = styles
  document.head.appendChild(el)
}

export default function QtyStepper({
  value,
  max = null,
  min = 0,
  onChange,
  showMax = false,
  compact = false,
  jump = true,            // show the ±10 buttons; set false for the bare 3-button pill
  bigStep = 10,
}) {
  injectStyles()
  const clamp = (v) => {
    let n = Math.floor(Number.isFinite(v) ? v : 0)
    if (n < min) n = min
    if (max != null && n > max) n = max
    return n
  }
  const set = (v) => onChange(clamp(v))
  const safeMax = max != null ? max : Infinity
  const iconSize = compact ? 12 : 14
  return (
    <div className="qty-stepper-wrap">
      <div className={`qty-stepper ${compact ? 'compact' : ''}`}>
        {jump && (
          <button
            type="button"
            className="minus big"
            onClick={() => set(value - bigStep)}
            disabled={value <= min}
            aria-label={`Decrease by ${bigStep}`}
          >−{bigStep}</button>
        )}
        <button
          type="button"
          className="minus"
          onClick={() => set(value - 1)}
          disabled={value <= min}
          aria-label="Decrease by 1"
        ><Minus size={iconSize} strokeWidth={2.4} /></button>
        <div className="val-wrap">
          <input
            type="number"
            value={value}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '' || raw === '-') { set(0); return }
              set(parseInt(raw, 10))
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>
        <button
          type="button"
          className="plus"
          onClick={() => set(value + 1)}
          disabled={value >= safeMax}
          aria-label="Increase by 1"
        ><Plus size={iconSize} strokeWidth={2.4} /></button>
        {jump && (
          <button
            type="button"
            className="plus big"
            onClick={() => set(value + bigStep)}
            disabled={value >= safeMax}
            aria-label={`Increase by ${bigStep}`}
          >+{bigStep}</button>
        )}
      </div>
      {showMax && max != null && <span className="of">/ {max}</span>}
    </div>
  )
}
