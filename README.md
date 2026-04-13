# 차동차 · ChaDongCha

There's a GT-R idling at the light next to you. You have three seconds.

ChaDongCha is a street-level vehicle hunting game. A CoreML classifier runs on-device, identifies what's rolling past — make, model, generation — and lets you catch it like a collectible. Every street you scan belongs to someone. Satellite passes drop orbital boosts. The first player to catch a generation in your city gets a badge that never expires.

It's Pokémon GO, but the rarest catch just pulled up next to you.

---

## Repository Layout

```
chadongcha/
├── backend/
│   ├── routers/         auth, catches, vehicles, territory, satellites, players, leaderboard
│   ├── services/        xp_service, notification_service, territory_service, first_finder_service
│   ├── workers/         satellite_tracker.py, osm_seeder.py
│   ├── scripts/         seed_vehicles.py, seed_ai_rivals.py
│   └── migrations/      001 – 004 (run in order via Supabase SQL editor)
├── mobile/
│   ├── app/
│   │   ├── (tabs)/      radar, garage, map, feed, profile
│   │   ├── highway.tsx  Dash Sentry — passive dashcam capture mode
│   │   ├── scan360.tsx  Active parked vehicle scan
│   │   ├── leaderboard.tsx
│   │   └── onboarding.tsx
│   ├── src/
│   │   ├── stores/      catchStore (offline-first), playerStore, settingsStore
│   │   ├── hooks/       useLocation, usePushNotifications
│   │   ├── components/  GarageCarousel, PrivacyShield
│   │   ├── utils/       plateHash.ts
│   │   └── modules/     vehicle-classifier (stub + native CoreML interface)
│   ├── modules/
│   │   └── vehicle-classifier/   Expo native module — MobileNetV3 CoreML + Vision
│   └── plugins/
│       └── withVehicleClassifier.js   prebuild: copies model into iOS bundle
└── ml/
    ├── training/        bootstrap.py (local GPU training via torch-directml)
    ├── models/          best.pt (MobileNetV3, 92.6% val_acc, 30 classes)
    └── export/          vehicle_classifier.mlpackage + .onnx + manifest.json
```

---

## Stack

**Backend:** FastAPI · Supabase (Postgres + Auth + RLS) · Railway · Expo Push API · Celestrak TLEs  
**Mobile:** Expo SDK 52 · Expo Router · React Query · Zustand · VisionCamera v4 · Mapbox (`@rnmapbox/maps ~10.2.10`)  
**ML:** MobileNetV3-Large fine-tuned locally (AMD GPU via torch-directml) · 92.6% val_acc · 30 classes · exported to CoreML `.mlpackage` (iOS) + ONNX  
**CI:** GitHub Actions → EAS cloud builds (auto-trigger on push, cancels stale queue)

---

## Game Modes

**Dash Sentry** — Mount your phone. Tap "I am a Passenger." Drive.  
The app snapshots the camera at 2fps, runs CoreML inference on every frame, and catches vehicles automatically. Nothing to tap. No HUD to stare at. Just a red radar dot pulsing in the corner and XP stacking up while the highway blurs past. Ghost kings already own every road — go take them back.

**360° Scan** — Walk around the car. Four anchors: front, passenger, rear, driver.  
One snapshot per side, then the model classifies from the final frame. Highest confidence catches in the game. Built for car shows, parking lots, and the Ferrari you spotted outside the hotel.

**Road King** — Every road segment is territory, and right now someone else owns yours.  
The player with the most scans in 30 days holds the crown. Unclaimed roads glow dim on the map. Yours glow red. Take enough roads in a city and your name shows up on the leaderboard. Ghost kings seed the map from day one so it never feels empty — but they're easy to beat. Real players aren't.

**Space Mode** — The ISS just crested the horizon. You have four minutes.  
Live TLE data from Celestrak, SGP4 propagation, push notification 5 minutes before each pass. Catch it and activate **Orbital Boost** — an XP multiplier on every vehicle catch for the next hour. Miss the window and it's gone until the next orbit.

---

## Architecture

