from typing import Optional

# XP table from brief §9.1
_HIGHWAY_XP = {
    "common": 40,
    "uncommon": 80,
    "rare": 200,
    "epic": 450,
    "legendary": 900,
}
_SPACE_XP = {
    "common": 120,
    "uncommon": 200,
    "rare": 600,
    "epic": 1200,
    "legendary": 2000,
}

DAILY_FIRST_CATCH_BONUS = 100
ROAD_KING_TAKEOVER_XP  = 300
SCAN_360_MULTIPLIER    = 1.5
SCAN_360_FULL_BONUS    = 0.25   # additional 25% for all 4 anchors
PERSONAL_FIRST_MULTIPLIER = 2.0


def compute_xp(
    catch_type: str,
    generation_id: Optional[str],
    rarity_tier: Optional[str],
    is_personal_first: bool = False,
) -> tuple[int, list[str]]:
    reasons: list[str] = []
    xp = 0

    if catch_type == "space":
        base = _SPACE_XP.get(rarity_tier or "common", 120)
        xp += base
        reasons.append(f"space_catch_{rarity_tier}")
    elif catch_type in ("highway", "scan360", "unknown"):
        if not generation_id:
            # Unknown vehicle catch — community ID flow
            xp += 0   # awarded on confirmation, not here
            reasons.append("unknown_vehicle_pending")
        else:
            base = _HIGHWAY_XP.get(rarity_tier or "common", 40)
            xp += base
            reasons.append(f"{catch_type}_catch_{rarity_tier}")

        if catch_type == "scan360":
            xp = int(xp * SCAN_360_MULTIPLIER)
            reasons.append("scan360_bonus")

    if is_personal_first and xp > 0:
        xp = int(xp * PERSONAL_FIRST_MULTIPLIER)
        reasons.append("personal_first_catch")

    return xp, reasons


def apply_xp(db, player_id: str, xp_delta: int, catch_id: str, reasons: list[str]) -> tuple[int, bool]:
    """Write XP event, update player total, return (new_total, levelled_up)."""
    if xp_delta <= 0:
        result = db.table("players").select("xp, level").eq("id", player_id).single().execute()
        return result.data["xp"], False

    # Log event
    db.table("xp_events").insert({
        "player_id": player_id,
        "catch_id": catch_id,
        "reason": ",".join(reasons),
        "xp_delta": xp_delta,
    }).execute()

    # Fetch current totals
    player = db.table("players").select("xp, level").eq("id", player_id).single().execute().data
    new_xp = player["xp"] + xp_delta
    new_level = _level_for_xp(new_xp)
    levelled_up = new_level > player["level"]

    db.table("players").update({"xp": new_xp, "level": new_level}).eq("id", player_id).execute()

    return new_xp, levelled_up


def _level_for_xp(xp: int) -> int:
    # Level thresholds from brief §9.2
    thresholds = [
        (0,       1),
        (2001,    6),
        (10001,  11),
        (50001,  21),
        (200001, 36),
        (1000001, 51),
    ]
    level = 1
    for threshold, lvl in thresholds:
        if xp >= threshold:
            level = lvl
    return level
