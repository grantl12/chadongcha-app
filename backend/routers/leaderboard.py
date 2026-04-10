from fastapi import APIRouter, Query
from db import get_client

router = APIRouter()


@router.get("/city/{city}")
async def city_leaderboard(city: str, limit: int = Query(50, le=100)):
    """Top players in a city by XP this rolling 7-day window."""
    db = get_client()
    # TODO: wire to Redis sorted set for real-time city score
    result = db.table("players").select("id, username, xp, level, hero_car_id") \
        .eq("home_city", city).order("xp", desc=True).limit(limit).execute()
    return result.data


@router.get("/global")
async def global_leaderboard(limit: int = Query(100, le=200)):
    db = get_client()
    result = db.table("players").select("id, username, xp, level") \
        .order("xp", desc=True).limit(limit).execute()
    return result.data


@router.get("/road/{road_segment_id}")
async def road_leaderboard(road_segment_id: str):
    db = get_client()
    segment = db.table("road_segments").select("*, players(username)") \
        .eq("id", road_segment_id).maybe_single().execute()
    challengers = db.table("road_challengers") \
        .select("*, players(username)") \
        .eq("road_segment_id", road_segment_id) \
        .order("scan_count_30d", desc=True).limit(5).execute()
    return {"segment": segment.data if segment else None, "challengers": challengers.data}
