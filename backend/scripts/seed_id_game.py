"""
ID Game Seeder V6 — Robust scraping with retry logic and user-agent rotation.
Matches the successful logic from ml/training/scrape_images.py.
Saves to ml/data/id_game/ and generates SQL for R2 migration.
"""

import hashlib
import os
import uuid
import time
import random
import logging
from io import BytesIO
from pathlib import Path

import boto3
import requests
from botocore.config import Config
from PIL import Image
from duckduckgo_search import DDGS
from dotenv import load_dotenv

# Load from .env if present
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Config
DATA_DIR = Path("D:/Users/grant/Documents/ChaDongCha/ml/data/id_game")
DATA_DIR.mkdir(parents=True, exist_ok=True)
SQL_FILE = Path("D:/Users/grant/Documents/ChaDongCha/backend/scripts/id_game_inserts.sql")

IMAGES_PER_CAR = 3
MIN_IMAGE_SIZE = 500
MAX_IMAGE_SIZE = 1024
R2_PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_URL", "https://assets.chadongcha.app")
R2_PREFIX = "id_game"

# R2 upload — optional. Falls back to local-only if credentials are missing.
_r2 = None

def _get_r2():
    global _r2
    if _r2 is None:
        account_id = os.getenv("R2_ACCOUNT_ID", "")
        key_id     = os.getenv("R2_ACCESS_KEY_ID", "")
        secret     = os.getenv("R2_SECRET_ACCESS_KEY", "")
        if account_id and key_id and secret:
            try:
                _r2 = boto3.client(
                    "s3",
                    endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                    aws_access_key_id=key_id,
                    aws_secret_access_key=secret,
                    region_name="auto",
                    config=Config(signature_version="s3v4"),
                )
                log.info("R2 client initialised — images will be uploaded directly.")
            except Exception as e:
                log.warning(f"R2 client init failed ({e}). Saving locally only.")
        else:
            log.info("R2 credentials not set — saving locally. Upload manually afterwards.")
    return _r2


