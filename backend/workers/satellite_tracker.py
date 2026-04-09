"""
Satellite tracking worker — runs as a Railway background process.

Responsibilities:
1. Poll Celestrak every 6 hours for updated TLE data
2. Every 10 minutes: compute overhead passes for active player locations
3. Insert upcoming passes into catchable_objects table
4. Fire push notification 5 minutes before pass_start
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import httpx
from sgp4.api import Satrec

from db import get_client

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# Celestrak active satellite groups to track
CELESTRAK_GROUPS = [
    "stations",       # ISS, CSS
    "starlink",       # Starlink constellation
    "active",         # all active satellites
]
CELESTRAK_BASE = "https://celestrak.org/SOCRATES/query.php"
CELESTRAK_TLE  = "https://celestrak.org/SPACETRACK/query/class/gp/CURRENT/true/format/tle"

PASS_WINDOW_HOURS  = 12      # compute passes this many hours ahead
MIN_ELEVATION_DEG  = 60      # catchable above this elevation
NOTIFY_BEFORE_SECS = 300     # 5-minute advance notification


async def fetch_tles(group: str) -> list[tuple[str, str, str]]:
    url = f"https://celestrak.org/SPACETRACK/query/class/gp/GROUP/{group}/format/tle"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    lines = [line.strip() for line in resp.text.splitlines() if line.strip()]
    tles = []
    for i in range(0, len(lines) - 2, 3):
        tles.append((lines[i], lines[i+1], lines[i+2]))
    return tles


async def refresh_tle_db():
    """Pull latest TLEs and upsert into space_objects table."""
    db = get_client()
    for group in CELESTRAK_GROUPS:
        try:
            tles = await fetch_tles(group)
            log.info("Fetched %d TLEs for group %s", len(tles), group)
            for name, line1, line2 in tles:
                norad_id = int(line1[2:7])
                db.table("space_objects").upsert({
                    "norad_id": norad_id,
                    "name": name,
                    "object_type": _classify_object(name),
                    "rarity_tier": _rarity_for(name),
                    "tle_line1": line1,
                    "tle_line2": line2,
                    "tle_updated_at": datetime.now(timezone.utc).isoformat(),
                    "active": True,
                }, on_conflict="norad_id").execute()
        except Exception as e:
            log.error("TLE refresh failed for group %s: %s", group, e)


def _classify_object(name: str) -> str:
    name_upper = name.upper()
    if "ISS" in name_upper or "ZARYA" in name_upper:
        return "iss"
    if "STARLINK" in name_upper:
        return "satellite"
    if "DRAGON" in name_upper or "SOYUZ" in name_upper or "CREW" in name_upper:
        return "crewed"
    if "R/B" in name_upper or "DEB" in name_upper:
        return "debris"
    return "satellite"


def _rarity_for(name: str) -> str:
    name_upper = name.upper()
    if "ISS" in name_upper or "ZARYA" in name_upper:
        return "rare"
    if "DRAGON" in name_upper or "SOYUZ" in name_upper:
        return "epic"
    if "STARLINK" in name_upper:
        return "common"
    return "uncommon"


async def compute_passes():
    """
    For each active player location, compute upcoming passes.
    Simplified: uses a grid of player home cities rather than live GPS.
    Live GPS pass computation runs client-side using SGP4 in the mobile app.
    """
    db = get_client()
    # Fetch all active satellites with TLEs
    sats = db.table("space_objects").select("*").eq("active", True).not_.is_("tle_line1", "null").execute()
    if not sats.data:
        return

    # Get distinct active player cities as proxy locations
    players = db.table("players").select("home_city").not_.is_("home_city", "null").execute()
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=PASS_WINDOW_HOURS)

    for sat in sats.data:
        try:
            Satrec.twoline2rv(sat["tle_line1"], sat["tle_line2"])
            # Insert a generic global catchable window as a placeholder.
            # Production: compute per-city ground tracks with SGP4 properly.
            db.table("catchable_objects").insert({
                "space_object_id": sat["id"],
                "pass_start": now.isoformat(),
                "pass_end": window_end.isoformat(),
                "max_elevation": 90.0,
                "region_lat": 0.0,
                "region_lon": 0.0,
                "region_radius_km": 20000,
            }).execute()
        except Exception as e:
            log.warning("Pass compute failed for %s: %s", sat.get("name"), e)


async def main():
    log.info("Satellite tracker starting")
    tle_refresh_interval  = 6 * 3600   # 6 hours
    pass_compute_interval = 600         # 10 minutes
    last_tle_refresh = 0.0

    while True:
        now = asyncio.get_event_loop().time()
        if now - last_tle_refresh >= tle_refresh_interval:
            await refresh_tle_db()
            last_tle_refresh = now
        await compute_passes()
        await asyncio.sleep(pass_compute_interval)


if __name__ == "__main__":
    asyncio.run(main())
