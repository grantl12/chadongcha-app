# 차동차 · ChaDongCha

There's a GT-R idling at the light next to you. Pearl white. R35. You knew it by the stance before you read the badge — haunches set wide, front lip sitting low like it means it. The twin-turbo VR38 idles somewhere below the traffic noise, patient.

The light turns green. It's gone.

ChaDongCha is a street-level vehicle hunting game. An on-device classifier identifies what's rolling past — make, model, generation — and lets you catch it like a collectible. Every road you scan belongs to someone. Satellite passes drop orbital XP boosts. The first player to catch a generation in your city gets a badge that never expires.

It's Pokémon GO, but the rarest catch just pulled up next to you.

---

## Repository Layout

```
chadongcha/
├── backend/
│   ├── routers/         auth, catches, vehicles, territory, satellites, players,
│   │                    leaderboard, market, uploads, community, shop, feed
│   ├── services/        xp_service, notification_service, territory_service,
│   │                    first_finder_service, storage_service, moderation_service,
│   │                    feed_service
│   ├── workers/         satellite_tracker.py, osm_seeder.py
│   └── scripts/         seed_vehicles.py, seed_ai_rivals.py, seed_market.py
├── mobile/
│   ├── app/
│   │   ├── (tabs)/      index (Operations), garage, map, feed, profile
│   │   ├── highway.tsx  Dash Sentry — passive dashcam capture mode
│   │   ├── scan360.tsx  Active 360° parked vehicle scan (4 anchors)
│   │   ├── identify.tsx Identify mini-game — guess mystery cars, earn XP
│   │   ├── community-id.tsx  Crowd-sourced vehicle ID for unknown catches
│   │   ├── player/[id].tsx   Public shareable player card
│   │   ├── leaderboard.tsx
│   │   └── onboarding.tsx
│   ├── src/
│   │   ├── stores/      catchStore, playerStore, settingsStore, marketStore
│   │   ├── components/  GarageCarousel, Scan360PhotoViewer, PrivacyShield
│   │   ├── hooks/       useLocation, usePushNotifications
│   │   └── utils/       badges.ts, plateHash.ts, savePhotos.ts, uploadPhoto.ts, r2.ts
│   ├── modules/
│   │   └── vehicle-classifier/   Expo native module — MobileNetV3 CoreML + Vision
│   └── plugins/
│       └── withVehicleClassifier.js   prebuild: copies model + class_map into iOS bundle
└── ml/
    ├── training/        bootstrap.py (local GPU), scrape_images.py (DuckDuckGo)
    ├── models/          best.pt checkpoint
    └── export/          vehicle_classifier.onnx + manifest.json
```

---

## Stack

**Backend:** FastAPI · Supabase (Postgres + Auth + RLS) · Railway · Cloudflare R2 · Expo Push API · Celestrak TLEs  
**Mobile:** Expo SDK 52 · Expo Router · React Query · Zustand · VisionCamera v4 · Mapbox  
**ML:** MobileNetV3-Large fine-tuned locally (AMD GPU via torch-directml) · 63 classes · CoreML `.mlpackage` (iOS) + TFLite float16 (Android) + ONNX  
**CI:** GitHub Actions → EAS cloud builds (auto-trigger on push, cancels stale build queue) · ruff + mypy + tsc on every push

---

## Game Modes

**Dash Sentry** — Mount your phone. Tap "I am a Passenger."  
Snapshots at 2fps, CoreML inference on every frame, catches vehicles automatically. A color-coded radar dot pulses in the corner: green on a catch, blue when orbital boost is active, red when idle. XP stacks up while the highway blurs past.

**360° Scan** — Walk around the car. Four anchors: front, passenger, rear, driver.  
One snapshot per side, classifier runs on the front photo. All four photos saved locally in a swipeable viewer in your garage. Highest-confidence catches in the game — built for car shows, parking lots, and the Ferrari outside the hotel.

