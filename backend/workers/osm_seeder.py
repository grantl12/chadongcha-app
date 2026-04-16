"""
OSM Road Seeder — one-shot worker that populates road_segments from OpenStreetMap.
"""
import json
import logging
import math
import sys
import os
import time
from typing import Optional

import httpx

# Ensure absolute imports work when run as script or imported
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]
MAX_SEGMENT_LEN_KM = 5.0
MIN_SEGMENT_LEN_KM = 0.2

HIGHWAY_FILTER = '["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]'

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))

def way_length_km(coords: list[tuple[float, float]]) -> float:
    return sum(haversine_km(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
               for i in range(len(coords) - 1))

def centroid(coords: list[tuple[float, float]]) -> tuple[float, float]:
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lons) / len(lons)

def split_way(coords: list[tuple[float, float]], max_km: float) -> list[list[tuple[float, float]]]:
    if way_length_km(coords) <= max_km:
        return [coords]
    mid = len(coords) // 2
    left  = coords[:mid + 1]
    right = coords[mid:]
    return split_way(left, max_km) + split_way(right, max_km)

def fetch_ways(bbox: tuple[float, float, float, float]) -> list[dict]:
    lat_min, lon_min, lat_max, lon_max = bbox
    query = f"""
[out:json][timeout:60];
(
  way{HIGHWAY_FILTER}({lat_min},{lon_min},{lat_max},{lon_max});
);
out geom;
"""
    mirrors = OVERPASS_MIRRORS * 2
    for attempt, url in enumerate(mirrors):
        try:
            resp = httpx.post(url, data={"data": query}, timeout=120)
            resp.raise_for_status()
            return resp.json().get("elements", [])
        except Exception as exc:
            log.warning("Overpass attempt %d failed: %s", attempt + 1, exc)
            time.sleep(3 * (attempt + 1))
    return []

def seed_area(city: str, country: str, bbox: tuple[float, float, float, float]) -> int:
    log.info("Seeding area: %s (%s) bbox=%s", city, country, bbox)
    ways = fetch_ways(bbox)
    log.info("  %d ways fetched from Overpass", len(ways))

    db = get_client()
    upserted = 0

    for way in ways:
        if way.get("type") != "way":
            continue
        geometry = way.get("geometry", [])
        if len(geometry) < 2:
            continue

        coords = [(node["lat"], node["lon"]) for node in geometry]
        segments = split_way(coords, MAX_SEGMENT_LEN_KM)

        osm_way_id: int = way["id"]
        name: str = way.get("tags", {}).get("name") or way.get("tags", {}).get("name:en") or ""

        for i, seg_coords in enumerate(segments):
            if way_length_km(seg_coords) < MIN_SEGMENT_LEN_KM:
                continue

            clat, clon = centroid(seg_coords)
            segment_osm_id = osm_way_id * 1000 + i

            geojson_line = {
                "type": "LineString",
                "coordinates": [[c[1], c[0]] for c in seg_coords],
            }

            try:
                db.table("road_segments").upsert(
                    {
                        "osm_way_id":    segment_osm_id,
                        "name":          name or None,
                        "city":          city,
                        "country":       country,
                        "centroid_lat":  round(clat, 6),
                        "centroid_lon":  round(clon, 6),
                        "geometry_json": json.dumps(geojson_line),
                    },
                    on_conflict="osm_way_id",
                ).execute()
                upserted += 1
            except Exception as exc:
                log.warning("  upsert failed for way %d seg %d: %s", osm_way_id, i, exc)

    log.info("  %d segments upserted for %s", upserted, city)
    return upserted

if __name__ == "__main__":
    # Maintain script functionality
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", default="custom")
    parser.add_argument("--bbox", required=True)
    parser.add_argument("--country", default="US")
    args = parser.parse_args()
    
    bbox_parts = [float(x) for x in args.bbox.split(",")]
    seed_area(args.city, args.country, tuple(bbox_parts))
