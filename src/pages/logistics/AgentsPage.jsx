import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

export default function AgentsPage() {
  const { profile } = useAuth()
  const [agents, setAgents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [credModal, setCredModal] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '', username: '', states_covered: [] })
  const [credForm, setCredForm] = useState({ username: '', password: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [credError, setCredError] = useState('')
  const [credSuccess, setCredSuccess] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('agents')
      .select('*, users(id, full_name, phone, username, auth_id, is_active), agent_stock(quantity, products(name))')
      .eq('logistics_id', profile.business_id)
    if (data) setAgents(data)
  }

  function toggleState(state) {
    setForm(f => ({
      ...f,
      states_covered: f.states_covered.includes(state)
        ? f.states_covered.filter(s => s !== state)
        : [...f.states_covered, state]
    }))
  }

  async function save() {
    if (!form.full_name || !form.phone || !form.username || form.states_covered.length === 0) {
      setError('Please fill in all fields and select at least one state.')
      return
    }
    setSaving(true); setError('')

    // Check username uniqueness
    const { data: existing } = await supabase.from('users').select('id').eq('username', form.username.toLowerCase()).maybeSingle()
    if (existing) { setError('Username already taken. Choose another.'); setSaving(false); return }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        full_name: form.full_name,
        email: `agent_${Date.now()}@opsbridgepro.internal`,
        phone: form.phone,
        username: form.username.toLowerCase(),
        role: 'agent',
        business_id: profile.business_id,
        business_type: 'logistics'
      })
      .select()
      .single()

    if (userError) { setError('Failed to create agent.'); setSaving(false); return }

    await supabase.from('agents').insert({
      user_id: userData.id,
      logistics_id: profile.business_id,
      states_covered: form.states_covered
    })

    setShowForm(false)
    setForm({ full_name: '', phone: '', username: '', states_covered: [] })
    load()
    setSaving(false)
  }

  async function setupCredentials() {
    if (!credForm.username || !credForm.password) { setCredError('Username and password are required.'); return }
    if (credForm.password !== credForm.confirmPassword) { setCredError('Passwords do not match.'); return }
    if (credForm.password.length < 6) { setCredError('Password must be at least 6 characters.'); return }

    setSaving(true); setCredError(''); setCredSuccess('')

    const agentUser = credModal.users

    // Check username uniqueness
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', credForm.username.toLowerCase())
      .neq('id', agentUser.id)
      .maybeSingle()

    if (existing) { setCredError('Username already taken.'); setSaving(false); return }

    const email = `agent_${agentUser.id.slice(0, 8)}@opsbridgepro.app`

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: credForm.password,
      options: { data: { full_name: agentUser.full_name } }
    })

    if (authError) { setCredError(authError.message); setSaving(false); return }

    await supabase.from('users').update({
      auth_id: authData.user?.id,
      email,
      username: credForm.username.toLowerCase(),
    }).eq('id', agentUser.id)

    setCredSuccess(`✅ Login set! Username: ${credForm.username}`)
    setCredForm({ username: '', password: '', confirmPassword: '' })
    load()
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="text-ink-400 text-sm mt-0.5">{agents.filter(a => a.is_active).length} active agents</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Agent</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map(a => (
          <div key={a.id} className="card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold flex-shrink-0">
                {a.users?.full_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 text-sm">{a.users?.full_name}</p>
                <p className="text-xs text-ink-400">{a.users?.phone}</p>
                <p className="text-xs text-ink-400">@{a.users?.username || 'no username'}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {a.states_covered?.map(s => (
                <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>
              ))}
            </div>
            {a.agent_stock?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-surface-100">
                <p className="text-xs text-ink-400 mb-1.5">Stock held:</p>
                {a.agent_stock.map(s => (
                  <div key={s.id} className="flex justify-between text-xs">
                    <span className="text-ink-600">{s.products?.name}</span>
                    <span className={`font-semibold ${s.quantity <= 5 ? 'text-danger' : 'text-ink-900'}`}>{s.quantity} units</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-surface-100 flex items-center justify-between">
              {a.users?.auth_id ? (
                <span className="badge bg-green-50 text-green-700">Login set</span>
              ) : (
                <span className="badge bg-amber-50 text-amber-700">No login yet</span>
              )}
              <button
                onClick={() => { setCredModal(a); setCredForm({ username: a.users?.username || '', password: '', confirmPassword: '' }); setCredError(''); setCredSuccess('') }}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">
                {a.users?.auth_id ? 'Update Login' : 'Set Login'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-3xl mb-2">◉</p>
          <p className="text-ink-500 font-medium">No agents yet</p>
        </div>
      )}

      {/* Add Agent Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Add Agent</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="08012345678" /></div>
              <div><label className="label">Username</label>
                <input className="input" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g, '_')}))} placeholder="e.g. emeka_abia" />
                <p className="text-xs text-ink-400 mt-1">Lowercase, no spaces. Used to log in.</p>
              </div>
              <div>
                <label className="label">States Covered ({form.states_covered.length} selected)</label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 border border-surface-200 rounded-xl">
                  {NIGERIAN_STATES.map(s => (
                    <button key={s} type="button" onClick={() => toggleState(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${form.states_covered.includes(s) ? 'bg-brand-600 text-white' : 'bg-surface-100 text-ink-600 hover:bg-surface-200'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add Agent'}</button>
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
              <h3 className="font-semibold text-ink-900">Set Agent Login</h3>
              <button onClick={() => setCredModal(null)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-surface-50 rounded-xl p-3">
                <p className="text-sm font-semibold text-ink-900">{credModal.users?.full_name}</p>
                <p className="text-xs text-ink-400">{credModal.states_covered?.join(', ')}</p>
              </div>
              <div><label className="label">Username</label>
                <input className="input" value={credForm.username} onChange={e => setCredForm(f => ({...f, username: e.target.value.toLowerCase().replace(/\s/g, '_')}))} />
              </div>
              <div><label className="label">Password</label>
                <input type="password" className="input" value={credForm.password} onChange={e => setCredForm(f => ({...f, password: e.target.value}))} placeholder="Minimum 6 characters" />
              </div>
              <div><label className="label">Confirm Password</label>
                <input type="password" className="input" value={credForm.confirmPassword} onChange={e => setCredForm(f => ({...f, confirmPassword: e.target.value}))} />
              </div>
              {credError && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{credError}</p>}
              {credSuccess && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-xl">{credSuccess}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setCredModal(null)} className="btn-secondary flex-1">Close</button>
                <button onClick={setupCredentials} disabled={saving} className="btn-primary flex-1">{saving ? 'Setting up…' : 'Set Login'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}