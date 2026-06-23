import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'

export default function StockManagementPage() {
  const { profile } = useAuth()
  const [dispatches, setDispatches] = useState([])
  const [agentStock, setAgentStock] = useState([])
  const [agents, setAgents] = useState([])
  const [showDistribute, setShowDistribute] = useState(null)
  const [distForm, setDistForm] = useState({ agent_id: '', quantity: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [dRes, asRes, aRes] = await Promise.all([
      supabase.from('stock_dispatches').select('*, products(id, name), businesses!stock_dispatches_merchant_id_fkey(name)').eq('logistics_id', bid).order('dispatched_at', { ascending: false }),
      supabase.from('agent_stock').select('*, agents(users(full_name), states_covered), products(name)').eq('logistics_id', bid),
      supabase.from('agents').select('id, states_covered, users(full_name)').eq('logistics_id', bid).eq('is_active', true),
    ])
    if (dRes.data) setDispatches(dRes.data)
    if (asRes.data) setAgentStock(asRes.data)
    if (aRes.data) setAgents(aRes.data)
  }

  async function confirmReceipt(dispatch) {
    await supabase.from('stock_dispatches').update({ status: 'received', received_at: new Date().toISOString(), received_quantity: dispatch.quantity_sent }).eq('id', dispatch.id)
    load()
  }

  async function distributeToAgent() {
    if (!distForm.agent_id || !distForm.quantity || !showDistribute) return
    setSaving(true)
    const dispatch = dispatches.find(d => d.id === showDistribute)
    const existing = agentStock.find(s => s.agent_id === distForm.agent_id && s.product_id === dispatch.products.id)
    if (existing) {
      await supabase.from('agent_stock').update({ quantity: existing.quantity + +distForm.quantity }).eq('id', existing.id)
    } else {
      await supabase.from('agent_stock').insert({ agent_id: distForm.agent_id, product_id: dispatch.products.id, logistics_id: profile.business_id, quantity: +distForm.quantity })
    }
    setShowDistribute(null)
    setDistForm({ agent_id: '', quantity: '' })
    load()
    setSaving(false)
  }

  const lowStock = agentStock.filter(s => s.quantity <= s.reorder_threshold)

  return (
    <div className="space-y-6">
      <h1 className="page-title">Stock Management</h1>

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="font-semibold text-amber-800 text-sm mb-2">⚠ Low Stock Alerts ({lowStock.length})</p>
          {lowStock.map(s => (
            <p key={s.id} className="text-xs text-amber-700">{s.agents?.users?.full_name} — {s.products?.name}: <span className="font-bold">{s.quantity} units</span> remaining</p>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-ink-900 mb-4">Incoming Stock from Merchants</h2>
        {dispatches.length === 0 ? (
          <p className="text-ink-400 text-sm text-center py-8">No stock dispatches received yet.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {dispatches.map(d => (
              <div key={d.id} className="py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900 text-sm">{d.products?.name}</p>
                  <p className="text-xs text-ink-400">From: {d.businesses?.name} · {d.quantity_sent} units · {new Date(d.dispatched_at).toLocaleDateString('en-NG')}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge status={d.status} />
                  {d.status === 'dispatched' && (
                    <button onClick={() => confirmReceipt(d)} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">Confirm Receipt</button>
                  )}
                  {d.status === 'received' && (
                    <button onClick={() => setShowDistribute(d.id)} className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">Distribute to Agent</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-900 mb-4">Agent Stock Levels</h2>
        {agentStock.length === 0 ? (
          <p className="text-ink-400 text-sm text-center py-8">No stock distributed to agents yet.</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {agentStock.map(s => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{s.agents?.users?.full_name}</p>
                  <p className="text-xs text-ink-400">{s.products?.name} · {s.agents?.states_covered?.join(', ')}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${s.quantity <= s.reorder_threshold ? 'text-danger' : 'text-ink-900'}`}>{s.quantity} units</p>
                  {s.quantity <= s.reorder_threshold && <p className="text-xs text-danger">Low stock!</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDistribute && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Distribute Stock to Agent</h3>
            <div><label className="label">Agent</label>
              <select className="input" value={distForm.agent_id} onChange={e => setDistForm(f => ({...f, agent_id: e.target.value}))}>
                <option value="">Select agent</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.users?.full_name} ({a.states_covered?.join(', ')})</option>)}
              </select>
            </div>
            <div><label className="label">Quantity</label><input type="number" className="input" value={distForm.quantity} onChange={e => setDistForm(f => ({...f, quantity: e.target.value}))} /></div>
            <div className="flex gap-3">
              <button onClick={() => setShowDistribute(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={distributeToAgent} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Distribute'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
