"""
AI Rival Road Kings — seeds ghost players as territory holders.
"""
import hashlib
import logging
import os
import random
import sys


# Ensure absolute imports work
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

_ARCHETYPES = [
    ("GhostKing_{city}",   (8_000,  25_000), (8,  14)),
    ("RoadRacer_{city}",   (3_000,  12_000), (6,  11)),
    ("UrbanHunter_{city}", (15_000, 60_000), (12, 20)),
    ("NightCruiser_{n}",   (1_500,   6_000), (4,   9)),
    ("LocalLegend_{city}", (40_000, 120_000),(18, 25)),
    ("Drifter_{n}",        (500,    3_000),  (2,   7)),
    ("SpeedDemon_{n}",     (20_000, 80_000), (15, 22)),
]

_CITY_TAG = {
    "Seoul": "Seoul", "Busan": "Busan", "Los Angeles": "LA", "New York": "NYC",
    "Chicago": "CHI", "Houston": "HOU", "Tokyo": "Tokyo", "Osaka": "Osaka",
    "London": "LDN", "Frankfurt": "FRA", "Sydney": "SYD", "Singapore": "SGP",
    "Dubai": "DXB", "Toronto": "YYZ", "São Paulo": "SAO", "Mexico City": "MEX",
}

GHOSTS_PER_CITY = 5

def _stable_id(seed: str) -> str:
    h = hashlib.sha256(seed.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def _ensure_ghost_players(db, city: str) -> list[dict]:
    tag = _CITY_TAG.get(city, city.replace(" ", ""))
    players = []
    for i, (tmpl, xp_range, lvl_range) in enumerate(_ARCHETYPES[:GHOSTS_PER_CITY]):
        username = tmpl.format(city=tag, n=i + 1)
        ghost_id = _stable_id(f"ghost_{city}_{i}")
        xp = random.randint(*xp_range)
        level = random.randint(*lvl_range)

        db.table("players").upsert({
            "id": ghost_id,
            "username": username,
            "xp": xp,
            "level": level,
            "is_ai_rival": True, # Note: schema says is_ai_rival, script said is_ai earlier. Fixed to match schema.
            "home_city": city,
        }, on_conflict="id").execute()

        players.append({"id": ghost_id, "username": username, "xp": xp, "level": level})
    return players

def seed_rivals_for_city(city: str, density: float = 0.30):
    db = get_client()
    log.info(f"[{city}] fetching road segments for rivals...")
    result = db.table("road_segments").select("id, king_id").eq("city", city).execute()
    segments = result.data or []
    if not segments:
        log.warning(f"[{city}] no segments found for rival seeding")
        return

    unclaimed = [s for s in segments if not s.get("king_id")]
    target_n  = int(len(segments) * density)
    to_claim  = min(target_n, len(unclaimed))

    if to_claim == 0:
        log.info(f"[{city}] no unclaimed segments for rivals")
        return

    ghost_players = _ensure_ghost_players(db, city)
    rng = random.Random(hashlib.sha256(city.encode()).digest())
    chosen = rng.sample(unclaimed, to_claim)

    total_lvl = sum(p["level"] for p in ghost_players)
    weights   = [p["level"] / total_lvl for p in ghost_players]
    assigned: dict[str, list] = {p["id"]: [] for p in ghost_players}
    for seg in chosen:
        owner = rng.choices(ghost_players, weights=weights, k=1)[0]
        assigned[owner["id"]].append(seg["id"])

    for player in ghost_players:
        segs = assigned[player["id"]]
        for seg_id in segs:
            db.table("road_segments").update({
                "king_id": player["id"],
                "king_scan_count": rng.randint(3, 30),
                "king_since": "2025-01-01T00:00:00+00:00",
            }).eq("id", seg_id).execute()
    
    log.info(f"[{city}] rival seeding complete: {to_claim} segments claimed")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", required=True)
    parser.add_argument("--density", type=float, default=0.30)
    args = parser.parse_args()
    seed_rivals_for_city(args.city, args.density)
