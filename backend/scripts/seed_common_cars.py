"""
Common Cars Seeder — scrapes images for ~100 everyday vehicles + public service fleet.

Extends the ID game with models a non-enthusiast would encounter on any road.
Writes to the same ml/data/id_game/ folder and id_game_inserts.sql as seed_id_game.py.
Run independently; R2 upload + local fallback logic is shared from seed_id_game.
"""

import os
import sys
import random
import logging

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Reuse scraping/upload infrastructure from seed_id_game.py
sys.path.insert(0, os.path.dirname(__file__))
from seed_id_game import (  # noqa: E402
    scrape_car, DATA_DIR, SQL_FILE, IMAGES_PER_CAR,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ─── Car List ─────────────────────────────────────────────────────────────────

EVERYDAY_CARS = [
    # ── Compact / economy sedans & hatchbacks ────────────────────────────────
    {"class": "Honda Civic 11th Gen", "label": "Honda Civic", "body": "sedan"},
    {"class": "Toyota Corolla 12th Gen", "label": "Toyota Corolla", "body": "sedan"},
    {"class": "Mazda 3 Hatchback", "label": "Mazda 3 Hatchback", "body": "hatchback"},
    {"class": "Hyundai Elantra", "label": "Hyundai Elantra", "body": "sedan"},
    {"class": "Kia Forte", "label": "Kia Forte", "body": "sedan"},
    {"class": "Nissan Sentra", "label": "Nissan Sentra", "body": "sedan"},
    {"class": "Volkswagen Jetta", "label": "VW Jetta", "body": "sedan"},
    {"class": "Subaru Impreza", "label": "Subaru Impreza", "body": "hatchback"},
    {"class": "Toyota Yaris", "label": "Toyota Yaris", "body": "hatchback"},
    {"class": "Honda Fit", "label": "Honda Fit", "body": "hatchback"},
    {"class": "Hyundai Accent", "label": "Hyundai Accent", "body": "sedan"},
    {"class": "Kia Rio", "label": "Kia Rio", "body": "sedan"},
    {"class": "Chevrolet Spark", "label": "Chevrolet Spark", "body": "hatchback"},
    {"class": "Nissan Versa", "label": "Nissan Versa", "body": "sedan"},
    {"class": "Mitsubishi Mirage", "label": "Mitsubishi Mirage", "body": "hatchback"},

    # ── Midsize sedans ────────────────────────────────────────────────────────
    {"class": "Toyota Camry 8th Gen", "label": "Toyota Camry", "body": "sedan"},
    {"class": "Honda Accord 10th Gen", "label": "Honda Accord", "body": "sedan"},
    {"class": "Nissan Altima 6th Gen", "label": "Nissan Altima", "body": "sedan"},
    {"class": "Hyundai Sonata DN8", "label": "Hyundai Sonata", "body": "sedan"},
    {"class": "Kia K5", "label": "Kia K5", "body": "sedan"},
    {"class": "Mazda 6 GJ", "label": "Mazda 6", "body": "sedan"},
    {"class": "Volkswagen Passat B8", "label": "VW Passat", "body": "sedan"},
    {"class": "Subaru Legacy 7th Gen", "label": "Subaru Legacy", "body": "sedan"},
    {"class": "Chevrolet Malibu 9th Gen", "label": "Chevrolet Malibu", "body": "sedan"},
    {"class": "Chrysler 300", "label": "Chrysler 300", "body": "sedan"},

    # ── Full-size sedans ──────────────────────────────────────────────────────
    {"class": "Toyota Avalon 5th Gen", "label": "Toyota Avalon", "body": "sedan"},
    {"class": "Chevrolet Impala 10th Gen", "label": "Chevrolet Impala", "body": "sedan"},
    {"class": "Dodge Charger LD", "label": "Dodge Charger", "body": "sedan"},
    {"class": "Ford Crown Victoria", "label": "Ford Crown Victoria", "body": "sedan"},

    # ── Muscle/sport (civilian, common) ───────────────────────────────────────
    {"class": "Ford Mustang S550", "label": "Ford Mustang", "body": "coupe"},
    {"class": "Chevrolet Camaro 6th Gen", "label": "Chevrolet Camaro", "body": "coupe"},
    {"class": "Dodge Challenger LC", "label": "Dodge Challenger", "body": "coupe"},

    # ── Compact crossovers ────────────────────────────────────────────────────
    {"class": "Toyota RAV4 5th Gen", "label": "Toyota RAV4", "body": "suv"},
    {"class": "Honda CR-V 5th Gen", "label": "Honda CR-V", "body": "suv"},
    {"class": "Ford Escape 4th Gen", "label": "Ford Escape", "body": "suv"},
    {"class": "Chevrolet Equinox 3rd Gen", "label": "Chevrolet Equinox", "body": "suv"},
    {"class": "Nissan Rogue 3rd Gen", "label": "Nissan Rogue", "body": "suv"},
    {"class": "Hyundai Tucson NX4", "label": "Hyundai Tucson", "body": "suv"},
    {"class": "Mazda CX-5 2nd Gen", "label": "Mazda CX-5", "body": "suv"},
    {"class": "Kia Sportage NQ5", "label": "Kia Sportage", "body": "suv"},
    {"class": "Subaru Forester 5th Gen", "label": "Subaru Forester", "body": "suv"},
    {"class": "Mitsubishi Outlander 3rd Gen", "label": "Mitsubishi Outlander", "body": "suv"},
    {"class": "Jeep Cherokee KL", "label": "Jeep Cherokee", "body": "suv"},
    {"class": "Volkswagen Tiguan 2nd Gen", "label": "VW Tiguan", "body": "suv"},
    {"class": "Subaru Outback 6th Gen", "label": "Subaru Outback", "body": "suv"},

    # ── Midsize SUVs ──────────────────────────────────────────────────────────
    {"class": "Ford Explorer 6th Gen", "label": "Ford Explorer", "body": "suv"},
    {"class": "Chevrolet Traverse 2nd Gen", "label": "Chevrolet Traverse", "body": "suv"},
    {"class": "Toyota Highlander 4th Gen", "label": "Toyota Highlander", "body": "suv"},
    {"class": "Honda Pilot 3rd Gen", "label": "Honda Pilot", "body": "suv"},
    {"class": "Nissan Pathfinder 5th Gen", "label": "Nissan Pathfinder", "body": "suv"},
    {"class": "Hyundai Palisade", "label": "Hyundai Palisade", "body": "suv"},
    {"class": "Kia Telluride", "label": "Kia Telluride", "body": "suv"},
    {"class": "GMC Acadia 2nd Gen", "label": "GMC Acadia", "body": "suv"},
    {"class": "Dodge Durango WD", "label": "Dodge Durango", "body": "suv"},
    {"class": "Volkswagen Atlas", "label": "VW Atlas", "body": "suv"},

    # ── Full-size SUVs ────────────────────────────────────────────────────────
    {"class": "Chevrolet Suburban 12th Gen", "label": "Chevrolet Suburban", "body": "suv"},
    {"class": "Chevrolet Tahoe 5th Gen", "label": "Chevrolet Tahoe", "body": "suv"},
    {"class": "Ford Expedition 4th Gen", "label": "Ford Expedition", "body": "suv"},
    {"class": "GMC Yukon 5th Gen", "label": "GMC Yukon", "body": "suv"},

    # ── Full-size trucks ──────────────────────────────────────────────────────
    {"class": "Ford F-150 14th Gen", "label": "Ford F-150", "body": "truck"},
    {"class": "Chevrolet Silverado 1500 4th Gen", "label": "Chevrolet Silverado 1500", "body": "truck"},
    {"class": "RAM 1500 5th Gen", "label": "RAM 1500", "body": "truck"},
    {"class": "GMC Sierra 1500 4th Gen", "label": "GMC Sierra 1500", "body": "truck"},
    {"class": "Toyota Tundra 3rd Gen", "label": "Toyota Tundra", "body": "truck"},

    # ── Midsize trucks ────────────────────────────────────────────────────────
    {"class": "Toyota Tacoma 3rd Gen", "label": "Toyota Tacoma", "body": "truck"},
    {"class": "Chevrolet Colorado 2nd Gen", "label": "Chevrolet Colorado", "body": "truck"},
    {"class": "Ford Ranger P703", "label": "Ford Ranger", "body": "truck"},
    {"class": "Honda Ridgeline 2nd Gen", "label": "Honda Ridgeline", "body": "truck"},
    {"class": "Nissan Frontier 3rd Gen", "label": "Nissan Frontier", "body": "truck"},
    {"class": "GMC Canyon 2nd Gen", "label": "GMC Canyon", "body": "truck"},

    # ── Minivans ──────────────────────────────────────────────────────────────
    {"class": "Toyota Sienna 4th Gen", "label": "Toyota Sienna", "body": "minivan"},
    {"class": "Honda Odyssey 5th Gen", "label": "Honda Odyssey", "body": "minivan"},
    {"class": "Chrysler Pacifica", "label": "Chrysler Pacifica", "body": "minivan"},
    {"class": "Kia Carnival", "label": "Kia Carnival", "body": "minivan"},

    # ── Hybrid / EV (common) ──────────────────────────────────────────────────
    {"class": "Toyota Prius 4th Gen", "label": "Toyota Prius", "body": "hatchback"},
    {"class": "Toyota Prius Prime", "label": "Toyota Prius Prime", "body": "hatchback"},
    {"class": "Nissan LEAF 2nd Gen", "label": "Nissan LEAF", "body": "hatchback"},
    {"class": "Chevrolet Bolt EV", "label": "Chevrolet Bolt", "body": "hatchback"},
    {"class": "Volkswagen ID.4", "label": "VW ID.4", "body": "suv"},
    {"class": "Ford Mustang Mach-E", "label": "Ford Mustang Mach-E", "body": "suv"},

    # ── Entry-level luxury sedans ─────────────────────────────────────────────
    {"class": "BMW 3 Series G20", "label": "BMW 3 Series", "body": "sedan"},
    {"class": "Mercedes-Benz C-Class W206", "label": "Mercedes C-Class", "body": "sedan"},
    {"class": "Audi A4 B9", "label": "Audi A4", "body": "sedan"},
    {"class": "Lexus ES 350 7th Gen", "label": "Lexus ES 350", "body": "sedan"},
    {"class": "Cadillac CT5", "label": "Cadillac CT5", "body": "sedan"},
    {"class": "Acura TLX 2nd Gen", "label": "Acura TLX", "body": "sedan"},
    {"class": "Infiniti Q50", "label": "Infiniti Q50", "body": "sedan"},
    {"class": "Volvo S60 3rd Gen", "label": "Volvo S60", "body": "sedan"},
    {"class": "Genesis G70 2nd Gen", "label": "Genesis G70", "body": "sedan"},

    # ── Entry-level luxury SUVs ───────────────────────────────────────────────
    {"class": "BMW X3 G01", "label": "BMW X3", "body": "suv"},
    {"class": "Mercedes-Benz GLC W253", "label": "Mercedes GLC", "body": "suv"},
    {"class": "Audi Q5 2nd Gen", "label": "Audi Q5", "body": "suv"},
    {"class": "Lexus RX 500h", "label": "Lexus RX", "body": "suv"},
    {"class": "Cadillac XT5", "label": "Cadillac XT5", "body": "suv"},
    {"class": "Acura MDX 4th Gen", "label": "Acura MDX", "body": "suv"},
    {"class": "Infiniti QX60 3rd Gen", "label": "Infiniti QX60", "body": "suv"},
    {"class": "Volvo XC60 2nd Gen", "label": "Volvo XC60", "body": "suv"},
    {"class": "Genesis GV70", "label": "Genesis GV70", "body": "suv"},
    {"class": "Lincoln Corsair", "label": "Lincoln Corsair", "body": "suv"},
]

# ── Public service / working fleet ────────────────────────────────────────────
PUBLIC_SERVICE = [
    {"class": "American Yellow School Bus",      "label": "School Bus",           "body": "bus"},
    {"class": "City Transit Bus",                "label": "City Transit Bus",      "body": "bus"},
    {"class": "Garbage Truck Rear Loader",       "label": "Garbage Truck",         "body": "truck"},
    {"class": "Recycling Truck",                 "label": "Recycling Truck",       "body": "truck"},
    {"class": "Ford Explorer Police Interceptor","label": "Police SUV",            "body": "suv"},
    {"class": "Dodge Charger Police Car",        "label": "Police Cruiser",        "body": "sedan"},
    {"class": "Chevrolet Tahoe Police PPV",      "label": "Police Tahoe",          "body": "suv"},
    {"class": "Fire Engine Pumper Truck",        "label": "Fire Engine",           "body": "truck"},
    {"class": "Aerial Ladder Fire Truck",        "label": "Ladder Truck",          "body": "truck"},
    {"class": "Box Ambulance",                   "label": "Ambulance",             "body": "truck"},
    {"class": "USPS Mail Truck LLV",             "label": "Mail Truck",            "body": "truck"},
    {"class": "UPS Package Car",                 "label": "UPS Delivery Truck",    "body": "truck"},
    {"class": "FedEx Delivery Truck",            "label": "FedEx Truck",           "body": "truck"},
    {"class": "Amazon Delivery Van",             "label": "Amazon Van",            "body": "van"},
    {"class": "Flatbed Tow Truck",               "label": "Tow Truck",             "body": "truck"},
    {"class": "Street Sweeper",                  "label": "Street Sweeper",        "body": "truck"},
]

ALL_COMMON = EVERYDAY_CARS + PUBLIC_SERVICE


def main():
    random.shuffle(ALL_COMMON)
    seen_hashes: set = set()

    log.info("Starting common cars scrape: %d vehicles × %d images = %d total",
             len(ALL_COMMON), IMAGES_PER_CAR, len(ALL_COMMON) * IMAGES_PER_CAR)

    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        with open(SQL_FILE, "a", encoding="utf-8") as sql_f:
            for i, car in enumerate(ALL_COMMON):
                log.info("[%d/%d] %s", i + 1, len(ALL_COMMON), car["label"])
                scrape_car(ddgs, car, seen_hashes, sql_f)

    log.info("Done. SQL written to %s", SQL_FILE)
    log.info("Images saved to %s (upload to R2 id_game/ prefix if not auto-uploaded)", DATA_DIR)


if __name__ == "__main__":
    main()