**Identify** — A mystery car appears. What is it?  
Tap the correct make/model from four options. Correct answers earn XP. Wrong answers cost nothing — just move on. New cars surface from the community's unknown catch queue.

**Road King** — Every road segment is territory, and right now someone else owns yours.  
The player with the most scans in 30 days holds the crown. Ghost kings seed the map from day one so no road is unclaimed at launch — but they're easy to beat.

**Space Mode** — The ISS just crested the horizon. You have four minutes.  
Live TLE data from Celestrak, SGP4 propagation, push notification 5 minutes before each pass. Catch it and activate **Orbital Boost** — an XP multiplier on every vehicle catch for the next hour.

---

## Architecture

```
On-Device (React Native)
│
├── Dash Sentry (highway.tsx)
│   ├── VisionCamera preview at 2fps → takePhoto() → classify(imagePath)
│   ├── RadarDot — animated pulsing ring, color: green/blue/red
│   └── VehicleClassifierModule (Swift + CoreML + Vision framework)
│       ├── Loads MobileNetV3 .mlpackage from iOS bundle at startup
│       ├── VNCoreMLRequest with centerCrop preprocessing
│       └── Returns { make, model, generation, confidence } via Promise
│
├── 360° Scan (scan360.tsx)
│   ├── Four anchor captures — photo taken at each anchor
│   ├── Classify from FRONT photo with 15s timeout
│   └── All 4 photos copied to documentDirectory/catch-photos/<catchId>/
│
├── Operations Tab (index.tsx)
│   ├── Entry point: HIGHWAY, SCAN 360°, IDENTIFY
│   └── Orbital boost + scan boost HUD pills
│
├── Garage (garage.tsx) — 4-tab layout
│   ├── CATCHES    — grid view; long-press any catch to sell to wholesaler
│   ├── COLLECTION — badge grid (40 badges, 5 categories); master progress bar
│   ├── MARKET     — browse listings, bid with credits, sell to other players
│   └── SHOP       — buy XP Boost (2× / 60min), Scan Boost (30min), ID Hints
│
├── Feed (feed.tsx) — GLOBAL / MINE / ID NEEDED
│   ├── GLOBAL / MINE — unified activity stream: catches, road kings, level-ups,
│   │                   first finders, market sales (GET /feed/activities)
│   └── ID NEEDED — unknown catch queue → community-id.tsx
│
├── Privacy Shield  — geometric overlay on windshield/window bands (Dash Sentry)
├── Plate Hash      — opt-in SHA-256 on-device; used for dedup + spotter award
│
└── catchStore (Zustand + AsyncStorage, offline-first)
    ├── addCatch() — queues locally; triggers syncPending()
    ├── resolveGenerationId() → GET /vehicles/resolve
    ├── uploadPhoto() → GET /uploads/presign → PUT to R2 (opt-in only)
    ├── POST /catches → XP, level-up, road king, orbital boost, first finder
    └── AppState 'active' listener retries unsynced catches on foreground

Backend (Railway)
├── FastAPI routers
│   ├── /auth          signup (100 CR welcome bonus), signin, push token
│   ├── /catches       ingest, 3-tier dedup, XP, road king, feed events, moderation
│   ├── /vehicles      resolve generation_id + rarity, recent sightings
│   ├── /territory     nearby road segments (GeoJSON), road leaderboard
│   ├── /satellites    upcoming passes (SGP4), orbital boost status
│   ├── /leaderboard   global + per-city XP rankings
│   ├── /players       stats, plate hashes (CRUD), first finder badges, public card
│   ├── /market        browse, bid, accept, cancel; wholesaler sell endpoint
│   ├── /shop          catalogue (GET), purchase (POST) — boosts + ID hints
│   ├── /feed          unified activity stream (GET /feed/activities)
│   ├── /uploads       R2 presigned PUT URL for opt-in scan photo contributions
│   └── /community     unknown catch queue, ID suggestions, 3-vote auto-confirm
│
├── Services
│   ├── xp_service.py            non-linear levelling, orbital boost, diminishing returns
│   ├── notification_service.py  Expo Push — road king, level up, first finder, spotted
│   ├── territory_service.py     road king scan tracking + takeover logic
│   ├── first_finder_service.py  per-city first-catch badge awards
│   ├── storage_service.py       boto3 R2 client — presign PUT + public CDN URL
│   ├── moderation_service.py    Google Vision SafeSearch (async background task)
│   └── feed_service.py          write_event() — catch/road_king/level_up/first_finder/market_sale
│
├── Workers
│   ├── satellite_tracker.py  polls Celestrak TLEs, computes SGP4 passes, push notify
│   └── osm_seeder.py         Overpass API → road_segments (14 cities)
│
└── Cloudflare R2
    ├── chadongcha-assets  — opt-in scan photos (contributeScans) + community review
    └── chadongcha-models  — ML model builds
```

