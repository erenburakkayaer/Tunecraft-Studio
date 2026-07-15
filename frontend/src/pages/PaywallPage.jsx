import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

export default function PaywallPage({ session }) {
  const handleSubscribe = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error('Ödeme sistemi bağlanamadı.')
      }
    } catch {
      toast.error('Bir hata oluştu, tekrar dene.')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="paywall-page">
      <div className="paywall-card">
        <div className="paywall-icon">🔐</div>
        <h2>Ücretsiz deneme hakkın doldu</h2>
        <p>Tunecraft'ı kullanmaya devam etmek için abone ol. Tüm özelliklere sınırsız eriş.</p>

        <div className="plan-box">
          <div className="plan-badge">⭐ En Popüler</div>
          <div className="plan-price">$10<span>/ay</span></div>
          <ul className="plan-features">
            <li>Sınırsız ses işleme</li>
            <li>50+ sanatçı preset'i (Drake, Travis, Ezhel, Sagopa...)</li>
            <li>Beat + Vokal birleştirme stüdyosu</li>
            <li>Yüksek kalite ses çıktısı (WAV / MP3)</li>
            <li>Öncelikli işlem kuyruğu</li>
            <li>İstediğin zaman iptal et</li>
          </ul>
        </div>

        <button className="btn-primary" onClick={handleSubscribe}>
          💳 Şimdi Abone Ol — $10/ay
        </button>

        <button className="paywall-logout" onClick={handleLogout}>
          Çıkış yap
        </button>
      </div>
    </div>
  )
}
