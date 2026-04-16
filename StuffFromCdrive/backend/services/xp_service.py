from typing import Optional
from datetime import datetime, timezone, timedelta

# Orbital Boost — multiplier and duration earned by catching a space object.
# Applies to all subsequent vehicle catches within the window.
ORBITAL_BOOST_MULTIPLIERS = {
    "legendary": (2.00, 60),
    "epic":      (1.75, 45),
    "rare":      (1.50, 30),
    "uncommon":  (1.25, 20),
    "common":    (1.25, 20),
}

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

# Diminishing XP for catching the same generation repeatedly in a 24h window.
# Catches beyond the cap still record + contribute to road king — just less XP.
# Index = number of prior catches of this generation today (0-based).
# e.g. index 0 = first catch today = 100%, index 2 = third catch = 50%, etc.
_SESSION_DIMINISH = [
    1.00,   # 1st catch
    1.00,   # 2nd catch
    0.50,   # 3rd
    0.25,   # 4th
    0.25,   # 5th
    0.10,   # 6th+  (clamped to this for all beyond)
]


def _diminish_multiplier(session_count: int) -> float:
    idx = min(session_count, len(_SESSION_DIMINISH) - 1)
    return _SESSION_DIMINISH[idx]


def get_orbital_boost(db, player_id: str) -> tuple[float, int] | None:
    """
    Return (multiplier, minutes_remaining) if the player has an active Orbital
    Boost (caught a space object within its boost window), else None.
    Checks the most recent space catch and its space_object rarity tier.
    """
    result = db.table("catches") \
        .select("caught_at, space_objects(rarity_tier)") \
        .eq("player_id", player_id) \
        .eq("catch_type", "space") \
        .order("caught_at", desc=True) \
        .limit(1) \
        .execute()

    if not result.data:
        return None

    row = result.data[0]
    caught_at_str = row.get("caught_at", "")
    try:
        caught_at = datetime.fromisoformat(caught_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None

    space_obj = row.get("space_objects") or {}
    rarity = space_obj.get("rarity_tier", "common") if space_obj else "common"
    multiplier, duration_min = ORBITAL_BOOST_MULTIPLIERS.get(rarity, (1.25, 20))

    elapsed_min = (datetime.now(timezone.utc) - caught_at).total_seconds() / 60
    if elapsed_min >= duration_min:
        return None

    remaining_min = int(duration_min - elapsed_min)
    return multiplier, remaining_min


def compute_xp(
    catch_type: str,
    generation_id: Optional[str],
    rarity_tier: Optional[str],
    is_personal_first: bool = False,
    session_same_gen_count: int = 0,
    orbital_boost: float = 1.0,
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

    # Orbital Boost — applied after personal-first so both stack
    if orbital_boost > 1.0 and xp > 0 and catch_type != "space":
        xp = int(xp * orbital_boost)
        reasons.append(f"orbital_boost_x{orbital_boost:.2f}")

    # Diminishing XP for same-generation repeats in the session window.
    # Personal-first multiplier is applied before diminishing so the
    # first-ever catch of a generation always gets full reward.
    if xp > 0 and session_same_gen_count > 0:
        multiplier = _diminish_multiplier(session_same_gen_count)
        if multiplier < 1.0:
            xp = max(1, int(xp * multiplier))   # always award at least 1 XP
            reasons.append(f"diminished_x{session_same_gen_count + 1}")

    return xp, reasons


def apply_xp(db, player_id: str, xp_delta: int, catch_id: str, reasons: list[str]) -> tuple[int, bool, int]:
    """Write XP event, update player total, return (new_total, levelled_up)."""
    if xp_delta <= 0:
        result = db.table("players").select("xp, level").eq("id", player_id).single().execute()
        return result.data["xp"], False, result.data["level"]

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

    return new_xp, levelled_up, new_level


def session_catch_count(db, player_id: str, generation_id: Optional[str], window_hours: int) -> int:
    """
    How many times has this player caught this generation in the last window_hours?
    Called before inserting the current catch, so the result is the prior count.
    """
    if not generation_id:
        return 0
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    result = db.table("catches").select("id", count="exact") \
        .eq("player_id", player_id) \
        .eq("generation_id", generation_id) \
        .gte("caught_at", cutoff) \
        .execute()
    return result.count or 0


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
