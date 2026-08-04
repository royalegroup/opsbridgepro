import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import { reverseCommission } from '../../lib/rewardsHelpers'
import { exportRowsToCSV } from '../../lib/csvExport'

function fmtNaira(n) { return `₦${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` }

const STATUS_STYLES = {
  earned: 'bg-blue-50 text-blue-700',
  approved: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  reversed: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function RewardsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('ledger')
  const [rewards, setRewards] = useState([])
  const [staff, setStaff] = useState([])
  const [rules, setRules] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const [reverseModal, setReverseModal] = useState(null)
  const [reverseReason, setReverseReason] = useState('')
  const [payModal, setPayModal] = useState(null)
  const [payReference, setPayReference] = useState('')
  const [saving, setSaving] = useState(false)

  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState({ name: '', targetType: 'role', applies_to_role: '', applies_to_user_id: '', calculation_method: 'flat', rate_amount: '', rate_percent: '' })
  const [ruleError, setRuleError] = useState('')

  useEffect(() => { if (profile?.business_id) loadAll() }, [profile])

  async function loadAll() {
    const bid = profile.business_id
    const [rwRes, stRes, ruRes] = await Promise.all([
      supabase.from('rewards')
        .select('*, users!rewards_staff_id_fkey(full_name), orders!rewards_related_order_id_fkey(customers(full_name))')
        .eq('business_id', bid)
        .eq('reward_type', 'commission')
        .order('created_at', { ascending: false }),
      supabase.from('users').select('id, full_name, role').eq('business_id', bid).neq('role', 'owner'),
      supabase.from('commission_rules').select('*').eq('business_id', bid).order('created_at', { ascending: false }),
    ])
    if (rwRes.data) setRewards(rwRes.data)
    if (stRes.data) setStaff(stRes.data)
    if (ruRes.data) setRules(ruRes.data)
    setLoading(false)
  }

  const distinctRoles = [...new Set(staff.map(s => s.role))]

  const filtered = filter === 'all' ? rewards : rewards.filter(r => r.status === filter)
  const totalEarned = rewards.reduce((s, r) => s + Number(r.amount_earned), 0)
  const totalPaid = rewards.reduce((s, r) => s + Number(r.amount_paid), 0)
  const outstanding = rewards.filter(r => ['earned', 'approved'].includes(r.status)).reduce((s, r) => s + (Number(r.amount_earned) - Number(r.amount_paid)), 0)

  async function approve(reward) {
    await supabase.from('rewards').update({ status: 'approved', approved_by: profile.id, approved_at: new Date().toISOString() }).eq('id', reward.id)
    loadAll()
  }

  async function markPaid() {
    if (!payModal) return
    setSaving(true)
    const outstandingAmt = Number(payModal.amount_earned) - Number(payModal.amount_paid)
    await supabase.from('reward_payments').insert({
      reward_id: payModal.id,
      amount: outstandingAmt,
      paid_by: profile.id,
      payment_reference: payReference || null,
    })
    await supabase.from('rewards').update({
      amount_paid: Number(payModal.amount_earned),
      status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', payModal.id)
    setPayModal(null)
    setPayReference('')
    loadAll()
    setSaving(false)
  }

  async function submitReverse() {
    if (!reverseModal || !reverseReason) return
    setSaving(true)
    await reverseCommission(reverseModal.id, reverseReason)
    setReverseModal(null)
    setReverseReason('')
    loadAll()
    setSaving(false)
  }

  function resetRuleForm() {
    setRuleForm({ name: '', targetType: 'role', applies_to_role: '', applies_to_user_id: '', calculation_method: 'flat', rate_amount: '', rate_percent: '' })
    setRuleError('')
  }

  async function saveRule() {
    if (!ruleForm.name) { setRuleError('Rule name is required.'); return }
    if (ruleForm.targetType === 'role' && !ruleForm.applies_to_role) { setRuleError('Select a role.'); return }
    if (ruleForm.targetType === 'staff' && !ruleForm.applies_to_user_id) { setRuleError('Select a staff member.'); return }
    if (ruleForm.calculation_method === 'flat' && !ruleForm.rate_amount) { setRuleError('Enter a flat amount.'); return }
    if (ruleForm.calculation_method !== 'flat' && !ruleForm.rate_percent) { setRuleError('Enter a percentage.'); return }

    setSaving(true); setRuleError('')
    await supabase.from('commission_rules').insert({
      business_id: profile.business_id,
      name: ruleForm.name,
      applies_to_role: ruleForm.targetType === 'role' ? ruleForm.applies_to_role : null,
      applies_to_user_id: ruleForm.targetType === 'staff' ? ruleForm.applies_to_user_id : null,
      calculation_method: ruleForm.calculation_method,
      rate_amount: ruleForm.calculation_method === 'flat' ? +ruleForm.rate_amount : null,
      rate_percent: ruleForm.calculation_method !== 'flat' ? +ruleForm.rate_percent : null,
      created_by: profile.id,
    })
    setShowRuleForm(false)
    resetRuleForm()
    loadAll()
    setSaving(false)
  }

  async function toggleRuleActive(id, current) {
    await supabase.from('commission_rules').update({ is_active: !current }).eq('id', id)
    loadAll()
  }

  // Reports data
  const byStaff = {}
  rewards.forEach(r => {
    const name = r.users?.full_name || 'Unknown'
    if (!byStaff[name]) byStaff[name] = { earned: 0, paid: 0, count: 0 }
    byStaff[name].earned += Number(r.amount_earned)
    byStaff[name].paid += Number(r.amount_paid)
    byStaff[name].count += 1
  })
  const staffRows = Object.entries(byStaff).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.earned - a.earned)

  function exportCSV() {
    exportRowsToCSV(rewards, [
      ['Staff', r => r.users?.full_name || ''],
      ['Customer', r => r.orders?.customers?.full_name || ''],
      ['Date', r => new Date(r.created_at).toLocaleDateString('en-NG')],
      ['Method', r => r.calculation_method || ''],
      ['Amount Earned', r => r.amount_earned || 0],
      ['Amount Paid', r => r.amount_paid || 0],
      ['Status', r => r.status],
      ['Notes', r => r.notes || ''],
    ], `commissions-${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-title">Rewards & Commissions</h1>
          <p className="text-ink-400 text-sm mt-0.5">CS Rep commissions, earned automatically on delivery</p>
        </div>
      </div>

      <div className="flex border-b border-surface-200">
        {[['ledger', 'Ledger'], ['rules', 'Rules'], ['reports', 'Reports']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${tab === key ? 'text-brand-600 border-brand-600' : 'text-ink-400 border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-surface-100" />)}</div>
      ) : tab === 'ledger' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Earned" value={fmtNaira(totalEarned)} icon="◆" color="brand" />
            <StatCard label="Total Paid" value={fmtNaira(totalPaid)} icon="✅" color="success" />
            <StatCard label="Outstanding" value={fmtNaira(outstanding)} icon="⏳" color="warning" />
            <StatCard label="Total Records" value={rewards.length} icon="◎" color="cod" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {['all', 'earned', 'approved', 'paid', 'reversed', 'cancelled'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="ml-1.5 opacity-70">{s === 'all' ? rewards.length : rewards.filter(r => r.status === s).length}</span>
              </button>
            ))}
          </div>

          <div className="card p-0 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-12 text-center"><p className="text-3xl mb-2">💰</p><p className="text-ink-500 font-medium">No commission records</p></div>
            ) : (
              <div className="divide-y divide-surface-100">
                {filtered.map(r => (
                  <div key={r.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink-900 text-sm">{r.users?.full_name || 'Unknown staff'}</p>
                        <p className="text-xs text-ink-400 mt-0.5">Order customer: {r.orders?.customers?.full_name || '—'}</p>
                        <p className="text-xs text-ink-400">{new Date(r.created_at).toLocaleDateString('en-NG')} · {r.calculation_method}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-ink-900">{fmtNaira(r.amount_earned)}</p>
                        <span className={`badge ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                      </div>
                    </div>
                    {r.reversed_reason && <p className="text-xs text-red-500 mt-2 bg-red-50 rounded-lg px-2 py-1.5">{r.reversed_reason}</p>}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {r.status === 'earned' && (
                        <button onClick={() => approve(r)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">Approve</button>
                      )}
                      {r.status === 'approved' && (
                        <button onClick={() => setPayModal(r)} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">Mark Paid</button>
                      )}
                      {['earned', 'approved'].includes(r.status) && (
                        <button onClick={() => setReverseModal(r)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100">Reverse</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'rules' ? (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={() => { resetRuleForm(); setShowRuleForm(true) }} className="btn-primary">+ New Rule</button>
          </div>
          <div className="space-y-3">
            {rules.map(r => (
              <div key={r.id} className={`card ${!r.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink-900 text-sm">{r.name}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      Applies to: {r.applies_to_user_id ? staff.find(s => s.id === r.applies_to_user_id)?.full_name || 'Specific staff' : (r.applies_to_role || 'All roles')}
                    </p>
                    <p className="text-xs text-brand-600 mt-0.5">
                      {r.calculation_method === 'flat' ? `Flat ${fmtNaira(r.rate_amount)} per order` : `${r.rate_percent}% of ${r.calculation_method === 'percent_order' ? 'order value' : 'gross profit'}`}
                    </p>
                  </div>
                  <button onClick={() => toggleRuleActive(r.id, r.is_active)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <div className="card text-center py-12">
                <p className="text-3xl mb-2">⚙️</p>
                <p className="text-ink-500 font-medium">No commission rules yet</p>
                <p className="text-sm text-ink-400 mt-1">Without a rule, no commissions are calculated — create one to get started.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // REPORTS TAB
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={exportCSV} className="btn-secondary text-sm">⬇️ Export CSV</button>
          </div>
          <div className="card">
            <h2 className="font-semibold text-ink-900 mb-4">Top Performing Staff</h2>
            {staffRows.length === 0 ? <p className="text-sm text-ink-400 text-center py-6">No data yet.</p> : (
              <div className="space-y-3">
                {staffRows.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{s.name}</span>
                    <div className="flex items-center gap-4 text-xs text-ink-500">
                      <span>{s.count} orders</span>
                      <span>Earned: <strong className="text-ink-900">{fmtNaira(s.earned)}</strong></span>
                      <span>Paid: <strong className="text-green-600">{fmtNaira(s.paid)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Rule Modal */}
      {showRuleForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">New Commission Rule</h3>
              <button onClick={() => setShowRuleForm(false)} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="label">Rule Name</label><input className="input" value={ruleForm.name} onChange={e => setRuleForm(f => ({...f, name: e.target.value}))} placeholder="e.g. CS Rep Flat Commission" /></div>
              <div>
                <label className="label">Applies To</label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setRuleForm(f => ({...f, targetType: 'role'}))} className={`flex-1 py-2 rounded-xl text-sm font-medium border ${ruleForm.targetType === 'role' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-surface-200 text-ink-600'}`}>By Role</button>
                  <button type="button" onClick={() => setRuleForm(f => ({...f, targetType: 'staff'}))} className={`flex-1 py-2 rounded-xl text-sm font-medium border ${ruleForm.targetType === 'staff' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-surface-200 text-ink-600'}`}>Specific Staff</button>
                </div>
                {ruleForm.targetType === 'role' ? (
                  <select className="input" value={ruleForm.applies_to_role} onChange={e => setRuleForm(f => ({...f, applies_to_role: e.target.value}))}>
                    <option value="">Select role</option>
                    {distinctRoles.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <select className="input" value={ruleForm.applies_to_user_id} onChange={e => setRuleForm(f => ({...f, applies_to_user_id: e.target.value}))}>
                    <option value="">Select staff member</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="label">Calculation Method</label>
                <select className="input" value={ruleForm.calculation_method} onChange={e => setRuleForm(f => ({...f, calculation_method: e.target.value}))}>
                  <option value="flat">Flat amount per delivered order</option>
                  <option value="percent_order">Percentage of order value</option>
                  <option value="percent_profit">Percentage of gross profit</option>
                </select>
              </div>
              {ruleForm.calculation_method === 'flat' ? (
                <div><label className="label">Amount per order (₦)</label><input type="number" className="input" value={ruleForm.rate_amount} onChange={e => setRuleForm(f => ({...f, rate_amount: e.target.value}))} /></div>
              ) : (
                <div><label className="label">Percentage (%)</label><input type="number" className="input" value={ruleForm.rate_percent} onChange={e => setRuleForm(f => ({...f, rate_percent: e.target.value}))} /></div>
              )}
              {ruleError && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{ruleError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRuleForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveRule} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Create Rule'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Mark Commission Paid</h3>
            <div className="bg-surface-50 rounded-xl p-3">
              <p className="text-sm font-semibold text-ink-900">{fmtNaira(Number(payModal.amount_earned) - Number(payModal.amount_paid))}</p>
              <p className="text-xs text-ink-400">to {payModal.users?.full_name}</p>
            </div>
            <div><label className="label">Payment Reference <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
              <input className="input" value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="e.g. transfer ref, batch ID" /></div>
            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={markPaid} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Confirm Paid'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Modal */}
      {reverseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Reverse Commission</h3>
            <p className="text-sm text-ink-500">{fmtNaira(reverseModal.amount_earned)} for {reverseModal.users?.full_name}</p>
            <div><label className="label">Reason</label><textarea className="input" rows={3} value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="e.g. Order was returned/refunded" /></div>
            <div className="flex gap-3">
              <button onClick={() => setReverseModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitReverse} disabled={saving || !reverseReason} className="btn-danger flex-1">{saving ? 'Reversing…' : 'Reverse'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}