import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'
import { recordStockIn, deductMerchantStockOnDispatch } from '../../lib/merchantStockHelpers'

export default function StockPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('inventory')
  const [merchantStock, setMerchantStock] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [reports, setReports] = useState([])
  const [products, setProducts] = useState([])
  const [logistics, setLogistics] = useState([])
  const [loading, setLoading] = useState(true)

  const [showStockIn, setShowStockIn] = useState(false)
  const [stockInForm, setStockInForm] = useState({ product_id: '', quantity: '', source: 'supplier', reference: '', notes: '' })

  const [showDispatch, setShowDispatch] = useState(false)
  const [dispatchForm, setDispatchForm] = useState({ product_id: '', logistics_id: '', quantity_sent: '', dispatch_reference: '', notes: '' })
  const [dispatchError, setDispatchError] = useState('')

  const [expandedReport, setExpandedReport] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [msRes, dRes, rRes, pRes, lRes] = await Promise.all([
      supabase.from('merchant_stock').select('*, products(name)').eq('merchant_id', bid),
      supabase.from('stock_dispatches').select('*, products(id, name), businesses!stock_dispatches_logistics_id_fkey(name)').eq('merchant_id', bid).order('dispatched_at', { ascending: false }),
      supabase.from('royale_stock_reports').select('*, businesses!royale_stock_reports_logistics_id_fkey(name), royale_stock_report_items(quantity_on_hand, products(name))').eq('merchant_id', bid).order('report_month', { ascending: false }),
      supabase.from('products').select('id, name').eq('merchant_id', bid).eq('is_active', true),
      supabase.from('merchant_logistics_links').select('logistics_id, businesses!merchant_logistics_links_logistics_id_fkey(id, name)').eq('merchant_id', bid).eq('is_active', true),
    ])
    if (msRes.data) setMerchantStock(msRes.data)
    if (dRes.data) setDispatches(dRes.data)
    if (rRes.data) setReports(rRes.data)
    if (pRes.data) setProducts(pRes.data)
    if (lRes.data) setLogistics(lRes.data.map(l => ({ id: l.logistics_id, name: l.businesses?.name })))
    setLoading(false)
  }

  async function saveStockIn() {
    if (!stockInForm.product_id || !stockInForm.quantity) return
    setSaving(true)
    await recordStockIn({
      merchantId: profile.business_id,
      productId: stockInForm.product_id,
      quantity: +stockInForm.quantity,
      source: stockInForm.source,
      reference: stockInForm.reference,
      notes: stockInForm.notes,
      recordedBy: profile.id,
    })
    setShowStockIn(false)
    setStockInForm({ product_id: '', quantity: '', source: 'supplier', reference: '', notes: '' })
    load()
    setSaving(false)
  }

  async function saveDispatch() {
    if (!dispatchForm.product_id || !dispatchForm.logistics_id || !dispatchForm.quantity_sent) return
    setDispatchError('')
    setSaving(true)

    const qty = +dispatchForm.quantity_sent
    const result = await deductMerchantStockOnDispatch(profile.business_id, dispatchForm.product_id, qty)

    if (!result.ok) {
      setDispatchError(`Cannot dispatch ${qty} units — only ${result.available} units on hand. Record stock in first.`)
      setSaving(false)
      return
    }

    await supabase.from('stock_dispatches').insert({
      merchant_id: profile.business_id,
      logistics_id: dispatchForm.logistics_id,
      product_id: dispatchForm.product_id,
      quantity_sent: qty,
      dispatch_reference: dispatchForm.dispatch_reference,
      notes: dispatchForm.notes,
    })

    setShowDispatch(false)
    setDispatchForm({ product_id: '', logistics_id: '', quantity_sent: '', dispatch_reference: '', notes: '' })
    load()
    setSaving(false)
  }

  // Reconciliation: On Hand vs Total Sent vs Royale Confirmed Receipt, per product
  const reconciliation = products.map(p => {
    const onHand = merchantStock.find(s => s.product_id === p.id)?.quantity || 0
    const sent = dispatches.filter(d => d.products?.id === p.id).reduce((s, d) => s + d.quantity_sent, 0)
    const confirmed = dispatches.filter(d => d.products?.id === p.id && d.status !== 'dispatched').reduce((s, d) => s + (d.received_quantity || 0), 0)
    return { product: p.name, onHand, sent, confirmed, mismatch: sent !== confirmed && dispatches.some(d => d.products?.id === p.id && d.status !== 'dispatched') }
  }).filter(r => r.onHand > 0 || r.sent > 0)

  const lowStock = merchantStock.filter(s => s.quantity <= s.reorder_threshold)

  return (
    <div className="space-y-5">
      <h1 className="page-title">Stock</h1>

      <div className="flex border-b border-surface-200">
        {[['inventory', 'Inventory'], ['dispatches', 'Dispatches'], ['royale_reports', 'Royale Reports']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${tab === key ? 'text-brand-600 border-brand-600' : 'text-ink-400 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card h-40 animate-pulse bg-surface-100" />
      ) : tab === 'inventory' ? (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={() => setShowStockIn(true)} className="btn-primary">+ Record Stock In</button>
          </div>

          {lowStock.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">⚠ Low Stock</p>
              {lowStock.map(s => (
                <p key={s.id} className="text-xs text-amber-700">{s.products?.name}: {s.quantity} units remaining</p>
              ))}
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold text-ink-900 mb-4">On-Hand Inventory</h2>
            {merchantStock.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-8">No stock recorded yet. Record your first stock-in above.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {merchantStock.map(s => (
                  <div key={s.id} className="py-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-900">{s.products?.name}</p>
                    <p className={`font-bold text-lg ${s.quantity <= s.reorder_threshold ? 'text-danger' : 'text-ink-900'}`}>{s.quantity} <span className="text-xs text-ink-400 font-normal">units</span></p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {reconciliation.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-ink-900 mb-1">Reconciliation</h2>
              <p className="text-xs text-ink-400 mb-4">Compares what you hold vs what you've sent vs what Royale confirmed receiving</p>
              <div className="space-y-3">
                {reconciliation.map(r => (
                  <div key={r.product} className={`p-3 rounded-xl ${r.mismatch ? 'bg-red-50 border border-red-100' : 'bg-surface-50'}`}>
                    <p className="text-sm font-medium text-ink-900 mb-1.5">{r.product}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-xs text-ink-400">On Hand</p><p className="font-semibold text-ink-900 text-sm">{r.onHand}</p></div>
                      <div><p className="text-xs text-ink-400">Sent</p><p className="font-semibold text-ink-900 text-sm">{r.sent}</p></div>
                      <div><p className="text-xs text-ink-400">Royale Confirmed</p><p className={`font-semibold text-sm ${r.mismatch ? 'text-danger' : 'text-ink-900'}`}>{r.confirmed}</p></div>
                    </div>
                    {r.mismatch && <p className="text-xs text-danger mt-1.5 text-center">⚠ Mismatch — sent and confirmed quantities differ</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tab === 'dispatches' ? (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={() => { setShowDispatch(true); setDispatchError('') }} className="btn-primary">+ Dispatch Stock</button>
          </div>
          <div className="card p-0 overflow-hidden">
            {dispatches.length === 0 ? (
              <div className="p-12 text-center"><p className="text-3xl mb-2">⬡</p><p className="text-ink-500 font-medium">No dispatches yet</p></div>
            ) : (
              <div className="divide-y divide-surface-100">
                {dispatches.map(d => (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink-900 text-sm">{d.products?.name}</p>
                      <p className="text-xs text-ink-400 mt-0.5">To: {d.businesses?.name} · {new Date(d.dispatched_at).toLocaleDateString('en-NG')}</p>
                      {d.dispatch_reference && <p className="text-xs text-brand-600 mt-0.5">Ref: {d.dispatch_reference}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-ink-900">{d.quantity_sent} units</p>
                      {d.received_quantity != null && <p className="text-xs text-green-600">Received: {d.received_quantity}</p>}
                      <div className="mt-1"><Badge status={d.status} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        // ROYALE REPORTS TAB
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-ink-500 font-medium">No stock reports published yet</p>
              <p className="text-sm text-ink-400 mt-1">Royale Logistics will publish monthly stock reports here for reconciliation.</p>
            </div>
          ) : reports.map(r => (
            <div key={r.id} className="card p-0 overflow-hidden">
              <button onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-50 text-left">
                <div>
                  <p className="font-semibold text-ink-900 text-sm">
                    {new Date(r.report_month).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">Published by {r.businesses?.name} · {new Date(r.published_at).toLocaleDateString('en-NG')}</p>
                </div>
                <span className="text-ink-300">{expandedReport === r.id ? '▲' : '▼'}</span>
              </button>
              {expandedReport === r.id && (
                <div className="px-4 pb-4 bg-surface-50/60">
                  {r.notes && <p className="text-xs text-ink-500 mb-3 italic">{r.notes}</p>}
                  <div className="divide-y divide-surface-200">
                    {r.royale_stock_report_items?.map((item, i) => (
                      <div key={i} className="py-2 flex items-center justify-between text-sm">
                        <span className="text-ink-700">{item.products?.name}</span>
                        <span className="font-semibold text-ink-900">{item.quantity_on_hand} units</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Record Stock In Modal */}
      {showStockIn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Record Stock In</h3>
              <button onClick={() => setShowStockIn(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Product</label>
                <select className="input" value={stockInForm.product_id} onChange={e => setStockInForm(f => ({...f, product_id: e.target.value}))}>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="label">Quantity Received</label><input type="number" className="input" value={stockInForm.quantity} onChange={e => setStockInForm(f => ({...f, quantity: e.target.value}))} /></div>
              <div><label className="label">Source</label>
                <select className="input" value={stockInForm.source} onChange={e => setStockInForm(f => ({...f, source: e.target.value}))}>
                  <option value="supplier">From Supplier</option>
                  <option value="production">Production</option>
                  <option value="return">Customer Return</option>
                  <option value="adjustment">Manual Adjustment</option>
                </select>
              </div>
              <div><label className="label">Reference <span className="text-ink-300 font-normal normal-case">(optional)</span></label><input className="input" value={stockInForm.reference} onChange={e => setStockInForm(f => ({...f, reference: e.target.value}))} placeholder="e.g. invoice number" /></div>
              <div><label className="label">Notes</label><textarea className="input" rows={2} value={stockInForm.notes} onChange={e => setStockInForm(f => ({...f, notes: e.target.value}))} /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowStockIn(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveStockIn} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Record'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Dispatch Stock</h3>
              <button onClick={() => setShowDispatch(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Product</label>
                <select className="input" value={dispatchForm.product_id} onChange={e => { setDispatchForm(f => ({...f, product_id: e.target.value})); setDispatchError('') }}>
                  <option value="">Select product</option>
                  {products.map(p => {
                    const onHand = merchantStock.find(s => s.product_id === p.id)?.quantity || 0
                    return <option key={p.id} value={p.id}>{p.name} — {onHand} on hand</option>
                  })}
                </select>
              </div>
              <div><label className="label">Send To</label>
                <select className="input" value={dispatchForm.logistics_id} onChange={e => setDispatchForm(f => ({...f, logistics_id: e.target.value}))}>
                  <option value="">Select logistics company</option>
                  {logistics.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div><label className="label">Quantity</label><input type="number" className="input" value={dispatchForm.quantity_sent} onChange={e => { setDispatchForm(f => ({...f, quantity_sent: e.target.value})); setDispatchError('') }} /></div>
              <div><label className="label">Dispatch Reference <span className="text-ink-300 font-normal normal-case">(optional)</span></label><input className="input" value={dispatchForm.dispatch_reference} onChange={e => setDispatchForm(f => ({...f, dispatch_reference: e.target.value}))} placeholder="e.g. park ticket number" /></div>
              <div><label className="label">Notes</label><textarea className="input" rows={2} value={dispatchForm.notes} onChange={e => setDispatchForm(f => ({...f, notes: e.target.value}))} /></div>
              {dispatchError && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{dispatchError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowDispatch(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveDispatch} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Send Dispatch'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}