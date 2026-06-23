import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'

export default function LogisticsDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ requests: 0, pending: 0, delivered: 0, failed: 0 })
  const [recent, setRecent] = useState([])

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [rRes, recentRes] = await Promise.all([
      supabase.from('logistics_requests').select('status').eq('logistics_id', bid),
      supabase.from('logistics_requests').select('id, status, delivery_state, created_at, businesses!logistics_requests_merchant_id_fkey(name)').eq('logistics_id', bid).order('created_at', { ascending: false }).limit(8),
    ])
    if (rRes.data) {
      const d = rRes.data
      setStats({ requests: d.length, pending: d.filter(r => r.status === 'pending').length, delivered: d.filter(r => r.status === 'delivered').length, failed: d.filter(r => r.status === 'failed').length })
    }
    if (recentRes.data) setRecent(recentRes.data)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{greeting}, {profile?.full_name?.split(' ')[0]} 👋</h1>
        <p className="text-ink-400 text-sm mt-0.5">Logistics operations overview.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={stats.requests} icon="◎" color="brand" />
        <StatCard label="Pending" value={stats.pending} icon="◉" color="warning" />
        <StatCard label="Delivered" value={stats.delivered} icon="▣" color="success" />
        <StatCard label="Failed" value={stats.failed} icon="◆" color="danger" />
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900 mb-4">Recent Requests</h2>
        {recent.length === 0 ? (
          <div className="text-center py-12 text-ink-300">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium text-ink-500">No requests yet</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {recent.map(r => (
              <div key={r.id} className="flex items-center justify-between py-3 gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{r.businesses?.name || 'Unknown merchant'}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{r.delivery_state} · {new Date(r.created_at).toLocaleDateString('en-NG')}</p>
                </div>
                <Badge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
