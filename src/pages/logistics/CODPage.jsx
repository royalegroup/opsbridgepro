import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'
import Badge from '../../components/shared/Badge'

export default function CODPage() {
  const { profile } = useAuth()
  const [remittances, setRemittances] = useState([])

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('cod_remittances').select('*, agents(users(full_name)), businesses!cod_remittances_merchant_id_fkey(name)').eq('logistics_id', profile.business_id).order('created_at', { ascending: false })
    if (data) setRemittances(data)
  }

  async function confirmAgentRemittance(id) {
    await supabase.from('cod_remittances').update({ agent_remittance_status: 'confirmed' }).eq('id', id)
    load()
  }

  async function settleToMerchant(id) {
    await supabase.from('cod_remittances').update({ merchant_settlement_status: 'settled', merchant_settled_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  const pendingFromAgents = remittances.filter(r => r.agent_remittance_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const pendingToMerchants = remittances.filter(r => r.agent_remittance_status === 'confirmed' && r.merchant_settlement_status === 'pending').reduce((s, r) => s + +r.amount, 0)
  const totalSettled = remittances.filter(r => r.merchant_settlement_status === 'settled').reduce((s, r) => s + +r.amount, 0)

  return (
    <div className="space-y-6">
      <h1 className="page-title">COD Management</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pending from Agents" value={`₦${pendingFromAgents.toLocaleString()}`} icon="◎" color="warning" />
        <StatCard label="Pending to Merchants" value={`₦${pendingToMerchants.toLocaleString()}`} icon="◆" color="brand" />
        <StatCard label="Total Settled" value={`₦${totalSettled.toLocaleString()}`} icon="▣" color="success" />
      </div>

      <div className="card p-0 overflow-hidden">
        {remittances.length === 0 ? (
          <div className="p-12 text-center"><p className="text-3xl mb-2">◆</p><p className="text-ink-500 font-medium">No COD records yet</p></div>
        ) : (
          <div className="divide-y divide-surface-100">
            {remittances.map(r => (
              <div key={r.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900 text-sm">₦{Number(r.amount).toLocaleString()}</p>
                    <p className="text-xs text-ink-400 mt-0.5">Agent: {r.agents?.users?.full_name} · For: {r.businesses?.name}</p>
                    <p className="text-xs text-ink-400">{new Date(r.created_at).toLocaleDateString('en-NG')}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge status={r.agent_remittance_status} />
                    <div><Badge status={r.merchant_settlement_status} /></div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {r.agent_remittance_status === 'remitted' && (
                    <button onClick={() => confirmAgentRemittance(r.id)} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">Confirm Agent Remittance</button>
                  )}
                  {r.agent_remittance_status === 'confirmed' && r.merchant_settlement_status === 'pending' && (
                    <button onClick={() => settleToMerchant(r.id)} className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">Settle to Merchant</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
