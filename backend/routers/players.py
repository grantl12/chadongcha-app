from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from db import get_client
from services.location_seeding_service import seed_location_if_needed

router = APIRouter()

RARITIES = ["common", "uncommon", "rare", "epic", "legendary"]


@router.get("/{player_id}/stats")
async def player_stats(player_id: str):
    """
    Full profile stats for a player:
      - catches by rarity tier
      - road king count
      - first finder badges (with vehicle name)
    """
    db = get_client()

    # Verify player exists
    player = db.table("players").select("id, username, xp, level") \
        .eq("id", player_id).maybe_single().execute()
    if player is None or not player.data:
        raise HTTPException(status_code=404, detail="Player not found")

    # Catches grouped by rarity via generations join
    catches_res = db.table("catches") \
        .select("id, generations(rarity_tier)") \
        .eq("player_id", player_id) \
        .execute()

    by_rarity: dict[str, int] = {r: 0 for r in RARITIES}
    total_catches = 0
    for row in (catches_res.data or []):
        total_catches += 1
        gen = row.get("generations") or {}
        tier = gen.get("rarity_tier") if gen else None
        if tier in by_rarity:
            by_rarity[tier] += 1

    # Road King count
    from postgrest.types import CountMethod
    roads_res = db.table("road_segments") \
        .select("id", count=CountMethod.exact) \
        .eq("king_id", player_id) \
        .execute()
    road_king_count = roads_res.count or 0

    # First finder badges
    ff_res = db.table("first_finders") \
        .select("badge_name, region_scope, region_value, awarded_at, "
                "generations(common_name, models(name, makes(name)))") \
        .eq("player_id", player_id) \
        .order("awarded_at", desc=True) \
        .execute()

    badges = []
    for ff in (ff_res.data or []):
        gen = ff.get("generations") or {}
        model = gen.get("models") or {}
        make = (model.get("makes") or {}).get("name", "")
        model_name = model.get("name", "")
        vehicle = gen.get("common_name") or f"{make} {model_name}".strip() or "Unknown"
        badges.append({
            "badge_name":   ff["badge_name"],
            "region_scope": ff["region_scope"],
            "region_value": ff["region_value"],
            "awarded_at":   ff["awarded_at"],
            "vehicle_name": vehicle,
        })

    # Satellite badges
    sat_res = db.table("satellite_badges") \
        .select("awarded_at, generations(common_name, models(name, makes(name)))") \
        .eq("player_id", player_id) \
        .order("awarded_at", desc=True) \
        .execute()
    
    satellite_badges = []
    for sat in (sat_res.data or []):
        gen = sat.get("generations") or {}
        model = gen.get("models") or {}
        make = (model.get("makes") or {}).get("name", "")
        model_name = model.get("name", "")
        vehicle = gen.get("common_name") or f"{make} {model_name}".strip() or "Unknown"
        satellite_badges.append({
            "badge_name": f"Satellite Star: {vehicle}",
            "awarded_at": sat["awarded_at"],
            "vehicle_name": vehicle
        })

    return {
        "total_catches":  total_catches,
        "catches_by_rarity": by_rarity,
        "road_king_count": road_king_count,
        "first_finder_badges": badges,
        "satellite_badges": satellite_badges,
    }


@router.get("/{player_id}/card")
async def player_card(player_id: str):
    """
    Public-facing player card: username, level, xp, catch counts, road king count,
    top first-finder badge. No auth required.
    """
    db = get_client()

    player = db.table("players").select("id, username, xp, level") \
        .eq("id", player_id).maybe_single().execute()
    if player is None or not player.data:
        raise HTTPException(status_code=404, detail="Player not found")
    p = player.data

    catches_res = db.table("catches") \
        .select("id, generations(rarity_tier)") \
        .eq("player_id", player_id) \
        .execute()

    by_rarity: dict[str, int] = {r: 0 for r in ["common", "uncommon", "rare", "epic", "legendary"]}
    for row in (catches_res.data or []):
        gen  = row.get("generations") or {}
        tier = gen.get("rarity_tier") if gen else None
        if tier in by_rarity:
            by_rarity[tier] += 1
    total_catches = sum(by_rarity.values())

    from postgrest.types import CountMethod
    roads_res = db.table("road_segments") \
        .select("id", count=CountMethod.exact) \
        .eq("king_id", player_id) \
        .execute()
    road_king_count = roads_res.count or 0

    # Highest-scope first-finder badge
    ff_res = db.table("first_finders") \
        .select("badge_name, region_scope, awarded_at, "
                "generations(common_name, models(name, makes(name)))") \
        .eq("player_id", player_id) \
        .order("awarded_at", desc=True) \
        .limit(1) \
        .execute()
    top_badge = None
    if ff_res.data:
        ff = ff_res.data[0]
        gen   = ff.get("generations") or {}
        model = gen.get("models") or {}
        make  = (model.get("makes") or {}).get("name", "")
        mname = model.get("name", "")
        vehicle = gen.get("common_name") or f"{make} {mname}".strip() or "Unknown"
        top_badge = {"badge_name": ff["badge_name"], "vehicle_name": vehicle}

    return {
        "player_id":     p["id"],
        "username":      p["username"],
        "level":         p["level"],
        "xp":            p["xp"],
        "total_catches": total_catches,
        "catches_by_rarity": by_rarity,
        "road_king_count": road_king_count,
        "top_badge":     top_badge,
        "is_ai":         False,
    }


