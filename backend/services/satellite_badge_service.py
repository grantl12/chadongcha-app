from typing import Optional
from datetime import datetime, timezone

def award_satellite_badge(db, player_id: str, generation_id: str, catch_id: str) -> Optional[dict]:
    """
    Check if this vehicle qualifies for a satellite badge and award it if not already owned.
    A vehicle is eligible if 'is_satellite_badge_eligible' is true in the generations table.
    """
    # Verify eligibility
    gen = db.table("generations") \
        .select("id, is_satellite_badge_eligible, common_name, models(name, makes(name))") \
        .eq("id", generation_id) \
        .maybe_single() \
        .execute()
    
    if not (gen and gen.data and gen.data["is_satellite_badge_eligible"]):
        return None

    # Already awarded?
    already = db.table("satellite_badges") \
        .select("id") \
        .eq("player_id", player_id) \
        .eq("generation_id", generation_id) \
        .maybe_single() \
        .execute()
    
    if already and already.data:
        return None

    # Award the badge
    db.table("satellite_badges").insert({
        "player_id":     player_id,
        "generation_id": generation_id,
        "catch_id":      catch_id,
        "awarded_at":    datetime.now(timezone.utc).isoformat(),
    }).execute()

    model = (gen.data.get("models") or {})
    make = (model.get("makes") or {}).get("name", "")
    vehicle_name = gen.data.get("common_name") or f"{make} {model.get('name', '')}".strip()

    return {
        "badge_name":   f"Satellite Star: {vehicle_name}",
        "vehicle_name": vehicle_name,
        "generation_id": generation_id
    }
