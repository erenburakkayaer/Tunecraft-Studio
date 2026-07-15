import os
import json
import subprocess
import tempfile
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "tunecraft",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Istanbul",
    enable_utc=True,
)

PRESETS_DIR = os.path.join(os.path.dirname(__file__), "presets")


@celery_app.task(name="process_audio_task")
def process_audio_task(beat_path: str, vocal_path: str, preset: str, user_id: str):
    """
    Merges beat + vocal using ffmpeg.
    In a full RVC setup, this would also apply the voice conversion preset.
    """
    preset_file = os.path.join(PRESETS_DIR, f"{preset}.json")
    preset_data = {}
    if os.path.exists(preset_file):
        with open(preset_file) as f:
            preset_data = json.load(f)

    output_path = tempfile.mktemp(suffix=".wav")

    # Mix beat + vocal with ffmpeg
    # vocal_volume based on preset (default 0.8), beat_volume default 0.6
    vocal_vol = preset_data.get("vocal_volume", 0.8)
    beat_vol = preset_data.get("beat_volume", 0.6)

    cmd = [
        "ffmpeg", "-y",
        "-i", beat_path,
        "-i", vocal_path,
        "-filter_complex",
        f"[0:a]volume={beat_vol}[a1];[1:a]volume={vocal_vol}[a2];[a1][a2]amix=inputs=2:duration=longest[aout]",
        "-map", "[aout]",
        "-ar", "44100",
        "-ac", "2",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"FFmpeg error: {result.stderr}")

    # TODO: Upload output_path to Supabase Storage and return public URL
    # For now return local file path (replace with actual upload in production)
    output_url = f"/outputs/{os.path.basename(output_path)}"

    return {"output_url": output_url, "preset_used": preset}
