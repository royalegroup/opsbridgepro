import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'

export default function StockPage() {
  const { profile } = useAuth()
  const [dispatches, setDispatches] = useState([])
  const [products, setProducts] = useState([])
  const [logistics, setLogistics] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ product_id: '', logistics_id: '', quantity_sent: '', dispatch_reference: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [dRes, pRes, lRes] = await Promise.all([
      supabase.from('stock_dispatches').select('*, products(name), businesses(name)').eq('merchant_id', bid).order('dispatched_at', { ascending: false }),
      supabase.from('products').select('id, name').eq('merchant_id', bid).eq('is_active', true),
      supabase.from('merchant_logistics_links').select('logistics_id, businesses!merchant_logistics_links_logistics_id_fkey(id, name)').eq('merchant_id', bid).eq('is_active', true),
    ])
    if (dRes.data) setDispatches(dRes.data)
    if (pRes.data) setProducts(pRes.data)
    if (lRes.data) setLogistics(lRes.data.map(l => ({ id: l.logistics_id, name: l.businesses?.name })))
  }

  async function save() {
    if (!form.product_id || !form.logistics_id || !form.quantity_sent) return
    setSaving(true)
    await supabase.from('stock_dispatches').insert({ ...form, merchant_id: profile.business_id, quantity_sent: +form.quantity_sent })
    setShowForm(false)
    setForm({ product_id: '', logistics_id: '', quantity_sent: '', dispatch_reference: '', notes: '' })
    load()
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Stock Dispatches</h1>
          <p className="text-ink-400 text-sm mt-0.5">Track stock sent to your logistics partner</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Dispatch Stock</button>
      </div>

      <div className="card p-0 overflow-hidden">
        {dispatches.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">⬡</p>
            <p className="text-ink-500 font-medium">No dispatches yet</p>
            <p className="text-sm text-ink-400 mt-1">Record stock sent to your logistics partner.</p>
          </div>
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
                  {d.received_quantity && <p className="text-xs text-green-600">Received: {d.received_quantity}</p>}
                  <div className="mt-1"><Badge status={d.status} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Dispatch Stock</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Product</label>
                <select className="input" value={form.product_id} onChange={e => setForm(f => ({...f, product_id: e.target.value}))}>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="label">Send To</label>
                <select className="input" value={form.logistics_id} onChange={e => setForm(f => ({...f, logistics_id: e.target.value}))}>
                  <option value="">Select logistics company</option>
                  {logistics.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div><label className="label">Quantity</label><input type="number" className="input" value={form.quantity_sent} onChange={e => setForm(f => ({...f, quantity_sent: e.target.value}))} /></div>
              <div><label className="label">Dispatch Reference (optional)</label><input className="input" value={form.dispatch_reference} onChange={e => setForm(f => ({...f, dispatch_reference: e.target.value}))} placeholder="e.g. park ticket number" /></div>
              <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Send Dispatch'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
