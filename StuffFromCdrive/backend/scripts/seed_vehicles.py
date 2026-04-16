"""
Vehicle database seed — top ~120 recognizable generations for North American roads.

Usage:
    cd backend
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/seed_vehicles.py

Or with .env loaded:
    python -c "from dotenv import load_dotenv; load_dotenv()" && python scripts/seed_vehicles.py

Rarity tiers:
  common     — mainstream daily drivers seen on every block
  uncommon   — less ubiquitous but instantly recognizable
  rare       — enthusiast cars, limited trims, EVs pre-mainstream
  epic       — performance variants, sports cars, low-volume luxury
  legendary  — supercars, ultra-rare, sub-1000 units/year in US
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# ---------------------------------------------------------------------------
# Seed data: (generation_number, common_name, year_start, year_end, rarity, annual_volume)
# year_end = None means currently in production
# ---------------------------------------------------------------------------
SEED: list[dict] = [
    {
        "make": "Toyota", "country": "JP",
        "models": [
            {"name": "Camry", "class": "car", "generations": [
                (8, "XV70 (2018–present)",  2018, None, "common",    336000),
                (7, "XV50 (2012–2017)",     2012, 2017, "common",    280000),
            ]},
            {"name": "Corolla", "class": "car", "generations": [
                (12, "E210 (2019–present)", 2019, None, "common",    300000),
                (11, "E170 (2014–2018)",    2014, 2018, "common",    350000),
            ]},
            {"name": "RAV4", "class": "suv", "generations": [
                (5, "XA50 (2019–present)",  2019, None, "common",    430000),
                (4, "XA40 (2013–2018)",     2013, 2018, "common",    350000),
            ]},
            {"name": "Tacoma", "class": "truck", "generations": [
                (3, "3rd Gen (2016–present)", 2016, None, "common",  270000),
                (2, "2nd Gen (2005–2015)",    2005, 2015, "common",  200000),
            ]},
            {"name": "Highlander", "class": "suv", "generations": [
                (4, "XU70 (2020–present)", 2020, None, "common",     240000),
                (3, "XU50 (2014–2019)",    2014, 2019, "common",     220000),
            ]},
            {"name": "Tundra", "class": "truck", "generations": [
                (3, "3rd Gen (2022–present)", 2022, None, "common",  100000),
                (2, "2nd Gen (2007–2021)",    2007, 2021, "common",  120000),
            ]},
            {"name": "Prius", "class": "car", "generations": [
                (5, "XW60 (2023–present)", 2023, None, "uncommon",   80000),
                (4, "XW50 (2016–2022)",    2016, 2022, "common",    100000),
            ]},
            {"name": "4Runner", "class": "suv", "generations": [
                (5, "N280 (2010–present)", 2010, None, "uncommon",   90000),
            ]},
            {"name": "Supra", "class": "car", "generations": [
                (5, "A90 (2019–present)",  2019, None, "epic",       10000),
            ]},
            {"name": "GR86", "class": "car", "generations": [
                (2, "ZN8 (2022–present)",  2022, None, "rare",       15000),
                (1, "ZN6 (2012–2021)",     2012, 2021, "rare",       12000),
            ]},
        ],
    },
    {
        "make": "Honda", "country": "JP",
        "models": [
            {"name": "Civic", "class": "car", "generations": [
                (11, "11th Gen (2022–present)", 2022, None, "common",  310000),
                (10, "10th Gen (2016–2021)",    2016, 2021, "common",  320000),
            ]},
            {"name": "Accord", "class": "car", "generations": [
                (11, "11th Gen (2023–present)", 2023, None, "common",  200000),
                (10, "10th Gen (2018–2022)",    2018, 2022, "common",  220000),
            ]},
            {"name": "CR-V", "class": "suv", "generations": [
                (6, "6th Gen (2023–present)", 2023, None, "common",   380000),
                (5, "5th Gen (2017–2022)",    2017, 2022, "common",   400000),
            ]},
            {"name": "Pilot", "class": "suv", "generations": [
                (4, "4th Gen (2023–present)", 2023, None, "common",   100000),
            ]},
            {"name": "Civic Type R", "class": "car", "generations": [
                (6, "FL5 (2022–present)",  2022, None, "epic",   10000),
                (5, "FK8 (2017–2021)",     2017, 2021, "epic",    8000),
            ]},
            {"name": "Ridgeline", "class": "truck", "generations": [
                (2, "2nd Gen (2017–present)", 2017, None, "uncommon", 80000),
            ]},
        ],
    },
    {
        "make": "Ford", "country": "US",
        "models": [
            {"name": "F-150", "class": "truck", "generations": [
                (14, "P702 (2021–present)",  2021, None, "common",  650000),
                (13, "P552 (2015–2020)",     2015, 2020, "common",  700000),
            ]},
            {"name": "Mustang", "class": "car", "generations": [
                (7, "7th Gen (2024–present)", 2024, None, "rare",    50000),
                (6, "S550 (2015–2023)",       2015, 2023, "uncommon", 80000),
            ]},
            {"name": "Explorer", "class": "suv", "generations": [
                (6, "6th Gen (2020–present)", 2020, None, "common",  230000),
            ]},
            {"name": "Bronco", "class": "suv", "generations": [
                (7, "7th Gen (2021–present)", 2021, None, "uncommon", 90000),
            ]},
            {"name": "Maverick", "class": "truck", "generations": [
                (1, "1st Gen (2022–present)", 2022, None, "uncommon", 80000),
            ]},
            {"name": "Escape", "class": "suv", "generations": [
                (4, "4th Gen (2020–present)", 2020, None, "common",  200000),
            ]},
        ],
    },
    {
        "make": "Chevrolet", "country": "US",
        "models": [
            {"name": "Silverado 1500", "class": "truck", "generations": [
                (4, "T1 (2019–present)",  2019, None, "common",   500000),
                (3, "K2 (2014–2018)",     2014, 2018, "common",   550000),
            ]},
            {"name": "Equinox", "class": "suv", "generations": [
                (3, "3rd Gen (2018–present)", 2018, None, "common", 300000),
            ]},
            {"name": "Tahoe", "class": "suv", "generations": [
                (5, "5th Gen (2021–present)", 2021, None, "common", 100000),
            ]},
            {"name": "Colorado", "class": "truck", "generations": [
                (3, "3rd Gen (2023–present)", 2023, None, "uncommon", 60000),
                (2, "2nd Gen (2015–2022)",    2015, 2022, "common",   100000),
            ]},
            {"name": "Corvette", "class": "car", "generations": [
                (8, "C8 (2020–present)",  2020, None, "epic",  35000),
                (7, "C7 (2014–2019)",     2014, 2019, "rare",  30000),
            ]},
            {"name": "Malibu", "class": "car", "generations": [
                (9, "9th Gen (2016–2024)", 2016, 2024, "common", 180000),
            ]},
        ],
    },
    {
        "make": "BMW", "country": "DE",
        "models": [
            {"name": "3 Series", "class": "car", "generations": [
                (7, "G20 (2019–present)", 2019, None, "uncommon", 120000),
                (6, "F30 (2012–2018)",    2012, 2018, "uncommon", 130000),
            ]},
            {"name": "5 Series", "class": "car", "generations": [
                (8, "G60 (2024–present)", 2024, None, "uncommon",  80000),
                (7, "G30 (2017–2023)",    2017, 2023, "uncommon",  90000),
            ]},
            {"name": "X3", "class": "suv", "generations": [
                (3, "G01 (2018–present)", 2018, None, "uncommon", 100000),
            ]},
            {"name": "X5", "class": "suv", "generations": [
                (4, "G05 (2019–present)", 2019, None, "uncommon",  90000),
            ]},
            {"name": "M3", "class": "car", "generations": [
                (6, "G80 (2021–present)", 2021, None, "epic",   10000),
                (5, "F80 (2014–2020)",    2014, 2020, "epic",   12000),
            ]},
            {"name": "M4", "class": "car", "generations": [
                (2, "G82 (2021–present)", 2021, None, "epic",   8000),
            ]},
        ],
    },
    {
        "make": "Mercedes-Benz", "country": "DE",
        "models": [
            {"name": "C-Class", "class": "car", "generations": [
                (5, "W206 (2022–present)", 2022, None, "uncommon", 100000),
                (4, "W205 (2015–2021)",    2015, 2021, "uncommon", 120000),
            ]},
            {"name": "E-Class", "class": "car", "generations": [
                (6, "W214 (2024–present)", 2024, None, "uncommon",  70000),
                (5, "W213 (2017–2023)",    2017, 2023, "uncommon",  80000),
            ]},
            {"name": "GLE", "class": "suv", "generations": [
                (2, "W167 (2020–present)", 2020, None, "uncommon",  90000),
            ]},
            {"name": "G-Class", "class": "suv", "generations": [
                (2, "W463A (2019–present)", 2019, None, "epic",  12000),
            ]},
            {"name": "AMG GT", "class": "car", "generations": [
                (2, "C192 (2023–present)", 2023, None, "epic",   3000),
            ]},
        ],
    },
    {
        "make": "Audi", "country": "DE",
        "models": [
            {"name": "A4", "class": "car", "generations": [
                (5, "B9 (2017–present)", 2017, None, "uncommon", 80000),
            ]},
            {"name": "Q5", "class": "suv", "generations": [
                (2, "FY (2018–present)", 2018, None, "uncommon", 110000),
            ]},
            {"name": "A6", "class": "car", "generations": [
                (5, "C8 (2019–present)", 2019, None, "uncommon",  60000),
            ]},
            {"name": "R8", "class": "car", "generations": [
                (2, "Type 4S (2016–present)", 2016, None, "legendary", 2000),
            ]},
            {"name": "RS3", "class": "car", "generations": [
                (4, "8Y (2022–present)", 2022, None, "epic", 5000),
            ]},
        ],
    },
    {
        "make": "Volkswagen", "country": "DE",
        "models": [
            {"name": "Jetta", "class": "car", "generations": [
                (7, "7th Gen (2019–present)", 2019, None, "common", 100000),
            ]},
            {"name": "Tiguan", "class": "suv", "generations": [
                (2, "2nd Gen (2018–present)", 2018, None, "common",  90000),
            ]},
            {"name": "Golf GTI", "class": "car", "generations": [
                (8, "Mk8 (2022–present)",  2022, None, "rare",   25000),
                (7, "Mk7 (2015–2021)",     2015, 2021, "rare",   30000),
            ]},
            {"name": "Golf R", "class": "car", "generations": [
                (4, "Mk8R (2022–present)", 2022, None, "epic",  10000),
            ]},
        ],
    },
    {
        "make": "Tesla", "country": "US",
        "models": [
            {"name": "Model 3", "class": "car", "generations": [
                (2, "Highland (2024–present)", 2024, None, "uncommon", 200000),
                (1, "Gen 1 (2017–2023)",       2017, 2023, "uncommon", 180000),
            ]},
            {"name": "Model Y", "class": "suv", "generations": [
                (2, "Juniper (2025–present)", 2025, None, "uncommon", 500000),
                (1, "Gen 1 (2020–2024)",      2020, 2024, "uncommon", 600000),
            ]},
            {"name": "Model S", "class": "car", "generations": [
                (2, "Plaid Era (2021–present)", 2021, None, "rare",   35000),
            ]},
            {"name": "Cybertruck", "class": "truck", "generations": [
                (1, "Gen 1 (2024–present)", 2024, None, "epic",  50000),
            ]},
        ],
    },
    {
        "make": "Jeep", "country": "US",
        "models": [
            {"name": "Wrangler", "class": "suv", "generations": [
                (4, "JL (2018–present)", 2018, None, "uncommon", 200000),
                (3, "JK (2007–2017)",    2007, 2017, "common",   180000),
            ]},
            {"name": "Grand Cherokee", "class": "suv", "generations": [
                (5, "WL (2021–present)",  2021, None, "common",  170000),
                (4, "WK2 (2011–2021)",    2011, 2021, "common",  200000),
            ]},
            {"name": "Gladiator", "class": "truck", "generations": [
                (1, "JT (2020–present)", 2020, None, "uncommon",  60000),
            ]},
        ],
    },
    {
        "make": "Ram", "country": "US",
        "models": [
            {"name": "1500", "class": "truck", "generations": [
                (5, "DT (2019–present)", 2019, None, "common",  400000),
                (4, "DS (2009–2018)",    2009, 2018, "common",  350000),
            ]},
        ],
    },
    {
        "make": "GMC", "country": "US",
        "models": [
            {"name": "Sierra 1500", "class": "truck", "generations": [
                (4, "T1 (2019–present)", 2019, None, "common",  200000),
            ]},
            {"name": "Yukon", "class": "suv", "generations": [
                (5, "5th Gen (2021–present)", 2021, None, "common",  80000),
            ]},
        ],
    },
    {
        "make": "Dodge", "country": "US",
        "models": [
            {"name": "Challenger", "class": "car", "generations": [
                (3, "LC (2008–2023)", 2008, 2023, "uncommon", 70000),
            ]},
            {"name": "Charger", "class": "car", "generations": [
                (7, "LD (2011–2023)", 2011, 2023, "uncommon", 100000),
            ]},
        ],
    },
    {
        "make": "Subaru", "country": "JP",
        "models": [
            {"name": "Outback", "class": "suv", "generations": [
                (6, "6th Gen (2020–present)", 2020, None, "common",  100000),
                (5, "5th Gen (2015–2019)",    2015, 2019, "common",   90000),
            ]},
            {"name": "Forester", "class": "suv", "generations": [
                (5, "SK (2019–present)", 2019, None, "common",  80000),
            ]},
            {"name": "WRX", "class": "car", "generations": [
                (5, "VB (2022–present)", 2022, None, "rare",  15000),
                (4, "VA (2015–2021)",    2015, 2021, "rare",  20000),
            ]},
            {"name": "BRZ", "class": "car", "generations": [
                (2, "ZD8 (2022–present)", 2022, None, "rare",   8000),
                (1, "ZC6 (2013–2021)",    2013, 2021, "rare",  10000),
            ]},
        ],
    },
    {
        "make": "Nissan", "country": "JP",
        "models": [
            {"name": "Altima", "class": "car", "generations": [
                (6, "6th Gen (2019–present)", 2019, None, "common",  200000),
            ]},
            {"name": "Rogue", "class": "suv", "generations": [
                (3, "3rd Gen (2021–present)", 2021, None, "common",  350000),
            ]},
            {"name": "Frontier", "class": "truck", "generations": [
                (3, "3rd Gen (2022–present)", 2022, None, "common",   60000),
            ]},
            {"name": "GT-R", "class": "car", "generations": [
                (2, "R35 (2007–present)", 2007, None, "legendary",  1500),
            ]},
            {"name": "Z", "class": "car", "generations": [
                (7, "RZ34 (2023–present)", 2023, None, "rare",   8000),
                (6, "Z34 (2009–2020)",     2009, 2020, "uncommon", 12000),
            ]},
        ],
    },
    {
        "make": "Hyundai", "country": "KR",
        "models": [
            {"name": "Sonata", "class": "car", "generations": [
                (8, "DN8 (2020–present)", 2020, None, "common",  200000),
            ]},
            {"name": "Tucson", "class": "suv", "generations": [
                (4, "NX4 (2022–present)", 2022, None, "common",  250000),
            ]},
            {"name": "Elantra", "class": "car", "generations": [
                (7, "CN7 (2021–present)", 2021, None, "common",  200000),
            ]},
            {"name": "Ioniq 5", "class": "suv", "generations": [
                (1, "NE1 (2022–present)", 2022, None, "uncommon",  60000),
            ]},
            {"name": "Ioniq 6", "class": "car", "generations": [
                (1, "CE1 (2023–present)", 2023, None, "uncommon",  30000),
            ]},
        ],
    },
    {
        "make": "Kia", "country": "KR",
        "models": [
            {"name": "Telluride", "class": "suv", "generations": [
                (1, "ON (2020–present)", 2020, None, "uncommon", 100000),
            ]},
            {"name": "Sportage", "class": "suv", "generations": [
                (5, "NQ5 (2023–present)", 2023, None, "common", 200000),
            ]},
            {"name": "K5", "class": "car", "generations": [
                (3, "DL3 (2021–present)", 2021, None, "common", 100000),
            ]},
            {"name": "Stinger", "class": "car", "generations": [
                (1, "CK (2018–2023)", 2018, 2023, "rare",  15000),
            ]},
            {"name": "EV6", "class": "suv", "generations": [
                (1, "CV (2022–present)", 2022, None, "uncommon", 30000),
            ]},
        ],
    },
    {
        "make": "Mazda", "country": "JP",
        "models": [
            {"name": "CX-5", "class": "suv", "generations": [
                (2, "KF (2017–present)", 2017, None, "common",  300000),
            ]},
            {"name": "Mazda3", "class": "car", "generations": [
                (4, "BP (2019–present)", 2019, None, "common",  100000),
            ]},
            {"name": "MX-5 Miata", "class": "car", "generations": [
                (4, "ND (2016–present)", 2016, None, "rare",  10000),
                (3, "NC (2006–2015)",    2006, 2015, "rare",   9000),
            ]},
            {"name": "CX-50", "class": "suv", "generations": [
                (1, "1st Gen (2023–present)", 2023, None, "common",  80000),
            ]},
        ],
    },
    {
        "make": "Lexus", "country": "JP",
        "models": [
            {"name": "RX", "class": "suv", "generations": [
                (5, "AL30 (2023–present)", 2023, None, "uncommon",  90000),
                (4, "AL20 (2016–2022)",    2016, 2022, "uncommon", 100000),
            ]},
            {"name": "IS", "class": "car", "generations": [
                (3, "XE30 (2014–present)", 2014, None, "uncommon",  40000),
            ]},
            {"name": "LC 500", "class": "car", "generations": [
                (1, "Z100 (2017–present)", 2017, None, "epic",   3000),
            ]},
        ],
    },
    {
        "make": "Porsche", "country": "DE",
        "models": [
            {"name": "911", "class": "car", "generations": [
                (8, "992 (2019–present)", 2019, None, "epic",   30000),
                (7, "991 (2012–2019)",    2012, 2019, "epic",   25000),
            ]},
            {"name": "Cayenne", "class": "suv", "generations": [
                (3, "PO536 (2018–present)", 2018, None, "rare",  40000),
            ]},
            {"name": "Macan", "class": "suv", "generations": [
                (2, "J1 EV (2024–present)", 2024, None, "uncommon", 30000),
            ]},
            {"name": "Taycan", "class": "car", "generations": [
                (1, "J1 (2020–present)", 2020, None, "rare",  20000),
            ]},
        ],
    },
    {
        "make": "Cadillac", "country": "US",
        "models": [
            {"name": "Escalade", "class": "suv", "generations": [
                (5, "5th Gen (2021–present)", 2021, None, "rare",  30000),
            ]},
            {"name": "CT5-V Blackwing", "class": "car", "generations": [
                (1, "2022–present", 2022, None, "epic",   2000),
            ]},
        ],
    },
    {
        "make": "Lamborghini", "country": "IT",
        "models": [
            {"name": "Huracán", "class": "car", "generations": [
                (1, "LP 580/610 (2014–present)", 2014, None, "legendary", 2500),
            ]},
            {"name": "Urus", "class": "suv", "generations": [
                (1, "1st Gen (2018–present)", 2018, None, "epic",  4000),
            ]},
        ],
    },
    {
        "make": "Ferrari", "country": "IT",
        "models": [
            {"name": "Roma", "class": "car", "generations": [
                (1, "F169 (2020–present)", 2020, None, "legendary", 1500),
            ]},
            {"name": "SF90 Stradale", "class": "car", "generations": [
                (1, "F173 (2021–present)", 2021, None, "legendary",  800),
            ]},
        ],
    },
    {
        "make": "McLaren", "country": "GB",
        "models": [
            {"name": "720S", "class": "car", "generations": [
                (1, "P14 (2017–present)", 2017, None, "legendary",  800),
            ]},
            {"name": "Artura", "class": "car", "generations": [
                (1, "MC30 (2022–present)", 2022, None, "legendary",  600),
            ]},
        ],
    },
    # ------------------------------------------------------------------ Acura
    {
        "make": "Acura", "country": "JP",
        "models": [
            {"name": "MDX", "class": "suv", "generations": [
                (4, "4th Gen (2022–present)", 2022, None, "uncommon",  50000),
                (3, "3rd Gen (2014–2020)",    2014, 2020, "uncommon",  55000),
            ]},
            {"name": "RDX", "class": "suv", "generations": [
                (3, "3rd Gen (2019–present)", 2019, None, "uncommon",  70000),
            ]},
            {"name": "TLX", "class": "car", "generations": [
                (3, "3rd Gen (2021–present)", 2021, None, "uncommon",  25000),
            ]},
            {"name": "Integra", "class": "car", "generations": [
                (5, "5th Gen (2023–present)", 2023, None, "rare",  12000),
            ]},
            {"name": "NSX", "class": "car", "generations": [
                (2, "NC1 (2016–2022)", 2016, 2022, "legendary",  800),
            ]},
        ],
    },
    # ---------------------------------------------------------------- Infiniti
    {
        "make": "Infiniti", "country": "JP",
        "models": [
            {"name": "Q50", "class": "car", "generations": [
                (1, "V37 (2014–present)", 2014, None, "uncommon",  40000),
            ]},
            {"name": "Q60", "class": "car", "generations": [
                (2, "V37 Coupe (2017–present)", 2017, None, "rare",  10000),
            ]},
            {"name": "QX60", "class": "suv", "generations": [
                (2, "L51 (2022–present)", 2022, None, "uncommon",  45000),
                (1, "L50 (2013–2021)",    2013, 2021, "uncommon",  50000),
            ]},
            {"name": "QX80", "class": "suv", "generations": [
                (2, "Z62 (2011–present)", 2011, None, "uncommon",  20000),
            ]},
        ],
    },
    # ----------------------------------------------------------------- Genesis
    {
        "make": "Genesis", "country": "KR",
        "models": [
            {"name": "G80", "class": "car", "generations": [
                (3, "RG3 (2021–present)", 2021, None, "uncommon",  15000),
                (2, "DH (2017–2020)",     2017, 2020, "uncommon",  12000),
            ]},
            {"name": "G70", "class": "car", "generations": [
                (1, "IK (2019–present)", 2019, None, "rare",  8000),
            ]},
            {"name": "GV80", "class": "suv", "generations": [
                (1, "JX1 (2021–present)", 2021, None, "uncommon",  15000),
            ]},
            {"name": "GV70", "class": "suv", "generations": [
                (1, "JK1 (2022–present)", 2022, None, "uncommon",  20000),
            ]},
            {"name": "G90", "class": "car", "generations": [
                (2, "RS4 (2023–present)", 2023, None, "rare",  3000),
            ]},
        ],
    },
    # ------------------------------------------------------------------- Volvo
    {
        "make": "Volvo", "country": "SE",
        "models": [
            {"name": "XC90", "class": "suv", "generations": [
                (2, "L Series (2016–present)", 2016, None, "uncommon",  80000),
            ]},
            {"name": "XC60", "class": "suv", "generations": [
                (2, "U Series (2018–present)", 2018, None, "uncommon",  100000),
            ]},
            {"name": "XC40", "class": "suv", "generations": [
                (1, "536 (2018–present)", 2018, None, "uncommon",  60000),
            ]},
            {"name": "S60", "class": "car", "generations": [
                (3, "Z Series (2019–present)", 2019, None, "uncommon",  20000),
            ]},
            {"name": "EX90", "class": "suv", "generations": [
                (1, "596 (2024–present)", 2024, None, "rare",  15000),
            ]},
        ],
    },
    # ----------------------------------------------------------------- Lincoln
    {
        "make": "Lincoln", "country": "US",
        "models": [
            {"name": "Navigator", "class": "suv", "generations": [
                (4, "4th Gen (2018–present)", 2018, None, "rare",  15000),
            ]},
            {"name": "Aviator", "class": "suv", "generations": [
                (2, "2nd Gen (2020–present)", 2020, None, "uncommon",  20000),
            ]},
            {"name": "Nautilus", "class": "suv", "generations": [
                (2, "2nd Gen (2024–present)", 2024, None, "uncommon",  25000),
            ]},
        ],
    },
    # -------------------------------------------------------------- Land Rover
    {
        "make": "Land Rover", "country": "GB",
        "models": [
            {"name": "Defender", "class": "suv", "generations": [
                (2, "L663 (2020–present)", 2020, None, "rare",  50000),
            ]},
            {"name": "Range Rover", "class": "suv", "generations": [
                (5, "L460 (2022–present)", 2022, None, "epic",  20000),
                (4, "L405 (2013–2021)",    2013, 2021, "rare",  25000),
            ]},
            {"name": "Range Rover Sport", "class": "suv", "generations": [
                (3, "L461 (2022–present)", 2022, None, "rare",  30000),
                (2, "L494 (2014–2022)",    2014, 2022, "uncommon", 35000),
            ]},
            {"name": "Discovery", "class": "suv", "generations": [
                (5, "L462 (2017–present)", 2017, None, "uncommon",  20000),
            ]},
        ],
    },
    # --------------------------------------------------------------------- Mini
    {
        "make": "Mini", "country": "GB",
        "models": [
            {"name": "Cooper", "class": "car", "generations": [
                (3, "F56 (2014–present)", 2014, None, "uncommon",  40000),
                (2, "R56 (2006–2013)",    2006, 2013, "uncommon",  50000),
            ]},
            {"name": "Countryman", "class": "suv", "generations": [
                (3, "U25 (2024–present)", 2024, None, "uncommon",  30000),
                (2, "F60 (2017–2024)",    2017, 2024, "uncommon",  45000),
            ]},
            {"name": "Cooper S", "class": "car", "generations": [
                (3, "F56 S (2014–present)", 2014, None, "rare",  15000),
            ]},
        ],
    },
    # --------------------------------------------------------------- Alfa Romeo
    {
        "make": "Alfa Romeo", "country": "IT",
        "models": [
            {"name": "Giulia", "class": "car", "generations": [
                (1, "952 (2016–present)", 2016, None, "rare",  10000),
            ]},
            {"name": "Stelvio", "class": "suv", "generations": [
                (1, "949 (2017–present)", 2017, None, "uncommon",  20000),
            ]},
            {"name": "Giulia Quadrifoglio", "class": "car", "generations": [
                (1, "952 QV (2016–present)", 2016, None, "epic",  2000),
            ]},
        ],
    },
    # ---------------------------------------------------------------- Maserati
    {
        "make": "Maserati", "country": "IT",
        "models": [
            {"name": "Ghibli", "class": "car", "generations": [
                (3, "M157 (2013–2023)", 2013, 2023, "epic",  5000),
            ]},
            {"name": "Levante", "class": "suv", "generations": [
                (1, "M161 (2016–present)", 2016, None, "epic",  6000),
            ]},
            {"name": "GranTurismo", "class": "car", "generations": [
                (2, "M290 (2023–present)", 2023, None, "epic",  2000),
            ]},
            {"name": "MC20", "class": "car", "generations": [
                (1, "F154 (2021–present)", 2021, None, "legendary",  800),
            ]},
        ],
    },
    # ----------------------------------------------------------------- Bentley
    {
        "make": "Bentley", "country": "GB",
        "models": [
            {"name": "Continental GT", "class": "car", "generations": [
                (3, "3rd Gen (2018–present)", 2018, None, "legendary",  3000),
                (2, "2nd Gen (2011–2018)",    2011, 2018, "legendary",  2500),
            ]},
            {"name": "Bentayga", "class": "suv", "generations": [
                (2, "2nd Gen (2021–present)", 2021, None, "legendary",  4000),
            ]},
            {"name": "Flying Spur", "class": "car", "generations": [
                (3, "3rd Gen (2020–present)", 2020, None, "legendary",  2000),
            ]},
        ],
    },
    # -------------------------------------------------------------- Rolls-Royce
    {
        "make": "Rolls-Royce", "country": "GB",
        "models": [
            {"name": "Ghost", "class": "car", "generations": [
                (2, "2nd Gen (2021–present)", 2021, None, "legendary",  2000),
            ]},
            {"name": "Cullinan", "class": "suv", "generations": [
                (1, "RR31 (2018–present)", 2018, None, "legendary",  2500),
            ]},
            {"name": "Spectre", "class": "car", "generations": [
                (1, "RR4 (2024–present)", 2024, None, "legendary",  1000),
            ]},
            {"name": "Phantom", "class": "car", "generations": [
                (8, "RR12 (2018–present)", 2018, None, "legendary",  500),
            ]},
        ],
    },
    # --------------------------------------------------------------- Aston Martin
    {
        "make": "Aston Martin", "country": "GB",
        "models": [
            {"name": "Vantage", "class": "car", "generations": [
                (3, "AM28 (2018–present)", 2018, None, "legendary",  2000),
            ]},
            {"name": "DB11", "class": "car", "generations": [
                (1, "AM29 (2016–present)", 2016, None, "legendary",  1500),
            ]},
            {"name": "DBX", "class": "suv", "generations": [
                (1, "AM37 (2020–present)", 2020, None, "legendary",  2000),
            ]},
            {"name": "DBS", "class": "car", "generations": [
                (3, "AM28D (2019–present)", 2019, None, "legendary",  600),
            ]},
        ],
    },
    # ----------------------------------------------------------------- Bugatti
    {
        "make": "Bugatti", "country": "FR",
        "models": [
            {"name": "Chiron", "class": "car", "generations": [
                (1, "Type 100 (2016–2024)", 2016, 2024, "legendary",  500),
            ]},
            {"name": "Tourbillon", "class": "car", "generations": [
                (1, "Type 101 (2026–present)", 2026, None, "legendary",  250),
            ]},
        ],
    },
    # ------------------------------------------------------------------- Rivian
    {
        "make": "Rivian", "country": "US",
        "models": [
            {"name": "R1T", "class": "truck", "generations": [
                (1, "Gen 1 (2022–present)", 2022, None, "rare",  15000),
            ]},
            {"name": "R1S", "class": "suv", "generations": [
                (1, "Gen 1 (2022–present)", 2022, None, "rare",  12000),
            ]},
        ],
    },
    # -------------------------------------------------------------------- Lucid
    {
        "make": "Lucid", "country": "US",
        "models": [
            {"name": "Air", "class": "car", "generations": [
                (1, "Gen 1 (2021–present)", 2021, None, "epic",  5000),
            ]},
            {"name": "Gravity", "class": "suv", "generations": [
                (1, "Gen 1 (2024–present)", 2024, None, "epic",  3000),
            ]},
        ],
    },
    # ------------------------------------------------------------------ Jaguar
    {
        "make": "Jaguar", "country": "GB",
        "models": [
            {"name": "F-Type", "class": "car", "generations": [
                (1, "X152 (2013–present)", 2013, None, "epic",  5000),
            ]},
            {"name": "F-Pace", "class": "suv", "generations": [
                (1, "X761 (2016–present)", 2016, None, "rare",  20000),
            ]},
            {"name": "I-Pace", "class": "suv", "generations": [
                (1, "X590 (2018–present)", 2018, None, "rare",  8000),
            ]},
        ],
    },
    # ---------------------------------------------------------------- Polestar
    {
        "make": "Polestar", "country": "SE",
        "models": [
            {"name": "Polestar 2", "class": "car", "generations": [
                (1, "Gen 1 (2020–present)", 2020, None, "rare",  20000),
            ]},
            {"name": "Polestar 3", "class": "suv", "generations": [
                (1, "Gen 1 (2024–present)", 2024, None, "rare",  10000),
            ]},
        ],
    },
    # ---------------------------------------------------------------- Chrysler
    {
        "make": "Chrysler", "country": "US",
        "models": [
            {"name": "Pacifica", "class": "van", "generations": [
                (2, "2nd Gen (2017–present)", 2017, None, "common",  100000),
            ]},
            {"name": "300", "class": "car", "generations": [
                (2, "LD (2011–2023)", 2011, 2023, "uncommon",  50000),
            ]},
        ],
    },
    # -------------------------------------------------------------------- Buick
    {
        "make": "Buick", "country": "US",
        "models": [
            {"name": "Enclave", "class": "suv", "generations": [
                (2, "C1 (2018–present)", 2018, None, "uncommon",  60000),
            ]},
            {"name": "Encore GX", "class": "suv", "generations": [
                (1, "BT4 (2020–present)", 2020, None, "common",  80000),
            ]},
            {"name": "Envision", "class": "suv", "generations": [
                (2, "LS (2021–present)", 2021, None, "common",  40000),
            ]},
        ],
    },
    # --------------------------------------------------------------- Toyota (expanded)
    {
        "make": "Toyota", "country": "JP",
        "models": [
            {"name": "Sienna", "class": "van", "generations": [
                (4, "XL40 (2021–present)", 2021, None, "common",  100000),
            ]},
            {"name": "Venza", "class": "suv", "generations": [
                (2, "AV20 (2021–present)", 2021, None, "uncommon",  40000),
            ]},
            {"name": "Crown", "class": "car", "generations": [
                (16, "S235 (2023–present)", 2023, None, "uncommon",  30000),
            ]},
            {"name": "Land Cruiser", "class": "suv", "generations": [
                (11, "J300 (2022–present)", 2022, None, "rare",  10000),
                (10, "J200 (2008–2021)",    2008, 2021, "uncommon",  15000),
            ]},
            {"name": "bZ4X", "class": "suv", "generations": [
                (1, "XEA10 (2022–present)", 2022, None, "uncommon",  30000),
            ]},
            {"name": "GR Corolla", "class": "car", "generations": [
                (1, "E210 GR (2023–present)", 2023, None, "epic",  6000),
            ]},
        ],
    },
    # ---------------------------------------------------------------- Honda (expanded)
    {
        "make": "Honda", "country": "JP",
        "models": [
            {"name": "Odyssey", "class": "van", "generations": [
                (5, "5th Gen (2018–present)", 2018, None, "common",  90000),
            ]},
            {"name": "HR-V", "class": "suv", "generations": [
                (3, "3rd Gen (2023–present)", 2023, None, "common",  100000),
            ]},
            {"name": "Passport", "class": "suv", "generations": [
                (2, "2nd Gen (2019–present)", 2019, None, "common",  60000),
            ]},
            {"name": "Prologue", "class": "suv", "generations": [
                (1, "1st Gen (2024–present)", 2024, None, "uncommon",  20000),
            ]},
        ],
    },
    # ----------------------------------------------------------------- Ford (expanded)
    {
        "make": "Ford", "country": "US",
        "models": [
            {"name": "Ranger", "class": "truck", "generations": [
                (4, "P703 (2019–present)", 2019, None, "common",  90000),
            ]},
            {"name": "Expedition", "class": "suv", "generations": [
                (4, "U553 (2018–present)", 2018, None, "common",  80000),
            ]},
            {"name": "F-150 Lightning", "class": "truck", "generations": [
                (1, "Gen 1 (2022–present)", 2022, None, "rare",  25000),
            ]},
            {"name": "Mustang Mach-E", "class": "suv", "generations": [
                (1, "Gen 1 (2021–present)", 2021, None, "uncommon",  40000),
            ]},
        ],
    },
    # -------------------------------------------------------- Chevrolet (expanded)
    {
        "make": "Chevrolet", "country": "US",
        "models": [
            {"name": "Camaro", "class": "car", "generations": [
                (6, "6th Gen (2016–2024)", 2016, 2024, "uncommon",  50000),
            ]},
            {"name": "Suburban", "class": "suv", "generations": [
                (12, "12th Gen (2021–present)", 2021, None, "common",  50000),
            ]},
            {"name": "Blazer EV", "class": "suv", "generations": [
                (1, "EV Gen 1 (2024–present)", 2024, None, "uncommon",  20000),
            ]},
            {"name": "Trax", "class": "suv", "generations": [
                (2, "2nd Gen (2024–present)", 2024, None, "common",  80000),
            ]},
            {"name": "Silverado EV", "class": "truck", "generations": [
                (1, "Gen 1 (2024–present)", 2024, None, "rare",  20000),
            ]},
        ],
    },
    # ----------------------------------------------------------------- BMW (expanded)
    {
        "make": "BMW", "country": "DE",
        "models": [
            {"name": "2 Series", "class": "car", "generations": [
                (2, "G42 (2022–present)", 2022, None, "uncommon",  30000),
                (1, "F22 (2014–2021)",    2014, 2021, "uncommon",  25000),
            ]},
            {"name": "4 Series", "class": "car", "generations": [
                (2, "G22 (2021–present)", 2021, None, "uncommon",  40000),
            ]},
            {"name": "7 Series", "class": "car", "generations": [
                (7, "G70 (2023–present)", 2023, None, "rare",  15000),
                (6, "G11 (2016–2022)",    2016, 2022, "rare",  18000),
            ]},
            {"name": "X1", "class": "suv", "generations": [
                (3, "U11 (2023–present)", 2023, None, "uncommon",  80000),
            ]},
            {"name": "X7", "class": "suv", "generations": [
                (1, "G07 (2019–present)", 2019, None, "rare",  20000),
            ]},
            {"name": "i4", "class": "car", "generations": [
                (1, "G26 (2022–present)", 2022, None, "rare",  20000),
            ]},
            {"name": "iX", "class": "suv", "generations": [
                (1, "I20 (2022–present)", 2022, None, "rare",  15000),
            ]},
            {"name": "M2", "class": "car", "generations": [
                (2, "G87 (2023–present)", 2023, None, "epic",  8000),
                (1, "F87 (2016–2021)",    2016, 2021, "epic",  10000),
            ]},
        ],
    },
    # ------------------------------------------------------- Mercedes (expanded)
    {
        "make": "Mercedes-Benz", "country": "DE",
        "models": [
            {"name": "GLC", "class": "suv", "generations": [
                (2, "X254 (2023–present)", 2023, None, "uncommon",  80000),
                (1, "X253 (2016–2022)",    2016, 2022, "uncommon",  100000),
            ]},
            {"name": "GLS", "class": "suv", "generations": [
                (2, "X167 (2020–present)", 2020, None, "uncommon",  30000),
            ]},
            {"name": "EQS", "class": "car", "generations": [
                (1, "V297 (2022–present)", 2022, None, "rare",  10000),
            ]},
            {"name": "AMG GT 63", "class": "car", "generations": [
                (2, "X290 (2024–present)", 2024, None, "epic",  2000),
            ]},
            {"name": "Sprinter", "class": "van", "generations": [
                (3, "W907 (2018–present)", 2018, None, "common",  50000),
            ]},
        ],
    },
    # ----------------------------------------------------------------- Audi (expanded)
    {
        "make": "Audi", "country": "DE",
        "models": [
            {"name": "Q7", "class": "suv", "generations": [
                (2, "4M (2016–present)", 2016, None, "uncommon",  40000),
            ]},
            {"name": "Q8", "class": "suv", "generations": [
                (1, "F1 (2019–present)", 2019, None, "rare",  20000),
            ]},
            {"name": "e-tron GT", "class": "car", "generations": [
                (1, "F8 (2021–present)", 2021, None, "epic",  5000),
            ]},
            {"name": "RS6 Avant", "class": "car", "generations": [
                (4, "C8 (2020–present)", 2020, None, "epic",  3000),
            ]},
            {"name": "A3", "class": "car", "generations": [
                (4, "8Y (2021–present)", 2021, None, "common",  60000),
            ]},
            {"name": "Q4 e-tron", "class": "suv", "generations": [
                (1, "F4B (2021–present)", 2021, None, "uncommon",  30000),
            ]},
        ],
    },
    # --------------------------------------------------------------- VW (expanded)
    {
        "make": "Volkswagen", "country": "DE",
        "models": [
            {"name": "Atlas", "class": "suv", "generations": [
                (1, "CA1 (2018–present)", 2018, None, "common",  80000),
            ]},
            {"name": "ID.4", "class": "suv", "generations": [
                (1, "E21 (2021–present)", 2021, None, "uncommon",  50000),
            ]},
            {"name": "Taos", "class": "suv", "generations": [
                (1, "1st Gen (2022–present)", 2022, None, "common",  50000),
            ]},
        ],
    },
    # ---------------------------------------------------------------- Nissan (expanded)
    {
        "make": "Nissan", "country": "JP",
        "models": [
            {"name": "Pathfinder", "class": "suv", "generations": [
                (5, "R53 (2022–present)", 2022, None, "common",  80000),
            ]},
            {"name": "Murano", "class": "suv", "generations": [
                (3, "Z52 (2015–present)", 2015, None, "uncommon",  60000),
            ]},
            {"name": "Kicks", "class": "suv", "generations": [
                (2, "P15F (2023–present)", 2023, None, "common",  80000),
            ]},
            {"name": "Sentra", "class": "car", "generations": [
                (8, "B18 (2020–present)", 2020, None, "common",  100000),
            ]},
            {"name": "Ariya", "class": "suv", "generations": [
                (1, "FE0 (2023–present)", 2023, None, "uncommon",  20000),
            ]},
        ],
    },
    # ------------------------------------------------------------ Subaru (expanded)
    {
        "make": "Subaru", "country": "JP",
        "models": [
            {"name": "Ascent", "class": "suv", "generations": [
                (1, "1st Gen (2019–present)", 2019, None, "common",  60000),
            ]},
            {"name": "Crosstrek", "class": "suv", "generations": [
                (4, "4th Gen (2024–present)", 2024, None, "common",  80000),
                (3, "3rd Gen (2018–2023)",    2018, 2023, "common",  100000),
            ]},
            {"name": "Legacy", "class": "car", "generations": [
                (7, "BN/BS (2020–present)", 2020, None, "common",  40000),
            ]},
        ],
    },
    # ------------------------------------------------------------ Hyundai (expanded)
    {
        "make": "Hyundai", "country": "KR",
        "models": [
            {"name": "Palisade", "class": "suv", "generations": [
                (1, "LX2 (2020–present)", 2020, None, "common",  80000),
            ]},
            {"name": "Santa Fe", "class": "suv", "generations": [
                (5, "MX5 (2024–present)", 2024, None, "common",  100000),
                (4, "TM (2019–2023)",     2019, 2023, "common",  120000),
            ]},
            {"name": "Kona", "class": "suv", "generations": [
                (2, "SX2 (2024–present)", 2024, None, "common",  80000),
            ]},
            {"name": "NEXO", "class": "suv", "generations": [
                (1, "FE (2019–present)", 2019, None, "rare",  2000),
            ]},
        ],
    },
    # --------------------------------------------------------------- Kia (expanded)
    {
        "make": "Kia", "country": "KR",
        "models": [
            {"name": "Sorento", "class": "suv", "generations": [
                (4, "MQ4 (2021–present)", 2021, None, "common",  100000),
            ]},
            {"name": "Carnival", "class": "van", "generations": [
                (4, "KA4 (2022–present)", 2022, None, "common",  50000),
            ]},
            {"name": "Seltos", "class": "suv", "generations": [
                (1, "SP2 (2021–present)", 2021, None, "common",  80000),
            ]},
            {"name": "EV9", "class": "suv", "generations": [
                (1, "MV (2024–present)", 2024, None, "uncommon",  20000),
            ]},
        ],
    },
    # -------------------------------------------------------------- Mazda (expanded)
    {
        "make": "Mazda", "country": "JP",
        "models": [
            {"name": "CX-90", "class": "suv", "generations": [
                (1, "1st Gen (2024–present)", 2024, None, "uncommon",  30000),
            ]},
            {"name": "CX-30", "class": "suv", "generations": [
                (1, "DM (2020–present)", 2020, None, "common",  60000),
            ]},
            {"name": "MX-30", "class": "suv", "generations": [
                (1, "DR (2021–present)", 2021, None, "rare",  5000),
            ]},
        ],
    },
    # ------------------------------------------------------------- Lexus (expanded)
    {
        "make": "Lexus", "country": "JP",
        "models": [
            {"name": "NX", "class": "suv", "generations": [
                (2, "AZ20 (2022–present)", 2022, None, "uncommon",  70000),
                (1, "AZ10 (2015–2021)",    2015, 2021, "uncommon",  80000),
            ]},
            {"name": "GX", "class": "suv", "generations": [
                (3, "J250 (2024–present)", 2024, None, "uncommon",  20000),
                (2, "J150 (2010–2024)",    2010, 2024, "uncommon",  25000),
            ]},
            {"name": "LX", "class": "suv", "generations": [
                (4, "J300 (2022–present)", 2022, None, "rare",  5000),
            ]},
            {"name": "ES", "class": "car", "generations": [
                (7, "XV70 (2019–present)", 2019, None, "uncommon",  50000),
            ]},
            {"name": "UX", "class": "suv", "generations": [
                (1, "ZA10 (2019–present)", 2019, None, "uncommon",  20000),
            ]},
            {"name": "LFA", "class": "car", "generations": [
                (1, "XF10 (2010–2012)", 2010, 2012, "legendary",  500),
            ]},
        ],
    },
    # ---------------------------------------------------------- Porsche (expanded)
    {
        "make": "Porsche", "country": "DE",
        "models": [
            {"name": "718 Cayman", "class": "car", "generations": [
                (1, "982 (2016–present)", 2016, None, "epic",  10000),
            ]},
            {"name": "718 Boxster", "class": "car", "generations": [
                (1, "982 Boxster (2016–present)", 2016, None, "epic",  8000),
            ]},
            {"name": "Panamera", "class": "car", "generations": [
                (2, "G2 (2017–present)", 2017, None, "rare",  15000),
            ]},
            {"name": "911 GT3", "class": "car", "generations": [
                (8, "992 GT3 (2022–present)", 2022, None, "legendary",  4000),
            ]},
        ],
    },
    # --------------------------------------------------------- Cadillac (expanded)
    {
        "make": "Cadillac", "country": "US",
        "models": [
            {"name": "CT4", "class": "car", "generations": [
                (1, "1st Gen (2020–present)", 2020, None, "uncommon",  15000),
            ]},
            {"name": "XT5", "class": "suv", "generations": [
                (1, "1st Gen (2017–present)", 2017, None, "uncommon",  50000),
            ]},
            {"name": "XT6", "class": "suv", "generations": [
                (1, "1st Gen (2020–present)", 2020, None, "uncommon",  30000),
            ]},
            {"name": "Lyriq", "class": "suv", "generations": [
                (1, "1st Gen (2023–present)", 2023, None, "rare",  15000),
            ]},
        ],
    },
    # -------------------------------------------------------- Koenigsegg / Pagani
    {
        "make": "Koenigsegg", "country": "SE",
        "models": [
            {"name": "Agera RS", "class": "car", "generations": [
                (1, "2015–2018", 2015, 2018, "legendary",  25),
            ]},
            {"name": "Jesko", "class": "car", "generations": [
                (1, "2021–present", 2021, None, "legendary",  125),
            ]},
        ],
    },
    {
        "make": "Pagani", "country": "IT",
        "models": [
            {"name": "Huayra", "class": "car", "generations": [
                (1, "C9 (2013–present)", 2013, None, "legendary",  100),
            ]},
            {"name": "Utopia", "class": "car", "generations": [
                (1, "C10 (2023–present)", 2023, None, "legendary",  99),
            ]},
        ],
    },
]


def seed():
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    total_makes = total_models = total_gens = 0

    for entry in SEED:
        # Upsert make
        make_res = db.table("makes").upsert(
            {"name": entry["make"], "country": entry["country"]},
            on_conflict="name",
        ).execute()
        make_id = make_res.data[0]["id"]
        total_makes += 1
        print(f"  make: {entry['make']} ({make_id[:8]}…)")

        for model_entry in entry["models"]:
            # Upsert model
            model_res = db.table("models").upsert(
                {"make_id": make_id, "name": model_entry["name"], "class": model_entry["class"]},
                on_conflict="make_id,name",
            ).execute()
            model_id = model_res.data[0]["id"]
            total_models += 1

            for (gen_num, name, yr_start, yr_end, rarity, volume) in model_entry["generations"]:
                db.table("generations").upsert(
                    {
                        "model_id":                model_id,
                        "generation_number":       gen_num,
                        "common_name":             name,
                        "year_start":              yr_start,
                        "year_end":                yr_end,
                        "rarity_tier":             rarity,
                        "production_volume_annual": volume,
                        "production_volume_source": "estimate",
                    },
                    on_conflict="model_id,generation_number",
                ).execute()
                total_gens += 1
                print(f"    gen: {name} [{rarity}]")

    print(f"\nSeeded {total_makes} makes, {total_models} models, {total_gens} generations.")


if __name__ == "__main__":
    seed()
