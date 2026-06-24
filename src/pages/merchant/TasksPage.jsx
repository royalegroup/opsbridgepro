import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const PRIORITY_STYLES = {
  high: 'bg-red-50 text-red-700 border-red-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
}

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const TYPE_LABELS = {
  follow_up_delivered: '✅ Post-delivery',
  follow_up_failed: '❌ Failed delivery',
  manual: '📝 Manual',
}

export default function TasksPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [csReps, setCsReps] = useState([])
  const [filter, setFilter] = useState('pending')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', notes: '', assigned_to: '', priority: 'normal', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [tRes, rRes] = await Promise.all([
      supabase.from('tasks')
        .select('*, users!tasks_assigned_to_fkey(full_name), orders(id, delivery_state, customers(full_name, phone))')
        .eq('merchant_id', bid)
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('users').select('id, full_name').eq('business_id', bid).in('role', ['cs_rep', 'store_manager', 'owner'])
    ])
    if (tRes.data) setTasks(tRes.data)
    if (rRes.data) setCsReps(rRes.data)
    setLoading(false)
  }

  async function updateTaskStatus(taskId, status) {
    const update = { status }
    if (status === 'completed') update.completed_at = new Date().toISOString()
    await supabase.from('tasks').update(update).eq('id', taskId)
    load()
  }

  async function reassign(taskId, userId) {
    await supabase.from('tasks').update({ assigned_to: userId }).eq('id', taskId)
    load()
  }

  async function saveManualTask() {
    if (!form.title) return
    setSaving(true)
    await supabase.from('tasks').insert({
      merchant_id: profile.business_id,
      type: 'manual',
      title: form.title,
      notes: form.notes,
      assigned_to: form.assigned_to || null,
      priority: form.priority,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      created_by: profile.id,
    })
    setShowForm(false)
    setForm({ title: '', notes: '', assigned_to: '', priority: 'normal', due_date: '' })
    load()
    setSaving(false)
  }

  const FILTERS = ['pending', 'in_progress', 'completed', 'all']
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'completed') return false
    return new Date(task.due_date) < new Date()
  }

  const overduCount = tasks.filter(t => isOverdue(t)).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="text-ink-400 text-sm mt-0.5">
            {tasks.filter(t => t.status === 'pending').length} pending
            {overduCount > 0 && <span className="text-danger ml-2">· {overduCount} overdue</span>}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ New Task</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending', count: tasks.filter(t => t.status === 'pending').length, color: 'bg-amber-50 text-amber-700' },
          { label: 'In Progress', count: tasks.filter(t => t.status === 'in_progress').length, color: 'bg-blue-50 text-blue-700' },
          { label: 'Completed', count: tasks.filter(t => t.status === 'completed').length, color: 'bg-green-50 text-green-700' },
          { label: 'Overdue', count: overduCount, color: 'bg-red-50 text-red-700' },
        ].map(s => (
          <div key={s.label} className="card text-center py-4">
            <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{s.count}</p>
            <p className="text-xs text-ink-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            <span className="ml-1.5 opacity-70">{f === 'all' ? tasks.length : tasks.filter(t => t.status === f).length}</span>
          </button>
        ))}
      </div>

      {/* Tasks list */}
      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-surface-100" />)
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-ink-500 font-medium">No {filter === 'all' ? '' : filter} tasks</p>
            <p className="text-sm text-ink-400 mt-1">Tasks are auto-created when orders are delivered or failed.</p>
          </div>
        ) : (
          filtered.map(task => (
            <div key={task.id} className={`card border ${isOverdue(task) ? 'border-red-200 bg-red-50/30' : 'border-surface-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-ink-400">{TYPE_LABELS[task.type]}</span>
                    <span className={`badge border ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                    {isOverdue(task) && <span className="badge bg-red-100 text-red-700">Overdue</span>}
                  </div>
                  <p className="font-semibold text-ink-900 text-sm">{task.title}</p>
                  {task.notes && <p className="text-xs text-ink-500 mt-1">{task.notes}</p>}

                  {/* Linked order */}
                  {task.orders && (
                    <div className="mt-2 px-3 py-2 bg-surface-50 rounded-xl">
                      <p className="text-xs text-ink-500">
                        Customer: <span className="font-medium text-ink-700">{task.orders.customers?.full_name}</span>
                        {task.orders.customers?.phone && (
                          <a href={`tel:${task.orders.customers.phone}`} className="ml-2 text-brand-600 underline">
                            {task.orders.customers.phone}
                          </a>
                        )}
                      </p>
                      <p className="text-xs text-ink-400 mt-0.5">State: {task.orders.delivery_state}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {task.due_date && (
                      <p className={`text-xs ${isOverdue(task) ? 'text-danger font-medium' : 'text-ink-400'}`}>
                        Due: {new Date(task.due_date).toLocaleDateString('en-NG')}
                      </p>
                    )}
                    <p className="text-xs text-ink-400">
                      Assigned: <span className="font-medium text-ink-600">{task.users?.full_name || 'Unassigned'}</span>
                    </p>
                  </div>
                </div>

                <span className={`badge flex-shrink-0 ${STATUS_STYLES[task.status]}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>

              {/* Actions */}
              {task.status !== 'completed' && task.status !== 'cancelled' && (
                <div className="flex gap-2 mt-4 flex-wrap items-center">
                  {task.status === 'pending' && (
                    <button onClick={() => updateTaskStatus(task.id, 'in_progress')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">
                      Start →
                    </button>
                  )}
                  {task.status === 'in_progress' && (
                    <button onClick={() => updateTaskStatus(task.id, 'completed')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">
                      Mark Done ✓
                    </button>
                  )}
                  {task.status === 'pending' && (
                    <button onClick={() => updateTaskStatus(task.id, 'completed')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">
                      Mark Done ✓
                    </button>
                  )}
                  <button onClick={() => updateTaskStatus(task.id, 'cancelled')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 font-medium hover:bg-gray-100">
                    Cancel
                  </button>

                  {/* Reassign */}
                  {csReps.length > 0 && (
                    <select
                      onChange={e => reassign(task.id, e.target.value)}
                      value={task.assigned_to || ''}
                      className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white text-ink-700 ml-auto">
                      <option value="">Reassign…</option>
                      {csReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Manual task form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">New Task</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="What needs to be done?" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Additional context…" />
              </div>
              <div>
                <label className="label">Assign To</label>
                <select className="input" value={form.assigned_to} onChange={e => setForm(f => ({...f, assigned_to: e.target.value}))}>
                  <option value="">Select staff</option>
                  {csReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveManualTask} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Create Task'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}