import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const TYPE_ICONS = {
  order_confirmed: '✅',
  logistics_request_created: '📦',
  agent_assigned: '🚚',
  delivery_update: '🛵',
  delivery_failed: '⚠️',
  stock_dispatched: '📤',
  stock_received: '📥',
  stock_low: '⚠️',
  restock_requested: '🔁',
  cod_remitted: '💰',
  cod_settled: '✅',
  task_escalated: '🔺',
  cod_overdue: '⏳',
}

export default function NotificationBell() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (profile?.id) load()
  }, [profile])

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setNotifications(data)
  }

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-100 transition-colors text-ink-500"
        title="Notifications">
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-panel border border-surface-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 sticky top-0 bg-white">
            <p className="font-semibold text-ink-900 text-sm">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 font-medium hover:underline">Mark all read</button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-2xl mb-2">🔔</p>
              <p className="text-sm text-ink-400">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100">
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-surface-50 transition-colors ${!n.is_read ? 'bg-brand-50/40' : ''}`}>
                  <span className="text-base flex-shrink-0">{TYPE_ICONS[n.type] || '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${!n.is_read ? 'font-semibold text-ink-900' : 'font-medium text-ink-700'}`}>{n.title}</p>
                    {n.message && <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{n.message}</p>}
                    <p className="text-xs text-ink-300 mt-1">{new Date(n.created_at).toLocaleString('en-NG')}</p>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-600 flex-shrink-0 mt-1.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}