import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { deriveTaskStatus, FOLLOW_UP_STATUS_LABELS, FOLLOW_UP_STATUS_STYLES } from '../../lib/taskHelpers'

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
const ORIGIN_LABELS = {
  manual: '📝 Manual',
  customer_reschedule: '🔁 Reschedule',
  delivery_failure: '❌ Delivery Failure',
  workflow: '⚙️ Workflow',
  automation: '🤖 Automation',
}
const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'due_today', label: 'Due Today' },
  { key: 'due_tomorrow', label: 'Due Tomorrow' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]

export default function RoyaleTasksPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [tRes, sRes] = await Promise.all([
      supabase.from('tasks')
        .select('*, users!tasks_assigned_to_fkey(full_name), orders(id, delivery_state, customers(full_name, phone))')
        .eq('logistics_id', bid)
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('users').select('id, full_name').eq('business_id', bid),
    ])
    if (tRes.data) setTasks(tRes.data)
    if (sRes.data) setStaff(sRes.data)
    setLoading(false)
  }

  async function updateStatus(taskId, status) {
    const update = { status }
    if (status === 'completed') update.completed_at = new Date().toISOString()
    await supabase.from('tasks').update(update).eq('id', taskId)
    load()
  }

  async function reassign(taskId, userId) {
    await supabase.from('tasks').update({ assigned_to: userId }).eq('id', taskId)
    load()
  }

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true
    if (['due_today', 'due_tomorrow', 'overdue'].includes(filter)) return deriveTaskStatus(t) === filter
    return t.status === filter
  })

  const dueTodayCount = tasks.filter(t => deriveTaskStatus(t) === 'due_today').length
  const dueTomorrowCount = tasks.filter(t => deriveTaskStatus(t) === 'due_tomorrow').length
  const overdueCount = tasks.filter(t => deriveTaskStatus(t) === 'overdue').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Follow-ups</h1>
        <p className="text-ink-400 text-sm mt-0.5">
          {tasks.filter(t => t.status === 'pending').length} pending
          {overdueCount > 0 && <span className="text-danger ml-2">· {overdueCount} overdue</span>}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Due Today', count: dueTodayCount, color: 'text-amber-600' },
          { label: 'Due Tomorrow', count: dueTomorrowCount, color: 'text-blue-600' },
          { label: 'Overdue', count: overdueCount, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="card text-center py-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-ink-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => {
          let count = tasks.length
          if (f.key === 'due_today') count = dueTodayCount
          else if (f.key === 'due_tomorrow') count = dueTomorrowCount
          else if (f.key === 'overdue') count = overdueCount
          else if (f.key !== 'all') count = tasks.filter(t => t.status === f.key).length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f.key ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
              {f.label}<span className="ml-1.5 opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-surface-100" />)
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-ink-500 font-medium">No {filter === 'all' ? '' : filter.replace('_', ' ')} follow-ups</p>
            <p className="text-sm text-ink-400 mt-1">Reschedules logged from Requests or the Agent view will appear here.</p>
          </div>
        ) : filtered.map(task => {
          const followUpStatus = deriveTaskStatus(task)
          return (
            <div key={task.id} className={`card border ${followUpStatus === 'overdue' ? 'border-red-200 bg-red-50/20' : 'border-surface-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-ink-400">{ORIGIN_LABELS[task.origin] || '📝'}</span>
                    <span className={`badge border text-xs ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                    {['overdue', 'due_today', 'due_tomorrow'].includes(followUpStatus) && (
                      <span className={`badge ${FOLLOW_UP_STATUS_STYLES[followUpStatus]}`}>{FOLLOW_UP_STATUS_LABELS[followUpStatus]}</span>
                    )}
                  </div>
                  <p className="font-semibold text-ink-900 text-sm">{task.title}</p>
                  {task.next_action_type && <p className="text-xs text-brand-600 mt-0.5">Next: {task.next_action_type}</p>}
                  {task.notes && <p className="text-xs text-ink-500 mt-1">{task.notes}</p>}
                  {task.orders?.customers && (
                    <div className="mt-2 px-3 py-2 bg-surface-50 rounded-xl">
                      <p className="text-xs text-ink-500">
                        Customer: <span className="font-medium text-ink-700">{task.orders.customers.full_name}</span>
                        {task.orders.customers.phone && (<a href={`tel:${task.orders.customers.phone}`} className="ml-2 text-brand-600 underline">{task.orders.customers.phone}</a>)}
                      </p>
                      <p className="text-xs text-ink-400 mt-0.5">State: {task.orders.delivery_state}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {task.due_date && (
                      <p className={`text-xs ${followUpStatus === 'overdue' ? 'text-danger font-medium' : 'text-ink-400'}`}>Due: {new Date(task.due_date).toLocaleDateString('en-NG')}</p>
                    )}
                    <p className="text-xs text-ink-400">Assigned: <span className="font-medium text-ink-600">{task.users?.full_name || 'Unassigned'}</span></p>
                  </div>
                </div>
                <span className={`badge flex-shrink-0 ${STATUS_STYLES[task.status]}`}>{task.status.replace('_', ' ')}</span>
              </div>
              {task.status !== 'completed' && task.status !== 'cancelled' && (
                <div className="flex gap-2 mt-4 flex-wrap items-center border-t border-surface-100 pt-3">
                  {task.status === 'pending' && (
                    <button onClick={() => updateStatus(task.id, 'in_progress')} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">Start</button>
                  )}
                  <button onClick={() => updateStatus(task.id, 'completed')} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">Mark Done ✓</button>
                  <button onClick={() => updateStatus(task.id, 'cancelled')} className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 font-medium hover:bg-gray-100">Cancel</button>
                  {staff.length > 0 && (
                    <select onChange={e => reassign(task.id, e.target.value)} value={task.assigned_to || ''}
                      className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white text-ink-700 ml-auto">
                      <option value="">Reassign…</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}