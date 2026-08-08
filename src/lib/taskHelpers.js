import { supabase } from './supabase'
import { notify } from './notificationHelpers'

export const TASK_OUTCOMES = {
  follow_up_delivered: [
    { value: 'customer_satisfied', label: '✅ Customer Satisfied' },
    { value: 'customer_has_complaint', label: '⚠ Customer Has Complaint' },
    { value: 'interested_in_another_product', label: '🛍 Interested In Another Product' },
    { value: 'customer_not_reachable', label: '📵 Customer Not Reachable' },
    { value: 'needs_another_follow_up', label: '🔁 Needs Another Follow-Up' },
    { value: 'escalate_to_manager', label: '🔺 Escalate To Manager' },
  ],
  follow_up_failed: [
    { value: 're_delivery_scheduled', label: '🚚 Re-delivery Scheduled' },
    { value: 'customer_ready_to_reorder', label: '🛒 Customer Ready To Reorder' },
    { value: 'customer_cancelled', label: '❌ Customer Cancelled' },
    { value: 'needs_another_follow_up', label: '🔁 Needs Another Follow-Up' },
    { value: 'escalate_to_manager', label: '🔺 Escalate To Manager' },
  ],
  manual: [
    { value: 'completed', label: '✅ Completed' },
    { value: 'needs_another_follow_up', label: '🔁 Needs Another Follow-Up' },
    { value: 'escalate_to_manager', label: '🔺 Escalate To Manager' },
  ],
}

// Outcomes that involve picking a specific future date, rather than a fixed +2 days
export const RESCHEDULE_OUTCOMES = ['needs_another_follow_up', 're_delivery_scheduled']

/**
 * Derives a task's live follow-up status from due_date + status, rather than
 * storing a redundant field that could drift. Same principle as Order Timeline
 * not storing a separate "visibility" computed state.
 */
export function deriveTaskStatus(task) {
  if (task.status === 'completed') return 'completed'
  if (task.status === 'cancelled') return 'cancelled'
  if (!task.due_date) return 'upcoming'

  const due = new Date(task.due_date)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const startOfDayAfter = new Date(startOfTomorrow); startOfDayAfter.setDate(startOfDayAfter.getDate() + 1)

  if (due < startOfToday) return 'overdue'
  if (due < startOfTomorrow) return 'due_today'
  if (due < startOfDayAfter) return 'due_tomorrow'
  return 'upcoming'
}

export const FOLLOW_UP_STATUS_LABELS = {
  overdue: 'Overdue',
  due_today: 'Due Today',
  due_tomorrow: 'Due Tomorrow',
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const FOLLOW_UP_STATUS_STYLES = {
  overdue: 'bg-red-50 text-red-700',
  due_today: 'bg-amber-50 text-amber-700',
  due_tomorrow: 'bg-blue-50 text-blue-700',
  upcoming: 'bg-gray-50 text-gray-500',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

export async function createFollowUpTask(order, status, merchantId) {
  if (!order || !merchantId) return

  const isDelivered = status === 'delivered'
  const isFailed = status === 'failed'
  if (!isDelivered && !isFailed) return

  const customerName = order.customers?.full_name || 'Customer'
  const type = isDelivered ? 'follow_up_delivered' : 'follow_up_failed'

  const title = isDelivered
    ? `Customer Success Follow-Up — ${customerName}`
    : `Delivery Recovery — ${customerName}`

  const notes = isDelivered
    ? `Confirm satisfaction, gather feedback, and explore upsell or repeat purchase opportunity.`
    : `Understand failure reason, attempt re-delivery, and recover lost revenue.`

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (isDelivered ? 2 : 1))

  const { error } = await supabase.from('tasks').insert({
    merchant_id: merchantId,
    order_id: order.id,
    assigned_to: order.assigned_cs_rep || null,
    type,
    title,
    notes,
    status: 'pending',
    priority: isFailed ? 'high' : 'normal',
    due_date: dueDate.toISOString(),
    origin: isFailed ? 'delivery_failure' : 'workflow',
    next_action_type: isDelivered ? 'Call Customer' : 'Attempt Redelivery',
    reminder_offset_hours: 24,
  })

  if (error) console.error('Task creation error:', error)
}

/**
 * Creates a task on the logistics (Royale) side — e.g. when a customer
 * requests a delivery reschedule during an attempt. Mirrors createFollowUpTask's
 * shape but scoped by logistics_id instead of merchant_id.
 */
export async function createLogisticsTask({ logisticsId, orderId, assignedTo, title, notes, dueDate, priority = 'normal', nextActionType, origin = 'customer_reschedule', createdBy }) {
  if (!logisticsId || !title) return
  const { error } = await supabase.from('tasks').insert({
    logistics_id: logisticsId,
    order_id: orderId || null,
    assigned_to: assignedTo || null,
    created_by: createdBy || null,
    type: 'manual',
    title,
    notes: notes || null,
    status: 'pending',
    priority,
    due_date: dueDate,
    origin,
    next_action_type: nextActionType || null,
    reminder_offset_hours: 24,
  })
  if (error) console.error('Logistics task creation error:', error)
}

export async function completeTaskWithOutcome({ taskId, outcome, outcomeNotes, nextAction, completedBy, task, profile, rescheduleDate }) {
  const updates = {
    outcome,
    outcome_notes: outcomeNotes,
    next_action: nextAction,
    completed_by: completedBy,
    completed_at: new Date().toISOString(),
  }

  if (outcome === 'escalate_to_manager') {
    const { data: manager } = await supabase
      .from('users')
      .select('id')
      .eq('business_id', profile.business_id)
      .in('role', ['owner', 'store_manager'])
      .single()

    updates.status = 'in_progress'
    updates.assigned_to = manager?.id || task.assigned_to
    updates.escalated_at = new Date().toISOString()
    updates.escalation_reason = outcomeNotes
    delete updates.completed_at
    delete updates.completed_by

    if (manager?.id) {
      await notify({
        recipientId: manager.id,
        businessId: profile.business_id,
        type: 'task_escalated',
        title: 'Task escalated to you',
        message: `"${task.title}" was escalated by ${profile.full_name}${outcomeNotes ? `: ${outcomeNotes}` : ''}`,
        referenceId: taskId,
        referenceType: 'task',
      })
    }
  } else if (RESCHEDULE_OUTCOMES.includes(outcome)) {
    updates.status = 'completed'
    // Use the explicit date the user picked; fall back to +2 days only if none given
    const followUpDate = rescheduleDate ? new Date(rescheduleDate) : new Date()
    if (!rescheduleDate) followUpDate.setDate(followUpDate.getDate() + 2)

    await supabase.from('tasks').insert({
      merchant_id: task.merchant_id || null,
      logistics_id: task.logistics_id || null,
      order_id: task.order_id,
      assigned_to: task.assigned_to,
      type: task.type,
      title: `Follow-Up: ${task.title}`,
      notes: `Previous outcome: ${outcomeNotes || 'No notes'}`,
      status: 'pending',
      priority: task.priority,
      due_date: followUpDate.toISOString(),
      origin: 'customer_reschedule',
      next_action_type: outcome === 're_delivery_scheduled' ? 'Attempt Redelivery' : 'Call Customer',
      reminder_offset_hours: 24,
    })
  } else if (outcome === 'customer_ready_to_reorder' || outcome === 'interested_in_another_product') {
    updates.status = 'completed'
  } else {
    updates.status = 'completed'
  }

  await supabase.from('tasks').update(updates).eq('id', taskId)
}