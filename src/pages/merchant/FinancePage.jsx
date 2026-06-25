import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'

export default function FinancePage() {
  const { profile } = useAuth()
  const [remittances, setRemittances] = useState([])
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [rRes, oRes] = await Promise.all([
      supabase.from('cod_remittances')
        .select('*, businesses!cod_remittances_logistics_id_fkey(name), agents(users(full_name)), logistics_requests(orders(customers(full_name)))')
        .eq('merchant_id', bid)
        .order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('*, order_items(unit_cost_price, unit_selling_price, quantity)')
        .eq('merchant_id', bid)
        .eq('status', 'delivered'),
    ])
    if (rRes.data) setRemittances(rRes.data)
    if (oRes.data) setOrders(oRes.data)
  }

  async function alertLogistics(remittance) {
    await supabase.from('cod_remittances')
      .update({ overdue_alert_sent: true })
      .eq('id', remittance.id)
    load()
  }

  const isOverdue = r => r.due_at && new Date(r.due_at) < new Date() && r.merchant_settlement_status === 'pending'

  const totalRevenue = orders.reduce((s, o) => s + +o.total_amount, 0)
  const totalCost = orders.reduce((s, o) => s + (o.order_items || []).reduce((si, i) => si + (+i.unit_cost_price * i.quantity), 0), 0)
  const totalProfit = totalRevenue - totalCost
  const pendingCOD = remittances.filter(r => r.merchant_settlement_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const settledCOD = remittances.filter(r => r.merchant_settlement_status === 'settled').reduce((s, r) => s + +r.amount, 0)
  const overdueCount = remittances.filter(r => isOverdue(r)).length

  const FILTERS = ['all', 'pending', 'settled', 'overdue']
  const filtered = filter === 'overdue'
    ? remittances.filter(r => isOverdue(r))
    : filter === 'all'
    ? remittances
    : remittances.filter(r => r.merchant_settlement_status === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Finance</h1>
        {overdueCount > 0 && (
          <p className="text-danger text-sm mt-0.5 font-medium">⚠ {overdueCount} overdue COD — funds not yet remitted</p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={`₦${totalRevenue.toLocaleString()}`} icon="◆" color="brand" />
        <StatCard label="Net Profit" value={`₦${totalProfit.toLocaleString()}`} icon="▣" color={totalProfit >= 0 ? 'success' : 'danger'} />
        <StatCard label="Pending COD" value={`₦${pendingCOD.toLocaleString()}`} icon="◎" color="warning" />
        <StatCard label="Settled COD" value={`₦${settledCOD.toLocaleString()}`} icon="◉" color="cod" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {f === 'overdue' ? '⚠ Overdue' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 opacity-70">
              {f === 'all' ? remittances.length
                : f === 'overdue' ? overdueCount
                : remittances.filter(r => r.merchant_settlement_status === f).length}
            </span>
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100">
          <h2 className="font-semibold text-ink-900">COD Remittances</h2>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">◆</p>
            <p className="text-ink-500 font-medium">No remittances yet</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(r => (
              <div key={r.id} className={`p-4 space-y-2 ${isOverdue(r) ? 'bg-red-50/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">₦{Number(r.amount).toLocaleString()}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      Via: <span className="font-medium text-ink-600">{r.businesses?.name}</span>
                    </p>
                    <p className="text-xs text-ink-400">
                      Customer: {r.logistics_requests?.orders?.customers?.full_name}
                    </p>
                    <p className="text-xs text-ink-400">{new Date(r.created_at).toLocaleDateString('en-NG')}</p>

                    {isOverdue(r) && (
                      <p className="text-xs text-danger font-medium mt-1">⚠ OVERDUE — funds not remitted</p>
                    )}
                    {r.agent_delay_reason && (
                      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <p className="text-xs font-semibold text-amber-700">Delay Reason from Agent:</p>
                        <p className="text-xs text-amber-600">{r.agent_delay_reason}</p>
                      </div>
                    )}
                    {r.royale_batch_reference && (
                      <p className="text-xs text-green-600 mt-1">Ref: {r.royale_batch_reference}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <Badge status={r.merchant_settlement_status} />
                  </div>
                </div>

                {isOverdue(r) && !r.overdue_alert_sent && (
                  <button onClick={() => alertLogistics(r)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 w-full">
                    Alert Royale Logistics ⚠
                  </button>
                )}
                {r.overdue_alert_sent && r.merchant_settlement_status === 'pending' && (
                  <p className="text-xs text-amber-600 font-medium">Alert sent to logistics</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}