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
│   │                    leaderboard, market, uploads, community, shop, feed, boosts, crews
│   ├── services/        xp_service, notification_service, territory_service,
│   │                    first_finder_service, storage_service, privacy_blur_service,
│   │                    moderation_service, feed_service
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
│   │   └── vehicle-classifier/   Expo native module — MobileNetV3 CoreML (iOS) + TFLite (Android)
│   └── plugins/
│       └── withVehicleClassifier.js   prebuild: copies model + class_map into iOS/Android bundles
└── ml/
    ├── training/        bootstrap.py (local GPU), scrape_images.py (image scraper)
    ├── models/          best.pt checkpoint
    ├── eval_id_game.py  ONNX eval against id_game R2 dataset
    └── export/          vehicle_classifier.onnx + manifest.json
```

---

## Stack

**Backend:** FastAPI · Supabase (Postgres + Auth + RLS) · Railway · Cloudflare R2 · Expo Push API · Celestrak TLEs · slowapi (in-memory rate limiting) · OpenCV (privacy blur)
**Mobile:** Expo SDK 52 · Expo Router · React Query · Zustand · VisionCamera v4 · Mapbox
**ML:** MobileNetV3-Large fine-tuned locally (AMD GPU via torch-directml) · 100+ classes · CoreML `.mlpackage` (iOS) + TFLite float16 (Android) + ONNX
**CI:** GitHub Actions → EAS cloud builds (auto-trigger on push, cancels stale queue) · ruff + mypy + tsc on every push

---

## Game Modes

**Dash Sentry** — Mount your phone. Tap "I am a Passenger."
Snapshots at 2fps, CoreML/TFLite inference on every frame, catches vehicles automatically. Animated corner bracket overlay pulses white → amber → green as confidence rises. Light haptic on probable detections, full haptic on catch.

**360° Scan** — Walk around the car. Four anchors: front, passenger, rear, driver.
One snapshot per side, classifier runs on the front photo. All four photos saved locally in a swipeable viewer in your garage. Low-confidence result blocks the capture button — TRY AGAIN required.

**Identify** — A mystery car appears. What is it?
Multiple-choice with XP rewards. Sourced from the `id_game` dataset on R2. Correctly-answered cards are excluded from future queues; the full deck recycles when everything is solved.

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
│   ├── SentryOverlay — animated corner brackets, white/amber/green states
│   └── VehicleClassifierModule
│       ├── iOS: Swift + CoreML VNCoreMLRequest, center-crop preprocessing
│       └── Android: Kotlin + TFLite GPU delegate, center-crop, BGR→float32 [0,1]
│
├── 360° Scan (scan360.tsx)
│   ├── Four anchor captures — photo taken at each anchor
│   ├── Classify from FRONT photo with 15s timeout
│   ├── lowConfidence blocks capture; TRY AGAIN required
│   └── All 4 photos → documentDirectory/catch-photos/<catchId>/
│
├── Operations Tab (index.tsx) — HIGHWAY / SCAN 360° / IDENTIFY entry cards
│
├── Garage (garage.tsx) — 4-tab layout
│   ├── CATCHES    — grid view; long-press to sell to wholesaler
│   ├── COLLECTION — badge grid (40 badges, 5 categories)
│   ├── MARKET     — browse listings, bid with credits, sell to other players
│   └── SHOP       — buy XP Boost (2× / 60min), Scan Boost (30min), ID Hints
│
├── Feed (feed.tsx) — GLOBAL / MINE / ID NEEDED
│   └── ID NEEDED — unknown catch queue → community-id.tsx
│
└── catchStore (Zustand + AsyncStorage, offline-first)
    ├── addCatch() — queues locally; triggers syncPending()
    ├── Upload candidate: photoPaths[0] → photoPath → null (permanent path first)
    └── AppState 'active' listener retries unsynced catches on foreground

Backend (Railway)
├── FastAPI routers
│   ├── /auth          signup (rate-limited 5/min), signin (10/min), push token,
│   │                  DELETE /auth/account (full account + Supabase auth deletion)
│   ├── /catches       ingest, 3-tier dedup, XP, privacy blur (faces+plates), moderation
│   ├── /vehicles      resolve generation_id + rarity, recent sightings
│   ├── /territory     nearby road segments (GeoJSON), road leaderboard
│   ├── /satellites    upcoming passes (SGP4), orbital boost status
│   ├── /leaderboard   global + per-city XP rankings
│   ├── /players       stats, plate hashes (CRUD), first finder badges, public card
│   ├── /market        browse, bid, accept, cancel; wholesaler sell endpoint
│   ├── /shop          catalogue (GET), purchase (POST) — boosts + ID hints
│   ├── /boosts        activate orbital boost (rarity validated), boost status
│   ├── /feed          unified activity stream
│   ├── /uploads       R2 presigned PUT URL for opt-in scan photo contributions
│   ├── /community     unknown catch queue, ID suggestions, 3-vote auto-confirm
│   └── /crews         crew creation, membership, leaderboard
│
├── Services
│   ├── xp_service.py             non-linear levelling, orbital boost, diminishing returns
│   ├── notification_service.py   Expo Push — road king, level up, first finder, spotted
│   ├── territory_service.py      road king scan tracking + takeover logic
│   ├── first_finder_service.py   per-city first-catch badge awards
│   ├── storage_service.py        boto3 R2 — presign PUT, public CDN URL, up/download
│   ├── privacy_blur_service.py   OpenCV Haar cascades — blur faces + plates before community post
│   └── moderation_service.py     Google Vision SafeSearch (async background task)
│
└── Cloudflare R2
    ├── chadongcha-assets  — opt-in scan photos + community review + id_game images
    └── chadongcha-models  — ML model builds
```

