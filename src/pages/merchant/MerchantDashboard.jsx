import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'

export default function MerchantDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ orders: 0, confirmed: 0, delivered: 0, failed: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const bid = profile?.business_id
      const [ordersRes, recentRes] = await Promise.all([
        supabase.from('orders').select('status').eq('merchant_id', bid),
        supabase.from('orders')
          .select('id, status, delivery_state, total_amount, created_at, customers(full_name)')
          .eq('merchant_id', bid)
          .order('created_at', { ascending: false })
          .limit(8)
      ])
      if (ordersRes.data) {
        const d = ordersRes.data
        setStats({
          orders: d.length,
          confirmed: d.filter(o => o.status === 'confirmed').length,
          delivered: d.filter(o => o.status === 'delivered').length,
          failed: d.filter(o => o.status === 'failed').length,
        })
      }
      if (recentRes.data) setRecentOrders(recentRes.data)
      setLoading(false)
    }
    if (profile?.business_id) load()
  }, [profile])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{greeting}, {profile?.full_name?.split(' ')[0]} 👋</h1>
        <p className="text-ink-400 text-sm mt-0.5">Here's what's happening with your store today.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-surface-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Orders" value={stats.orders} icon="◎" color="brand" />
          <StatCard label="Confirmed" value={stats.confirmed} icon="◉" color="success" />
          <StatCard label="Delivered" value={stats.delivered} icon="▣" color="cod" />
          <StatCard label="Failed" value={stats.failed} icon="◆" color="danger" />
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink-900">Recent Orders</h2>
          <span className="text-xs text-ink-400">{recentOrders.length} shown</span>
        </div>
        {recentOrders.length === 0 ? (
          <div className="text-center py-12 text-ink-300">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium text-ink-500">No orders yet</p>
            <p className="text-sm mt-1">Orders will appear here once they come in.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {recentOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900 truncate">
                    {order.customers?.full_name || 'Unknown customer'}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {order.delivery_state || '—'} · {new Date(order.created_at).toLocaleDateString('en-NG')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-sm font-semibold text-ink-900">
                    ₦{Number(order.total_amount).toLocaleString()}
                  </p>
                  <Badge status={order.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
