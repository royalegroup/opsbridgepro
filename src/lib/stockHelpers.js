import { supabase } from './supabase'

/**
 * Deducts stock from agent when a delivery is marked as delivered.
 * Fetches order items to know which products and quantities to deduct.
 */
export async function deductAgentStockOnDelivery(orderId, agentId) {
  if (!orderId || !agentId) return

  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)

  if (error || !items || items.length === 0) {
    console.warn('No order items found for stock deduction:', orderId)
    return
  }

  for (const item of items) {
    // maybeSingle() — an agent may not have a stock row for this product yet,
    // which is a normal case (not an error), so treat "not found" as null
    const { data: stockRow, error: stockErr } = await supabase
      .from('agent_stock')
      .select('id, quantity')
      .eq('agent_id', agentId)
      .eq('product_id', item.product_id)
      .maybeSingle()

    if (stockErr) { console.error('deductAgentStockOnDelivery: lookup error', stockErr); continue }

    if (stockRow) {
      const newQty = Math.max(0, stockRow.quantity - item.quantity)
      await supabase
        .from('agent_stock')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', stockRow.id)

      console.log(`Stock deducted: product ${item.product_id}, agent ${agentId}, qty -${item.quantity}, new qty: ${newQty}`)
    } else {
      console.warn(`No agent_stock row for agent ${agentId}, product ${item.product_id} — nothing to deduct`)
    }
  }
}