---

## Credits & Shop

| Item | Price | Effect |
|------|-------|--------|
| XP Boost | 400 CR | 2× XP for 60 minutes (stacks with orbital boost) |
| Scan Boost | 250 CR | Lower classifier thresholds for 30 minutes |
| ID Hint | 75 CR | Reveal one wrong answer in Identify mini-game |

New accounts start with **100 CR**.

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

**Road King Takeover:** 300 XP · **First Finder:** permanent city badge · **Spotter Award:** 150 XP · **360° Bonus:** 1.5× base XP · **Diminishing returns:** same generation in 24hr window.

---

## Catch Dedup

1. **Hash** — SHA-256(plate) within 4hr window, ALPR confidence ≥ 85%
2. **Fuzzy** — same `generation_id` + `fuzzy_district`, 20 min (Dash Sentry), 3 min (360°)
3. **Scan360 gap** — can't walk around the same car twice in under 3 minutes

---

## Privacy

- **Plate text:** zeroed at ALPR boundary. One-way SHA-256 on-device only.
- **Location:** `fuzzy_city` and `fuzzy_district` only. No lat/lon on catch records.
- **360° photos:** stored in `documentDirectory`. Never uploaded unless user opts into "Contribute Scans."
- **Privacy blur:** backend OpenCV pass blurs faces + license plates before photos become community-visible.
- **Privacy Shield:** geometric overlay over windshield/window bands during Dash Sentry.

---

## ML

**Model:** MobileNetV3-Large fine-tuned on 100+ classes (~17,000+ images).

Target breakdown: 150 front/side images + 20 rear-view images per vehicle class, plus 44-query `_Background` negative class.

**Training pipeline:**

```bash
# 1. Create venv (Windows, Python 3.10)
py -3.10 -m venv .venv310
.venv310\Scripts\activate

# AMD GPU:
pip install torch torchvision torch-directml
# NVIDIA GPU:
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

pip install timm onnx onnxruntime ddgs requests Pillow

# 2. Scrape images (see GEMINI.md for rate-limiting workarounds)
python training\scrape_images.py --data-dir "D:\...\ml\data\images"

# 3. Verify dataset
python training\bootstrap.py --phase info

# 4. Train
python training\bootstrap.py --phase classify --epochs 50 --patience 10

# 5. Export to ONNX + CoreML
python training\bootstrap.py --phase export

# 6. Convert to TFLite (Windows)
pip install onnx2tf tensorflow-cpu tf_keras onnx-graphsurgeon sng4onnx onnxsim onnxslim psutil ai-edge-litert
onnx2tf -i export/vehicle_classifier.onnx -o export/tflite_out --non_verbose
# Use: export/tflite_out/vehicle_classifier_float16.tflite

# 7. Copy to mobile
cp -r ml/export/vehicle_classifier.mlpackage mobile/assets/
cp ml/export/tflite_out/vehicle_classifier_float16.tflite mobile/assets/vehicle_classifier.tflite
python -c "import json; m=json.load(open('ml/export/manifest.json')); print(json.dumps({str(i):c for i,c in enumerate(m['classes'])}, indent=2))" > mobile/assets/class_map.json

# 8. Deploy to R2
python ml\deploy_model.py --version X.Y.Z
# Then update MODEL_CURRENT_VERSION in Railway shared variables → redeploy api
```

**Evaluation against id_game dataset:**
```bash
python ml/eval_id_game.py --conf-threshold 0.6 --top-k 3
```

