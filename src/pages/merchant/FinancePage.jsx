import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'

export default function FinancePage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [remittances, setRemittances] = useState([])

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [oRes, rRes] = await Promise.all([
      supabase.from('orders').select('*, order_items(*, products(name, cost_price))').eq('merchant_id', bid).eq('status', 'delivered'),
      supabase.from('cod_remittances').select('*, logistics_requests(delivery_state)').eq('merchant_id', bid).order('created_at', { ascending: false }),
    ])
    if (oRes.data) setOrders(oRes.data)
    if (rRes.data) setRemittances(rRes.data)
  }

  const totalRevenue = orders.reduce((s, o) => s + +o.total_amount, 0)
  const totalDelivery = orders.reduce((s, o) => s + +o.total_delivery_fee, 0)
  const totalCost = orders.reduce((s, o) => s + o.order_items?.reduce((si, i) => si + (+i.unit_cost_price * i.quantity), 0), 0)
  const totalProfit = totalRevenue - totalCost - totalDelivery
  const pendingCOD = remittances.filter(r => r.merchant_settlement_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const settledCOD = remittances.filter(r => r.merchant_settlement_status === 'settled').reduce((s, r) => s + +r.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Finance</h1>
        <p className="text-ink-400 text-sm mt-0.5">Revenue, costs, and COD settlements</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={`₦${totalRevenue.toLocaleString()}`} icon="◆" color="brand" />
        <StatCard label="Net Profit" value={`₦${totalProfit.toLocaleString()}`} icon="▣" color={totalProfit >= 0 ? 'success' : 'danger'} />
        <StatCard label="Pending COD" value={`₦${pendingCOD.toLocaleString()}`} icon="◎" color="warning" />
        <StatCard label="Settled COD" value={`₦${settledCOD.toLocaleString()}`} icon="◉" color="cod" />
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900 mb-4">COD Remittances</h2>
        {remittances.length === 0 ? (
          <p className="text-ink-400 text-sm text-center py-8">No remittances recorded yet.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {remittances.map(r => (
              <div key={r.id} className="flex items-center justify-between py-3 gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">₦{Number(r.amount).toLocaleString()}</p>
                  <p className="text-xs text-ink-400">{r.logistics_requests?.delivery_state} · {new Date(r.created_at).toLocaleDateString('en-NG')}</p>
                </div>
                <Badge status={r.merchant_settlement_status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
