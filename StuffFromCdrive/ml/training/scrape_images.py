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
import sys
import time
from io import BytesIO
from pathlib import Path

try:
    from duckduckgo_search import DDGS
except ImportError:
    print("Missing dependency: pip install duckduckgo_search requests Pillow")
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

_DEFAULT_DATA_DIR = Path("D:/Users/grant/Documents/ChaDongCha/ml/data/images")
DATA_DIR          = _DEFAULT_DATA_DIR   # overridden by --data-dir arg
STATS_FILE        = DATA_DIR.parent / "scrape_stats.json"
IMAGES_PER_CLASS = 150
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
    "2021 Tesla Model S": [
        "2021 Tesla Model S exterior",
        "Tesla Model S Plaid 2021 street photo",
        "2021 Tesla Model S side view",
        "Tesla Model S 2021 2022 real photo",
    ],
    "2025 Honda Odyssey": [
        "2025 Honda Odyssey exterior",
        "Honda Odyssey 2025 street photo",
        "2025 Honda Odyssey side view",
        "Honda Odyssey 2025 real photo",
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
    queries  = CLASS_QUERIES.get(gen_class, [f"{gen_class} car exterior photo"])
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

        try:
            results = list(ddgs.images(
                query,
                max_results=60,
                type_image="photo",
                size="medium",
            ))
        except Exception as exc:
            log.warning("  DDG search failed for %r: %s", query, exc)
            time.sleep(3)
            continue

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

        time.sleep(1.5)  # polite pause between queries

    return saved


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(target_class, per_class: int) -> None:
    stats       = load_stats()
    seen_hashes = set(stats.get("seen_hashes", []))
    counts      = stats.get("counts", {})

    classes = [target_class] if target_class else list(CLASS_QUERIES.keys())

    with DDGS() as ddgs:
        for gen_class in classes:
            n = scrape_class(ddgs, gen_class, per_class, seen_hashes)
            counts[gen_class] = n
            stats["counts"]      = counts
            stats["seen_hashes"] = list(seen_hashes)
            save_stats(stats)

    log.info("\n=== Done ===")
    for gen_class in CLASS_QUERIES:
        n   = counts.get(gen_class, 0)
        bar = ("█" * int((n / per_class) * 20)).ljust(20, "░")
        log.info("  %-35s %s  %d/%d", gen_class, bar, n, per_class)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cls",       dest="target_class", help="Scrape one class only")
    parser.add_argument("--per-class", type=int, default=IMAGES_PER_CLASS,
                        help=f"Images per class (default {IMAGES_PER_CLASS})")
    parser.add_argument("--data-dir",  dest="data_dir", default=None,
                        help="Override image output directory (default: ml/data/images)")
    args = parser.parse_args()

    if args.data_dir:
        DATA_DIR   = Path(args.data_dir)
        STATS_FILE = DATA_DIR.parent / "scrape_stats.json"

    main(args.target_class, args.per_class)
