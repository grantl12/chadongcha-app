# 🏎️ Project ChaDongCha: Gemini Specialist Handbook

## 🎯 The Mission
"Pokémon GO for Gearheads" — a street-level vehicle hunting game where an on-device MobileNetV3 classifier identifies cars in real time. Players catch vehicles, claim road territory, and compete on leaderboards. Supports public safety (Amber's Angels) and community-driven car spotting.

## 👥 The AI Trinity
- **CMD Gemini (The Specialist):** Local execution, terminal debugging, real-time ML monitoring, and core gameplay implementation.
- **Browser Gemini (The Architect):** Oversees Supabase, high-level strategy, and project memory.
- **Claude Code (The Editor):** Deep code refactoring, schema migrations, complex state management, and UI/UX polish.

## 🕹️ Core Gameplay Mechanics
- **Dash Sentry:** Passive 2fps dashcam mode — corner brackets animate white→amber→green as confidence rises. Light haptic on probable, full haptic on catch.
- **360° Scan:** Walk-around parked car mode. Low-confidence result blocks capture; TRY AGAIN button required.
- **Identify Mini-game:** Multiple-choice mystery car quiz. Correctly-answered cards excluded from queue; full deck recycles when exhausted.
- **Road King:** Road segment territory with 30-day rolling scan counts.
- **Space Mode:** SGP4 satellite pass tracking, orbital boost on ISS catch.
- **Crews:** Initial D inspired teams with home turf XP bonuses.

## 🛠️ Technical Ground Truth
- **Storage:** All heavy ML assets MUST stay on `D:\Users\grant\Documents\ChaDongCha\ml`
- **Assets:** Game images on Cloudflare R2 — bucket `chadongcha-assets`, path `id_game/`
- **Compute:** Local training on AMD Radeon RX 5700 XT via `torch-directml`
- **ML venv:** `D:\Users\grant\Documents\ChaDongCha\ml\.venv310` (Python 3.10)
- **Backend:** Python 3.10 / FastAPI on Railway + Supabase (PostgreSQL + Auth + RLS)
- **Frontend:** Expo SDK 52 / React Native — dark mode, Initial D aesthetic, 900-weight bold typography

## 📋 Specialist Rules
1. **D: Drive First:** All heavy ML assets MUST stay on the D: drive.
2. **Data Flywheel:** Prioritize labeled data collection from community-verified, opted-in catches for model retraining (v0.3.0+).
3. **Fuzzy Logic:** Use Levenshtein-based fuzzy matching for all manual vehicle identifications.
4. **DirectML Awareness:** Be mindful of `aten::lerp` CPU fallbacks on the DML backend.

---

## 🖼️ Image Scraper — Status & Fix Guide

### Current State (April 2026)
The scraper at `ml/training/scrape_images.py` is **blocked by DuckDuckGo rate limiting**.

- Most vehicle classes already have **150 images** from prior runs
- Target is now **170 images per class** (extra 20 = rear-view images)
- Rear-view queries are **prepended** in `scrape_class()` so classes at 150 fill their next 20 slots with taillight/back-bumper photos first
- `_Background` negative class has been expanded from 8 → 44 diverse non-vehicle queries
- `2000 Toyota Sienna Van` class added with proper 1st-gen queries
- The scraper uses the `ddgs` package (already installed in `.venv310`): `from ddgs import DDGS`
- Inter-query sleep is currently 8s; failed query backoff is 15s — still getting 403s and timeouts

### Why It's Failing
DuckDuckGo's image search API (`/i.js`) returns HTTP 403 Ratelimit immediately, even with 8s gaps. This appears to be IP-level throttling that persists for hours after a burst. Timeouts happen when the connection is dropped entirely.

### Fix Options (try in order)

**Option 1 — Wait it out (simplest)**
Stop all scraper activity for 2-4 hours, then retry with the existing script. DDG rate limits reset after inactivity.
```
# Activate venv first
D:\Users\grant\Documents\ChaDongCha\ml\.venv310\Scripts\activate.bat

# Then run
python training\scrape_images.py
```

**Option 2 — Increase sleep further**
Edit `ml/training/scrape_images.py` line with `time.sleep(8)` → `time.sleep(20)` and failed query backoff `time.sleep(15)` → `time.sleep(45)`. Slower but less likely to trigger the block.

**Option 3 — Switch to Bing scraper**
The ddgs library actually tries Bing as a fallback engine (visible in logs: `response: https://www.bing.com/images/async... 200`). The issue is the library treats the Bing 200 response as a DDG failure. Consider using `requests` + Bing Images directly or a library like `icrawler`:
```bash
pip install icrawler
```
Then replace the `DDGS().images()` call with `BingImageCrawler` from icrawler.

**Option 4 — Use a VPN or different network**
The block is IP-based. Running from a different IP (mobile hotspot, VPN) often clears it immediately.

**Option 5 — Use a paid image API**
Bing Image Search API (Azure Cognitive Services) offers 1,000 free calls/month. Replace the DDG calls with the Bing API endpoint — this is the most reliable long-term solution.

### Scraper Goals
Once unblocked, the scraper needs to complete:
1. **Fill remaining classes to 170** — all classes currently at 150 need 20 more rear-view images
2. **New classes** — `2000 Toyota Sienna Van` (0 images currently)
3. **`_Background`** — fill to 170 using the 44 expanded queries (empty roads, interiors, nature, weather, crowds, etc.)

After scraping completes:
```bash
# Verify counts
python training\bootstrap.py --phase info

# Run training (AMD GPU)
python training\bootstrap.py --phase classify --epochs 50 --patience 10

# Export
python training\bootstrap.py --phase export

# Convert to TFLite
onnx2tf -i export/vehicle_classifier.onnx -o export/tflite_out --non_verbose
```

Then copy models to `mobile/assets/` and rebuild the app.

---

## 🎯 Alpha Blockers Remaining

| Item | Status |
|------|--------|
| Full model retrain (current 100+ class list, rear images) | Blocked on scraper |
| TestFlight + Play Store internal track | Ready once model is retrained |

## ✅ Recently Completed (this session)
- Auth rate limiting (slowapi, 5/min signup, 10/min signin)
- Account deletion endpoint (DELETE /auth/account)
- Privacy blur service (OpenCV Haar cascades, faces + plates, backend)
- Orbital boost rarity validation
- Identify mini-game queue fix (correct-only exclusion, full deck recycle)
- Dash Sentry bracket overlay + haptic on probable detections
- 360° tap-through bug fix (TRY AGAIN required on low confidence)
- Contribute photos upload fix (permanent path priority)
- id_game ONNX eval script (`ml/eval_id_game.py`)
- `_Background` expanded to 44 queries
- `2000 Toyota Sienna Van` added to CLASS_QUERIES
- Rear-view queries prepended in scraper (170 image target)

---
*Last updated: April 17, 2026*
