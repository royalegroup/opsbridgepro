import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function BundlesPage() {
  const { profile } = useAuth()
  const [bundles, setBundles] = useState([])
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editBundle, setEditBundle] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', bundle_price: '', delivery_fee: '', items: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [bRes, pRes] = await Promise.all([
      supabase.from('product_bundles')
        .select('*, bundle_items(quantity, products(id, name, cost_price, selling_price))')
        .eq('merchant_id', bid)
        .order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, cost_price, selling_price, delivery_fee').eq('merchant_id', bid).eq('is_active', true),
    ])
    if (bRes.data) setBundles(bRes.data)
    if (pRes.data) setProducts(pRes.data)
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { product_id: '', quantity: 1 }] }))
  }

  function updateItem(index, field, value) {
    setForm(f => ({
      ...f,
      items: f.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }))
  }

  function removeItem(index) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }))
  }

  function openEdit(bundle) {
    setEditBundle(bundle)
    setForm({
      name: bundle.name,
      description: bundle.description || '',
      bundle_price: bundle.bundle_price,
      delivery_fee: bundle.delivery_fee,
      items: bundle.bundle_items.map(i => ({ product_id: i.products.id, quantity: i.quantity }))
    })
    setShowForm(true)
  }

  function openNew() {
    setEditBundle(null)
    setForm({ name: '', description: '', bundle_price: '', delivery_fee: '', items: [{ product_id: '', quantity: 1 }] })
    setShowForm(true)
  }

  // Calculate total cost of bundle items
  function calcBundleCost() {
    return form.items.reduce((total, item) => {
      const product = products.find(p => p.id === item.product_id)
      return total + (product ? +product.cost_price * item.quantity : 0)
    }, 0)
  }

  function calcBundleProfit() {
    return +form.bundle_price - calcBundleCost() - +(form.delivery_fee || 0)
  }

  async function save() {
    if (!form.name || !form.bundle_price || form.items.length === 0) {
      setError('Name, price and at least one product are required.')
      return
    }
    const validItems = form.items.filter(i => i.product_id)
    if (validItems.length === 0) { setError('Select at least one product.'); return }

    setSaving(true); setError('')

    if (editBundle) {
      // Update existing bundle
      await supabase.from('product_bundles').update({
        name: form.name,
        description: form.description,
        bundle_price: +form.bundle_price,
        delivery_fee: +(form.delivery_fee || 0),
      }).eq('id', editBundle.id)

      // Delete old items and reinsert
      await supabase.from('bundle_items').delete().eq('bundle_id', editBundle.id)
      await supabase.from('bundle_items').insert(
        validItems.map(i => ({ bundle_id: editBundle.id, product_id: i.product_id, quantity: +i.quantity }))
      )
    } else {
      // Create new bundle
      const { data: bundle, error: bundleError } = await supabase.from('product_bundles').insert({
        merchant_id: profile.business_id,
        name: form.name,
        description: form.description,
        bundle_price: +form.bundle_price,
        delivery_fee: +(form.delivery_fee || 0),
      }).select().single()

      if (bundleError) { setError(bundleError.message); setSaving(false); return }

      await supabase.from('bundle_items').insert(
        validItems.map(i => ({ bundle_id: bundle.id, product_id: i.product_id, quantity: +i.quantity }))
      )
    }

    setShowForm(false)
    setEditBundle(null)
    load()
    setSaving(false)
  }

  async function toggleActive(id, current) {
    await supabase.from('product_bundles').update({ is_active: !current }).eq('id', id)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Product Bundles</h1>
          <p className="text-ink-400 text-sm mt-0.5">{bundles.filter(b => b.is_active).length} active bundles</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ New Bundle</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bundles.map(b => {
          const totalCost = b.bundle_items?.reduce((s, i) => s + (+i.products?.cost_price * i.quantity), 0) || 0
          const profit = +b.bundle_price - totalCost - +b.delivery_fee
          return (
            <div key={b.id} className={`card ${!b.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink-900">{b.name}</p>
                  {b.description && <p className="text-xs text-ink-500 mt-0.5">{b.description}</p>}
                </div>
                <button onClick={() => toggleActive(b.id, b.is_active)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0 ml-2 ${b.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {b.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Bundle items */}
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Includes</p>
                {b.bundle_items?.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-ink-600">{item.products?.name}</span>
                    <span className="font-medium text-ink-900">x{item.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Pricing */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="bg-surface-50 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-ink-400">Cost</p>
                  <p className="font-semibold text-ink-900 text-sm">₦{totalCost.toLocaleString()}</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-2.5 text-center">
                  <p className="text-xs text-ink-400">Price</p>
                  <p className="font-semibold text-ink-900 text-sm">₦{Number(b.bundle_price).toLocaleString()}</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-ink-400">Profit</p>
                  <p className={`font-semibold text-sm ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>₦{profit.toLocaleString()}</p>
                </div>
              </div>
              {+b.delivery_fee > 0 && (
                <p className="text-xs text-ink-400 mt-2">Delivery fee: ₦{Number(b.delivery_fee).toLocaleString()}</p>
              )}

              <button onClick={() => openEdit(b)} className="btn-secondary w-full mt-3 text-xs">Edit Bundle</button>
            </div>
          )
        })}
      </div>

      {bundles.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-ink-500 font-medium">No bundles yet</p>
          <p className="text-sm text-ink-400 mt-1">Create product bundles to sell multiple items together.</p>
        </div>
      )}

      {/* Bundle Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">{editBundle ? 'Edit Bundle' : 'New Bundle'}</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Bundle Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Pest Control Pack" />
              </div>
              <div>
                <label className="label">Description <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Brief description of the bundle" />
              </div>

              {/* Bundle items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Products in Bundle</label>
                  <button type="button" onClick={addItem} className="text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">+ Add Product</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <select
                        className="input flex-1"
                        value={item.product_id}
                        onChange={e => updateItem(index, 'product_id', e.target.value)}>
                        <option value="">Select product</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} — ₦{Number(p.cost_price).toLocaleString()} cost</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className="input w-20 text-center"
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', +e.target.value)}
                        placeholder="Qty"
                      />
                      <button onClick={() => removeItem(index)} className="text-ink-300 hover:text-danger text-lg flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bundle Price (₦)</label>
                  <input type="number" className="input" value={form.bundle_price} onChange={e => setForm(f => ({...f, bundle_price: e.target.value}))} />
                </div>
                <div>
                  <label className="label">Delivery Fee (₦)</label>
                  <input type="number" className="input" value={form.delivery_fee} onChange={e => setForm(f => ({...f, delivery_fee: e.target.value}))} />
                </div>
              </div>

              {/* Live profit preview */}
              {form.bundle_price && form.items.some(i => i.product_id) && (
                <div className={`rounded-xl p-3 text-sm font-medium ${calcBundleProfit() >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  <div className="flex justify-between">
                    <span>Total cost of items:</span>
                    <span>₦{calcBundleCost().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Bundle price:</span>
                    <span>₦{Number(form.bundle_price).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mt-1 font-bold border-t border-current/20 pt-1">
                    <span>Profit per bundle:</span>
                    <span>₦{calcBundleProfit().toLocaleString()}</span>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : editBundle ? 'Save Changes' : 'Create Bundle'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}