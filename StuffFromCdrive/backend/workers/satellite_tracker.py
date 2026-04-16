"""
Satellite tracking worker — runs as a Railway background process.

Responsibilities:
1. Poll Celestrak every 6 hours for updated TLE data
2. Every 10 minutes: compute overhead passes for active player locations
3. Insert upcoming passes into catchable_objects table
4. Fire Expo push notification 5 minutes before pass_start
"""
import asyncio
import logging
import math
from datetime import datetime, timezone, timedelta

import httpx
from sgp4.api import Satrec, jday

from db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Celestrak TLE group endpoints
CELESTRAK_GROUPS = {
    "stations": "https://celestrak.org/SPACETRACK/query/class/gp/GROUP/stations/format/tle",
    "starlink":  "https://celestrak.org/SPACETRACK/query/class/gp/GROUP/starlink/format/tle",
    "visual":    "https://celestrak.org/SPACETRACK/query/class/gp/GROUP/visual/format/tle",
}

PASS_WINDOW_HOURS   = 12       # how far ahead to predict passes
MIN_ELEVATION_DEG   = 10       # minimum elevation to be "catchable" (above horizon)
STEP_SECONDS        = 30       # SGP4 propagation step size
NOTIFY_BEFORE_SECS  = 300      # 5 min advance push notification
NOTIFY_RADIUS_KM    = 600      # notify players whose home city is within this radius

# Major cities used as proxy observer locations until live player GPS is used
# (lat, lon, city_name)
SEED_LOCATIONS: list[tuple[float, float, str]] = [
    # East Asia
    (37.5665,  126.9780, "Seoul"),
    (35.6762,  139.6503, "Tokyo"),
    # North America
    (34.0522, -118.2437, "Los Angeles"),
    (40.7128,  -74.0060, "New York"),
    (41.8781,  -87.6298, "Chicago"),
    (33.7490,  -84.3880, "Atlanta"),    # SE US — covers Georgia, Alabama, Carolinas
    (29.7604,  -95.3698, "Houston"),    # US South / Gulf Coast / Texas
    # Europe
    (51.5074,   -0.1278, "London"),
    (48.8566,    2.3522, "Paris"),
    (52.5200,   13.4050, "Berlin"),
    # South / Southeast Asia
    (19.0760,   72.8777, "Mumbai"),     # South Asia — covers India subcontinent
    (1.3521,   103.8198, "Singapore"),
    # Oceania
    (-33.8688, 151.2093, "Sydney"),
    # Africa / Middle East
    (30.0444,   31.2357, "Cairo"),      # covers N Africa & Middle East
    # South America
    (-23.5505,  -46.6333, "São Paulo"), # covers most of Brazil & Southern Cone
]

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two lat/lon points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def _player_in_range(player: dict, region_lat: float, region_lon: float) -> bool:
    """Return True if the player's GPS home location is within NOTIFY_RADIUS_KM of the pass region."""
    if player.get("home_lat") is None or player.get("home_lon") is None:
        return False
    return _haversine_km(player["home_lat"], player["home_lon"], region_lat, region_lon) <= NOTIFY_RADIUS_KM


# ---------------------------------------------------------------------------
# GMST & elevation helpers
# ---------------------------------------------------------------------------

def _gmst_rad(jd_whole: float, jd_frac: float) -> float:
    """Greenwich Mean Sidereal Time in radians for the given Julian date."""
    t = ((jd_whole - 2451545.0) + jd_frac) / 36525.0
    theta = (
        280.46061837
        + 360.98564736629 * ((jd_whole - 2451545.0) + jd_frac)
        + t * t * (0.000387933 - t / 38710000.0)
    )
    return math.radians(theta % 360.0)


def _elevation_deg(
    pos_eci_km: tuple[float, float, float],
    lat_deg: float,
    lon_deg: float,
    jd_whole: float,
    jd_frac: float,
) -> float:
    """
    Elevation angle (degrees) of a satellite above the observer's local horizon.

    Uses the standard ECI-to-topocentric projection:
      el = arcsin( dot(range_eci, zenith_eci) / |range_eci| )

    where zenith_eci is the unit vector from Earth's centre toward the observer.
    """
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    lst = _gmst_rad(jd_whole, jd_frac) + lon   # local sidereal time

    R_EARTH = 6371.0  # km
    obs = (
        R_EARTH * math.cos(lat) * math.cos(lst),
        R_EARTH * math.cos(lat) * math.sin(lst),
        R_EARTH * math.sin(lat),
    )

    rx = pos_eci_km[0] - obs[0]
    ry = pos_eci_km[1] - obs[1]
    rz = pos_eci_km[2] - obs[2]
    r_mag = math.sqrt(rx * rx + ry * ry + rz * rz)
    if r_mag < 1e-6:
        return 0.0

    # Zenith unit vector in ECI
    zx = math.cos(lat) * math.cos(lst)
    zy = math.cos(lat) * math.sin(lst)
    zz = math.sin(lat)

    dot = (rx * zx + ry * zy + rz * zz) / r_mag
    return math.degrees(math.asin(max(-1.0, min(1.0, dot))))


