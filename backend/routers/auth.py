from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, EmailStr
from db import get_client

router = APIRouter()


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    username: str


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/signup")
async def signup(body: SignUpRequest):
    db = get_client()

    # Create a pre-confirmed user via the admin API — no verification email,
    # no "check your inbox" friction. Service key required (already in use).
    try:
        result = db.auth.admin.create_user({
            "email":         body.email,
            "password":      body.password,
            "email_confirm": True,
        })
    except Exception as e:
        detail = str(e).lower()
        if "already" in detail or "exists" in detail or "registered" in detail:
            raise HTTPException(status_code=409, detail="An account with that email already exists")
        raise HTTPException(status_code=400, detail=str(e))

    user_id = result.user.id if result.user else None
    if not user_id:
        raise HTTPException(status_code=400, detail="Signup failed")

    try:
        db.table("players").upsert({
            "id":       user_id,
            "username": body.username,
            "credits":  100,          # welcome bonus
        }, on_conflict="id").execute()
    except Exception as e:
        detail = str(e)
        if "username" in detail.lower():
            raise HTTPException(status_code=409, detail="Username already taken")
        raise HTTPException(status_code=500, detail="Could not create player profile")

    # Immediately issue a session so the mobile client can skip the sign-in step.
    try:
        signin = db.auth.sign_in_with_password({"email": body.email, "password": body.password})
        if signin.session is None:
            return {"user_id": user_id}
        return {
            "user_id":       user_id,
            "access_token":  signin.session.access_token,
            "refresh_token": signin.session.refresh_token,
        }
    except Exception:
        # Fallback — client can sign in separately (shouldn't normally happen)
        return {"user_id": user_id}


@router.post("/signin")
async def signin(body: SignInRequest):
    db = get_client()
    try:
        result = db.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    if not result.session or not result.user:
        raise HTTPException(status_code=401, detail="Sign in failed")

    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "user_id": result.user.id,
    }


@router.get("/me")
async def me_info(authorization: str = Header(...)):
    db = get_client()
    token = authorization.replace("Bearer ", "")
    try:
        auth_result = db.auth.get_user(token)
        if not auth_result or not auth_result.user:
            raise ValueError("no user in response")
        user_id = auth_result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = db.table("players") \
        .select("username, xp, level, credits, xp_boost_expires, scan_boost_expires, id_hints") \
        .eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Player not found")

    d = result.data
    return {
        "user_id":            user_id,
        "username":           d["username"],
        "xp":                 d["xp"],
        "level":              d["level"],
        "credits":            d.get("credits", 0),
        "xp_boost_expires":   d.get("xp_boost_expires"),
        "scan_boost_expires": d.get("scan_boost_expires"),
        "id_hints":           d.get("id_hints", 0),
    }


class PushTokenRequest(BaseModel):
    expo_push_token: str


@router.post("/push-token")
async def register_push_token(body: PushTokenRequest, authorization: str = Header(...)):
    """Register or update the player's Expo push token."""
    db = get_client()
    token = authorization.replace("Bearer ", "")
    try:
        auth_result = db.auth.get_user(token)
        if not auth_result or not auth_result.user:
            raise ValueError()
        player_id = auth_result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    db.table("players").update({"expo_push_token": body.expo_push_token}) \
        .eq("id", player_id).execute()
    return {"ok": True}
