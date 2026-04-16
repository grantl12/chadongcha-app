"""
OSM Road Seeder — one-shot worker that populates road_segments from OpenStreetMap.

Run manually or as a Railway cron job (weekly to pick up new roads):
  python workers/osm_seeder.py
  python workers/osm_seeder.py --city Seoul --bbox 37.4,126.8,37.7,127.2

Uses the Overpass API (free, no auth) to fetch major road ways, splits long
segments at the midpoint, computes centroids, and upserts into road_segments.

Road types seeded (highway tags):
  motorway, trunk, primary, secondary, tertiary
  (residential excluded — too granular for Road King territory)
"""
import argparse
import json
import logging
import math
import sys
import os
import time

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]
MAX_SEGMENT_LEN_KM = 5.0   # split ways longer than this
MIN_SEGMENT_LEN_KM = 0.2   # skip tiny stubs

# Bounding boxes (lat_min, lon_min, lat_max, lon_max) and city/country
SEED_CITIES: list[dict] = [
    {"city": "Seoul",        "country": "KR", "bbox": (37.45, 126.80, 37.70, 127.18)},
    {"city": "Busan",        "country": "KR", "bbox": (35.05, 128.95, 35.25, 129.15)},
    {"city": "Los Angeles",  "country": "US", "bbox": (33.90, -118.50, 34.15, -118.15)},
    {"city": "New York",     "country": "US", "bbox": (40.60, -74.05, 40.85, -73.85)},
    {"city": "Chicago",      "country": "US", "bbox": (41.75, -87.75, 42.00, -87.55)},
    {"city": "Houston",      "country": "US", "bbox": (29.65, -95.55, 29.85, -95.30)},
    {"city": "Tokyo",        "country": "JP", "bbox": (35.60, 139.55, 35.80, 139.85)},
    {"city": "Osaka",        "country": "JP", "bbox": (34.60, 135.45, 34.75, 135.60)},
    {"city": "London",       "country": "GB", "bbox": (51.45, -0.20, 51.55,  0.00)},
    {"city": "Berlin",       "country": "DE", "bbox": (52.45,  13.30, 52.58, 13.50)},
    {"city": "Sydney",       "country": "AU", "bbox": (-33.95, 151.15, -33.80, 151.30)},
    {"city": "Singapore",    "country": "SG", "bbox": (1.25, 103.75, 1.45, 103.90)},
    {"city": "Toronto",      "country": "CA", "bbox": (43.60, -79.50, 43.75, -79.30)},
    {"city": "Paris",        "country": "FR", "bbox": (48.82,  2.28, 48.90,  2.41)},
    # ── Tester cities ────────────────────────────────────────────────────────
    {"city": "Carrollton",   "country": "US", "bbox": (33.53, -85.12, 33.63, -85.02)},  # 30117 — dev/tester base
    {"city": "Johnson City", "country": "US", "bbox": (36.27, -82.42, 36.37, -82.29)},  # Android tester
]

HIGHWAY_FILTER = '["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]'


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

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
    """Split a polyline into segments no longer than max_km."""
    if way_length_km(coords) <= max_km:
        return [coords]

    mid = len(coords) // 2
    left  = coords[:mid + 1]
    right = coords[mid:]
    return split_way(left, max_km) + split_way(right, max_km)


# ---------------------------------------------------------------------------
# Overpass query
# ---------------------------------------------------------------------------

def fetch_ways(bbox: tuple[float, float, float, float]) -> list[dict]:
    lat_min, lon_min, lat_max, lon_max = bbox
    query = f"""
[out:json][timeout:60];
(
  way{HIGHWAY_FILTER}({lat_min},{lon_min},{lat_max},{lon_max});
);
out geom;
"""
    mirrors = OVERPASS_MIRRORS * 2  # two full rotations before giving up
    for attempt, url in enumerate(mirrors):
        try:
            resp = httpx.post(url, data={"data": query}, timeout=120)
            resp.raise_for_status()
            return resp.json().get("elements", [])
        except Exception as exc:
            log.warning("Overpass attempt %d (%s) failed: %s", attempt + 1, url, exc)
            time.sleep(3 * (attempt + 1))
    return []


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

def seed_city(city_cfg: dict) -> int:
    city    = city_cfg["city"]
    country = city_cfg["country"]
    bbox    = city_cfg["bbox"]

    log.info("Seeding %s (%s)…", city, country)
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
            # Use way_id * 1000 + segment_index as composite OSM key
            segment_osm_id = osm_way_id * 1000 + i

            geojson_line = {
                "type": "LineString",
                "coordinates": [[c[1], c[0]] for c in seg_coords],  # GeoJSON is [lon, lat]
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


def main(cities: list[dict] | None = None) -> None:
    targets = cities or SEED_CITIES
    total = 0
    for city_cfg in targets:
        total += seed_city(city_cfg)
        time.sleep(2)  # be polite to Overpass

    log.info("OSM seeding complete — %d total segments", total)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed road_segments from OpenStreetMap")
    parser.add_argument("--city",    help="Single city name to seed (must match SEED_CITIES)")
    parser.add_argument("--bbox",    help="Custom bbox: lat_min,lon_min,lat_max,lon_max")
    parser.add_argument("--country", default="US")
    args = parser.parse_args()

    if args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        main([{"city": args.city or "custom", "country": args.country, "bbox": tuple(parts)}])
    elif args.city:
        match = [c for c in SEED_CITIES if c["city"].lower() == args.city.lower()]
        if not match:
            print(f"City '{args.city}' not in SEED_CITIES. Use --bbox to provide custom bounds.")
            sys.exit(1)
        main(match)
    else:
        main()
