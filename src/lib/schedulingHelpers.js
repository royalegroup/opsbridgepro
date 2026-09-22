import { supabase } from './supabase'
import { logEvent } from './orderEventHelpers'
import { notify } from './notificationHelpers'

/**
 * Moved here from taskHelpers.js so schedulingHelpers.js is self-contained
 * and taskHelpers.js can safely import scheduleFollowUp() below without a
 * circular import (taskHelpers.js -> schedulingHelpers.js -> taskHelpers.js
 * would otherwise exist). Nothing else in the app imports these two directly
 * — confirmed by grep before moving them — so this is a safe, contained move.
 */
export async function createMerchantTask({ merchantId, orderId, assignedTo, title, notes, dueDate, priority = 'normal', nextActionType, origin = 'customer_reschedule', createdBy }) {
  if (!merchantId || !title) return null
  const { data, error } = await supabase.from('tasks').insert({
    merchant_id: merchantId,
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
  }).select().single()
  if (error) { console.error('Merchant task creation error:', error); return null }
  return data
}

export async function createLogisticsTask({ logisticsId, orderId, assignedTo, title, notes, dueDate, priority = 'normal', nextActionType, origin = 'customer_reschedule', createdBy }) {
  if (!logisticsId || !title) return null
  const { data, error } = await supabase.from('tasks').insert({
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
  }).select().single()
  if (error) { console.error('Logistics task creation error:', error); return null }
  return data
}

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
 * @param {string}  [oldTaskId]         - explicit task to close, if it's not (or might not be) the
 *   order's current pointer task — e.g. the outcome-driven reschedule flow closes the SPECIFIC
 *   task the user just finished working, which may differ from (or simply not yet be) the order's
 *   registered pointer. If the pointer task is a different id, it is ALSO closed (as 'cancelled',
 *   never left dangling) — this one always gets `oldTaskDisposition`.
 * @param {'cancelled'|'completed'} [oldTaskDisposition='cancelled'] - how to close `oldTaskId`
 *   (or the pointer task, if `oldTaskId` is omitted). 'cancelled' = superseded, the behavior all
 *   four original surfaces use. 'completed' = the task genuinely reached an outcome — used by
 *   completeTaskWithOutcome() so the CS Rep's outcome record is preserved, not overwritten with
 *   a generic "superseded" note.
 * @param {object}  [oldTaskOutcomeFields] - required when oldTaskDisposition === 'completed';
 *   fields merged into the old task's update (e.g. { outcome, outcome_notes, next_action, completed_by })
 * @param {boolean} [autoRetryOnConflict=false] - for callers with no interactive "keep/change"
 *   dialog (currently only the outcome-driven flow): on a concurrency conflict, automatically
 *   retries once against the freshly-seen schedule instead of surfacing { conflict: true } —
 *   appropriate only when the caller's action is itself a deliberate, real scheduling decision
 *   (not a background write), same as if the user re-opened the modal and confirmed again.
 */
export async function scheduleFollowUp({
  orderId, newDate, reason, actionType, assignedTo, scope, businessId,
  actorId, actorName, taskTitle, expectedSetAt = null, priority = 'high',
  notifyRecipientId, notifyBusinessId, notifyMessage,
  oldTaskId = null, oldTaskDisposition = 'cancelled', oldTaskOutcomeFields = null,
  autoRetryOnConflict = false, _retriesLeft = 1,
}) {
  if (!orderId || !newDate || !scope || !businessId) return { error: 'Missing required scheduling info' }

  // Concurrency check: re-fetch right before writing, compare to what the caller last saw
  const fresh = await getCurrentSchedule(orderId)
  if (!fresh) return { error: 'Could not load order' }

  const freshSetAt = fresh.next_follow_up_set_at || null
  if (freshSetAt !== expectedSetAt) {
    if (autoRetryOnConflict && _retriesLeft > 0) {
      return scheduleFollowUp({
        orderId, newDate, reason, actionType, assignedTo, scope, businessId,
        actorId, actorName, taskTitle, expectedSetAt: freshSetAt, priority,
        notifyRecipientId, notifyBusinessId, notifyMessage,
        oldTaskId, oldTaskDisposition, oldTaskOutcomeFields,
        autoRetryOnConflict, _retriesLeft: _retriesLeft - 1,
      })
    }
    return { conflict: true, current: fresh }
  }

  // Close out whichever task(s) need closing — never leave two active tasks competing.
  // Usually this is one task (oldTaskId === the order's current pointer, or the pointer
  // is null on a first-time schedule). If a caller passes an oldTaskId that differs from
  // the order's actual current pointer, BOTH are closed: oldTaskId gets the disposition
  // the caller asked for, the stale pointer task (now truly superseded) gets 'cancelled'.
  const toClose = new Map()
  if (fresh.next_follow_up_task_id) toClose.set(fresh.next_follow_up_task_id, { disposition: 'cancelled' })
  if (oldTaskId) toClose.set(oldTaskId, { disposition: oldTaskDisposition, fields: oldTaskOutcomeFields })

  for (const [id, info] of toClose) {
    if (info.disposition === 'completed') {
      await supabase.from('tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...(info.fields || {}),
      }).eq('id', id)
    } else {
      await supabase.from('tasks').update({
        status: 'cancelled',
        outcome_notes: `Superseded — rescheduled to ${new Date(newDate).toLocaleDateString('en-NG')}`,
      }).eq('id', id)
    }
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