import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { supabase } from './supabaseClient'
import AuthPage from './pages/AuthPage'
import PaywallPage from './pages/PaywallPage'
import StudioPage from './pages/StudioPage'
import './index.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const intent = localStorage.getItem('google_auth_intent')
        localStorage.removeItem('google_auth_intent')

        // Eğer "Giriş Yap" sekmesinden geldiyse ve hesap yeni oluşturulduysa engelle
        if (intent === 'login') {
          const createdAt = new Date(session.user.created_at).getTime()
          const now = Date.now()
          const isNewUser = (now - createdAt) < 30000

          if (isNewUser) {
            await supabase.auth.signOut()
            toast.error('Bu Google hesabı kayıtlı değil. Lütfen önce "Kayıt Ol" sekmesinden kayıt ol.')
            return
          }
        }

        // Kayıt sırasında username yazılmışsa profile'a kaydet
        const pendingUsername = localStorage.getItem('pending_username')
        localStorage.removeItem('pending_username')
        if (pendingUsername) {
          await supabase.from('profiles').upsert({
            id: session.user.id,
            email: session.user.email,
            username: pendingUsername,
            trial_used: false,
            is_subscribed: false
          })
        }
      }
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">🎵</div>
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#1a1a2e', color: '#fff', border: '1px solid #7c3aed' }
      }} />
      <Routes>
        <Route path="/" element={!session ? <AuthPage /> : <Navigate to="/studio" />} />
        <Route path="/paywall" element={session ? <PaywallPage session={session} /> : <Navigate to="/" />} />
        <Route path="/studio" element={session ? <StudioPage session={session} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
