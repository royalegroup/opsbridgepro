import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function ProductsPage() {
  const { profile } = useAuth()
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', sku: '', description: '', cost_price: '', selling_price: '', delivery_fee: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('products').select('*').eq('merchant_id', profile.business_id).order('created_at', { ascending: false })
    if (data) setProducts(data)
  }

  async function save() {
    if (!form.name || !form.selling_price) return
    setSaving(true)
    await supabase.from('products').insert({ ...form, merchant_id: profile.business_id, cost_price: +form.cost_price, selling_price: +form.selling_price, delivery_fee: +form.delivery_fee })
    setShowForm(false)
    setForm({ name: '', sku: '', description: '', cost_price: '', selling_price: '', delivery_fee: '' })
    load()
    setSaving(false)
  }

  async function toggleActive(id, current) {
    await supabase.from('products').update({ is_active: !current }).eq('id', id)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="text-ink-400 text-sm mt-0.5">{products.filter(p => p.is_active).length} active products</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Product</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map(p => {
          const profit = p.selling_price - p.cost_price - p.delivery_fee
          return (
            <div key={p.id} className={`card ${!p.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink-900">{p.name}</p>
                  {p.sku && <p className="text-xs text-ink-400 mt-0.5">SKU: {p.sku}</p>}
                </div>
                <button onClick={() => toggleActive(p.id, p.is_active)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
              {p.description && <p className="text-xs text-ink-500 mt-2">{p.description}</p>}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="bg-surface-50 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-ink-400">Cost</p>
                  <p className="font-semibold text-ink-900 text-sm">₦{Number(p.cost_price).toLocaleString()}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-ink-400">Selling</p>
                  <p className="font-semibold text-ink-900 text-sm">₦{Number(p.selling_price).toLocaleString()}</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-ink-400">Profit</p>
                  <p className={`font-semibold text-sm ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>₦{Number(profit).toLocaleString()}</p>
                </div>
              </div>
              <p className="text-xs text-ink-400 mt-2">Delivery fee: ₦{Number(p.delivery_fee).toLocaleString()}</p>
            </div>
          )
        })}
      </div>

      {products.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-3xl mb-2">▣</p>
          <p className="text-ink-500 font-medium">No products yet</p>
          <p className="text-sm text-ink-400 mt-1">Add your first product to get started.</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Add Product</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 hover:text-ink-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Product Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. DryEase Pro Portable Dryer" /></div>
              <div><label className="label">SKU (optional)</label><input className="input" value={form.sku} onChange={e => setForm(f => ({...f, sku: e.target.value}))} placeholder="e.g. DEP-001" /></div>
              <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Cost Price (₦)</label><input type="number" className="input" value={form.cost_price} onChange={e => setForm(f => ({...f, cost_price: e.target.value}))} /></div>
                <div><label className="label">Selling Price (₦)</label><input type="number" className="input" value={form.selling_price} onChange={e => setForm(f => ({...f, selling_price: e.target.value}))} /></div>
                <div><label className="label">Delivery Fee (₦)</label><input type="number" className="input" value={form.delivery_fee} onChange={e => setForm(f => ({...f, delivery_fee: e.target.value}))} /></div>
              </div>
              {form.selling_price && form.cost_price && (
                <div className={`rounded-xl p-3 text-sm font-medium ${(+form.selling_price - +form.cost_price - +form.delivery_fee) >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  Profit per unit: ₦{(+form.selling_price - +form.cost_price - +(form.delivery_fee || 0)).toLocaleString()}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add Product'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
