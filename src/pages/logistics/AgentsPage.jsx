import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

export default function AgentsPage() {
  const { profile } = useAuth()
  const [agents, setAgents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', states_covered: [] })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('agents').select('*, users(full_name, email, phone), agent_stock(quantity, products(name))').eq('logistics_id', profile.business_id)
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
    if (!form.full_name || !form.email || form.states_covered.length === 0) return
    setSaving(true)
    // Create auth user (in real deployment, use admin API or invite flow)
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: form.email, password: 'TempPass123!', options: { data: { full_name: form.full_name } } })
    if (!authError && authData.user) {
      const { data: userData } = await supabase.from('users').insert({ auth_id: authData.user.id, full_name: form.full_name, email: form.email, phone: form.phone, role: 'agent', business_id: profile.business_id, business_type: 'logistics' }).select().single()
      if (userData) await supabase.from('agents').insert({ user_id: userData.id, logistics_id: profile.business_id, states_covered: form.states_covered })
    }
    setShowForm(false)
    setForm({ full_name: '', email: '', phone: '', states_covered: [] })
    load()
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="text-ink-400 text-sm mt-0.5">{agents.filter(a => a.is_active).length} active agents across Nigeria</p>
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
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-3xl mb-2">◉</p>
          <p className="text-ink-500 font-medium">No agents yet</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Add Agent</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} /></div>
              <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} /></div>
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
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Add Agent'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
