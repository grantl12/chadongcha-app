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
    try:
        result = db.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    user_id = result.user.id if result.user else None
    if not user_id:
        raise HTTPException(status_code=400, detail="Signup failed")

    db.table("players").insert({
        "id": user_id,
        "username": body.username,
    }).execute()

    return {"user_id": user_id, "message": "Check your email to confirm your account"}


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
        if not auth_result.user:
            raise ValueError("no user in response")
        user_id = auth_result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = db.table("players").select("username, xp, level").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Player not found")

    return {
        "user_id": user_id,
        "username": result.data["username"],
        "xp": result.data["xp"],
        "level": result.data["level"],
    }
