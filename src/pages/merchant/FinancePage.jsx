import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'
import { computeMonthlyRollup, computeTrend, pctChange, monthKey, monthLabel, previousMonthKey } from '../../lib/financeRollupHelpers'
import { notify, getBusinessOwnerId } from '../../lib/notificationHelpers'

function fmtNaira(n) {
  if (n === null || n === undefined) return '—'
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function Delta({ value }) {
  if (value === null || value === undefined) return <span className="text-xs text-ink-300">No prior data</span>
  const up = value >= 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}% vs last month
    </span>
  )
}

// Lightweight dependency-free line chart for the 12-month trend
function TrendChart({ data }) {
  const width = 700, height = 220, padding = 32
  const allValues = data.flatMap(d => [d.revenue, d.expenses, d.netProfit])
  const max = Math.max(...allValues, 1)
  const min = Math.min(...allValues, 0)
  const range = max - min || 1

  const x = i => padding + (i / (data.length - 1)) * (width - padding * 2)
  const y = v => height - padding - ((v - min) / range) * (height - padding * 2)

  const line = key => data.map((d, i) => `${x(i)},${y(d[key])}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Zero line */}
      <line x1={padding} y1={y(0)} x2={width - padding} y2={y(0)} stroke="#e4e7f0" strokeWidth="1" />
      {/* Lines */}
      <polyline points={line('revenue')} fill="none" stroke="#4f52e5" strokeWidth="2" />
      <polyline points={line('expenses')} fill="none" stroke="#dc2626" strokeWidth="2" />
      <polyline points={line('netProfit')} fill="none" stroke="#16a34a" strokeWidth="2.5" />
      {/* Month labels (every other month to avoid crowding) */}
      {data.map((d, i) => (
        i % 2 === 0 && (
          <text key={d.key} x={x(i)} y={height - 6} fontSize="9" fill="#9ba3b8" textAnchor="middle">
            {d.label.split(' ')[0].slice(0, 3)}
          </text>
        )
      ))}
    </svg>
  )
}

export default function FinancePage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('cod')
  const [orders, setOrders] = useState([])
  const [expenses, setExpenses] = useState([])
  const [remittances, setRemittances] = useState([])
  const [customers, setCustomers] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()))
  const [detailModal, setDetailModal] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [rRes, oRes, eRes, cusRes] = await Promise.all([
      supabase.from('cod_remittances')
        .select('*, businesses!cod_remittances_logistics_id_fkey(name), agents(users(full_name)), logistics_requests(orders(customers(full_name)))')
        .eq('merchant_id', bid)
        .order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('id, status, total_amount, total_delivery_fee, created_at, customer_id, order_items(quantity, unit_cost_price, unit_selling_price, products(name))')
        .eq('merchant_id', bid),
      supabase.from('expenses').select('*').eq('merchant_id', bid),
      supabase.from('customers').select('id, created_at').eq('merchant_id', bid),
    ])
    if (rRes.data) setRemittances(rRes.data)
    if (oRes.data) setOrders(oRes.data)
    if (eRes.data) setExpenses(eRes.data)
    if (cusRes.data) setCustomers(cusRes.data)
    setLoading(false)
  }

  async function alertLogistics(remittance) {
    await supabase.from('cod_remittances').update({ overdue_alert_sent: true }).eq('id', remittance.id)
    const ownerId = await getBusinessOwnerId(remittance.logistics_id)
    if (ownerId) {
      await notify({
        recipientId: ownerId,
        businessId: remittance.logistics_id,
        type: 'cod_overdue',
        title: 'Overdue COD remittance ⚠',
        message: `₦${Number(remittance.amount).toLocaleString()} is overdue for settlement to a merchant.`,
        referenceId: remittance.id,
        referenceType: 'cod_remittance',
      })
    }
    load()
  }

  const isOverdue = r => r.due_at && new Date(r.due_at) < new Date() && r.merchant_settlement_status === 'pending'
  const pendingCOD = remittances.filter(r => r.merchant_settlement_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const settledCOD = remittances.filter(r => r.merchant_settlement_status === 'settled').reduce((s, r) => s + +r.amount, 0)
  const overdueCount = remittances.filter(r => isOverdue(r)).length
  const totalRevenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const totalCost = orders.filter(o => o.status === 'delivered').reduce((s, o) =>
    s + (o.order_items || []).reduce((si, i) => si + Number(i.unit_cost_price) * i.quantity, 0), 0)
  const totalProfit = totalRevenue - totalCost

  // ==== MONTHLY ROLLUP ====
  const rollup = computeMonthlyRollup({ monthKeyStr: selectedMonth, orders, expenses, codRemittances: remittances, customers })
  const prevRollup = computeMonthlyRollup({ monthKeyStr: previousMonthKey(selectedMonth), orders, expenses, codRemittances: remittances, customers })
  const trend = computeTrend(orders, expenses, 12)

  function shiftMonth(delta) {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Drill-down data per metric
  function openDetail(metric) {
    setDetailModal(metric)
  }

  const CATEGORY_LABELS = { ads: 'Ads & Marketing', waybill: 'Waybill & Shipping', staff: 'Staff & Salary', office: 'Office & Utilities', miscellaneous: 'Miscellaneous' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Finance</h1>
        {overdueCount > 0 && tab === 'cod' && (
          <p className="text-danger text-sm mt-0.5 font-medium">⚠ {overdueCount} overdue COD — funds not yet remitted</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-200">
        {[['cod', 'COD & Remittances'], ['rollup', 'Monthly Rollup']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${tab === key ? 'text-brand-600 border-brand-600' : 'text-ink-400 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'cod' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={fmtNaira(totalRevenue)} icon="◆" color="brand" />
            <StatCard label="Net Profit" value={fmtNaira(totalProfit)} icon="▣" color={totalProfit >= 0 ? 'success' : 'danger'} />
            <StatCard label="Pending COD" value={fmtNaira(pendingCOD)} icon="◎" color="warning" />
            <StatCard label="Settled COD" value={fmtNaira(settledCOD)} icon="◉" color="cod" />
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100"><h2 className="font-semibold text-ink-900">COD Remittances</h2></div>
            {remittances.length === 0 ? (
              <p className="text-ink-400 text-sm text-center py-8">No remittances recorded yet.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {remittances.map(r => (
                  <div key={r.id} className={`p-4 space-y-2 ${isOverdue(r) ? 'bg-red-50/30' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink-900">{fmtNaira(r.amount)}</p>
                        <p className="text-xs text-ink-400 mt-0.5">Via: <span className="font-medium text-ink-600">{r.businesses?.name}</span></p>
                        <p className="text-xs text-ink-400">Customer: {r.logistics_requests?.orders?.customers?.full_name}</p>
                        <p className="text-xs text-ink-400">{new Date(r.created_at).toLocaleDateString('en-NG')}</p>
                        {isOverdue(r) && <p className="text-xs text-danger font-medium mt-1">⚠ OVERDUE — funds not remitted</p>}
                        {r.agent_delay_reason && (
                          <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                            <p className="text-xs font-semibold text-amber-700">Delay Reason from Agent:</p>
                            <p className="text-xs text-amber-600">{r.agent_delay_reason}</p>
                          </div>
                        )}
                        {r.royale_batch_reference && <p className="text-xs text-green-600 mt-1">Ref: {r.royale_batch_reference}</p>}
                      </div>
                      <Badge status={r.merchant_settlement_status} />
                    </div>
                    {isOverdue(r) && !r.overdue_alert_sent && (
                      <button onClick={() => alertLogistics(r)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 w-full">Alert Royale Logistics ⚠</button>
                    )}
                    {r.overdue_alert_sent && r.merchant_settlement_status === 'pending' && (
                      <p className="text-xs text-amber-600 font-medium">Alert sent to logistics</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        // ==== MONTHLY ROLLUP TAB ====
        <div className="space-y-6">
          {/* Month selector */}
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-xl bg-white border border-surface-200 text-ink-600 hover:bg-surface-50">←</button>
            <p className="font-semibold text-ink-900 min-w-[180px] text-center">{monthLabel(selectedMonth)}</p>
            <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-xl bg-white border border-surface-200 text-ink-600 hover:bg-surface-50">→</button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-surface-100" />)}
            </div>
          ) : (
            <>
              {/* Core P&L metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button onClick={() => openDetail('revenue')} className="text-left">
                  <StatCard label="Revenue" value={fmtNaira(rollup.revenue)} icon="◆" color="brand" />
                  <div className="mt-1"><Delta value={pctChange(rollup.revenue, prevRollup.revenue)} /></div>
                </button>
                <div>
                  <StatCard label="Total Orders" value={rollup.totalOrders} icon="◎" color="brand" />
                  <div className="mt-1"><Delta value={pctChange(rollup.totalOrders, prevRollup.totalOrders)} /></div>
                </div>
                <div>
                  <StatCard label="COGS" value={fmtNaira(rollup.cogs)} icon="▣" color="warning" />
                </div>
                <div>
                  <StatCard label="Gross Profit" value={fmtNaira(rollup.grossProfit)} icon="◉" color={rollup.grossProfit >= 0 ? 'success' : 'danger'} />
                  <div className="mt-1"><Delta value={pctChange(rollup.grossProfit, prevRollup.grossProfit)} /></div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <StatCard label="Delivery Fees Collected" value={fmtNaira(rollup.deliveryFees)} icon="🚚" color="cod" />
                </div>
                <button onClick={() => openDetail('expenses')} className="text-left">
                  <StatCard label="Operating Expenses" value={fmtNaira(rollup.totalExpenses)} icon="💸" color="danger" />
                  <div className="mt-1"><Delta value={pctChange(-rollup.totalExpenses, -prevRollup.totalExpenses)} /></div>
                </button>
                <div>
                  <StatCard label="Net Profit" value={fmtNaira(rollup.netProfit)} icon="▣" color={rollup.netProfit >= 0 ? 'success' : 'danger'} />
                  <div className="mt-1"><Delta value={pctChange(rollup.netProfit, prevRollup.netProfit)} /></div>
                </div>
                <div>
                  <StatCard label="Profit Margin" value={rollup.profitMargin !== null ? `${rollup.profitMargin.toFixed(1)}%` : '—'} icon="📊" color={rollup.profitMargin >= 0 ? 'success' : 'danger'} />
                </div>
              </div>

              {/* Cash & customers */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="COD Settled" value={fmtNaira(rollup.codSettled)} icon="✅" color="success" />
                <StatCard label="COD Pending" value={fmtNaira(rollup.codPending)} icon="⏳" color="warning" />
                <StatCard label="Outstanding Receivables" value={fmtNaira(rollup.outstandingReceivables)} icon="📥" color="cod" sub="As of today, all stages" />
                <StatCard label="Avg Order Value" value={fmtNaira(rollup.aov)} icon="🧮" color="brand" />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="New Customers" value={rollup.newCustomers} icon="👤" color="success" />
                <div className="stat-card">
                  <p className="section-title">Refunds / Returns</p>
                  <p className="text-sm text-ink-400 mt-2">Not yet tracked</p>
                  <p className="text-xs text-ink-300 mt-1">Coming in a future update</p>
                </div>
              </div>

              {/* Expense category breakdown */}
              {Object.keys(rollup.expenseByCategory).length > 0 && (
                <div className="card">
                  <h2 className="font-semibold text-ink-900 mb-4">Expenses by Category — {monthLabel(selectedMonth)}</h2>
                  <div className="space-y-2">
                    {Object.entries(rollup.expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                      <div key={cat} className="flex items-center justify-between text-sm">
                        <span className="text-ink-700 capitalize">{CATEGORY_LABELS[cat] || cat}</span>
                        <span className="font-semibold text-ink-900">{fmtNaira(amt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trend chart */}
              <div className="card">
                <h2 className="font-semibold text-ink-900 mb-1">12-Month Trend</h2>
                <div className="flex items-center gap-4 mb-4">
                  <span className="flex items-center gap-1.5 text-xs text-ink-500"><span className="w-2.5 h-2.5 rounded-full bg-brand-600" /> Revenue</span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-500"><span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Expenses</span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-500"><span className="w-2.5 h-2.5 rounded-full bg-green-600" /> Net Profit</span>
                </div>
                <TrendChart data={trend} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Drill-down modal */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-panel max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">
                {detailModal === 'revenue' ? 'Revenue' : 'Operating Expenses'} — {monthLabel(selectedMonth)}
              </h3>
              <button onClick={() => setDetailModal(null)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="divide-y divide-surface-100">
              {detailModal === 'revenue' && orders.filter(o => o.status === 'delivered' && o.created_at && o.created_at.startsWith(selectedMonth)).map(o => (
                <div key={o.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-900">Order #{o.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-ink-400">{new Date(o.created_at).toLocaleDateString('en-NG')}</p>
                  </div>
                  <p className="font-semibold text-ink-900 text-sm">{fmtNaira(o.total_amount)}</p>
                </div>
              ))}
              {detailModal === 'expenses' && expenses.filter(e => e.expense_date && e.expense_date.startsWith(selectedMonth)).map(e => (
                <div key={e.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{e.description}</p>
                    <p className="text-xs text-ink-400 capitalize">{e.category} · {new Date(e.expense_date).toLocaleDateString('en-NG')}</p>
                  </div>
                  <p className="font-semibold text-ink-900 text-sm">{fmtNaira(e.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}