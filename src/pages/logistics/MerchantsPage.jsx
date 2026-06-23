import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function MerchantsPage() {
  const { profile } = useAuth()
  const [merchants, setMerchants] = useState([])

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const { data } = await supabase.from('merchant_logistics_links').select('*, businesses!merchant_logistics_links_merchant_id_fkey(name, created_at)').eq('logistics_id', profile.business_id)
    if (data) setMerchants(data)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Merchants</h1>
        <p className="text-ink-400 text-sm mt-0.5">{merchants.length} merchants using your logistics</p>
      </div>
      <div className="card p-0 overflow-hidden">
        {merchants.length === 0 ? (
          <div className="p-12 text-center"><p className="text-3xl mb-2">▦</p><p className="text-ink-500 font-medium">No merchants linked yet</p></div>
        ) : (
          <div className="divide-y divide-surface-100">
            {merchants.map(m => (
              <div key={m.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">{m.businesses?.name?.[0]}</div>
                  <div>
                    <p className="font-medium text-ink-900 text-sm">{m.businesses?.name}</p>
                    <p className="text-xs text-ink-400">Linked {new Date(m.linked_at).toLocaleDateString('en-NG')}</p>
                  </div>
                </div>
                <span className={`badge ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{m.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