---

## Credits & Shop

Players earn **credits (CR)** by catching vehicles and selling them. Spend them in the shop or the market.

**Earning credits:**
- Every catch awards a small passive credit drip
- Sell to wholesaler: common 10 CR → legendary 3,000 CR
- Sell on the market: whatever the buyer bids

**Shop items:**

| Item | Price | Effect |
|------|-------|--------|
| XP Boost | 400 CR | 2× XP multiplier for 60 minutes (stacks with orbital boost) |
| Scan Boost | 250 CR | Lowers classifier thresholds for 30 minutes — easier catches |
| ID Hint | 75 CR | Reveals one wrong answer in the Identify mini-game |

New accounts start with **100 CR** to explore the shop before their first catch.

---

## Badge System

40 badges across 5 categories, computed client-side from catch history (zero network):

| Category | Examples |
|----------|---------|
| Enthusiast | Domestic Muscle, Holy Trinity, Unplugged |
| Style | Convertible Club, Truck Nuts, Hot Hatch |
| Rarity | Legendary Spotter, Epic Haul, Rare Find |
| Decade | Y2K Survivor, Retro Ride, Modern Classic |
| Collection | Ford Family, Toyota Faithful, Maker's Mark |

Roadmap target: 80–100+ badges for completionists.

---

## Activity Feed

`GET /feed/activities` returns a unified event stream across all event types:

| Event | Trigger |
|-------|---------|
| `catch` | Any non-duplicate vehicle or space catch |
| `road_king` | Player claims a new road segment |
| `level_up` | Player levels up |
| `first_finder` | Player earns a first-finder badge |
| `market_sale` | A market listing is accepted |

Feed items are color-coded by event type and rarity. GLOBAL tab shows all players; MINE tab filters to the logged-in player.

---

## Content Moderation

Community photos (contributed via "Contribute Scans" opt-in) go through Google Cloud Vision SafeSearch before becoming publicly visible.

- Photo lands with `photo_shared = false`, `moderation_status = 'pending'`
- A FastAPI `BackgroundTask` fires after the catch response returns — non-blocking
- SafeSearch likelihood ≥ POSSIBLE on adult/violence/racy → `rejected`; photo stays hidden
- No API key configured → `skipped`; photo is surfaced (dev-safe fallback)
- Set `GOOGLE_CLOUD_VISION_KEY` in Railway environment to enable in production

---

## Community ID

Unknown catches (no resolved `generation_id`) surface in the Feed's **ID NEEDED** tab.

1. Player submits a suggestion (make, model, generation)
2. Backend resolves the text to a `generation_id` via fuzzy DB lookup
3. At 3 agreeing votes the catch auto-confirms — `catches.generation_id` backfilled, original catcher receives retroactive XP

---

## XP & Progression

