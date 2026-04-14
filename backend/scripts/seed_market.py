"""
Seed the player market with a handful of AI-owned listings so it doesn't
look empty on first launch.

Usage:
    python scripts/seed_market.py            # seed default listings
    python scripts/seed_market.py --dry-run  # preview without writing

Creates AI seller players, inserts catch records for them, then lists those
catches on the market at reasonable prices. Safe to re-run (idempotent via
upsert on catch_id / player check).
"""
import argparse
import hashlib
import logging
import os
import random
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# AI sellers — (stable seed, username, xp, level)
AI_SELLERS = [
    ("market_seller_0", "FlipKing_ATL",   12_000, 11),
    ("market_seller_1", "LotLizard_HOU",   8_500,  9),
    ("market_seller_2", "DealerDan_CRL",   5_200,  7),
]

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


def _ensure_seller(db, seed: str, username: str, xp: int, level: int, dry_run: bool) -> str:
    player_id = _stable_id(seed)
    if not dry_run:
        db.table("players").upsert({
            "id":       player_id,
            "username": username,
            "xp":       xp,
            "level":    level,
            "is_ai":    True,
            "credits":  0,
        }, on_conflict="id").execute()
    log.info("  Seller %s (%s)", username, player_id)
    return player_id


def _find_generation_id(db, generation_label: str) -> str | None:
    """Try to find a matching generation by common_name."""
    res = db.table("generations") \
        .select("id") \
        .ilike("common_name", f"%{generation_label.split()[-1]}%") \
        .limit(1) \
        .execute()
    if res.data:
        return res.data[0]["id"]
    return None


def main():
    parser = argparse.ArgumentParser(description="Seed market with AI listings")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db = get_client()

    # Create / ensure AI sellers
    sellers: list[str] = []
    for seed, username, xp, level in AI_SELLERS:
        pid = _ensure_seller(db, seed, username, xp, level, args.dry_run)
        sellers.append(pid)

    rng = random.Random(42)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=LISTING_DURATION_DAYS)).isoformat()
    inserted = 0

    for i, (make, model, gen_label, body_style, color, rarity, price) in enumerate(SEED_LISTINGS):
        seller_id = sellers[i % len(sellers)]
        catch_id  = _stable_id(f"seed_catch_{i}")
        listing_id = _stable_id(f"seed_listing_{i}")

        gen_id = _find_generation_id(db, gen_label)

        log.info("  Listing: %s %s (%s) @ %d CR — gen_id=%s", make, model, rarity, price, gen_id)

        if args.dry_run:
            continue

        # Insert catch for this AI seller (if not exists)
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
        }, on_conflict="id").execute()

        # Insert listing (if not exists)
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

        inserted += 1

    if args.dry_run:
        log.info("DRY RUN — would insert %d listings", len(SEED_LISTINGS))
    else:
        log.info("Done — %d listings seeded", inserted)


if __name__ == "__main__":
    main()
