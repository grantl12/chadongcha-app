import json
import math

from fastapi import APIRouter, Query
from postgrest.types import CountMethod
from db import get_client

router = APIRouter()


@router.get("/nearby")
async def nearby_segments(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(5.0, le=20.0),
):
    """
    Returns road segments near the given coordinates using a bounding-box filter
    on centroid_lat / centroid_lon. No PostGIS required.

    Each segment includes its GeoJSON geometry so the mobile map can render it.
    """
    lat_delta = radius_km / 111.0
    lon_delta = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))

    db = get_client()
    result = (
        db.table("road_segments")
        .select("id, osm_way_id, name, city, country, centroid_lat, centroid_lon, "
                "geometry_json, king_id, king_scan_count, king_since, "
                "players(username)")
        .gte("centroid_lat", lat - lat_delta)
        .lte("centroid_lat", lat + lat_delta)
        .gte("centroid_lon", lon - lon_delta)
        .lte("centroid_lon", lon + lon_delta)
        .limit(200)
        .execute()
    )

    rows = result.data or []
    # Parse geometry_json back to dict for the mobile client
    for row in rows:
        if row.get("geometry_json"):
            try:
                row["geometry"] = json.loads(row["geometry_json"])
            except (json.JSONDecodeError, TypeError):
                row["geometry"] = None
        else:
            row["geometry"] = None

    return rows


@router.get("/stats/{player_id}")
async def player_territory_stats(player_id: str):
    """Count of roads a player currently holds as Road King."""
    db = get_client()
    result = (
        db.table("road_segments")
        .select("id", count=CountMethod.exact)
        .eq("king_id", player_id)
        .execute()
    )
    return {"road_king_count": result.count or 0}
