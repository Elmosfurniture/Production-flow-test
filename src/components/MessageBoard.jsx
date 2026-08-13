import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Megaphone, Send, Trash2, Bell, BellRing } from 'lucide-react'
import { canEdit, getCurrentUser, deptLabel } from '../lib/auth'
import {
  deleteMessage,
  listMessages,
  postMessage,
  subscribeMessages,
} from '../lib/messages'
import { useMessages } from '../store/MessagesContext'
import { useConfirm } from './ConfirmDialog'

const styles = `
.mb-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  margin-bottom: 18px;
}
.mb-head {
  padding: 14px 20px 12px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--hairline);
}
.mb-head h2 {
  margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.015em;
  display: inline-flex; align-items: center; gap: 8px;
}
.mb-head h2 .ic { width: 16px; height: 16px; color: var(--amber); }
.mb-head .meta { font-size: 12px; color: var(--ink-3); font-weight: 500; }
.mb-head-right { display: inline-flex; align-items: center; gap: 12px; }
.mb-alert-btn { appearance: none; border: 1px solid var(--hairline-2); background: var(--surface-2); color: var(--ink-2); font: inherit; font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.mb-alert-btn:hover { background: var(--surface); color: var(--navy); border-color: var(--navy); }
.mb-alert-on { font-size: 11px; font-weight: 600; color: var(--green, #34c759); display: inline-flex; align-items: center; gap: 5px; }
.mb-alert-hint { font-size: 11px; font-weight: 600; color: var(--amber, #e89a3c); }

.mb-body { padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 12px; }

.mb-feed {
  display: flex; flex-direction: column; gap: 10px;
  max-height: 320px; overflow-y: auto;
  padding-right: 4px;
}
.mb-empty {
  text-align: center; padding: 24px 12px;
  font-size: 13px; color: var(--ink-3); font-weight: 500;
}

.mb-msg {
  display: flex; gap: 12px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  padding: 12px 14px;
  position: relative;
}
.mb-msg .avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--navy); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; letter-spacing: -0.01em;
  flex-shrink: 0;
}
.mb-msg .avatar.boss { background: var(--amber); color: var(--ink); }
.mb-msg .content { flex: 1; min-width: 0; }
.mb-msg .meta-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 4px;
}
.mb-msg .name { font-size: 13px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.mb-msg .role-pill {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px; border-radius: 999px;
  background: var(--navy-soft); color: var(--navy);
}
.mb-msg .role-pill.boss { background: var(--amber-soft); color: var(--amber); }
[data-theme="dark"] .mb-msg .role-pill { color: var(--amber-2); }
.mb-msg .dept { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.mb-msg .ts { font-size: 11px; color: var(--ink-3); font-weight: 500; margin-left: auto; font-variant-numeric: tabular-nums; }
.mb-msg .body {
  font-size: 14px; color: var(--ink); line-height: 1.45;
  white-space: pre-wrap; word-wrap: break-word;
}
.mb-msg .del {
  appearance: none; border: 0; background: transparent;
  color: var(--ink-3); cursor: pointer; padding: 4px;
  border-radius: 6px;
  display: inline-flex; align-items: center;
}
.mb-msg .del:hover { background: var(--red-soft); color: var(--red); }
.mb-msg .del .ic { width: 14px; height: 14px; }

.mb-composer {
  display: flex; flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--hairline-2);
  border-radius: var(--r-xl);
  padding: 8px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.mb-composer:focus-within {
  border-color: var(--navy);
  box-shadow: 0 0 0 3px var(--navy-soft);
}
.mb-composer textarea {
  width: 100%; min-height: 44px; max-height: 200px;
  resize: none; border: 0; outline: none;
  background: transparent; color: var(--ink);
  font: inherit; font-size: 14px; line-height: 1.45;
  padding: 10px 12px;
}
.mb-composer textarea::placeholder { color: var(--ink-3); }
.mb-composer .row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 6px 2px;
}
.mb-composer .hint { font-size: 11px; color: var(--ink-3); font-weight: 500; }
.mb-composer .send {
  appearance: none; border: 0; cursor: pointer;
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--navy); color: white;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 160ms ease, transform 80ms ease;
  box-shadow: var(--shadow-btn);
}
.mb-composer .send:hover:not(:disabled) { background: var(--navy-2); }
.mb-composer .send:active:not(:disabled) { transform: scale(0.96); }
.mb-composer .send:disabled {
  background: var(--hairline-2); color: var(--ink-3); cursor: not-allowed;
  box-shadow: none;
}
.mb-composer .send .ic { width: 16px; height: 16px; }

.mb-error {
  font-size: 12px; color: var(--red);
  background: var(--red-soft);
  padding: 8px 12px; border-radius: 8px;
}

.mb-readonly {
  font-size: 12px; color: var(--ink-3); font-weight: 500;
  text-align: center; padding: 6px;
}
`

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?'
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function MessageBoard() {
  const user = getCurrentUser()
  const mayPost = canEdit(user?.role)
  const isBoss = user?.role === 'Boss'

  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const taRef = useRef(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { markRead, enableAlerts, alertState } = useMessages()
  const [alertBusy, setAlertBusy] = useState(false)
  const [alertErr, setAlertErr] = useState('')

  // Opening the board = you've seen the messages → clear the unread badge.
  useEffect(() => { markRead() }, [markRead])

  const handleEnableAlerts = async () => {
    setAlertBusy(true)
    setAlertErr('')
    try {
      await enableAlerts()
    } catch (e) {
      setAlertErr(e.message || String(e))
    } finally {
      setAlertBusy(false)
    }
  }

  const refresh = useCallback(async () => {
    try {
      const rows = await listMessages(30)
      setMessages(rows)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsub = subscribeMessages({
      onInsert: (row) => setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev
        return [row, ...prev].slice(0, 30)
      }),
      onDelete: (row) => setMessages((prev) => prev.filter((m) => m.id !== row.id)),
    })
    return unsub
  }, [refresh])

  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [draft])

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!mayPost || sending) return
    const body = draft.trim()
    if (!body) return
    setSending(true)
    setError('')
    try {
      const row = await postMessage({ body, author: user })
      setDraft('')
      if (row) {
        setMessages((prev) => prev.some((m) => m.id === row.id) ? prev : [row, ...prev].slice(0, 30))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleDelete = async (id) => {
    if (!isBoss) return
    const ok = await confirm({
      title: 'Delete this announcement?',
      body: 'The message will be removed from everyone’s view immediately.',
      confirmLabel: 'Delete message',
    })
    if (!ok) return
    try {
      await deleteMessage(id)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <style>{styles}</style>
      <div className="mb-card">
        <div className="mb-head">
          <h2><Megaphone size={16} className="ic" /> Announcements</h2>
          <div className="mb-head-right">
            {(alertState === 'off') && (
              <button type="button" className="mb-alert-btn" onClick={handleEnableAlerts} disabled={alertBusy} title="Get a notification on this device when a new message arrives">
                <Bell size={13} /> {alertBusy ? 'Enabling…' : 'Enable notifications'}
              </button>
            )}
            {alertState === 'on' && (
              <span className="mb-alert-on" title="Push notifications are on for this device"><BellRing size={13} /> Notifications on</span>
            )}
            {alertState === 'needs-install' && (
              <span className="mb-alert-hint" title="On iPhone, add the app to your Home Screen first">Add to Home Screen for alerts</span>
            )}
            {alertState === 'denied' && (
              <span className="mb-alert-hint">Notifications blocked in settings</span>
            )}
            <div className="meta">
              {messages.length === 0 ? 'No messages yet' : `${messages.length} message${messages.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
        <div className="mb-body">
          {mayPost ? (
            <form className="mb-composer" onSubmit={handleSubmit}>
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Post an update for everyone…"
                rows={1}
              />
              <div className="row">
                <span className="hint">Posting as <b>{user?.name}</b> · {user?.role} · {deptLabel(user?.activeDepartment)}</span>
                <button
                  type="submit"
                  className="send"
                  disabled={!draft.trim() || sending}
                  aria-label="Send message"
                >
                  <Send size={16} className="ic" />
                </button>
              </div>
            </form>
          ) : (
            <div className="mb-readonly">Only Boss & Managers can post messages.</div>
          )}

          {error && <div className="mb-error">{error}</div>}
          {alertErr && <div className="mb-error">{alertErr}</div>}

          <div className="mb-feed">
            {messages.length === 0 && (
              <div className="mb-empty">No announcements yet. Updates posted here will appear for everyone.</div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="mb-msg">
                <div className={`avatar ${m.author_role === 'Boss' ? 'boss' : ''}`}>{initials(m.author_name)}</div>
                <div className="content">
                  <div className="meta-row">
                    <span className="name">{m.author_name}</span>
                    <span className={`role-pill ${m.author_role === 'Boss' ? 'boss' : ''}`}>{m.author_role}</span>
                    {m.author_dept && <span className="dept">· {deptLabel(m.author_dept)}</span>}
                    <span className="ts">{timeAgo(m.created_at)}</span>
                  </div>
                  <div className="body">{m.body}</div>
                </div>
                {isBoss && (
                  <button className="del" onClick={() => handleDelete(m.id)} aria-label="Delete message">
                    <Trash2 size={14} className="ic" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {confirmDialog}
    </>
  )
}
