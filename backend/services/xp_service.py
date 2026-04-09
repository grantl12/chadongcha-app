from typing import Optional
from datetime import datetime, timezone, timedelta

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


def compute_xp(
    catch_type: str,
    generation_id: Optional[str],
    rarity_tier: Optional[str],
    is_personal_first: bool = False,
    session_same_gen_count: int = 0,
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

    # Diminishing XP for same-generation repeats in the session window.
    # Personal-first multiplier is applied before diminishing so the
    # first-ever catch of a generation always gets full reward.
    if xp > 0 and session_same_gen_count > 0:
        multiplier = _diminish_multiplier(session_same_gen_count)
        if multiplier < 1.0:
            xp = max(1, int(xp * multiplier))   # always award at least 1 XP
            reasons.append(f"diminished_x{session_same_gen_count + 1}")

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
