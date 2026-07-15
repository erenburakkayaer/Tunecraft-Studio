from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import stripe
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from celery_app import process_audio_task
import tempfile
import shutil

load_dotenv()

app = FastAPI(title="Tunecraft API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://tunecraft.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth.split(" ")[1]
    try:
        user = supabase.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_user_profile(user_id: str):
    res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    return res.data


@app.get("/")
def root():
    return {"status": "Tunecraft API çalışıyor 🎵"}


@app.get("/user/status")
def user_status(user=Depends(get_user)):
    profile = get_user_profile(user.id)
    if not profile:
        # Create profile on first login (username'i user metadata'dan al)
        username = ""
        if user.user_metadata:
            username = user.user_metadata.get("username", "")
        supabase.table("profiles").insert({
            "id": user.id,
            "email": user.email,
            "username": username,
            "trial_used": False,
            "is_subscribed": False
        }).execute()
        return {"trial_used": False, "is_subscribed": False}
    return {
        "trial_used": profile.get("trial_used", False),
        "is_subscribed": profile.get("is_subscribed", False)
    }


@app.post("/process")
async def process(
    beat: UploadFile = File(...),
    vocal: UploadFile = File(...),
    preset: str = Form(...),
    user=Depends(get_user)
):
    profile = get_user_profile(user.id)

    # Check access
    if profile and profile.get("trial_used") and not profile.get("is_subscribed"):
        raise HTTPException(status_code=402, detail="Subscription required")

    # Save files temporarily
    with tempfile.TemporaryDirectory() as tmpdir:
        beat_path = f"{tmpdir}/beat{os.path.splitext(beat.filename)[1]}"
        vocal_path = f"{tmpdir}/vocal.webm"

        with open(beat_path, "wb") as f:
            shutil.copyfileobj(beat.file, f)
        with open(vocal_path, "wb") as f:
            shutil.copyfileobj(vocal.file, f)

        # Send to Celery queue
        task = process_audio_task.delay(beat_path, vocal_path, preset, user.id)
        result = task.get(timeout=120)  # Wait up to 2 minutes

    # Mark trial as used if not subscribed
    if profile and not profile.get("is_subscribed"):
        supabase.table("profiles").update({"trial_used": True}).eq("id", user.id).execute()

    return {"output_url": result["output_url"], "task_id": task.id}


@app.post("/create-checkout-session")
async def create_checkout(user=Depends(get_user)):
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": os.getenv("STRIPE_PRICE_ID"),
                "quantity": 1,
            }],
            mode="subscription",
            success_url="http://localhost:5173/studio?subscribed=true",
            cancel_url="http://localhost:5173/paywall",
            client_reference_id=user.id,
            customer_email=user.email,
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig, os.getenv("STRIPE_WEBHOOK_SECRET")
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id")
        if user_id:
            supabase.table("profiles").update({
                "is_subscribed": True,
                "stripe_customer_id": session.get("customer"),
                "trial_used": True
            }).eq("id", user_id).execute()

    elif event["type"] == "customer.subscription.deleted":
        customer_id = event["data"]["object"]["customer"]
        supabase.table("profiles").update({"is_subscribed": False}).eq(
            "stripe_customer_id", customer_id
        ).execute()

    return {"received": True}
