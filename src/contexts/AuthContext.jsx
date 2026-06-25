import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(authId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, businesses!users_business_id_fkey(*)')
        .eq('auth_id', authId)
        .maybeSingle()

      if (data) setProfile(data)
      else console.warn('No profile found for auth_id:', authId)
    } catch (err) {
      console.error('fetchProfile error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Username login — looks up email from username then signs in
  async function signInWithUsername(username, password) {
    // Find user by username
    const { data: user, error: lookupError } = await supabase
      .from('users')
      .select('email, auth_id, is_active')
      .eq('username', username.toLowerCase().trim())
      .maybeSingle()

    if (lookupError || !user) {
      return { error: { message: 'Username not found. Please check and try again.' } }
    }

    if (!user.is_active) {
      return { error: { message: 'Your account has been deactivated. Contact your administrator.' } }
    }

    if (!user.auth_id) {
      return { error: { message: 'Your account credentials have not been set up yet. Contact your manager.' } }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signInWithUsername, signOut, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)