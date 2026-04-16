"""
ID Game Seeder V2.1 — Rate-limit resistant edition.
"""

import os
import sys
import uuid
import time
import random
import logging
from io import BytesIO
from typing import List, Optional

import boto3
import requests
from PIL import Image
from duckduckgo_search import DDGS
from supabase import create_client, Client
from dotenv import load_dotenv

# Load from .env if present
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "https://assets.chadongcha.app")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BUCKET_NAME = "chadongcha-assets"
R2_PREFIX = "id_game"
IMAGES_PER_CAR = 2
MIN_IMAGE_SIZE = 500
MAX_IMAGE_SIZE = 1200

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

# (Car list omitted for brevity, same as V2)
ALL_CARS = [
    {"class": "De Tomaso Pantera", "label": "De Tomaso Pantera", "body": "coupe"},
    {"class": "Polestar 2", "label": "Polestar 2", "body": "sedan"},
    {"class": "Nissan Figaro", "label": "Nissan Figaro", "body": "coupe"},
    {"class": "Shelby Cobra Replica", "label": "Shelby Cobra Replica", "body": "convertible"},
    {"class": "Karma Revero", "label": "Karma Revero", "body": "sedan"},
    {"class": "Fisker Karma", "label": "Fisker Karma", "body": "sedan"},
    {"class": "Suzuki X-90", "label": "Suzuki X-90", "body": "suv"},
    {"class": "Toyota Sera", "label": "Toyota Sera", "body": "coupe"},
    {"class": "Pontiac Fiero", "label": "Pontiac Fiero", "body": "coupe"},
    {"class": "Mazda Autozam AZ-1", "label": "Autozam AZ-1", "body": "coupe"},
    {"class": "Suzuki Cappuccino", "label": "Suzuki Cappuccino", "body": "convertible"},
    {"class": "Honda Beat", "label": "Honda Beat", "body": "convertible"},
    {"class": "Mitsuoka Orochi", "label": "Mitsuoka Orochi", "body": "coupe"},
    {"class": "Isuzu VehiCROSS", "label": "Isuzu VehiCROSS", "body": "suv"},
    {"class": "Bricklin SV-1", "label": "Bricklin SV-1", "body": "coupe"},
    {"class": "DeLorean DMC-12", "label": "DeLorean DMC-12", "body": "coupe"},
    {"class": "Plymouth Prowler", "label": "Plymouth Prowler", "body": "convertible"},
    {"class": "Lotus Seven", "label": "Lotus Seven / Caterham", "body": "convertible"},
    {"class": "Vanderhall Venice", "label": "Vanderhall Venice", "body": "convertible"},
    {"class": "Polaris Slingshot", "label": "Polaris Slingshot", "body": "convertible"},
    {"class": "Lucid Air", "label": "Lucid Air", "body": "sedan"},
    {"class": "Rivian R1T", "label": "Rivian R1T", "body": "truck"},
    {"class": "Rivian R1S", "label": "Rivian R1S", "body": "suv"},
    {"class": "Genesis GV80", "label": "Genesis GV80", "body": "suv"},
    {"class": "Genesis G70", "label": "Genesis G70", "body": "sedan"},
    {"class": "VinFast VF8", "label": "VinFast VF8", "body": "suv"},
    {"class": "Alpine A110", "label": "Alpine A110", "body": "coupe"},
    {"class": "Cupra Formentor", "label": "Cupra Formentor", "body": "suv"},
    {"class": "Lotus Emira", "label": "Lotus Emira", "body": "coupe"},
    {"class": "Rimac Nevera", "label": "Rimac Nevera", "body": "coupe"},
    {"class": "NIO EP9", "label": "NIO EP9", "body": "coupe"},
    {"class": "Nissan Skyline GT-R R32", "label": "Nissan Skyline R32", "body": "coupe"},
    {"class": "Nissan Skyline GT-R R34", "label": "Nissan Skyline R34", "body": "coupe"},
    {"class": "Toyota Century", "label": "Toyota Century", "body": "sedan"},
    {"class": "Toyota Chaser JZX100", "label": "Toyota Chaser", "body": "sedan"},
    {"class": "Mazda RX-7 FD", "label": "Mazda RX-7 FD", "body": "coupe"},
    {"class": "Mitsubishi FTO", "label": "Mitsubishi FTO", "body": "coupe"},
    {"class": "Subaru SVX", "label": "Subaru SVX", "body": "coupe"},
    {"class": "Eunos Cosmo", "label": "Eunos Cosmo", "body": "coupe"},
    {"class": "Nissan Pao", "label": "Nissan Pao", "body": "hatchback"},
    {"class": "Nissan S-Cargo", "label": "Nissan S-Cargo", "body": "van"},
    {"class": "Chevrolet Corvette C8", "label": "Chevrolet Corvette C8", "body": "coupe"},
    {"class": "Acura NSX NC1", "label": "Acura NSX", "body": "coupe"},
    {"class": "Lotus Evora", "label": "Lotus Evora", "body": "coupe"},
    {"class": "Saleen S7", "label": "Saleen S7", "body": "coupe"},
    {"class": "Noble M600", "label": "Noble M600", "body": "coupe"},
    {"class": "Rossion Q1", "label": "Rossion Q1", "body": "coupe"},
    {"class": "Tesla Cybertruck", "label": "Tesla Cybertruck", "body": "truck"},
    {"class": "Hyundai IONIQ 5", "label": "Hyundai IONIQ 5", "body": "suv"},
    {"class": "Hyundai IONIQ 6", "label": "Hyundai IONIQ 6", "body": "sedan"},
    {"class": "Kia EV6", "label": "Kia EV6", "body": "suv"},
    {"class": "Kia EV9", "label": "Kia EV9", "body": "suv"},
    {"class": "Ford Mustang Mach-E", "label": "Mustang Mach-E", "body": "suv"},
    {"class": "Porsche Taycan", "label": "Porsche Taycan", "body": "sedan"},
    {"class": "Audi e-tron GT", "label": "Audi e-tron GT", "body": "sedan"},
    {"class": "Saab 9-5", "label": "Saab 9-5", "body": "sedan"},
    {"class": "Pontiac Solstice", "label": "Pontiac Solstice", "body": "convertible"},
    {"class": "Saturn Sky", "label": "Saturn Sky", "body": "convertible"},
    {"class": "Plymouth Laser", "label": "Plymouth Laser", "body": "coupe"},
    {"class": "Eagle Talon", "label": "Eagle Talon", "body": "coupe"},
    {"class": "Dodge Stealth", "label": "Dodge Stealth", "body": "coupe"},
    {"class": "Holden Monaro", "label": "Holden Monaro (GTO)", "body": "coupe"},
    {"class": "Chevrolet SS", "label": "Chevrolet SS (Commodore)", "body": "sedan"},
    {"class": "BMW i8", "label": "BMW i8", "body": "coupe"},
    {"class": "Morgan 3-Wheeler", "label": "Morgan 3-Wheeler", "body": "convertible"},
    {"class": "Reliant Robin", "label": "Reliant Robin", "body": "hatchback"},
    {"class": "Messerschmitt KR200", "label": "Messerschmitt KR200", "body": "coupe"},
    {"class": "BMW Isetta", "label": "BMW Isetta", "body": "coupe"},
    {"class": "Peel P50", "label": "Peel P50", "body": "hatchback"},
    {"class": "Pontiac Aztek", "label": "Pontiac Aztek", "body": "suv"},
    {"class": "Isuzu VehiCROSS", "label": "Isuzu VehiCROSS", "body": "suv"},
    {"class": "Toyota GR86", "label": "Toyota GR86", "body": "coupe"},
    {"class": "Subaru BRZ", "label": "Subaru BRZ", "body": "coupe"},
    {"class": "Nissan Z RZ34", "label": "Nissan Z", "body": "coupe"},
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
]

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )

