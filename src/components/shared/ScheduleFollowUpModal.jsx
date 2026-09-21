import { useEffect, useState } from 'react'
import { getCurrentSchedule, scheduleFollowUp } from '../../lib/schedulingHelpers'

/**
 * The ONE shared reschedule UI, used identically by Merchant Orders, Royale
 * Requests, the Agent view, and Royale's Follow-ups/Tasks page. Do not build
 * a page-specific reschedule modal — extend this one's props instead.
 *
 * On mount, loads the order's current schedule (if any) and forces an
 * explicit "Keep Existing" / "Change Schedule" choice before allowing a new
 * date to be entered. On save, the underlying scheduleFollowUp() re-checks
 * for a conflicting change made elsewhere since this modal opened — if one
 * occurred, the fresh schedule is shown instead of overwriting it silently.
 */
export default function ScheduleFollowUpModal({
  order,              // { id, customerName }
  scope,              // 'merchant' | 'logistics'
  businessId,         // merchant_id or logistics_id owning the resulting task
  actorId,
  actorName,
  defaultAssignedTo,
  actionType,         // e.g. 'Attempt Redelivery', 'Call Customer'
  taskTitle,          // full title for the new task, built by the caller
  notifyRecipientId,
  notifyBusinessId,
  notifyMessage,
  helperText,
  priority = 'high',
  heading = 'Schedule Follow-Up',
  onClose,
  onSuccess,
}) {
  const [scheduleInfo, setScheduleInfo] = useState(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [confirmChange, setConfirmChange] = useState(false)
  const [form, setForm] = useState({ date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState('')

  useEffect(() => { if (order?.id) loadInfo() }, [order?.id])

  async function loadInfo() {
    setLoadingInfo(true)
    const info = await getCurrentSchedule(order.id)
    setScheduleInfo(info)
    setConfirmChange(false)
    setLoadingInfo(false)
  }

  const hasExisting = !!scheduleInfo?.next_follow_up_date
  const showDateForm = !loadingInfo && (!hasExisting || confirmChange)

  async function handleSave() {
    if (!form.date) return
    setSaving(true)
    setWarning('')
    const result = await scheduleFollowUp({
      orderId: order.id,
      newDate: form.date,
      reason: form.notes,
      actionType,
      assignedTo: defaultAssignedTo,
      scope,
      businessId,
      actorId,
      actorName,
      taskTitle,
      expectedSetAt: scheduleInfo?.next_follow_up_set_at || null,
      priority,
      notifyRecipientId,
      notifyBusinessId,
      notifyMessage,
    })
    setSaving(false)

    if (result?.conflict) {
      setScheduleInfo(result.current)
      setConfirmChange(false)
      setWarning('Someone else just set a different schedule for this order — review it below before proceeding.')
      return
    }
    if (result?.error) {
      setWarning(result.error)
      return
    }
    onSuccess?.()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-panel p-5 space-y-4">
        <h3 className="font-semibold text-ink-900">{heading}</h3>

        {order?.customerName && (
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-sm font-medium text-amber-800">{order.customerName}</p>
          </div>
        )}

        {warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-700 font-medium">{warning}</p>
          </div>
        )}

        {loadingInfo && (
          <p className="text-sm text-ink-400">Checking current schedule…</p>
        )}

        {!loadingInfo && hasExisting && !confirmChange && (
          <div className="space-y-3">
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-brand-800">Already scheduled</p>
              <p className="text-sm text-ink-900 mt-1">{new Date(scheduleInfo.next_follow_up_date).toLocaleDateString('en-NG')}</p>
              {scheduleInfo.next_action_type && <p className="text-xs text-ink-500 mt-0.5">Action: {scheduleInfo.next_action_type}</p>}
              {scheduleInfo.users?.full_name && (
                <p className="text-xs text-ink-400 mt-1">
                  Set by {scheduleInfo.users.full_name}
                  {scheduleInfo.next_follow_up_set_at ? ` · ${new Date(scheduleInfo.next_follow_up_set_at).toLocaleString('en-NG')}` : ''}
                </p>
              )}
              {scheduleInfo.next_follow_up_reason && <p className="text-xs text-ink-500 mt-1">"{scheduleInfo.next_follow_up_reason}"</p>}
            </div>
            <p className="text-xs text-ink-400">This order already has an active follow-up. Keep it, or change it to a new date?</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Keep Existing</button>
              <button onClick={() => setConfirmChange(true)} className="btn-primary flex-1">Change Schedule</button>
            </div>
          </div>
        )}

        {showDateForm && (
          <div className="space-y-4">
            <div>
              <label className="label">New Follow-Up Date</label>
              <input type="date" className="input" min={new Date().toISOString().split('T')[0]}
                value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Notes <span className="text-ink-300 font-normal normal-case">(optional)</span></label>
              <textarea className="input" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Customer travelling, back Tuesday" />
            </div>
            {helperText && <p className="text-xs text-ink-400">{helperText}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.date} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save Schedule'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}