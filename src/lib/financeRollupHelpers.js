/**
 * Monthly Finance Rollup calculations.
 * Convention: all order-based figures (revenue, COGS, delivery fees, AOV, order count)
 * are bucketed by the order's created_at date, for internal consistency.
 * Expense figures are bucketed by expense_date. COD settlement figures use their own timestamps.
 */

export function monthKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
}

function inMonth(dateStr, key) {
  return dateStr && monthKey(dateStr) === key
}

export function computeMonthlyRollup({ monthKeyStr, orders, expenses, codRemittances, customers }) {
  const ordersInMonth = orders.filter(o => inMonth(o.created_at, monthKeyStr))
  const deliveredInMonth = ordersInMonth.filter(o => o.status === 'delivered')

  const revenue = deliveredInMonth.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const cogs = deliveredInMonth.reduce((s, o) =>
    s + (o.order_items || []).reduce((si, i) => si + Number(i.unit_cost_price || 0) * i.quantity, 0), 0)
  const grossProfit = revenue - cogs
  const deliveryFees = deliveredInMonth.reduce((s, o) => s + Number(o.total_delivery_fee || 0), 0)

  const expensesInMonth = expenses.filter(e => inMonth(e.expense_date, monthKeyStr))
  const totalExpenses = expensesInMonth.reduce((s, e) => s + Number(e.amount || 0), 0)
  const expenseByCategory = {}
  expensesInMonth.forEach(e => {
    const key = e.category === 'custom' ? (e.custom_category || 'Custom') : e.category
    expenseByCategory[key] = (expenseByCategory[key] || 0) + Number(e.amount || 0)
  })

  const netProfit = grossProfit - totalExpenses
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : null

  const codInMonth = codRemittances.filter(c => inMonth(c.created_at, monthKeyStr))
  const codSettled = codInMonth
    .filter(c => c.merchant_settlement_status === 'settled')
    .reduce((s, c) => s + Number(c.amount || 0), 0)
  const codPending = codInMonth
    .filter(c => c.merchant_settlement_status === 'pending' && c.agent_remittance_status === 'pending')
    .reduce((s, c) => s + Number(c.amount || 0), 0)
  // Outstanding receivables = ALL unsettled COD regardless of stage, as of now (not month-bound —
  // this is a live balance, like a receivables ledger, not a monthly flow figure)
  const outstandingReceivables = codRemittances
    .filter(c => c.merchant_settlement_status === 'pending')
    .reduce((s, c) => s + Number(c.amount || 0), 0)

  const newCustomers = customers.filter(c => inMonth(c.created_at, monthKeyStr)).length
  const aov = deliveredInMonth.length > 0 ? revenue / deliveredInMonth.length : null

  return {
    monthKeyStr,
    totalOrders: ordersInMonth.length,
    revenue, cogs, grossProfit, deliveryFees,
    totalExpenses, expenseByCategory,
    netProfit, profitMargin,
    codSettled, codPending, outstandingReceivables,
    newCustomers, aov,
    deliveredCount: deliveredInMonth.length,
  }
}

// Percentage change helper for MoM indicators
export function pctChange(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

// Builds last N months of {revenue, expenses, netProfit} for the trend chart
export function computeTrend(orders, expenses, monthsBack = 12) {
  const months = []
  const now = new Date()
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months.map(key => {
    const delivered = orders.filter(o => o.status === 'delivered' && inMonth(o.created_at, key))
    const revenue = delivered.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    const cogs = delivered.reduce((s, o) =>
      s + (o.order_items || []).reduce((si, i) => si + Number(i.unit_cost_price || 0) * i.quantity, 0), 0)
    const monthExpenses = expenses.filter(e => inMonth(e.expense_date, key)).reduce((s, e) => s + Number(e.amount || 0), 0)
    const netProfit = (revenue - cogs) - monthExpenses
    return { key, label: monthLabel(key), revenue, expenses: monthExpenses, netProfit }
  })
}

export function previousMonthKey(key) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}