**Integration:**
- **iOS:** `VehicleClassifierModule.swift` — `VNCoreMLRequest` with center-crop.
- **Android:** `VehicleClassifierModule.kt` — TFLite `Interpreter` with GPU delegate.
- Both fall back to `VehicleClassifierStub` in dev/Expo Go.

---

## Environment Variables

| Variable | Where |
|----------|-------|
| `SUPABASE_URL` | backend + mobile |
| `SUPABASE_ANON_KEY` | mobile (public) |
| `SUPABASE_SERVICE_KEY` | backend only — legacy name, still read as fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only — preferred, bypasses RLS for workers/seeders |
| `MAPBOX_PUBLIC_TOKEN` | mobile runtime |
| `MAPBOX_DOWNLOADS_TOKEN` | Android Gradle build — EAS secret |
| `R2_ACCOUNT_ID` | backend only |
| `R2_ACCESS_KEY_ID` | backend only |
| `R2_SECRET_ACCESS_KEY` | backend only |
| `R2_PUBLIC_URL` | backend + EAS — CDN base URL, no trailing slash |
| `GOOGLE_CLOUD_VISION_KEY` | backend only — SafeSearch (optional, skipped if absent) |

---

## Running Locally

**Backend:**
```bash
cd backend
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Mobile:**
```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

---

## Status (April 20, 2026)

| Component | Status |
|-----------|--------|
| Supabase schema + RLS | ✅ |
| FastAPI: all routers (auth, catches, vehicles, territory, satellites, players, leaderboard, market, shop, uploads, community, feed, boosts, crews) | ✅ |
| Auth rate limiting (slowapi, in-memory, no Redis) | ✅ |
| Account deletion (DELETE /auth/account) | ✅ |
| Three-tier catch dedup | ✅ |
| Vehicle DB (~291 generations, 40 makes) | ✅ |
| EAS builds (iOS + Android, auto-trigger, cancels stale queue) | ✅ |
| Dash Sentry — bracket overlay, haptic on probable, white/amber/green states | ✅ |
| 360° Scan — low confidence blocks capture, TRY AGAIN required | ✅ |
| Identify mini-game (correct-only filter, full deck recycle) | ✅ |
| Feed (GLOBAL / MINE / ID NEEDED, unified event stream) | ✅ |
| Garage (grid, badges, market, shop tabs) | ✅ |
| Credits shop (XP Boost, Scan Boost, ID Hints) | ✅ |
| Orbital boost validation (rarity check on activate) | ✅ |
| Privacy blur (OpenCV, Haar cascades, faces + plates) | ✅ |
| Content moderation (Google Vision SafeSearch, async) | ✅ |
| Community ID (3-vote auto-confirm, retroactive XP) | ✅ |
| Ghost class pipeline (unknown vehicles → community votes → promotion_ready → next training run) | ✅ |
| Contribute photos fix (permanent path priority) | ✅ |
| iOS CoreML classifier | ✅ |
| Android TFLite classifier | ✅ (wired via Expo Modules) |
| ML eval script (ONNX, R2 id_game images, accuracy report) | ✅ |
| SAM optimizer + --freeze-backbone incremental class addition | ✅ |
| PostHog analytics — 20 events across mobile + backend, identify with username + provider | ✅ |
| Road King territory — AI ghost rivals seeded at launch | ✅ Carrollton / Atlanta / Johnson City TN |
| Satellite passes — 10k TLEs → SGP4 → 25,910 catchable_objects live | ✅ |
| Sat-worker batched upserts (500/req, Railway Cron safe) | ✅ |
| scripts/check.sh — local CI mirror (ruff + mypy + tsc) | ✅ |
| Full model retrain with current class list + rear images | 🔧 blocked on scraper |
| Image scraper (ddgs rate limiting — needs workaround) | 🔧 blocked |
| Onboarding tutorial / scripted walkthrough | 🔧 backlog (~3–4 days) |
| TestFlight + Play Store internal track | 🔧 soon |

---

## CI

**On every push to `main`:**
- `ci.yml` — backend ruff + mypy, mobile TypeScript check
- `eas-build.yml` — cancels stale preview builds, queues iOS + Android EAS preview builds

**Railway deployment** (3 services):
- `railway.toml` → api · `railway.sat.toml` → sat-worker · `railway.seeder.toml` → osm-seeder
- `MODEL_CURRENT_VERSION` is a Railway shared variable — update it after deploying a new model, then redeploy the api service

**Notes:**
- `npm ci --legacy-peer-deps` required in CI
- Railway `startCommand` must use `sh -c '...'` to expand `$PORT`
- Railway builds from repo root — `COPY` paths in `backend/Dockerfile` are prefixed with `backend/`