# ─── Plate hash opt-in ────────────────────────────────────────────────────────

class PlateHashRequest(BaseModel):
    plate_hash: str          # SHA-256 hex, computed on-device
    label: Optional[str] = None   # "My daily driver", etc.


def _resolve_player(db, authorization: str) -> str:
    """Resolve JWT → player_id, raise 401 on failure."""
    token = authorization.replace("Bearer ", "")
    try:
        result = db.auth.get_user(token)
        if not result or not result.user:
            raise ValueError()
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/plate-hashes")
async def register_plate_hash(body: PlateHashRequest, authorization: str = Header(...)):
    """
    Register a SHA-256 hash of your own license plate.
    The raw plate is hashed on-device and never sent to the server.
    When another player's ALPR captures a matching hash, they earn a Spotter award.
    """
    if len(body.plate_hash) != 64:
        raise HTTPException(status_code=400, detail="plate_hash must be a 64-char SHA-256 hex string")

    db = get_client()
    player_id = _resolve_player(db, authorization)

    try:
        result = db.table("plate_hashes").insert({
            "player_id":  player_id,
            "plate_hash": body.plate_hash.lower(),
            "label":      body.label,
        }).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="This plate hash is already registered")
        raise HTTPException(status_code=500, detail="Could not register plate hash")

    return {"id": result.data[0]["id"], "label": body.label}


class HomeLocationRequest(BaseModel):
    home_lat: float
    home_lon: float


@router.patch("/home-location")
async def set_home_location(
    body: HomeLocationRequest, 
    background_tasks: BackgroundTasks,
    authorization: str = Header(...)
):
    """
    Store the player's home GPS coordinates (set once during onboarding,
    updatable from profile settings). Used by the satellite worker to filter
    push notifications to players within NOTIFY_RADIUS_KM of a pass region.
    """
    if not (-90 <= body.home_lat <= 90) or not (-180 <= body.home_lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    db = get_client()
    player_id = _resolve_player(db, authorization)

    # Fetch city name for the seeder
    player_data = db.table("players").select("home_city").eq("id", player_id).maybe_single().execute()
    city_name = (player_data.data or {}).get("home_city") or f"Area_{round(body.home_lat, 2)}_{round(body.home_lon, 2)}"

    db.table("players").update({
        "home_lat": body.home_lat,
        "home_lon": body.home_lon,
    }).eq("id", player_id).execute()

    # Trigger dynamic seeding in background
    background_tasks.add_task(seed_location_if_needed, db, body.home_lat, body.home_lon, city_name)

    return {"ok": True}


@router.get("/plate-hashes")
async def list_plate_hashes(authorization: str = Header(...)):
    """List the calling player's registered plate hashes (hash is masked)."""
    db = get_client()
    player_id = _resolve_player(db, authorization)

    result = db.table("plate_hashes") \
        .select("id, label, created_at") \
        .eq("player_id", player_id) \
        .order("created_at", desc=True) \
        .execute()

    return result.data or []


@router.delete("/plate-hashes/{hash_id}")
async def delete_plate_hash(hash_id: str, authorization: str = Header(...)):
    """Remove a registered plate hash."""
    db = get_client()
    player_id = _resolve_player(db, authorization)

    result = db.table("plate_hashes") \
        .delete() \
        .eq("id", hash_id) \
        .eq("player_id", player_id) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Plate hash not found")
    return {"ok": True}
