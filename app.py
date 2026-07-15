import streamlit as st
import librosa
import librosa.display
import soundfile as sf
import numpy as np
import matplotlib.pyplot as plt
import tempfile
import os
import io
import json
import psola
from pathlib import Path

# --- DEPENDENCIES ---
try:
    from pedalboard import Pedalboard, Compressor, Reverb, HighShelfFilter, LowShelfFilter, PeakFilter, Limiter
    PEDALBOARD_AVAILABLE = True
except ImportError:
    PEDALBOARD_AVAILABLE = False

try:
    from streamlit_mic_recorder import mic_recorder
    MIC_AVAILABLE = True
except ImportError:
    MIC_AVAILABLE = False

# --- CONFIG & STYLING ---
st.set_page_config(page_title="Tunecraft Studio", page_icon="🎤", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
.main { background-color: #07070f; }
.stApp { background: linear-gradient(135deg, #07070f 0%, #0d0d1f 50%, #07070f 100%); }
h1,h2,h3 { color:#fff !important; }

.hero-title {
    font-size:3.5rem; font-weight:900;
    background: linear-gradient(135deg,#7c3aed,#a855f7,#ec4899,#f97316);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    background-clip:text; line-height:1.1; margin-bottom: 0px;
}
.hero-sub { color:#888; font-size:1.1rem; margin-top:8px; }

.step-header { font-size:1.5rem; font-weight:800; color:#fff; border-bottom: 2px solid #2a2a4a; padding-bottom: 10px; margin-bottom: 20px; }

.artist-card-display {
    background: linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
    border:1px solid #7c3aed; border-radius:14px;
    padding:20px; text-align:center; box-shadow:0 0 20px rgba(124,58,237,0.4);
    margin-bottom: 20px;
}
.tag { display:inline-block; background:#1e1040; color:#a78bfa; border:1px solid #7c3aed; border-radius:20px; padding:2px 10px; font-size:0.7rem; margin:2px; }

/* Custom Sliders container */
.slider-container {
    background: #12121f; border: 1px solid #2a2a4a; border-radius: 10px; padding: 15px; margin-bottom: 15px;
}
.slider-title { font-weight: 700; color: #a855f7; font-size: 1.1rem; margin-bottom: 5px; }
.slider-desc { font-size: 0.8rem; color: #888; margin-bottom: 10px; }

/* Hide default streamlit button border for grid */
div[data-testid="stButton"] button {
    border-radius: 12px;
    border: 1px solid #2a2a4a;
    background: #12121f;
    color: white;
    height: auto;
    padding: 15px;
    transition: all 0.2s;
}
div[data-testid="stButton"] button:hover {
    border-color: #7c3aed;
    background: #1a1a2e;
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(124,58,237,0.2);
}
</style>
""", unsafe_allow_html=True)

# --- SESSION STATE ---
if 'step' not in st.session_state:
    st.session_state.step = 1
if 'audio_data' not in st.session_state:
    st.session_state.audio_data = None
if 'sample_rate' not in st.session_state:
    st.session_state.sample_rate = None
if 'source_label' not in st.session_state:
    st.session_state.source_label = None
if 'selected_preset_id' not in st.session_state:
    st.session_state.selected_preset_id = None

# --- SCALES ---
def build_scale(root, intervals):
    return [(root + i) % 12 for i in intervals]

SCALE_INTERVALS = {
    "Majör": [0,2,4,5,7,9,11], "Doğal Minör": [0,2,3,5,7,8,10],
    "Harmonik Minör": [0,2,3,5,7,8,11], "Pentatonik Min": [0,3,5,7,10],
    "Blues": [0,3,5,6,7,10], "Dorian": [0,2,3,5,7,9,10]
}
ROOTS = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
ROOT_MIDI = {"C":0,"C#":1,"D":2,"Eb":3,"E":4,"F":5,"F#":6,"G":7,"Ab":8,"A":9,"Bb":10,"B":11}

SCALES = {"Kromatik (Tüm Notalar)": None}
for root in ROOTS:
    for mode, intervals in SCALE_INTERVALS.items():
        SCALES[f"{root} {mode}"] = build_scale(ROOT_MIDI[root], intervals)

# --- LOAD PRESETS ---
@st.cache_data
def load_presets():
    preset_dir = Path(__file__).parent / "backend" / "presets"
    presets = {}
    if preset_dir.exists():
        for f in preset_dir.glob("*.json"):
            try:
                with open(f, "r", encoding="utf-8") as fp:
                    data = json.load(fp)
                    presets[data["id"]] = data
            except Exception:
                pass
    return presets

PRESETS = load_presets()

# --- AUDIO PROCESSING ---
def closest_pitch(f0, scale):
    if np.isnan(f0): return np.nan
    midi_note = librosa.hz_to_midi(f0)
    if scale is None or len(scale) == 0: return librosa.midi_to_hz(round(midi_note))
    closest = min(scale, key=lambda x: abs((int(round(midi_note)) % 12) - x))
    octave = int(midi_note) // 12
    target_midi = octave * 12 + closest
    alts = [target_midi, target_midi + 12, target_midi - 12]
    target_midi = min(alts, key=lambda x: abs(x - midi_note))
    return librosa.midi_to_hz(target_midi)

def autotune(audio, sample_rate, scale_notes, retune_speed):
    frame_length = 2048
    hop_length = frame_length // 4
    fmin, fmax = librosa.note_to_hz('C2'), librosa.note_to_hz('C7')
    rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
    silence_threshold = np.percentile(rms, 20)
    
    f0, voiced_flag, _ = librosa.pyin(audio, frame_length=frame_length, hop_length=hop_length, sr=sample_rate, fmin=fmin, fmax=fmax)
    corrected_f0 = np.copy(f0)
    
    for i in range(len(f0)):
        rms_i = rms[i] if i < len(rms) else 0
        if np.isnan(f0[i]) or not voiced_flag[i] or rms_i < silence_threshold:
            corrected_f0[i] = np.nan
            continue
        target = closest_pitch(f0[i], scale_notes)
        corrected_f0[i] = f0[i] + (target - f0[i]) * retune_speed

    try:
        res = psola.vocode(audio, sample_rate=int(sample_rate), target_pitch=corrected_f0, fmin=fmin, fmax=fmax)
        if np.any(np.isnan(res)) or np.any(np.isinf(res)): return audio
        return res
    except Exception:
        return audio

def apply_mastering(audio, sample_rate, eq_high, comp_intensity, rev_size, rev_wet):
    if not PEDALBOARD_AVAILABLE: return audio
    board = Pedalboard([
        LowShelfFilter(cutoff_frequency_hz=100, gain_db=2.0),
        HighShelfFilter(cutoff_frequency_hz=8000, gain_db=eq_high),
        Compressor(threshold_db=-18.0 + (comp_intensity * -10.0), ratio=2.0 + (comp_intensity * 6.0), attack_ms=10.0, release_ms=150.0),
        Reverb(room_size=rev_size, damping=0.5, wet_level=rev_wet, dry_level=0.85, width=0.8),
        Limiter(threshold_db=-1.0, release_ms=100.0)
    ])
    audio_2d = audio.reshape(1, -1).astype(np.float32)
    return board(audio_2d, sample_rate).flatten()

# --- HEADER ---
st.markdown("""
<div style="text-align:center; padding:20px 0;">
    <div class="hero-title">🎤 Tunecraft Studio</div>
    <div class="hero-sub">Favori sanatçının vokal zincirini tek tıkla uygula.</div>
</div>
""", unsafe_allow_html=True)

# --- STEP 1: UPLOAD AUDIO ---
if st.session_state.step == 1:
    st.markdown('<div class="step-header">Adım 1: Vokal Kaydını Ekle</div>', unsafe_allow_html=True)
    
    tab_up, tab_mic = st.tabs(["📁 Dosya Yükle", "🎙️ Mikrofon Kaydı"])
    
    with tab_up:
        uploaded_file = st.file_uploader("Vokal dosyanızı yükleyin (WAV, MP3, M4A)", type=["wav","mp3","ogg","m4a","aac"])
        if uploaded_file:
            with st.spinner("Ses yükleniyor..."):
                suffix = os.path.splitext(uploaded_file.name)[1] or ".wav"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(uploaded_file.getvalue())
                    tmp_path = tmp.name
                try:
                    data, sr = librosa.load(tmp_path, sr=None, mono=True)
                    st.session_state.audio_data = data
                    st.session_state.sample_rate = sr
                    st.session_state.source_label = uploaded_file.name
                    st.success(f"✅ {uploaded_file.name} başarıyla yüklendi!")
                    st.audio(uploaded_file)
                except Exception as e:
                    st.error(f"Yükleme hatası: {e}")
                finally:
                    if os.path.exists(tmp_path): os.unlink(tmp_path)

    with tab_mic:
        st.info("Sessiz bir ortamda mikrofonunuzu kullanarak vokal kaydedin.")
        if MIC_AVAILABLE:
            recorded = mic_recorder(start_prompt="🔴 Kayda Başla", stop_prompt="⏹️ Kaydı Durdur", key="mic_1")
            if recorded and recorded.get("bytes"):
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(recorded["bytes"])
                    tmp_path = tmp.name
                try:
                    data, sr = librosa.load(tmp_path, sr=None, mono=True)
                    st.session_state.audio_data = data
                    st.session_state.sample_rate = sr
                    st.session_state.source_label = "Mikrofon Kaydı"
                    st.success("✅ Kayıt alındı!")
                    st.audio(recorded["bytes"], format="audio/wav")
                except Exception as e:
                    st.error(f"Kayıt hatası: {e}")
                finally:
                    if os.path.exists(tmp_path): os.unlink(tmp_path)
        else:
            recorded = st.audio_input("Mikrofon ile kaydet", key="mic_fallback")
            if recorded:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(recorded.read())
                    tmp_path = tmp.name
                try:
                    data, sr = librosa.load(tmp_path, sr=None, mono=True)
                    st.session_state.audio_data = data
                    st.session_state.sample_rate = sr
                    st.session_state.source_label = "Mikrofon Kaydı"
                    st.success("✅ Kayıt alındı!")
                    st.audio(recorded.read(), format="audio/wav")
                except Exception as e:
                    st.error(f"Kayıt hatası: {e}")
                finally:
                    if os.path.exists(tmp_path): os.unlink(tmp_path)

    if st.session_state.audio_data is not None:
        st.write("")
        if st.button("İleri: Sanatçı Seçimine Geç ➡️", type="primary", use_container_width=True):
            st.session_state.step = 2
            st.rerun()

# --- STEP 2: SELECT ARTIST ---
elif st.session_state.step == 2:
    if st.button("⬅️ Geri: Ses Seçimi"):
        st.session_state.step = 1
        st.rerun()
        
    st.markdown('<div class="step-header">Adım 2: Sanatçı veya Tarz Seç</div>', unsafe_allow_html=True)
    
    col_search, col_tag = st.columns([2, 1])
    with col_search:
        search_q = st.text_input("🔍 Sanatçı Ara...", placeholder="Örn: Travis Scott, Ezhel, Drake...")
    with col_tag:
        all_tags = set()
        for p in PRESETS.values():
            all_tags.update(p.get("tags", []))
        tag_filter = st.selectbox("🏷️ Tarz Filtresi", ["Tümü"] + sorted(all_tags))

    filtered_presets = []
    for pid, p in PRESETS.items():
        match_search = search_q.lower() in p["name"].lower() if search_q else True
        match_tag = tag_filter == "Tümü" or tag_filter in p.get("tags", [])
        if match_search and match_tag:
            filtered_presets.append(p)
    
    st.write(f"**{len(filtered_presets)}** sonuç bulundu.")

    # Manuel Ayar Kartı
    st.markdown("### Özel Ayarlar")
    if st.button("⚙️ MANUEL AYARLAR (Kendi vokal zincirini yarat)", use_container_width=True):
        st.session_state.selected_preset_id = "manual"
        st.session_state.step = 3
        st.rerun()

    st.markdown("### Sanatçı Presetleri")
    
    # Create grid
    cols = st.columns(4)
    for i, p in enumerate(filtered_presets):
        col = cols[i % 4]
        with col:
            # Custom styled button for each artist
            if st.button(f"{p['emoji']} {p['name']}\n\n{p['genre']}", key=f"btn_{p['id']}", use_container_width=True):
                st.session_state.selected_preset_id = p["id"]
                st.session_state.step = 3
                st.rerun()

# --- STEP 3: PROFESSIONAL SETTINGS & RENDER ---
elif st.session_state.step == 3:
    if st.button("⬅️ Geri: Sanatçı Seçimi"):
        st.session_state.step = 2
        st.rerun()
        
    st.markdown('<div class="step-header">Adım 3: Profesyonel Kontrol Paneli</div>', unsafe_allow_html=True)
    
    is_manual = st.session_state.selected_preset_id == "manual"
    preset = PRESETS.get(st.session_state.selected_preset_id, None) if not is_manual else None

    # Top display card
    if preset:
        tags_html = " ".join([f'<span class="tag">{t}</span>' for t in preset.get("tags",[])])
        st.markdown(f"""
        <div class="artist-card-display">
            <div style="font-size:3rem;">{preset['emoji']}</div>
            <div style="font-size:1.5rem; font-weight:800; color:#fff;">{preset['name']}</div>
            <div style="color:#a855f7; font-weight:600; margin-bottom:10px;">{preset['genre']}</div>
            <div style="color:#aaa; font-size:0.9rem; margin-bottom:10px;">{preset['description']}</div>
            <div>{tags_html}</div>
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div class="artist-card-display">
            <div style="font-size:3rem;">⚙️</div>
            <div style="font-size:1.5rem; font-weight:800; color:#fff;">Manuel Stüdyo Modu</div>
            <div style="color:#aaa; font-size:0.9rem;">Tüm parametreleri kendi tarzınıza göre ince ayarlayın.</div>
        </div>
        """, unsafe_allow_html=True)

    # Defaults from preset or manual
    def_retune = preset["retune_speed"] if preset else 0.5
    def_scale = preset.get("scale", "Kromatik (Tüm Notalar)") if preset else "Kromatik (Tüm Notalar)"
    def_rev_size = preset["reverb"]["room_size"] if preset else 0.4
    def_rev_wet = preset["reverb"]["wet_level"] if preset else 0.2
    def_comp = (preset["compression"]["ratio"] - 1.0) / 19.0 if preset else 0.3
    def_high = preset["eq"]["high_shelf_gain_db"] if preset else 0.0

    st.markdown("### Vokal İşleme Zinciri (Vocal Chain)")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown('<div class="slider-container">', unsafe_allow_html=True)
        st.markdown('<div class="slider-title">🎵 Pitch Correction (Auto-Tune)</div>', unsafe_allow_html=True)
        st.markdown('<div class="slider-desc">Vokalin notalara kilitlenme hızı. Yüksek değerler robotik Travis Scott etkisi verir.</div>', unsafe_allow_html=True)
        
        # Determine scale index safely
        scale_keys = list(SCALES.keys())
        idx = scale_keys.index(def_scale) if def_scale in scale_keys else list(SCALES.keys()).index("Kromatik (Tüm Notalar)")
        
        scale_name = st.selectbox("Tonalite (Gam / Key)", options=scale_keys, index=idx)
        retune_val = st.slider("Retune Speed (0 = Doğal, 1 = Tam Robotik)", 0.0, 1.0, float(def_retune), 0.01)
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="slider-container">', unsafe_allow_html=True)
        st.markdown('<div class="slider-title">🎛️ Dinamik Kompresyon (Compression)</div>', unsafe_allow_html=True)
        st.markdown('<div class="slider-desc">Ses seviyelerini dengeler. Trap/Drill için yüksek, Akustik için düşük seçin.</div>', unsafe_allow_html=True)
        comp_val = st.slider("Compression Intensity", 0.0, 1.0, float(np.clip(def_comp, 0.0, 1.0)), 0.05)
        st.markdown('</div>', unsafe_allow_html=True)

    with col2:
        st.markdown('<div class="slider-container">', unsafe_allow_html=True)
        st.markdown('<div class="slider-title">🌌 Mekansal Derinlik (Reverb)</div>', unsafe_allow_html=True)
        st.markdown('<div class="slider-desc">Oda büyüklüğü ve yankı seviyesi. Geniş vokaller için yüksek değerler kullanın.</div>', unsafe_allow_html=True)
        rev_size_val = st.slider("Room Size (Decay Time)", 0.0, 1.0, float(def_rev_size), 0.05)
        rev_wet_val = st.slider("Reverb Mix (Wet Level)", 0.0, 1.0, float(def_rev_wet), 0.05)
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="slider-container">', unsafe_allow_html=True)
        st.markdown('<div class="slider-title">✨ Frekans Dengesi (EQ & Air)</div>', unsafe_allow_html=True)
        st.markdown('<div class="slider-desc">Vokale parlaklık ve hava katar. Pop/Modern Rap için yüksek tutun.</div>', unsafe_allow_html=True)
        eq_high_val = st.slider("High-End Air / Brightness (dB)", -5.0, 10.0, float(def_high), 0.5)
        st.markdown('</div>', unsafe_allow_html=True)

    st.write("")
    if st.button("🚀 SESİ İŞLE (RENDER)", type="primary", use_container_width=True):
        with st.spinner("🎧 Stüdyo sihirbazı devrede, lütfen bekleyin..."):
            try:
                scale_notes = SCALES[scale_name]
                
                # 1. Pitch Correction
                processed = autotune(st.session_state.audio_data, st.session_state.sample_rate, scale_notes, retune_val)
                
                # 2. Mastering
                processed = apply_mastering(
                    processed, st.session_state.sample_rate, 
                    eq_high=eq_high_val, comp_intensity=comp_val, 
                    rev_size=rev_size_val, rev_wet=rev_wet_val
                )
                
                # 3. Normalize
                max_val = np.max(np.abs(processed))
                if max_val > 0:
                    processed = processed / max_val * 0.95
                    
                # 4. Save to buffer
                out_buf = io.BytesIO()
                sf.write(out_buf, processed.astype(np.float32), int(st.session_state.sample_rate), format="WAV")
                processed_bytes = out_buf.getvalue()
                
                st.success("✅ İşlem başarıyla tamamlandı!")
                
                st.markdown("### 🔊 Sonuçları Karşılaştır")
                c1, c2 = st.columns(2)
                with c1:
                    st.markdown("**🎙️ Orijinal Ham Vokal**")
                    orig_buf = io.BytesIO()
                    sf.write(orig_buf, st.session_state.audio_data.astype(np.float32), int(st.session_state.sample_rate), format="WAV")
                    st.audio(orig_buf.getvalue(), format="audio/wav")
                with c2:
                    st.markdown("**✨ Mastered Vokal**")
                    st.audio(processed_bytes, format="audio/wav")
                    
                filename = f"tunecraft_{st.session_state.selected_preset_id}.wav"
                st.download_button(
                    label="📥 İŞLENMİŞ MASTER VOKALİ İNDİR (WAV)",
                    data=processed_bytes,
                    file_name=filename,
                    mime="audio/wav",
                    use_container_width=True
                )
                
                # Waveform visualization
                with st.expander("📊 Dalga Formu (Waveform) Analizi"):
                    fig, (ax1, ax2) = plt.subplots(2,1,figsize=(10,4))
                    fig.patch.set_facecolor("#07070f")
                    for ax, d, title, color in [(ax1, st.session_state.audio_data, "Orijinal", "#888"), (ax2, processed, "Mastered", "#a855f7")]:
                        ax.set_facecolor("#07070f")
                        librosa.display.waveshow(d, sr=st.session_state.sample_rate, ax=ax, color=color)
                        ax.set_title(title, color="white", fontsize=10)
                        ax.tick_params(colors="#555")
                        for spine in ax.spines.values(): spine.set_color("#222")
                    plt.tight_layout()
                    st.pyplot(fig)
                    
            except Exception as e:
                st.error(f"❌ İşlem sırasında hata oluştu: {str(e)}")