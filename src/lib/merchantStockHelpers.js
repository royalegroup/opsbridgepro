import { supabase } from './supabase'

/**
 * Records stock received into merchant inventory (from supplier/production/adjustment/return).
 * Increments the running merchant_stock balance for that product.
 */
export async function recordStockIn({ merchantId, productId, quantity, source, reference, notes, recordedBy }) {
  await supabase.from('merchant_stock_receipts').insert({
    merchant_id: merchantId,
    product_id: productId,
    quantity,
    source,
    reference: reference || null,
    notes: notes || null,
    recorded_by: recordedBy,
  })

  const { data: existing } = await supabase
    .from('merchant_stock')
    .select('id, quantity')
    .eq('merchant_id', merchantId)
    .eq('product_id', productId)
    .maybeSingle()

  if (existing) {
    await supabase.from('merchant_stock')
      .update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase.from('merchant_stock').insert({
      merchant_id: merchantId,
      product_id: productId,
      quantity,
    })
  }
}

/**
 * Deducts from merchant_stock when dispatching to logistics.
 * Returns { ok: false, available } if there isn't enough stock — caller should
 * block the dispatch and show the available amount rather than allow over-dispatch.
 */
export async function deductMerchantStockOnDispatch(merchantId, productId, quantity) {
  const { data: row } = await supabase
    .from('merchant_stock')
    .select('id, quantity')
    .eq('merchant_id', merchantId)
    .eq('product_id', productId)
    .maybeSingle()

  const available = row?.quantity || 0
  if (available < quantity) {
    return { ok: false, available }
  }

  await supabase.from('merchant_stock')
    .update({ quantity: available - quantity, updated_at: new Date().toISOString() })
    .eq('id', row.id)

  return { ok: true, available: available - quantity }
}