```
On-Device (React Native)
│
├── Dash Sentry (highway.tsx)
│   ├── VisionCamera preview at 2fps → takePhoto() → classify(imagePath)
│   └── VehicleClassifierModule (Swift + CoreML + Vision framework)
│       ├── Loads MobileNetV3 .mlpackage from iOS bundle at startup
│       ├── VNCoreMLRequest with centerCrop preprocessing
│       └── Returns { make, model, generation, confidence } via Promise
│
├── 360° Scan (scan360.tsx)
│   ├── Four anchor captures → final frame classify with 15s timeout
│   └── Same VehicleClassifierModule pipeline
│
├── Privacy Shield  — geometric overlay on windshield/window bands (Dash Sentry only)
├── Plate Hash      — opt-in SHA-256 on-device; hash used for dedup + spotter award
│                     Plate text never stored or transmitted
│
└── catchStore (Zustand + AsyncStorage, offline-first)
    ├── addCatch() queues locally, triggers syncPending()
    ├── resolveGenerationId() → GET /vehicles/resolve
    ├── POST /catches → XP, level-up, road king, orbital boost, first finder, plate match
    └── AppState 'active' listener retries unsynced catches on foreground

Backend (Railway — https://chadongcha-production.up.railway.app)
├── FastAPI routers
│   ├── /auth          signup, signin, push token registration
│   ├── /catches       ingest, 3-tier dedup, XP, road king, notifications
│   ├── /vehicles      resolve generation_id + rarity, recent sightings
│   ├── /territory     nearby road segments (GeoJSON), road leaderboard
│   ├── /satellites    upcoming passes (SGP4), orbital boost status
│   ├── /leaderboard   global + per-city XP rankings
│   └── /players       stats, plate hashes (CRUD), first finder badges
│
├── Services
│   ├── xp_service.py            non-linear levelling, orbital boost, diminishing returns
│   ├── notification_service.py  Expo Push — road king, level up, first finder, spotted
│   ├── territory_service.py     road king scan tracking + takeover logic
│   └── first_finder_service.py  per-city first-catch badge awards
│
└── Workers
    ├── satellite_tracker.py  polls Celestrak TLEs, computes SGP4 passes, push notify
    └── osm_seeder.py         Overpass API → road_segments (14 cities)
```

---

## XP & Progression

Non-linear level bands:

| Levels | XP per level |
|--------|-------------|
| 1–5    | 500         |
| 6–10   | 1 000       |
| 11–20  | 4 000       |
| 21–35  | 10 000      |
| 36–50  | 50 000      |
| 51+    | 200 000     |

**Orbital Boost** from space catches:

| Rarity    | Multiplier | Duration |
|-----------|-----------|----------|
| Common    | 1.25×     | 30 min   |
| Rare      | 1.5×      | 60 min   |
| Epic      | 1.75×     | 90 min   |
| Legendary | 2.0×      | 120 min  |

**Road King Takeover:** 300 XP on first successful displacement.  
**First Finder:** badge awarded to the first player to catch a generation in their city.  
**Spotter Award:** 150 XP when your catch matches another player's opt-in plate hash.

Diminishing XP applies when catching the same generation multiple times in a 24hr window — farms are real, this is the backstop.

---

## Catch Dedup

Three tiers, applied in order:

1. **Hash** — SHA-256(plate) within 4hr window, only when plate ALPR confidence ≥ 85%
2. **Fuzzy** — same `generation_id` + `fuzzy_district`, 20 min window (Dash Sentry), 3 min (360° Scan)
3. **Scan360 gap** — physically can't walk around the same car twice in under 3 minutes

Duplicate catches are still recorded — it's a real sighting — just no XP.

---

## Privacy

- **Plate text:** zeroed at ALPR module boundary. One-way SHA-256 on-device only.
- **Location:** `fuzzy_city` and `fuzzy_district` only. No lat/lon on catch records. Geocoding throttled to once per 500m of movement.
- **Privacy Shield:** geometric overlay over windshield and window bands during Dash Sentry. Future: real-time face detection bounding boxes.
- **Plate hash opt-in:** 100% user-driven. App hashes on-device before transmitting. Raw plate never leaves the phone.

---

## ML

**Model:** MobileNetV3-Large fine-tuned on 30 vehicle generation classes (~3,600 images).  
**Training:** Local GPU via `torch-directml` (AMD RX 5700 XT). 92.6% val_acc at epoch 25 on a 80/20 split. Training script: `ml/training/bootstrap.py`.  
**Export:** PyTorch → CoreML `.mlpackage` via `coremltools` (iOS Neural Engine) + ONNX.  
**Integration:** `VehicleClassifierModule` (Swift, Expo Modules API) loads the model at startup, runs `VNCoreMLRequest` on each snapshot, and resolves a Promise back to JS.  
**Stub:** `VehicleClassifierStub` (weighted random from full vehicle catalog, volume-weighted by annual sales) is auto-selected in dev builds when the native module is absent.

To retrain:

```bash
# Train (Windows, AMD GPU)
python ml/training/bootstrap.py --phase classify --epochs 50

# Resume from checkpoint
python ml/training/bootstrap.py --phase classify --epochs 20 --resume

# Export (generates .mlpackage + .onnx)
python ml/training/bootstrap.py --phase export
```

---

## AI Rival Road Kings

Ghost kings seed cities before real players arrive so the map feels alive from day one.

```bash
python scripts/seed_ai_rivals.py --city Seoul --density 0.30
python scripts/seed_ai_rivals.py --city "Los Angeles" --dry-run
```