def image_hash(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def upload_to_r2(data: bytes, key: str) -> bool:
    """Upload bytes to R2. Returns True on success."""
    client = _get_r2()
    if not client:
        return False
    try:
        client.put_object(
            Bucket="chadongcha-assets",
            Key=key,
            Body=data,
            ContentType="image/jpeg",
        )
        return True
    except Exception as e:
        log.warning(f"R2 upload failed for {key}: {e}")
        return False

# (Car list same as V3)
ALL_CARS = [
    {"class": "De Tomaso Pantera", "label": "De Tomaso Pantera", "body": "coupe"},
    {"class": "Polestar 2", "label": "Polestar 2", "body": "sedan"},
    {"class": "Nissan Figaro", "label": "Nissan Figaro", "body": "coupe"},
    {"class": "Shelby Cobra Replica", "label": "Shelby Cobra Replica", "body": "convertible"},
    {"class": "Karma Revero", "label": "Karma Revero", "body": "sedan"},
    {"class": "Suzuki X-90", "label": "Suzuki X-90", "body": "suv"},
    {"class": "Toyota Sera", "label": "Toyota Sera", "body": "coupe"},
    {"class": "Pontiac Fiero", "label": "Pontiac Fiero", "body": "coupe"},
    {"class": "Autozam AZ-1", "label": "Autozam AZ-1", "body": "coupe"},
    {"class": "DeLorean DMC-12", "label": "DeLorean DMC-12", "body": "coupe"},
    {"class": "Plymouth Prowler", "label": "Plymouth Prowler", "body": "convertible"},
    {"class": "Lucid Air", "label": "Lucid Air", "body": "sedan"},
    {"class": "Rivian R1T", "label": "Rivian R1T", "body": "truck"},
    {"class": "Genesis GV80", "label": "Genesis GV80", "body": "suv"},
    {"class": "Nissan Skyline R34", "label": "Nissan Skyline R34", "body": "coupe"},
    {"class": "Chevrolet Corvette C8", "label": "Chevrolet Corvette C8", "body": "coupe"},
    {"class": "Tesla Cybertruck", "label": "Tesla Cybertruck", "body": "truck"},
    {"class": "Hyundai IONIQ 5", "label": "Hyundai IONIQ 5", "body": "suv"},
    {"class": "Kia EV6", "label": "Kia EV6", "body": "suv"},
    {"class": "BMW i8", "label": "BMW i8", "body": "coupe"},
    {"class": "Toyota GR86", "label": "Toyota GR86", "body": "coupe"},
    {"class": "Subaru BRZ", "label": "Subaru BRZ", "body": "coupe"},
    {"class": "Nissan Z", "label": "Nissan Z", "body": "coupe"},
    {"class": "Toyota Supra A90", "label": "Toyota Supra A90", "body": "coupe"},
    {"class": "BMW M4 G82", "label": "BMW M4 G82", "body": "coupe"},
    {"class": "BMW M3 G80", "label": "BMW M3 G80", "body": "sedan"},
    {"class": "Mercedes-AMG GT", "label": "Mercedes-AMG GT", "body": "coupe"},
    {"class": "Porsche 911 992", "label": "Porsche 911 992", "body": "coupe"},
    {"class": "Audi R8", "label": "Audi R8", "body": "coupe"},
    {"class": "Lamborghini Aventador", "label": "Lamborghini Aventador", "body": "coupe"},
    {"class": "Ferrari 488", "label": "Ferrari 488", "body": "coupe"},
    {"class": "McLaren 570S", "label": "McLaren 570S", "body": "coupe"},
    {"class": "Ford Bronco", "label": "Ford Bronco", "body": "suv"},
    {"class": "Jeep Gladiator", "label": "Jeep Gladiator", "body": "truck"},
    {"class": "Land Rover Defender", "label": "Land Rover Defender", "body": "suv"},
    {"class": "Toyota 4Runner", "label": "Toyota 4Runner", "body": "suv"},
    {"class": "Dodge RAM TRX", "label": "RAM TRX", "body": "truck"},
    {"class": "Ford F-150 Raptor", "label": "F-150 Raptor", "body": "truck"},
    {"class": "Honda Civic Type R FL5", "label": "Civic Type R FL5", "body": "hatchback"},
    {"class": "Volkswagen Golf R", "label": "Golf R MK8", "body": "hatchback"},
    {"class": "Saab 9-5", "label": "Saab 9-5", "body": "sedan"},
    {"class": "Pontiac Solstice", "label": "Pontiac Solstice", "body": "convertible"},
    {"class": "Saturn Sky", "label": "Saturn Sky", "body": "convertible"},
    {"class": "Dodge Stealth", "label": "Dodge Stealth", "body": "coupe"},
    {"class": "Holden Monaro", "label": "Holden Monaro", "body": "coupe"},
    {"class": "Chevrolet SS", "label": "Chevrolet SS", "body": "sedan"},
    {"class": "Morgan 3-Wheeler", "label": "Morgan 3-Wheeler", "body": "convertible"},
    {"class": "BMW Isetta", "label": "BMW Isetta", "body": "coupe"},
    {"class": "Pontiac Aztek", "label": "Pontiac Aztek", "body": "suv"},
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/121.0 Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Firefox/121.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/120.0.0.0",
]

# --- Scraper Logic ---

def download_image(url: str):
    try:
        ua = random.choice(USER_AGENTS)
        r = requests.get(url, timeout=20, headers={"User-Agent": ua})
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
        return buf.getvalue()
    except requests.exceptions.RequestException as e:
        log.warning(f"Request failed for {url}: {e}")
        return None
    except Exception as e:
        log.warning(f"Image processing failed for {url}: {e}")
        return None

def scrape_car(ddgs, car: dict, seen_hashes: set, sql_f) -> int:
    label, cls, body = car["label"], car["class"], car["body"]
    
    queries = [
        f"{label} car street photo exterior",
        f"{label} {body} real photo side view",
        f"{label} car daylight photo",
        f"{label} parked street photo",
    ]
    
    saved = 0
    log.info("%-25s  need %d images...", label, IMAGES_PER_CAR)

    for query in queries:
        if saved >= IMAGES_PER_CAR:
            break

        results = []
        retries = 3
        for attempt in range(retries):
            try:
                # Add human-like delays and User-Agent rotation
                time.sleep(random.uniform(5, 15) * (attempt + 1))
                ua = random.choice(USER_AGENTS)
                log.info(f"  Searching: {query} (UA: {ua[:30]}...)")
                
                search_results = list(ddgs.images(
                    query,
                    max_results=20,
                    type_image="photo",
                    size="medium",
                    safe="off", # Allow all images, filter by size/quality later
                    # No explicit user-agent setting in DDGS library, relying on requests header
                ))
                results = search_results
                break # Success
            except Exception as e:
                log.warning(f"  Search attempt {attempt+1}/{retries} failed for {query}: {e}")
                if attempt == retries - 1:
                    log.error(f"  Search failed after {retries} attempts for {query}")
                    continue
        
        if not results:
            continue

        for res in results:
            if saved >= IMAGES_PER_CAR:
                break
            url = res.get("image")
            if not url:
                continue

            raw = download_image(url)
            if not raw:
                continue

            h = image_hash(raw)
            if h in seen_hashes:
                continue
            seen_hashes.add(h)

            car_uuid  = str(uuid.uuid4())
            r2_key    = f"{R2_PREFIX}/{car_uuid}.jpg"
            r2_url    = f"{R2_PUBLIC_BASE_URL}/{r2_key}"
            uploaded  = upload_to_r2(raw, r2_key)

            if not uploaded:
                # Fall back to local save; user can manually upload to R2 later
                save_path = DATA_DIR / f"{car_uuid}.jpg"
                save_path.write_bytes(raw)
                log.info(f"  [{saved+1}/{IMAGES_PER_CAR}] saved locally: {car_uuid}.jpg")
            else:
                log.info(f"  [{saved+1}/{IMAGES_PER_CAR}] uploaded to R2: {r2_key}")

            # SQL always uses the R2 URL (local files need manual upload before inserting)
            sql = (
                f"insert into id_game_queue "
                f"(image_url, author_username, answer_class, answer_label, body_style, source, status) "
                f"values ('{r2_url}', 'Archive', '{cls}', '{label}', '{body}', 'scraped', 'active');\n"
            )
            sql_f.write(sql)
            sql_f.flush()

            saved += 1
            
    return saved

def main():
    random.shuffle(ALL_CARS)
    seen_hashes = set()
    
    with DDGS() as ddgs:
        with open(SQL_FILE, "a", encoding="utf-8") as sql_f:
            for car in ALL_CARS:
                scrape_car(ddgs, car, seen_hashes, sql_f)

if __name__ == "__main__":
    main()