def download_and_process(url: str) -> Optional[bytes]:
    try:
        ua = random.choice(USER_AGENTS)
        r = requests.get(url, timeout=10, headers={"User-Agent": ua})
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        w, h = img.size
        if w < MIN_IMAGE_SIZE or h < MIN_IMAGE_SIZE: return None
        if max(w, h) > MAX_IMAGE_SIZE:
            img.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, "JPEG", quality=85)
        return buf.getvalue()
    except Exception:
        return None

def seed_id_game():
    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, SUPABASE_URL, SUPABASE_KEY]):
        log.error("Missing environment variables. Check .env")
        return

    s3 = get_s3_client()
    db = create_client(SUPABASE_URL, SUPABASE_KEY)

    with DDGS() as ddgs:
        for car in ALL_CARS:
            cls, label, body = car["class"], car["label"], car["body"]
            query = f"{label} real world street photo exterior -wrecked -crash -toy -concept -render"
            log.info(f"Scraping: {query}")
            
            try:
                # Add random sleep between searches
                time.sleep(random.uniform(5, 12))
                results = list(ddgs.images(query, max_results=10))
            except Exception as e:
                log.warning(f"Search failed for {cls}: {e}")
                continue

            count = 0
            for res in results:
                if count >= IMAGES_PER_CAR: break
                url = res.get("image")
                if not url: continue
                
                img_data = download_and_process(url)
                if not img_data: continue
                
                img_id = str(uuid.uuid4())
                key = f"{R2_PREFIX}/{img_id}.jpg"
                
                try:
                    s3.put_object(Bucket=BUCKET_NAME, Key=key, Body=img_data, ContentType="image/jpeg")
                    r2_url = f"{R2_PUBLIC_URL}/{key}"
                    
                    db.table("id_game_queue").insert({
                        "image_url": r2_url,
                        "author_username": "Archive",
                        "answer_class": cls,
                        "answer_label": label,
                        "body_style": body,
                        "source": "scraped",
                        "status": "active"
                    }).execute()
                    
                    count += 1
                    log.info(f"  [{count}/{IMAGES_PER_CAR}] Saved {r2_url}")
                    time.sleep(random.uniform(1, 3))
                except Exception as e:
                    log.error(f"  Failed to save {url}: {e}")

if __name__ == "__main__":
    seed_id_game()
