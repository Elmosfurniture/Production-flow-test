import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, X } from 'lucide-react'
import { listMessages, subscribeMessages } from '../lib/messages'
import { getCurrentUser } from '../lib/auth'
import { enablePush, pushStatus, registerServiceWorker } from '../lib/push'

// App-wide message notifications. The Dashboard message board only subscribes
// while it's mounted; this provider keeps a subscription alive for the WHOLE
// app so a new message pops a toast (and a desktop notification, if allowed)
// no matter which screen you're on, and badges the Dashboard menu item with
// the unread count. "Unread" = messages newer than the last time this device
// opened the board, not written by you.

const Ctx = createContext(null)
export const useMessages = () => useContext(Ctx) || { unread: 0, markRead: () => {}, enableAlerts: () => {}, alertState: 'unsupported' }

const LS_KEY = 'messages:lastSeenAt'

const toastStyles = `
.msg-toast { position: fixed; right: 18px; bottom: 18px; z-index: 4000; width: 340px; max-width: calc(100vw - 28px);
  background: var(--surface, #fff); border: 1px solid var(--hairline-2, rgba(26,29,36,0.12)); border-radius: 14px;
  box-shadow: 0 16px 40px rgba(26,29,36,0.22), 0 4px 10px rgba(26,29,36,0.10); padding: 13px 14px;
  display: flex; gap: 11px; align-items: flex-start; cursor: pointer; animation: msg-toast-in 220ms cubic-bezier(0.32,0.72,0,1); }
@keyframes msg-toast-in { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.msg-toast .ic-wrap { width: 34px; height: 34px; border-radius: 10px; background: var(--amber-soft, rgba(232,154,60,0.14)); color: var(--amber, #e89a3c); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.msg-toast .body { flex: 1; min-width: 0; }
.msg-toast .ttl { font-size: 13px; font-weight: 700; color: var(--ink, #1a1d24); letter-spacing: -0.01em; }
.msg-toast .txt { font-size: 12.5px; color: var(--ink-2, #4a4e5a); line-height: 1.35; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.msg-toast .cta { font-size: 11px; font-weight: 600; color: var(--navy, #1f2a44); margin-top: 5px; }
.msg-toast .close { appearance: none; border: 0; background: transparent; color: var(--ink-3, #8a8e99); cursor: pointer; padding: 2px; border-radius: 6px; flex-shrink: 0; }
.msg-toast .close:hover { background: var(--surface-2, #fbf9f5); color: var(--ink, #1a1d24); }
@media (max-width: 860px) { .msg-toast { right: 10px; left: 10px; bottom: 84px; width: auto; } }
`

function MessageToast({ toast, onOpen, onClose }) {
  return (
    <>
      <style>{toastStyles}</style>
      <div className="msg-toast" onClick={onOpen} role="alert">
        <div className="ic-wrap"><Megaphone size={17} /></div>
        <div className="body">
          <div className="ttl">New message from {toast.author}</div>
          <div className="txt">{toast.body}</div>
          <div className="cta">Tap to open Announcements →</div>
        </div>
        <button className="close" onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Dismiss"><X size={15} /></button>
      </div>
    </>
  )
}

export function MessagesProvider({ children }) {
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState(null)
  // Web-push status: 'off' | 'on' | 'denied' | 'needs-install' | 'unsupported'.
  const [alertState, setAlertState] = useState('off')
  // On a fresh device, baseline "last seen" to now so existing history doesn't
  // show up as a pile of unread — only messages from here on notify.
  const lastSeenRef = useRef((() => {
    try {
      const v = localStorage.getItem(LS_KEY)
      if (v) return v
      const now = new Date().toISOString()
      localStorage.setItem(LS_KEY, now)
      return now
    } catch { return '' }
  })())

  const computeUnread = useCallback((rows) => {
    const seen = lastSeenRef.current
    const me = getCurrentUser()?.id
    return rows.filter((r) => (!seen || r.created_at > seen) && r.author_id !== me).length
  }, [])

  const markRead = useCallback(() => {
    const now = new Date().toISOString()
    lastSeenRef.current = now
    try { localStorage.setItem(LS_KEY, now) } catch { /* ignore */ }
    setUnread(0)
  }, [])

  // Subscribe this device to background Web Push. Throws a helpful message on
  // failure (e.g. iOS not installed to home screen) so the caller can show it.
  const enableAlerts = useCallback(async () => {
    await enablePush(getCurrentUser())
    setAlertState('on')
  }, [])

  // On load: register the worker and reflect current push status.
  useEffect(() => {
    registerServiceWorker()
    pushStatus().then(setAlertState).catch(() => {})
  }, [])

  const fireDesktopNotice = useCallback((row) => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(`New message from ${row.author_name}`, {
          body: row.body,
          tag: 'productionflow-message',
        })
        n.onclick = () => { try { window.focus() } catch { /* ignore */ } ; navigate('/dashboard') }
      }
    } catch { /* ignore */ }
  }, [navigate])

  useEffect(() => {
    let alive = true
    listMessages(30).then((rows) => { if (alive) setUnread(computeUnread(rows)) }).catch(() => {})

    const unsub = subscribeMessages({
      onInsert: (row) => {
        // Don't notify on your own posts, or before anyone has logged in.
        const me = getCurrentUser()
        if (!me || row.author_id === me.id) return
        // If they're already looking at the board, just mark it read — no toast.
        const onDash = typeof window !== 'undefined'
          && window.location.pathname.toLowerCase().includes('/dashboard')
        if (onDash) { markRead(); return }
        setUnread((u) => u + 1)
        setToast({ id: row.id, author: row.author_name, body: row.body })
        fireDesktopNotice(row)
      },
    })
    return () => { alive = false; unsub() }
  }, [computeUnread, fireDesktopNotice, markRead])

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6500)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <Ctx.Provider value={{ unread, markRead, enableAlerts, alertState }}>
      {children}
      {toast && (
        <MessageToast
          toast={toast}
          onOpen={() => { setToast(null); markRead(); navigate('/dashboard') }}
          onClose={() => setToast(null)}
        />
      )}
    </Ctx.Provider>
  )
}
