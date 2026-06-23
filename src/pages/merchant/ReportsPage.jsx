import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'

export default function ReportsPage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('orders').select('status, total_amount, delivery_state, source, created_at').eq('merchant_id', profile.business_id)
    if (data) setOrders(data)
  }

  const delivered = orders.filter(o => o.status === 'delivered')
  const failed = orders.filter(o => o.status === 'failed')
  const successRate = orders.length ? Math.round((delivered.length / orders.length) * 100) : 0

  const bySource = orders.reduce((acc, o) => { acc[o.source] = (acc[o.source] || 0) + 1; return acc }, {})
  const byState = delivered.reduce((acc, o) => { acc[o.delivery_state] = (acc[o.delivery_state] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-6">
      <h1 className="page-title">Reports</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orders" value={orders.length} icon="◎" color="brand" />
        <StatCard label="Delivered" value={delivered.length} icon="▣" color="success" />
        <StatCard label="Failed" value={failed.length} icon="◆" color="danger" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon="◉" color={successRate >= 70 ? 'success' : 'warning'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card">
          <h2 className="font-semibold text-ink-900 mb-4">Orders by Source</h2>
          <div className="space-y-2">
            {Object.entries(bySource).sort((a,b) => b[1]-a[1]).map(([src, count]) => (
              <div key={src} className="flex items-center justify-between">
                <span className="text-sm text-ink-700 capitalize">{src}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(count/orders.length)*100}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-ink-900 w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-ink-900 mb-4">Top Delivery States</h2>
          <div className="space-y-2">
            {Object.entries(byState).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([state, count]) => (
              <div key={state} className="flex items-center justify-between">
                <span className="text-sm text-ink-700">{state}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${(count/delivered.length)*100}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-ink-900 w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
            {Object.keys(byState).length === 0 && <p className="text-sm text-ink-400 text-center py-6">No delivered orders yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
