import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'

export default function RequestsPage() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [agents, setAgents] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [rRes, aRes] = await Promise.all([
      supabase.from('logistics_requests').select('*, businesses!logistics_requests_merchant_id_fkey(name), agents(users(full_name)), orders(delivery_state, customers(full_name, phone, address))').eq('logistics_id', bid).order('created_at', { ascending: false }),
      supabase.from('agents').select('id, states_covered, users(full_name)').eq('logistics_id', bid).eq('is_active', true),
    ])
    if (rRes.data) setRequests(rRes.data)
    if (aRes.data) setAgents(aRes.data)
  }

  async function assignAgent(requestId, agentId) {
    await supabase.from('logistics_requests').update({ assigned_agent: agentId, status: 'assigned', assigned_at: new Date().toISOString() }).eq('id', requestId)
    load()
  }

  async function updateStatus(requestId, status, reason = null) {
    const update = { status }
    if (reason) update.failure_reason = reason
    if (status === 'delivered') update.delivered_at = new Date().toISOString()
    await supabase.from('logistics_requests').update(update).eq('id', requestId)
    // Update parent order
    const orderStatus = { out_for_delivery: 'in_transit', delivered: 'delivered', failed: 'failed' }[status]
    if (orderStatus) {
      const req = requests.find(r => r.id === requestId)
      if (req?.order_id) await supabase.from('orders').update({ status: orderStatus }).eq('id', req.order_id)
    }
    load()
  }

  const STATUSES = ['all', 'pending', 'assigned', 'out_for_delivery', 'delivered', 'failed']
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Logistics Requests</h1>
          <p className="text-ink-400 text-sm mt-0.5">{requests.filter(r => r.status === 'pending').length} pending assignment</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            {s !== 'all' && <span className="ml-1.5 opacity-70">{requests.filter(r => r.status === s).length}</span>}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center"><p className="text-3xl mb-2">◎</p><p className="text-ink-500 font-medium">No requests found</p></div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(r => (
              <div key={r.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900 text-sm">{r.orders?.customers?.full_name || '—'}</p>
                      <Badge status={r.status} />
                    </div>
                    <p className="text-xs text-ink-400 mt-1">{r.orders?.delivery_state} · {r.orders?.customers?.phone}</p>
                    <p className="text-xs text-ink-400">{r.orders?.customers?.address}</p>
                    <p className="text-xs text-brand-600 mt-1">From: {r.businesses?.name}</p>
                  </div>
                  <p className="text-xs text-ink-400 flex-shrink-0">{new Date(r.created_at).toLocaleDateString('en-NG')}</p>
                </div>

                {r.agents && <p className="text-xs text-ink-500">Agent: <span className="font-medium">{r.agents?.users?.full_name}</span></p>}

                {r.status === 'pending' && (
                  <div className="flex gap-2 flex-wrap">
                    <select onChange={e => assignAgent(r.id, e.target.value)} defaultValue=""
                      className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white text-ink-700 flex-1 min-w-0">
                      <option value="" disabled>Assign agent for {r.orders?.delivery_state}</option>
                      {agents.filter(a => !r.orders?.delivery_state || a.states_covered?.includes(r.orders.delivery_state)).map(a => (
                        <option key={a.id} value={a.id}>{a.users?.full_name} ({a.states_covered?.join(', ')})</option>
                      ))}
                    </select>
                  </div>
                )}
                {r.status === 'assigned' && (
                  <button onClick={() => updateStatus(r.id, 'out_for_delivery')} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 font-medium hover:bg-cyan-100">Mark Out for Delivery</button>
                )}
                {r.status === 'out_for_delivery' && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(r.id, 'delivered')} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">Mark Delivered ✓</button>
                    <button onClick={() => updateStatus(r.id, 'failed', 'Customer unavailable')} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100">Mark Failed ✗</button>
                  </div>
                )}
                {r.failure_reason && <p className="text-xs text-red-500">Reason: {r.failure_reason}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
