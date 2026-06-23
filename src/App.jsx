import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import Sidebar from './components/shared/Sidebar'

// Merchant pages
import MerchantDashboard from './pages/merchant/MerchantDashboard'
import OrdersPage from './pages/merchant/OrdersPage'
import CustomersPage from './pages/merchant/CustomersPage'
import ProductsPage from './pages/merchant/ProductsPage'
import StockPage from './pages/merchant/StockPage'
import FinancePage from './pages/merchant/FinancePage'
import ReportsPage from './pages/merchant/ReportsPage'

// Logistics pages
import LogisticsDashboard from './pages/logistics/LogisticsDashboard'
import RequestsPage from './pages/logistics/RequestsPage'
import AgentsPage from './pages/logistics/AgentsPage'
import StockManagementPage from './pages/logistics/StockManagementPage'
import CODPage from './pages/logistics/CODPage'
import MerchantsPage from './pages/logistics/MerchantsPage'
import LogisticsReportsPage from './pages/logistics/LogisticsReportsPage'

// Agent view
import AgentView from './pages/agent/AgentView'

const MERCHANT_PAGES = {
  dashboard: MerchantDashboard,
  orders: OrdersPage,
  customers: CustomersPage,
  products: ProductsPage,
  stock: StockPage,
  finance: FinancePage,
  reports: ReportsPage,
}

const LOGISTICS_PAGES = {
  dashboard: LogisticsDashboard,
  requests: RequestsPage,
  agents: AgentsPage,
  stock: StockManagementPage,
  deliveries: RequestsPage,
  cod: CODPage,
  merchants: MerchantsPage,
  reports: LogisticsReportsPage,
}

function AppContent() {
  const { session, profile, loading } = useAuth()
  const [activePage, setActivePage] = useState('dashboard')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white text-xl font-bold mx-auto mb-3 animate-pulse">◈</div>
          <p className="text-ink-400 text-sm">Loading OpsBridge Pro…</p>
        </div>
      </div>
    )
  }

  if (!session) return <LoginPage />

  // Agent gets their own mobile-optimised view
  if (profile?.role === 'agent') return <AgentView />

  // No profile yet (user exists in auth but not in users table)
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="card max-w-sm w-full text-center">
          <p className="text-3xl mb-3">⚠</p>
          <h2 className="font-bold text-ink-900 mb-2">Account not set up</h2>
          <p className="text-sm text-ink-500">Your account hasn't been linked to a business yet. Contact your administrator.</p>
        </div>
      </div>
    )
  }

  const businessType = profile.business_type
  const pages = businessType === 'merchant' ? MERCHANT_PAGES : LOGISTICS_PAGES
  const PageComponent = pages[activePage] || pages['dashboard']

  return (
    <div className="flex min-h-screen">
      <Sidebar activePage={activePage} onNavigate={setActivePage} businessType={businessType} />
      <main className="flex-1 min-w-0 lg:p-8 p-4 pt-20 lg:pt-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <PageComponent />
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
