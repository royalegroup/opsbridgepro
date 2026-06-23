const styles = {
  new:               'bg-blue-50 text-blue-700',
  assigned:          'bg-purple-50 text-purple-700',
  confirmed:         'bg-indigo-50 text-indigo-700',
  sent_to_logistics: 'bg-cyan-50 text-cyan-700',
  in_transit:        'bg-amber-50 text-amber-700',
  delivered:         'bg-green-50 text-green-700',
  failed:            'bg-red-50 text-red-700',
  cancelled:         'bg-gray-100 text-gray-500',
  pending:           'bg-amber-50 text-amber-700',
  out_for_delivery:  'bg-cyan-50 text-cyan-700',
  received:          'bg-green-50 text-green-700',
  dispatched:        'bg-blue-50 text-blue-700',
  low:               'bg-red-50 text-red-700',
  remitted:          'bg-green-50 text-green-700',
  settled:           'bg-emerald-50 text-emerald-700',
}

const labels = {
  new: 'New', assigned: 'Assigned', confirmed: 'Confirmed',
  sent_to_logistics: 'Sent to Logistics', in_transit: 'In Transit',
  delivered: 'Delivered', failed: 'Failed', cancelled: 'Cancelled',
  pending: 'Pending', out_for_delivery: 'Out for Delivery',
  received: 'Received', dispatched: 'Dispatched', low: 'Low Stock',
  remitted: 'Remitted', settled: 'Settled',
}

export default function Badge({ status }) {
  return (
    <span className={`badge ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  )
}
