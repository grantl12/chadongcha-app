from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

from db import get_client
from services.xp_service import compute_xp, apply_xp, session_catch_count, get_orbital_boost, ROAD_KING_TAKEOVER_XP
from services.territory_service import record_road_scan
from services.first_finder_service import check_first_finder
from services.notification_service import (
    notify_road_king_taken, notify_road_king_claimed,
    notify_level_up, notify_first_finder,
    notify_spotted, notify_spotter_award,
)

SPOTTER_XP = 150   # bonus XP for catching a registered plate

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

# Server-side minimum confidence gate.
# Client thresholds are already 0.65–0.80, but the server enforces a floor
# to reject replayed or spoofed requests that bypass client validation.
MIN_CATCH_CONFIDENCE            = 0.55

router = APIRouter()


@router.get("/recent")
async def recent_catches(
    limit: int = 50,
    player_id: Optional[str] = None,
    generation_id: Optional[str] = None,
):
    """
    Global activity feed — most recent catches from all players.
    Includes both vehicle catches (generation_id set) and space catches.
    Pass player_id to filter to a single player's catches.
    Pass generation_id to filter to a single vehicle generation.
    """
    db = get_client()
    query = db.table("catches") \
        .select(
            "id, caught_at, catch_type, confidence, color, body_style, player_id, "
            "players(username), "
            "generations(common_name, rarity_tier, models(name, makes(name))), "
            "catchable_objects(space_objects(name, object_type, rarity_tier))"
        ) \
        .order("caught_at", desc=True) \
        .limit(min(limit, 100))

    if player_id:
        query = query.eq("player_id", player_id)
    if generation_id:
        query = query.eq("generation_id", generation_id)

    result = query.execute()
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
    alpr_plate_confidence: Optional[float] = None
    # SHA-256 hash of plate, zeroed on-device immediately after hashing.
    vehicle_hash: Optional[str] = None
    # R2 object key for the scan photo — set only when player has opted into
    # contribute_scans. Stored for community ID and model training purposes.
    photo_ref: Optional[str] = None


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

    # Server-side confidence gate — reject low-confidence catches that bypass client
    if body.confidence is not None and body.catch_type != "space" and body.confidence < MIN_CATCH_CONFIDENCE:
        raise HTTPException(status_code=422, detail=f"Confidence too low: {body.confidence:.2f} < {MIN_CATCH_CONFIDENCE}")

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

    # Personal-first flag must be checked BEFORE the insert — querying after
    # always returns count >= 1 and the 2× bonus would never fire.
    is_personal_first = _is_personal_first(db, player_id, body.generation_id)

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
        "photo_ref": body.photo_ref,
    }
    result = db.table("catches").insert(catch_row).execute()
    catch_id = result.data[0]["id"]

    # Short-circuit XP + territory + first-finder for duplicates.
    # Catch is still recorded — it's a real sighting — just no reward.
    if is_duplicate:
        player_xp = _get_player_xp(db, player_id)
        player_level = _get_player_level(db, player_id)
        return {
            "catch_id": catch_id,
            "xp_earned": 0,
            "new_total_xp": player_xp,
            "new_level": player_level,
            "level_up": False,
            "road_king_claimed": False,
            "first_finder_awarded": None,
            "orbital_boost_active": False,
            "orbital_boost_remaining_min": 0,
            "duplicate": True,
            "duplicate_reason": dedup_result,   # "hash" | "fuzzy"
        }

    # XP computation
    boost_result   = get_orbital_boost(db, player_id) if body.catch_type != "space" else None
    orbital_boost  = boost_result[0] if boost_result else 1.0
    boost_remaining = boost_result[1] if boost_result else 0

    xp_earned, xp_reasons = compute_xp(
        catch_type=body.catch_type,
        generation_id=body.generation_id,
        rarity_tier=_get_rarity(db, body.generation_id),
        is_personal_first=is_personal_first,
        session_same_gen_count=same_gen_count,
        orbital_boost=orbital_boost,
    )
    new_total_xp, level_up, new_level = apply_xp(db, player_id, xp_earned, catch_id, xp_reasons)

    # Territory
    road_king_claimed = False
    if body.road_segment_id:
        prev_king = _get_road_king(db, body.road_segment_id)
        road_king_claimed = record_road_scan(db, player_id, body.road_segment_id)
        if road_king_claimed:
            road_name = _get_road_name(db, body.road_segment_id)
            # Notify new king
            notify_road_king_claimed(db, player_id, road_name, ROAD_KING_TAKEOVER_XP)
            # Notify dethroned king (if they exist and aren't the same player)
            if prev_king and prev_king != player_id:
                player_username = _get_username(db, player_id)
                notify_road_king_taken(db, prev_king, road_name, player_username)

    # Level-up notification (async best-effort)
    if level_up:
        notify_level_up(db, player_id, new_level)

    # Plate hash match — check if this vehicle_hash matches an opted-in plate
    spotter_bonus_xp = 0
    if body.vehicle_hash and (body.alpr_plate_confidence or 0) >= HASH_DEDUP_MIN_PLATE_CONFIDENCE:
        plate_match = _check_plate_hash(db, body.vehicle_hash, player_id)
        if plate_match:
            # Award Spotter XP to catcher
            spotter_bonus_xp = SPOTTER_XP
            apply_xp(db, player_id, SPOTTER_XP, catch_id, ["spotter_award"])
            # Log spotted event
            db.table("spotted_events").insert({
                "catch_id":      catch_id,
                "plate_hash_id": plate_match["hash_id"],
                "spotter_id":    player_id,
                "owner_id":      plate_match["owner_id"],
                "xp_awarded":    SPOTTER_XP,
            }).execute()
            spotter_username = _get_username(db, player_id)
            notify_spotter_award(db, player_id, SPOTTER_XP)
            notify_spotted(db, plate_match["owner_id"], spotter_username, body.fuzzy_city)

    # Unknown vehicle queue — create an unknown_catches record so the
    # community can help identify it. Only when no generation_id resolved
    # AND a photo was submitted (no photo = nothing to show reviewers).
    if not body.generation_id and body.photo_ref:
        try:
            db.table("unknown_catches").insert({
                "catch_id":            catch_id,
                "body_type":           body.body_style,
                "city":                body.fuzzy_city,
                "community_photo_ref": body.photo_ref,
                "photo_shared":        True,
                "status":              "open",
            }).execute()
        except Exception:
            pass  # Non-fatal — catch is already recorded

    # First finder
    first_finder_awarded = None
    if body.generation_id:
        first_finder_awarded = check_first_finder(
            db, player_id, body.generation_id, body.variant_id,
            body.fuzzy_city, catch_id,
        )
        if first_finder_awarded:
            vehicle_name = _get_vehicle_name(db, body.generation_id)
            notify_first_finder(db, player_id, first_finder_awarded.get("badge", ""), vehicle_name)

    return {
        "catch_id": catch_id,
        "xp_earned": xp_earned + spotter_bonus_xp,
        "new_total_xp": new_total_xp,
        "new_level": new_level,
        "level_up": level_up,
        "road_king_claimed": road_king_claimed,
        "first_finder_awarded": first_finder_awarded,
        "spotter_bonus_xp": spotter_bonus_xp,
        "orbital_boost_active": orbital_boost > 1.0,
        "orbital_boost_remaining_min": boost_remaining,
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


def _get_player_level(db, player_id: str) -> int:
    result = db.table("players").select("level").eq("id", player_id).single().execute()
    return result.data["level"] if result.data else 1


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


def _get_road_king(db, road_segment_id: str) -> Optional[str]:
    result = db.table("road_segments").select("king_id") \
        .eq("id", road_segment_id).maybe_single().execute()
    return result.data.get("king_id") if result.data else None


def _get_road_name(db, road_segment_id: str) -> str:
    result = db.table("road_segments").select("name") \
        .eq("id", road_segment_id).maybe_single().execute()
    return (result.data.get("name") or "Unknown Road") if result.data else "Unknown Road"


def _get_username(db, player_id: str) -> str:
    result = db.table("players").select("username") \
        .eq("id", player_id).maybe_single().execute()
    return (result.data.get("username") or "Someone") if result.data else "Someone"


def _check_plate_hash(db, vehicle_hash: str, catcher_id: str) -> Optional[dict]:
    """
    Returns {"hash_id": ..., "owner_id": ...} if the vehicle_hash matches
    an opted-in plate hash that isn't owned by the catcher themselves.
    """
    result = db.table("plate_hashes").select("id, player_id") \
        .eq("plate_hash", vehicle_hash.lower()) \
        .neq("player_id", catcher_id) \
        .limit(1) \
        .execute()
    if not result.data:
        return None
    row = result.data[0]
    return {"hash_id": row["id"], "owner_id": row["player_id"]}


def _get_vehicle_name(db, generation_id: str) -> str:
    result = db.table("generations") \
        .select("common_name, models(name, makes(name))") \
        .eq("id", generation_id).maybe_single().execute()
    if not result.data:
        return "Unknown Vehicle"
    data = result.data
    model = data.get("models") or {}
    make  = model.get("makes") or {}
    return data.get("common_name") or f"{make.get('name', '')} {model.get('name', '')}".strip()
