import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'
import { deductAgentStockOnDelivery } from '../../lib/stockHelpers'
import { createFollowUpTask } from '../../lib/taskHelpers'
import { createCODRecord } from '../../lib/codHelpers'

export default function AgentView() {
  const { profile, signOut } = useAuth()
  const [agent, setAgent] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [stock, setStock] = useState([])
  const [codRecords, setCodRecords] = useState([])
  const [tab, setTab] = useState('deliveries')
  const [delayModal, setDelayModal] = useState(null)
  const [delayReason, setDelayReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.id) load() }, [profile])

  async function load() {
    const [aRes, dRes, sRes, cRes] = await Promise.all([
      supabase.from('agents').select('*').eq('user_id', profile.id).single(),
      supabase.from('logistics_requests')
        .select('*, orders(*, customers(full_name, phone, address), order_items(product_id, quantity))')
        .eq('assigned_agent', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('agent_stock').select('*, products(name)').eq('agent_id', profile.id),
      supabase.from('cod_remittances')
        .select('*, logistics_requests(orders(customers(full_name)))')
        .eq('agent_id', profile.id)
        .order('created_at', { ascending: false }),
    ])
    if (aRes.data) setAgent(aRes.data)
    if (dRes.data) setDeliveries(dRes.data)
    if (sRes.data) setStock(sRes.data)
    if (cRes.data) setCodRecords(cRes.data)
  }

  async function updateDelivery(id, status) {
    await supabase.from('logistics_requests')
      .update({ status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) })
      .eq('id', id)

    const req = deliveries.find(d => d.id === id)

    const orderStatus = { out_for_delivery: 'in_transit', delivered: 'delivered', failed: 'failed' }[status]
    if (orderStatus && req?.order_id) {
      await supabase.from('orders').update({ status: orderStatus }).eq('id', req.order_id)
    }

    if (status === 'delivered' && req?.order_id && agent?.id) {
      await deductAgentStockOnDelivery(req.order_id, agent.id)

      // Auto-create COD record
      const { data: order } = await supabase
        .from('orders')
        .select('total_amount, merchant_id, assigned_cs_rep, customers(full_name)')
        .eq('id', req.order_id)
        .single()

      if (order && agent) {
        await createCODRecord(id, agent.id, agent.logistics_id, order.merchant_id, order.total_amount)
      }

      // Auto-create follow-up task
      const { data: fullOrder } = await supabase
        .from('orders')
        .select('*, customers(full_name, phone)')
        .eq('id', req.order_id)
        .single()
      if (fullOrder) {
        await createFollowUpTask(fullOrder, status, fullOrder.merchant_id)
      }
    }

    load()
  }

  async function submitBatchRemittance() {
    // Get all pending COD records for this agent
    const pending = codRecords.filter(c => c.agent_remittance_status === 'pending')
    if (pending.length === 0) return
    setSaving(true)

    const batchRef = `BATCH-${Date.now()}`
    const ids = pending.map(c => c.id)

    await supabase.from('cod_remittances')
      .update({
        agent_remittance_status: 'remitted',
        agent_remitted_at: new Date().toISOString(),
        batch_reference: batchRef,
      })
      .in('id', ids)

    load()
    setSaving(false)
  }

  async function submitDelayReason() {
    if (!delayReason || !delayModal) return
    await supabase.from('cod_remittances')
      .update({ agent_delay_reason: delayReason })
      .eq('id', delayModal.id)
    setDelayModal(null)
    setDelayReason('')
    load()
  }

  const active = deliveries.filter(d => ['assigned', 'out_for_delivery'].includes(d.status))
  const completed = deliveries.filter(d => ['delivered', 'failed'].includes(d.status))
  const lowStock = stock.filter(s => s.quantity <= 5)
  const pendingCOD = codRecords.filter(c => c.agent_remittance_status === 'pending')
  const overdueCOD = pendingCOD.filter(c => c.due_at && new Date(c.due_at) < new Date())
  const totalPending = pendingCOD.reduce((s, c) => s + +c.amount, 0)

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
            <p className={`text-2xl font-bold ${overdueCOD.length > 0 ? 'text-amber-300' : ''}`}>
              ₦{(totalPending/1000).toFixed(0)}k
            </p>
            <p className="text-brand-300 text-xs mt-0.5">Pending COD</p>
          </div>
        </div>
      </div>

      {/* Overdue COD alert */}
      {overdueCOD.length > 0 && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-700">⚠ {overdueCOD.length} overdue COD remittance{overdueCOD.length > 1 ? 's' : ''}!</p>
          <p className="text-xs text-red-600 mt-1">You have unremitted funds past the 24-hour deadline. Please remit immediately or provide a reason for the delay.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-surface-200 bg-white sticky top-0 z-10 mt-4">
        {[['deliveries', 'Deliveries'], ['cod', `COD${pendingCOD.length > 0 ? ` (${pendingCOD.length})` : ''}`], ['stock', 'Stock']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'text-brand-600 border-b-2 border-brand-600' : 'text-ink-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-20">

        {/* DELIVERIES TAB */}
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

        {/* COD TAB */}
        {tab === 'cod' && (
          <div className="space-y-4">
            {pendingCOD.length > 0 && (
              <div className="card bg-brand-50 border-brand-100">
                <p className="text-sm font-semibold text-brand-800">Total Pending: ₦{totalPending.toLocaleString()}</p>
                <p className="text-xs text-brand-600 mt-1">{pendingCOD.length} unremitted collection{pendingCOD.length > 1 ? 's' : ''}</p>
                <button
                  onClick={submitBatchRemittance}
                  disabled={saving}
                  className="btn-primary w-full mt-3 text-sm">
                  {saving ? 'Processing…' : `Remit All to Manager (₦${totalPending.toLocaleString()})`}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {codRecords.map(c => {
                const isOverdue = c.due_at && new Date(c.due_at) < new Date() && c.agent_remittance_status === 'pending'
                return (
                  <div key={c.id} className={`card border ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-surface-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink-900">₦{Number(c.amount).toLocaleString()}</p>
                        <p className="text-xs text-ink-400 mt-0.5">
                          {c.logistics_requests?.orders?.customers?.full_name}
                        </p>
                        <p className="text-xs text-ink-400">
                          {new Date(c.created_at).toLocaleDateString('en-NG')}
                        </p>
                        {c.due_at && c.agent_remittance_status === 'pending' && (
                          <p className={`text-xs mt-1 font-medium ${isOverdue ? 'text-danger' : 'text-ink-400'}`}>
                            {isOverdue ? '⚠ OVERDUE' : `Due: ${new Date(c.due_at).toLocaleString('en-NG')}`}
                          </p>
                        )}
                        {c.batch_reference && (
                          <p className="text-xs text-brand-600 mt-1">Batch: {c.batch_reference}</p>
                        )}
                        {c.agent_delay_reason && (
                          <p className="text-xs text-amber-600 mt-1">Reason: {c.agent_delay_reason}</p>
                        )}
                      </div>
                      <div className="text-right space-y-1 flex-shrink-0">
                        <Badge status={c.agent_remittance_status} />
                      </div>
                    </div>
                    {isOverdue && !c.agent_delay_reason && (
                      <button
                        onClick={() => setDelayModal(c)}
                        className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-medium hover:bg-amber-100 w-full">
                        Provide Delay Reason
                      </button>
                    )}
                  </div>
                )
              })}
              {codRecords.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-4xl mb-3">◆</p>
                  <p className="text-ink-500 font-medium">No COD records yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STOCK TAB */}
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

      {/* Delay reason modal */}
      {delayModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Reason for Delay</h3>
            <p className="text-sm text-ink-500">
              ₦{Number(delayModal.amount).toLocaleString()} — Why has this not been remitted within 24 hours?
            </p>
            <textarea
              className="input"
              rows={3}
              value={delayReason}
              onChange={e => setDelayReason(e.target.value)}
              placeholder="Explain the reason for the delay…"
            />
            <div className="flex gap-3">
              <button onClick={() => setDelayModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitDelayReason} disabled={!delayReason} className="btn-primary flex-1">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}