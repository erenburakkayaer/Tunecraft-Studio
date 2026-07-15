import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import { get, set, clear } from 'idb-keyval'
import { ARTIST_MASTERING } from '../artistMastering'

const ALL_PRESETS = [
  '21_savage','2_chainz','50_cent','a_boogie_wit_da_hoodie','ab_soul','action_bronson',
  'aga_b','ais_ezhel','akon','aksan','alizade','allame','aminé','anil_piyanci','asap_rocky',
  'asil_slang','aspova','ati242','badshah','baneva','batuflex','ben_fero','benny_the_butcher',
  'berkay_duman','beta_berk_bayindir','big_sean','birdman','bixi_blake','bone_thugs_n_harmony',
  'bossy','burry_soprano','busta_rhymes','canbay_and_wolker','canka','cardi_b','cash_flow',
  'ceg','central_cee','ceza','chance_the_rapper','chief_keef','chris_brown','contra',
  'conway_the_machine','cordae','critical','d3','da_poet','dave','defkhan','denzel_curry',
  'destroy_lonely','dianz','divine','dj_artz','dj_khaled','dmx','doja_cat','don_toliver',
  'dr_dre','drake','eazy_e','eminem','ero','eypio','ezhel','farazi','ferzanbeats',
  'fivio_foreign','fredd','freddie_gibbs','french_montana','fuat_ergin','future','gazapizm',
  'grogi','gucci_mane','gunna','heijan','hidra','iann_dior','ice_cube','ice_spice',
  'i̇mpala','j_cole','jay_z','jefe','joey_badass','joker','joyner_lucas','juice_wrld',
  'juicy_j','kamufle','kanye','kanye_west','kars','kayra','keisan','ken_carson','kendrick',
  'kendrick_lamar','kezzo','khontkar','kid_cudi','killa_hakan','kodak_black','kodes_kahra',
  'kozmos','krs_one','kuty','latto','lil_baby','lil_durk','lil_pump','lil_skies','lil_tjay',
  'lil_uzi','lil_uzi_vert','lil_wayne','lil_yachty','lil_zey','logic','lvbel_c5','m_lisa',
  'mac_miller','mackberk','maestro','maho','maho_g','mali_green','massaka','mavi','mc_stan',
  'meek_mill','megan_thee_stallion','melo','mero','mero762','metro_boomin','mf_doom','migos',
  'mito','modd','moe_phoenix','motive','murda','muti','nas','nav','nba_youngboy','nf',
  'nicki_minaj','nle_choppa','no1','noisy','norm_ender','offset','organize','partynextdoor',
  'patron','playboi_carti','poizi','polo_g','pop_smoke','post_malone','pusha_t','quavo',
  'radansa','rakim','ravend','reckol','rich_the_kid','rick_ross','roddy_ricch','rota',
  'rozz_kalliope','ruby','russ','sagopa','sagopa_kajmer','saian','sam','samdan','saniser',
  'sayedar','schoolboy_q','sehinsah','sehinshah','server_uraz','skepta',
  'ski_mask_the_slump_god','slong','smokepurpp','snoop_dogg','stabil','stormzy','summer_cem',
  't_pain','takeoff','tank','tankurt_manas','tech_n9ne','tepki','the_notorious_big',
  'the_weeknd','three_6_mafia','ti','tory_lanez','travis_scott','trippie_redd','tupac','tyga',
  'tyler_creator','tyler_the_creator','uzi','velet','vesvas','vio','westside_gunn',
  'wiz_khalifa','wu_tang_clan','xir','xxxtentacion','yeat','yener_cevik','young_bego',
  'young_thug','yung_ouzo','zen_g'
]

const fmt = k => k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())

