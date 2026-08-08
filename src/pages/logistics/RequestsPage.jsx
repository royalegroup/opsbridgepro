import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Badge from '../../components/shared/Badge'
import { deductAgentStockOnDelivery } from '../../lib/stockHelpers'
import { createFollowUpTask, createLogisticsTask } from '../../lib/taskHelpers'
import { createCODRecord } from '../../lib/codHelpers'
import { awardOrderCommission } from '../../lib/rewardsHelpers'
import { logEvent } from '../../lib/orderEventHelpers'
import { notify } from '../../lib/notificationHelpers'
import OrderTimeline from '../../components/shared/OrderTimeline'

export default function RequestsPage() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [agents, setAgents] = useState([])
  const [filter, setFilter] = useState('all')
  const [failReason, setFailReason] = useState({})
  const [timelineOrderId, setTimelineOrderId] = useState(null)
  const [rescheduleModal, setRescheduleModal] = useState(null)
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', notes: '' })
  const [rescheduleSaving, setRescheduleSaving] = useState(false)

  useEffect(() => { if (profile?.business_id) load() }, [profile])

  async function load() {
    const bid = profile.business_id
    const [rRes, aRes] = await Promise.all([
      supabase.from('logistics_requests')
        .select('*, businesses!logistics_requests_merchant_id_fkey(name), agents(id, user_id, users(full_name)), orders(id, delivery_state, merchant_id, assigned_cs_rep, total_amount, customers(full_name, phone, address))')
        .eq('logistics_id', bid)
        .order('created_at', { ascending: false }),
      supabase.from('agents').select('id, user_id, states_covered, users(full_name)').eq('logistics_id', bid).eq('is_active', true),
    ])
    if (rRes.data) setRequests(rRes.data)
    if (aRes.data) setAgents(aRes.data)
  }

  async function assignAgent(requestId, agentId) {
    await supabase.from('logistics_requests')
      .update({ assigned_agent: agentId, status: 'assigned', assigned_at: new Date().toISOString() })
      .eq('id', requestId)
    const req = requests.find(r => r.id === requestId)
    const agent = agents.find(a => a.id === agentId)
    if (req?.orders?.id) {
      await logEvent({ orderId: req.orders.id, eventType: 'agent_assigned', description: `Assigned to delivery agent ${agent?.users?.full_name || ''}`, actorId: profile.id, visibilityLevel: 'public' })
    }
    if (agent?.user_id) {
      await notify({
        recipientId: agent.user_id,
        businessId: profile.business_id,
        type: 'agent_assigned',
        title: 'New delivery assigned',
        message: `You've been assigned a delivery in ${req?.orders?.delivery_state || 'your state'}.`,
        referenceId: requestId,
        referenceType: 'logistics_request',
      })
    }
    load()
  }

  async function updateStatus(requestId, status, reason = null) {
    const update = { status }
    if (reason) update.failure_reason = reason
    if (status === 'delivered') update.delivered_at = new Date().toISOString()

    await supabase.from('logistics_requests').update(update).eq('id', requestId)

    const req = requests.find(r => r.id === requestId)

    const orderStatus = { out_for_delivery: 'in_transit', delivered: 'delivered', failed: 'failed' }[status]
    if (orderStatus && req?.orders?.id) {
      await supabase.from('orders').update({ status: orderStatus }).eq('id', req.orders.id)
    }

    if (status === 'out_for_delivery' && req?.orders?.id) {
      await logEvent({ orderId: req.orders.id, eventType: 'out_for_delivery', description: 'Agent is out for delivery', actorId: profile.id, visibilityLevel: 'public' })
    }
    if (status === 'failed' && req?.orders?.id) {
      await logEvent({ orderId: req.orders.id, eventType: 'delivery_failed', description: reason ? `Delivery attempt failed: ${reason}` : 'Delivery attempt failed', actorId: profile.id, visibilityLevel: 'public' })
      if (req.orders.assigned_cs_rep) {
        await notify({
          recipientId: req.orders.assigned_cs_rep,
          businessId: req.orders.merchant_id,
          type: 'delivery_failed',
          title: 'Delivery failed — action needed',
          message: reason ? `Delivery to ${req.orders.customers?.full_name || 'customer'} failed: ${reason}` : `Delivery to ${req.orders.customers?.full_name || 'customer'} failed.`,
          referenceId: req.orders.id,
          referenceType: 'order',
        })
      }
    }

    if (status === 'delivered' && req?.orders?.id && req?.agents?.id) {
      await deductAgentStockOnDelivery(req.orders.id, req.agents.id)
    }

    if (status === 'delivered' && req?.agents?.id) {
      const { data: order } = await supabase
        .from('orders')
        .select('total_amount, merchant_id, assigned_cs_rep, customers(full_name)')
        .eq('id', req.orders.id)
        .single()
      if (order) {
        await createCODRecord(requestId, req.agents.id, profile.business_id, order.merchant_id, order.total_amount)

        await logEvent({ orderId: req.orders.id, eventType: 'delivered', description: 'Order delivered successfully', actorId: profile.id, visibilityLevel: 'public' })

        if (order.assigned_cs_rep) {
          await notify({
            recipientId: order.assigned_cs_rep,
            businessId: order.merchant_id,
            type: 'delivery_update',
            title: 'Order delivered ✓',
            message: `${order.customers?.full_name || 'Customer'}'s order was delivered successfully.`,
            referenceId: req.orders.id,
            referenceType: 'order',
          })
        }

        // Award CS Rep commission on the merchant side (if an active rule exists)
        if (order.assigned_cs_rep) {
          const { data: repUser } = await supabase.from('users').select('role').eq('id', order.assigned_cs_rep).single()
          await awardOrderCommission({
            businessId: order.merchant_id,
            staffId: order.assigned_cs_rep,
            role: repUser?.role,
            department: 'merchant',
            order: { id: req.orders.id, total_amount: order.total_amount },
          })
        }

        // Award Agent commission on the logistics side (this business)
        if (req.agents.user_id) {
          await awardOrderCommission({
            businessId: profile.business_id,
            staffId: req.agents.user_id,
            role: 'agent',
            department: 'logistics',
            order: { id: req.orders.id, total_amount: order.total_amount },
          })
        }

        await logEvent({ orderId: req.orders.id, eventType: 'commission_awarded', description: 'Commissions calculated for this delivery', actorId: profile.id, visibilityLevel: 'internal' })
      }
    }

    if ((status === 'delivered' || status === 'failed') && req?.orders?.id) {
      const { data: fullOrder } = await supabase
        .from('orders')
        .select('*, customers(full_name, phone)')
        .eq('id', req.orders.id)
        .single()
      if (fullOrder) {
        await createFollowUpTask(fullOrder, status, fullOrder.merchant_id)
      }
    }

    load()
  }

  async function submitReschedule() {
    if (!rescheduleModal || !rescheduleForm.date) return
    setRescheduleSaving(true)

    const orderId = rescheduleModal.orders?.id
    const csRep = rescheduleModal.orders?.assigned_cs_rep

    await createLogisticsTask({
      logisticsId: profile.business_id,
      orderId,
      assignedTo: rescheduleModal.assigned_agent,
      title: `Redeliver to ${rescheduleModal.orders?.customers?.full_name || 'customer'}`,
      notes: rescheduleForm.notes,
      dueDate: new Date(rescheduleForm.date).toISOString(),
      priority: 'high',
      nextActionType: 'Attempt Redelivery',
      origin: 'customer_reschedule',
      createdBy: profile.id,
    })

    if (orderId) {
      await logEvent({
        orderId,
        eventType: 'delivery_failed',
        description: `Customer requested reschedule to ${new Date(rescheduleForm.date).toLocaleDateString('en-NG')}`,
        actorId: profile.id,
        visibilityLevel: 'public',
      })
    }

    if (csRep) {
      await notify({
        recipientId: csRep,
        businessId: rescheduleModal.orders?.merchant_id,
        type: 'delivery_update',
        title: 'Customer rescheduled delivery',
        message: `${rescheduleModal.orders?.customers?.full_name || 'Customer'} asked for redelivery on ${new Date(rescheduleForm.date).toLocaleDateString('en-NG')}.`,
        referenceId: orderId,
        referenceType: 'order',
      })
    }

    setRescheduleModal(null)
    setRescheduleForm({ date: '', notes: '' })
    setRescheduleSaving(false)
  }

  const STATUSES = ['all', 'pending', 'assigned', 'out_for_delivery', 'delivered', 'failed']
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Logistics Requests</h1>
          <p className="text-ink-400 text-sm mt-0.5">{requests.filter(r => r.status === 'pending').length} pending assignment</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-surface-200 text-ink-500 hover:bg-surface-50'}`}>
            {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            {s !== 'all' && <span className="ml-1.5 opacity-70">{requests.filter(r => r.status === s).length}</span>}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">◎</p>
            <p className="text-ink-500 font-medium">No requests found</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map(r => (
              <div key={r.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-900 text-sm">{r.orders?.customers?.full_name || '—'}</p>
                      <Badge status={r.status} />
                    </div>
                    <p className="text-xs text-ink-400 mt-1">{r.orders?.delivery_state} · {r.orders?.customers?.phone}</p>
                    <p className="text-xs text-ink-400">{r.orders?.customers?.address}</p>
                    <p className="text-xs text-brand-600 mt-1">From: {r.businesses?.name}</p>
                  </div>
                  <p className="text-xs text-ink-400 flex-shrink-0">{new Date(r.created_at).toLocaleDateString('en-NG')}</p>
                </div>

                {r.agents && (
                  <p className="text-xs text-ink-500">Agent: <span className="font-medium">{r.agents?.users?.full_name}</span></p>
                )}

                <button onClick={() => setTimelineOrderId(r.orders?.id)} className="text-xs text-brand-600 font-medium hover:underline">
                  🕐 View Timeline
                </button>

                {r.status === 'pending' && (
                  <select
                    onChange={e => assignAgent(r.id, e.target.value)}
                    defaultValue=""
                    className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white text-ink-700 w-full">
                    <option value="" disabled>Assign agent for {r.orders?.delivery_state}</option>
                    {agents
                      .filter(a => !r.orders?.delivery_state || a.states_covered?.includes(r.orders.delivery_state))
                      .map(a => (
                        <option key={a.id} value={a.id}>{a.users?.full_name} ({a.states_covered?.join(', ')})</option>
                      ))
                    }
                  </select>
                )}

                {r.status === 'assigned' && (
                  <button onClick={() => updateStatus(r.id, 'out_for_delivery')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 font-medium hover:bg-cyan-100">
                    Mark Out for Delivery
                  </button>
                )}

                {r.status === 'out_for_delivery' && (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => updateStatus(r.id, 'delivered')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100">
                        Mark Delivered ✓
                      </button>
                      <button onClick={() => updateStatus(r.id, 'failed', failReason[r.id] || 'Customer unavailable')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100">
                        Mark Failed ✗
                      </button>
                      <button onClick={() => { setRescheduleModal(r); setRescheduleForm({ date: '', notes: '' }) }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-medium hover:bg-amber-100">
                        📅 Log Reschedule
                      </button>
                    </div>
                    <input
                      className="input text-xs"
                      placeholder="Failure reason (optional)"
                      value={failReason[r.id] || ''}
                      onChange={e => setFailReason(f => ({ ...f, [r.id]: e.target.value }))}
                    />
                  </div>
                )}

                {r.failure_reason && (
                  <p className="text-xs text-red-500">Reason: {r.failure_reason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {timelineOrderId && (
        <OrderTimeline orderId={timelineOrderId} onClose={() => setTimelineOrderId(null)} />
      )}

      {rescheduleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
            <h3 className="font-semibold text-ink-900">Log Reschedule</h3>
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-sm font-medium text-amber-800">{rescheduleModal.orders?.customers?.full_name}</p>
              <p className="text-xs text-amber-600 mt-0.5">{rescheduleModal.orders?.delivery_state}</p>
            </div>
            <div>
              <label className="label">New Delivery Date</label>
              <input type="date" className="input" min={new Date().toISOString().split('T')[0]}
                value={rescheduleForm.date} onChange={e => setRescheduleForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Notes <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
              <textarea className="input" rows={2} value={rescheduleForm.notes}
                onChange={e => setRescheduleForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Customer travelling, back Tuesday" />
            </div>
            <p className="text-xs text-ink-400">This creates a redelivery follow-up and notifies the merchant's CS Rep.</p>
            <div className="flex gap-3">
              <button onClick={() => setRescheduleModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitReschedule} disabled={rescheduleSaving || !rescheduleForm.date} className="btn-primary flex-1">
                {rescheduleSaving ? 'Saving…' : 'Save Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}