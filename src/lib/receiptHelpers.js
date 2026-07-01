import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

/**
 * Generates a receipt number
 * Format: RCP-YYYYMM-XXXXX
 */
export function generateReceiptNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `RCP-${year}${month}-${random}`
}

/**
 * Generates PDF receipt and triggers download
 */
export function generatePDFReceipt({ order, business, receipt, items }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // Brand colors
  const brandColor = [79, 82, 229] // brand-600
  const inkDark = [15, 17, 23]
  const inkMid = [90, 96, 116]
  const inkLight = [155, 163, 184]
  const surfaceLight = [240, 242, 248]

  // Header background
  doc.setFillColor(...brandColor)
  doc.rect(0, 0, pageWidth, 35, 'F')

  // Business name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(business?.name || 'OpsBridge Pro', margin, y + 8)

  // Receipt label
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 200, 255)
  doc.text('OFFICIAL RECEIPT', margin, y + 15)

  // Receipt number top right
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text(receipt.receipt_number, pageWidth - margin, y + 8, { align: 'right' })
  doc.text(new Date(receipt.generated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }), pageWidth - margin, y + 15, { align: 'right' })

  y = 45

  // Customer section
  doc.setFillColor(...surfaceLight)
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F')

  doc.setTextColor(...inkMid)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO', margin + 4, y + 6)

  doc.setTextColor(...inkDark)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(order.customers?.full_name || 'Customer', margin + 4, y + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...inkMid)
  doc.text(order.customers?.phone || '', margin + 4, y + 19)
  if (order.customers?.address) {
    doc.text(order.customers.address, pageWidth - margin, y + 13, { align: 'right', maxWidth: contentWidth / 2 })
  }
  doc.text(order.delivery_state || '', pageWidth - margin, y + 19, { align: 'right' })

  y += 30

  // Order details header
  doc.setTextColor(...inkMid)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIPTION', margin, y)
  doc.text('QTY', pageWidth - margin - 45, y, { align: 'right' })
  doc.text('UNIT PRICE', pageWidth - margin - 22, y, { align: 'right' })
  doc.text('TOTAL', pageWidth - margin, y, { align: 'right' })

  y += 3
  doc.setDrawColor(...inkLight)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // Order items
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...inkDark)

  if (items && items.length > 0) {
    items.forEach(item => {
      const name = item.products?.name || 'Product'
      const qty = item.quantity || 1
      const unitPrice = item.unit_selling_price || 0
      const total = qty * unitPrice

      doc.text(name, margin, y)
      doc.text(String(qty), pageWidth - margin - 45, y, { align: 'right' })
      doc.text(`N${Number(unitPrice).toLocaleString()}`, pageWidth - margin - 22, y, { align: 'right' })
      doc.text(`N${Number(total).toLocaleString()}`, pageWidth - margin, y, { align: 'right' })
      y += 7
    })
  } else {
    doc.text('Order items', margin, y)
    doc.text(`N${Number(order.total_amount).toLocaleString()}`, pageWidth - margin, y, { align: 'right' })
    y += 7
  }

  y += 3
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Totals
  const subtotal = order.total_amount || 0
  const deliveryFee = order.total_delivery_fee || 0
  const grandTotal = subtotal

  doc.setFontSize(9)
  doc.setTextColor(...inkMid)
  doc.text('Subtotal', pageWidth - margin - 35, y)
  doc.setTextColor(...inkDark)
  doc.text(`N${Number(subtotal).toLocaleString()}`, pageWidth - margin, y, { align: 'right' })
  y += 6

  doc.setTextColor(...inkMid)
  doc.text('Delivery Fee', pageWidth - margin - 35, y)
  doc.setTextColor(22, 163, 74)
  doc.setFont('helvetica', 'bold')
  doc.text('FREE', pageWidth - margin, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 6

  // Grand total box
  doc.setFillColor(...brandColor)
  doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('AMOUNT PAID', margin + 4, y + 8)
  doc.text(`N${Number(grandTotal).toLocaleString()}`, pageWidth - margin - 4, y + 8, { align: 'right' })

  y += 20

  // Payment & delivery info
  doc.setFillColor(...surfaceLight)
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...inkMid)
  doc.text('PAYMENT METHOD', margin + 4, y + 6)
  doc.text('DELIVERY STATUS', pageWidth / 2 + 2, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...inkDark)
  doc.text('Pay on Delivery (COD)', margin + 4, y + 13)
  doc.setTextColor(22, 163, 74)
  doc.text('✓ Delivered', pageWidth / 2 + 2, y + 13)

  y += 26

  // Order reference
  doc.setTextColor(...inkMid)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`Order ID: ${order.id?.slice(0, 8).toUpperCase()}`, margin, y)
  doc.text(`Source: ${order.source || 'Direct'}`, pageWidth - margin, y, { align: 'right' })

  y += 8

  // Footer
  doc.setDrawColor(...inkLight)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  doc.setFontSize(7)
  doc.setTextColor(...inkMid)
  doc.text('Thank you for your purchase!', pageWidth / 2, y, { align: 'center' })
  y += 4
  doc.text('For enquiries, contact us via WhatsApp.', pageWidth / 2, y, { align: 'center' })
  y += 4
  doc.setTextColor(...inkLight)
  doc.text(`Receipt generated by OpsBridge Pro • ${new Date().toLocaleString('en-NG')}`, pageWidth / 2, y, { align: 'center' })

  return doc
}

