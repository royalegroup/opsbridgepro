import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'

const CATEGORIES = [
  { key: 'ads', label: 'Ads & Marketing', icon: '📣', color: 'bg-purple-50 text-purple-700' },
  { key: 'waybill', label: 'Waybill & Shipping', icon: '🚚', color: 'bg-blue-50 text-blue-700' },
  { key: 'staff', label: 'Staff & Salary', icon: '👥', color: 'bg-green-50 text-green-700' },
  { key: 'office', label: 'Office & Utilities', icon: '🏢', color: 'bg-amber-50 text-amber-700' },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: '📦', color: 'bg-gray-100 text-gray-600' },
  { key: 'custom', label: 'Custom', icon: '✏️', color: 'bg-brand-50 text-brand-700' },
]

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
]

export default function ExpensesPage() {
  const { profile } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [period, setPeriod] = useState('month')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [form, setForm] = useState({ category: 'ads', custom_category: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('expenses')
      .select('*, users(full_name)')
      .eq('merchant_id', profile.business_id)
      .order('expense_date', { ascending: false })
    if (data) setExpenses(data)
  }

  function filterByPeriod(exp) {
    const date = new Date(exp.expense_date)
    const now = new Date()
    if (period === 'today') {
      return date.toDateString() === now.toDateString()
    } else if (period === 'week') {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      return date >= weekAgo
    } else if (period === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }
    return true
  }

  const periodFiltered = expenses.filter(filterByPeriod)
  const filtered = categoryFilter === 'all' ? periodFiltered : periodFiltered.filter(e => e.category === categoryFilter)

  const totalExpenses = periodFiltered.reduce((s, e) => s + +e.amount, 0)

  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: periodFiltered.filter(e => e.category === cat.key).reduce((s, e) => s + +e.amount, 0),
    count: periodFiltered.filter(e => e.category === cat.key).length,
  })).filter(c => c.total > 0)

  async function save() {
    if (!form.description || !form.amount || !form.expense_date) { setError('Description, amount and date are required.'); return }
    if (form.category === 'custom' && !form.custom_category) { setError('Please enter a custom category name.'); return }
    setSaving(true); setError('')

    const { error: insertError } = await supabase.from('expenses').insert({
      merchant_id: profile.business_id,
      recorded_by: profile.id,
      category: form.category,
      custom_category: form.category === 'custom' ? form.custom_category : null,
      description: form.description,
      amount: +form.amount,
      expense_date: form.expense_date,
    })

    if (insertError) { setError(insertError.message); setSaving(false); return }

    setShowForm(false)
    setForm({ category: 'ads', custom_category: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] })
    load()
    setSaving(false)
  }

  async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  const getCatInfo = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[4]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="text-ink-400 text-sm mt-0.5">Track all business running costs</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Record Expense</button>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${period === p.key ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Expenses" value={`₦${totalExpenses.toLocaleString()}`} icon="◆" color="danger" />
        {byCategory.slice(0, 3).map(cat => (
          <StatCard key={cat.key} label={cat.label} value={`₦${cat.total.toLocaleString()}`} icon={cat.icon} color="warning" />
        ))}
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-ink-900 mb-4">Breakdown by Category</h2>
          <div className="space-y-3">
            {byCategory.sort((a, b) => b.total - a.total).map(cat => (
              <div key={cat.key} className="flex items-center gap-3">
                <span className={`text-lg p-1.5 rounded-lg ${cat.color}`}>{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-ink-700">{cat.label}</p>
                    <p className="text-sm font-bold text-ink-900">₦{cat.total.toLocaleString()}</p>
                  </div>
                  <div className="w-full h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0}%` }} />
                  </div>
                </div>
                <p className="text-xs text-ink-400 flex-shrink-0">{cat.count} record{cat.count > 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${categoryFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500'}`}>
          All ({periodFiltered.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = periodFiltered.filter(e => e.category === cat.key).length
          if (count === 0) return null
          return (
            <button key={cat.key} onClick={() => setCategoryFilter(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${categoryFilter === cat.key ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500'}`}>
              {cat.icon} {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Expenses list */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">💰</p>
            <p className="text-ink-500 font-medium">No expenses recorded</p>
            <p className="text-sm text-ink-400 mt-1">Start recording your business expenses to track profitability.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(e => {
              const cat = getCatInfo(e.category)
              return (
                <div key={e.id} className="p-4 flex items-center gap-3">
                  <span className={`text-lg p-2 rounded-xl flex-shrink-0 ${cat.color}`}>{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-900 text-sm">{e.description}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {e.category === 'custom' ? e.custom_category : cat.label}
                      {e.users?.full_name && ` · ${e.users.full_name}`}
                      {` · ${new Date(e.expense_date).toLocaleDateString('en-NG')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-bold text-ink-900">₦{Number(e.amount).toLocaleString()}</p>
                    {(profile?.role === 'owner' || profile?.role === 'store_manager') && (
                      <button onClick={() => deleteExpense(e.id)} className="text-ink-200 hover:text-danger transition-colors text-lg">✕</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <h3 className="font-semibold text-ink-900">Record Expense</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-ink-300 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat.key} type="button" onClick={() => setForm(f => ({...f, category: cat.key}))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${form.category === cat.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-surface-200 text-ink-700 hover:bg-surface-50'}`}>
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {form.category === 'custom' && (
                <div>
                  <label className="label">Custom Category Name</label>
                  <input className="input" value={form.custom_category} onChange={e => setForm(f => ({...f, custom_category: e.target.value}))} placeholder="e.g. Packaging, Generator fuel" />
                </div>
              )}

              <div>
                <label className="label">Description</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What was this expense for?" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount (₦)</label>
                  <input type="number" className="input" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="0" />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={form.expense_date} onChange={e => setForm(f => ({...f, expense_date: e.target.value}))} />
                </div>
              </div>

              {error && <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Record Expense'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}