const fmtTime = s => {
  const m = Math.floor(s/60), sec = Math.floor(s%60), ms = Math.floor((s%1)*100)
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(2,'0')}`
}

function makeReverb(ctx, wet=0.3) {
  const dur=2, decay=2, sr=ctx.sampleRate
  const len=sr*dur, buf=ctx.createBuffer(2,len,sr)
  for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay)}
  const conv=ctx.createConvolver(); conv.buffer=buf
  const dry=ctx.createGain(); dry.gain.value=1-wet
  const wetG=ctx.createGain(); wetG.gain.value=wet
  return {conv,dry,wetG}
}

function audioBufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels,
      length = buffer.length * numOfChan * 2 + 44,
      bufferArray = new ArrayBuffer(length),
      view = new DataView(bufferArray),
      channels = [], i, sample, offset = 0, pos = 0;
  
  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
  setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
  setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true); pos += 2;
    }
    offset++;
  }
  return new Blob([bufferArray], { type: "audio/wav" });
}

window.onerror = function(msg, url, line) { toast.error("Hata: " + msg); };
window.addEventListener("unhandledrejection", function(e) {
  toast.error("Promise Hatası: " + (e.reason?.message || e.reason));
});

const ROOTS = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
const SCALES = ['Kromatik','Majör','Doğal Minör','Harmonik Minör','Pentatonik Min','Blues','Dorian']
const DEF_FX = {autotune:60,reverb:30,eqBass:0,eqMid:0,eqTreble:0,pitch:0,volume:100,atRoot:'C',atScale:'Kromatik'}
const uid = () => Math.random().toString(36).substr(2, 9)

function ClipView({ clip, buffer, zoom, clipHeight, onMouseDown, selected, tool }) {
  const canvasRef = useRef(null)
  
  useEffect(()=>{
    if(!buffer || !canvasRef.current) return
    const cv = canvasRef.current, ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0,0,cv.width,cv.height)
    const data = buffer.getChannelData(0)
    const startSample = Math.floor(clip.offset * buffer.sampleRate)
    const endSample = Math.floor((clip.offset + clip.duration) * buffer.sampleRate)
    const length = endSample - startSample
    if(length <= 0) return
    const step = Math.max(1, Math.floor(length / cv.width))
    const amp = cv.height / 2
    ctx.fillStyle = 'rgba(14, 165, 233, 0.85)'
    for(let i=0; i<cv.width; i++){
      let mn=0, mx=0
      const actualStep = Math.min(step, 1000) 
      const jump = Math.max(1, Math.floor(step / actualStep))
      for(let j=0; j<step; j+=jump){
        const idx = startSample + i*step + j
        if(idx >= data.length) break
        const v = data[idx]||0
        if(v<mn) mn=v
        if(v>mx) mx=v
      }
      const yTop = (1+mn)*amp
      const yBot = (1+mx)*amp
      const h = Math.max(2, yBot - yTop)
      ctx.fillRect(i, yTop, 1, h)
    }
  }, [buffer, clip.offset, clip.duration, zoom])

  const widthPx = Math.max(1, clip.duration * zoom);
  const canvasWidth = Math.min(widthPx, 4000);

  return (
    <div 
      className={`clip-box ${selected ? 'selected' : ''} ${tool === 'cut' ? 'tool-cut' : ''}`}
      style={{
        left: clip.startTime * zoom,
        width: widthPx,
        position: 'absolute',
        height: `${clipHeight}px`,
        backgroundColor: 'rgba(14,165,233,0.25)',
        border: selected ? '2px solid #0ea5e9' : '1px solid rgba(14,165,233,0.3)',
        borderRadius: '4px',
        overflow: 'hidden',
        cursor: tool === 'cut' ? 'crosshair' : 'grab'
      }}
      onMouseDown={(e)=>onMouseDown(e, clip)}
    >
      <div style={{fontSize:'10px', padding:'2px 4px', background:'var(--bg-glass)', position:'absolute', zIndex:2}}>{clip.name}</div>
      <canvas ref={canvasRef} width={canvasWidth} height={clipHeight} style={{position:'absolute', top:0, left:0, width: '100%', height: '100%'}}/>
    </div>
  )
}

function SubscriptionModal({onClose}) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:'24px',padding:'40px',maxWidth:'420px',width:'100%',boxShadow:'0 40px 100px rgba(0,0,0,0.15)',position:'relative'}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:'absolute',top:'16px',right:'16px',background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'#94a3b8'}}>✕</button>
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <div style={{fontSize:'48px',marginBottom:'12px'}}>🎵</div>
          <h2 style={{fontSize:'26px',fontWeight:'900',color:'#0f172a',marginBottom:'8px'}}>Tunecraft Pro</h2>
          <p style={{color:'#64748b',fontSize:'15px'}}>Sınırsız kayıt, tüm sanatçı presetleri ve daha fazlası.</p>
        </div>
        <div style={{background:'linear-gradient(135deg,#f0f9ff,#e0f2fe)',border:'2px solid #0ea5e9',borderRadius:'16px',padding:'24px',marginBottom:'24px',position:'relative'}}>
          <div style={{position:'absolute',top:'-1px',right:'20px',background:'#0ea5e9',color:'#fff',fontSize:'11px',fontWeight:'700',padding:'4px 14px',borderRadius:'0 0 10px 10px',textTransform:'uppercase',letterSpacing:'1px'}}>En Popüler</div>
          <div style={{display:'flex',alignItems:'baseline',gap:'4px',marginBottom:'16px'}}>
            <span style={{fontSize:'48px',fontWeight:'900',color:'#0f172a'}}>$10</span>
            <span style={{fontSize:'16px',color:'#64748b'}}>/ay</span>
          </div>
          <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'10px'}}>
            {['Sınırsız vokal kaydı','Tüm 200+ sanatçı preseti','Yüksek kalite WAV export','Profesyonel FX zinciri','Öncelikli destek'].map(f=>(
              <li key={f} style={{display:'flex',alignItems:'center',gap:'10px',color:'#334155',fontSize:'14px'}}>
                <span style={{color:'#10b981',fontWeight:'700'}}>✓</span>{f}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={()=>{ toast('Stripe ödeme sayfasına yönlendiriliyorsunuz...'); onClose(); }}
          style={{width:'100%',background:'linear-gradient(135deg,#0ea5e9,#38bdf8)',color:'#fff',border:'none',borderRadius:'12px',padding:'16px',fontSize:'16px',fontWeight:'700',cursor:'pointer',boxShadow:'0 4px 20px rgba(14,165,233,0.4)',marginBottom:'12px'}}
        >Üye Ol — $10/ay</button>
        <p style={{textAlign:'center',fontSize:'12px',color:'#94a3b8'}}>İstediğin zaman iptal edebilirsin. Gizli ücret yok.</p>
      </div>
    </div>
  )
}

function AccountDrawer({session, onClose, onLogout}) {
  const [tab, setTab] = useState('main')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState(session.user.user_metadata?.username || '')
  const [loading, setLoading] = useState(false)

  const handleChangePassword = async () => {
    if(!newPassword || newPassword.length < 6) { toast.error('Şifre en az 6 karakter olmalı'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if(error) toast.error(error.message)
    else { toast.success('Şifre güncellendi!'); setNewPassword(''); setTab('main') }
  }

  const handleChangeProfile = async () => {
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ data: { username: newName } })
    setLoading(false)
    if(error) toast.error(error.message)
    else { toast.success('Profil güncellendi!'); setTab('main') }
  }

  const handleDeleteAccount = async () => {
    if(!window.confirm('Hesabını silmek istediğine emin misin? Bu işlem geri alınamaz.')) return
    toast.error('Hesap silme için destek ekibiyle iletişime geç.')
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{background:'#fff',width:'340px',height:'100vh',boxShadow:'-8px 0 40px rgba(0,0,0,0.12)',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'20px 20px 16px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(135deg,#f0f9ff,#f8fafc)'}}>
          <div>
            <div style={{fontWeight:'800',fontSize:'16px',color:'#0f172a'}}>Hesap Ayarları</div>
            <div style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>{session.user.email}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'#94a3b8'}}>✕</button>
        </div>

        {tab === 'main' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'16px',gap:'8px'}}>
            <button onClick={()=>setTab('profile')} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'12px',cursor:'pointer',textAlign:'left',width:'100%'}}>
              <span style={{fontSize:'22px'}}>👤</span>
              <div><div style={{fontWeight:'600',fontSize:'14px',color:'#0f172a'}}>Bilgileri Değiştir</div><div style={{fontSize:'12px',color:'#64748b'}}>Kullanıcı adını güncelle</div></div>
            </button>
            <button onClick={()=>setTab('password')} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'12px',cursor:'pointer',textAlign:'left',width:'100%'}}>
              <span style={{fontSize:'22px'}}>🔑</span>
              <div><div style={{fontWeight:'600',fontSize:'14px',color:'#0f172a'}}>Şifre Değiştir</div><div style={{fontSize:'12px',color:'#64748b'}}>Hesap şifreni güncelle</div></div>
            </button>
            <div style={{flex:1}}/>
            <button onClick={onLogout} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'12px',cursor:'pointer',textAlign:'left',width:'100%'}}>
              <span style={{fontSize:'22px'}}>🚪</span>
              <div><div style={{fontWeight:'600',fontSize:'14px',color:'#ea580c'}}>Çıkış Yap</div><div style={{fontSize:'12px',color:'#9a3412'}}>Oturumu kapat</div></div>
            </button>
            <button onClick={handleDeleteAccount} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'#fff1f2',border:'1px solid #fecdd3',borderRadius:'12px',cursor:'pointer',textAlign:'left',width:'100%'}}>
              <span style={{fontSize:'22px'}}>🗑️</span>
              <div><div style={{fontWeight:'600',fontSize:'14px',color:'#e11d48'}}>Hesabı Sil</div><div style={{fontSize:'12px',color:'#9f1239'}}>Kalıcı olarak sil</div></div>
            </button>
          </div>
        )}

        {tab === 'password' && (
          <div style={{flex:1,padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
            <button onClick={()=>setTab('main')} style={{display:'flex',alignItems:'center',gap:'8px',background:'none',border:'none',color:'#0ea5e9',fontSize:'14px',cursor:'pointer',padding:0,fontWeight:'600'}}>← Geri</button>
            <h3 style={{fontSize:'18px',fontWeight:'700',color:'#0f172a'}}>Şifre Değiştir</h3>
            <input type="password" placeholder="Yeni şifre (min 6 karakter)" value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={{padding:'12px 16px',border:'1px solid #e2e8f0',borderRadius:'10px',fontSize:'14px',outline:'none',fontFamily:'inherit'}}/>
            <button onClick={handleChangePassword} disabled={loading} style={{padding:'13px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontWeight:'700',fontSize:'14px',cursor:'pointer',opacity:loading?0.6:1}}>{loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}</button>
          </div>
        )}

        {tab === 'profile' && (
          <div style={{flex:1,padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
            <button onClick={()=>setTab('main')} style={{display:'flex',alignItems:'center',gap:'8px',background:'none',border:'none',color:'#0ea5e9',fontSize:'14px',cursor:'pointer',padding:0,fontWeight:'600'}}>← Geri</button>
            <h3 style={{fontSize:'18px',fontWeight:'700',color:'#0f172a'}}>Bilgileri Değiştir</h3>
            <div style={{fontSize:'13px',color:'#64748b'}}>E-posta: <strong>{session.user.email}</strong></div>
            <input type="text" placeholder="Kullanıcı adı" value={newName} onChange={e=>setNewName(e.target.value)} style={{padding:'12px 16px',border:'1px solid #e2e8f0',borderRadius:'10px',fontSize:'14px',outline:'none',fontFamily:'inherit'}}/>
            <button onClick={handleChangeProfile} disabled={loading} style={{padding:'13px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontWeight:'700',fontSize:'14px',cursor:'pointer',opacity:loading?0.6:1}}>{loading ? 'Güncelleniyor...' : 'Profili Güncelle'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ArtistPicker({onSelect,onBack}) {
  const [q,setQ]=useState('')
  const list=['manuel', ...new Set(ALL_PRESETS)].filter(p=>fmt(p).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="picker-page">
      <div className="picker-topbar">
        <button className="picker-back" onClick={onBack}>← Geri</button>
        <h2>Sanatçı Seç</h2>
        <span className="picker-cnt">{list.length} sanatçı</span>
      </div>
      <div className="picker-search">
        <span>🔍</span>
        <input autoFocus placeholder="Sanatçı ara..." value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
      <div className="picker-grid">
        {list.map(p=>(
          <button key={p} className="picker-card" onClick={()=>onSelect(p)}>
            <span className="picker-avatar">{p==='manuel'?'⚙️':'🎤'}</span>
            <span className="picker-name">{p==='manuel'?'Manuel (Efektsiz)':fmt(p)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const STYLE_PRESETS = [
  {id:'natural',   name:'Natural',     emoji:'🌿', desc:'Doğal ve şeffaf'},
  {id:'warm',      name:'Warm',        emoji:'☀️', desc:'Sıcak ve dolgun'},
  {id:'punchy',    name:'Punchy',      emoji:'👊', desc:'Vurucu ve dinamik'},
  {id:'balanced',  name:'Balanced',    emoji:'⚖️', desc:'Dengeli ve temiz'},
  {id:'bright',    name:'Bright',      emoji:'💎', desc:'Parlak ve berrak'},
  {id:'deep',      name:'Deep',        emoji:'🌊', desc:'Derin ve geniş'},
  {id:'cinematic', name:'Cinematic',   emoji:'🎬', desc:'Sinematik ve epik'},
  {id:'loud',      name:'Loud',        emoji:'🔊', desc:'Güçlü ve baskın'},
]
const STYLE_MULT = {
  natural:{reverb:0.8,bass:0.5,treble:0.5},
  warm:   {reverb:0.9,bass:1.4,treble:0.4},
  punchy: {reverb:0.6,bass:1.6,treble:1.2},
  balanced:{reverb:1.0,bass:1.0,treble:1.0},
  bright: {reverb:0.7,bass:0.6,treble:1.8},
  deep:   {reverb:1.5,bass:1.3,treble:0.5},
  cinematic:{reverb:1.8,bass:1.1,treble:1.2},
  loud:   {reverb:0.8,bass:1.5,treble:1.5},
}
const INTENSITY_STEPS = ['Hafif','Orta','Normal','Güçlü','Yoğun']
const INTENSITY_VALS  = [0.4, 0.7, 1.0, 1.35, 1.8]

function MasterPresetPanel({track, onApply, onClose}) {
  const artistPreset = track?.preset ? ARTIST_MASTERING[track.preset] : null
  const [style, setStyle] = useState(null)
  const [intensity, setIntensity] = useState(2)
  const [inputGain, setInputGain] = useState(track?.fx?.volume ?? 100)
  const trackRef = useRef(null)

  const handleTrackClick = (e) => {
    const rect = trackRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    setIntensity(Math.round(pct * 4))
  }

  const apply = () => {
    if (!style) { toast('Bir ses stili seçin'); return }
    const base = artistPreset || {eqBass:2,eqMid:0,eqTreble:2,reverb:25,autotune:30}
    const iv = INTENSITY_VALS[intensity]
    const sm = STYLE_MULT[style.id]
    onApply({
      reverb:   Math.round(Math.min(100, base.reverb * sm.reverb * iv)),
      eqBass:   +((base.eqBass  * sm.bass   * iv).toFixed(1)),
      eqMid:    +((base.eqMid   * iv).toFixed(1)),
      eqTreble: +((base.eqTreble* sm.treble * iv).toFixed(1)),
      autotune: Math.round(base.autotune * iv),
      volume:   inputGain,
    })
    toast.success(`${style.name} — ${INTENSITY_STEPS[intensity]} uygulandı! ✨`)
  }

  const thumbPct = (intensity / 4) * 100

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.75)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div style={{background:'#ffffff',borderRadius:'24px',width:'100%',maxWidth:'540px',overflow:'hidden',boxShadow:'0 40px 100px rgba(0,0,0,0.35)'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'22px 24px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontWeight:'900',fontSize:'20px',color:'#0f172a',letterSpacing:'-0.5px'}}>Mastering</div>
            <div style={{fontSize:'13px',color:'#94a3b8',marginTop:'2px'}}>{track?.name}</div>
          </div>
          <button onClick={onClose} style={{width:'36px',height:'36px',borderRadius:'50%',background:'#f1f5f9',border:'none',fontSize:'16px',cursor:'pointer',color:'#64748b',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
        <div style={{padding:'18px 24px',borderBottom:'1px solid #f8fafc',background:'#fafbfc'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
            <span style={{fontWeight:'700',fontSize:'13px',color:'#334155'}}>Input Gain</span>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <button onClick={()=>setInputGain(100)} style={{fontSize:'12px',fontWeight:'700',color:'#0ea5e9',background:'#eff6ff',border:'none',borderRadius:'20px',padding:'4px 12px',cursor:'pointer'}}>Otomatik</button>
              <span style={{fontSize:'13px',fontWeight:'800',color:'#0f172a',minWidth:'40px',textAlign:'right'}}>{inputGain}%</span>
            </div>
          </div>
          <input type="range" min={0} max={200} value={inputGain} onChange={e=>setInputGain(+e.target.value)} style={{width:'100%',accentColor:'#0ea5e9',height:'6px',cursor:'pointer'}}/>
        </div>
        <div style={{padding:'18px 24px',borderBottom:'1px solid #f1f5f9'}}>
          <div style={{fontWeight:'700',fontSize:'13px',color:'#334155',marginBottom:'14px'}}>Ses Stili</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px'}}>
            {STYLE_PRESETS.map(p=>(
              <button key={p.id} onClick={()=>setStyle(p)} style={{padding:'14px 8px',borderRadius:'14px',border:'2px solid',cursor:'pointer',background:style?.id===p.id?'linear-gradient(135deg,#0ea5e9,#38bdf8)':'#f8fafc',borderColor:style?.id===p.id?'#0ea5e9':'#e2e8f0',display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',boxShadow:style?.id===p.id?'0 4px 16px rgba(14,165,233,0.35)':'none',transform:style?.id===p.id?'scale(1.03)':'scale(1)',transition:'all 0.18s'}}>
                <span style={{fontSize:'22px',lineHeight:'1'}}>{p.emoji}</span>
                <span style={{fontSize:'11px',fontWeight:'700',color:style?.id===p.id?'#fff':'#334155',lineHeight:'1'}}>{p.name}</span>
                <span style={{fontSize:'9px',color:style?.id===p.id?'rgba(255,255,255,0.8)':'#94a3b8',lineHeight:'1.2',textAlign:'center'}}>{p.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{padding:'18px 24px 20px',borderBottom:'1px solid #f1f5f9'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px'}}>
            <span style={{fontWeight:'700',fontSize:'13px',color:'#334155'}}>Yoğunluk</span>
            <span style={{fontSize:'13px',fontWeight:'800',color:'#0ea5e9'}}>{INTENSITY_STEPS[intensity]}</span>
          </div>
          <div style={{position:'relative',height:'28px',display:'flex',alignItems:'center',cursor:'pointer'}} ref={trackRef} onClick={handleTrackClick}>
            <div style={{position:'absolute',left:0,right:0,height:'4px',background:'#e2e8f0',borderRadius:'100px',overflow:'hidden'}}>
              <div style={{height:'100%',width:`${thumbPct}%`,background:'linear-gradient(90deg,#38bdf8,#0ea5e9)',borderRadius:'100px',transition:'width 0.15s'}}/>
            </div>
            {INTENSITY_STEPS.map((_,i)=>(
              <div key={i} onClick={e=>{e.stopPropagation();setIntensity(i)}} style={{position:'absolute',left:`${(i/4)*100}%`,transform:'translateX(-50%)',width:'12px',height:'12px',borderRadius:'50%',background:i<=intensity?'#0ea5e9':'#ffffff',border:'2px solid '+(i<=intensity?'#0ea5e9':'#cbd5e1'),cursor:'pointer',boxShadow:i===intensity?'0 0 0 4px rgba(14,165,233,0.2)':'none',transition:'all 0.15s',zIndex:2}}/>
            ))}
            <div style={{position:'absolute',left:`${thumbPct}%`,transform:'translateX(-50%)',width:'24px',height:'24px',borderRadius:'50%',background:'#0ea5e9',border:'3px solid #fff',boxShadow:'0 2px 8px rgba(14,165,233,0.5)',cursor:'grab',zIndex:3,transition:'left 0.15s'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:'10px'}}>
            {INTENSITY_STEPS.map((lbl,i)=>(
              <span key={i} onClick={()=>setIntensity(i)} style={{fontSize:'10px',fontWeight:intensity===i?'800':'500',color:intensity===i?'#0ea5e9':'#94a3b8',cursor:'pointer',transition:'color 0.15s'}}>{lbl}</span>
            ))}
          </div>
        </div>
        <div style={{padding:'18px 24px',display:'flex',gap:'12px'}}>
          <button onClick={onClose} style={{flex:1,padding:'14px',background:'#f1f5f9',border:'none',borderRadius:'12px',fontWeight:'600',fontSize:'14px',color:'#64748b',cursor:'pointer'}}>İptal</button>
          <button onClick={apply} style={{flex:2,padding:'14px',border:'none',borderRadius:'12px',fontWeight:'800',fontSize:'15px',color:'#fff',cursor:style?'pointer':'not-allowed',background:style?'linear-gradient(135deg,#0ea5e9,#38bdf8)':'#cbd5e1',boxShadow:style?'0 4px 20px rgba(14,165,233,0.4)':'none',transition:'all 0.2s'}}>{style ? `${style.emoji} Uygula` : 'Önce Stil Seç'}</button>
        </div>
      </div>
    </div>
  )
}

function FxDrawer({track, onChange, onClose}) {
  if(!track) return null
  const s=track.fx || {}
  const isBeat = track.type === 'beat'
  const sl=(label,key,min,max,unit='%')=>(
    <div className="fx-row">
      <span className="fx-label">{label}</span>
      <input type="range" min={min} max={max} value={s[key]} onChange={e=>onChange(key,+e.target.value)}/>
      <span className="fx-val">{s[key]}{unit}</span>
    </div>
  )
  return (
    <div className="fx-drawer">
      <div className="fx-header">
        <span>🎛 {isBeat ? '🥁 Beat' : '🎤 Vokal'} — {track.name} FX</span>
        <button onClick={onClose}>✕</button>
      </div>
      {!isBeat && sl('Reverb','reverb',0,100)}
      {!isBeat && sl('EQ Bass','eqBass',-12,12,'dB')}
      {!isBeat && sl('EQ Mid','eqMid',-12,12,'dB')}
      {!isBeat && sl('EQ Treble','eqTreble',-12,12,'dB')}
      {!isBeat && sl('Pitch','pitch',-12,12,'st')}
      {sl('Volume','volume',0,300)}
    </div>
  )
}

function AutotuneDrawer({track, onChange, onClose}) {
  if(!track) return null
  const s = track.fx || {}
  const root = s.atRoot || 'C'
  const scale = s.atScale || 'Kromatik'
  return (
    <div className="fx-drawer">
      <div className="fx-header">
        <span>🎵 Autotune — {track.name}</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="fx-row">
        <span className="fx-label">Yoğunluk</span>
        <input type="range" min={0} max={100} value={s.autotune??60} onChange={e=>onChange('autotune',+e.target.value)}/>
        <span className="fx-val">{s.autotune??60}%</span>
      </div>
      <div style={{marginTop:'14px',marginBottom:'8px'}}>
        <div style={{fontSize:'12px',fontWeight:'700',color:'var(--text-secondary)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.8px'}}>Kök Nota (Root)</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'5px'}}>
          {ROOTS.map(r=>(
            <button key={r} onClick={()=>onChange('atRoot',r)} style={{padding:'6px 4px',borderRadius:'8px',border:'1px solid',fontSize:'12px',fontWeight:'600',cursor:'pointer',background:root===r?'#0ea5e9':'var(--bg-glass)',borderColor:root===r?'#0ea5e9':'var(--border)',color:root===r?'#fff':'var(--text-primary)',transition:'all 0.15s'}}>{r}</button>
          ))}
        </div>
      </div>
      <div style={{marginTop:'14px'}}>
        <div style={{fontSize:'12px',fontWeight:'700',color:'var(--text-secondary)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.8px'}}>Gam / Tonalite</div>
        <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
          {SCALES.map(sc=>(
            <button key={sc} onClick={()=>onChange('atScale',sc)} style={{padding:'8px 14px',borderRadius:'8px',border:'1px solid',fontSize:'13px',fontWeight:'500',cursor:'pointer',textAlign:'left',background:scale===sc?'#0ea5e9':'var(--bg-glass)',borderColor:scale===sc?'#0ea5e9':'var(--border)',color:scale===sc?'#fff':'var(--text-primary)',transition:'all 0.15s'}}>
              {scale===sc ? '✓ ' : ''}{sc}
              {sc==='Kromatik' ? <span style={{fontSize:'10px',opacity:0.7}}> — Tüm notalar</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function StudioPage({session}) {
  const navigate = useNavigate()
  const [view,setView]=useState('studio')
  const [showSubModal, setShowSubModal] = useState(false)
  const [showAccountDrawer, setShowAccountDrawer] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  
  const [tracks, setTracks] = useState([])
  const [clips, setClips] = useState([])
  const [buffers, setBuffers] = useState({})
  
  const [zoom, setZoom] = useState(50)
  const [masterVolume, setMasterVolume] = useState(100)
  const [bpm, setBpm] = useState(120)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [metronome, setMetronome] = useState(false)
  const [masterPanelOpen, setMasterPanelOpen] = useState(false)
  const bpmRef = useRef(120)
  
  const undoStack = useRef([])
  const redoStack = useRef([])
  
  const saveHistory = (currentClips) => {
    undoStack.current.push([...currentClips])
    if(undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
  }

  const handleUndo = () => {
    if(undoStack.current.length === 0) return
    setClips(prev => { redoStack.current.push([...prev]); return undoStack.current.pop() })
  }

  const handleRedo = () => {
    if(redoStack.current.length === 0) return
    setClips(prev => { undoStack.current.push([...prev]); return redoStack.current.pop() })
  }
  
  const [isPlaying,setIsPlaying]=useState(false)
  const [isRecording,setIsRecording]=useState(false)
  const [position,setPosition]=useState(0)
  const [fxOpen,setFxOpen]=useState(false)
  const [autotuneOpen,setAutotuneOpen]=useState(false)
  const [editTrackId,setEditTrackId]=useState(null)
  const [activeTrackId,setActiveTrackId]=useState(null)
  const [selectedClipId, setSelectedClipId]=useState(null)
  const [clipboardClip, setClipboardClip]=useState(null)
  const [tool, setTool]=useState('select')
  const [isSubscribed,setIsSubscribed]=useState(false)
  const [trialUsed,setTrialUsed]=useState(false)

  const actxRef=useRef(null)
  const startTimeRef=useRef(0)
  const startOffsetRef=useRef(0)
  const positionRef=useRef(0)
  const rafRef=useRef(null)
  const sourceRefs=useRef({})
  const mediaRecRef=useRef(null)
  const chunksRef=useRef([])
  const masterGainRef=useRef(null)
  const trackGainRefs=useRef({})
  const selectedClipIdRef=useRef(null)
  const clipboardClipRef=useRef(null)
  const isPlayingRef=useRef(false)
  const playAllFreshRef=useRef(null)

  useEffect(()=>{ checkStatus() },[])
  useEffect(()=>{ selectedClipIdRef.current = selectedClipId },[selectedClipId])
  useEffect(()=>{ clipboardClipRef.current = clipboardClip },[clipboardClip])

  useEffect(() => {
    if (tracks.length > 0 || clips.length > 0) {
      set('tc_tracks', tracks)
      set('tc_clips', clips)
    }
  }, [tracks, clips])

  useEffect(() => {
    const loadProject = async () => {
      try {
        const savedTracks = await get('tc_tracks')
        const savedClips = await get('tc_clips')
        if (savedTracks && savedTracks.length > 0) setTracks(savedTracks)
        if (savedClips && savedClips.length > 0) {
          setClips(savedClips)
          const newBuffers = {}
          let loadedAny = false
          for (const clip of savedClips) {
            if (!newBuffers[clip.bufferId]) {
              const blob = await get(`audio_${clip.bufferId}`)
              if (blob) {
                const buf = await decode(blob)
                newBuffers[clip.bufferId] = buf
                loadedAny = true
              }
            }
          }
          if (loadedAny) {
            setBuffers(prev => ({...prev, ...newBuffers}))
            toast.success('Önceki proje geri yüklendi!', {position:'bottom-center'})
          }
        }
      } catch(err) { console.error('Proje geri yüklenemedi:', err) }
    }
    loadProject()
  }, [])

  const checkStatus=async()=>{
    try{
      const r=await fetch(`${import.meta.env.VITE_API_URL}/user/status`,{headers:{Authorization:`Bearer ${session.access_token}`}})
      if(r.ok){const d=await r.json();setTrialUsed(d.trial_used);setIsSubscribed(d.is_subscribed);if(d.trial_used&&!d.is_subscribed)navigate('/paywall')}
    }catch{}
  }

  const getCtx=()=>{
    if(!actxRef.current||actxRef.current.state==='closed') actxRef.current=new AudioContext()
    if(actxRef.current.state==='suspended') actxRef.current.resume()
    return actxRef.current
  }

  const decode=async(src)=>{
    const ctx=getCtx()
    const ab=src instanceof Blob ? await src.arrayBuffer() : await fetch(src).then(r=>r.arrayBuffer())
    return ctx.decodeAudioData(ab)
  }

  const stopAll=useCallback(()=>{
    Object.values(sourceRefs.current).forEach(s=>{try{s.stop()}catch{}})
    sourceRefs.current={}
    trackGainRefs.current={}
    masterGainRef.current=null
    if(mediaRecRef.current&&mediaRecRef.current.state!=='inactive') mediaRecRef.current.stop()
    cancelAnimationFrame(rafRef.current)
    isPlayingRef.current = false
    setIsPlaying(false)
    setIsRecording(false)
  },[])

  // ✅ playAllFresh — interval tabanlı metronom ile
  const playAllFresh = (startOffsetParam) => {
    stopAll()
    const ctx=getCtx()
    if(ctx.state==='suspended') ctx.resume().catch(e=>console.log(e))
    
    const safenum = (val, def=0) => { const n = Number(val); return (isNaN(n) || !isFinite(n)) ? def : n; }
    let startOffset = safenum(startOffsetParam !== undefined ? startOffsetParam : positionRef.current, 0)
    
    startTimeRef.current = ctx.currentTime
    startOffsetRef.current = startOffset
    trackGainRefs.current = {}

    const masterGain = ctx.createGain()
    masterGain.gain.value = safenum(masterVolume, 100) / 100
    masterGain.connect(ctx.destination)
    masterGainRef.current = masterGain

    clips.forEach(clip => {
      try {
        const track = tracks.find(t=>t.id===clip.trackId)
        const buffer = buffers[clip.bufferId]
        if(track && buffer) {
          const clipStart = safenum(clip.startTime, 0)
          const clipDur = safenum(clip.duration, 0)
          const clipOff = safenum(clip.offset, 0)
          if(clipStart + clipDur <= startOffset) return
          if(track.fx?.muted) return
          
          const gain=ctx.createGain(); gain.gain.value=track.fx?.muted ? 0 : safenum(track.fx?.volume, 100)/100
          trackGainRefs.current[track.id] = gain
          const bass=ctx.createBiquadFilter(); bass.type='lowshelf'; bass.frequency.value=200; bass.gain.value=safenum(track.fx?.eqBass, 0)
          const mid=ctx.createBiquadFilter(); mid.type='peaking'; mid.frequency.value=1000; mid.gain.value=safenum(track.fx?.eqMid, 0)
          const treb=ctx.createBiquadFilter(); treb.type='highshelf'; treb.frequency.value=4000; treb.gain.value=safenum(track.fx?.eqTreble, 0)
          const {conv,dry,wetG}=makeReverb(ctx, safenum(track.fx?.reverb, 30)/100)
          const src=ctx.createBufferSource(); src.buffer=buffer
          src.playbackRate.value=Math.pow(2, safenum(track.fx?.pitch, 0)/12)
          src.connect(bass); bass.connect(mid); mid.connect(treb)
          treb.connect(dry); dry.connect(gain)
          treb.connect(conv); conv.connect(wetG); wetG.connect(gain)
          gain.connect(masterGain)
          
          let playWhen = 0, bufOffset = clipOff, playDuration = clipDur
          if (startOffset > clipStart) {
            const diff = startOffset - clipStart
            bufOffset += diff; playDuration -= diff
          } else {
            playWhen = clipStart - startOffset
          }
          if (playDuration > 0 && bufOffset < buffer.duration) {
            src.start(ctx.currentTime + Math.max(0, playWhen), Math.max(0, bufOffset), playDuration)
            sourceRefs.current[`${clip.id}_${Date.now()}`] = src
          }
        }
      } catch (err) { console.error("Klip oynatılırken hata:", err) }
    })

    // ✅ METRONOM — interval tabanlı, canlı BPM güncellemeli
    if (metronome) {
      const metroStopped = { value: false }
      const scheduleAhead = 0.1
      const intervalMs = 25

      let currentBeatInt = 60 / Math.max(40, Math.min(240, bpmRef.current))
      const beatsElapsed = Math.floor(startOffset / currentBeatInt)
      let nextBeatTime = ctx.currentTime + (beatsElapsed * currentBeatInt - startOffset + currentBeatInt)
      if (nextBeatTime < ctx.currentTime) nextBeatTime += currentBeatInt
      let beatCount = beatsElapsed

      const scheduleMetro = () => {
        if (metroStopped.value) return

        // Her döngüde bpmRef'ten oku — canlı BPM değişimi çalışır
        currentBeatInt = 60 / Math.max(40, Math.min(240, bpmRef.current))

        while (nextBeatTime < ctx.currentTime + scheduleAhead) {
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          const isDown = beatCount % 4 === 0

          osc.type = 'square'
          osc.frequency.value = isDown ? 1000 : 600
          g.gain.setValueAtTime(0, ctx.currentTime)
          g.gain.setValueAtTime(isDown ? 0.3 : 0.15, nextBeatTime)
          g.gain.exponentialRampToValueAtTime(0.001, nextBeatTime + 0.05)

          osc.connect(g)
          g.connect(ctx.destination)
          osc.start(nextBeatTime)
          osc.stop(nextBeatTime + 0.06)

          nextBeatTime += currentBeatInt
          beatCount++
        }

        setTimeout(scheduleMetro, intervalMs)
      }

      scheduleMetro()
      sourceRefs.current['metro_stopper'] = { stop: () => { metroStopped.value = true } }
    }

    setIsPlaying(true)
    isPlayingRef.current = true
    const tick=()=>{
      const elapsed=ctx.currentTime-startTimeRef.current
      const p=startOffsetRef.current+elapsed
      positionRef.current=p; setPosition(p)
      rafRef.current=requestAnimationFrame(tick)
    }
    rafRef.current=requestAnimationFrame(tick)
  }

  useEffect(()=>{ bpmRef.current = bpm }, [bpm])
  useEffect(() => { playAllFreshRef.current = playAllFresh }, [clips, tracks, buffers, masterVolume, bpm, metronome])

  useEffect(()=>{
    const onKey = (e) => {
      if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if(e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        if(isPlayingRef.current) { stopAll(); positionRef.current=0; setPosition(0) }
        else playAllFreshRef.current && playAllFreshRef.current()
        return
      }
      if((e.ctrlKey || e.metaKey) && e.key === 'z') { if(e.shiftKey) handleRedo(); else handleUndo(); return }
      if((e.ctrlKey || e.metaKey) && e.key === 'y') { handleRedo(); return }
      if(e.key === 'Backspace' || e.key === 'Delete') {
        if(selectedClipIdRef.current) {
          setClips(p => { saveHistory(p); return p.filter(c => c.id !== selectedClipIdRef.current) })
          setSelectedClipId(null)
        }
      }
      if((e.ctrlKey || e.metaKey) && e.key === 'c') {
        setClips(p => {
          const clip = p.find(c => c.id === selectedClipIdRef.current)
          if(clip) { setClipboardClip(clip); toast('Klip kopyalandı 📋') }
          return p
        })
      }
      if((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if(clipboardClipRef.current && activeTrackId) {
          setClips(p => { saveHistory(p); return [...p, {...clipboardClipRef.current, id: uid(), trackId: activeTrackId, startTime: positionRef.current}] })
          toast('Klip yapıştırıldı 📎')
        } else if(!activeTrackId) { toast('Yapıştırmak için bir track seçin') }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTrackId, stopAll])

  const handleRecord=async()=>{
    if (!activeTrackId) { toast.error("Lütfen önce bir track seçin veya '+ Vokal Ekle' ile oluşturun."); return }
    stopAll()
    const ctx=getCtx()
    playAllFresh(positionRef.current)
    setIsRecording(true)
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      const mr=new MediaRecorder(stream)
      chunksRef.current=[]
      const recStartTime = positionRef.current
      if(isMonitoring) {
        const source = ctx.createMediaStreamSource(stream)
        const monitorGain = ctx.createGain()
        const track = tracks.find(t=>t.id===activeTrackId)
        monitorGain.gain.value = track ? (track.fx?.volume??100)/100 : 1
        if(track && track.fx) {
          const bass=ctx.createBiquadFilter(); bass.type='lowshelf'; bass.frequency.value=200; bass.gain.value=track.fx?.eqBass??0
          const mid=ctx.createBiquadFilter(); mid.type='peaking'; mid.frequency.value=1000; mid.gain.value=track.fx?.eqMid??0
          const treb=ctx.createBiquadFilter(); treb.type='highshelf'; treb.frequency.value=4000; treb.gain.value=track.fx?.eqTreble??0
          const {conv,dry,wetG}=makeReverb(ctx,(track.fx?.reverb??30)/100)
          source.connect(bass); bass.connect(mid); mid.connect(treb)
          treb.connect(dry); dry.connect(monitorGain)
          treb.connect(conv); conv.connect(wetG); wetG.connect(monitorGain)
        } else { source.connect(monitorGain) }
        monitorGain.connect(ctx.destination)
      }
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data)}
      mr.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop())
        try {
          const mime = mr.mimeType || 'audio/webm'
          const blob=new Blob(chunksRef.current, {type: mime})
          const buf=await decode(blob)
          if(buf) {
            const bufferId = uid()
            await set(`audio_${bufferId}`, blob)
            setBuffers(prev => ({...prev, [bufferId]: buf}))
            setClips(prev => { saveHistory(prev); return [...prev, {id: uid(), trackId: activeTrackId, bufferId, startTime: recStartTime, offset: 0, duration: buf.duration, name: 'Kayıt'}] })
            toast.success('Kayıt tamamlandı 🎤')
          }
        } catch(err) { console.error('Kayıt işleme hatası:', err); toast.error('Kayıt işlenemedi. Tarayıcı formatı desteklemiyor olabilir.') }
      }
      mr.start()
      mediaRecRef.current=mr
    } catch(err) { toast.error('Mikrofon erişimi reddedildi.'); setIsRecording(false); stopAll() }
  }

  const handleStop=()=>{ stopAll(); positionRef.current=0; setPosition(0) }

  const handleExport=async()=>{
    if (clips.length === 0) { toast.error('Dışa aktarılacak ses bulunamadı.'); return }
    const toastId = toast.loading('Sesler birleştiriliyor...')
    try {
      const maxTime = clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
      const dur = maxTime > 0 ? maxTime : 30
      const sr = 44100
      const oCtx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
      const offlineMasterGain = oCtx.createGain()
      offlineMasterGain.gain.value = masterVolume / 100
      offlineMasterGain.connect(oCtx.destination)
      clips.forEach(clip => {
        const track = tracks.find(t=>t.id===clip.trackId)
        const buffer = buffers[clip.bufferId]
        if(track && buffer && !track.fx?.muted) {
          const gain=oCtx.createGain(); gain.gain.value=(track.fx?.volume??100)/100
          const bass=oCtx.createBiquadFilter(); bass.type='lowshelf'; bass.frequency.value=200; bass.gain.value=track.fx?.eqBass??0
          const mid=oCtx.createBiquadFilter(); mid.type='peaking'; mid.frequency.value=1000; mid.gain.value=track.fx?.eqMid??0
          const treb=oCtx.createBiquadFilter(); treb.type='highshelf'; treb.frequency.value=4000; treb.gain.value=track.fx?.eqTreble??0
          const {conv,dry,wetG}=makeReverb(oCtx,(track.fx?.reverb??30)/100)
          const src=oCtx.createBufferSource(); src.buffer=buffer
          src.playbackRate.value=Math.pow(2,(track.fx?.pitch??0)/12)
          src.connect(bass); bass.connect(mid); mid.connect(treb)
          treb.connect(dry); dry.connect(gain)
          treb.connect(conv); conv.connect(wetG); wetG.connect(gain)
          gain.connect(offlineMasterGain)
          src.start(clip.startTime, clip.offset, clip.duration)
        }
      })
      const renderedBuffer = await oCtx.startRendering()
      const wavBlob = audioBufferToWav(renderedBuffer)
      const url = URL.createObjectURL(wavBlob)
      const a = document.createElement('a'); a.href = url; a.download = 'tunecraft_export.wav'; a.click()
      toast.success('Dışa aktarma tamamlandı! 💾', {id: toastId})
    } catch(err) { console.error(err); toast.error('Dışa aktarma sırasında hata oluştu.', {id: toastId}) }
  }

  const handleBeatUpload=async(e)=>{
    const target = e.target; const file = target.files[0]; target.value = ''
    if(!file) return
    const toastId = toast.loading('Beat yükleniyor...')
    try {
      const buf=await decode(file)
      const bufferId = uid()
      await set(`audio_${bufferId}`, file)
      setBuffers(prev => ({...prev, [bufferId]: buf}))
      const trackId = uid()
      setTracks(prev => [...prev, {id: trackId, type: 'beat', name: file.name, preset: null, fx: {...DEF_FX}}])
      setClips(prev => { saveHistory(prev); return [...prev, {id: uid(), trackId, bufferId, startTime: 0, offset: 0, duration: buf.duration, name: file.name}] })
      setActiveTrackId(trackId)
      toast.success(`Beat eklendi 🥁`, {id: toastId})
    } catch(err) { console.error(err); toast.error('Beat okunamadı, format desteklenmiyor olabilir', {id: toastId}) }
  }

  const handleVocalUpload=async(e, trackId)=>{
    const target = e.target; const file = target.files[0]; target.value = ''
    if(!file) return
    const toastId = toast.loading('Ses dosyası yükleniyor...')
    try {
      const buf=await decode(file)
      const bufferId = uid()
      await set(`audio_${bufferId}`, file)
      setBuffers(prev => ({...prev, [bufferId]: buf}))
      setClips(prev => { saveHistory(prev); return [...prev, {id: uid(), trackId, bufferId, startTime: positionRef.current, offset: 0, duration: buf.duration, name: file.name}] })
      toast.success(`Ses eklendi 🎤`, {id: toastId})
    } catch(err) { console.error(err); toast.error('Ses okunamadı, format desteklenmiyor olabilir', {id: toastId}) }
  }

  const handleArtistSelect=(preset)=>{
    if (editTrackId) {
      setTracks(p => p.map(t => t.id === editTrackId ? {...t, preset, name: `Vokal (${fmt(preset)})`} : t))
      setEditTrackId(null)
    } else {
      const trackId = uid()
      setTracks(prev => [...prev, {id: trackId, type: 'vocal', preset, name: `Vokal (${fmt(preset)})`, fx: {...DEF_FX}}])
      setActiveTrackId(trackId)
    }
    setView('studio')
    toast.success(`${fmt(preset)} seçildi! 🎤`)
  }

  const sortedTracks = [...tracks].sort((a, b) => {
    if (a.type === 'vocal' && b.type === 'beat') return -1
    if (a.type === 'beat' && b.type === 'vocal') return 1
    return 0
  })

  const trackHeight = Math.max(60, 72 + (zoom - 50) * 0.8)
  const clipHeight = Math.max(36, trackHeight - 24)

  const updateFx=(id,key,val)=>{
    setTracks(p=>p.map(t=>t.id===id?{...t,fx:{...t.fx,[key]:val}}:t))
    if(key==='volume' && trackGainRefs.current[id]) trackGainRefs.current[id].gain.value = val/100
    if(key==='muted' && trackGainRefs.current[id]) {
      const track = tracks.find(t=>t.id===id)
      trackGainRefs.current[id].gain.value = val ? 0 : (track?.fx?.volume ?? 100)/100
    }
  }

  const deleteTrack=(id)=>{
    setTracks(p=>p.filter(t=>t.id!==id))
    setClips(p=>p.filter(c=>c.trackId!==id))
    if(activeTrackId===id) setActiveTrackId(null)
  }

  const handleClipMouseDown = (e, clip) => {
    e.stopPropagation()
    setActiveTrackId(clip.trackId)
    if (tool === 'cut') {
      const rect = e.currentTarget.getBoundingClientRect()
      const cutTime = (e.clientX - rect.left) / zoom
      if(cutTime > 0.1 && cutTime < clip.duration - 0.1) {
        const clip1 = { ...clip, duration: cutTime }
        const clip2 = { ...clip, id: uid(), startTime: clip.startTime + cutTime, offset: clip.offset + cutTime, duration: clip.duration - cutTime }
        setClips(prev => { saveHistory(prev); return [...prev.filter(c=>c.id!==clip.id), clip1, clip2] })
      }
      return
    }
    setSelectedClipId(clip.id)
    saveHistory(clips)
    const startX = e.clientX
    const initialStartTime = clip.startTime
    const initialTrackId = clip.trackId
    const timelineElement = e.currentTarget.closest('.timeline-area')
    const onMouseMove = (moveEvent) => {
      const dt = (moveEvent.clientX - startX) / zoom
      let newStartTime = Math.max(0, initialStartTime + dt)
      let newTrackId = initialTrackId
      if (timelineElement) {
        const rect = timelineElement.getBoundingClientRect()
        const yInside = moveEvent.clientY - rect.top + timelineElement.scrollTop
        let trackIndex = Math.max(0, Math.min(sortedTracks.length - 1, Math.floor((yInside - 30) / trackHeight)))
        const potentialTrack = sortedTracks[trackIndex]
        const clipTrack = tracks.find(t=>t.id===clip.trackId)
        if (potentialTrack && potentialTrack.type === (clipTrack?.type || 'vocal')) newTrackId = potentialTrack.id
        const xInside = moveEvent.clientX - rect.left
        if (xInside < 50) timelineElement.scrollLeft -= Math.max(2, (50 - xInside) * 0.3)
        else if (xInside > rect.width - 50) timelineElement.scrollLeft += Math.max(2, (xInside - (rect.width - 50)) * 0.3)
      }
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: newStartTime, trackId: newTrackId } : c))
    }
    const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleTimelineClick = (e) => {
    if(e.target.className.includes('timeline-bg')) {
      const rect = e.currentTarget.getBoundingClientRect()
      const p = (e.clientX - rect.left + e.currentTarget.scrollLeft) / zoom
      positionRef.current = p; setPosition(p)
    }
  }

  const fxTrack=tracks.find(t=>t.id===activeTrackId)||null
  const maxTime = clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
  const duration = maxTime > position ? maxTime + 5 : position + 5

  const handleLogout=async()=>{ await clear(); await supabase.auth.signOut(); toast('Çıkış yapıldı') }
  const handleAddVocal = () => {
    const trackId = uid()
    setTracks(prev => [...prev, {id: trackId, type: 'vocal', preset: 'manuel', name: `Vokal (Manuel (Efektsiz))`, fx: {...DEF_FX}}])
    setActiveTrackId(trackId)
  }

  if(view==='artist-picker') return <ArtistPicker onSelect={handleArtistSelect} onBack={()=>setView('studio')}/>

  return (
    <div className="daw" onClick={()=>menuOpen&&setMenuOpen(false)}>
      {showSubModal && <SubscriptionModal onClose={()=>setShowSubModal(false)}/>}
      {showAccountDrawer && <AccountDrawer session={session} onClose={()=>setShowAccountDrawer(false)} onLogout={async()=>{setShowAccountDrawer(false);await handleLogout()}}/>}

      <nav className="daw-nav" style={{position:'relative'}}>
        <span className="daw-brand">🎵 Tunecraft</span>
        <div className="daw-nav-right">
          {!isSubscribed&&(
            <button onClick={()=>setShowSubModal(true)} style={{background:'linear-gradient(135deg,#0ea5e9,#38bdf8)',color:'#fff',border:'none',borderRadius:'8px',padding:'6px 14px',fontSize:'13px',fontWeight:'700',cursor:'pointer',boxShadow:'0 2px 8px rgba(14,165,233,0.35)'}}>⭐ Üye Ol</button>
          )}
          <div>
            <button onClick={e=>{e.stopPropagation();setMenuOpen(!menuOpen)}} style={{background:'var(--bg-glass)',border:'1px solid var(--border)',borderRadius:'8px',padding:'8px 10px',cursor:'pointer',display:'flex',flexDirection:'column',gap:'4px',alignItems:'center',justifyContent:'center',width:'38px',height:'38px'}} title="Menü">
              <span style={{display:'block',width:'16px',height:'2px',background:'var(--text-primary)',borderRadius:'2px'}}></span>
              <span style={{display:'block',width:'16px',height:'2px',background:'var(--text-primary)',borderRadius:'2px'}}></span>
              <span style={{display:'block',width:'16px',height:'2px',background:'var(--text-primary)',borderRadius:'2px'}}></span>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:'60px',right:'16px',backgroundColor:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'14px',boxShadow:'0 12px 40px rgba(0,0,0,0.22)',minWidth:'210px',zIndex:9999,overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid #e2e8f0',fontSize:'12px',color:'#64748b',fontWeight:'600',backgroundColor:'#f8fafc'}}>{session.user.user_metadata?.username || session.user.email}</div>
          {!isSubscribed && <button onClick={()=>{setMenuOpen(false);setShowSubModal(true)}} style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',padding:'12px 16px',backgroundColor:'#eff6ff',border:'none',borderBottom:'1px solid #e2e8f0',cursor:'pointer',fontSize:'14px',fontWeight:'700',color:'#0ea5e9'}}>⭐ Üye Ol</button>}
          <button onClick={()=>{setMenuOpen(false);setShowAccountDrawer(true)}} style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',padding:'12px 16px',backgroundColor:'#ffffff',border:'none',borderBottom:'1px solid #e2e8f0',cursor:'pointer',fontSize:'14px',color:'#0f172a'}}>⚙️ Hesap Ayarları</button>
          <button onClick={()=>{setMenuOpen(false);handleLogout()}} style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',padding:'12px 16px',backgroundColor:'#fff1f2',border:'none',cursor:'pointer',fontSize:'14px',color:'#ef4444',fontWeight:'600'}}>🚪 Çıkış Yap</button>
        </div>
      )}

      <div className="transport">
        <div className="transport-left">
          <button className={`t-btn rec-btn ${isRecording?'active':''}`} onClick={isRecording?handleStop:handleRecord} title="Kayıt">🔴</button>
          <button className={`t-btn play-btn ${isPlaying?'active':''}`} onClick={async()=>{
            if(isPlaying) handleStop()
            else { const ctx=getCtx(); if(ctx.state==='suspended') await ctx.resume(); await new Promise(r=>setTimeout(r,50)); playAllFresh() }
          }} title="Oynat">{isPlaying?'⏸':'▶'}</button>
          <button className="t-btn" onClick={handleStop} title="Durdur">⏹</button>
          
          <div className="tool-selector" style={{marginLeft:'20px',display:'flex',gap:'5px',alignItems:'center'}}>
            <button className={`t-btn ${tool==='select'?'active':''}`} onClick={()=>setTool('select')} title="Seçme / Taşıma">🖱</button>
            <button className={`t-btn ${tool==='cut'?'active':''}`} onClick={()=>setTool('cut')} title="Kesme">✂️</button>
            <div style={{width:'1px',height:'20px',background:'var(--border)',margin:'0 5px'}}></div>
            <button className="t-btn" onClick={handleUndo} title="Geri Al (Ctrl+Z)" style={{fontSize:'12px'}}>↩️</button>
            <button className="t-btn" onClick={handleRedo} title="İleri Al (Ctrl+Y)" style={{fontSize:'12px'}}>↪️</button>
            <div style={{width:'1px',height:'20px',background:'var(--border)',margin:'0 5px'}}></div>
            <button className={`t-btn ${isMonitoring?'active':''}`} onClick={()=>setIsMonitoring(!isMonitoring)} title="Canlı Dinleme">🎧</button>
            <button className={`t-btn ${metronome?'active':''}`} onClick={()=>setMetronome(!metronome)} title="Metronom Aç/Kapat" style={{fontSize:'14px'}}>⏱️</button>
            <input type="number" min={40} max={240} value={bpm} onChange={e=>{const v=Math.min(240,Math.max(40,Number(e.target.value)));setBpm(v);bpmRef.current=v}} style={{width:'46px',background:'var(--bg-glass)',border:'1px solid var(--border)',color:'var(--text-primary)',borderRadius:'4px',padding:'4px',fontSize:'12px',textAlign:'center'}} title="BPM"/>
            <div style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'14px',fontWeight:'700',fontFamily:'"Courier New", monospace',background:'var(--bg-glass)',padding:'4px 10px',borderRadius:'6px',border:'1px solid var(--border)',color:'var(--text-primary)',marginLeft:'10px'}}>
              {isRecording && <span style={{color:'var(--error)',animation:'recPulse 0.8s infinite'}}>● KAYIT</span>}
              <span>{fmtTime(position)}</span>
            </div>
          </div>
        </div>
        
        <div className="transport-right" style={{display:'flex',gap:'15px',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'10px',color:'var(--text-muted)'}}>
            <span title="Zoom">🔍</span>
            <input type="range" min="1" max="200" value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:'70px',height:'4px',accentColor:'#0ea5e9'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'10px',color:'var(--text-muted)'}}>
            <span title="Master Volume">🔊</span>
            <input type="range" min="0" max="300" value={masterVolume} onChange={e=>{const v=Number(e.target.value);setMasterVolume(v);if(masterGainRef.current)masterGainRef.current.gain.value=v/100}} style={{width:'70px',height:'4px',accentColor:'var(--primary)'}}/>
            <span style={{fontSize:'9px',minWidth:'28px'}}>{masterVolume}%</span>
          </div>
          <button className="t-btn" onClick={handleExport} title="Şarkıyı İndir">💾 İndir</button>
        </div>
      </div>

      <div className="tracks-timeline-wrap" style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div className="track-headers" style={{width:'220px',minWidth:'220px',background:'var(--bg-secondary)',borderRight:'1px solid var(--border)',overflowY:'auto',overflowX:'hidden'}}>
          {sortedTracks.map(track => (
            <div key={track.id} className={`track-head ${activeTrackId===track.id?'active':''}`} style={{height:`${trackHeight}px`,padding:'10px',display:'flex',alignItems:'center',borderBottom:'1px solid var(--border)',cursor:'pointer',background:activeTrackId===track.id?'var(--primary-glow)':'transparent',borderLeft:activeTrackId===track.id?'4px solid var(--primary)':'4px solid transparent'}} onClick={()=>setActiveTrackId(track.id)}>
              <span style={{fontSize:'20px',marginRight:'10px',cursor:track.type==='vocal'?'pointer':'default'}} onClick={()=>{if(track.type==='vocal'){setEditTrackId(track.id);setView('artist-picker')}}}>{track.type==='beat'?'🥁':'🎤'}</span>
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden',gap:'4px'}}>
                <div style={{fontWeight:'bold',fontSize:'14px',whiteSpace:'nowrap',textOverflow:'ellipsis',overflow:'hidden'}}>{track.name}</div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}} onClick={e=>e.stopPropagation()}>
                  <button style={{background:track.fx?.muted?'var(--error)':'var(--bg-glass)',border:'none',color:'var(--text-primary)',borderRadius:'3px',padding:'2px 6px',fontSize:'10px',cursor:'pointer'}} onClick={()=>updateFx(track.id,'muted',!track.fx?.muted)} title="Mute">M</button>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                {track.type === 'vocal' && (
                  <label style={{background:'transparent',border:'1px solid rgba(255,255,255,0.2)',color:'var(--text-primary)',borderRadius:'4px',padding:'2px 6px',fontSize:'10px',cursor:'pointer',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                    +Ses<input type="file" accept="audio/*" style={{display:'none'}} onChange={(e)=>handleVocalUpload(e,track.id)}/>
                  </label>
                )}
                <button style={{background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'12px'}} onClick={(e)=>{e.stopPropagation();deleteTrack(track.id)}}>✕</button>
              </div>
            </div>
          ))}
          <div style={{padding:'10px',display:'flex',gap:'10px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <button onClick={handleAddVocal} style={{flex:1,background:'var(--bg-glass)',border:'none',color:'var(--text-primary)',padding:'8px',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}}>+ Vokal</button>
            <label style={{flex:1,background:'var(--bg-glass)',border:'none',color:'var(--text-primary)',padding:'8px',borderRadius:'4px',cursor:'pointer',fontSize:'12px',textAlign:'center'}}>
              + Beat<input type="file" accept="audio/*" style={{display:'none'}} onChange={handleBeatUpload}/>
            </label>
          </div>
        </div>
        
        <div className="timeline-area" style={{flex:1,overflow:'auto',position:'relative',background:'var(--bg-primary)'}} onClick={handleTimelineClick}>
          <div style={{height:'30px',background:'var(--bg-glass)',position:'sticky',top:0,zIndex:10,borderBottom:'1px solid var(--border)',display:'flex',cursor:'pointer'}}
            onClick={e=>{
              const rect=e.currentTarget.getBoundingClientRect()
              const timelineArea=e.currentTarget.parentElement
              const clickX=e.clientX-rect.left+(timelineArea?timelineArea.scrollLeft:0)
              const p=Math.max(0,clickX/zoom)
              positionRef.current=p; setPosition(p)
            }}>
            {Array.from({length:Math.ceil(duration/(zoom<15?10:(zoom<40?5:1)))+1},(_,idx)=>{
              const i=idx*(zoom<15?10:(zoom<40?5:1))
              return (
                <div key={i} style={{position:'absolute',left:`${i*zoom}px`,top:'5px',fontSize:'10px',color:'var(--text-muted)',pointerEvents:'none'}}>
                  {fmtTime(i)}
                  <div style={{height:'5px',width:'1px',background:'var(--border)',marginTop:'2px'}}/>
                </div>
              )
            })}
            <div style={{position:'absolute',left:`${position*zoom}px`,top:0,bottom:'-2000px',width:'2px',background:'#ff3366',zIndex:20,pointerEvents:'none'}}/>
          </div>

          <div style={{position:'relative',minWidth:`${duration*zoom}px`,width:'100%'}} className="timeline-bg">
            {sortedTracks.map(track => (
              <div key={track.id} style={{height:`${trackHeight}px`,borderBottom:'1px solid rgba(255,255,255,0.05)',position:'relative',background:activeTrackId===track.id?'rgba(255,255,255,0.02)':'transparent'}}>
                {clips.filter(c=>c.trackId===track.id).map(clip => (
                  <ClipView key={clip.id} clip={clip} buffer={buffers[clip.bufferId]} zoom={zoom} clipHeight={clipHeight} selected={selectedClipId===clip.id} tool={tool} onMouseDown={handleClipMouseDown}/>
                ))}
              </div>
            ))}
            {tracks.length === 0 && (
              <div style={{padding:'20px',color:'rgba(255,255,255,0.3)',textAlign:'center',pointerEvents:'none'}}>Proje boş. Soldan + Beat veya + Vokal ekleyerek başlayın.</div>
            )}
          </div>
        </div>
      </div>

      {fxOpen&&(
        <div className="fx-overlay" onClick={()=>setFxOpen(false)}>
          <div className="fx-panel" onClick={e=>e.stopPropagation()}>
            {fxTrack ? <FxDrawer track={fxTrack} onChange={(k,v)=>updateFx(activeTrackId,k,v)} onClose={()=>setFxOpen(false)}/> : <div className="fx-empty"><p>Bir track seç</p><button onClick={()=>setFxOpen(false)}>Kapat</button></div>}
          </div>
        </div>
      )}
      
      {autotuneOpen&&(
        <div className="fx-overlay" onClick={()=>setAutotuneOpen(false)}>
          <div className="fx-panel" onClick={e=>e.stopPropagation()}>
            {fxTrack ? <AutotuneDrawer track={fxTrack} onChange={(k,v)=>updateFx(activeTrackId,k,v)} onClose={()=>setAutotuneOpen(false)}/> : <div className="fx-empty"><p>Bir track seç</p><button onClick={()=>setAutotuneOpen(false)}>Kapat</button></div>}
          </div>
        </div>
      )}

      {masterPanelOpen && (
        <MasterPresetPanel
          track={fxTrack || {name:'Vokal Track',preset:'',fx:{}}}
          onApply={(fxVals)=>{
            if(activeTrackId) { setTracks(p=>p.map(t=>t.id===activeTrackId?{...t,fx:{...t.fx,...fxVals}}:t)); toast.success('Mastering uygulandı!') }
            setMasterPanelOpen(false)
          }}
          onClose={()=>setMasterPanelOpen(false)}
        />
      )}

      <div style={{position:'fixed',bottom:'20px',right:'20px',display:'flex',flexDirection:'column',gap:'10px',zIndex:100,alignItems:'center'}}>
        {fxTrack?.type === 'vocal' && (
          <button onClick={()=>setAutotuneOpen(true)} style={{width:'56px',height:'56px',borderRadius:'50%',background:'#f0f9ff',border:'2px solid #0ea5e9',color:'#0ea5e9',fontSize:'10px',cursor:'pointer',boxShadow:'0 4px 12px rgba(14,165,233,0.3)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px'}}>
            <span style={{fontSize:'20px',lineHeight:'1'}}>🎵</span>
            <span style={{lineHeight:'1',fontSize:'9px',fontWeight:'700'}}>Tune</span>
          </button>
        )}
        {activeTrackId && (
          <button onClick={()=>setMasterPanelOpen(!masterPanelOpen)} style={{width:'56px',height:'56px',borderRadius:'50%',background:masterPanelOpen?'#0ea5e9':'#fff',border:'2px solid #0ea5e9',color:masterPanelOpen?'#fff':'#0ea5e9',fontSize:'10px',cursor:'pointer',boxShadow:'0 4px 12px rgba(14,165,233,0.3)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px'}}>
            <span style={{fontSize:'20px',lineHeight:'1'}}>🎛️</span>
            <span style={{lineHeight:'1',fontSize:'9px',fontWeight:'700'}}>Master</span>
          </button>
        )}
        <button onClick={()=>{if(!activeTrackId){toast.error('Bir track seçin');return}setFxOpen(true)}} style={{width:'56px',height:'56px',borderRadius:'50%',background:'var(--primary)',color:'white',border:'none',fontSize:'10px',cursor:'pointer',boxShadow:'0 4px 12px rgba(14,165,233,0.3)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px'}}>
          <span style={{fontSize:'20px',lineHeight:'1'}}>🎚️</span>
          <span style={{lineHeight:'1',fontSize:'9px',fontWeight:'700'}}>FX</span>
        </button>
      </div>
    </div>
  )
}