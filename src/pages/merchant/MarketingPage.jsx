import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import { computeCampaignMetrics, computeOverallMetrics, isAttributable } from '../../lib/marketingHelpers'

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'Google', 'WhatsApp', 'Other']
const ORDER_SOURCES = ['facebook', 'tiktok', 'instagram', 'whatsapp', 'referral', 'manual']

function fmtNaira(n) {
  if (n === null || n === undefined) return '—'
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
function fmtRoas(n) {
  if (n === null || n === undefined) return '—'
  return `${Number(n).toFixed(2)}x`
}

export default function MarketingPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [campaigns, setCampaigns] = useState([])
  const [orders, setOrders] = useState([])
  const [expenses, setExpenses] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editCampaign, setEditCampaign] = useState(null)
  const [form, setForm] = useState({ name: '', platform: '', product_id: '', order_source: '', start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [spendModal, setSpendModal] = useState(null)
  const [spendForm, setSpendForm] = useState({ amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
  const [spendSaving, setSpendSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) loadAll() }, [profile])

  async function loadAll() {
    const bid = profile.business_id
    const [cRes, oRes, eRes, pRes] = await Promise.all([
      supabase.from('campaigns').select('*').eq('merchant_id', bid).order('created_at', { ascending: false }),
      supabase.from('orders').select('id, source, created_at, status, total_amount, customer_id, order_items(product_id, quantity, unit_cost_price)').eq('merchant_id', bid),
      supabase.from('expenses').select('*').eq('merchant_id', bid).eq('category', 'ads'),
      supabase.from('products').select('id, name').eq('merchant_id', bid).eq('is_active', true),
    ])
    if (cRes.data) setCampaigns(cRes.data)
    if (oRes.data) setOrders(oRes.data)
    if (eRes.data) setExpenses(eRes.data)
    if (pRes.data) setProducts(pRes.data)
    setLoading(false)
  }

  // Spend per campaign, from linked Expenses records (category = ads)
  function spendFor(campaignId) {
    return expenses.filter(e => e.campaign_id === campaignId).reduce((s, e) => s + Number(e.amount), 0)
  }

  const campaignMetrics = campaigns.map(c => ({
    campaign: c,
    ...computeCampaignMetrics(c, orders, spendFor(c.id)),
  }))

  const overall = computeOverallMetrics(campaignMetrics)

  // Platform breakdown
  const platformMap = {}
  campaignMetrics.forEach(m => {
    const key = m.campaign.platform || 'Unspecified'
    if (!platformMap[key]) platformMap[key] = { spend: 0, revenue: 0 }
    platformMap[key].spend += m.spend
    if (m.attributable) platformMap[key].revenue += m.revenue || 0
  })
  const platformRows = Object.entries(platformMap).map(([platform, v]) => ({
    platform, ...v, roas: v.spend > 0 ? v.revenue / v.spend : null
  })).sort((a, b) => b.spend - a.spend)

  // Top performing products (from attributable campaigns with product_id)
  const productMap = {}
  campaignMetrics.filter(m => m.attributable && m.campaign.product_id).forEach(m => {
    const pid = m.campaign.product_id
    if (!productMap[pid]) productMap[pid] = { spend: 0, revenue: 0 }
    productMap[pid].spend += m.spend
    productMap[pid].revenue += m.revenue || 0
  })
  const productRows = Object.entries(productMap).map(([pid, v]) => ({
    name: products.find(p => p.id === pid)?.name || 'Unknown product',
    ...v, roas: v.spend > 0 ? v.revenue / v.spend : null
  })).sort((a, b) => b.revenue - a.revenue)

  // ROAS ranking — only attributable campaigns
  const roasRanking = campaignMetrics.filter(m => m.attributable).sort((a, b) => (b.roas || 0) - (a.roas || 0))
  const spendOnly = campaignMetrics.filter(m => !m.attributable)

  function openNewCampaign() {
    setEditCampaign(null)
    setForm({ name: '', platform: '', product_id: '', order_source: '', start_date: '', end_date: '' })
    setError('')
    setShowForm(true)
  }
  function openEditCampaign(c) {
    setEditCampaign(c)
    setForm({ name: c.name, platform: c.platform || '', product_id: c.product_id || '', order_source: c.order_source || '', start_date: c.start_date || '', end_date: c.end_date || '' })
    setError('')
    setShowForm(true)
  }

  async function saveCampaign() {
    if (!form.name) { setError('Campaign name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name,
      platform: form.platform || null,
      product_id: form.product_id || null,
      order_source: form.order_source || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }
    if (editCampaign) {
      await supabase.from('campaigns').update(payload).eq('id', editCampaign.id)
    } else {
      await supabase.from('campaigns').insert({ ...payload, merchant_id: profile.business_id, created_by: profile.id })
    }
    setShowForm(false)
    loadAll()
    setSaving(false)
  }

  async function toggleActive(id, current) {
    await supabase.from('campaigns').update({ is_active: !current }).eq('id', id)
    loadAll()
  }

  async function logSpend() {
    if (!spendForm.amount || !spendModal) return
    setSpendSaving(true)
    await supabase.from('expenses').insert({
      merchant_id: profile.business_id,
      recorded_by: profile.id,
      category: 'ads',
      description: spendForm.description || `Ad spend — ${spendModal.name}`,
      amount: +spendForm.amount,
      expense_date: spendForm.expense_date,
      campaign_id: spendModal.id,
    })
    setSpendModal(null)
    setSpendForm({ amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
    loadAll()
    setSpendSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="text-ink-400 text-sm mt-0.5">Ad spend, campaigns, and ROAS</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-200">
        {[['dashboard', 'Dashboard'], ['campaigns', 'Campaigns']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${tab === key ? 'text-brand-600 border-brand-600' : 'text-ink-400 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-surface-100" />)}
        </div>
      ) : tab === 'dashboard' ? (
        <div className="space-y-6">
          {/* Overview cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Ad Spend" value={fmtNaira(overall.totalSpend)} icon="💸" color="danger" />
            <StatCard label="Attributed Revenue" value={fmtNaira(overall.totalRevenue)} icon="◆" color="brand" />
            <StatCard label="Net Profit After Ads" value={fmtNaira(overall.netProfitAfterAds)} icon="▣" color={overall.netProfitAfterAds >= 0 ? 'success' : 'danger'} />
            <StatCard label="Blended ROAS" value={fmtRoas(overall.blendedRoas)} icon="📈" color="cod" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Gross Profit" value={fmtNaira(overall.totalGrossProfit)} icon="◉" color="success" />
            <StatCard label="Attributed Orders" value={overall.totalOrders} icon="◎" color="brand" />
            <StatCard label="Attributable Campaigns" value={`${overall.attributedCampaignCount} / ${campaigns.length}`} icon="🎯" color="warning" />
            <StatCard label="Active Campaigns" value={campaigns.filter(c => c.is_active).length} icon="✓" color="success" />
          </div>

          {spendOnly.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-sm text-amber-700">
                <span className="font-semibold">{spendOnly.length} campaign{spendOnly.length > 1 ? 's are' : ' is'}</span> spend-only (no product or order source linked), so they contribute to Total Ad Spend but aren't included in revenue/ROAS calculations. Link a product or source to any campaign for full attribution.
              </p>
            </div>
          )}

          {/* Platform performance */}
          <div className="card">
            <h2 className="font-semibold text-ink-900 mb-4">Platform Performance</h2>
            {platformRows.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">No campaigns yet.</p>
            ) : (
              <div className="space-y-3">
                {platformRows.map(p => (
                  <div key={p.platform} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{p.platform}</span>
                    <div className="flex items-center gap-4 text-xs text-ink-500">
                      <span>Spend: <strong className="text-ink-900">{fmtNaira(p.spend)}</strong></span>
                      <span>Revenue: <strong className="text-ink-900">{fmtNaira(p.revenue)}</strong></span>
                      <span>ROAS: <strong className={p.roas >= 1 ? 'text-green-600' : 'text-red-500'}>{fmtRoas(p.roas)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top products */}
          <div className="card">
            <h2 className="font-semibold text-ink-900 mb-4">Top Performing Products</h2>
            {productRows.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">No product-linked campaigns yet.</p>
            ) : (
              <div className="space-y-3">
                {productRows.map(p => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{p.name}</span>
                    <div className="flex items-center gap-4 text-xs text-ink-500">
                      <span>Spend: <strong className="text-ink-900">{fmtNaira(p.spend)}</strong></span>
                      <span>Revenue: <strong className="text-ink-900">{fmtNaira(p.revenue)}</strong></span>
                      <span>ROAS: <strong className={p.roas >= 1 ? 'text-green-600' : 'text-red-500'}>{fmtRoas(p.roas)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ROAS ranking */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100">
              <h2 className="font-semibold text-ink-900">Campaign ROAS Ranking</h2>
            </div>
            {roasRanking.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-8">No attributable campaigns yet.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {roasRanking.map(m => (
                  <div key={m.campaign.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900 text-sm truncate">{m.campaign.name}</p>
                      <p className="text-xs text-ink-400 mt-0.5">
                        {m.ordersCount} orders · CAC {fmtNaira(m.cac)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold text-sm ${m.roas >= 1 ? 'text-green-600' : 'text-red-500'}`}>{fmtRoas(m.roas)}</p>
                      <p className="text-xs text-ink-400">{fmtNaira(m.spend)} spent</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        // CAMPAIGNS TAB
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={openNewCampaign} className="btn-primary">+ New Campaign</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaignMetrics.map(m => (
              <div key={m.campaign.id} className={`card ${!m.campaign.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900 truncate">{m.campaign.name}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{m.campaign.platform || 'No platform set'}</p>
                  </div>
                  <button onClick={() => toggleActive(m.campaign.id, m.campaign.is_active)}
                    className={`text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0 ml-2 ${m.campaign.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {m.campaign.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>

                {!m.attributable && (
                  <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg px-2 py-1.5">Spend-only — no product/source linked</p>
                )}
                {(m.campaign.product_id || m.campaign.order_source) && (
                  <p className="text-xs text-ink-400 mt-2">
                    {m.campaign.product_id && products.find(p => p.id === m.campaign.product_id)?.name}
                    {m.campaign.product_id && m.campaign.order_source && ' · '}
                    {m.campaign.order_source}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="bg-surface-50 rounded-xl p-2 text-center">
                    <p className="text-xs text-ink-400">Spend</p>
                    <p className="font-semibold text-ink-900 text-xs">{fmtNaira(m.spend)}</p>
                  </div>
                  <div className="bg-surface-50 rounded-xl p-2 text-center">
                    <p className="text-xs text-ink-400">Revenue</p>
                    <p className="font-semibold text-ink-900 text-xs">{fmtNaira(m.revenue)}</p>
                  </div>
                  <div className={`rounded-xl p-2 text-center ${m.roas >= 1 ? 'bg-green-50' : 'bg-surface-50'}`}>
                    <p className="text-xs text-ink-400">ROAS</p>
                    <p className={`font-semibold text-xs ${m.roas >= 1 ? 'text-green-700' : 'text-ink-900'}`}>{fmtRoas(m.roas)}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setSpendModal(m.campaign); setSpendForm({ amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] }) }}
                    className="btn-secondary flex-1 text-xs">+ Log Spend</button>
                  <button onClick={() => openEditCampaign(m.campaign)} className="btn-secondary flex-1 text-xs">Edit</button>
                </div>
              </div>
            ))}
          </div>

          {campaigns.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-3xl mb-2">📣</p>
              <p className="text-ink-500 font-medium">No campaigns yet</p>
              <p className="text-sm text-ink-400 mt-1">Create one campaign to start tracking ad spend — even a simple monthly one works.</p>
            </div>
          )}
        </div>
      )}

      {/* New/Edit Campaign Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">{editCampaign ? 'Edit Campaign' : 'New Campaign'}</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Campaign Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Facebook Ads - August 2026" />
              </div>
              <div>
                <label className="label">Platform <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
                <select className="input" value={form.platform} onChange={e => setForm(f => ({...f, platform: e.target.value}))}>
                  <option value="">Not specified</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-3">
                <p className="text-xs text-brand-700 mb-2 font-medium">Link this campaign for automatic ROAS (optional but recommended)</p>
                <div className="space-y-3">
                  <div>
                    <label className="label">Product</label>
                    <select className="input" value={form.product_id} onChange={e => setForm(f => ({...f, product_id: e.target.value}))}>
                      <option value="">Not linked to a product</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Order Source</label>
                    <select className="input" value={form.order_source} onChange={e => setForm(f => ({...f, order_source: e.target.value}))}>
                      <option value="">Not linked to a source</option>
                      {ORDER_SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
                  <input type="date" className="input" value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value}))} />
                </div>
                <div>
                  <label className="label">End Date <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
                  <input type="date" className="input" value={form.end_date} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} />
                </div>
              </div>
              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveCampaign} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : editCampaign ? 'Save Changes' : 'Create Campaign'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Spend Modal */}
      {spendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Log Ad Spend — {spendModal.name}</h3>
            <p className="text-xs text-ink-400">This creates an Expense record under the "Ads" category, linked to this campaign.</p>
            <div>
              <label className="label">Amount (₦)</label>
              <input type="number" className="input" value={spendForm.amount} onChange={e => setSpendForm(f => ({...f, amount: e.target.value}))} />
            </div>
            <div>
              <label className="label">Description <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
              <input className="input" value={spendForm.description} onChange={e => setSpendForm(f => ({...f, description: e.target.value}))} placeholder="e.g. Daily budget top-up" />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={spendForm.expense_date} onChange={e => setSpendForm(f => ({...f, expense_date: e.target.value}))} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSpendModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={logSpend} disabled={spendSaving} className="btn-primary flex-1">{spendSaving ? 'Saving…' : 'Log Spend'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}