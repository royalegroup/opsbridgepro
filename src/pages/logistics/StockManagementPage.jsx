import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'

export default function StockManagementPage() {
  const { profile } = useAuth()
  const [dispatches, setDispatches] = useState([])
  const [agentStock, setAgentStock] = useState([])
  const [royaleStock, setRoyaleStock] = useState([])
  const [agents, setAgents] = useState([])
  const [showDistribute, setShowDistribute] = useState(null)
  const [distForm, setDistForm] = useState({ agent_id: '', quantity: '' })
  const [saving, setSaving] = useState(false)
  const [distError, setDistError] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [dRes, asRes, aRes, rsRes] = await Promise.all([
      supabase.from('stock_dispatches')
        .select('*, products(id, name), businesses!stock_dispatches_merchant_id_fkey(name)')
        .eq('logistics_id', bid)
        .order('dispatched_at', { ascending: false }),
      supabase.from('agent_stock')
        .select('*, agents(users(full_name), states_covered), products(name)')
        .eq('logistics_id', bid),
      supabase.from('agents')
        .select('id, states_covered, users(full_name)')
        .eq('logistics_id', bid)
        .eq('is_active', true),
      supabase.from('royale_stock')
        .select('*, products(name)')
        .eq('logistics_id', bid),
    ])
    if (dRes.data) setDispatches(dRes.data)
    if (asRes.data) setAgentStock(asRes.data)
    if (aRes.data) setAgents(aRes.data)
    if (rsRes.data) setRoyaleStock(rsRes.data)
  }

  async function confirmReceipt(dispatch) {
    const qty = dispatch.quantity_sent

    // Update dispatch status
    await supabase.from('stock_dispatches').update({
      status: 'received',
      received_at: new Date().toISOString(),
      received_quantity: qty
    }).eq('id', dispatch.id)

    // Add to Royale stock balance
    const existing = royaleStock.find(r => r.product_id === dispatch.products.id)
    if (existing) {
      await supabase.from('royale_stock')
        .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('royale_stock').insert({
        logistics_id: profile.business_id,
        product_id: dispatch.products.id,
        quantity: qty
      })
    }

    load()
  }

  async function distributeToAgent() {
    if (!distForm.agent_id || !distForm.quantity || !showDistribute) return
    setDistError('')

    const dispatch = dispatches.find(d => d.id === showDistribute)
    const productId = dispatch?.products?.id
    const qty = +distForm.quantity

    // Check Royale stock balance
    const royaleBalance = royaleStock.find(r => r.product_id === productId)
    const available = royaleBalance?.quantity || 0

    if (qty > available) {
      setDistError(`Cannot dispatch ${qty} units — only ${available} units available in Royale stock.`)
      return
    }

    setSaving(true)

    // Deduct from Royale stock
    await supabase.from('royale_stock')
      .update({ quantity: available - qty, updated_at: new Date().toISOString() })
      .eq('id', royaleBalance.id)

    // Add to agent stock
    const existing = agentStock.find(s => s.agent_id === distForm.agent_id && s.product_id === productId)
    if (existing) {
      await supabase.from('agent_stock')
        .update({ quantity: existing.quantity + qty })
        .eq('id', existing.id)
    } else {
      await supabase.from('agent_stock').insert({
        agent_id: distForm.agent_id,
        product_id: productId,
        logistics_id: profile.business_id,
        quantity: qty
      })
    }

    setShowDistribute(null)
    setDistForm({ agent_id: '', quantity: '' })
    load()
    setSaving(false)
  }

  const lowStock = agentStock.filter(s => s.quantity <= s.reorder_threshold)
  const selectedDispatch = dispatches.find(d => d.id === showDistribute)
  const selectedProductBalance = royaleStock.find(r => r.product_id === selectedDispatch?.products?.id)

  return (
    <div className="space-y-6">
      <h1 className="page-title">Stock Management</h1>

      {/* Royale stock balance */}
      {royaleStock.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-ink-900 mb-4">Royale Stock Balance</h2>
          <div className="divide-y divide-surface-100">
            {royaleStock.map(s => (
              <div key={s.id} className="py-3 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-900">{s.products?.name}</p>
                <div className="text-right">
                  <p className={`font-bold text-lg ${s.quantity === 0 ? 'text-danger' : s.quantity <= 5 ? 'text-warning' : 'text-ink-900'}`}>
                    {s.quantity} units
                  </p>
                  <p className="text-xs text-ink-400">available</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="font-semibold text-amber-800 text-sm mb-2">⚠ Agent Low Stock Alerts ({lowStock.length})</p>
          {lowStock.map(s => (
            <p key={s.id} className="text-xs text-amber-700">
              {s.agents?.users?.full_name} — {s.products?.name}: <span className="font-bold">{s.quantity} units</span> remaining
            </p>
          ))}
        </div>
      )}

      {/* Incoming stock */}
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
                  <p className="text-xs text-ink-400">
                    From: {d.businesses?.name} · {d.quantity_sent} units · {new Date(d.dispatched_at).toLocaleDateString('en-NG')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge status={d.status} />
                  {d.status === 'dispatched' && (
                    <button onClick={() => confirmReceipt(d)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">
                      Confirm Receipt
                    </button>
                  )}
                  {d.status === 'received' && (
                    <button onClick={() => { setShowDistribute(d.id); setDistError('') }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">
                      Distribute to Agent
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent stock levels */}
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
                  <p className={`font-bold text-sm ${s.quantity <= s.reorder_threshold ? 'text-danger' : 'text-ink-900'}`}>
                    {s.quantity} units
                  </p>
                  {s.quantity <= s.reorder_threshold && <p className="text-xs text-danger">Low stock!</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribute modal */}
      {showDistribute && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Distribute Stock to Agent</h3>

            {/* Available balance warning */}
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              (selectedProductBalance?.quantity || 0) === 0
                ? 'bg-red-50 text-red-700'
                : 'bg-brand-50 text-brand-700'
            }`}>
              Available in Royale: <span className="font-bold">{selectedProductBalance?.quantity || 0} units</span> of {selectedDispatch?.products?.name}
            </div>

            <div>
              <label className="label">Agent</label>
              <select className="input" value={distForm.agent_id} onChange={e => setDistForm(f => ({...f, agent_id: e.target.value}))}>
                <option value="">Select agent</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.users?.full_name} ({a.states_covered?.join(', ')})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Quantity</label>
              <input
                type="number"
                className="input"
                value={distForm.quantity}
                max={selectedProductBalance?.quantity || 0}
                onChange={e => { setDistForm(f => ({...f, quantity: e.target.value})); setDistError('') }}
              />
            </div>

            {distError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {distError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowDistribute(null); setDistError('') }} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={distributeToAgent}
                disabled={saving || (selectedProductBalance?.quantity || 0) === 0}
                className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Distribute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}