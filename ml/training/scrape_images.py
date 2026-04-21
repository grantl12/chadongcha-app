"""
DuckDuckGo image scraper — builds labeled training dataset.

Searches DuckDuckGo Images for each generation class using multiple
search queries per class, downloads and deduplicates results.

Usage:
  python training/scrape_images.py                        # all classes
  python training/scrape_images.py --cls "Toyota GR86 ZN8"  # one class
  python training/scrape_images.py --per-class 100        # fewer images

Requirements:
  pip install ddgs requests Pillow
"""

import argparse
import hashlib
import json
import logging
import random
import sys
import time
from io import BytesIO
from pathlib import Path

try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        print("Missing dependency: pip install ddgs requests Pillow")
        sys.exit(1)

try:
    import requests
    from PIL import Image
except ImportError:
    print("Missing dependency: pip install requests Pillow")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_DEFAULT_DATA_DIR = Path(__file__).parent.parent / "data" / "images"
DATA_DIR          = _DEFAULT_DATA_DIR   # overridden by --data-dir arg
STATS_FILE        = DATA_DIR.parent / "scrape_stats.json"
IMAGES_PER_CLASS = 170
MIN_IMAGE_SIZE   = 224
MAX_IMAGE_SIZE   = 1024

# Multiple search queries per class — more variety = better model
CLASS_QUERIES = {
    "Toyota GR86 ZN8": [
        "Toyota GR86 ZN8 2022 exterior",
        "GR86 ZN8 street photo",
        "Toyota GR86 2022 2023 side view",
        "GR86 coupe real photo",
    ],
    "Toyota Supra A90": [
        "Toyota GR Supra A90 2020 exterior",
        "Toyota Supra mk5 street",
        "A90 Supra real photo side",
        "GR Supra 2021 2022 photo",
    ],
    "Toyota Camry XV70": [
        "Toyota Camry XV70 2018 exterior",
        "Toyota Camry 2018 2019 2020 side view",
        "Camry eighth generation street photo",
        "Toyota Camry 2021 2022 real photo",
    ],
    "Honda Civic FE": [
        "Honda Civic FE 2022 exterior",
        "Honda Civic 11th generation 2022 photo",
        "Civic FE sedan street photo",
        "Honda Civic 2022 2023 side view",
    ],
    "Honda Accord CN2": [
        "Honda Accord CN2 2018 exterior",
        "Honda Accord 10th generation street photo",
        "Accord 2018 2019 2020 side view",
        "Honda Accord 2021 real photo",
    ],
    "Honda CR-V RS": [
        "Honda CRV RS 2023 exterior",
        "Honda CR-V 2023 2024 side view",
        "CR-V sixth generation street photo",
        "Honda CRV 2023 real photo",
    ],
    "Mazda3 BP": [
        "Mazda3 BP 2019 exterior",
        "Mazda 3 fourth generation 2019 photo",
        "Mazda3 2019 2020 2021 street",
        "Mazda 3 sedan 2019 side view",
    ],
    "Mazda MX-5 ND": [
        "Mazda MX-5 ND Miata exterior",
        "Mazda Miata ND 2016 2017 street photo",
        "MX-5 fourth generation roadster photo",
        "Miata ND 2019 2020 real photo",
    ],
    "Subaru WRX VB": [
        "Subaru WRX VB 2022 exterior",
        "Subaru WRX 2022 2023 fifth gen street",
        "WRX VB sedan photo side view",
        "Subaru WRX 2022 real photo",
    ],
    "Subaru BRZ ZD8": [
        "Subaru BRZ ZD8 2022 exterior",
        "BRZ second generation 2022 street photo",
        "Subaru BRZ 2022 2023 side view",
        "ZD8 BRZ coupe real photo",
    ],
    "Mitsubishi Outlander CW": [
        "Mitsubishi Outlander 2022 CW exterior",
        "Outlander third generation 2022 street",
        "Mitsubishi Outlander 2022 2023 side view",
        "Outlander CW SUV real photo",
    ],
    "Nissan Z RZ34": [
        "Nissan Z RZ34 2023 exterior",
        "Nissan 400Z RZ34 street photo",
        "Nissan Z 2023 2024 side view coupe",
        "new Nissan Z real photo",
    ],
    "Ford Mustang S650": [
        "Ford Mustang S650 2024 exterior",
        "Mustang seventh generation 2024 street",
        "Ford Mustang 2024 side view photo",
        "S650 Mustang real photo coupe",
    ],
    "Ford F-150 P702": [
        "Ford F-150 2021 P702 exterior",
        "F-150 fourteenth generation 2021 street",
        "Ford F150 2021 2022 2023 side view",
        "F-150 2022 pickup truck real photo",
    ],
    "Chevrolet Corvette C8": [
        "Chevrolet Corvette C8 2020 exterior",
        "C8 Corvette Stingray street photo",
        "Corvette C8 2020 2021 side view",
        "mid engine Corvette real photo",
    ],
    "Chevrolet Silverado GMTK2": [
        "Chevrolet Silverado 2019 fourth gen exterior",
        "Silverado 1500 2019 2020 2021 street",
        "GMTK2 Silverado photo side view",
        "Chevy Silverado 2021 2022 real photo",
    ],
    "Dodge Challenger LC": [
        "Dodge Challenger LC SRT exterior",
        "Dodge Challenger Hellcat street photo",
        "Challenger SRT 392 side view real photo",
        "Dodge Challenger 2015 2016 2017 2018",
    ],
    "Jeep Wrangler JL": [
        "Jeep Wrangler JL 2018 exterior",
        "Wrangler JL 2018 2019 2020 street",
        "Jeep Wrangler fourth generation side view",
        "JL Wrangler real photo offroad",
    ],
    "Jeep Grand Cherokee WL": [
        "Jeep Grand Cherokee WL 2021 exterior",
        "Grand Cherokee fifth generation 2021 street",
        "WL Grand Cherokee 2022 2023 side view",
        "Jeep Grand Cherokee 2022 real photo",
    ],
    "BMW 3-Series G20": [
        "BMW 3 Series G20 2019 exterior",
        "BMW G20 330i 340i street photo",
        "3-Series G20 2019 2020 side view",
        "BMW M340i G20 real photo",
    ],
    "BMW M3 G80": [
        "BMW M3 G80 2021 exterior",
        "G80 M3 Competition street photo",
        "BMW M3 2021 2022 side view real photo",
        "G80 M3 sedan photo",
    ],
    "BMW M4 G82": [
        "BMW M4 G82 2021 exterior",
        "G82 M4 Competition coupe street photo",
        "BMW M4 2021 2022 side view real photo",
        "G82 M4 coupe photo",
    ],
    "Mercedes C-Class W206": [
        "Mercedes C-Class W206 2022 exterior",
        "W206 C300 street photo",
        "Mercedes C-Class 2022 2023 side view",
        "C-Class W206 sedan real photo",
    ],
    "Mercedes AMG-GT X290": [
        "Mercedes AMG GT X290 coupe exterior",
        "AMG GT 4-door coupe street photo",
        "Mercedes AMG GT 2019 2020 side view",
        "X290 AMG GT real photo",
    ],
    "Audi A4 B9": [
        "Audi A4 B9 2017 exterior",
        "A4 B9 2017 2018 2019 street photo",
        "Audi A4 fifth generation side view",
        "B9 A4 sedan real photo",
    ],
    "Volkswagen Golf MK8": [
        "Volkswagen Golf MK8 2021 exterior",
        "VW Golf eighth generation 2021 street",
        "Golf MK8 2021 2022 side view photo",
        "Golf 8 GTI hatchback real photo",
    ],
    "Porsche 911 992": [
        "Porsche 911 992 2020 exterior",
        "992 Carrera street photo",
        "Porsche 911 2020 2021 side view real photo",
        "992 911 coupe photo",
    ],
    "Ferrari SF90 F173": [
        "Ferrari SF90 Stradale exterior",
        "SF90 Ferrari street photo",
        "Ferrari SF90 2020 2021 side view",
        "SF90 Stradale real photo",
    ],
    "Lamborghini Huracan LB724": [
        "Lamborghini Huracan exterior street photo",
        "Huracan LP610 LP580 side view",
        "Lamborghini Huracan 2015 2016 2017 real photo",
        "Huracan coupe photo",
    ],
    "Bugatti Chiron VGT": [
        "Bugatti Chiron exterior street photo",
        "Chiron hypercar side view real photo",
        "Bugatti Chiron 2017 2018 photo",
        "Chiron supercar real photo",
    ],
    # ── SUVs / Off-Road ────────────────────────────────────────────────────
    "Ford Bronco U725": [
        "Ford Bronco 2021 exterior side view",
        "Ford Bronco 2022 2023 two-door four-door street photo",
        "Bronco U725 outdoor trail photo",
        "Ford Bronco Badlands Wildtrak real photo",
    ],
    "Toyota 4Runner N280": [
        "Toyota 4Runner 2014 N280 exterior side view",
        "4Runner TRD Pro 2020 2021 street photo",
        "Toyota 4Runner fifth generation outdoor photo",
        "4Runner N280 SUV real photo side",
    ],
    "Toyota Land_Cruiser J300": [
        "Toyota Land Cruiser 300 2022 exterior side view",
        "Land Cruiser J300 2022 2023 street photo",
        "LC300 Toyota outdoor photo real",
        "Toyota Land Cruiser 2022 white side view",
    ],
    "Mercedes G-Class W464": [
        "Mercedes G-Class W464 2019 exterior side view",
        "G-Wagon AMG G63 W464 street photo",
        "Mercedes G 63 AMG 2020 2021 real photo",
        "G-Class 2021 2022 outdoor white black photo",
    ],
    # ── Trucks ─────────────────────────────────────────────────────────────
    "Jeep Gladiator JT": [
        "Jeep Gladiator JT 2020 exterior side view",
        "Gladiator Rubicon pickup truck street photo",
        "Jeep Gladiator 2021 2022 real photo outdoor",
        "Gladiator JT midsize truck side view",
    ],
    "GMC Sierra T1": [
        "GMC Sierra 1500 2019 T1 exterior side view",
        "Sierra AT4 Denali 2020 2021 street photo",
        "GMC Sierra 2021 2022 pickup truck real photo",
        "Sierra T1 2022 outdoor side view photo",
    ],
    # ── Sports / Muscle ────────────────────────────────────────────────────
    "Nissan GT-R R35": [
        "Nissan GT-R R35 exterior side view",
        "GTR R35 Godzilla street photo real",
        "Nissan GT-R 2017 2018 2019 photo outdoor",
        "GT-R Nismo R35 real photo",
    ],
    "Nissan 370Z Z34": [
        "Nissan 370Z Z34 exterior side view",
        "370Z coupe street photo real 2015 2016",
        "Nissan 370Z Nismo 2018 2019 photo",
        "370Z Z34 coupe real photo",
    ],
    "Dodge Charger LD": [
        "Dodge Charger 2015 LD exterior side view",
        "Charger Hellcat SRT Widebody street photo",
        "Dodge Charger 2018 2019 2020 real photo",
        "Charger SRT 392 Scat Pack outdoor photo",
    ],
    "Acura NSX NC1": [
        "Acura NSX NC1 2017 exterior side view",
        "NSX second generation 2017 2018 street photo",
        "Acura NSX 2019 2020 real photo outdoor",
        "NSX NC1 supercar side view real",
    ],
    "Audi RS5 FY": [
        "Audi RS5 FY 2018 exterior side view",
        "RS5 B9 coupe Sportback street photo 2018 2019",
        "Audi RS5 2020 2021 real photo outdoor",
        "RS5 competition Nardo Grey photo side",
    ],
    "Honda Civic Type_R FL5": [
        "Honda Civic Type R FL5 2023 exterior side view",
        "Civic Type R 2023 2024 championship white street photo",
        "FL5 Type R hatchback real photo outdoor",
        "Honda Civic Type R 2023 red blue side view",
    ],
    # ── Luxury ─────────────────────────────────────────────────────────────
    "Cadillac CT5-V BW": [
        "Cadillac CT5-V Blackwing 2022 exterior side view",
        "CT5-V Blackwing sedan street photo 2022 2023",
        "Cadillac Blackwing 2022 real photo outdoor",
        "CT5-V Blackwing dark shadow grey photo",
    ],
    "Genesis G80 RG3": [
        "Genesis G80 2021 RG3 exterior side view",
        "G80 third generation 2021 2022 street photo",
        "Genesis G80 2022 2023 real photo sedan",
        "G80 luxury sedan outdoor photo side",
    ],
    # ── Korean EVs ─────────────────────────────────────────────────────────
    "Hyundai IONIQ5 NE1": [
        "Hyundai IONIQ 5 2022 exterior side view",
        "IONIQ5 NE1 2022 2023 street photo real",
        "Hyundai IONIQ 5 white phantom outdoor photo",
        "IONIQ 5 EV crossover 2023 real photo side",
    ],
    "Kia EV6 CV": [
        "Kia EV6 2022 exterior side view",
        "EV6 CV 2022 2023 street photo real",
        "Kia EV6 GT-Line outdoor photo white",
        "EV6 electric crossover 2023 real photo side",
    ],
    # ── Vans ───────────────────────────────────────────────────────────────
    "Honda Odyssey RL6": [
        "Honda Odyssey 2023 exterior side view",
        "Honda Odyssey 2024 2025 minivan photo",
        "Honda Odyssey RL6 sixth generation street",
        "Honda Odyssey white minivan 2023 real photo",
        "Honda Odyssey 2025 front three quarter",
    ],
    # ── EVs ────────────────────────────────────────────────────────────────
    "Tesla Model_S Plaid": [
        "Tesla Model S 2021 exterior side view",
        "Tesla Model S Plaid 2021 2022 photo",
        "Tesla Model S refresh 2021 street photo",
        "Tesla Model S Plaid white exterior",
        "Tesla Model S 2022 2023 real photo side",
    ],
    "Tesla Model_3 Highland": [
        "Tesla Model 3 2023 Highland exterior side view",
        "Model 3 Highland refresh 2024 street photo",
        "Tesla Model 3 2023 2024 white real photo",
        "Tesla Model 3 Highland sedan outdoor photo",
    ],
    "Tesla Model_Y JY": [
        "Tesla Model Y 2021 exterior side view",
        "Model Y crossover 2022 2023 street photo",
        "Tesla Model Y white outdoor photo real",
        "Model Y SUV 2023 2024 real photo side",
    ],
    "Tesla Model_X GX": [
        "Tesla Model X 2021 exterior side view",
        "Model X Plaid refresh 2021 2022 street photo",
        "Tesla Model X falcon door outdoor real photo",
        "Model X SUV white 2022 2023 real photo",
    ],
    "Tesla Cybertruck": [
        "Tesla Cybertruck 2024 exterior side view",
        "Cybertruck stainless steel street photo real",
        "Tesla Cybertruck outdoor 2024 real photo",
        "Cybertruck pickup truck silver photo side",
    ],
    # ── Background / negative class ────────────────────────────────────────
    # Critical: without a "not a vehicle" class, softmax always forces a winner.
    # These images teach the model to output low confidence on non-vehicle inputs.
    "_Background": [
        "empty road asphalt no cars",
        "parking lot pavement empty",
        "grass field outdoor daylight",
        "brick wall building exterior",
        "sidewalk pedestrian street no cars",
        "indoor room furniture no vehicle",
        "sky clouds outdoor photo",
        "trees forest path no vehicles",
        "empty highway no cars aerial view",
        "concrete floor ground texture close up",
        "shopping mall interior no vehicle",
        "office building lobby interior",
        "mountain landscape nature photo",
        "ocean beach sand waves no vehicle",
        "city skyline buildings no cars",
        "airport terminal interior photo",
        "train station platform people",
        "construction site dirt road no car",
        "basketball court playground outdoor",
        "park bench garden path photo",
        "alley bricks cobblestone no car",
        "rain puddle wet street reflection",
        "desert sand dunes landscape",
        "snow covered ground winter path",
        "rooftop buildings urban aerial photo",
        "tunnel interior dark no car",
        "river stream water nature outdoor",
        "stadium seats crowd sports arena",
        "warehouse interior shelves no vehicle",
        "pedestrian crosswalk people walking",
        "fog misty road empty no cars",
        "field farmland agriculture no vehicle",
        "night street lights glow no cars",
        "residential driveway empty no car",
        "rocky terrain trail path outdoor",
        "subway station platform metro",
        "restaurant interior tables chairs",
        "supermarket aisle grocery store",
        "dog cat pet animal outdoor photo",
        "bicycle parked sidewalk no car",
        "flower garden backyard patio",
        "fence wooden metal outdoor photo",
        "graffiti wall urban art street",
    ],
    "2000 Toyota Sienna Van": [
        "2000 Toyota Sienna minivan exterior side view",
        "Toyota Sienna 1998 1999 2000 first gen street photo",
        "Sienna XCE10 minivan 2000 2001 real photo",
        "2000 2001 Toyota Sienna van outdoor side view",
    ],
    # ── Trucks (additional) ─────────────────────────────────────────────────
    "Ram 1500 DT": [
        "Ram 1500 DT 2019 exterior",
        "Ram 1500 fifth generation 2019 2020 street",
        "Ram 1500 2021 2022 side view pickup",
        "Ram truck 2019 real photo",
    ],
    "Toyota Tacoma AN120": [
        "Toyota Tacoma 2016 AN120 exterior",
        "Tacoma third generation 2016 2017 street",
        "Toyota Tacoma 2018 2019 side view pickup",
        "Tacoma TRD 2020 2021 real photo",
    ],
    "Toyota Tundra XK70": [
        "Toyota Tundra 2022 XK70 exterior",
        "Tundra third generation 2022 street photo",
        "Toyota Tundra 2022 2023 side view pickup",
        "Tundra TRD Pro 2022 real photo",
    ],
    "Ford Ranger P703": [
        "Ford Ranger P703 2019 exterior",
        "Ford Ranger 2019 2020 midsize pickup street",
        "Ranger P703 2021 2022 side view photo",
        "Ford Ranger 2022 real photo",
    ],
    # ── Motorcycles ─────────────────────────────────────────────────────────
    "Ducati Panigale V4": [
        "Ducati Panigale V4 exterior side view",
        "Panigale V4 superbike street photo",
        "Ducati Panigale V4 2018 2019 real photo",
        "Panigale V4S motorcycle photo",
    ],
    "Honda CBR1000RR-R": [
        "Honda CBR1000RR-R Fireblade exterior",
        "CBR1000RR 2020 2021 side view real photo",
        "Honda CBR Fireblade superbike street photo",
        "CBR1000RR-R SP motorcycle photo",
    ],
    "Kawasaki Ninja ZX-10R": [
        "Kawasaki Ninja ZX-10R exterior side view",
        "ZX10R superbike street photo real",
        "Kawasaki ZX-10R 2021 2022 motorcycle photo",
        "Ninja ZX-10R track street real photo",
    ],
    "Yamaha YZF-R1": [
        "Yamaha YZF-R1 exterior side view",
        "R1 superbike street photo real",
        "Yamaha R1 2020 2021 motorcycle photo",
        "YZF-R1M track real photo",
    ],
    "Harley-Davidson Sportster S": [
        "Harley Davidson Sportster S RH1250S exterior",
        "Sportster S 2021 2022 side view street photo",
        "Harley Sportster S motorcycle real photo",
        "RH1250S Harley Davidson 2022 photo",
    ],
    "BMW S1000RR K67": [
        "BMW S1000RR K67 2019 exterior side view",
        "S1000RR superbike street photo real",
        "BMW S1000RR 2019 2020 2021 motorcycle photo",
        "S1000RR M package real photo",
    ],

    # ── Common compact / economy ───────────────────────────────────────────
    "Toyota Corolla 12th Gen": [
        "Toyota Corolla 2019 2020 12th generation exterior",
        "Corolla sedan 2019 2020 street photo side view",
        "Toyota Corolla 2021 2022 real photo outdoor",
        "Corolla E210 sedan side view photo",
    ],
    "Hyundai Elantra": [
        "Hyundai Elantra 2021 CN7 exterior side view",
        "Elantra sedan 2021 2022 street photo",
        "Hyundai Elantra 2021 real photo outdoor",
        "Elantra 2022 2023 sedan side view",
    ],
    "Kia Forte": [
        "Kia Forte 2019 sedan exterior side view",
        "Forte BD 2019 2020 street photo real",
        "Kia Forte 2021 2022 sedan outdoor photo",
        "Forte sedan side view 2020 real photo",
    ],
    "Nissan Sentra": [
        "Nissan Sentra 2020 eighth gen exterior",
        "Sentra B18 sedan 2020 2021 street photo",
        "Nissan Sentra 2021 2022 real photo side",
        "Sentra sedan outdoor photo 2022",
    ],
    "Volkswagen Jetta": [
        "Volkswagen Jetta 2019 MK7 exterior side view",
        "VW Jetta 2019 2020 sedan street photo",
        "Volkswagen Jetta 2021 2022 real photo outdoor",
        "Jetta sedan side view photo 2022",
    ],
    "Subaru Impreza": [
        "Subaru Impreza 2017 5th gen hatchback exterior",
        "Impreza hatchback 2018 2019 street photo",
        "Subaru Impreza sedan 2020 2021 real photo",
        "Impreza GK GT side view photo outdoor",
    ],
    "Toyota Yaris": [
        "Toyota Yaris 2020 hatchback exterior side view",
        "Yaris XP210 hatchback 2020 2021 street photo",
        "Toyota Yaris 2020 real photo outdoor",
        "Yaris hatchback sedan side view photo",
    ],
    "Honda Fit": [
        "Honda Fit 2018 Jazz hatchback exterior",
        "Fit GK hatchback 2018 2019 street photo",
        "Honda Fit Jazz 2019 2020 real photo outdoor",
        "Fit hatchback side view photo",
    ],
    "Hyundai Accent": [
        "Hyundai Accent 2018 RB sedan exterior",
        "Accent sedan 2018 2019 street photo side",
        "Hyundai Accent 2020 2021 real photo outdoor",
        "Accent sedan side view photo 2019",
    ],
    "Kia Rio": [
        "Kia Rio 2017 sedan hatchback exterior",
        "Rio YB sedan 2017 2018 street photo",
        "Kia Rio 2019 2020 real photo outdoor",
        "Rio sedan side view photo 2020",
    ],
    "Chevrolet Spark": [
        "Chevrolet Spark 2016 hatchback exterior",
        "Spark M400 hatchback 2016 2017 street photo",
        "Chevrolet Spark 2019 2020 real photo outdoor",
        "Spark minicar side view photo",
    ],
    "Nissan Versa": [
        "Nissan Versa 2020 sedan exterior side view",
        "Versa N18 sedan 2020 2021 street photo",
        "Nissan Versa 2021 2022 real photo outdoor",
        "Versa sedan side view photo 2022",
    ],
    "Mitsubishi Mirage": [
        "Mitsubishi Mirage 2017 hatchback exterior",
        "Mirage A05 hatchback 2017 2018 street photo",
        "Mitsubishi Mirage 2019 2020 real photo outdoor",
        "Mirage hatchback side view photo",
    ],

    # ── Common midsize sedans ─────────────────────────────────────────────
    "Nissan Altima 6th Gen": [
        "Nissan Altima 2019 sixth gen exterior side view",
        "Altima L34 sedan 2019 2020 street photo",
        "Nissan Altima 2021 2022 real photo outdoor",
        "Altima sedan side view photo 2022",
    ],
    "Hyundai Sonata DN8": [
        "Hyundai Sonata DN8 2020 exterior side view",
        "Sonata 2020 2021 8th gen sedan street photo",
        "Hyundai Sonata 2021 2022 real photo outdoor",
        "Sonata DN8 sedan side view photo",
    ],
    "Kia K5": [
        "Kia K5 Optima 2021 exterior side view",
        "K5 DL3 sedan 2021 2022 street photo",
        "Kia K5 2021 2022 real photo outdoor",
        "K5 sedan side view photo 2022",
    ],
    "Mazda 6 GJ": [
        "Mazda 6 GJ 2018 sedan exterior side view",
        "Mazda6 2018 2019 sedan street photo",
        "Mazda 6 2020 2021 real photo outdoor",
        "Mazda6 GJ sedan side view photo",
    ],
    "Volkswagen Passat B8": [
        "Volkswagen Passat B8 2016 exterior side view",
        "VW Passat 2016 2017 sedan street photo",
        "Volkswagen Passat 2019 2020 real photo outdoor",
        "Passat B8 sedan side view photo",
    ],
    "Subaru Legacy 7th Gen": [
        "Subaru Legacy 2020 seventh gen exterior",
        "Legacy BN BR sedan 2020 2021 street photo",
        "Subaru Legacy 2021 2022 real photo outdoor",
        "Legacy sedan side view photo 2022",
    ],
    "Chevrolet Malibu 9th Gen": [
        "Chevrolet Malibu 2016 ninth gen exterior",
        "Malibu sedan 2016 2017 street photo side",
        "Chevrolet Malibu 2019 2020 real photo outdoor",
        "Malibu sedan side view photo 2020",
    ],
    "Chrysler 300": [
        "Chrysler 300 2011 sedan exterior side view",
        "Chrysler 300 300S 2015 2016 street photo",
        "Chrysler 300 2019 2020 real photo outdoor",
        "300 sedan side view photo 2018",
    ],

    # ── Full-size sedans ──────────────────────────────────────────────────
    "Toyota Avalon 5th Gen": [
        "Toyota Avalon 2019 fifth gen exterior side view",
        "Avalon XX50 sedan 2019 2020 street photo",
        "Toyota Avalon 2021 2022 real photo outdoor",
        "Avalon sedan side view photo 2021",
    ],
    "Chevrolet Impala 10th Gen": [
        "Chevrolet Impala 2014 tenth gen exterior",
        "Impala 2014 2015 sedan street photo side",
        "Chevrolet Impala 2018 2019 real photo outdoor",
        "Impala sedan side view photo 2019",
    ],
    "Ford Crown Victoria": [
        "Ford Crown Victoria P71 exterior side view",
        "Crown Victoria police interceptor street photo",
        "Ford Crown Victoria 2008 2009 real photo outdoor",
        "Crown Vic sedan side view photo",
    ],

    # ── Muscle/sport civilian ─────────────────────────────────────────────
    "Ford Mustang S550": [
        "Ford Mustang S550 2015 exterior side view",
        "Mustang EcoBoost GT 2015 2016 street photo",
        "Ford Mustang 2017 2018 2019 real photo outdoor",
        "S550 Mustang fastback side view photo",
    ],
    "Chevrolet Camaro 6th Gen": [
        "Chevrolet Camaro 2016 sixth gen exterior",
        "Camaro SS LT1 2016 2017 street photo side",
        "Chevrolet Camaro 2018 2019 real photo outdoor",
        "Camaro coupe side view photo 2020",
    ],

    # ── Compact crossovers ────────────────────────────────────────────────
    "Toyota RAV4 5th Gen": [
        "Toyota RAV4 2019 fifth gen exterior side view",
        "RAV4 XSE TRD 2019 2020 street photo",
        "Toyota RAV4 2021 2022 real photo outdoor",
        "RAV4 SUV side view photo 2022",
    ],
    "Honda CR-V 5th Gen": [
        "Honda CR-V 2017 fifth gen exterior side view",
        "CRV EX Touring 2017 2018 street photo",
        "Honda CR-V 2019 2020 real photo outdoor",
        "CR-V SUV side view photo 2021",
    ],
    "Ford Escape 4th Gen": [
        "Ford Escape 2020 fourth gen exterior side view",
        "Escape SE Titanium 2020 2021 street photo",
        "Ford Escape 2021 2022 real photo outdoor",
        "Escape SUV side view photo 2022",
    ],
    "Chevrolet Equinox 3rd Gen": [
        "Chevrolet Equinox 2018 third gen exterior",
        "Equinox LT Premier 2018 2019 street photo",
        "Chevrolet Equinox 2020 2021 real photo outdoor",
        "Equinox SUV side view photo 2022",
    ],
    "Nissan Rogue 3rd Gen": [
        "Nissan Rogue 2021 third gen exterior side view",
        "Rogue SV SL 2021 2022 street photo",
        "Nissan Rogue 2022 2023 real photo outdoor",
        "Rogue SUV side view photo 2022",
    ],
    "Hyundai Tucson NX4": [
        "Hyundai Tucson 2022 NX4 exterior side view",
        "Tucson 2022 2023 fourth gen street photo",
        "Hyundai Tucson 2022 real photo outdoor",
        "Tucson NX4 SUV side view photo",
    ],
    "Mazda CX-5 2nd Gen": [
        "Mazda CX-5 2017 second gen exterior side view",
        "CX-5 KF 2017 2018 street photo",
        "Mazda CX-5 2019 2020 real photo outdoor",
        "CX-5 SUV side view photo 2022",
    ],
    "Kia Sportage NQ5": [
        "Kia Sportage 2022 NQ5 exterior side view",
        "Sportage 2022 2023 fifth gen street photo",
        "Kia Sportage 2022 real photo outdoor",
        "Sportage NQ5 SUV side view photo",
    ],
    "Subaru Forester 5th Gen": [
        "Subaru Forester 2019 fifth gen exterior",
        "Forester SK 2019 2020 street photo side",
        "Subaru Forester 2021 2022 real photo outdoor",
        "Forester SUV side view photo 2022",
    ],
    "Jeep Cherokee KL": [
        "Jeep Cherokee KL 2014 exterior side view",
        "Cherokee Trailhawk Latitude 2016 2017 street photo",
        "Jeep Cherokee 2019 2020 real photo outdoor",
        "Cherokee KL SUV side view photo",
    ],
    "Volkswagen Tiguan 2nd Gen": [
        "Volkswagen Tiguan 2018 second gen exterior",
        "VW Tiguan SE R-Line 2018 2019 street photo",
        "Volkswagen Tiguan 2020 2021 real photo outdoor",
        "Tiguan SUV side view photo 2022",
    ],
    "Subaru Outback 6th Gen": [
        "Subaru Outback 2020 sixth gen exterior",
        "Outback BT 2020 2021 street photo side",
        "Subaru Outback 2021 2022 real photo outdoor",
        "Outback wagon SUV side view photo",
    ],

    # ── Midsize SUVs ──────────────────────────────────────────────────────
    "Ford Explorer 6th Gen": [
        "Ford Explorer 2020 sixth gen exterior side view",
        "Explorer ST Platinum 2020 2021 street photo",
        "Ford Explorer 2021 2022 real photo outdoor",
        "Explorer SUV side view photo 2022",
    ],
    "Chevrolet Traverse 2nd Gen": [
        "Chevrolet Traverse 2018 second gen exterior",
        "Traverse LT Premier 2018 2019 street photo",
        "Chevrolet Traverse 2020 2021 real photo outdoor",
        "Traverse SUV side view photo 2022",
    ],
    "Toyota Highlander 4th Gen": [
        "Toyota Highlander 2020 fourth gen exterior",
        "Highlander XSE Platinum 2020 2021 street photo",
        "Toyota Highlander 2021 2022 real photo outdoor",
        "Highlander SUV side view photo 2022",
    ],
    "Honda Pilot 3rd Gen": [
        "Honda Pilot 2016 third gen exterior side view",
        "Pilot EX Touring 2016 2017 street photo",
        "Honda Pilot 2019 2020 real photo outdoor",
        "Pilot SUV side view photo 2021",
    ],
    "Nissan Pathfinder 5th Gen": [
        "Nissan Pathfinder 2022 fifth gen exterior",
        "Pathfinder SV Platinum 2022 2023 street photo",
        "Nissan Pathfinder 2022 real photo outdoor",
        "Pathfinder SUV side view photo 2022",
    ],
    "Hyundai Palisade": [
        "Hyundai Palisade 2020 exterior side view",
        "Palisade SEL Calligraphy 2020 2021 street photo",
        "Hyundai Palisade 2021 2022 real photo outdoor",
        "Palisade SUV side view photo 2022",
    ],
    "Kia Telluride": [
        "Kia Telluride 2020 exterior side view",
        "Telluride EX SX 2020 2021 street photo",
        "Kia Telluride 2021 2022 real photo outdoor",
        "Telluride SUV side view photo 2022",
    ],
    "GMC Acadia 2nd Gen": [
        "GMC Acadia 2017 second gen exterior side view",
        "Acadia SLE Denali 2017 2018 street photo",
        "GMC Acadia 2019 2020 real photo outdoor",
        "Acadia SUV side view photo 2021",
    ],
    "Dodge Durango WD": [
        "Dodge Durango 2014 WD exterior side view",
        "Durango GT SRT 2016 2017 street photo",
        "Dodge Durango 2019 2020 real photo outdoor",
        "Durango SUV side view photo 2021",
    ],
    "Volkswagen Atlas": [
        "Volkswagen Atlas 2018 exterior side view",
        "VW Atlas SE R-Line 2018 2019 street photo",
        "Volkswagen Atlas 2020 2021 real photo outdoor",
        "Atlas SUV side view photo 2022",
    ],

    # ── Full-size SUVs ────────────────────────────────────────────────────
    "Chevrolet Suburban 12th Gen": [
        "Chevrolet Suburban 2021 twelfth gen exterior",
        "Suburban LT Premier 2021 2022 street photo",
        "Chevrolet Suburban 2021 real photo outdoor",
        "Suburban full-size SUV side view photo",
    ],
    "Chevrolet Tahoe 5th Gen": [
        "Chevrolet Tahoe 2021 fifth gen exterior side view",
        "Tahoe LT Z71 2021 2022 street photo",
        "Chevrolet Tahoe 2021 real photo outdoor",
        "Tahoe SUV side view photo 2022",
    ],
    "Ford Expedition 4th Gen": [
        "Ford Expedition 2018 fourth gen exterior side view",
        "Expedition XLT Limited 2018 2019 street photo",
        "Ford Expedition 2020 2021 real photo outdoor",
        "Expedition full-size SUV side view photo",
    ],
    "GMC Yukon 5th Gen": [
        "GMC Yukon 2021 fifth gen exterior side view",
        "Yukon SLT Denali 2021 2022 street photo",
        "GMC Yukon 2021 real photo outdoor",
        "Yukon full-size SUV side view photo",
    ],

    # ── Midsize trucks ────────────────────────────────────────────────────
    "Chevrolet Colorado 2nd Gen": [
        "Chevrolet Colorado 2015 second gen exterior",
        "Colorado Z71 ZR2 2015 2016 street photo",
        "Chevrolet Colorado 2019 2020 real photo outdoor",
        "Colorado midsize truck side view photo",
    ],
    "Honda Ridgeline 2nd Gen": [
        "Honda Ridgeline 2017 second gen exterior",
        "Ridgeline RTL Black Edition 2017 2018 street photo",
        "Honda Ridgeline 2019 2020 real photo outdoor",
        "Ridgeline pickup truck side view photo",
    ],
    "Nissan Frontier 3rd Gen": [
        "Nissan Frontier 2022 third gen exterior",
        "Frontier SV Pro-4X 2022 2023 street photo",
        "Nissan Frontier 2022 real photo outdoor",
        "Frontier midsize truck side view photo",
    ],
    "GMC Canyon 2nd Gen": [
        "GMC Canyon 2015 second gen exterior side view",
        "Canyon SLE Denali 2015 2016 street photo",
        "GMC Canyon 2019 2020 real photo outdoor",
        "Canyon midsize truck side view photo",
    ],

    # ── Minivans ──────────────────────────────────────────────────────────
    "Toyota Sienna 4th Gen": [
        "Toyota Sienna 2021 fourth gen exterior side view",
        "Sienna XSE Platinum 2021 2022 street photo",
        "Toyota Sienna 2021 real photo outdoor",
        "Sienna minivan side view photo 2022",
    ],
    "Chrysler Pacifica": [
        "Chrysler Pacifica 2017 minivan exterior side view",
        "Pacifica Touring Limited 2017 2018 street photo",
        "Chrysler Pacifica 2019 2020 real photo outdoor",
        "Pacifica minivan side view photo 2021",
    ],
    "Kia Carnival": [
        "Kia Carnival 2022 minivan exterior side view",
        "Carnival LX EX 2022 2023 street photo",
        "Kia Carnival 2022 real photo outdoor",
        "Carnival minivan side view photo",
    ],

    # ── Hybrid / EV common ────────────────────────────────────────────────
    "Toyota Prius 4th Gen": [
        "Toyota Prius 2016 fourth gen exterior side view",
        "Prius XW50 2016 2017 street photo",
        "Toyota Prius 2018 2019 real photo outdoor",
        "Prius hatchback side view photo 2020",
    ],
    "Toyota Prius Prime": [
        "Toyota Prius Prime 2017 PHEV exterior side view",
        "Prius Prime plug-in hybrid 2017 2018 street photo",
        "Toyota Prius Prime 2019 2020 real photo outdoor",
        "Prius Prime hatchback side view photo",
    ],
    "Nissan LEAF 2nd Gen": [
        "Nissan LEAF 2018 second gen exterior side view",
        "LEAF Plus ZE1 EV 2018 2019 street photo",
        "Nissan LEAF 2020 2021 real photo outdoor",
        "LEAF electric hatchback side view photo",
    ],
    "Chevrolet Bolt EV": [
        "Chevrolet Bolt EV 2017 exterior side view",
        "Bolt EUV hatchback 2017 2018 street photo",
        "Chevrolet Bolt 2020 2021 real photo outdoor",
        "Bolt EV hatchback side view photo 2022",
    ],
    "Volkswagen ID.4": [
        "Volkswagen ID.4 2021 exterior side view",
        "VW ID4 Pro S AWD 2021 2022 street photo",
        "Volkswagen ID.4 2022 real photo outdoor",
        "ID.4 electric SUV side view photo",
    ],
    "Ford Mustang Mach-E": [
        "Ford Mustang Mach-E 2021 exterior side view",
        "Mach-E GT Premium 2021 2022 street photo",
        "Ford Mustang Mach-E 2022 real photo outdoor",
        "Mach-E electric SUV side view photo",
    ],

    # ── Entry-level luxury sedans ─────────────────────────────────────────
    "Lexus ES 350 7th Gen": [
        "Lexus ES 350 2019 seventh gen exterior side view",
        "ES 350 F Sport 2019 2020 street photo",
        "Lexus ES 2020 2021 real photo outdoor",
        "ES350 luxury sedan side view photo 2022",
    ],
    "Cadillac CT5": [
        "Cadillac CT5 2020 exterior side view",
        "CT5 Premium Luxury Sport 2020 2021 street photo",
        "Cadillac CT5 2021 2022 real photo outdoor",
        "CT5 sedan side view photo 2022",
    ],
    "Acura TLX 2nd Gen": [
        "Acura TLX 2021 second gen exterior side view",
        "TLX A-Spec Type S 2021 2022 street photo",
        "Acura TLX 2022 2023 real photo outdoor",
        "TLX luxury sedan side view photo",
    ],
    "Infiniti Q50": [
        "Infiniti Q50 2014 exterior side view",
        "Q50 Sport Red Sport 2016 2017 street photo",
        "Infiniti Q50 2019 2020 real photo outdoor",
        "Q50 sedan side view photo 2021",
    ],
    "Volvo S60 3rd Gen": [
        "Volvo S60 2019 third gen exterior side view",
        "S60 T5 T6 Inscription 2019 2020 street photo",
        "Volvo S60 2020 2021 real photo outdoor",
        "S60 luxury sedan side view photo",
    ],
    "Genesis G70 2nd Gen": [
        "Genesis G70 2022 second gen exterior side view",
        "G70 2.0T 3.3T 2022 2023 street photo",
        "Genesis G70 2022 real photo outdoor",
        "G70 luxury sedan side view photo",
    ],

    # ── Entry-level luxury SUVs ───────────────────────────────────────────
    "BMW X3 G01": [
        "BMW X3 G01 2018 exterior side view",
        "X3 xDrive30i M40i 2018 2019 street photo",
        "BMW X3 2020 2021 real photo outdoor",
        "X3 G01 luxury SUV side view photo",
    ],
    "Mercedes GLC W253": [
        "Mercedes GLC 300 W253 2016 exterior side view",
        "GLC 300 AMG Line 2016 2017 street photo",
        "Mercedes GLC 2019 2020 real photo outdoor",
        "GLC SUV side view photo 2021",
    ],
    "Audi Q5 2nd Gen": [
        "Audi Q5 2018 second gen exterior side view",
        "Q5 45 TFSI Premium Plus 2018 2019 street photo",
        "Audi Q5 2020 2021 real photo outdoor",
        "Q5 luxury SUV side view photo 2022",
    ],
    "Lexus RX 500h": [
        "Lexus RX 2023 fifth gen exterior side view",
        "RX 350 500h F Sport 2023 2024 street photo",
        "Lexus RX 2022 2023 real photo outdoor",
        "RX luxury SUV side view photo 2023",
    ],
    "Cadillac XT5": [
        "Cadillac XT5 2017 exterior side view",
        "XT5 Premium Luxury Sport 2017 2018 street photo",
        "Cadillac XT5 2019 2020 real photo outdoor",
        "XT5 luxury SUV side view photo 2021",
    ],
    "Acura MDX 4th Gen": [
        "Acura MDX 2022 fourth gen exterior side view",
        "MDX A-Spec Type S 2022 2023 street photo",
        "Acura MDX 2022 real photo outdoor",
        "MDX luxury SUV side view photo",
    ],
    "Infiniti QX60 3rd Gen": [
        "Infiniti QX60 2022 third gen exterior side view",
        "QX60 Luxe Autograph 2022 2023 street photo",
        "Infiniti QX60 2022 real photo outdoor",
        "QX60 luxury SUV side view photo",
    ],
    "Volvo XC60 2nd Gen": [
        "Volvo XC60 2018 second gen exterior side view",
        "XC60 T5 T6 Inscription 2018 2019 street photo",
        "Volvo XC60 2020 2021 real photo outdoor",
        "XC60 luxury SUV side view photo 2022",
    ],
    "Genesis GV70": [
        "Genesis GV70 2022 exterior side view",
        "GV70 2.5T 3.5T Sport 2022 2023 street photo",
        "Genesis GV70 2022 real photo outdoor",
        "GV70 luxury SUV side view photo",
    ],
    "Lincoln Corsair": [
        "Lincoln Corsair 2020 exterior side view",
        "Corsair Reserve Grand Touring 2020 2021 street photo",
        "Lincoln Corsair 2021 2022 real photo outdoor",
        "Corsair luxury SUV side view photo",
    ],

    # ── Public service / working fleet ────────────────────────────────────
    "School Bus": [
        "American yellow school bus exterior side view",
        "school bus road street photo real",
        "yellow school bus 2010 2015 outdoor photo",
        "school bus front side view street",
    ],
    "City Transit Bus": [
        "city transit bus exterior side view street",
        "public transit bus road photo real",
        "city bus MTA route outdoor photo",
        "transit bus side view street photo",
    ],
    "Garbage Truck": [
        "garbage truck rear loader exterior side view",
        "refuse collection truck street photo real",
        "garbage truck road outdoor photo",
        "rear loader waste truck side view",
    ],
    "Recycling Truck": [
        "recycling truck exterior side view street",
        "recycling collection vehicle road photo",
        "recycling truck outdoor photo real",
        "blue green recycling truck side view",
    ],
    "Police Explorer": [
        "Ford Explorer police interceptor exterior side view",
        "police SUV Ford Explorer patrol car street photo",
        "police Explorer PPV outdoor photo real",
        "Ford Explorer police car side view",
    ],
    "Police Charger": [
        "Dodge Charger police car exterior side view",
        "police cruiser Dodge Charger patrol street photo",
        "police Charger pursuit car outdoor photo real",
        "Dodge Charger police interceptor side view",
    ],
    "Police Tahoe": [
        "Chevrolet Tahoe police PPV exterior side view",
        "police Tahoe patrol SUV street photo real",
        "Chevy Tahoe police outdoor photo",
        "Tahoe PPV police vehicle side view",
    ],
    "Fire Engine": [
        "fire engine pumper truck exterior side view",
        "red fire truck street photo real",
        "fire department pumper engine outdoor photo",
        "fire engine side view road photo",
    ],
    "Ladder Truck": [
        "aerial ladder fire truck exterior side view",
        "fire department ladder truck street photo real",
        "ladder truck tiller outdoor photo",
        "aerial ladder fire apparatus side view",
    ],
    "Ambulance": [
        "box ambulance exterior side view",
        "ambulance EMS street photo real",
        "ambulance emergency vehicle outdoor photo",
        "ambulance side view road photo",
    ],
    "USPS Mail Truck": [
        "USPS mail truck LLV exterior side view",
        "postal mail truck grumman LLV street photo",
        "USPS delivery truck outdoor photo real",
        "mail truck LLV side view road photo",
    ],
    "UPS Delivery Truck": [
        "UPS delivery truck exterior side view",
        "UPS brown package car street photo real",
        "UPS truck outdoor photo delivery",
        "UPS delivery vehicle side view road",
    ],
    "FedEx Truck": [
        "FedEx delivery truck exterior side view",
        "FedEx ground express truck street photo real",
        "FedEx delivery vehicle outdoor photo",
        "FedEx truck side view road photo",
    ],
    "Amazon Delivery Van": [
        "Amazon delivery van exterior side view",
        "Amazon blue delivery van street photo real",
        "Amazon logistics van outdoor photo",
        "Amazon prime van side view road photo",
    ],
    "Tow Truck": [
        "flatbed tow truck exterior side view",
        "tow truck rollback street photo real",
        "flatbed wrecker outdoor photo",
        "tow truck side view road photo",
    ],
    "Street Sweeper": [
        "street sweeper vehicle exterior side view",
        "road sweeper truck street photo real",
        "street cleaning vehicle outdoor photo",
        "street sweeper side view road photo",
    ],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def class_to_dir(gen_class: str) -> Path:
    return DATA_DIR / gen_class.replace(" ", "_").replace("/", "-")


def image_hash(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def load_stats() -> dict:
    if STATS_FILE.exists():
        return json.loads(STATS_FILE.read_text())
    return {"counts": {}, "seen_hashes": []}


def save_stats(stats: dict) -> None:
    STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATS_FILE.write_text(json.dumps(stats, indent=2))


def download_image(url: str):
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        w, h = img.size
        if w < MIN_IMAGE_SIZE or h < MIN_IMAGE_SIZE:
            return None
        if max(w, h) > MAX_IMAGE_SIZE:
            ratio = MAX_IMAGE_SIZE / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, "JPEG", quality=90)
        return buf.getvalue(), img
    except Exception:
        return None


def scrape_class(ddgs, gen_class: str, target: int, seen_hashes: set) -> int:
    base_queries = list(CLASS_QUERIES.get(gen_class, [f"{gen_class} car exterior photo"]))
    # Rear-view queries are prepended so that classes already at the old target
    # (150) fill their next 20 slots with rear imagery first.  Skipped for
    # _Background and service vehicles where the front is the canonical view.
    _rear_skip = {"_Background", "School Bus", "City Transit Bus", "Garbage Truck",
                  "Recycling Truck", "Fire Engine", "Ladder Truck", "Ambulance",
                  "USPS Mail Truck", "UPS Delivery Truck", "FedEx Truck",
                  "Amazon Delivery Van", "Tow Truck", "Street Sweeper"}
    if gen_class not in _rear_skip:
        rear_queries = [
            f"{gen_class} rear view taillight photo",
            f"{gen_class} back bumper exterior street photo",
        ]
        queries = rear_queries + base_queries
    else:
        queries = base_queries
    dest_dir = class_to_dir(gen_class)
    existing = len(list(dest_dir.glob("*.jpg"))) if dest_dir.exists() else 0
    saved    = existing

    if saved >= target:
        log.info("%-35s already complete (%d images)", gen_class, saved)
        return saved

    log.info("%-35s  need %d more images…", gen_class, target - saved)

    for query in queries:
        if saved >= target:
            break

        # Exponential backoff: up to 3 retries on rate-limit / search failure
        results = []
        for attempt in range(3):
            try:
                results = list(ddgs.images(
                    query,
                    max_results=50,
                    type_image="photo",
                    size="medium",
                ))
                break
            except Exception as exc:
                exc_str = str(exc).lower()
                is_rate_limit = any(k in exc_str for k in ("ratelimit", "429", "202", "blocked", "forbidden"))
                wait = (30 * (2 ** attempt)) + random.uniform(0, 10)
                if is_rate_limit:
                    log.warning("  DDG rate-limited on %r (attempt %d) — sleeping %.0fs", query, attempt + 1, wait)
                else:
                    log.warning("  DDG search failed for %r: %s — sleeping %.0fs", query, exc, wait)
                time.sleep(wait)
                if attempt == 2:
                    log.warning("  Skipping query %r after 3 failed attempts", query)

        for result in results:
            if saved >= target:
                break

            url = result.get("image", "")
            if not url:
                continue

            downloaded = download_image(url)
            if not downloaded:
                continue

            raw, _ = downloaded
            h = image_hash(raw)
            if h in seen_hashes:
                continue
            seen_hashes.add(h)

            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{saved + 1:04d}.jpg"
            dest.write_bytes(raw)
            saved += 1
            log.info("  [%d/%d] saved %s", saved, target, dest.name)

        # Jittered inter-query pause — DDG rate-limits on short fixed intervals
        time.sleep(random.uniform(10, 20))

    return saved


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(target_class, per_class: int, class_delay: float) -> None:
    stats       = load_stats()
    seen_hashes = set(stats.get("seen_hashes", []))
    counts      = stats.get("counts", {})

    classes = [target_class] if target_class else list(CLASS_QUERIES.keys())

    for i, gen_class in enumerate(classes):
        # Fresh DDGS session per class — avoids session-level rate limiting
        with DDGS() as ddgs:
            n = scrape_class(ddgs, gen_class, per_class, seen_hashes)
        counts[gen_class] = n
        stats["counts"]      = counts
        stats["seen_hashes"] = list(seen_hashes)
        save_stats(stats)

        if i < len(classes) - 1:
            pause = class_delay + random.uniform(0, 15)
            log.info("  Cooling down %.0fs before next class…", pause)
            time.sleep(pause)

    log.info("\n=== Done ===")
    for gen_class in CLASS_QUERIES:
        n   = counts.get(gen_class, 0)
        bar = ("█" * int((n / per_class) * 20)).ljust(20, "░")
        log.info("  %-35s %s  %d/%d", gen_class, bar, n, per_class)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cls",         dest="target_class", help="Scrape one class only")
    parser.add_argument("--per-class",   type=int, default=IMAGES_PER_CLASS,
                        help=f"Images per class (default {IMAGES_PER_CLASS})")
    parser.add_argument("--data-dir",    dest="data_dir", default=None,
                        help="Override image output directory (default: ml/data/images)")
    parser.add_argument("--class-delay", dest="class_delay", type=float, default=60.0,
                        help="Base seconds to wait between classes (default 60, +0–15 jitter)")
    args = parser.parse_args()

    if args.data_dir:
        DATA_DIR   = Path(args.data_dir)
        STATS_FILE = DATA_DIR.parent / "scrape_stats.json"

    main(args.target_class, args.per_class, args.class_delay)
