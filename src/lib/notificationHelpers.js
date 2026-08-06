import { supabase } from './supabase'

/**
 * Creates a notification for a specific recipient. Never throws — a failed
 * notification write must never block the business action that triggered it.
 */
export async function notify({ recipientId, businessId, type, title, message, referenceId = null, referenceType = null }) {
  if (!recipientId) return
  try {
    await supabase.from('notifications').insert({
      recipient_id: recipientId,
      business_id: businessId || null,
      type,
      title,
      message,
      reference_id: referenceId,
      reference_type: referenceType,
      is_read: false,
    })
  } catch (err) {
    console.error('Failed to create notification:', err)
  }
}

/**
 * Fallback recipient for business-level alerts where no specific staff
 * member is the obvious target (e.g. a merchant-side overdue-COD alert
 * aimed at "Royale" generally, not one named person).
 */
export async function getBusinessOwnerId(businessId) {
  if (!businessId) return null
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('business_id', businessId)
    .eq('role', 'owner')
    .maybeSingle()
  return data?.id || null
}