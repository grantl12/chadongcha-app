"""
Reddit r/whatisthiscar scraper — builds labeled training dataset.

Strategy:
  - Fetches posts from r/whatisthiscar (top/hot/new)
  - Takes the highest-upvoted comment as the ground-truth label
  - Fuzzy-matches that comment against GENERATION_CLASSES
  - Downloads the post image into ml/data/images/<ClassName>/

Setup:
  1. Go to reddit.com/prefs/apps → create app → type: script
     Set redirect URI to http://localhost:8080
  2. Copy client_id and client_secret into backend/.env (or set env vars):
       REDDIT_CLIENT_ID=your_client_id
       REDDIT_CLIENT_SECRET=your_client_secret
  3. pip install praw requests Pillow python-dotenv

Usage:
  python training/scrape_reddit.py                  # scrape all classes
  python training/scrape_reddit.py --limit 500      # cap total posts fetched
  python training/scrape_reddit.py --cls "Toyota GR86 ZN8"  # single class
  python training/scrape_reddit.py --dry-run        # match only, no downloads
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from io import BytesIO
from pathlib import Path

# Load .env from backend/ if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")
except ImportError:
    pass

try:
    import praw
except ImportError:
    print("Missing dependency: pip install praw requests Pillow python-dotenv")
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

SUBREDDIT        = "whatisthiscar"
DATA_DIR         = Path(__file__).parent.parent / "data" / "images"
STATS_FILE       = Path(__file__).parent.parent / "data" / "scrape_stats.json"
IMAGES_PER_CLASS = 200
MIN_IMAGE_SIZE   = 224
MAX_IMAGE_SIZE   = 1024

GENERATION_CLASSES = [
    "Toyota GR86 ZN8",
    "Toyota Supra A90",
    "Toyota Camry XV70",
    "Honda Civic FE",
    "Honda Accord CN2",
    "Honda CR-V RS",
    "Mazda3 BP",
    "Mazda MX-5 ND",
    "Subaru WRX VB",
    "Subaru BRZ ZD8",
    "Mitsubishi Outlander CW",
    "Nissan Z RZ34",
    "Ford Mustang S650",
    "Ford F-150 P702",
    "Chevrolet Corvette C8",
    "Chevrolet Silverado GMTK2",
    "Dodge Challenger LC",
    "Jeep Wrangler JL",
    "Jeep Grand Cherokee WL",
    "BMW 3-Series G20",
    "BMW M3 G80",
    "BMW M4 G82",
    "Mercedes C-Class W206",
    "Mercedes AMG-GT X290",
    "Audi A4 B9",
    "Volkswagen Golf MK8",
    "Porsche 911 992",
    "Ferrari SF90 F173",
    "Lamborghini Huracan LB724",
    "Bugatti Chiron VGT",
]

CLASS_ALIASES: dict[str, list[list[str]]] = {
    "Toyota GR86 ZN8":           [["gr86"], ["gr 86"], ["zn8"]],
    "Toyota Supra A90":          [["supra", "a90"], ["mk5 supra"], ["gr supra"]],
    "Toyota Camry XV70":         [["camry", "xv70"], ["camry", "2018"], ["camry", "2019"], ["camry", "2020"], ["camry", "2021"], ["camry", "2022"]],
    "Honda Civic FE":            [["civic", "fe"], ["civic", "11th"], ["civic", "2022"], ["civic", "2023"], ["civic", "2024"]],
    "Honda Accord CN2":          [["accord", "cn2"], ["accord", "10th"], ["accord", "2018"], ["accord", "2019"], ["accord", "2020"], ["accord", "2021"]],
    "Honda CR-V RS":             [["cr-v", "rs"], ["crv", "rs"], ["cr-v", "2023"], ["cr-v", "2024"]],
    "Mazda3 BP":                 [["mazda3", "bp"], ["mazda 3", "bp"], ["mazda3", "4th gen"]],
    "Mazda MX-5 ND":             [["mx-5", "nd"], ["miata", "nd"], ["mx5", "nd"], ["miata", "4th"]],
    "Subaru WRX VB":             [["wrx", "vb"], ["wrx", "2022"], ["wrx", "2023"], ["5th gen wrx"]],
    "Subaru BRZ ZD8":            [["brz", "zd8"], ["brz", "2022"], ["2nd gen brz"]],
    "Mitsubishi Outlander CW":   [["outlander", "cw"], ["outlander", "2022"], ["outlander", "2023"]],
    "Nissan Z RZ34":             [["nissan z", "rz34"], ["400z"], ["nissan z", "2023"], ["nissan z", "2024"], ["rz34"]],
    "Ford Mustang S650":         [["mustang", "s650"], ["mustang", "2024"], ["7th gen mustang"]],
    "Ford F-150 P702":           [["f-150", "p702"], ["f150", "14th gen"], ["f-150", "2021"], ["f-150", "2022"], ["f-150", "2023"]],
    "Chevrolet Corvette C8":     [["corvette", "c8"], ["c8 corvette"], ["corvette", "stingray", "c8"]],
    "Chevrolet Silverado GMTK2": [["silverado", "gmtk2"], ["silverado", "2019"], ["silverado", "2020"], ["silverado", "4th gen"]],
    "Dodge Challenger LC":       [["challenger", "lc"], ["dodge challenger", "srt"], ["challenger", "hellcat"]],
    "Jeep Wrangler JL":          [["wrangler", "jl"], ["jl wrangler"], ["wrangler", "2018"], ["wrangler", "2019"], ["wrangler", "2020"]],
    "Jeep Grand Cherokee WL":    [["grand cherokee", "wl"], ["wl grand cherokee"], ["grand cherokee", "2021"], ["grand cherokee", "2022"]],
    "BMW 3-Series G20":          [["3 series", "g20"], ["3-series", "g20"], ["bmw 3", "g20"], ["m340"], ["330i", "g20"]],
    "BMW M3 G80":                [["m3", "g80"], ["bmw m3", "2021"], ["bmw m3", "2022"], ["g80 m3"]],
    "BMW M4 G82":                [["m4", "g82"], ["bmw m4", "2021"], ["bmw m4", "2022"], ["g82 m4"]],
    "Mercedes C-Class W206":     [["c-class", "w206"], ["w206"], ["c300", "w206"], ["mercedes c", "2022"]],
    "Mercedes AMG-GT X290":      [["amg gt", "x290"], ["amg-gt", "x290"], ["x290"], ["amg gt coupe"]],
    "Audi A4 B9":                [["a4", "b9"], ["audi a4", "b9"], ["a4", "2017"], ["a4", "2018"], ["a4", "2019"]],
    "Volkswagen Golf MK8":       [["golf", "mk8"], ["golf", "8th gen"], ["vw golf", "mk8"], ["golf", "2021"]],
    "Porsche 911 992":           [["911", "992"], ["992 911"], ["carrera", "992"], ["911", "2020"], ["911", "2021"]],
    "Ferrari SF90 F173":         [["sf90"], ["ferrari sf90"], ["f173"]],
    "Lamborghini Huracan LB724": [["huracan"], ["huracán"], ["lb724"], ["lamborghini huracan"]],
    "Bugatti Chiron VGT":        [["chiron"], ["bugatti chiron"]],
}

# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def match_comment(text: str) -> str | None:
    normalized = re.sub(r"[^a-z0-9\s\-]", " ", text.lower())
    for gen_class, alias_groups in CLASS_ALIASES.items():
        for tokens in alias_groups:
            if all(token in normalized for token in tokens):
                return gen_class
    return None

# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def extract_image_url(submission) -> str | None:
    url: str = submission.url or ""

    if re.search(r"\.(jpg|jpeg|png|webp)(\?.*)?$", url, re.IGNORECASE):
        return url
    if "i.redd.it" in url:
        return url

    # Gallery
    if hasattr(submission, "gallery_data") and hasattr(submission, "media_metadata"):
        try:
            items = submission.gallery_data["items"]
            if items:
                first_id = items[0]["media_id"]
                src = submission.media_metadata[first_id]["s"]
                img_url = src.get("u") or src.get("gif", "")
                return img_url.replace("&amp;", "&") if img_url else None
        except (KeyError, AttributeError):
            pass

    # Preview fallback
    try:
        src = submission.preview["images"][0]["source"]
        return src["url"].replace("&amp;", "&")
    except (AttributeError, KeyError, IndexError):
        pass

    return None


def download_image(url: str, dest: Path) -> bool:
    try:
        r = requests.get(url, timeout=20, headers={"User-Agent": "chadongcha-scraper/1.0"})
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        w, h = img.size
        if w < MIN_IMAGE_SIZE or h < MIN_IMAGE_SIZE:
            return False
        if max(w, h) > MAX_IMAGE_SIZE:
            ratio = MAX_IMAGE_SIZE / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, "JPEG", quality=90)
        return True
    except Exception as exc:
        log.debug("Image download failed (%s): %s", url, exc)
        return False

# ---------------------------------------------------------------------------
# Stats helpers
# ---------------------------------------------------------------------------

def load_stats() -> dict:
    if STATS_FILE.exists():
        return json.loads(STATS_FILE.read_text())
    return {"counts": {}, "seen_posts": []}


def save_stats(stats: dict) -> None:
    STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATS_FILE.write_text(json.dumps(stats, indent=2))


def class_to_dir(gen_class: str) -> Path:
    return DATA_DIR / gen_class.replace(" ", "_").replace("/", "-")

# ---------------------------------------------------------------------------
# Main scrape loop
# ---------------------------------------------------------------------------

def scrape(target_class: str | None = None, total_limit: int = 2000, dry_run: bool = False) -> None:
    client_id     = os.environ.get("REDDIT_CLIENT_ID", "")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print(
            "\nMissing Reddit credentials.\n"
            "Add these to backend/.env (or set as env vars):\n"
            "  REDDIT_CLIENT_ID=your_client_id\n"
            "  REDDIT_CLIENT_SECRET=your_client_secret\n"
            "\nGet them at: https://www.reddit.com/prefs/apps\n"
            "(Create app → type: script → any redirect URI)"
        )
        sys.exit(1)

    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent="chadongcha-scraper/1.0 (training data; github.com/grantl12/ChaDongCha)",
    )

    stats  = load_stats()
    seen:   set[str]      = set(stats.get("seen_posts", []))
    counts: dict[str, int] = stats.get("counts", {})

    # Recount existing images on disk
    for gen_class in GENERATION_CLASSES:
        d = class_to_dir(gen_class)
        counts[gen_class] = len(list(d.glob("*.jpg"))) if d.exists() else 0

    sub = reddit.subreddit(SUBREDDIT)
    fetched = 0

    streams = [
        sub.top(time_filter="all",   limit=total_limit),
        sub.top(time_filter="year",  limit=total_limit // 2),
        sub.hot(limit=total_limit // 4),
        sub.new(limit=total_limit // 4),
    ]

    for stream in streams:
        if fetched >= total_limit:
            break
        for submission in stream:
            if fetched >= total_limit:
                break
            if submission.id in seen:
                continue
            seen.add(submission.id)
            fetched += 1

            img_url = extract_image_url(submission)
            if not img_url:
                continue

            # Top comment = label
            submission.comments.replace_more(limit=0)
            top_comments = sorted(submission.comments.list(), key=lambda c: c.score, reverse=True)
            if not top_comments:
                continue
            top = top_comments[0]
            if top.score < 2 or not top.body or top.body == "[deleted]":
                continue

            matched = match_comment(top.body)
            if not matched:
                continue
            if target_class and matched != target_class:
                continue
            if counts.get(matched, 0) >= IMAGES_PER_CLASS:
                continue

            log.info("✓ %-30s  score=%-4d  post=%s", matched, top.score, submission.id)
            if dry_run:
                continue

            idx  = counts.get(matched, 0) + 1
            dest = class_to_dir(matched) / f"{idx:04d}.jpg"
            if download_image(img_url, dest):
                counts[matched] = idx

            # Save progress every 50 posts
            if fetched % 50 == 0:
                stats["counts"]     = counts
                stats["seen_posts"] = list(seen)
                save_stats(stats)

    # Final summary
    log.info("\n=== Scrape complete — %d posts scanned ===", fetched)
    for gen_class in GENERATION_CLASSES:
        n   = counts.get(gen_class, 0)
        pct = n / IMAGES_PER_CLASS
        bar = ("█" * int(pct * 20)).ljust(20, "░")
        log.info("  %-35s %s  %d/%d", gen_class, bar, n, IMAGES_PER_CLASS)

    stats["counts"]     = counts
    stats["seen_posts"] = list(seen)
    save_stats(stats)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=2000,  help="Max posts to scan")
    parser.add_argument("--cls",     dest="target_class",     help="Scrape one class only")
    parser.add_argument("--dry-run", action="store_true",     help="Match only, no downloads")
    args = parser.parse_args()

    scrape(
        target_class=args.target_class,
        total_limit=args.limit,
        dry_run=args.dry_run,
    )
