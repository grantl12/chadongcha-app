"""
Orbital Boost inventory management.

POST /boosts/activate   — explicitly activate a boost (sets orbital_boost_expires_at on player).
                          Called when player taps "USE NOW" or "ACTIVATE" on a stored boost.
GET  /boosts/status     — returns the player's current orbital boost + stored inventory.
"""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta

from db import get_client
from services.xp_service import ORBITAL_BOOST_MULTIPLIERS

router = APIRouter()


class ActivatePayload(BaseModel):
    rarity_tier: str   # 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'


def _auth(db, authorization: str) -> str:
    """Resolve JWT → player_id or raise 401."""
    token = authorization.replace("Bearer ", "")
    try:
        res = db.auth.get_user(token)
        if not res or not res.user:
            raise ValueError("no user")
        return res.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/activate")
def activate_boost(body: ActivatePayload, authorization: str = Header(...)):
    """
    Activate an orbital boost for this player.
    Sets players.orbital_boost_expires_at to now + duration for the given rarity.
    Returns the new expiry + remaining minutes.
    """
    if body.rarity_tier not in ORBITAL_BOOST_MULTIPLIERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rarity_tier '{body.rarity_tier}'. Must be one of: {sorted(ORBITAL_BOOST_MULTIPLIERS)}",
        )

    db = get_client()
    player_id = _auth(db, authorization)

    multiplier, duration_min = ORBITAL_BOOST_MULTIPLIERS[body.rarity_tier]
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=duration_min)

    db.table("players").update({
        "orbital_boost_expires_at": expires_at.isoformat(),
    }).eq("id", player_id).execute()

    return {
        "active":          True,
        "multiplier":      multiplier,
        "duration_min":    duration_min,
        "expires_at":      expires_at.isoformat(),
        "remaining_min":   duration_min,
    }


@router.get("/status")
def boost_status(authorization: str = Header(...)):
    """Return the player's current orbital boost state."""
    from services.xp_service import get_orbital_boost
    db = get_client()
    player_id = _auth(db, authorization)
    result = get_orbital_boost(db, player_id)
    if not result:
        return {"active": False, "multiplier": 1.0, "remaining_min": 0}
    return {"active": True, "multiplier": result[0], "remaining_min": result[1]}
