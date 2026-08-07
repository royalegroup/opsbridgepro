import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'
import { notify } from '../../lib/notificationHelpers'

export default function CODPage() {
  const { profile } = useAuth()
  const [remittances, setRemittances] = useState([])
  const [filter, setFilter] = useState('all')
  const [alertModal, setAlertModal] = useState(null)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('cod_remittances')
      .select('*, agents(user_id, users(full_name, phone)), businesses!cod_remittances_merchant_id_fkey(name), logistics_requests(orders(customers(full_name), total_amount))')
      .eq('logistics_id', profile.business_id)
      .order('created_at', { ascending: false })
    if (data) setRemittances(data)
  }

  async function confirmAgentRemittance(id) {
    await supabase.from('cod_remittances')
      .update({ agent_remittance_status: 'confirmed' })
      .eq('id', id)
    load()
  }

  async function settleToMerchant(merchantId) {
    const toSettle = remittances.filter(r =>
      r.merchant_id === merchantId &&
      r.agent_remittance_status === 'confirmed' &&
      r.merchant_settlement_status === 'pending'
    )
    if (toSettle.length === 0) return

    const batchRef = `ROYALE-BATCH-${Date.now()}`
    await supabase.from('cod_remittances')
      .update({
        merchant_settlement_status: 'settled',
        merchant_settled_at: new Date().toISOString(),
        royale_batch_reference: batchRef,
      })
      .in('id', toSettle.map(r => r.id))
    load()
  }

  async function sendOverdueAlert(remittance) {
    await supabase.from('cod_remittances')
      .update({ overdue_alert_sent: true })
      .eq('id', remittance.id)

    if (remittance.agents?.user_id) {
      await notify({
        recipientId: remittance.agents.user_id,
        businessId: profile.business_id,
        type: 'cod_overdue',
        title: 'Overdue COD remittance ⚠',
        message: `You have an unremitted collection of ₦${Number(remittance.amount).toLocaleString()} — please remit or provide a delay reason.`,
        referenceId: remittance.id,
        referenceType: 'cod_remittance',
      })
    }

    setAlertModal(null)
    load()
  }

  const isOverdue = r => r.due_at && new Date(r.due_at) < new Date() && r.agent_remittance_status === 'pending'

  const pendingFromAgents = remittances.filter(r => r.agent_remittance_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const remittedByAgents = remittances.filter(r => r.agent_remittance_status === 'remitted').reduce((s, r) => s + +r.amount, 0)
  const pendingToMerchants = remittances.filter(r => r.agent_remittance_status === 'confirmed' && r.merchant_settlement_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const totalSettled = remittances.filter(r => r.merchant_settlement_status === 'settled').reduce((s, r) => s + +r.amount, 0)
  const overdueCount = remittances.filter(r => isOverdue(r)).length

  const merchantGroups = remittances
    .filter(r => r.agent_remittance_status === 'confirmed' && r.merchant_settlement_status === 'pending')
    .reduce((acc, r) => {
      if (!acc[r.merchant_id]) acc[r.merchant_id] = { name: r.businesses?.name, records: [], total: 0 }
      acc[r.merchant_id].records.push(r)
      acc[r.merchant_id].total += +r.amount
      return acc
    }, {})

  const FILTERS = ['all', 'pending', 'remitted', 'confirmed', 'settled', 'overdue']
  const filtered = filter === 'overdue'
    ? remittances.filter(r => isOverdue(r))
    : filter === 'all'
    ? remittances
    : remittances.filter(r => r.agent_remittance_status === filter || r.merchant_settlement_status === filter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">COD Management</h1>
          {overdueCount > 0 && (
            <p className="text-danger text-sm mt-0.5 font-medium">⚠ {overdueCount} overdue remittance{overdueCount > 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending from Agents" value={`₦${pendingFromAgents.toLocaleString()}`} icon="◎" color="warning" />
        <StatCard label="Remitted by Agents" value={`₦${remittedByAgents.toLocaleString()}`} icon="◉" color="brand" />
        <StatCard label="Pending to Merchants" value={`₦${pendingToMerchants.toLocaleString()}`} icon="◆" color="cod" />
        <StatCard label="Total Settled" value={`₦${totalSettled.toLocaleString()}`} icon="▣" color="success" />
      </div>

      {Object.keys(merchantGroups).length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-ink-900 mb-4">Ready to Settle to Merchants</h2>
          <div className="space-y-3">
            {Object.entries(merchantGroups).map(([merchantId, group]) => (
              <div key={merchantId} className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                <div>
                  <p className="font-semibold text-ink-900 text-sm">{group.name}</p>
                  <p className="text-xs text-ink-500">{group.records.length} confirmed collections</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-green-700">₦{group.total.toLocaleString()}</p>
                  <button onClick={() => settleToMerchant(merchantId)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700">
                    Settle Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {f === 'overdue' ? '⚠ Overdue' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 opacity-70">
              {f === 'all' ? remittances.length
                : f === 'overdue' ? overdueCount
                : remittances.filter(r => r.agent_remittance_status === f || r.merchant_settlement_status === f).length}
            </span>
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">◆</p>
            <p className="text-ink-500 font-medium">No COD records</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(r => (
              <div key={r.id} className={`p-4 space-y-3 ${isOverdue(r) ? 'bg-red-50/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">₦{Number(r.amount).toLocaleString()}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      Agent: <span className="font-medium text-ink-600">{r.agents?.users?.full_name}</span>
                    </p>
                    <p className="text-xs text-ink-400">
                      Customer: {r.logistics_requests?.orders?.customers?.full_name}
                    </p>
                    <p className="text-xs text-ink-400">Merchant: {r.businesses?.name}</p>
                    <p className="text-xs text-ink-400">{new Date(r.created_at).toLocaleDateString('en-NG')}</p>

                    {r.due_at && r.agent_remittance_status === 'pending' && (
                      <p className={`text-xs mt-1 font-medium ${isOverdue(r) ? 'text-danger' : 'text-ink-400'}`}>
                        {isOverdue(r) ? '⚠ OVERDUE' : `Due: ${new Date(r.due_at).toLocaleString('en-NG')}`}
                      </p>
                    )}

                    {r.agent_delay_reason && (
                      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <p className="text-xs font-semibold text-amber-700">Agent Delay Reason:</p>
                        <p className="text-xs text-amber-600">{r.agent_delay_reason}</p>
                      </div>
                    )}

                    {r.batch_reference && <p className="text-xs text-brand-600 mt-1">Agent Batch: {r.batch_reference}</p>}
                    {r.royale_batch_reference && <p className="text-xs text-green-600 mt-1">Settlement Ref: {r.royale_batch_reference}</p>}
                  </div>

                  <div className="text-right space-y-1.5 flex-shrink-0">
                    <div><Badge status={r.agent_remittance_status} /></div>
                    <div><Badge status={r.merchant_settlement_status} /></div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {r.agent_remittance_status === 'remitted' && (
                    <button onClick={() => confirmAgentRemittance(r.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">
                      Confirm Agent Remittance ✓
                    </button>
                  )}
                  {isOverdue(r) && !r.overdue_alert_sent && (
                    <button onClick={() => setAlertModal(r)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100">
                      Alert Agent ⚠
                    </button>
                  )}
                  {r.overdue_alert_sent && r.agent_remittance_status === 'pending' && (
                    <span className="text-xs text-amber-600 font-medium">Alert sent</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {alertModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Alert Agent</h3>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-sm font-medium text-red-700">
                {alertModal.agents?.users?.full_name} — ₦{Number(alertModal.amount).toLocaleString()}
              </p>
              <p className="text-xs text-red-500 mt-1">This COD remittance is overdue.</p>
            </div>
            <p className="text-sm text-ink-500">
              Sending this alert will notify the agent that their COD remittance is overdue and prompt them to provide a reason for the delay.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setAlertModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => sendOverdueAlert(alertModal)} className="btn-danger flex-1">Send Alert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}