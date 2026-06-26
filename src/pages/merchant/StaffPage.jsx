import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const MERCHANT_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'orders', label: 'Orders' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'customers', label: 'Customers' },
  { key: 'products', label: 'Products' },
  { key: 'stock', label: 'Stock' },
  { key: 'finance', label: 'Finance' },
  { key: 'staff', label: 'Staff' },
  { key: 'reports', label: 'Reports' },
]

const PERMISSION_PRESETS = [
  { label: 'CS Rep', permissions: ['dashboard', 'orders', 'customers', 'tasks'] },
  { label: 'Store Manager', permissions: ['dashboard', 'orders', 'customers', 'products', 'stock', 'tasks', 'staff'] },
  { label: 'Finance Officer', permissions: ['dashboard', 'finance', 'reports'] },
  { label: 'Full Access', permissions: [] },
]

export default function StaffPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [credModal, setCredModal] = useState(null)
  const [pwModal, setPwModal] = useState(false)
  const [permModal, setPermModal] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', role: '', username: '', permissions: ['dashboard', 'orders', 'customers', 'tasks'] })
  const [credForm, setCredForm] = useState({ username: '', password: '', confirmPassword: '' })
  const [pwForm, setPwForm] = useState({ newPw: '', confirm: '' })
  const [permEdit, setPermEdit] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [credError, setCredError] = useState('')
  const [credSuccess, setCredSuccess] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

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

  function togglePermission(key) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key]
    }))
  }

  function applyPreset(preset) {
    setForm(f => ({ ...f, permissions: preset.permissions }))
  }

  async function save() {
    if (!form.full_name || !form.role || !form.username) { setError('Name, role and username are required.'); return }
    setSaving(true); setError('')

    const { data: existing } = await supabase.from('users').select('id').eq('username', form.username.toLowerCase()).maybeSingle()
    if (existing) { setError('Username already taken. Choose another.'); setSaving(false); return }

    if (form.email) {
      const { data: emailExists } = await supabase.from('users').select('id').eq('email', form.email.toLowerCase()).maybeSingle()
      if (emailExists) { setError('Email already in use. Leave blank if unsure.'); setSaving(false); return }
    }

    const { error: insertError } = await supabase.from('users').insert({
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email?.toLowerCase() || `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@opsbridgepro.internal`,
      role: form.role.toLowerCase().replace(/\s+/g, '_'),
      username: form.username.toLowerCase().trim(),
      business_id: profile.business_id,
      business_type: 'merchant',
      is_active: true,
      permissions: form.permissions,
    })

    if (insertError) { setError(`Failed: ${insertError.message}`); setSaving(false); return }

    setShowForm(false)
    setForm({ full_name: '', phone: '', email: '', role: '', username: '', permissions: ['dashboard', 'orders', 'customers', 'tasks'] })
    load()
    setSaving(false)
  }

  async function savePermissions() {
    if (!permModal) return
    setSaving(true)
    await supabase.from('users').update({ permissions: permEdit }).eq('id', permModal.id)
    setPermModal(null)
    load()
    setSaving(false)
  }

  async function setupCredentials() {
    if (!credForm.username || !credForm.password) { setCredError('Username and password are required.'); return }
    if (credForm.password !== credForm.confirmPassword) { setCredError('Passwords do not match.'); return }
    if (credForm.password.length < 6) { setCredError('Password must be at least 6 characters.'); return }

    setSaving(true); setCredError(''); setCredSuccess('')

    const { data: existing } = await supabase.from('users').select('id')
      .eq('username', credForm.username.toLowerCase()).neq('id', credModal.id).maybeSingle()
    if (existing) { setCredError('Username already taken.'); setSaving(false); return }

    const authEmail = credModal.email.includes('@opsbridgepro.internal')
      ? `staff_${credModal.id.slice(0, 8)}_${Date.now()}@opsbridgepro.app`
      : credModal.email

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: authEmail,
      password: credForm.password,
      options: { data: { full_name: credModal.full_name } }
    })

    if (authError) { setCredError(authError.message); setSaving(false); return }

    await supabase.from('users').update({
      auth_id: authData.user?.id,
      email: authEmail,
      username: credForm.username.toLowerCase(),
    }).eq('id', credModal.id)

    setCredSuccess(`✅ Login set! Username: ${credForm.username}`)
    setCredForm({ username: '', password: '', confirmPassword: '' })
    load()
    setSaving(false)
  }

  async function changePassword() {
    if (!pwForm.newPw || !pwForm.confirm) { setPwError('All fields are required.'); return }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match.'); return }
    if (pwForm.newPw.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    setSaving(true); setPwError(''); setPwSuccess('')
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw })
    if (error) { setPwError(error.message); setSaving(false); return }
    setPwSuccess('✅ Password changed successfully!')
    setPwForm({ newPw: '', confirm: '' })
    setSaving(false)
  }

  async function toggleActive(id, current) {
    await supabase.from('users').update({ is_active: !current }).eq('id', id)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="text-ink-400 text-sm mt-0.5">{staff.filter(s => s.is_active).length} active staff members</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setPwModal(true); setPwError(''); setPwSuccess('') }} className="btn-secondary text-sm">🔑 Change My Password</button>
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Staff</button>
        </div>
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
                  <p className="text-xs text-ink-400 capitalize">{s.role?.replace(/_/g, ' ')} · @{s.username || 'no username'}</p>
                  {s.phone && <p className="text-xs text-ink-400">{s.phone}</p>}
                  {s.permissions?.length > 0 && (
                    <p className="text-xs text-brand-600 mt-0.5">
                      Access: {s.permissions.join(', ')}
                    </p>
                  )}
                  {s.permissions?.length === 0 && <p className="text-xs text-green-600 mt-0.5">Full access</p>}
                </div>
              </div>
              <div className="flex-shrink-0">
                {s.auth_id
                  ? <span className="badge bg-green-50 text-green-700">Login set</span>
                  : <span className="badge bg-amber-50 text-amber-700">No login</span>}
              </div>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-surface-100 flex-wrap">
              <button
                onClick={() => { setCredModal(s); setCredForm({ username: s.username || '', password: '', confirmPassword: '' }); setCredError(''); setCredSuccess('') }}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">
                {s.auth_id ? 'Update Credentials' : 'Set Login'}
              </button>
              <button
                onClick={() => { setPermModal(s); setPermEdit(s.permissions || []) }}
                className="text-xs px-3 py-1.5 rounded-lg bg-surface-100 text-ink-700 font-medium hover:bg-surface-200">
                Edit Access
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
            <p className="text-sm text-ink-400 mt-1">Add your CS Reps, Store Manager, Finance team and more.</p>
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
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder="Staff full name" />
              </div>
              <div>
                <label className="label">Role</label>
                <input className="input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} placeholder="e.g. CS Rep, Media Manager, Accountant" />
                <p className="text-xs text-ink-400 mt-1">Type any role — no restrictions.</p>
              </div>
              <div>
                <label className="label">Username</label>
                <input className="input" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g, '_')}))} placeholder="e.g. amaka_cs" />
                <p className="text-xs text-ink-400 mt-1">Lowercase, no spaces. Used to log in.</p>
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="08012345678" />
              </div>
              <div>
                <label className="label">Email <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
                <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="For password recovery" />
              </div>

              {/* Permissions */}
              <div>
                <label className="label">Access Permissions</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {PERMISSION_PRESETS.map(p => (
                    <button key={p.label} type="button" onClick={() => applyPreset(p)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 p-3 border border-surface-200 rounded-xl">
                  {MERCHANT_PAGES.map(p => (
                    <button key={p.key} type="button" onClick={() => togglePermission(p.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.permissions.includes(p.key) ? 'bg-brand-600 text-white' : 'bg-surface-100 text-ink-600 hover:bg-surface-200'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-400 mt-1">
                  {form.permissions.length === 0 ? 'Full access to everything' : `${form.permissions.length} pages selected`}
                </p>
              </div>

              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add Staff'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Permissions Modal */}
      {permModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink-900">Edit Access — {permModal.full_name}</h3>
              <button onClick={() => setPermModal(null)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {PERMISSION_PRESETS.map(p => (
                <button key={p.label} type="button" onClick={() => setPermEdit(p.permissions)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 p-3 border border-surface-200 rounded-xl">
              {MERCHANT_PAGES.map(p => (
                <button key={p.key} type="button"
                  onClick={() => setPermEdit(pe => pe.includes(p.key) ? pe.filter(x => x !== p.key) : [...pe, p.key])}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${permEdit.includes(p.key) ? 'bg-brand-600 text-white' : 'bg-surface-100 text-ink-600 hover:bg-surface-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-400">
              {permEdit.length === 0 ? 'Full access to everything' : `${permEdit.length} pages selected`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPermModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={savePermissions} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save Access'}</button>
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
                <p className="text-xs text-ink-400 capitalize">{credModal.role?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <label className="label">Username</label>
                <input className="input" value={credForm.username} onChange={e => setCredForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g, '_')}))} />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={credForm.password} onChange={e => setCredForm(f => ({...f, password: e.target.value}))} placeholder="Minimum 6 characters" />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input type="password" className="input" value={credForm.confirmPassword} onChange={e => setCredForm(f => ({...f, confirmPassword: e.target.value}))} />
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

      {/* Change Password Modal */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink-900">Change My Password</h3>
              <button onClick={() => setPwModal(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="bg-surface-50 rounded-xl p-3">
              <p className="text-sm font-semibold text-ink-900">{profile?.full_name}</p>
              <p className="text-xs text-ink-400">@{profile?.username}</p>
            </div>
            <div>
              <label className="label">New Password</label>
              <input type="password" className="input" value={pwForm.newPw} onChange={e => setPwForm(f => ({...f, newPw: e.target.value}))} placeholder="Minimum 6 characters" />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(f => ({...f, confirm: e.target.value}))} />
            </div>
            {pwError && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{pwError}</p>}
            {pwSuccess && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-xl">{pwSuccess}</p>}
            <div className="flex gap-3">
              <button onClick={() => setPwModal(false)} className="btn-secondary flex-1">Close</button>
              <button onClick={changePassword} disabled={saving} className="btn-primary flex-1">{saving ? 'Changing…' : 'Change Password'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}