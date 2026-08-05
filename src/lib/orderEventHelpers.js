import { supabase } from './supabase'

/**
 * Logs a single order timeline event. Never throws — a failed log write
 * should never block the actual business action that triggered it.
 */
export async function logEvent({ orderId, eventType, description, actorId, visibilityLevel = 'public', relatedEntityType = null, relatedEntityId = null }) {
  if (!orderId) return
  try {
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: eventType,
      description,
      actor_id: actorId || null,
      visibility_level: visibilityLevel,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
    })
  } catch (err) {
    console.error('Failed to log order event:', err)
  }
}

/**
 * Filters a list of order_events by what the viewing profile is allowed to see.
 * Owner -> everything. Non-scoped staff (managers/finance/etc) -> public + internal.
 * Scoped staff (CS Reps) and Agents -> public only.
 * Reuses the same role/scope signals already used for data-scope filtering
 * elsewhere in the app, rather than introducing a 4th permission concept.
 */
export function getVisibleEvents(events, profile) {
  if (!profile) return []
  if (profile.role === 'owner') return events

  const isScoped = profile.scope_own_records === true || profile.role === 'agent'
  if (isScoped) return events.filter(e => e.visibility_level === 'public')

  return events.filter(e => e.visibility_level === 'public' || e.visibility_level === 'internal')
}

export const EVENT_ICONS = {
  order_created: '🆕',
  order_edited: '✏️',
  order_confirmed: '✅',
  assigned_rep: '👤',
  sent_to_logistics: '📦',
  agent_assigned: '🚚',
  out_for_delivery: '🛵',
  delivered: '🎉',
  delivery_failed: '⚠️',
  order_cancelled: '❌',
  payment_received: '💰',
  commission_awarded: '🏆',
}