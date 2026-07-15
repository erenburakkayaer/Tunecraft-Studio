import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Mock client - Supabase henüz bağlanmadıysa çalışır
const mockClient = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ error: { message: 'Önce Supabase ayarlarını yap (.env dosyasını doldur)' } }),
    signUp: () => Promise.resolve({ error: { message: 'Önce Supabase ayarlarını yap (.env dosyasını doldur)' } }),
    signInWithOAuth: () => Promise.resolve({ error: null }),
    signOut: () => Promise.resolve(),
    getUser: () => Promise.resolve({ data: { user: null } }),
  },
}

const isConfigured = supabaseUrl && supabaseAnonKey &&
  supabaseUrl.startsWith('http') && supabaseAnonKey.length > 10

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: window.sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : mockClient
