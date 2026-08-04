import { supabase } from './supabase'

/**
 * Finds the most specific active commission rule for a staff member.
 * Precedence: staff-specific override > role-based rule.
 * (Product-specific overrides are supported in the schema but not yet
 * surfaced in the Phase 2 UI — reserved for a later expansion.)
 */
async function findApplicableRule(businessId, role, staffId) {
  const { data: staffRule } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('applies_to_user_id', staffId)
    .eq('is_active', true)
    .maybeSingle()
  if (staffRule) return staffRule

  const { data: roleRule } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('applies_to_role', role)
    .is('applies_to_user_id', null)
    .eq('is_active', true)
    .maybeSingle()
  return roleRule || null
}

function computeAmount(rule, order) {
  if (rule.calculation_method === 'flat') return Number(rule.rate_amount || 0)

  if (rule.calculation_method === 'percent_order') {
    return (Number(order.total_amount || 0) * Number(rule.rate_percent || 0)) / 100
  }

  if (rule.calculation_method === 'percent_profit') {
    const cost = (order.order_items || []).reduce((s, i) => s + Number(i.unit_cost_price || 0) * i.quantity, 0)
    const profit = Number(order.total_amount || 0) - cost
    return (profit * Number(rule.rate_percent || 0)) / 100
  }
  return 0
}

/**
 * Awards commission for a delivered order to a given staff member.
 * Silently does nothing if no active rule matches — a missing rule
 * should never block or fail the actual delivery workflow.
 * Idempotent: won't double-award if this order/staff pair already has a commission row.
 */
export async function awardOrderCommission({ businessId, staffId, role, department, order }) {
  if (!businessId || !staffId || !order?.id) return

  // Avoid duplicate awards if delivery status gets touched more than once
  const { data: existing } = await supabase
    .from('rewards')
    .select('id')
    .eq('business_id', businessId)
    .eq('staff_id', staffId)
    .eq('related_order_id', order.id)
    .eq('reward_type', 'commission')
    .maybeSingle()
  if (existing) return

  const rule = await findApplicableRule(businessId, role, staffId)
  if (!rule) return

  const amount = computeAmount(rule, order)
  if (amount <= 0) return

  await supabase.from('rewards').insert({
    business_id: businessId,
    staff_id: staffId,
    department,
    role_snapshot: role,
    reward_type: 'commission',
    related_order_id: order.id,
    calculation_method: rule.calculation_method,
    rate_snapshot: rule.calculation_method === 'flat' ? rule.rate_amount : rule.rate_percent,
    amount_earned: amount,
    amount_paid: 0,
    status: 'earned',
  })
}

/**
 * Reverses a commission (e.g. order later refunded/returned).
 * Manual today; this is the exact call point Returns/Refunds will
 * trigger automatically once that feature exists — no redesign needed.
 */
export async function reverseCommission(rewardId, reason) {
  await supabase.from('rewards').update({
    status: 'reversed',
    reversed_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', rewardId)
}