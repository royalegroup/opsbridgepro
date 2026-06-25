import { supabase } from './supabase'

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
  })

  if (error) console.error('Task creation error:', error)
}

export async function completeTaskWithOutcome({ taskId, outcome, outcomeNotes, nextAction, completedBy, task, profile }) {
  const updates = {
    outcome,
    outcome_notes: outcomeNotes,
    next_action: nextAction,
    completed_by: completedBy,
    completed_at: new Date().toISOString(),
  }

  // Handle special outcomes
  if (outcome === 'escalate_to_manager') {
    // Find manager in the business
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
  } else if (outcome === 'needs_another_follow_up') {
    updates.status = 'completed'
    // Create new follow-up task
    const followUpDate = new Date()
    followUpDate.setDate(followUpDate.getDate() + 2)
    await supabase.from('tasks').insert({
      merchant_id: task.merchant_id,
      order_id: task.order_id,
      assigned_to: task.assigned_to,
      type: task.type,
      title: `Follow-Up: ${task.title}`,
      notes: `Previous follow-up outcome: ${outcomeNotes || 'No notes'}`,
      status: 'pending',
      priority: task.priority,
      due_date: followUpDate.toISOString(),
    })
  } else if (outcome === 'customer_ready_to_reorder' || outcome === 'interested_in_another_product') {
    updates.status = 'completed'
    // Reorder will be handled in the UI
  } else {
    updates.status = 'completed'
  }

  await supabase.from('tasks').update(updates).eq('id', taskId)
}