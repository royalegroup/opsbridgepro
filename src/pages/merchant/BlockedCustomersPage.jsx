import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function BlockedCustomersPage() {
  const { profile } = useAuth()
  const [blocked, setBlocked] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('blocked_customers')
      .select('*, users(full_name)')
      .eq('merchant_id', profile.business_id)
      .order('created_at', { ascending: false })
    if (data) setBlocked(data)
  }

  const filtered = blocked.filter(b =>
    (b.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.phone || '').includes(search) ||
    (b.address || '').toLowerCase().includes(search.toLowerCase())
  )

  async function save() {
    if (!form.phone && !form.full_name && !form.address) { setError('Provide at least a phone number, name, or address to block.'); return }
    if (!form.reason) { setError('A reason is required.'); return }
    setSaving(true); setError('')

    const { error: insertError } = await supabase.from('blocked_customers').insert({
      merchant_id: profile.business_id,
      full_name: form.full_name || null,
      phone: form.phone || null,
      address: form.address || null,
      reason: form.reason,
      blocked_by: profile.id,
    })

    if (insertError) { setError(insertError.message); setSaving(false); return }

    setShowForm(false)
    setForm({ full_name: '', phone: '', address: '', reason: '' })
    load()
    setSaving(false)
  }

  async function unblock(id) {
    if (!confirm('Remove this customer from the blocklist?')) return
    await supabase.from('blocked_customers').delete().eq('id', id)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Blocked Customers</h1>
          <p className="text-ink-400 text-sm mt-0.5">{blocked.length} blocked · checked automatically at order creation</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Block Customer</button>
      </div>

      <input className="input" placeholder="Search by name, phone, or address…" value={search} onChange={e => setSearch(e.target.value)} />

      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">🚫</p>
            <p className="text-ink-500 font-medium">{search ? 'No matches found' : 'No blocked customers'}</p>
            <p className="text-sm text-ink-400 mt-1">Block serial COD rejecters or fraud-flagged customers here.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(b => (
              <div key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 text-sm">{b.full_name || 'Name not provided'}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{b.phone || '—'} {b.address ? `· ${b.address}` : ''}</p>
                    <div className="mt-2 bg-red-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-red-700"><span className="font-semibold">Reason:</span> {b.reason}</p>
                    </div>
                    <p className="text-xs text-ink-400 mt-1.5">
                      Blocked by {b.users?.full_name || 'Unknown'} · {new Date(b.created_at).toLocaleDateString('en-NG')}
                    </p>
                  </div>
                  <button onClick={() => unblock(b.id)} className="text-xs px-3 py-1.5 rounded-lg bg-surface-100 text-ink-600 font-medium hover:bg-surface-200 flex-shrink-0">
                    Unblock
                  </button>
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
              <h3 className="font-semibold text-ink-900">Block Customer</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-ink-400">Provide at least one identifier — phone number is most reliable for automatic matching.</p>
              <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder="Customer name" /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="08012345678" /></div>
              <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Known address" /></div>
              <div>
                <label className="label">Reason <span className="text-danger">*</span></label>
                <textarea className="input" rows={3} value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))} placeholder="e.g. Rejected 3 COD deliveries in a row without explanation" />
              </div>
              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Blocking…' : 'Block Customer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}