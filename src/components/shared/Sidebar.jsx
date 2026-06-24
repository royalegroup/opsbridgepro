import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

const MERCHANT_NAV = [
  { label: 'Dashboard', icon: '◈', page: 'dashboard' },
  { label: 'Orders', icon: '◎', page: 'orders' },
  { label: 'Tasks', icon: '✓', page: 'tasks' },
  { label: 'Customers', icon: '◉', page: 'customers' },
  { label: 'Products', icon: '▣', page: 'products' },
  { label: 'Stock', icon: '⬡', page: 'stock' },
  { label: 'Finance', icon: '◆', page: 'finance' },
  { label: 'Reports', icon: '▦', page: 'reports' },
]

const LOGISTICS_NAV = [
  { label: 'Dashboard', icon: '◈', page: 'dashboard' },
  { label: 'Requests', icon: '◎', page: 'requests' },
  { label: 'Agents', icon: '◉', page: 'agents' },
  { label: 'Stock', icon: '⬡', page: 'stock' },
  { label: 'Deliveries', icon: '▣', page: 'deliveries' },
  { label: 'COD', icon: '◆', page: 'cod' },
  { label: 'Merchants', icon: '▦', page: 'merchants' },
  { label: 'Reports', icon: '◧', page: 'reports' },
]

const ROLE_NAV_FILTER = {
  owner: null,
  store_manager: ['dashboard', 'orders', 'customers', 'products', 'stock'],
  cs_rep: ['dashboard', 'orders', 'customers'],
  finance_officer: ['dashboard', 'finance', 'reports'],
  ops_manager: ['dashboard', 'requests', 'agents', 'stock', 'deliveries', 'cod'],
  logistics_finance: ['dashboard', 'cod', 'reports'],
}

export default function Sidebar({ activePage, onNavigate, businessType }) {
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const allNav = businessType === 'merchant' ? MERCHANT_NAV : LOGISTICS_NAV
  const allowed = ROLE_NAV_FILTER[profile?.role]
  const nav = allowed ? allNav.filter(n => allowed.includes(n.page)) : allNav

  const roleLabel = {
    owner: 'Owner',
    store_manager: 'Store Manager',
    cs_rep: 'CS Rep',
    finance_officer: 'Finance',
    ops_manager: 'Ops Manager',
    logistics_finance: 'Finance',
    agent: 'Delivery Agent',
  }[profile?.role] || profile?.role

  const businessLabel = businessType === 'merchant' ? '🛍' : '🚚'

  function NavContent() {
    return (
      <div className="flex flex-col h-full">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              ◈
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink-900 text-sm leading-tight">OpsBridge Pro</p>
              <p className="text-xs text-ink-400 truncate">{businessLabel} {profile?.businesses?.name}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(item => (
            <button
              key={item.page}
              onClick={() => { onNavigate(item.page); setMobileOpen(false) }}
              className={`nav-item w-full text-left ${activePage === item.page ? 'nav-item-active' : 'nav-item-inactive'}`}
            >
              <span className="text-base w-5 flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-surface-200">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-50">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
              {profile?.full_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-900 truncate">{profile?.full_name}</p>
              <p className="text-xs text-ink-400">{roleLabel}</p>
            </div>
            <button onClick={signOut} title="Sign out" className="text-ink-300 hover:text-danger transition-colors text-lg">⏻</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-surface-200 h-screen sticky top-0 flex-shrink-0">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-surface-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-bold">◈</div>
          <span className="font-bold text-ink-900 text-sm">OpsBridge Pro</span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-100 text-ink-700">
          ☰
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 bg-white h-full shadow-panel flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
              <span className="font-bold text-ink-900">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="text-ink-400 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavContent />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
