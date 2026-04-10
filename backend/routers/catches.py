from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

from db import get_client
from services.xp_service import compute_xp, apply_xp, session_catch_count
from services.territory_service import record_road_scan
from services.first_finder_service import check_first_finder

# --- Dedup configuration ---
HASH_DEDUP_MIN_PLATE_CONFIDENCE = 0.85
HASH_DEDUP_WINDOW_HOURS         = 4

# Tier 2 fuzzy: highway only — same generation + district + tight window.
# NOT applied to scan360 (dealer lots have many identical cars legitimately).
FUZZY_DEDUP_WINDOW_MINUTES      = 20

# scan360 guard: minimum gap between 360° scans of the same generation.
# Walking around a car takes ~90s, so < 3 min = almost certainly same car.
SCAN360_MIN_GAP_MINUTES         = 3

# Diminishing XP: same generation caught multiple times in a 24h window.
# Dealer visits are legitimate but shouldn't be an XP farm.
# Catches beyond these thresholds still record + contribute to road king.
SESSION_WINDOW_HOURS            = 24

router = APIRouter()


@router.get("/recent")
async def recent_catches(limit: int = 50):
    """Global activity feed — most recent catches from all players with vehicle + player info."""
    db = get_client()
    result = db.table("catches") \
        .select(
            "id, caught_at, catch_type, confidence, color, body_style, "
            "players(username), "
            "generations(common_name, rarity_tier, models(name, makes(name)))"
        ) \
        .not_.is_("generation_id", "null") \
        .order("caught_at", desc=True) \
        .limit(min(limit, 100)) \
        .execute()
    return result.data


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
    # ALPR output — confidence boost + dedup signals. Plate NEVER in payload.
    alpr_confidence_boost: Optional[float] = None
    # ALPR's confidence in its own plate character read (0.0–1.0).
    # Used to decide whether vehicle_hash is reliable enough for hash-based dedup.
    alpr_plate_confidence: Optional[float] = None
    # SHA-256 hash of plate, zeroed on-device immediately after hashing.
    # Only trusted for dedup when alpr_plate_confidence >= 0.85.
    vehicle_hash: Optional[str] = None


@router.post("")
async def ingest_catch(body: CatchPayload, authorization: str = Header(...)):
    db = get_client()

    # Resolve player from JWT
    token = authorization.replace("Bearer ", "")
    try:
        auth_result = db.auth.get_user(token)
        if not auth_result or not auth_result.user:
            raise ValueError("no user in response")
        player_id = auth_result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Two-tier dedup check
    dedup_result = _check_dedup(
        db, player_id,
        catch_type=body.catch_type,
        vehicle_hash=body.vehicle_hash,
        plate_confidence=body.alpr_plate_confidence,
        generation_id=body.generation_id,
        fuzzy_district=body.fuzzy_district,
    )
    is_duplicate = dedup_result is not None

    # Count how many times this player has caught this generation in the last 24h.
    # Used for diminishing XP — computed before inserting so the current catch
    # isn't included in the count yet.
    same_gen_count = session_catch_count(
        db, player_id, body.generation_id, SESSION_WINDOW_HOURS
    ) if body.generation_id else 0

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
        # Only persist the hash when plate confidence was high enough to trust it.
        # Low-confidence hashes aren't reliable and shouldn't poison future dedup checks.
        "vehicle_hash": body.vehicle_hash
            if (body.alpr_plate_confidence or 0) >= HASH_DEDUP_MIN_PLATE_CONFIDENCE
            else None,
    }
    result = db.table("catches").insert(catch_row).execute()
    catch_id = result.data[0]["id"]

    # Short-circuit XP + territory + first-finder for duplicates.
    # Catch is still recorded — it's a real sighting — just no reward.
    if is_duplicate:
        return {
            "catch_id": catch_id,
            "xp_earned": 0,
            "new_total_xp": _get_player_xp(db, player_id),
            "level_up": False,
            "road_king_claimed": False,
            "first_finder_awarded": None,
            "duplicate": True,
            "duplicate_reason": dedup_result,   # "hash" | "fuzzy"
        }

    # XP computation
    xp_earned, xp_reasons = compute_xp(
        catch_type=body.catch_type,
        generation_id=body.generation_id,
        rarity_tier=_get_rarity(db, body.generation_id),
        is_personal_first=_is_personal_first(db, player_id, body.generation_id),
        session_same_gen_count=same_gen_count,
    )
    new_total_xp, level_up, new_level = apply_xp(db, player_id, xp_earned, catch_id, xp_reasons)

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
        "new_level": new_level,
        "level_up": level_up,
        "road_king_claimed": road_king_claimed,
        "first_finder_awarded": first_finder_awarded,
        "duplicate": False,
    }


