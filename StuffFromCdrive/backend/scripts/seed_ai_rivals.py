"""
AI Rival Road Kings — seeds ghost players as territory holders to make the
map feel alive for new players from day one.

Usage:
    python scripts/seed_ai_rivals.py                    # seed all cities
    python scripts/seed_ai_rivals.py --city Seoul       # single city
    python scripts/seed_ai_rivals.py --density 0.4      # 40% coverage (default 0.30)
    python scripts/seed_ai_rivals.py --dry-run          # preview without writing

Ghost players are inserted into the `players` table as AI rivals with
is_ai=true. Road king slots are claimed deterministically by seeding the same
ghost every time, so re-runs are idempotent.
"""
import argparse
import hashlib
import logging
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Ghost player archetypes — one pool per city flavour
# Each entry: (username_template, xp_range, level_range)
_ARCHETYPES = [
    ("GhostKing_{city}",   (8_000,  25_000), (8,  14)),
    ("RoadRacer_{city}",   (3_000,  12_000), (6,  11)),
    ("UrbanHunter_{city}", (15_000, 60_000), (12, 20)),
    ("NightCruiser_{n}",   (1_500,   6_000), (4,   9)),
    ("LocalLegend_{city}", (40_000, 120_000),(18, 25)),
    ("Drifter_{n}",        (500,    3_000),  (2,   7)),
    ("SpeedDemon_{n}",     (20_000, 80_000), (15, 22)),
]

# City → locale hint for username generation
_CITY_TAG = {
    "Seoul":         "Seoul",
    "Busan":         "Busan",
    "Los Angeles":   "LA",
    "New York":      "NYC",
    "Chicago":       "CHI",
    "Houston":       "HOU",
    "Tokyo":         "Tokyo",
    "Osaka":         "Osaka",
    "London":        "LDN",
    "Frankfurt":     "FRA",
    "Sydney":        "SYD",
    "Singapore":     "SGP",
    "Dubai":         "DXB",
    "Toronto":       "YYZ",
    "São Paulo":     "SAO",
    "Mexico City":   "MEX",
}

# How many ghost players to create per city (they spread across segments)
GHOSTS_PER_CITY = 5


def _stable_id(seed: str) -> str:
    """Deterministic UUID-ish string from a seed so re-runs are idempotent."""
    h = hashlib.sha256(seed.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _ensure_ghost_players(db, city: str, dry_run: bool) -> list[dict]:
    """Create (or fetch) ghost players for a city. Returns list of player dicts."""
    tag = _CITY_TAG.get(city, city.replace(" ", ""))
    players = []
    for i, (tmpl, xp_range, lvl_range) in enumerate(_ARCHETYPES[:GHOSTS_PER_CITY]):
        username = tmpl.format(city=tag, n=i + 1)
        ghost_id = _stable_id(f"ghost_{city}_{i}")
        xp = random.randint(*xp_range)
        level = random.randint(*lvl_range)

        if not dry_run:
            db.table("players").upsert({
                "id": ghost_id,
                "username": username,
                "xp": xp,
                "level": level,
                "is_ai": True,
                "home_city": city,
            }, on_conflict="id").execute()

        players.append({"id": ghost_id, "username": username, "xp": xp, "level": level})

    return players


def seed_city(db, city: str, density: float, dry_run: bool):
    log.info(f"[{city}] fetching road segments...")
    result = db.table("road_segments") \
        .select("id, king_id") \
        .eq("city", city) \
        .execute()

    segments = result.data or []
    if not segments:
        log.warning(f"[{city}] no segments found — run osm_seeder.py first")
        return

    # Only claim unclaimed segments (don't evict real players)
    unclaimed = [s for s in segments if not s.get("king_id")]
    target_n  = int(len(segments) * density)
    # Never exceed what's unclaimed
    to_claim  = min(target_n, len(unclaimed))

    if to_claim == 0:
        log.info(f"[{city}] {len(segments)} segments, all already claimed — skipping")
        return

    log.info(f"[{city}] {len(segments)} total, {len(unclaimed)} unclaimed, "
             f"claiming {to_claim} ({density*100:.0f}%)")

    ghost_players = _ensure_ghost_players(db, city, dry_run)

    # Seed RNG deterministically per city so re-runs pick same segments
    rng = random.Random(hashlib.sha256(city.encode()).digest())
    chosen = rng.sample(unclaimed, to_claim)

    # Distribute segments round-robin across ghosts, weighted by their level
    #   (higher-level ghosts get more roads)
    total_lvl = sum(p["level"] for p in ghost_players)
    weights   = [p["level"] / total_lvl for p in ghost_players]
    assigned: dict[str, list] = {p["id"]: [] for p in ghost_players}
    for seg in chosen:
        owner = rng.choices(ghost_players, weights=weights, k=1)[0]
        assigned[owner["id"]].append(seg["id"])

    updates = 0
    for player in ghost_players:
        segs = assigned[player["id"]]
        if not segs:
            continue
        log.info(f"  {player['username']}: {len(segs)} roads")
        if not dry_run:
            # Batch update — Supabase py client doesn't support bulk update with
            # different values per row, so we loop (segments are ~hundreds, fine)
            for seg_id in segs:
                db.table("road_segments").update({
                    "king_id": player["id"],
                    "king_scan_count": rng.randint(3, 30),
                    "king_since": "2025-01-01T00:00:00+00:00",
                }).eq("id", seg_id).execute()
            updates += len(segs)

    if dry_run:
        log.info(f"[{city}] DRY RUN — would claim {to_claim} segments")
    else:
        log.info(f"[{city}] done — {updates} segments claimed")


def main():
    parser = argparse.ArgumentParser(description="Seed AI rival Road Kings")
    parser.add_argument("--city",    help="Seed a single city (default: all)")
    parser.add_argument("--density", type=float, default=0.30,
                        help="Fraction of segments to claim (default 0.30)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview changes without writing to DB")
    args = parser.parse_args()

    db = get_client()

    if args.city:
        cities = [args.city]
    else:
        # Fetch distinct cities from seeded road_segments
        result = db.table("road_segments").select("city").execute()
        cities = sorted({r["city"] for r in (result.data or []) if r.get("city")})
        log.info(f"Found {len(cities)} cities: {cities}")

    for city in cities:
        seed_city(db, city, args.density, args.dry_run)

    log.info("All done.")


if __name__ == "__main__":
    main()
