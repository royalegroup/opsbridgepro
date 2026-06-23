import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

export default function CustomersPage() {
  const { profile } = useAuth()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', state: '', address: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('customers').select('*').eq('merchant_id', profile.business_id).order('created_at', { ascending: false })
    if (data) setCustomers(data)
  }

  const filtered = customers.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.state || '').toLowerCase().includes(search.toLowerCase())
  )

  async function save() {
    if (!form.full_name || !form.phone) return
    setSaving(true)
    await supabase.from('customers').insert({ ...form, merchant_id: profile.business_id })
    setShowForm(false)
    setForm({ full_name: '', phone: '', state: '', address: '', notes: '' })
    load()
    setSaving(false)
  }

  function whatsapp(phone) {
    const clean = phone.replace(/\D/g, '')
    const intl = clean.startsWith('0') ? '234' + clean.slice(1) : clean
    window.open(`https://wa.me/${intl}`, '_blank')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="text-ink-400 text-sm mt-0.5">{customers.length} customers</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Customer</button>
      </div>

      <input className="input" placeholder="Search by name, phone, or state…" value={search} onChange={e => setSearch(e.target.value)} />

      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">◉</p>
            <p className="text-ink-500 font-medium">{search ? 'No customers match your search' : 'No customers yet'}</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(c => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-3 hover:bg-surface-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                    {c.full_name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 text-sm">{c.full_name}</p>
                    <p className="text-xs text-ink-400">{c.phone} · {c.state || '—'}</p>
                  </div>
                </div>
                <button onClick={() => whatsapp(c.phone)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors">
                  WhatsApp
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Add Customer</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 hover:text-ink-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder="Customer full name" /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="08012345678" /></div>
              <div><label className="label">State</label>
                <select className="input" value={form.state} onChange={e => setForm(f => ({...f, state: e.target.value}))}>
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Delivery address" /></div>
              <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Optional notes…" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add Customer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
