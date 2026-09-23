import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { TASK_OUTCOMES, completeTaskWithOutcome, RESCHEDULE_OUTCOMES, deriveTaskStatus, FOLLOW_UP_STATUS_LABELS, FOLLOW_UP_STATUS_STYLES } from '../../lib/taskHelpers'

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
  follow_up_delivered: '✅ Customer Success Follow-Up',
  follow_up_failed: '❌ Delivery Recovery',
  manual: '📝 Manual Task',
}
const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'due_today', label: 'Due Today' },
  { key: 'due_tomorrow', label: 'Due Tomorrow' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]

export default function TasksPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [csReps, setCsReps] = useState([])
  const [filter, setFilter] = useState('pending')
  const [showForm, setShowForm] = useState(false)
  const [outcomeModal, setOutcomeModal] = useState(null)
  const [reorderModal, setReorderModal] = useState(null)
  const [outcomeForm, setOutcomeForm] = useState({ outcome: '', notes: '', nextAction: '', rescheduleDate: '' })
  const [manualForm, setManualForm] = useState({ title: '', notes: '', assigned_to: '', priority: 'normal', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const isScoped = profile?.scope_own_records === true && profile?.role !== 'owner'
  // Scoped staff shouldn't be able to self-assign new tasks — only owners/managers create tasks
  const canCreate = !isScoped

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    let taskQuery = supabase.from('tasks')
      .select('*, users!tasks_assigned_to_fkey(full_name), completed_user:users!tasks_completed_by_fkey(full_name), orders!tasks_order_id_fkey(id, delivery_state, customers(full_name, phone), order_items(product_id, bundle_id, quantity, unit_selling_price, unit_cost_price, unit_delivery_fee, products(name)))')
      .eq('merchant_id', bid)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (isScoped) taskQuery = taskQuery.eq('assigned_to', profile.id)

    const [tRes, rRes] = await Promise.all([
      taskQuery,
      supabase.from('users').select('id, full_name').eq('business_id', bid).in('role', ['cs_rep', 'store_manager', 'owner']),
    ])
    if (tRes.data) setTasks(tRes.data)
    if (rRes.data) setCsReps(rRes.data)
    setLoading(false)
  }

  async function handleOutcomeSubmit() {
    if (!outcomeForm.outcome || !outcomeModal) return
    setSaving(true)
    await completeTaskWithOutcome({
      taskId: outcomeModal.id, outcome: outcomeForm.outcome, outcomeNotes: outcomeForm.notes,
      nextAction: outcomeForm.nextAction, completedBy: profile.id, task: outcomeModal, profile,
      rescheduleDate: outcomeForm.rescheduleDate || null,
    })
    if (outcomeForm.outcome === 'customer_ready_to_reorder' || outcomeForm.outcome === 'interested_in_another_product') {
      setReorderModal(outcomeModal)
    }
    setOutcomeModal(null)
    setOutcomeForm({ outcome: '', notes: '', nextAction: '', rescheduleDate: '' })
    load()
    setSaving(false)
  }

  async function handleReorder(task) {
    const order = task.orders
    if (!order) return
    setSaving(true)
    const items = order.order_items || []
    const totalAmount = items.reduce((s, i) => s + (i.products?.selling_price || 0) * i.quantity, 0)
    const totalFee = items.reduce((s, i) => s + (i.products?.delivery_fee || 0), 0)

    const { data: newOrder } = await supabase.from('orders').insert({
      merchant_id: profile.business_id, customer_id: order.customers?.id, delivery_state: order.delivery_state,
      source: 'follow_up', status: 'new', total_amount: totalAmount, total_delivery_fee: totalFee,
      notes: `Reorder from task follow-up`, assigned_cs_rep: isScoped ? profile.id : task.assigned_to,
    }).select().single()

    if (newOrder && items.length > 0) {
      // Duplicate each original line's own snapshot (unit_selling_price/unit_cost_price/
      // unit_delivery_fee/quantity) rather than recomputing anything from current product
      // or bundle state — a reorder replays what was actually sold, not today's prices.
      // product_id/bundle_id are copied as a pair directly from the original row, so
      // whichever one was set there is the only one set here too — the XOR constraint
      // is satisfied automatically, without re-deriving which type the line is.
      await supabase.from('order_items').insert(
        items.map(i => ({
          order_id: newOrder.id,
          product_id: i.product_id || null,
          bundle_id: i.bundle_id || null,
          quantity: i.quantity,
          unit_selling_price: i.unit_selling_price,
          unit_cost_price: i.unit_cost_price,
          unit_delivery_fee: i.unit_delivery_fee,
        }))
      )
    }
    setReorderModal(null)
    alert(`New order created for ${order.customers?.full_name}! Go to Orders to confirm.`)
    load()
    setSaving(false)
  }

  async function updateTaskStatus(taskId, status) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    load()
  }

  async function reassign(taskId, userId) {
    await supabase.from('tasks').update({ assigned_to: userId }).eq('id', taskId)
    load()
  }

  async function saveManualTask() {
    if (!manualForm.title) return
    setSaving(true)
    await supabase.from('tasks').insert({
      merchant_id: profile.business_id, type: 'manual', title: manualForm.title, notes: manualForm.notes,
      assigned_to: manualForm.assigned_to || null, priority: manualForm.priority,
      due_date: manualForm.due_date ? new Date(manualForm.due_date).toISOString() : null,
      created_by: profile.id, status: 'pending',
    })
    setShowForm(false)
    setManualForm({ title: '', notes: '', assigned_to: '', priority: 'normal', due_date: '' })
    load()
    setSaving(false)
  }

  const isEscalated = t => !!t.escalated_at && t.status !== 'completed'

  const filtered = tasks.filter(t => {
    if (filter === 'escalated') return isEscalated(t)
    if (filter === 'all') return true
    if (['due_today', 'due_tomorrow', 'overdue'].includes(filter)) return deriveTaskStatus(t) === filter
    return t.status === filter
  })

  const dueTodayCount = tasks.filter(t => deriveTaskStatus(t) === 'due_today').length
  const dueTomorrowCount = tasks.filter(t => deriveTaskStatus(t) === 'due_tomorrow').length
  const overdueCount = tasks.filter(t => deriveTaskStatus(t) === 'overdue').length
  const escalatedCount = tasks.filter(t => isEscalated(t)).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="text-ink-400 text-sm mt-0.5">
            {tasks.filter(t => t.status === 'pending').length} pending {isScoped ? '(assigned to you)' : ''}
            {overdueCount > 0 && <span className="text-danger ml-2">· {overdueCount} overdue</span>}
            {escalatedCount > 0 && <span className="text-orange-500 ml-2">· {escalatedCount} escalated</span>}
          </p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary">+ New Task</button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Due Today', count: dueTodayCount, color: 'text-amber-600' },
          { label: 'Due Tomorrow', count: dueTomorrowCount, color: 'text-blue-600' },
          { label: 'Overdue', count: overdueCount, color: 'text-red-600' },
          { label: 'Escalated', count: escalatedCount, color: 'text-orange-500' },
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
          if (f.key === 'all') count = tasks.length
          else if (f.key === 'escalated') count = escalatedCount
          else if (f.key === 'due_today') count = dueTodayCount
          else if (f.key === 'due_tomorrow') count = dueTomorrowCount
          else if (f.key === 'overdue') count = overdueCount
          else count = tasks.filter(t => t.status === f.key).length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f.key ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
              {f.label}
              <span className="ml-1.5 opacity-70">{count}</span>
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
            <p className="text-ink-500 font-medium">No {filter === 'all' ? '' : filter} tasks</p>
            <p className="text-sm text-ink-400 mt-1">Tasks are auto-created when orders are delivered or failed.</p>
          </div>
        ) : filtered.map(task => {
          const followUpStatus = deriveTaskStatus(task)
          return (
          <div key={task.id} className={`card border ${isEscalated(task) ? 'border-orange-200 bg-orange-50/20' : followUpStatus === 'overdue' ? 'border-red-200 bg-red-50/20' : 'border-surface-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs text-ink-400">{TYPE_LABELS[task.type]}</span>
                  <span className={`badge border text-xs ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                  {isEscalated(task) && <span className="badge bg-orange-100 text-orange-700">Escalated</span>}
                  {['overdue', 'due_today', 'due_tomorrow'].includes(followUpStatus) && (
                    <span className={`badge ${FOLLOW_UP_STATUS_STYLES[followUpStatus]}`}>{FOLLOW_UP_STATUS_LABELS[followUpStatus]}</span>
                  )}
                </div>
                <p className="font-semibold text-ink-900 text-sm">{task.title}</p>
                {task.notes && <p className="text-xs text-ink-500 mt-1">{task.notes}</p>}
                {task.orders?.customers && (
                  <div className="mt-2 px-3 py-2 bg-surface-50 rounded-xl">
                    <p className="text-xs text-ink-500">
                      Customer: <span className="font-medium text-ink-700">{task.orders.customers.full_name}</span>
                      {task.orders.customers.phone && (<a href={`tel:${task.orders.customers.phone}`} className="ml-2 text-brand-600 underline">{task.orders.customers.phone}</a>)}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">State: {task.orders.delivery_state}</p>
                    {task.orders.order_items?.length > 0 && (
                      <p className="text-xs text-ink-400 mt-0.5">Products: {task.orders.order_items.map(i => `${i.products?.name} x${i.quantity}`).join(', ')}</p>
                    )}
                  </div>
                )}
                {task.outcome && (
                  <div className="mt-2 px-3 py-2 bg-green-50 rounded-xl border border-green-100">
                    <p className="text-xs font-semibold text-green-700">Outcome: {TASK_OUTCOMES[task.type]?.find(o => o.value === task.outcome)?.label || task.outcome}</p>
                    {task.outcome_notes && <p className="text-xs text-green-600 mt-0.5">{task.outcome_notes}</p>}
                    {task.next_action && <p className="text-xs text-green-600 mt-0.5">Next: {task.next_action}</p>}
                    {task.completed_user && <p className="text-xs text-ink-400 mt-1">By: {task.completed_user.full_name} · {task.completed_at ? new Date(task.completed_at).toLocaleDateString('en-NG') : ''}</p>}
                  </div>
                )}
                {task.escalation_reason && (
                  <div className="mt-2 px-3 py-2 bg-orange-50 rounded-xl border border-orange-100">
                    <p className="text-xs font-semibold text-orange-700">Escalation Reason:</p>
                    <p className="text-xs text-orange-600 mt-0.5">{task.escalation_reason}</p>
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
                <button onClick={() => { setOutcomeModal(task); setOutcomeForm({ outcome: '', notes: '', nextAction: '', rescheduleDate: '' }) }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">Log Outcome</button>
                {task.status === 'pending' && (
                  <button onClick={() => updateTaskStatus(task.id, 'in_progress')} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">Start</button>
                )}
                <button onClick={() => updateTaskStatus(task.id, 'cancelled')} className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 font-medium hover:bg-gray-100">Cancel</button>
                {csReps.length > 0 && !isScoped && (
                  <select onChange={e => reassign(task.id, e.target.value)} value={task.assigned_to || ''}
                    className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white text-ink-700 ml-auto">
                    <option value="">Reassign…</option>
                    {csReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
          )
        })}
      </div>

      {outcomeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Log Task Outcome</h3>
              <button onClick={() => setOutcomeModal(null)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-surface-50 rounded-xl p-3">
                <p className="text-xs text-ink-400">{TYPE_LABELS[outcomeModal.type]}</p>
                <p className="text-sm font-semibold text-ink-900 mt-0.5">{outcomeModal.title}</p>
              </div>
              <div>
                <label className="label">Outcome</label>
                <div className="space-y-2">
                  {(TASK_OUTCOMES[outcomeModal.type] || TASK_OUTCOMES.manual).map(o => (
                    <button key={o.value} type="button" onClick={() => setOutcomeForm(f => ({ ...f, outcome: o.value }))}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${outcomeForm.outcome === o.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-surface-200 text-ink-700 hover:bg-surface-50'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {RESCHEDULE_OUTCOMES.includes(outcomeForm.outcome) && (
                <div className="bg-brand-50 border border-brand-100 rounded-xl p-3">
                  <label className="label">New Follow-Up Date <span className="text-ink-400 font-normal normal-case">(the date the customer actually asked for)</span></label>
                  <input type="date" className="input" min={new Date().toISOString().split('T')[0]}
                    value={outcomeForm.rescheduleDate} onChange={e => setOutcomeForm(f => ({ ...f, rescheduleDate: e.target.value }))} />
                  <p className="text-xs text-ink-400 mt-1">Leave blank to default to 2 days from now.</p>
                </div>
              )}
              <div>
                <label className="label">Notes <span className="text-ink-300 font-normal normal-case">(required)</span></label>
                <textarea className="input" rows={3} value={outcomeForm.notes} onChange={e => setOutcomeForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened during this follow-up? Be specific…" />
              </div>
              <div>
                <label className="label">Next Action <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
                <input className="input" value={outcomeForm.nextAction} onChange={e => setOutcomeForm(f => ({ ...f, nextAction: e.target.value }))} placeholder="What should happen next?" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setOutcomeModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleOutcomeSubmit} disabled={saving || !outcomeForm.outcome || !outcomeForm.notes} className="btn-primary flex-1">{saving ? 'Saving…' : 'Submit Outcome'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reorderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Create Reorder</h3>
            <div className="bg-surface-50 rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-ink-900">Customer: {reorderModal.orders?.customers?.full_name}</p>
              <p className="text-xs text-ink-500">Phone: {reorderModal.orders?.customers?.phone}</p>
              <p className="text-xs text-ink-500">State: {reorderModal.orders?.delivery_state}</p>
              {reorderModal.orders?.order_items?.map(i => (
                <p key={i.product_id} className="text-xs text-ink-500">{i.products?.name} x{i.quantity} — ₦{Number(i.products?.selling_price * i.quantity).toLocaleString()}</p>
              ))}
            </div>
            <p className="text-sm text-ink-500">This will create a new order pre-filled with the same customer and products. You can edit it before confirming.</p>
            <div className="flex gap-3">
              <button onClick={() => setReorderModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => handleReorder(reorderModal)} disabled={saving} className="btn-primary flex-1">{saving ? 'Creating…' : 'Create Order'}</button>
            </div>
          </div>
        </div>
      )}

      {showForm && canCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">New Task</h3>
              <button onClick={() => setShowForm(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input" value={manualForm.title} onChange={e => setManualForm(f => ({...f, title: e.target.value}))} placeholder="What needs to be done?" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={manualForm.notes} onChange={e => setManualForm(f => ({...f, notes: e.target.value}))} placeholder="Additional context…" />
              </div>
              <div>
                <label className="label">Assign To</label>
                <select className="input" value={manualForm.assigned_to} onChange={e => setManualForm(f => ({...f, assigned_to: e.target.value}))}>
                  <option value="">Select staff</option>
                  {csReps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={manualForm.priority} onChange={e => setManualForm(f => ({...f, priority: e.target.value}))}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={manualForm.due_date} onChange={e => setManualForm(f => ({...f, due_date: e.target.value}))} />
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