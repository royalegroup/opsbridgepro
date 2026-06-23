import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) { setError('Enter your email and password.'); return }
    setLoading(true); setError('')
    const { error } = await signIn(email, password)
    if (error) { setError(error.message); setLoading(false) }
  }

  function handleKey(e) { if (e.key === 'Enter') handleLogin() }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur border border-white/20 mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 14 L14 4 L24 14 L14 24 Z" stroke="white" strokeWidth="2" fill="none"/>
              <path d="M9 14 L14 9 L19 14 L14 19 Z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">OpsBridge Pro</h1>
          <p className="text-brand-300 text-sm mt-1">Where E-commerce Meets Logistics</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-panel">
          <h2 className="text-white font-semibold text-lg mb-5">Sign in to your account</h2>

          <div className="space-y-4">
            <div>
              <label className="label text-brand-200">Email address</label>
              <input
                type="email"
                className="input bg-white/10 border-white/20 text-white placeholder:text-brand-300 focus:ring-white/40"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div>
              <label className="label text-brand-200">Password</label>
              <input
                type="password"
                className="input bg-white/10 border-white/20 text-white placeholder:text-brand-300 focus:ring-white/40"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-white text-brand-800 font-semibold text-sm hover:bg-brand-50 active:bg-brand-100 transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>

        <p className="text-center text-brand-400 text-xs mt-6">
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  )
}
