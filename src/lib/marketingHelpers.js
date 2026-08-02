/**
 * Marketing analytics helpers.
 * All calculations run client-side against already-fetched orders/expenses —
 * no extra network round-trips per campaign.
 */

// Does this order match a campaign's attribution rules (product/source/date range)?
function orderMatchesCampaign(order, campaign) {
  // Date range check (only applied if the campaign has dates set)
  if (campaign.start_date && new Date(order.created_at) < new Date(campaign.start_date)) return false
  if (campaign.end_date) {
    const end = new Date(campaign.end_date)
    end.setHours(23, 59, 59, 999)
    if (new Date(order.created_at) > end) return false
  }
  // Source check
  if (campaign.order_source && order.source !== campaign.order_source) return false
  // Product check — order must contain this product in its items
  if (campaign.product_id) {
    const hasProduct = (order.order_items || []).some(i => i.product_id === campaign.product_id)
    if (!hasProduct) return false
  }
  return true
}

// A campaign is "attributable" (can compute real ROAS) only if it has
// a product and/or order source set. Otherwise it's spend-only tracking.
export function isAttributable(campaign) {
  return !!(campaign.product_id || campaign.order_source)
}

/**
 * Computes full metrics for one campaign against a pre-fetched orders list.
 * orders: array of { id, source, created_at, status, total_amount, customer_id, order_items: [{product_id, quantity, unit_cost_price, unit_selling_price}] }
 * spend: total amount already logged in Expenses for this campaign
 */
export function computeCampaignMetrics(campaign, orders, spend) {
  const attributable = isAttributable(campaign)

  if (!attributable) {
    return {
      attributable: false,
      spend,
      revenue: null,
      grossProfit: null,
      netProfit: null,
      roas: null,
      cac: null,
      ordersCount: null,
      deliveredCount: null,
    }
  }

  const matched = orders.filter(o => orderMatchesCampaign(o, campaign))
  const revenue = matched.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const cost = matched.reduce((s, o) =>
    s + (o.order_items || []).reduce((si, i) => si + Number(i.unit_cost_price || 0) * i.quantity, 0), 0)
  const grossProfit = revenue - cost
  const netProfit = grossProfit - spend
  const roas = spend > 0 ? revenue / spend : null
  const uniqueCustomers = new Set(matched.map(o => o.customer_id).filter(Boolean)).size
  const cac = uniqueCustomers > 0 ? spend / uniqueCustomers : null
  const deliveredCount = matched.filter(o => o.status === 'delivered').length

  return {
    attributable: true,
    spend,
    revenue,
    grossProfit,
    netProfit,
    roas,
    cac,
    ordersCount: matched.length,
    deliveredCount,
  }
}

/**
 * Blended totals across ALL campaigns for the overview cards.
 * Only attributable campaigns contribute to revenue/profit/ROAS;
 * spend is summed across everything regardless of attribution.
 */
export function computeOverallMetrics(campaignMetrics) {
  const totalSpend = campaignMetrics.reduce((s, m) => s + Number(m.spend || 0), 0)
  const attributed = campaignMetrics.filter(m => m.attributable)
  const totalRevenue = attributed.reduce((s, m) => s + (m.revenue || 0), 0)
  const totalGrossProfit = attributed.reduce((s, m) => s + (m.grossProfit || 0), 0)
  const totalOrders = attributed.reduce((s, m) => s + (m.ordersCount || 0), 0)
  const attributedSpend = attributed.reduce((s, m) => s + Number(m.spend || 0), 0)
  const netProfitAfterAds = totalGrossProfit - attributedSpend
  const blendedRoas = attributedSpend > 0 ? totalRevenue / attributedSpend : null

  return { totalSpend, totalRevenue, totalGrossProfit, netProfitAfterAds, blendedRoas, totalOrders, attributedCampaignCount: attributed.length }
}