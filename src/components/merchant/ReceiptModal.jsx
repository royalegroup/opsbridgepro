import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  generateReceiptNumber,
  generatePDFReceipt,
  generateWhatsAppReceipt,
  saveReceiptRecord,
  updateReceiptTracking,
} from '../../lib/receiptHelpers'

export default function ReceiptModal({ order, business, onClose }) {
  const { profile } = useAuth()
  const [receipt, setReceipt] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [whatsappText, setWhatsappText] = useState('')

  useEffect(() => { loadReceiptData() }, [order])

  async function loadReceiptData() {
    setLoading(true)

    // Load order items
    const { data: itemData } = await supabase
      .from('order_items')
      .select('*, products(name, selling_price)')
      .eq('order_id', order.id)
    if (itemData) setItems(itemData)

    // Check if receipt already exists
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('order_id', order.id)
      .maybeSingle()

    if (existingReceipt) {
      setReceipt(existingReceipt)
    } else {
      // Create new receipt record
      const receiptNumber = generateReceiptNumber()
      const newReceipt = await saveReceiptRecord({
        orderId: order.id,
        merchantId: order.merchant_id,
        generatedBy: profile.id,
        receiptNumber,
      })
      setReceipt(newReceipt)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (receipt && business) {
      const text = generateWhatsAppReceipt({ order, business, receipt, items })
      setWhatsappText(text)
    }
  }, [receipt, items, business])

  async function handleDownloadPDF() {
    const doc = generatePDFReceipt({ order, business, receipt, items })
    doc.save(`Receipt-${receipt.receipt_number}.pdf`)
    if (receipt?.id) await updateReceiptTracking(receipt.id, 'pdf_downloaded')
  }

  async function handleViewPDF() {
    const doc = generatePDFReceipt({ order, business, receipt, items })
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    if (receipt?.id) await updateReceiptTracking(receipt.id, 'pdf_downloaded')
  }

  async function handlePrintPDF() {
    const doc = generatePDFReceipt({ order, business, receipt, items })
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = url
    document.body.appendChild(iframe)
    iframe.onload = () => { iframe.contentWindow.print() }
    if (receipt?.id) await updateReceiptTracking(receipt.id, 'pdf_downloaded')
  }

  async function handleCopyWhatsApp() {
    await navigator.clipboard.writeText(whatsappText)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
    if (receipt?.id) await updateReceiptTracking(receipt.id, 'whatsapp_sent')
  }

  function handleSendWhatsApp() {
    const phone = order.customers?.phone?.replace(/\D/g, '')
    const intl = phone?.startsWith('0') ? '234' + phone.slice(1) : phone
    const encoded = encodeURIComponent(whatsappText)
    window.open(`https://wa.me/${intl}?text=${encoded}`, '_blank')
    if (receipt?.id) updateReceiptTracking(receipt.id, 'whatsapp_sent')
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-panel max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <div>
            <h3 className="font-semibold text-ink-900">Generate Receipt</h3>
            {receipt && <p className="text-xs text-ink-400 mt-0.5">{receipt.receipt_number}</p>}
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-600 text-xl">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-ink-400">Preparing receipt…</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Receipt preview */}
            <div className="bg-surface-50 rounded-2xl p-4 border border-surface-200">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-ink-900 text-sm">{business?.name}</p>
                <span className="badge bg-green-50 text-green-700">✅ Delivered</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-ink-400">Customer</span>
                  <span className="font-medium text-ink-700">{order.customers?.full_name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-400">Phone</span>
                  <span className="font-medium text-ink-700">{order.customers?.phone}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-400">State</span>
                  <span className="font-medium text-ink-700">{order.delivery_state}</span>
                </div>
                <div className="border-t border-surface-200 pt-1.5 mt-1.5">
                  {items.length > 0 ? items.map(i => (
                    <div key={i.id} className="flex justify-between text-xs">
                      <span className="text-ink-600">{i.products?.name} x{i.quantity}</span>
                      <span className="font-medium text-ink-900">₦{Number(i.unit_selling_price * i.quantity).toLocaleString()}</span>
                    </div>
                  )) : (
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-600">Order total</span>
                      <span className="font-medium text-ink-900">₦{Number(order.total_amount).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-surface-200">
                  <span className="text-ink-900">Total Paid</span>
                  <span className="text-brand-700">₦{Number(order.total_amount).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* PDF Actions */}
            <div>
              <p className="section-title mb-2">PDF Receipt</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={handleViewPDF} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-surface-200 hover:bg-surface-50 transition-colors">
                  <span className="text-xl">👁</span>
                  <span className="text-xs font-medium text-ink-700">View</span>
                </button>
                <button onClick={handleDownloadPDF} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-surface-200 hover:bg-surface-50 transition-colors">
                  <span className="text-xl">⬇️</span>
                  <span className="text-xs font-medium text-ink-700">Download</span>
                </button>
                <button onClick={handlePrintPDF} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-surface-200 hover:bg-surface-50 transition-colors">
                  <span className="text-xl">🖨️</span>
                  <span className="text-xs font-medium text-ink-700">Print</span>
                </button>
              </div>
            </div>

            {/* WhatsApp Actions */}
            <div>
              <p className="section-title mb-2">WhatsApp Receipt</p>
              <div className="bg-green-50 rounded-xl p-3 mb-3 border border-green-100">
                <p className="text-xs text-green-800 font-mono whitespace-pre-wrap leading-relaxed">{whatsappText}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleCopyWhatsApp}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${copied ? 'bg-green-50 text-green-700 border-green-200' : 'border-surface-200 text-ink-700 hover:bg-surface-50'}`}>
                  {copied ? '✅ Copied!' : '📋 Copy Text'}
                </button>
                <button onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                  💬 Send via WhatsApp
                </button>
              </div>
            </div>

            {/* Receipt metadata */}
            {receipt && (
              <div className="text-xs text-ink-400 pt-2 border-t border-surface-100 space-y-1">
                <p>Receipt: {receipt.receipt_number}</p>
                <p>Generated: {new Date(receipt.generated_at).toLocaleString('en-NG')}</p>
                {receipt.pdf_downloaded && <p className="text-brand-600">✓ PDF downloaded {receipt.pdf_downloaded_at ? new Date(receipt.pdf_downloaded_at).toLocaleString('en-NG') : ''}</p>}
                {receipt.whatsapp_sent && <p className="text-green-600">✓ WhatsApp sent {receipt.whatsapp_sent_at ? new Date(receipt.whatsapp_sent_at).toLocaleString('en-NG') : ''}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}