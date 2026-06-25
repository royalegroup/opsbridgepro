import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { signInWithUsername } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username || !password) { setError('Enter your username and password.'); return }
    setLoading(true); setError('')

    // Store remember me preference
    if (remember) {
      localStorage.setItem('opsbridgepro_remember', username)
    } else {
      localStorage.removeItem('opsbridgepro_remember')
    }

    const { error } = await signInWithUsername(username, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  function handleKey(e) { if (e.key === 'Enter') handleLogin() }

  // Pre-fill username if remembered
  useState(() => {
    const saved = localStorage.getItem('opsbridgepro_remember')
    if (saved) setUsername(saved)
  })

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
              <label className="label text-brand-200">Username</label>
              <input
                type="text"
                autoComplete="username"
                className="input bg-white/10 border-white/20 text-white placeholder:text-brand-300 focus:ring-white/40"
                placeholder="your_username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>

            <div>
              <label className="label text-brand-200">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input bg-white/10 border-white/20 text-white placeholder:text-brand-300 focus:ring-white/40 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-300 hover:text-white transition-colors text-xs">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRemember(r => !r)}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${remember ? 'bg-brand-400' : 'bg-white/20'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${remember ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-brand-300 text-sm">Remember me</span>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-white text-brand-800 font-semibold text-sm hover:bg-brand-50 active:bg-brand-100 transition-colors disabled:opacity-60 mt-2">
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