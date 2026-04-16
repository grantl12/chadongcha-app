"""
Seed the player market with AI-owned listings.
"""
import hashlib
import logging
import os
import random
import sys
from datetime import datetime, timezone, timedelta

# Ensure absolute imports work
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Listings to seed — (make, model, generation_label, body_style, color, rarity, asking_price)
SEED_LISTINGS = [
    ("Toyota",   "Camry",    "Toyota Camry XV70",     "sedan",       "White",   "common",   80),
    ("Honda",    "Civic",    "Honda Civic FE",        "sedan",       "Blue",    "common",   80),
    ("Ford",     "F-150",    "Ford F-150 P702",       "truck",       "Silver",  "common",   90),
    ("Toyota",   "Tacoma",   "Toyota Tacoma 3rd Gen", "truck",       "Black",   "uncommon", 250),
    ("Toyota",   "GR86",     "Toyota GR86 ZN8",       "coupe",       "Red",     "uncommon", 350),
    ("Honda",    "Civic",    "Honda Civic Type R FL5", "hatchback",  "Blue",    "rare",     600),
    ("Toyota",   "Supra",    "Toyota Supra A90",      "coupe",       "White",   "rare",     800),
    ("Porsche",  "911",      "Porsche 911 992",       "coupe",       "Silver",  "epic",     2_200),
]

LISTING_DURATION_DAYS = 7

def _stable_id(seed: str) -> str:
    h = hashlib.sha256(seed.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def _ensure_seller(db, seed: str, username: str, city: str) -> str:
    player_id = _stable_id(seed)
    db.table("players").upsert({
        "id":       player_id,
        "username": username,
        "xp":       random.randint(5000, 15000),
        "level":    random.randint(5, 12),
        "is_ai_rival": True,
        "home_city": city,
    }, on_conflict="id").execute()
    return player_id

def _find_generation_id(db, generation_label: str) -> str | None:
    res = db.table("generations").select("id").ilike("common_name", f"%{generation_label.split()[-1]}%").limit(1).execute()
    return res.data[0]["id"] if res.data else None

def seed_market_for_city(city: str):
    db = get_client()
    log.info(f"[{city}] seeding local market listings...")
    
    # Create a local seller
    tag = city.replace(" ", "")[:3].upper()
    seller_id = _ensure_seller(db, f"market_seller_{city}", f"LotLizard_{tag}", city)
    
    rng = random.Random(hashlib.sha256(city.encode()).digest())
    expires_at = (datetime.now(timezone.utc) + timedelta(days=LISTING_DURATION_DAYS)).isoformat()
    
    # Pick a few random listings from the master list
    local_batch = rng.sample(SEED_LISTINGS, k=min(4, len(SEED_LISTINGS)))
    
    for i, (make, model, gen_label, body_style, color, rarity, price) in enumerate(local_batch):
        catch_id = _stable_id(f"seed_catch_{city}_{i}")
        listing_id = _stable_id(f"seed_listing_{city}_{i}")
        gen_id = _find_generation_id(db, gen_label)

        # Insert catch
        db.table("catches").upsert({
            "id":            catch_id,
            "player_id":     seller_id,
            "generation_id": gen_id,
            "catch_type":    "highway",
            "color":         color,
            "body_style":    body_style,
            "confidence":    round(rng.uniform(0.72, 0.95), 2),
            "caught_at":     (datetime.now(timezone.utc) - timedelta(days=rng.randint(1, 14))).isoformat(),
            "synced_at":     datetime.now(timezone.utc).isoformat(),
            "fuzzy_city":    city,
        }, on_conflict="id").execute()

        # Insert listing
        db.table("market_listings").upsert({
            "id":           listing_id,
            "seller_id":    seller_id,
            "catch_id":     catch_id,
            "make":         make,
            "model":        model,
            "generation":   gen_label,
            "body_style":   body_style,
            "color":        color,
            "rarity":       rarity,
            "asking_price": price,
            "expires_at":   expires_at,
            "status":       "active",
        }, on_conflict="id").execute()

    log.info(f"[{city}] market seeding complete.")

if __name__ == "__main__":
    # Default behavior: seed for specific cities or all known
    db = get_client()
    res = db.table("road_segments").select("city").execute()
    cities = sorted({r["city"] for r in (res.data or []) if r.get("city")})
    for c in cities:
        seed_market_for_city(c)
