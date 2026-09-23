import { supabase } from './supabase'

/**
 * Deducts stock from agent when a delivery is marked as delivered.
 * Fetches order items to know which products and quantities to deduct.
 *
 * Bundle-aware: a bundle line (order_items.bundle_id set, product_id null) is
 * expanded into its real components via bundle_items before deduction — only
 * bundle_items rows with a product_id consume stock; custom items
 * (product_id null on bundle_items) are skipped, matching the existing bundle
 * model. Plain product-line behavior (product_id set, bundle_id null) is
 * completely unchanged from before.
 *
 * Every product's total deduction is aggregated across the whole order
 * BEFORE any write happens, so the same product appearing more than once
 * (in two different bundles, or as its own line as well as inside a bundle)
 * is summed once and deducted once — never overwritten by a later line.
 */
export async function deductAgentStockOnDelivery(orderId, agentId) {
  if (!orderId || !agentId) return

  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, bundle_id, quantity')
    .eq('order_id', orderId)

  if (error || !items || items.length === 0) {
    console.warn('No order items found for stock deduction:', orderId)
    return
  }

  const deductions = new Map() // product_id -> total quantity to deduct
  const addDeduction = (productId, qty) => {
    if (!productId || !qty) return
    deductions.set(productId, (deductions.get(productId) || 0) + qty)
  }

  const bundleIds = items.filter(i => i.bundle_id).map(i => i.bundle_id)
  let bundleItemsByBundle = {}
  if (bundleIds.length > 0) {
    const { data: bundleItems, error: bundleErr } = await supabase
      .from('bundle_items')
      .select('bundle_id, product_id, quantity')
      .in('bundle_id', bundleIds)

    if (bundleErr) {
      console.error('deductAgentStockOnDelivery: bundle_items lookup error', bundleErr)
    } else {
      bundleItemsByBundle = (bundleItems || []).reduce((acc, bi) => {
        (acc[bi.bundle_id] ||= []).push(bi)
        return acc
      }, {})
    }
  }

  for (const item of items) {
    if (item.product_id) {
      // Plain product line — unchanged behavior
      addDeduction(item.product_id, item.quantity)
    } else if (item.bundle_id) {
      const components = bundleItemsByBundle[item.bundle_id] || []
      for (const comp of components) {
        if (!comp.product_id) continue // custom bundle item — not real stock, no deduction
        addDeduction(comp.product_id, comp.quantity * item.quantity)
      }
    }
  }

  for (const [productId, qty] of deductions) {
    // maybeSingle() — an agent may not have a stock row for this product yet,
    // which is a normal case (not an error), so treat "not found" as null
    const { data: stockRow, error: stockErr } = await supabase
      .from('agent_stock')
      .select('id, quantity')
      .eq('agent_id', agentId)
      .eq('product_id', productId)
      .maybeSingle()

    if (stockErr) { console.error('deductAgentStockOnDelivery: lookup error', stockErr); continue }

    if (stockRow) {
      const newQty = Math.max(0, stockRow.quantity - qty)
      await supabase
        .from('agent_stock')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', stockRow.id)

      console.log(`Stock deducted: product ${productId}, agent ${agentId}, qty -${qty}, new qty: ${newQty}`)
    } else {
      console.warn(`No agent_stock row for agent ${agentId}, product ${productId} — nothing to deduct`)
    }
  }
}