def _check_dedup(
    db,
    player_id: str,
    catch_type: str,
    vehicle_hash: Optional[str],
    plate_confidence: Optional[float],
    generation_id: Optional[str],
    fuzzy_district: Optional[str],
) -> Optional[str]:
    """
    Returns the dedup tier that fired ("hash" | "fuzzy" | "scan360_gap"), or None.

    Tier 1 — Hash (all catch types, 4hr window):
      Only used when plate_confidence >= 0.85. A low-confidence read may have
      misread characters, making the hash unreliable across multiple passes.

    Tier 2 — Fuzzy (highway only, 20min window):
      Same generation + same district in a short window = same parked car.
      NOT applied to scan360 — a dealer lot full of identical cars is a
      legitimate use case. Players walking the lot should catch them all.

    Tier 3 — scan360 gap (scan360 only, 3min window):
      Physically walking around a car takes ~90s. Two 360° scans of the same
      generation in the same district under 3 minutes apart = same car.
      Tighter than fuzzy — just enough to catch lazy re-scans.
    """
    now = datetime.now(timezone.utc)

    # Tier 1: hash-based — applies to all catch types
    if vehicle_hash and (plate_confidence or 0) >= HASH_DEDUP_MIN_PLATE_CONFIDENCE:
        cutoff = (now - timedelta(hours=HASH_DEDUP_WINDOW_HOURS)).isoformat()
        result = db.table("catches").select("id", count="exact") \
            .eq("player_id", player_id) \
            .eq("vehicle_hash", vehicle_hash) \
            .gte("caught_at", cutoff) \
            .execute()
        if (result.count or 0) > 0:
            return "hash"

    if catch_type == "highway":
        # Tier 2: fuzzy — highway drive-bys only
        if generation_id and fuzzy_district:
            cutoff = (now - timedelta(minutes=FUZZY_DEDUP_WINDOW_MINUTES)).isoformat()
            result = db.table("catches").select("id", count="exact") \
                .eq("player_id", player_id) \
                .eq("generation_id", generation_id) \
                .eq("fuzzy_district", fuzzy_district) \
                .eq("catch_type", "highway") \
                .gte("caught_at", cutoff) \
                .execute()
            if (result.count or 0) > 0:
                return "fuzzy"

    elif catch_type == "scan360":
        # Tier 3: 360° scan gap — physically can't walk around the same car in < 3 min
        if generation_id and fuzzy_district:
            cutoff = (now - timedelta(minutes=SCAN360_MIN_GAP_MINUTES)).isoformat()
            result = db.table("catches").select("id", count="exact") \
                .eq("player_id", player_id) \
                .eq("generation_id", generation_id) \
                .eq("fuzzy_district", fuzzy_district) \
                .eq("catch_type", "scan360") \
                .gte("caught_at", cutoff) \
                .execute()
            if (result.count or 0) > 0:
                return "scan360_gap"

    return None


def _get_player_xp(db, player_id: str) -> int:
    result = db.table("players").select("xp").eq("id", player_id).single().execute()
    return result.data["xp"] if result.data else 0


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
