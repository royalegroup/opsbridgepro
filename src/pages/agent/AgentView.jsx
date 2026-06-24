import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'
import { deductAgentStockOnDelivery } from '../../lib/stockHelpers'

export default function AgentView() {
  const { profile, signOut } = useAuth()
  const [agent, setAgent] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [stock, setStock] = useState([])
  const [tab, setTab] = useState('deliveries')

  useEffect(() => { if (profile?.id) load() }, [profile])

  async function load() {
    const [aRes, dRes, sRes] = await Promise.all([
      supabase.from('agents').select('*').eq('user_id', profile.id).single(),
      supabase.from('logistics_requests')
        .select('*, orders(*, customers(full_name, phone, address), order_items(product_id, quantity))')
        .eq('assigned_agent', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('agent_stock').select('*, products(name)').eq('agent_id', profile.id),
    ])
    if (aRes.data) setAgent(aRes.data)
    if (dRes.data) setDeliveries(dRes.data)
    if (sRes.data) setStock(sRes.data)
  }

  async function updateDelivery(id, status) {
    await supabase.from('logistics_requests')
      .update({ status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) })
      .eq('id', id)

    const req = deliveries.find(d => d.id === id)

    // Update parent order status
    const orderStatus = { out_for_delivery: 'in_transit', delivered: 'delivered', failed: 'failed' }[status]
    if (orderStatus && req?.order_id) {
      await supabase.from('orders').update({ status: orderStatus }).eq('id', req.order_id)
    }

    // Deduct stock when delivered
    if (status === 'delivered' && req?.order_id && agent?.id) {
      await deductAgentStockOnDelivery(req.order_id, agent.id)
    }

    load()
  }

  async function remitCOD(requestId, amount) {
    await supabase.from('cod_remittances').insert({
      logistics_request_id: requestId,
      agent_id: agent.id,
      logistics_id: agent.logistics_id,
      merchant_id: deliveries.find(d => d.id === requestId)?.merchant_id,
      amount,
      agent_remittance_status: 'remitted',
      agent_remitted_at: new Date().toISOString()
    })
    load()
  }

  const active = deliveries.filter(d => ['assigned', 'out_for_delivery'].includes(d.status))
  const completed = deliveries.filter(d => ['delivered', 'failed'].includes(d.status))
  const lowStock = stock.filter(s => s.quantity <= 5)

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-brand-700 text-white px-4 pt-10 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-300 text-xs font-medium uppercase tracking-wide">OpsBridge Pro</p>
            <h1 className="text-xl font-bold mt-0.5">{profile?.full_name}</h1>
            <p className="text-brand-300 text-sm">Delivery Agent</p>
          </div>
          <button onClick={signOut} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-lg">⏻</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{active.length}</p>
            <p className="text-brand-300 text-xs mt-0.5">Active</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{deliveries.filter(d => d.status === 'delivered').length}</p>
            <p className="text-brand-300 text-xs mt-0.5">Delivered</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-amber-300' : ''}`}>{stock.reduce((s, i) => s + i.quantity, 0)}</p>
            <p className="text-brand-300 text-xs mt-0.5">Stock</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-200 bg-white sticky top-0 z-10">
        {[['deliveries', 'Deliveries'], ['stock', 'My Stock']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'text-brand-600 border-b-2 border-brand-600' : 'text-ink-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-20">
        {tab === 'deliveries' && (
          <>
            {active.length > 0 && (
              <div>
                <p className="section-title mb-3">Active Deliveries</p>
                <div className="space-y-3">
                  {active.map(d => (
                    <div key={d.id} className="card">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-ink-900">{d.orders?.customers?.full_name}</p>
                          <p className="text-sm text-ink-500 mt-0.5">{d.orders?.customers?.phone}</p>
                          <p className="text-xs text-ink-400 mt-1">{d.orders?.customers?.address}</p>
                        </div>
                        <Badge status={d.status} />
                      </div>
                      <div className="flex gap-2 mt-4 flex-wrap">
                        {d.orders?.customers?.phone && (
                          <a href={`tel:${d.orders.customers.phone}`} className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium">📞 Call</a>
                        )}
                        {d.status === 'assigned' && (
                          <button onClick={() => updateDelivery(d.id, 'out_for_delivery')} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 font-medium">On My Way →</button>
                        )}
                        {d.status === 'out_for_delivery' && (
                          <>
                            <button onClick={() => updateDelivery(d.id, 'delivered')} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium">Delivered ✓</button>
                            <button onClick={() => updateDelivery(d.id, 'failed')} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium">Failed ✗</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <div>
                <p className="section-title mb-3">Completed</p>
                <div className="space-y-2">
                  {completed.slice(0, 10).map(d => (
                    <div key={d.id} className="card flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-ink-900">{d.orders?.customers?.full_name}</p>
                        <p className="text-xs text-ink-400">{new Date(d.created_at).toLocaleDateString('en-NG')}</p>
                      </div>
                      <Badge status={d.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deliveries.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">▣</p>
                <p className="text-ink-500 font-medium">No deliveries assigned yet</p>
              </div>
            )}
          </>
        )}

        {tab === 'stock' && (
          <div>
            {lowStock.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
                <p className="text-sm font-semibold text-amber-800">⚠ Low Stock — contact your manager</p>
                {lowStock.map(s => (
                  <p key={s.id} className="text-xs text-amber-700 mt-1">{s.products?.name}: {s.quantity} units remaining</p>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {stock.map(s => (
                <div key={s.id} className="card flex items-center justify-between">
                  <p className="font-medium text-ink-900 text-sm">{s.products?.name}</p>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${s.quantity <= 5 ? 'text-danger' : 'text-ink-900'}`}>{s.quantity}</p>
                    <p className="text-xs text-ink-400">units</p>
                  </div>
                </div>
              ))}
              {stock.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-4xl mb-3">⬡</p>
                  <p className="text-ink-500 font-medium">No stock assigned yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}