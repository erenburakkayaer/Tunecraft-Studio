import json
import os
from pathlib import Path
import random

ARTISTS = [
    # Türkçe
    "Ceza", "Sagopa Kajmer", "Ezhel", "Ben Fero", "Norm Ender", "Şehinşah", "Motive", "Lvbel C5", "Uzi", "Mero", "Murda", 
    "Gazapizm", "Contra", "No.1", "Khontkar", "Patron", "Allame", "Hidra", "Anıl Piyancı", "Server Uraz", "Joker", "Aspova", 
    "Fuat Ergin", "Şanışer", "Hayki", "Eypio", "Aga B", "Maho G", "Muti", "Mavi", "Burry Soprano", "Cash Flow", "Defkhan", 
    "Kamufle", "Tankurt Manas", "Kozmos", "Mito", "Killa Hakan", "Massaka", "Kezzo", "Tepki", "Ruby", "Baneva", "Rota", "Saian", 
    "Kayra", "Farazi", "Da Poet", "Ceg", "Mali Green", "Ravend", "Velet", "Xir", "Grogi", "Ais Ezhel", "FerzanBeats", 
    "Canbay & Wolker", "Yener Çevik", "Heijan", "Reckol", "Ati242", "Batuflex", "Critical", "Kuty", "Mero762", "Stabil", "Şam", 
    "Poizi", "D3", "Bixi Blake", "Lil Zey", "M Lisa", "Summer Cem", "ERO", "Moe Phoenix", "Maho", "Berkay Duman", "Melo", 
    "Kars", "Keişan", "Tank", "Maestro", "Modd", "Jefe", "Organize", "Aksan", "Asil Slang", "Young Bego", "Dianz", "Mackberk", 
    "Zen-G", "Şamdan", "Bossy", "Vio", "Canka", "Yung Ouzo", "Kodes Kahra", "Sayedar", "Radansa", "Beta Berk Bayındır", "DJ Artz", 
    "Fredd", "Slong", "Vesvas", "Alizade", "İmpala", "Noisy", "Rozz Kalliope",
    # Global
    "Drake", "Kendrick Lamar", "J. Cole", "Travis Scott", "Future", "Lil Uzi Vert", "Playboi Carti", "21 Savage", "Metro Boomin", 
    "Kanye West", "Eminem", "50 Cent", "Snoop Dogg", "Tupac", "The Notorious B.I.G.", "Nas", "Jay-Z", "Lil Baby", "Gunna", 
    "Young Thug", "Juice WRLD", "XXXTentacion", "Pop Smoke", "Central Cee", "Dave", "Stormzy", "Skepta", "A$AP Rocky", 
    "Tyler, The Creator", "Don Toliver", "Yeat", "Ken Carson", "Destroy Lonely", "Lil Durk", "Polo G", "Roddy Ricch", 
    "NBA YoungBoy", "Kodak Black", "Offset", "Quavo", "Takeoff", "Migos", "Chief Keef", "NLE Choppa", "Lil Tjay", 
    "A Boogie wit da Hoodie", "Trippie Redd", "NF", "Logic", "Joyner Lucas", "Cordae", "Mac Miller", "Post Malone", "The Weeknd", 
    "Chris Brown", "PARTYNEXTDOOR", "Tory Lanez", "Meek Mill", "Rick Ross", "Pusha T", "Schoolboy Q", "Ab-Soul", "Joey Bada$$", 
    "Denzel Curry", "Ski Mask The Slump God", "Lil Yachty", "Chance The Rapper", "Big Sean", "French Montana", "Tyga", 
    "Wiz Khalifa", "Kid Cudi", "Action Bronson", "Freddie Gibbs", "Benny The Butcher", "Westside Gunn", "Conway The Machine", 
    "Ice Cube", "Dr. Dre", "Eazy-E", "Ice Spice", "Nicki Minaj", "Cardi B", "Doja Cat", "Latto", "Megan Thee Stallion", "Lil Wayne", 
    "Birdman", "DJ Khaled", "Russ", "T.I.", "Gucci Mane", "2 Chainz", "Juicy J", "Three 6 Mafia", "Bone Thugs-n-Harmony", 
    "Tech N9ne", "Akon", "MC Stan", "Divine", "Badshah", "KRS-One", "Rakim", "MF DOOM", "Aminé", "Nav", "Lil Pump", "Smokepurpp", 
    "Lil Skies", "iann dior", "Rich The Kid", "Fivio Foreign", "Busta Rhymes", "DMX", "Wu-Tang Clan"
]