- Seeds ~30% of road segments per city (configurable via `--density`)
- 5 archetype rivals per city, names/XP seeded deterministically from city name
- King scan counts set low enough to beat in one session (3–15 scans)
- Ghost kings never reclaim territory after displacement
- `is_ai_rival = true` on `players` table — excluded from leaderboards and feed

---

## Database Migrations

Run in order via Supabase SQL editor:

| Migration | What it adds |
|-----------|--------------|
| `001_road_segments_geometry.sql` | `centroid_lat/lon`, `geometry_json` on `road_segments`; `expo_push_token` on `players` |
| `004_plate_hashes.sql` | `plate_hashes` + `spotted_events` tables, RLS, `plate_hash_idx` |

Vehicle database: ~291 generations across ~40 makes. Seed via `backend/scripts/seed_vehicles.py`.

---

## Environment Variables

| Variable | Where |
|----------|-------|
| `SUPABASE_URL` | backend + mobile |
| `SUPABASE_ANON_KEY` | mobile (public) |
| `SUPABASE_SERVICE_KEY` | backend only — bypasses RLS |
| `MAPBOX_PUBLIC_TOKEN` | mobile runtime (`pk.`) — set in EAS for each env |
| `MAPBOX_DOWNLOADS_TOKEN` | Android Gradle build (`sk.`) — EAS secret |

Backend vars → Railway project settings. Mobile vars → `eas env:create --scope project --environment preview/production`.

---

## Running Locally

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Mobile:**
```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

**Workers:**
```bash
python workers/osm_seeder.py                              # seed all 14 cities
python workers/satellite_tracker.py                       # continuous pass computation
python scripts/seed_ai_rivals.py --city Seoul --density 0.30
```

---

## Status

| Component | Status |
|-----------|--------|
| Supabase schema + RLS | ✅ |
| FastAPI: auth, catches, XP, territory, satellites, players, leaderboard | ✅ |
| Three-tier catch dedup (hash → fuzzy → scan360 gap) | ✅ |
| Vehicle DB (~291 generations, 40 makes) | ✅ |
| EAS builds (iOS + Android, auto-trigger on push, cancels stale queue) | ✅ |
| Feed tab (date sections, GLOBAL/MINE, rarity colors, space catches) | ✅ |
| Garage tab (3D coverflow carousel, rarity cards, XP badge, first finder) | ✅ |
| Vehicle detail page (personal stats, recent sightings, rarity tint) | ✅ |
| Roads / territory map (Mapbox LineLayer, road king sheet, claim progress) | ✅ |
| Radar tab (satellite list, countdown, CATCH button, orbital boost) | ✅ |
| Profile screen (level progress, boost banner, plates, settings) | ✅ |
| Onboarding (splash → auth → permissions) | ✅ |
| Leaderboard (global + city tabs, YOU highlight) | ✅ |
| OSM road seeder (14 cities) | ✅ |
| Satellite tracker worker (SGP4, push notify on approach) | ✅ |
| XP feedback loop (catch sync → applyXp → level-up banner) | ✅ |
| Orbital Boost (space catch → multiplier, amber HUD pill) | ✅ |
| Push notifications (road king, level up, first finder, spotted, boost) | ✅ |
| AI rival Road Kings (seed script, ghost territory) | ✅ |
| Privacy Shield (geometric overlay, Dash Sentry only) | ✅ |
| Plate hash opt-in (on-device SHA-256, spotter award) | ✅ |
| fuzzyDistrict dedup (reverse geocode, 500m throttle) | ✅ |
| Dash Sentry safety interstitial (App Store compliant) | ✅ |
| MobileNetV3 training (30 classes, 92.6% val_acc, local AMD GPU) | ✅ |
| CoreML export (.mlpackage in repo, ready for iOS bundle drop-in) | ✅ |
| CoreML native module (Swift, Expo Modules API, VNCoreMLRequest) | 🔧 needs EAS build with .mlpackage wired in |
| iOS Mapbox (token in Info.plist, needs new build) | 🔧 awaiting EAS build |
| TFLite Android classifier | 🔧 after iOS is validated |
| Privacy Shield face detection (real bounding boxes) | 🔧 backlog |
| Privacy Shield surface projection (windows/windshield AR) | 🔧 backlog |
| 3D glTF garage rendering | 🔧 backlog |
| Community unknown-vehicle ID flow | 🔧 backlog |
| TestFlight + Play Store internal track | 🔧 soon |

---

## CI

EAS builds trigger automatically on every push to `main`. A `cancel-pending` job runs first and kills any queued or in-progress preview builds before queuing new ones — keeps the free-tier build queue clean.

Type-checking: `mypy backend/`. Lint: `ruff check backend/`.
