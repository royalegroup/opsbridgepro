import { supabase } from './supabase'

/**
 * Deducts stock from agent when a delivery is marked as delivered.
 * Fetches order items to know which products and quantities to deduct.
 */
export async function deductAgentStockOnDelivery(orderId, agentId) {
  if (!orderId || !agentId) return

  // Get all items in this order
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)

  if (error || !items || items.length === 0) {
    console.warn('No order items found for stock deduction:', orderId)
    return
  }

  // Deduct each product from agent stock
  for (const item of items) {
    const { data: stockRow } = await supabase
      .from('agent_stock')
      .select('id, quantity')
      .eq('agent_id', agentId)
      .eq('product_id', item.product_id)
      .single()

    if (stockRow) {
      const newQty = Math.max(0, stockRow.quantity - item.quantity)
      await supabase
        .from('agent_stock')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', stockRow.id)

      console.log(`Stock deducted: product ${item.product_id}, agent ${agentId}, qty -${item.quantity}, new qty: ${newQty}`)
    }
  }
}