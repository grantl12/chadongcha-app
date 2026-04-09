from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db import get_client
from services.xp_service import compute_xp, apply_xp
from services.territory_service import record_road_scan
from services.first_finder_service import check_first_finder

router = APIRouter()


class CatchPayload(BaseModel):
    generation_id: Optional[str] = None       # null = unknown vehicle
    variant_id: Optional[str] = None
    catch_type: str                            # highway | scan360 | space | unknown
    color: Optional[str] = None
    body_style: Optional[str] = None
    confidence: Optional[float] = None
    fuzzy_city: Optional[str] = None
    fuzzy_district: Optional[str] = None
    road_segment_id: Optional[str] = None
    space_object_id: Optional[str] = None
    caught_at: datetime
    # ALPR output — confidence boost only, plate NEVER in payload
    alpr_confidence_boost: Optional[float] = None


@router.post("")
async def ingest_catch(body: CatchPayload, authorization: str = Header(...)):
    db = get_client()

    # Resolve player from JWT
    token = authorization.replace("Bearer ", "")
    try:
        user = db.auth.get_user(token)
        player_id = user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Insert catch row
    catch_row = {
        "player_id": player_id,
        "generation_id": body.generation_id,
        "variant_id": body.variant_id,
        "catch_type": body.catch_type,
        "color": body.color,
        "body_style": body.body_style,
        "confidence": body.confidence,
        "fuzzy_city": body.fuzzy_city,
        "fuzzy_district": body.fuzzy_district,
        "road_segment_id": body.road_segment_id,
        "space_object_id": body.space_object_id,
        "caught_at": body.caught_at.isoformat(),
        "synced_at": datetime.utcnow().isoformat(),
    }
    result = db.table("catches").insert(catch_row).execute()
    catch_id = result.data[0]["id"]

    # XP computation
    xp_earned, xp_reasons = compute_xp(
        catch_type=body.catch_type,
        generation_id=body.generation_id,
        rarity_tier=_get_rarity(db, body.generation_id),
        is_personal_first=_is_personal_first(db, player_id, body.generation_id),
    )
    new_total_xp, level_up = apply_xp(db, player_id, xp_earned, catch_id, xp_reasons)

    # Territory
    road_king_claimed = False
    if body.road_segment_id:
        road_king_claimed = record_road_scan(db, player_id, body.road_segment_id)

    # First finder
    first_finder_awarded = None
    if body.generation_id:
        first_finder_awarded = check_first_finder(
            db, player_id, body.generation_id, body.variant_id,
            body.fuzzy_city, catch_id,
        )

    return {
        "catch_id": catch_id,
        "xp_earned": xp_earned,
        "new_total_xp": new_total_xp,
        "level_up": level_up,
        "road_king_claimed": road_king_claimed,
        "first_finder_awarded": first_finder_awarded,
    }


def _get_rarity(db, generation_id: Optional[str]) -> Optional[str]:
    if not generation_id:
        return None
    result = db.table("generations").select("rarity_tier").eq("id", generation_id).maybe_single().execute()
    return result.data["rarity_tier"] if result.data else None


def _is_personal_first(db, player_id: str, generation_id: Optional[str]) -> bool:
    if not generation_id:
        return False
    result = db.table("catches").select("id", count="exact") \
        .eq("player_id", player_id) \
        .eq("generation_id", generation_id) \
        .execute()
    return (result.count or 0) == 0