# ---------------------------------------------------------------------------
# TLE fetch & DB upsert
# ---------------------------------------------------------------------------

async def fetch_tles(url: str) -> list[tuple[str, str, str]]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    lines = [ln.strip() for ln in resp.text.splitlines() if ln.strip()]
    return [
        (lines[i], lines[i + 1], lines[i + 2])
        for i in range(0, len(lines) - 2, 3)
    ]


async def refresh_tle_db() -> None:
    """Pull latest TLEs from Celestrak and upsert into space_objects."""
    db = get_client()
    for group, url in CELESTRAK_GROUPS.items():
        try:
            tles = await fetch_tles(url)
            log.info("Fetched %d TLEs for group '%s'", len(tles), group)
            for name, line1, line2 in tles:
                norad_id = int(line1[2:7])
                db.table("space_objects").upsert(
                    {
                        "norad_id":       norad_id,
                        "name":           name.strip(),
                        "object_type":    _classify(name),
                        "rarity_tier":    _rarity(name),
                        "tle_line1":      line1,
                        "tle_line2":      line2,
                        "tle_updated_at": datetime.now(timezone.utc).isoformat(),
                        "active":         True,
                    },
                    on_conflict="norad_id",
                ).execute()
        except Exception as exc:
            log.error("TLE refresh failed for group '%s': %s", group, exc)


def _classify(name: str) -> str:
    n = name.upper()
    if any(k in n for k in ("ISS ", "ZARYA", "TIANGONG", "CSS ")):
        return "iss"
    if any(k in n for k in ("DRAGON", "SOYUZ", "CREW", "STARLINER")):
        return "crewed"
    if "STARLINK" in n:
        return "satellite"
    if any(k in n for k in ("R/B", "DEB", "DEBRIS")):
        return "debris"
    return "satellite"


def _rarity(name: str) -> str:
    n = name.upper()
    if any(k in n for k in ("ISS ", "ZARYA", "TIANGONG")):
        return "rare"
    if any(k in n for k in ("DRAGON", "SOYUZ", "CREW", "STARLINER")):
        return "epic"
    if "STARLINK" in n:
        return "common"
    return "uncommon"


# ---------------------------------------------------------------------------
# SGP4 pass computation
# ---------------------------------------------------------------------------

def _jday_from_dt(dt: datetime) -> tuple[float, float]:
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                dt.second + dt.microsecond / 1e6)


def _compute_passes_for_sat(
    sat: Satrec,
    lat: float,
    lon: float,
    t_start: datetime,
    t_end: datetime,
) -> list[dict]:
    """
    Walk STEP_SECONDS intervals from t_start to t_end.
    Record contiguous windows where elevation ≥ MIN_ELEVATION_DEG.
    Returns list of {pass_start, pass_end, max_elevation}.
    """
    passes: list[dict] = []
    in_pass = False
    pass_start: datetime | None = None
    max_el = 0.0

    t = t_start
    step = timedelta(seconds=STEP_SECONDS)

    while t <= t_end:
        jd_w, jd_f = _jday_from_dt(t)
        e, pos, _ = sat.sgp4(jd_w, jd_f)
        if e == 0:   # 0 = no error
            el = _elevation_deg(pos, lat, lon, jd_w, jd_f)
            if el >= MIN_ELEVATION_DEG:
                if not in_pass:
                    in_pass = True
                    pass_start = t
                    max_el = el
                else:
                    max_el = max(max_el, el)
            else:
                if in_pass:
                    passes.append({
                        "pass_start":    pass_start.isoformat(),
                        "pass_end":      t.isoformat(),
                        "max_elevation": round(max_el, 1),
                    })
                    in_pass = False
                    max_el = 0.0
        t += step

    if in_pass and pass_start:
        passes.append({
            "pass_start":    pass_start.isoformat(),
            "pass_end":      t_end.isoformat(),
            "max_elevation": round(max_el, 1),
        })

    return passes


