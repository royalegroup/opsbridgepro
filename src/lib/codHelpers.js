import { supabase } from './supabase'

/**
 * Auto-creates COD record when order is delivered
 * Sets 24hr due time for agent remittance
 */
export async function createCODRecord(orderId, agentId, logisticsId, merchantId, amount) {
  if (!orderId || !agentId || !amount) return

  // Check if COD record already exists — maybeSingle() so a "no rows yet"
  // result (the normal, first-time case) returns null instead of a 406 error
  const { data: existing, error: checkErr } = await supabase
    .from('cod_remittances')
    .select('id')
    .eq('logistics_request_id', orderId)
    .maybeSingle()

  if (checkErr) { console.error('createCODRecord: check error', checkErr); return }
  if (existing) return

  const dueAt = new Date()
  dueAt.setHours(dueAt.getHours() + 24)

  const { error } = await supabase.from('cod_remittances').insert({
    logistics_request_id: orderId,
    agent_id: agentId,
    logistics_id: logisticsId,
    merchant_id: merchantId,
    amount,
    agent_remittance_status: 'pending',
    merchant_settlement_status: 'pending',
    due_at: dueAt.toISOString(),
  })

  if (error) console.error('COD creation error:', error)
}