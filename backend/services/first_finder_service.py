from typing import Optional
from datetime import datetime, timezone


# Rarity → (scope, cap, badge name)
_FIRST_FINDER_CONFIG = {
    "common":     ("city",      1000, "City Pioneer"),
    "uncommon":   ("country",   100,  "National Spotter"),
    "rare":       ("continent", 10,   "Continental Hunter"),
    "epic":       ("global",    25,   "Global Elite"),
    "legendary":  ("global",    1,    "World First"),
}


def check_first_finder(
    db,
    player_id: str,
    generation_id: str,
    variant_id: Optional[str],
    fuzzy_city: Optional[str],
    catch_id: str,
) -> Optional[dict]:
    """
    Award a First Finder badge if slots remain for this generation/region.
    Returns badge info dict if awarded, else None.
    """
    gen = db.table("generations").select("rarity_tier").eq("id", generation_id) \
        .maybe_single().execute()
    if not gen.data:
        return None

    rarity = gen.data["rarity_tier"]
    scope, cap, badge_name = _FIRST_FINDER_CONFIG.get(rarity, ("city", 1000, "City Pioneer"))

    # Determine region_value for scope
    region_value = _resolve_region(scope, fuzzy_city)
    if not region_value:
        return None

    # Count existing finders for this scope
    existing = db.table("first_finders").select("id", count="exact") \
        .eq("generation_id", generation_id) \
        .eq("region_scope", scope) \
        .eq("region_value", region_value) \
        .execute()

    if (existing.count or 0) >= cap:
        return None

    # Already awarded to this player for this scope?
    already = db.table("first_finders").select("id") \
        .eq("generation_id", generation_id) \
        .eq("player_id", player_id) \
        .eq("region_scope", scope) \
        .eq("region_value", region_value) \
        .execute()
    if already.data:
        return None

    db.table("first_finders").insert({
        "generation_id": generation_id,
        "variant_id": variant_id,
        "player_id": player_id,
        "catch_id": catch_id,
        "region_scope": scope,
        "region_value": region_value,
        "badge_name": badge_name,
        "awarded_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"badge": badge_name, "scope": scope, "region": region_value}


def _resolve_region(scope: str, fuzzy_city: Optional[str]) -> Optional[str]:
    if scope == "city":
        return fuzzy_city
    if scope in ("country", "continent", "global"):
        return scope   # placeholder — enrich with geo lookup as needed
    return None
