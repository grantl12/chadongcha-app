from fastapi import APIRouter, Header, HTTPException, Query
from db import get_client
from services.xp_service import get_orbital_boost

router = APIRouter()


@router.get("/boost")
async def orbital_boost_status(authorization: str = Header(...)):
    """Returns the player's current Orbital Boost status."""
    db = get_client()
    token = authorization.replace("Bearer ", "")
    try:
        auth_result = db.auth.get_user(token)
        if not auth_result or not auth_result.user:
            raise ValueError()
        player_id = auth_result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = get_orbital_boost(db, player_id)
    if not result:
        return {"active": False, "multiplier": 1.0, "remaining_min": 0}
    return {"active": True, "multiplier": result[0], "remaining_min": result[1]}


@router.get("/catchable")
async def catchable_objects(lat: float = Query(...), lon: float = Query(...)):
    """
    Returns space objects currently catchable overhead for the given position.
    The worker pre-computes these; this is just a read.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db = get_client()
    result = db.table("catchable_objects") \
        .select("*, space_objects(*)") \
        .lte("pass_start", now) \
        .gte("pass_end", now) \
        .execute()
    return result.data