| Levels | XP per level |
|--------|-------------|
| 1–5 | 500 |
| 6–10 | 1,000 |
| 11–20 | 4,000 |
| 21–35 | 10,000 |
| 36–50 | 50,000 |
| 51+ | 200,000 |

**Orbital Boost** (space catches):

| Rarity | Multiplier | Duration |
|--------|-----------|----------|
| Common | 1.25× | 20 min |
| Rare | 1.5× | 30 min |
| Epic | 1.75× | 45 min |
| Legendary | 2.0× | 60 min |

Orbital boost and shop XP boost multiply together (max 4× with both active).

**Road King Takeover:** 300 XP on displacement.  
**First Finder:** permanent city badge.  
**Spotter Award:** 150 XP when your catch matches another player's opt-in plate hash.  
**360° Bonus:** 1.5× base XP multiplier.  
**Diminishing returns:** same generation caught multiple times in a 24hr window.

---

## Catch Dedup

1. **Hash** — SHA-256(plate) within 4hr window, only when ALPR confidence ≥ 85%
2. **Fuzzy** — same `generation_id` + `fuzzy_district`, 20 min window (highway), 3 min (360°)
3. **Scan360 gap** — physically can't walk around the same car twice in under 3 minutes

Duplicate catches are still recorded — it's a real sighting — just no XP.

---

## Privacy

- **Plate text:** zeroed at ALPR module boundary. One-way SHA-256 on-device only.
- **Location:** `fuzzy_city` and `fuzzy_district` only. No lat/lon on catch records.
- **360° photos:** stored in `documentDirectory`. Never uploaded unless the user opts into "Contribute Scans."
- **Privacy Shield:** geometric overlay over windshield and window bands during Dash Sentry.
- **Plate hash opt-in:** 100% user-driven. Raw plate never leaves the phone.

---

## ML

**Model:** MobileNetV3-Large fine-tuned on 63 classes (~9,450 images from DuckDuckGo).

**Classes:** 47 passenger cars + 7 trucks + 7 motorcycles + 1 `_Background` (negative class — teaches the model to output low confidence on non-vehicle inputs, preventing softmax from always forcing a winner).

**Current version:** v0.2.0 · val_acc 0.8738

**Training pipeline:**

```bash
# 1. Create venv and install deps (Windows — use ml/.venv310)
py -3.10 -m venv .venv310
.venv310\Scripts\activate

# NVIDIA:  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
# AMD:     pip install torch torchvision torch-directml
pip install timm onnx onnxruntime duckduckgo_search requests Pillow

# 2. Scrape images (~15-30 min)
python training\scrape_images.py --data-dir "D:\path\to\ml\data\images"

# 3. Verify dataset (expect 63 classes)
python training\bootstrap.py --phase info

# 4. Train (early-stops after --patience epochs without improvement)
python training\bootstrap.py --phase classify --epochs 50 --patience 10 \
  --data-dir "D:\path\to\ml\data\images"

# 5. Resume if interrupted
python training\bootstrap.py --phase classify --epochs 20 --resume

# 6. Export to ONNX + CoreML (.mlpackage — macOS/Linux only for CoreML)
python training\bootstrap.py --phase export

# 7. Convert ONNX → TFLite (Windows, uses ml/.venv310 with onnx2tf + tensorflow-cpu)
pip install onnx2tf tensorflow-cpu tf_keras onnx-graphsurgeon sng4onnx onnxsim onnxslim psutil ai-edge-litert
onnx2tf -i export/vehicle_classifier.onnx -o export/tflite_out --non_verbose
# Use export/tflite_out/vehicle_classifier_float16.tflite

# 8. Deploy to R2 and activate
python ml\deploy_model.py --version X.Y.Z
# Then update MODEL_CURRENT_VERSION in Railway shared variables → redeploy api
```

