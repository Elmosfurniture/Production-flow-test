import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// Reusable confirm dialog + matching hook. Use `useConfirm()` in any component
// that performs a destructive action; await `confirm({...})` returns true if
// the user clicks the danger button, false on cancel / Esc / backdrop click.

const styles = `
.cfd-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.cfd-card {
  background: var(--surface, #fff);
  border: 1px solid var(--hairline, rgba(0,0,0,0.08));
  border-radius: var(--r-lg, 18px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.10);
  width: 100%; max-width: 420px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.cfd-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08));
  background: var(--surface-2, #fafafa);
}
.cfd-head.danger { background: var(--red-soft, rgba(210,83,58,0.10)); }
.cfd-head .ic { color: var(--red, #d2533a); flex-shrink: 0; }
.cfd-head h3 {
  margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.015em;
  color: var(--ink, #1a1d24);
}
.cfd-head .cfd-close {
  appearance: none; border: 0; background: transparent;
  margin-left: auto;
  width: 28px; height: 28px; border-radius: 7px;
  color: var(--ink-3, #8a8e99); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.cfd-head .cfd-close:hover { background: var(--surface, #fff); color: var(--ink, #1a1d24); }
.cfd-body {
  padding: 16px 18px;
  font-size: 13px; line-height: 1.5;
  color: var(--ink-2, #4a4e5a);
}
.cfd-actions {
  padding: 12px 18px 14px;
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--hairline, rgba(0,0,0,0.08));
}
.cfd-cancel, .cfd-confirm {
  appearance: none; border: 1px solid var(--hairline-2, rgba(0,0,0,0.12));
  background: var(--surface, #fff); color: var(--ink, #1a1d24);
  font: inherit; font-size: 13px; font-weight: 600;
  padding: 9px 16px; border-radius: 9px; cursor: pointer;
}
.cfd-cancel:hover { background: var(--surface-2, #fafafa); }
.cfd-confirm.danger {
  background: var(--red, #d2533a); color: white; border-color: var(--red, #d2533a);
}
.cfd-confirm.danger:hover { filter: brightness(0.92); }
.cfd-confirm:not(.danger) {
  background: var(--navy, #1f2a44); color: white; border-color: var(--navy, #1f2a44);
}
`

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  body = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
      else if (e.key === 'Enter') onConfirm?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm])

  if (!open) return null
  return (
    <>
      <style>{styles}</style>
      <div className="cfd-overlay" onClick={onCancel}>
        <div className="cfd-card" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
          <div className={`cfd-head ${danger ? 'danger' : ''}`}>
            {danger && <AlertTriangle size={18} className="ic" />}
            <h3>{title}</h3>
            <button type="button" className="cfd-close" onClick={onCancel} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="cfd-body">{body}</div>
          <div className="cfd-actions">
            <button type="button" className="cfd-cancel" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" className={`cfd-confirm ${danger ? 'danger' : ''}`} onClick={onConfirm} autoFocus>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </>
  )
}

export function useConfirm() {
  const [state, setState] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({
        title: opts.title ?? 'Are you sure?',
        body: opts.body ?? 'This action cannot be undone.',
        confirmLabel: opts.confirmLabel ?? 'Delete',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        danger: opts.danger !== false,
      })
    })
  }, [])

  const close = useCallback((result) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setState(null)
  }, [])

  const dialog = state ? (
    <ConfirmDialog
      open
      title={state.title}
      body={state.body}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null

  return { confirm, dialog }
}

export default ConfirmDialog
