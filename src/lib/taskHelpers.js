import { supabase } from './supabase'

export async function createFollowUpTask(order, status, merchantId) {
  console.log('createFollowUpTask called:', { order, status, merchantId })

  if (!order || !merchantId) {
    console.warn('Missing order or merchantId')
    return
  }

  const isDelivered = status === 'delivered'
  const isFailed = status === 'failed'
  if (!isDelivered && !isFailed) {
    console.warn('Status not delivered or failed:', status)
    return
  }

  const customerName = order.customers?.full_name || 'Customer'
  const type = isDelivered ? 'follow_up_delivered' : 'follow_up_failed'

  const title = isDelivered
    ? `Follow up with ${customerName} — check satisfaction & upsell`
    : `Re-engage ${customerName} — failed delivery`

  const notes = isDelivered
    ? `Order was successfully delivered. Follow up to confirm satisfaction and explore repeat purchase opportunity.`
    : `Delivery failed. Contact customer to understand reason and attempt re-delivery or cancellation.`

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (isDelivered ? 2 : 1))

  const priority = isFailed ? 'high' : 'normal'

  const payload = {
    merchant_id: merchantId,
    order_id: order.id,
    assigned_to: order.assigned_cs_rep || null,
    type,
    title,
    notes,
    status: 'pending',
    priority,
    due_date: dueDate.toISOString(),
  }

  console.log('Inserting task payload:', payload)

  const { data, error } = await supabase.from('tasks').insert(payload).select()

  console.log('Task insert result:', { data, error })
}