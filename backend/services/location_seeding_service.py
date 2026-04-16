
import asyncio
import logging

from workers.osm_seeder import seed_area
from scripts.seed_ai_rivals import seed_rivals_for_city

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

async def seed_location_if_needed(db, lat: float, lon: float, city_name: str, country_code: str = "US"):
    """
    Checks if the area around (lat, lon) is seeded with road segments.
    If not, triggers OSM seeder and AI rival seeder for that bbox.
    """
    # 1. Check if any road segments exist within ~5km
    # Simple bounding box check for speed (+/- 0.05 deg is approx 5km)
    lat_min, lat_max = lat - 0.05, lat + 0.05
    lon_min, lon_max = lon - 0.05, lon + 0.05

    res = db.table("road_segments") \
        .select("id", count="exact") \
        .gte("centroid_lat", lat_min) \
        .lte("centroid_lat", lat_max) \
        .gte("centroid_lon", lon_min) \
        .lte("centroid_lon", lon_max) \
        .limit(1) \
        .execute()
    
    if (res.count or 0) > 0:
        log.info(f"Location {city_name} already seeded. Skipping.")
        return

    log.info(f"New location detected: {city_name}. Triggering dynamic seeding...")

    # 2. Define seeding bbox (approx 10x10km)
    seed_bbox = (lat - 0.1, lon - 0.1, lat + 0.1, lon + 0.1)

    # 3. Run OSM Seeder — synchronous + blocking HTTP, run in thread pool
    try:
        segments_count = await asyncio.to_thread(seed_area, city_name, country_code, seed_bbox)
        if segments_count > 0:
            # 4. Seed AI Rivals — synchronous DB writes, also off the event loop
            await asyncio.to_thread(seed_rivals_for_city, city_name)
            log.info(f"Dynamic seeding complete for {city_name}: {segments_count} roads.")
    except Exception as e:
        log.error(f"Dynamic seeding failed for {city_name}: {e}")