def make_id(name):
    return name.lower().replace(" ", "_").replace(".", "").replace("$", "s").replace(",", "").replace("-", "_").replace("ş", "s").replace("ı", "i").replace("ğ", "g").replace("ü", "u").replace("ö", "o").replace("ç", "c").replace("&", "and")

PRESETS_DIR = Path("backend/presets")
PRESETS_DIR.mkdir(parents=True, exist_ok=True)

# Some style templates for random assignment
STYLES = [
    {
        "genre": "Rap / Trap",
        "tags": ["trap", "modern", "auto-tune"],
        "retune_speed_range": (0.3, 0.8),
        "eq_low_shelf": (2.0, 4.0),
        "eq_high_shelf": (1.0, 3.0),
        "comp_ratio": (4.0, 6.0),
        "rev_wet": (0.2, 0.4),
        "emoji": "🔥"
    },
    {
        "genre": "Boom Bap / Old School",
        "tags": ["boom-bap", "classic", "raw"],
        "retune_speed_range": (0.01, 0.1),
        "eq_low_shelf": (0.5, 2.0),
        "eq_high_shelf": (0.0, 1.5),
        "comp_ratio": (2.5, 4.0),
        "rev_wet": (0.05, 0.15),
        "emoji": "🎤"
    },
    {
        "genre": "Drill",
        "tags": ["drill", "bass", "dark"],
        "retune_speed_range": (0.1, 0.3),
        "eq_low_shelf": (4.0, 6.0),
        "eq_high_shelf": (1.0, 2.0),
        "comp_ratio": (5.0, 7.0),
        "rev_wet": (0.15, 0.3),
        "emoji": "🔪"
    },
    {
        "genre": "Melodic / R&B",
        "tags": ["melodic", "smooth", "r&b"],
        "retune_speed_range": (0.4, 0.9),
        "eq_low_shelf": (1.5, 3.0),
        "eq_high_shelf": (2.0, 4.0),
        "comp_ratio": (3.0, 4.5),
        "rev_wet": (0.3, 0.6),
        "emoji": "🌊"
    }
]

SCALES = ["C Majör", "A Minör", "G Majör", "E Minör", "D Majör", "F Majör", "Kromatik (tüm notalar)"]
EMOJIS = ["🎵", "🎧", "🔊", "🎙️", "🎹", "🎸", "🌟", "⚡", "💥", "🚀"]

created_count = 0
for artist in ARTISTS:
    artist_id = make_id(artist)
    filepath = PRESETS_DIR / f"{artist_id}.json"
    
    if filepath.exists():
        continue
    
    style = random.choice(STYLES)
    emoji = style["emoji"] if random.random() > 0.5 else random.choice(EMOJIS)
    
    preset = {
        "id": artist_id,
        "name": artist,
        "emoji": emoji,
        "genre": style["genre"],
        "description": f"{artist} tarzında profesyonel olarak ayarlanmış vokal zinciri.",
        "retune_speed": round(random.uniform(*style["retune_speed_range"]), 2),
        "scale": random.choice(SCALES),
        "eq": {
            "low_shelf_hz": random.choice([60, 80, 100, 120]),
            "low_shelf_gain_db": round(random.uniform(*style["eq_low_shelf"]), 1),
            "high_shelf_hz": random.choice([8000, 10000, 12000]),
            "high_shelf_gain_db": round(random.uniform(*style["eq_high_shelf"]), 1),
            "mid_peak_hz": random.choice([500, 1000, 1500, 2000]),
            "mid_peak_gain_db": round(random.uniform(-2.0, 2.0), 1),
            "mid_peak_q": round(random.uniform(0.6, 1.0), 2)
        },
        "compression": {
            "threshold_db": round(random.uniform(-18.0, -10.0), 1),
            "ratio": round(random.uniform(*style["comp_ratio"]), 1),
            "attack_ms": round(random.uniform(5.0, 25.0), 1),
            "release_ms": round(random.uniform(100.0, 300.0), 1)
        },
        "reverb": {
            "room_size": round(random.uniform(0.1, 0.7), 2),
            "damping": round(random.uniform(0.4, 0.9), 2),
            "wet_level": round(random.uniform(*style["rev_wet"]), 2),
            "dry_level": round(random.uniform(0.7, 0.95), 2),
            "width": round(random.uniform(0.5, 1.0), 2)
        },
        "tags": style["tags"] + ["global" if "Drake" in ARTISTS[ARTISTS.index(artist):] and artist not in ARTISTS[:ARTISTS.index("Aga B")+1] else "türkçe"]
    }
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(preset, f, indent=2, ensure_ascii=False)
    created_count += 1

print(f"{created_count} yeni sanatçı preseti oluşturuldu.")
