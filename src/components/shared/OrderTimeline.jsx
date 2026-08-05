import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getVisibleEvents, EVENT_ICONS } from '../../lib/orderEventHelpers'

const VISIBILITY_BADGE = {
  internal: <span className="badge bg-amber-50 text-amber-700 ml-2">Internal</span>,
  management: <span className="badge bg-purple-50 text-purple-700 ml-2">Management</span>,
}

export default function OrderTimeline({ orderId, onClose }) {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase
      .from('order_events')
      .select('*, users(full_name)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    if (data) setEvents(data)
    setLoading(false)
  }

  const visible = getVisibleEvents(events, profile)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-surface-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-ink-900">Order Timeline</h3>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-600 text-xl">✕</button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-surface-100 rounded-xl animate-pulse" />)}</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">🕐</p>
              <p className="text-ink-500 font-medium">No timeline events yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map((e, i) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className="text-lg">{EVENT_ICONS[e.event_type] || '•'}</span>
                    {i < visible.length - 1 && <span className="w-px flex-1 bg-surface-200 mt-1" />}
                  </div>
                  <div className="pb-4 min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {e.description}
                      {VISIBILITY_BADGE[e.visibility_level]}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {e.users?.full_name || 'System'} · {new Date(e.created_at).toLocaleString('en-NG')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}