async def compute_passes() -> None:
    """
    For each satellite × each seed city, compute overhead passes.
    Clears stale passes before inserting new ones.
    """
    db = get_client()
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=PASS_WINDOW_HOURS)

    # Remove expired passes
    db.table("catchable_objects").delete().lt("pass_end", now.isoformat()).execute()

    # Load satellites with valid TLEs
    rows = (
        db.table("space_objects")
        .select("id, name, tle_line1, tle_line2")
        .eq("active", True)
        .not_.is_("tle_line1", "null")
        .execute()
    )
    if not rows.data:
        log.warning("No satellites with TLEs in DB — run TLE refresh first")
        return

    inserted = 0
    for row in rows.data:
        try:
            sat = Satrec.twoline2rv(row["tle_line1"], row["tle_line2"])
        except Exception as exc:
            log.warning("Bad TLE for %s: %s", row["name"], exc)
            continue

        for lat, lon, city in SEED_LOCATIONS:
            try:
                passes = _compute_passes_for_sat(sat, lat, lon, now, window_end)
                for p in passes:
                    db.table("catchable_objects").upsert(
                        {
                            "space_object_id":  row["id"],
                            "pass_start":       p["pass_start"],
                            "pass_end":         p["pass_end"],
                            "max_elevation":    p["max_elevation"],
                            "region_lat":       lat,
                            "region_lon":       lon,
                            "region_radius_km": 500,
                        },
                        on_conflict="space_object_id,pass_start",
                    ).execute()
                    inserted += 1
            except Exception as exc:
                log.warning("Pass compute error %s @ %s: %s", row["name"], city, exc)

    log.info("Pass computation complete — %d windows inserted/updated", inserted)


# ---------------------------------------------------------------------------
# Push notifications
# ---------------------------------------------------------------------------

async def fire_notifications() -> None:
    """Send Expo push notifications for passes starting in the next NOTIFY_BEFORE_SECS."""
    db = get_client()
    now = datetime.now(timezone.utc)
    notify_cutoff = (now + timedelta(seconds=NOTIFY_BEFORE_SECS)).isoformat()

    upcoming = (
        db.table("catchable_objects")
        .select("id, pass_start, max_elevation, region_lat, region_lon, space_objects(name, rarity_tier)")
        .eq("notified", False)
        .lte("pass_start", notify_cutoff)
        .gte("pass_end", now.isoformat())
        .execute()
    )
    if not upcoming.data:
        return

    # Fetch all players who have a push token and a home city for radius filtering.
    player_rows = (
        db.table("players")
        .select("expo_push_token, home_lat, home_lon")
        .not_.is_("expo_push_token", "null")
        .not_.is_("home_lat", "null")
        .execute()
    )
    players = player_rows.data or []

    messages = []
    for row in upcoming.data:
        region_lat = row["region_lat"]
        region_lon = row["region_lon"]
        nearby_tokens = [
            p["expo_push_token"]
            for p in players
            if _player_in_range(p, region_lat, region_lon)
        ]
        if not nearby_tokens:
            continue

        obj = row.get("space_objects") or {}
        minutes = max(0, int(
            (datetime.fromisoformat(row["pass_start"]).replace(tzinfo=timezone.utc) - now).total_seconds() // 60
        ))
        messages.append({
            "to": nearby_tokens,
            "title": f"{obj.get('name', 'Object')} overhead in {minutes}m",
            "body": f"{round(row['max_elevation'])}° max elevation — point your phone at the sky!",
            "data": {"type": "satellite_pass", "catchable_object_id": row["id"]},
        })

    if messages:
        async with httpx.AsyncClient() as client:
            for msg in messages:
                try:
                    await client.post("https://exp.host/--/api/v2/push/send", json=msg, timeout=10)
                except Exception as exc:
                    log.warning("Push notification failed: %s", exc)

    ids = [r["id"] for r in upcoming.data]
    for oid in ids:
        db.table("catchable_objects").update({"notified": True}).eq("id", oid).execute()

    notified_combos = sum(len(m["to"]) for m in messages)
    log.info("Sent notifications for %d upcoming passes (%d device/pass combos)", len(messages), notified_combos)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def main() -> None:
    log.info("Satellite tracker starting")
    tle_interval  = 6 * 3600   # 6 hours
    pass_interval = 600         # 10 minutes
    last_tle = 0.0

    while True:
        loop_time = asyncio.get_event_loop().time()

        if loop_time - last_tle >= tle_interval:
            await refresh_tle_db()
            last_tle = loop_time

        await compute_passes()
        await fire_notifications()
        await asyncio.sleep(pass_interval)


if __name__ == "__main__":
    asyncio.run(main())