**After retraining — copy models into mobile/assets:**
```bash
cp -r ml/export/vehicle_classifier.mlpackage mobile/assets/
cp ml/export/tflite_out/vehicle_classifier_float16.tflite mobile/assets/vehicle_classifier.tflite
python -c "import json; m=json.load(open('ml/export/manifest.json')); print(json.dumps({str(i):c for i,c in enumerate(m['classes'])}, indent=2))" > mobile/assets/class_map.json
```
Both model files are tracked in git (~8 MB each). The `withVehicleClassifier` Expo plugin copies them into the native projects during `expo prebuild`.

**Integration:**
- **iOS:** `VehicleClassifierModule.swift` loads `.mlmodelc` (Xcode-compiled from `.mlpackage`) via `VNCoreMLRequest` with center-crop preprocessing.
- **Android:** `VehicleClassifierModule.kt` loads `vehicle_classifier.tflite` from Android assets via TFLite `Interpreter` with GPU delegate.
- Both modules return `{ make, model, generation, confidence }` and fall back to `VehicleClassifierStub` when unavailable (Expo Go / dev).

---

## AI Rival Road Kings

Ghost kings seed cities before real players arrive so the map feels alive from day one.

```bash
python scripts/seed_ai_rivals.py --city "Los Angeles" --density 0.30
python scripts/seed_ai_rivals.py --city Carrollton --density 0.30
python scripts/seed_ai_rivals.py --city "Johnson City" --density 0.30
```

- Seeds ~30% of road segments per city (configurable via `--density`)
- 5 archetype rivals per city, deterministic names/XP from city name
- King scan counts set low enough to beat in one session (3–15 scans)
- Ghost kings never reclaim territory after displacement
- `is_ai_rival = true` on `players` table — excluded from leaderboards and feed

---

## Environment Variables

| Variable | Where |
|----------|-------|
| `SUPABASE_URL` | backend + mobile |
| `SUPABASE_ANON_KEY` | mobile (public) |
| `SUPABASE_SERVICE_KEY` | backend only — bypasses RLS |
| `MAPBOX_PUBLIC_TOKEN` | mobile runtime (`pk.`) |
| `MAPBOX_DOWNLOADS_TOKEN` | Android Gradle build (`sk.`) — EAS secret |
| `R2_ACCOUNT_ID` | backend only |
| `R2_ACCESS_KEY_ID` | backend only |
| `R2_SECRET_ACCESS_KEY` | backend only |
| `R2_PUBLIC_URL` | backend + EAS — public CDN base URL, no trailing slash |
| `GOOGLE_CLOUD_VISION_KEY` | backend only — SafeSearch moderation (optional, skipped if absent) |

Backend vars → Railway service environment. Mobile vars → `eas env:create --scope project --environment preview/production`.

---

## Running Locally

> **Windows note:** use `.venv\Scripts\activate` (not `source .venv/bin/activate`). Python 3.10 is required for the backend — use `py -3.10 -m venv .venv`.

**Backend:**
```bash
cd backend
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` at minimum. All other vars have safe defaults for local dev.

**Mobile:**
```bash
cd mobile
npm install --legacy-peer-deps   # --legacy-peer-deps required due to peer dep conflicts
npx expo start
```

**Workers:**
```bash
# from backend/ with venv active
python workers/osm_seeder.py                              # seed road segments (14 cities)
python workers/satellite_tracker.py                       # continuous pass computation
python scripts/seed_ai_rivals.py --city Seoul --density 0.30
python scripts/seed_market.py                             # seed initial market listings
```

---

## Status

