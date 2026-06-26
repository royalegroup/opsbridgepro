import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const ROLES = [
  { value: 'store_manager', label: 'Store Manager' },
  { value: 'cs_rep', label: 'CS Rep' },
  { value: 'finance_officer', label: 'Finance Officer' },
]

export default function StaffPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [credModal, setCredModal] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', role: 'cs_rep', username: '' })
  const [credForm, setCredForm] = useState({ username: '', password: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [credError, setCredError] = useState('')
  const [credSuccess, setCredSuccess] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('business_id', profile.business_id)
      .neq('role', 'owner')
      .order('created_at', { ascending: false })
    if (data) setStaff(data)
  }

 async function save() {
  if (!form.full_name || !form.role || !form.username) { setError('Name, role and username are required.'); return }
  setSaving(true); setError('')

  // Check username uniqueness
  const { data: existing } = await supabase.from('users').select('id').eq('username', form.username.toLowerCase()).maybeSingle()
  if (existing) { setError('Username already taken. Choose another.'); setSaving(false); return }

  const { data, error: insertError } = await supabase.from('users').insert({
    full_name: form.full_name,
    phone: form.phone,
    email: form.email || `staff_${Date.now()}@opsbridgepro.internal`,
    role: form.role,
    username: form.username.toLowerCase(),
    business_id: profile.business_id,
    business_type: 'merchant',
    is_active: true,
  }).select()

  console.log('Staff insert result:', { data, insertError })

  if (insertError) {
    setError(`Failed to add staff: ${insertError.message}`)
    setSaving(false)
    return
  }

  setShowForm(false)
  setForm({ full_name: '', phone: '', email: '', role: 'cs_rep', username: '' })
  load()
  setSaving(false)
}

  async function setupCredentials() {
    if (!credForm.username || !credForm.password) { setCredError('Username and password are required.'); return }
    if (credForm.password !== credForm.confirmPassword) { setCredError('Passwords do not match.'); return }
    if (credForm.password.length < 6) { setCredError('Password must be at least 6 characters.'); return }

    setSaving(true); setCredError(''); setCredSuccess('')

    // Check username uniqueness (excluding current user)
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', credForm.username.toLowerCase())
      .neq('id', credModal.id)
      .maybeSingle()

    if (existing) { setCredError('Username already taken.'); setSaving(false); return }

    // Create Supabase auth account
    const email = credModal.email.includes('@opsbridgepro.internal')
      ? `staff_${credModal.id.slice(0, 8)}@opsbridgepro.app`
      : credModal.email

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: credForm.password,
      options: { data: { full_name: credModal.full_name } }
    })

    if (authError) { setCredError(authError.message); setSaving(false); return }

    // Link auth to user record
    await supabase.from('users').update({
      auth_id: authData.user?.id,
      email,
      username: credForm.username.toLowerCase(),
    }).eq('id', credModal.id)

    setCredSuccess(`✅ Login credentials set! Username: ${credForm.username}`)
    setCredForm({ username: '', password: '', confirmPassword: '' })
    load()
    setSaving(false)
  }

  async function toggleActive(id, current) {
    await supabase.from('users').update({ is_active: !current }).eq('id', id)
    load()
  }

  const roleLabel = { store_manager: 'Store Manager', cs_rep: 'CS Rep', finance_officer: 'Finance Officer' }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="text-ink-400 text-sm mt-0.5">{staff.filter(s => s.is_active).length} active staff members</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Staff</button>
      </div>

      <div className="space-y-3">
        {staff.map(s => (
          <div key={s.id} className={`card ${!s.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold flex-shrink-0">
                  {s.full_name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900 text-sm">{s.full_name}</p>
                  <p className="text-xs text-ink-400">{roleLabel[s.role] || s.role} · @{s.username || 'no username'}</p>
                  {s.phone && <p className="text-xs text-ink-400">{s.phone}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {s.auth_id ? (
                  <span className="badge bg-green-50 text-green-700">Login set</span>
                ) : (
                  <span className="badge bg-amber-50 text-amber-700">No login</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-surface-100">
              <button
                onClick={() => { setCredModal(s); setCredForm({ username: s.username || '', password: '', confirmPassword: '' }); setCredError(''); setCredSuccess('') }}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">
                {s.auth_id ? 'Update Credentials' : 'Set Login Credentials'}
              </button>
              <button
                onClick={() => toggleActive(s.id, s.is_active)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${s.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                {s.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}

        {staff.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-3xl mb-2">◉</p>
            <p className="text-ink-500 font-medium">No staff added yet</p>
            <p className="text-sm text-ink-400 mt-1">Add your CS Reps, Store Manager and Finance team.</p>
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Add Staff Member</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder="Staff full name" /></div>
              <div><label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div><label className="label">Username</label>
                <input className="input" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g, '_')}))} placeholder="e.g. amaka_cs" />
                <p className="text-xs text-ink-400 mt-1">This is what they use to log in. Lowercase, no spaces.</p>
              </div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="08012345678" /></div>
              <div><label className="label">Email (optional)</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="For password recovery" /></div>
              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add Staff'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {credModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Set Login Credentials</h3>
              <button onClick={() => setCredModal(null)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-surface-50 rounded-xl p-3">
                <p className="text-sm font-semibold text-ink-900">{credModal.full_name}</p>
                <p className="text-xs text-ink-400">{roleLabel[credModal.role]}</p>
              </div>
              <div><label className="label">Username</label>
                <input className="input" value={credForm.username} onChange={e => setCredForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g, '_')}))} placeholder="e.g. amaka_cs" />
              </div>
              <div><label className="label">Password</label>
                <input type="password" className="input" value={credForm.password} onChange={e => setCredForm(f => ({...f, password: e.target.value}))} placeholder="Minimum 6 characters" />
              </div>
              <div><label className="label">Confirm Password</label>
                <input type="password" className="input" value={credForm.confirmPassword} onChange={e => setCredForm(f => ({...f, confirmPassword: e.target.value}))} placeholder="Repeat password" />
              </div>
              {credError && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{credError}</p>}
              {credSuccess && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-xl">{credSuccess}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setCredModal(null)} className="btn-secondary flex-1">Close</button>
                <button onClick={setupCredentials} disabled={saving} className="btn-primary flex-1">{saving ? 'Setting up…' : 'Set Credentials'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}