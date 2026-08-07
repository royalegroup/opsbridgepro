import { supabase } from './supabase'

async function findApplicableRule(businessId, role, staffId) {
  const { data: staffRule, error: staffErr } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('applies_to_user_id', staffId)
    .eq('is_active', true)
    .maybeSingle()
  if (staffErr) console.error('Commission rule lookup error (staff-specific):', staffErr)
  if (staffRule) return staffRule

  const { data: roleRule, error: roleErr } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('applies_to_role', role)
    .is('applies_to_user_id', null)
    .eq('is_active', true)
    .maybeSingle()
  if (roleErr) console.error('Commission rule lookup error (role-based):', roleErr)
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
 * Every failure path now logs to console so issues are diagnosable —
 * a previous version failed completely silently on insert errors.
 */
export async function awardOrderCommission({ businessId, staffId, role, department, order }) {
  if (!businessId || !staffId || !order?.id) {
    console.warn('awardOrderCommission: missing required arg(s)', { businessId, staffId, orderId: order?.id })
    return
  }

  const { data: existing, error: existingErr } = await supabase
    .from('rewards')
    .select('id')
    .eq('business_id', businessId)
    .eq('staff_id', staffId)
    .eq('related_order_id', order.id)
    .eq('reward_type', 'commission')
    .maybeSingle()

  if (existingErr) {
    console.error('awardOrderCommission: error checking for existing reward:', existingErr)
    return
  }
  if (existing) {
    console.log('awardOrderCommission: reward already exists for this order+staff, skipping', { orderId: order.id, staffId })
    return
  }

  const rule = await findApplicableRule(businessId, role, staffId)
  if (!rule) {
    console.warn('awardOrderCommission: no active commission rule matched', { businessId, role, staffId })
    return
  }

  const amount = computeAmount(rule, order)
  if (amount <= 0) {
    console.warn('awardOrderCommission: computed amount was 0 or less, skipping', { rule, order })
    return
  }

  const { error: insertErr } = await supabase.from('rewards').insert({
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

  if (insertErr) {
    console.error('awardOrderCommission: INSERT FAILED —', insertErr.message, insertErr)
  } else {
    console.log('awardOrderCommission: reward created successfully', { staffId, amount })
  }
}

export async function reverseCommission(rewardId, reason) {
  const { error } = await supabase.from('rewards').update({
    status: 'reversed',
    reversed_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', rewardId)
  if (error) console.error('reverseCommission failed:', error)
}