/**
 * Generates WhatsApp receipt text
 */
export function generateWhatsAppReceipt({ order, business, receipt, items }) {
  const date = new Date(receipt.generated_at).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric'
  })

  const itemLines = items && items.length > 0
    ? items.map(i => `  • ${i.products?.name} x${i.quantity} — N${Number(i.unit_selling_price * i.quantity).toLocaleString()}`).join('\n')
    : `  • Order — N${Number(order.total_amount).toLocaleString()}`

  return `*${business?.name || 'OpsBridge Pro'} — Official Receipt*
━━━━━━━━━━━━━━━━━━━━━━━
*Receipt No:* ${receipt.receipt_number}
*Date:* ${date}
━━━━━━━━━━━━━━━━━━━━━━━
*Customer:* ${order.customers?.full_name}
*Phone:* ${order.customers?.phone}
*State:* ${order.delivery_state}
━━━━━━━━━━━━━━━━━━━━━━━
*ORDER DETAILS*
${itemLines}
━━━━━━━━━━━━━━━━━━━━━━━
*Delivery:* ${+order.total_delivery_fee > 0 ? `N${Number(order.total_delivery_fee).toLocaleString()}` : 'FREE'}
*TOTAL PAID:* N${Number(order.total_amount).toLocaleString()}
*Payment:* Pay on Delivery ✓
━━━━━━━━━━━━━━━━━━━━━━━
*Status:* ✅ Delivered
━━━━━━━━━━━━━━━━━━━━━━━
Thank you for shopping with us! 🙏`
}

/**
 * Saves receipt record to database
 */
export async function saveReceiptRecord({ orderId, merchantId, generatedBy, receiptNumber }) {
  const { data, error } = await supabase.from('receipts').insert({
    order_id: orderId,
    merchant_id: merchantId,
    receipt_number: receiptNumber,
    generated_by: generatedBy,
  }).select().single()

  if (error) {
    // If receipt already exists, fetch it
    if (error.code === '23505') {
      const { data: existing } = await supabase.from('receipts').select('*').eq('order_id', orderId).single()
      return existing
    }
    console.error('Receipt save error:', error)
    return null
  }
  return data
}

/**
 * Updates receipt tracking
 */
export async function updateReceiptTracking(receiptId, field) {
  await supabase.from('receipts').update({
    [field]: true,
    [`${field}_at`]: new Date().toISOString()
  }).eq('id', receiptId)
}