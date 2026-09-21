import { supabase } from './supabase'
import { logEvent } from './orderEventHelpers'
import { notify } from './notificationHelpers'
import { createMerchantTask, createLogisticsTask } from './taskHelpers'

/**
 * Fetches an order's CURRENT active follow-up schedule, if any. This is the
 * single source of truth for "what's currently scheduled" for an order —
 * distinct from Order Timeline, which is the full permanent history and is
 * never used to answer "what's active right now."
 *
 * Call this whenever a reschedule modal opens (to detect an existing
 * schedule and show who set it), and it is also called internally by
 * scheduleFollowUp() immediately before writing, as the concurrency check.
 */
export async function getCurrentSchedule(orderId) {
  if (!orderId) return null
  const { data, error } = await supabase
    .from('orders')
    .select('id, next_follow_up_date, next_follow_up_task_id, next_action_type, next_follow_up_set_by, next_follow_up_set_at, next_follow_up_reason, users!orders_next_follow_up_set_by_fkey(full_name)')
    .eq('id', orderId)
    .maybeSingle()
  if (error) { console.error('getCurrentSchedule error:', error); return null }
  return data
}

/**
 * THE single shared scheduling/reschedule action. Replaces four separate ad
 * hoc implementations (Merchant Orders, Royale Requests, Agent view, Royale
 * Follow-ups/Tasks page) that each independently wrote a Timeline event and
 * attempted to write a Task, with no shared notion of "is there already an
 * active schedule for this order, and does this action supersede it."
 *
 * Enforces the invariant: one order -> one current active schedule -> one
 * current active scheduling task. Order Timeline stays the full immutable
 * history; orders.next_follow_up_* + exactly one active (non-cancelled) task
 * represent current state.
 *
 * Callers MUST call getCurrentSchedule() when their modal opens and pass its
 * next_follow_up_set_at back as `expectedSetAt` — this is what makes the
 * concurrency check possible. If another surface changed the schedule between
 * when the caller's modal opened and this call, { conflict: true, current }
 * is returned and NOTHING is written — the caller should show the fresh
 * `current` schedule and let the user decide again, never silently overwrite.
 *
 * @param {string}  orderId
 * @param {string}  newDate         - date/datetime string for the new follow-up
 * @param {string}  reason          - free-text reason/notes, stored on the order and the new task
 * @param {string}  actionType      - e.g. 'Attempt Redelivery', 'Call Customer'
 * @param {string}  assignedTo      - user id the resulting task is assigned to
 * @param {'merchant'|'logistics'} scope - which side owns the resulting task
 * @param {string}  businessId      - merchant_id or logistics_id matching scope
 * @param {string}  actorId         - who is performing this action
 * @param {string}  actorName       - for the Timeline description
 * @param {string}  taskTitle       - full title for the new task
 * @param {string|null} expectedSetAt - next_follow_up_set_at last seen by the caller (null if none)
 * @param {string}  [priority='high']
 * @param {string}  [notifyRecipientId] - optional: who to notify (skipped if omitted)
 * @param {string}  [notifyBusinessId]  - business_id to notify against
 * @param {string}  [notifyMessage]     - optional custom message; a sensible default is used otherwise
 */
export async function scheduleFollowUp({
  orderId, newDate, reason, actionType, assignedTo, scope, businessId,
  actorId, actorName, taskTitle, expectedSetAt = null, priority = 'high',
  notifyRecipientId, notifyBusinessId, notifyMessage,
}) {
  if (!orderId || !newDate || !scope || !businessId) return { error: 'Missing required scheduling info' }

  // Concurrency check: re-fetch right before writing, compare to what the caller last saw
  const fresh = await getCurrentSchedule(orderId)
  if (!fresh) return { error: 'Could not load order' }

  const freshSetAt = fresh.next_follow_up_set_at || null
  if (freshSetAt !== expectedSetAt) {
    return { conflict: true, current: fresh }
  }

  // Supersede the previous active task, if one exists — never leave two active tasks competing
  if (fresh.next_follow_up_task_id) {
    await supabase.from('tasks').update({
      status: 'cancelled',
      outcome_notes: `Superseded — rescheduled to ${new Date(newDate).toLocaleDateString('en-NG')}`,
    }).eq('id', fresh.next_follow_up_task_id)
  }

  // Create the new task via the existing scoped helpers, not a duplicate insert
  const taskArgs = {
    orderId, assignedTo, title: taskTitle, notes: reason || null,
    dueDate: new Date(newDate).toISOString(), priority,
    nextActionType: actionType || null, origin: 'customer_reschedule', createdBy: actorId || null,
  }
  const newTask = scope === 'logistics'
    ? await createLogisticsTask({ ...taskArgs, logisticsId: businessId })
    : await createMerchantTask({ ...taskArgs, merchantId: businessId })

  if (!newTask?.id) return { error: 'Failed to create follow-up task' }

  // Update the one current-schedule pointer on the order — this is the fix
  const { error: orderError } = await supabase.from('orders').update({
    next_follow_up_date: new Date(newDate).toISOString(),
    next_follow_up_task_id: newTask.id,
    next_action_type: actionType || null,
    next_follow_up_set_by: actorId || null,
    next_follow_up_set_at: new Date().toISOString(),
    next_follow_up_reason: reason || null,
  }).eq('id', orderId)
  if (orderError) console.error('scheduleFollowUp order update error:', orderError)

  // One consistent Timeline event type, replacing the inconsistent reuse of
  // 'delivery_failed'/'order_confirmed' the four old implementations used
  await logEvent({
    orderId,
    eventType: 'follow_up_scheduled',
    description: `${actorName || 'Someone'} scheduled a follow-up for ${new Date(newDate).toLocaleDateString('en-NG')}${reason ? `: ${reason}` : ''}`,
    actorId,
    visibilityLevel: 'public',
  })

  if (notifyRecipientId) {
    await notify({
      recipientId: notifyRecipientId,
      businessId: notifyBusinessId,
      type: 'delivery_update',
      title: 'Follow-up scheduled',
      message: notifyMessage || `A follow-up was scheduled for ${new Date(newDate).toLocaleDateString('en-NG')}.`,
      referenceId: orderId,
      referenceType: 'order',
    })
  }

  return { success: true, taskId: newTask.id }
}