| Component | Status |
|-----------|--------|
| Supabase schema + RLS | ✅ |
| FastAPI: auth, catches, XP, territory, satellites, players, leaderboard | ✅ |
| FastAPI: market, shop, uploads, community, feed | ✅ |
| Three-tier catch dedup (hash → fuzzy → scan360 gap) | ✅ |
| Vehicle DB (~291 generations, 40 makes) | ✅ |
| EAS builds (iOS + Android, auto-trigger on push, cancels stale queue) | ✅ |
| Operations tab (HIGHWAY / 360° / IDENTIFY entry cards) | ✅ |
| Dash Sentry HUD (animated radar dot, color-coded, scan boost pill) | ✅ |
| Feed tab (GLOBAL / MINE unified event stream, ID NEEDED tab) | ✅ |
| Activity feed feeder (catch / road_king / level_up / first_finder / market_sale) | ✅ |
| Garage tab (grid view, COLLECTION badges, MARKET tab, SHOP tab) | ✅ |
| Wholesaler sell mechanic (long-press → confirm → credits) | ✅ |
| Credits shop (XP Boost, Scan Boost, ID Hints) | ✅ |
| 100 CR welcome bonus on signup | ✅ |
| Market seed script (AI seller listings) | ✅ |
| 360° photo viewer (local on-device, swipeable 4-angle) | ✅ |
| Badge engine (40 badges, 5 categories, client-side) | ✅ |
| Market (browse / bid / sell / accept, atomic ownership transfer) | ✅ |
| Community ID screen (photo, vote tally, suggestion, 3-vote auto-confirm) | ✅ |
| Content moderation (Google Vision SafeSearch, async background task) | ✅ |
| Public player card + native share | ✅ |
| Identify mini-game (haptic feedback, XP rewards) | ✅ — image sourcing TBD |
| Signup — no email verification, auto sign-in after account creation | ✅ |
| Roads / territory map (Mapbox LineLayer, road king sheet) | ✅ |
| Satellite tab (pass list, countdown, CATCH button, orbital boost) | ✅ |
| Profile (level progress, boost banners, plates, Contribute Scans opt-in) | ✅ |
| Onboarding (splash → auth → permissions) | ✅ |
| Leaderboard (global + city tabs, YOU highlight) | ✅ |
| OSM road seeder (14 cities) | ✅ |
| Satellite tracker worker (SGP4, push notify on approach) | ✅ |
| Push notifications (road king, level up, first finder, spotted, boost) | ✅ |
| AI rival Road Kings (seed script, ghost territory) | ✅ |
| Privacy Shield (geometric overlay, Dash Sentry only) | ✅ |
| Plate hash opt-in (on-device SHA-256, spotter award) | ✅ |
| ML training pipeline (63 classes, early stopping, DuckDuckGo scraper) | ✅ |
| ONNX export | ✅ |
| CoreML export (.mlpackage) + iOS Swift native module (VNCoreMLRequest) | ✅ |
| TFLite float16 export + Android Kotlin native module (GPU delegate) | ✅ |
| Model deploy script (zip + R2 upload + version bump) | ✅ |
| Identify image sourcing (training data or public domain replacement for Reddit) | 🔧 in progress |
| TestFlight + Play Store internal track | 🔧 soon |

---

## CI

**On every push to `main`:**
- `ci.yml` — backend ruff + mypy, mobile TypeScript check
- `eas-build.yml` — cancels stale preview builds, then queues iOS + Android EAS preview builds

**Required GitHub secrets** (in `grantl12/chadongcha-app` → Settings → Secrets):
- `EXPO_TOKEN` — EAS authentication token (from expo.dev → Account Settings → Access Tokens)

**Railway deployment** (3 services, all watching `grantl12/chadongcha-app`):
- `railway.toml` → api service
- `railway.sat.toml` → sat-worker service  
- `railway.seeder.toml` → osm-seeder service
- `MODEL_CURRENT_VERSION` is a Railway shared variable — update it after deploying a new model, then redeploy the api service

**Notes:**
- `npm ci --legacy-peer-deps` is required in CI — plain `npm ci` fails due to peer dep conflicts in the Expo/Mapbox/VisionCamera combination
- Railway `startCommand` strings must use `sh -c '...'` to expand `$PORT`
- Railway builds with repo root as Docker build context — all `COPY` paths in `backend/Dockerfile` are prefixed with `backend/`
