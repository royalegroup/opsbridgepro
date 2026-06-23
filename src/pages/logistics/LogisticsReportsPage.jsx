import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../../components/shared/StatCard'

export default function LogisticsReportsPage() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('logistics_requests').select('status, delivery_state, created_at').eq('logistics_id', profile.business_id)
    if (data) setRequests(data)
  }

  const delivered = requests.filter(r => r.status === 'delivered').length
  const failed = requests.filter(r => r.status === 'failed').length
  const successRate = requests.length ? Math.round((delivered / requests.length) * 100) : 0
  const byState = requests.filter(r => r.status === 'delivered').reduce((acc, r) => { acc[r.delivery_state] = (acc[r.delivery_state] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-6">
      <h1 className="page-title">Reports</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={requests.length} icon="◎" color="brand" />
        <StatCard label="Delivered" value={delivered} icon="▣" color="success" />
        <StatCard label="Failed" value={failed} icon="◆" color="danger" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon="◉" color={successRate >= 70 ? 'success' : 'warning'} />
      </div>
      <div className="card">
        <h2 className="font-semibold text-ink-900 mb-4">Deliveries by State</h2>
        <div className="space-y-2">
          {Object.entries(byState).sort((a,b) => b[1]-a[1]).map(([state, count]) => (
            <div key={state} className="flex items-center justify-between">
              <span className="text-sm text-ink-700">{state}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(count/delivered)*100}%` }} />
                </div>
                <span className="text-sm font-semibold text-ink-900 w-6 text-right">{count}</span>
              </div>
            </div>
          ))}
          {Object.keys(byState).length === 0 && <p className="text-sm text-ink-400 text-center py-6">No delivered orders yet.</p>}
        </div>
      </div>
    </div>
  )
}
