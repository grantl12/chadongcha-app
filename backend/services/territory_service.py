from datetime import datetime, timezone, timedelta


def record_road_scan(db, player_id: str, road_segment_id: str) -> bool:
    """
    Increment challenger scan count for this player on the given segment.
    If player exceeds current King's 30-day count, claim the road.
    Returns True if road king was claimed.
    """
    # Upsert challenger row
    db.table("road_challengers").upsert({
        "road_segment_id": road_segment_id,
        "player_id": player_id,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="road_segment_id,player_id").execute()

    # Increment scan count
    db.rpc("increment_challenger_scan", {
        "p_road_segment_id": road_segment_id,
        "p_player_id": player_id,
    }).execute()

    # Check if challenger now beats the king
    segment = db.table("road_segments").select("king_id, king_scan_count") \
        .eq("id", road_segment_id).maybe_single().execute()
    challenger = db.table("road_challengers").select("scan_count_30d") \
        .eq("road_segment_id", road_segment_id).eq("player_id", player_id) \
        .maybe_single().execute()

    if not segment.data or not challenger.data:
        return False

    challenger_count = challenger.data["scan_count_30d"]
    king_count = segment.data.get("king_scan_count", 0)
    current_king = segment.data.get("king_id")

    if current_king == player_id:
        # Already king — update count
        db.table("road_segments").update({"king_scan_count": challenger_count}) \
            .eq("id", road_segment_id).execute()
        return False

    if challenger_count > king_count:
        # Claim the road
        db.table("road_segments").update({
            "king_id": player_id,
            "king_scan_count": challenger_count,
            "king_since": datetime.now(timezone.utc).isoformat(),
        }).eq("id", road_segment_id).execute()
        return True

    return False
