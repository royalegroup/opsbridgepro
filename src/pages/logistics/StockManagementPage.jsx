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
  const [merchants, setMerchants] = useState([])
  const [showDistribute, setShowDistribute] = useState(null)
  const [distForm, setDistForm] = useState({ agent_id: '', quantity: '' })
  const [saving, setSaving] = useState(false)
  const [distError, setDistError] = useState('')

  const [showPublish, setShowPublish] = useState(false)
  const [publishForm, setPublishForm] = useState({ merchant_id: '', report_month: new Date().toISOString().slice(0, 7), notes: '', includeAgentStock: true })
  const [publishError, setPublishError] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [dRes, asRes, aRes, rsRes, mRes] = await Promise.all([
      supabase.from('stock_dispatches').select('*, products(id, name), businesses!stock_dispatches_merchant_id_fkey(name)').eq('logistics_id', bid).order('dispatched_at', { ascending: false }),
      supabase.from('agent_stock').select('*, agents(users(full_name), states_covered), products(id, name)').eq('logistics_id', bid),
      supabase.from('agents').select('id, states_covered, users(full_name)').eq('logistics_id', bid).eq('is_active', true),
      supabase.from('royale_stock').select('*, products(id, name)').eq('logistics_id', bid),
      supabase.from('merchant_logistics_links').select('merchant_id, businesses!merchant_logistics_links_merchant_id_fkey(id, name)').eq('logistics_id', bid).eq('is_active', true),
    ])
    if (dRes.data) setDispatches(dRes.data)
    if (asRes.data) setAgentStock(asRes.data)
    if (aRes.data) setAgents(aRes.data)
    if (rsRes.data) setRoyaleStock(rsRes.data)
    if (mRes.data) setMerchants(mRes.data.map(m => ({ id: m.merchant_id, name: m.businesses?.name })))
  }

  async function confirmReceipt(dispatch) {
    const qty = dispatch.quantity_sent
    await supabase.from('stock_dispatches').update({ status: 'received', received_at: new Date().toISOString(), received_quantity: qty }).eq('id', dispatch.id)
    const existing = royaleStock.find(r => r.product_id === dispatch.products.id)
    if (existing) {
      await supabase.from('royale_stock').update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('royale_stock').insert({ logistics_id: profile.business_id, product_id: dispatch.products.id, quantity: qty })
    }
    load()
  }

  async function distributeToAgent() {
    if (!distForm.agent_id || !distForm.quantity || !showDistribute) return
    setDistError('')
    const dispatch = dispatches.find(d => d.id === showDistribute)
    const productId = dispatch?.products?.id
    const qty = +distForm.quantity
    const royaleBalance = royaleStock.find(r => r.product_id === productId)
    const available = royaleBalance?.quantity || 0

    if (qty > available) {
      setDistError(`Cannot dispatch ${qty} units — only ${available} units available in Royale stock.`)
      return
    }
    setSaving(true)
    await supabase.from('royale_stock').update({ quantity: available - qty, updated_at: new Date().toISOString() }).eq('id', royaleBalance.id)
    const existing = agentStock.find(s => s.agent_id === distForm.agent_id && s.product_id === productId)
    if (existing) {
      await supabase.from('agent_stock').update({ quantity: existing.quantity + qty }).eq('id', existing.id)
    } else {
      await supabase.from('agent_stock').insert({ agent_id: distForm.agent_id, product_id: productId, logistics_id: profile.business_id, quantity: qty })
    }
    setShowDistribute(null)
    setDistForm({ agent_id: '', quantity: '' })
    load()
    setSaving(false)
  }

  async function publishReport() {
    if (!publishForm.merchant_id || !publishForm.report_month) { setPublishError('Select a merchant and month.'); return }
    setSaving(true); setPublishError('')

    const { data: report, error } = await supabase.from('royale_stock_reports').insert({
      logistics_id: profile.business_id,
      merchant_id: publishForm.merchant_id,
      report_month: `${publishForm.report_month}-01`,
      notes: publishForm.notes || null,
      published_by: profile.id,
    }).select().single()

    if (error) { setPublishError(error.message); setSaving(false); return }

    // Snapshot current balances — Royale warehouse stock, optionally plus what's out with agents
    const productTotals = {}
    royaleStock.forEach(r => {
      productTotals[r.product_id] = (productTotals[r.product_id] || 0) + r.quantity
    })
    if (publishForm.includeAgentStock) {
      agentStock.forEach(s => {
        productTotals[s.product_id] = (productTotals[s.product_id] || 0) + s.quantity
      })
    }

    const items = Object.entries(productTotals).map(([product_id, quantity_on_hand]) => ({
      report_id: report.id, product_id, quantity_on_hand,
    }))

    if (items.length > 0) {
      await supabase.from('royale_stock_report_items').insert(items)
    }

    setShowPublish(false)
    setPublishForm({ merchant_id: '', report_month: new Date().toISOString().slice(0, 7), notes: '', includeAgentStock: true })
    setSaving(false)
  }

  const lowStock = agentStock.filter(s => s.quantity <= s.reorder_threshold)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Stock Management</h1>
        <button onClick={() => { setShowPublish(true); setPublishError('') }} className="btn-secondary text-sm">📋 Publish Monthly Report</button>
      </div>

      {royaleStock.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-ink-900 mb-4">Royale Stock Balance</h2>
          <div className="divide-y divide-surface-100">
            {royaleStock.map(s => (
              <div key={s.id} className="py-3 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-900">{s.products?.name}</p>
                <div className="text-right">
                  <p className={`font-bold text-lg ${s.quantity === 0 ? 'text-danger' : s.quantity <= 5 ? 'text-warning' : 'text-ink-900'}`}>{s.quantity} units</p>
                  <p className="text-xs text-ink-400">available</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="font-semibold text-amber-800 text-sm mb-2">⚠ Agent Low Stock Alerts ({lowStock.length})</p>
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
                    <button onClick={() => { setShowDistribute(d.id); setDistError('') }} className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">Distribute to Agent</button>
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

      {/* Distribute modal */}
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
            {distError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{distError}</div>}
            <div className="flex gap-3">
              <button onClick={() => { setShowDistribute(null); setDistError('') }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={distributeToAgent} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Distribute'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Report modal */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Publish Monthly Stock Report</h3>
            <p className="text-xs text-ink-400">Snapshots your current stock balance and shares it with the merchant for reconciliation.</p>
            <div><label className="label">Merchant</label>
              <select className="input" value={publishForm.merchant_id} onChange={e => setPublishForm(f => ({...f, merchant_id: e.target.value}))}>
                <option value="">Select merchant</option>
                {merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div><label className="label">Month</label><input type="month" className="input" value={publishForm.report_month} onChange={e => setPublishForm(f => ({...f, report_month: e.target.value}))} /></div>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={publishForm.includeAgentStock} onChange={e => setPublishForm(f => ({...f, includeAgentStock: e.target.checked}))} />
              Include stock currently held by agents
            </label>
            <div><label className="label">Notes <span className="text-ink-300 font-normal normal-case">(optional)</span></label><textarea className="input" rows={2} value={publishForm.notes} onChange={e => setPublishForm(f => ({...f, notes: e.target.value}))} /></div>
            {publishError && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{publishError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowPublish(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={publishReport} disabled={saving} className="btn-primary flex-1">{saving ? 'Publishing…' : 'Publish Report'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}