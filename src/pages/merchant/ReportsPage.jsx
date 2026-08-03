import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'

function fmtNaira(n) { return `₦${Number(n || 0).toLocaleString()}` }
function fmtHours(h) {
  if (h === null || h === undefined) return '—'
  if (h < 24) return `${h.toFixed(1)} hrs`
  return `${(h / 24).toFixed(1)} days`
}

export default function ReportsPage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [logisticsRequests, setLogisticsRequests] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [oRes, lrRes] = await Promise.all([
      supabase.from('orders')
        .select('id, status, total_amount, delivery_state, source, created_at, customer_id, order_items(quantity, unit_cost_price, unit_selling_price, products(name))')
        .eq('merchant_id', bid),
      // logistics_requests carries merchant_id even though it lives on Royale's side —
      // this is the timing data we CAN see without crossing into Royale's internal tables
      supabase.from('logistics_requests')
        .select('order_id, delivery_state, status, created_at, assigned_at, delivered_at')
        .eq('merchant_id', bid),
    ])
    if (oRes.data) setOrders(oRes.data)
    if (lrRes.data) setLogisticsRequests(lrRes.data)
  }

  const delivered = orders.filter(o => o.status === 'delivered')
  const failed = orders.filter(o => o.status === 'failed')
  const successRate = orders.length ? Math.round((delivered.length / orders.length) * 100) : 0

  const bySource = orders.reduce((acc, o) => { acc[o.source] = (acc[o.source] || 0) + 1; return acc }, {})

  // ---- STATE INSIGHTS ----
  const states = [...new Set(orders.map(o => o.delivery_state).filter(Boolean))]

  const stateInsights = states.map(state => {
    const stateOrders = orders.filter(o => o.delivery_state === state)
    const stateDelivered = stateOrders.filter(o => o.status === 'delivered')
    const stateFailed = stateOrders.filter(o => o.status === 'failed')
    const revenue = stateDelivered.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    const grossProfit = stateDelivered.reduce((s, o) =>
      s + (o.order_items || []).reduce((si, i) => si + (Number(i.unit_selling_price) - Number(i.unit_cost_price)) * i.quantity, 0), 0)
    const successPct = stateOrders.length ? Math.round((stateDelivered.length / stateOrders.length) * 100) : 0
    const failPct = stateOrders.length ? Math.round((stateFailed.length / stateOrders.length) * 100) : 0
    const activeCustomers = new Set(stateOrders.map(o => o.customer_id).filter(Boolean)).size

    // Top product for this state
    const productCounts = {}
    stateOrders.forEach(o => (o.order_items || []).forEach(i => {
      const name = i.products?.name || 'Unknown'
      productCounts[name] = (productCounts[name] || 0) + i.quantity
    }))
    const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    // Avg delivery time — from logistics_requests: assigned_at (or created_at) to delivered_at
    const stateLR = logisticsRequests.filter(lr => lr.delivery_state === state && lr.delivered_at)
    const deliveryHours = stateLR.map(lr => {
      const start = new Date(lr.assigned_at || lr.created_at)
      const end = new Date(lr.delivered_at)
      return (end - start) / (1000 * 60 * 60)
    })
    const avgDeliveryHours = deliveryHours.length ? deliveryHours.reduce((a, b) => a + b, 0) / deliveryHours.length : null

    return {
      state, orders: stateOrders.length, revenue, grossProfit,
      successPct, failPct, activeCustomers, topProduct, avgDeliveryHours,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-6">
      <h1 className="page-title">Reports</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orders" value={orders.length} icon="◎" color="brand" />
        <StatCard label="Delivered" value={delivered.length} icon="▣" color="success" />
        <StatCard label="Failed" value={failed.length} icon="◆" color="danger" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon="◉" color={successRate >= 70 ? 'success' : 'warning'} />
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900 mb-4">Orders by Source</h2>
        <div className="space-y-2">
          {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
            <div key={src} className="flex items-center justify-between">
              <span className="text-sm text-ink-700 capitalize">{src}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(count / orders.length) * 100}%` }} />
                </div>
                <span className="text-sm font-semibold text-ink-900 w-6 text-right">{count}</span>
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-ink-400 text-center py-6">No orders yet.</p>}
        </div>
      </div>

      {/* ===== STATE INSIGHTS ===== */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-ink-900">State Insights</h2>
            <p className="text-xs text-ink-400 mt-0.5">Performance breakdown across your delivery states</p>
          </div>
          <span className="badge bg-brand-50 text-brand-700">{states.length} states</span>
        </div>

        {stateInsights.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-10">No state data yet — orders will appear here once created.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {stateInsights.map(s => (
              <div key={s.state}>
                <button onClick={() => setExpanded(expanded === s.state ? null : s.state)}
                  className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surface-50 transition-colors text-left">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 text-sm">{s.state}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{s.orders} orders · {s.activeCustomers} active customers</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-ink-900">{fmtNaira(s.revenue)}</p>
                      <p className={`text-xs font-medium ${s.successPct >= 70 ? 'text-green-600' : 'text-amber-600'}`}>{s.successPct}% success</p>
                    </div>
                    <span className="text-ink-300 text-sm">{expanded === s.state ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded === s.state && (
                  <div className="px-4 pb-4 bg-surface-50/60">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-ink-400">Gross Profit</p>
                        <p className="font-semibold text-ink-900 text-sm mt-0.5">{fmtNaira(s.grossProfit)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-ink-400">Failed Rate</p>
                        <p className="font-semibold text-red-600 text-sm mt-0.5">{s.failPct}%</p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-ink-400">Avg Delivery Time</p>
                        <p className="font-semibold text-ink-900 text-sm mt-0.5">{fmtHours(s.avgDeliveryHours)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-ink-400">Top Product</p>
                        <p className="font-semibold text-ink-900 text-sm mt-0.5 truncate">{s.topProduct}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-ink-400">Active Customers</p>
                        <p className="font-semibold text-ink-900 text-sm mt-0.5">{s.activeCustomers}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-ink-400">Total Orders</p>
                        <p className="font-semibold text-ink-900 text-sm mt-0.5">{s.orders}</p>
                      </div>
                    </div>

                    {/* Placeholder for future Royale-linked data — intentionally not faked */}
                    <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-amber-700">
                        🔜 <span className="font-medium">Coming soon:</span> assigned Royale agent(s), agent workload, and coverage gaps for {s.state} — once merchant and logistics analytics are linked.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}