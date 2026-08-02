/**
 * Converts an array of order objects into a CSV file and triggers download.
 * Escapes commas/quotes/newlines properly per CSV spec.
 */
function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportOrdersToCSV(orders, filename) {
  const headers = [
    'Order ID', 'Date', 'Status', 'Customer Name', 'Customer Phone',
    'Delivery State', 'Source', 'Assigned Rep', 'Total Amount',
    'Delivery Fee', 'Notes',
  ]

  const rows = orders.map(o => [
    o.id?.slice(0, 8).toUpperCase(),
    new Date(o.created_at).toLocaleDateString('en-NG'),
    o.status,
    o.customers?.full_name || '',
    o.customers?.phone || '',
    o.delivery_state || '',
    o.source || '',
    o.users?.full_name || '',
    o.total_amount || 0,
    o.total_delivery_fee || 0,
    o.notes || '',
  ])

  const csvContent = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(','))
  ].join('\n')

  // Prefix with BOM so Excel opens UTF-8 (₦ symbol etc.) correctly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}