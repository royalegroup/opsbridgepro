import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'
import { createFollowUpTask } from '../../lib/taskHelpers'
import ReceiptModal from '../../components/merchant/ReceiptModal'

const STATUSES = ['all', 'new', 'assigned', 'confirmed', 'sent_to_logistics', 'in_transit', 'delivered', 'failed', 'cancelled']
const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

export default function OrdersPage() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [csReps, setCsReps] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [receiptOrder, setReceiptOrder] = useState(null)
  const [form, setForm] = useState({ customer_id: '', product_id: '', quantity: 1, delivery_state: '', source: 'manual', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) loadAll() }, [profile])

  async function loadAll() {
    const bid = profile.business_id
    const [ordersRes, cusRes, prodRes, repsRes] = await Promise.all([
      supabase.from('orders').select('*, customers(full_name, phone), users(full_name)').eq('merchant_id', bid).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name, phone').eq('merchant_id', bid),
      supabase.from('products').select('id, name, selling_price, delivery_fee, cost_price').eq('merchant_id', bid).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('business_id', bid).eq('role', 'cs_rep'),
    ])
    if (ordersRes.data) setOrders(ordersRes.data)
    if (cusRes.data) setCustomers(cusRes.data)
    if (prodRes.data) setProducts(prodRes.data)
    if (repsRes.data) setCsReps(repsRes.data)
    setLoading(false)
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  async function saveOrder() {
    if (!form.customer_id || !form.product_id || !form.delivery_state) return
    setSaving(true)
    const product = products.find(p => p.id === form.product_id)
    const total = product ? product.selling_price * form.quantity : 0
    const fee = product ? product.delivery_fee : 0

    const { data: orderData, error } = await supabase.from('orders').insert({
      merchant_id: profile.business_id,
      customer_id: form.customer_id,
      delivery_state: form.delivery_state,
      source: form.source,
      notes: form.notes,
      total_amount: total,
      total_delivery_fee: fee,
      status: 'new'
    }).select().single()

    if (!error && orderData) {
      await supabase.from('order_items').insert({
        order_id: orderData.id,
        product_id: form.product_id,
        quantity: form.quantity,
        unit_selling_price: product.selling_price,
        unit_cost_price: product.cost_price,
        unit_delivery_fee: product.delivery_fee,
      })
      setShowForm(false)
      setForm({ customer_id: '', product_id: '', quantity: 1, delivery_state: '', source: 'manual', notes: '' })
      loadAll()
    }
    setSaving(false)
  }

  async function updateStatus(orderId, status) {
    await supabase.from('orders').update({ status }).eq('id', orderId)

    const order = orders.find(o => o.id === orderId)

    // If confirmed, auto-create logistics request
    if (status === 'confirmed') {
      const link = await supabase.from('merchant_logistics_links').select('logistics_id').eq('merchant_id', profile.business_id).eq('is_active', true).single()
      if (link.data) {
        await supabase.from('logistics_requests').insert({
          order_id: orderId,
          merchant_id: profile.business_id,
          logistics_id: link.data.logistics_id,
          delivery_state: order?.delivery_state,
          status: 'pending'
        })
        await supabase.from('orders').update({ status: 'sent_to_logistics' }).eq('id', orderId)
      }
    }

    // Auto-create follow-up task on delivered or failed
    if ((status === 'delivered' || status === 'failed') && order) {
      await createFollowUpTask(order, status, profile.business_id)
    }

    loadAll()
  }

  async function assignRep(orderId, repId) {
    await supabase.from('orders').update({ assigned_cs_rep: repId, status: 'assigned' }).eq('id', orderId)
    loadAll()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="text-ink-400 text-sm mt-0.5">{orders.length} total orders</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ New Order</button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            {s !== 'all' && <span className="ml-1.5 opacity-70">{orders.filter(o => o.status === s).length}</span>}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-ink-300">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">◎</p>
            <p className="text-ink-500 font-medium">No orders found</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(order => (
              <div key={order.id} className="p-4 hover:bg-surface-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900 text-sm">{order.customers?.full_name || '—'}</p>
                      <Badge status={order.status} />
                    </div>
                    <p className="text-xs text-ink-400 mt-1">
                      {order.customers?.phone} · {order.delivery_state} · {new Date(order.created_at).toLocaleDateString('en-NG')}
                    </p>
                    {order.users && <p className="text-xs text-brand-600 mt-0.5">Rep: {order.users.full_name}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-ink-900">₦{Number(order.total_amount).toLocaleString()}</p>
                    <p className="text-xs text-ink-400">+ ₦{Number(order.total_delivery_fee).toLocaleString()} delivery</p>
                  </div>
                </div>

                {/* Actions */}
                {(order.status === 'new' || order.status === 'assigned') && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {order.status === 'new' && csReps.length > 0 && (
                      <select onChange={e => assignRep(order.id, e.target.value)} defaultValue=""
                        className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white text-ink-700">
                        <option value="" disabled>Assign CS Rep</option>
                        {csReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                      </select>
                    )}
                    <button onClick={() => updateStatus(order.id, 'confirmed')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100 transition-colors">
                      Mark Confirmed →
                    </button>
                    <button onClick={() => updateStatus(order.id, 'cancelled')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors">
                      Cancel
                    </button>
                  </div>
                )}

                {/* Receipt button for delivered orders */}
                {order.status === 'delivered' && (
                  <div className="mt-3">
                    <button
                      onClick={() => setReceiptOrder(order)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100 transition-colors flex items-center gap-1.5">
                      🧾 Generate Receipt
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          business={profile?.businesses}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {/* New Order Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">New Order</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 hover:text-ink-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Customer</label>
                <select className="input" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Product</label>
                <select className="input" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} — ₦{Number(p.selling_price).toLocaleString()}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Quantity</label>
                <input type="number" min="1" className="input" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: +e.target.value }))} />
              </div>
              <div>
                <label className="label">Delivery State</label>
                <select className="input" value={form.delivery_state} onChange={e => setForm(f => ({ ...f, delivery_state: e.target.value }))}>
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Source</label>
                <select className="input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                  <option value="manual">Manual</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="referral">Referral</option>
                </select>
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special instructions…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveOrder} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Create Order'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}