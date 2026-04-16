# 차동차 CHADONGCHA
## Engineering Brief v2.0 · Confidential

**Version:** 2.0 — Full Build Brief
**Platform:** iOS + Android (React Native / Expo)
**Status:** Ready for Engineering
**Classification:** Confidential

---

## 1. Product Vision

Chadongcha (차동차) is a real-world vehicle collection game. Players capture vehicles they encounter in daily life using their phone camera — building a digital garage of collectibles tied to real sightings. It is Pokémon GO for car culture: part collector game, part territory battle, part community encyclopedia.

Three things make this different from anything that exists:
- On-device AI identifies vehicles by make, model, and generation in real time — no server round-trip, no privacy exposure
- Players own roads. Scan enough vehicles on a stretch of road and you become its King — a touge mechanic inspired by Initial D's mountain pass rivalries
- The community builds the database. Unknown vehicles are mystery catches. Players who correctly identify them become permanent First Finders — credited forever on that vehicle's entry

**NORTH STAR**
A player mounts their phone on their dash, drives to work, and passively catches three vehicles. One is unknown. They post it to the feed, their city team weighs in, and by evening it's identified. They get 500 XP and a First Finder badge. That loop — effortless capture, social discovery, territorial reward — is the game.

### 1.1 Core Pillars

**Capture**
Two modes: highway drive-by (passive, phone in mount) and 360° scan (active, parked vehicles). On-device YOLO detection + custom classification model identifies make/model/generation without sending frames to a server.

**Collect**
Every catch populates your garage with a 3D-rendered vehicle card. Rarity is real — derived from global production volumes. A Bugatti Chiron catch is genuinely rare because fewer than 500 exist. Common cars have volume-based First Scanner badges. Rare cars have one global First Identifier badge, ever.

**Territory**
Players claim roads. Your home routes become your touge. Defend your road score against challengers. City teams compete on weekly leaderboards. Road Kings earn passive XP when others scan on their territory.

**Community**
Unknown vehicles become social events. The database is community-built. Player corrections improve the AI model in a continuous flywheel. Space objects — satellites, the ISS, crewed missions — are catchable overhead events using orbital tracking data.

---

## 2. Capture Systems

### 2.1 Highway Mode — Passive Drive-By

The primary daily loop. Phone sits in a dash mount, camera forward-facing. The app runs a low-power trigger pipeline in the background, waking the full classifier only when a vehicle is detected.

**Two-Stage Pipeline**

**STAGE 1 — TRIGGER**
Lightweight MobileNet SSD running at 2fps, vehicle superclass only. Power cost is minimal. Purpose: wake the system when something worth classifying enters frame. No classification at this stage.

**STAGE 2 — CLASSIFY**
On trigger: grab the last 5-second frame buffer, select the best-quality frame (sharpest, most centred bounding box), run full YOLO + EfficientNet classification pipeline. Result committed if confidence ≥ 0.72.

**Full Pipeline Steps**
1. Camera records rolling 5-second buffer at 720p
2. Stage 1 trigger fires on vehicle-class detection
3. Best frame selected from buffer (blur score + bounding box area)
4. YOLO v8/v9 nano: vehicle detection + bounding box crop
5. EfficientNet-Lite B2: make / model / generation / body style classification
6. ALPR wrapper (see §4): plate text extracted, VIN lookup for confidence boost, plate string zeroed immediately
7. Multi-frame aggregation: if same vehicle detected across 3+ frames, combine confidence scores
8. Confidence ≥ 0.72: catch logged — haptic + audio feedback fires
9. Result written to local store: `{make, model, generation, color, body_style, rarity, fuzzy_location, timestamp}`
10. Background sync to backend when connectivity available

**Driver Safety Rules — Non-Negotiable**
- Zero UI interaction required while in motion
- Audio-only catch notifications when speed > 15 mph (GPS-gated)
- Screen dims to minimal radar HUD above 15 mph
- Full UI unlocks only when vehicle is stationary
- Highway mode surfaces a persistent banner: 'Keep eyes on road'

**Battery Management**
- Stage 1 trigger model runs at 2fps — Neural Engine cost is negligible
- Full pipeline (Stage 2) runs only on trigger, not continuously
- Target: ≤ 10% battery per 30-minute drive on iPhone 13 / Pixel 7
- 'Performance Mode' opt-in runs pipeline continuously at 10fps — shows battery drain warning
- Engineer must benchmark on iPhone XS and Pixel 6a (minimum spec devices), not just flagships

### 2.2 360° Scan Mode — Parked Vehicle

Prestige mode for stationary vehicles. Higher XP, better accuracy, richer data. Uses guided AR walk-around flow.

**Flow**
1. Player points camera at vehicle — YOLO locks bounding box, AR overlay activates
2. UI guides player: Front → Passenger side → Rear → Driver side (compass + progress ring)
3. 4 anchor frames captured at ~90° intervals + any bonus frames player adds
4. Multi-view classification: EfficientNet ensemble fuses all frames (target accuracy ≥ 95%)
5. ALPR optionally reads visible plate for confidence confirmation — not stored
6. Result: make / model / generation / body style / color + full spec sheet from vehicle DB
7. 3D render of generation loaded in garage card
8. Raw capture photos saved to device local storage only — never transmitted

**XP BONUS:** 360° scan awards 1.5× base XP vs. drive-by. Full 4-angle scan awards an additional +25% quality bonus on top.

### 2.3 Space Object Mode — Overhead Tracking

ADS-B flights are shelved. In their place: real orbital tracking data. Satellites, the ISS, crewed missions, rocket stages, and space debris are all catchable overhead events. This is the rarest catch category in the game.

**Data Sources**
- Celestrak — free TLE (two-line element) database, updated multiple times daily
- NASA real-time telemetry feeds — active crewed missions publish live trajectory data during mission windows
- Space-Track.org — USSTRATCOM authoritative catalog, requires free account, most complete dataset

**Catch Mechanic**
- Backend worker computes overhead passes for all active player locations every 10 minutes using SGP4 orbital propagation
- Object within 60° elevation angle above horizon → becomes catchable for the pass duration
- Push notification fires when a catchable object approaches: 'ISS overhead in 4 minutes'
- Catch UI: player physically points phone at sky using gyroscope + compass — targeting reticle must be held on the object's computed position for 3 seconds

| Object Type | Rarity | Example |
|---|---|---|
| Starlink constellation sat | Common | STARLINK-1234 |
| Weather / Earth observation sat | Uncommon | NOAA-19, Terra |
| ISS | Rare | ISS (ZARYA) — passes ~16×/day |
| Crewed vehicle (non-mission) | Epic | Crew Dragon in orbit |
| Active crewed mission window | Legendary | Artemis IV lunar transit |

---

## 3. AI & Machine Learning Stack

### 3.1 Why We Build Our Own Model

Off-the-shelf ALPR SDKs (Anyline, Microblink, OpenALPR) can be licensed by any competitor tomorrow. A custom model trained on our own catch data is a compounding asset — it gets better every week, it's tuned to our exact input distribution (dashcam angle, motion, varied lighting), and it cannot be replicated without also replicating the user base that generated the training data. That is the moat.

### 3.2 Model Architecture

| Stage | Model | Task | Runtime | Target Latency |
|---|---|---|---|---|
| Trigger | MobileNet SSD v2 nano | Vehicle presence detection, 2fps | CoreML / TFLite | < 15ms |
| Detection | YOLOv9 nano | Bounding box + vehicle crop | CoreML / TFLite | < 30ms |
| Classification | EfficientNet-Lite B2 (custom) | Make / model / generation / body style | CoreML / TFLite | < 60ms |
| ALPR assist | Custom plate detector + CRNN | Plate text → confidence boost only | CoreML / TFLite | < 40ms |
| 360° multi-view | EfficientNet ensemble (3× B2) | Fuse 4-8 frames for trim/variant ID | CoreML / TFLite | < 200ms |

**LATENCY BUDGET:** Full highway pipeline (stages 1–4 sequential): target ≤ 145ms on minimum spec device. If budget is exceeded, Stage 3 drops to B0 variant.

### 3.3 Vehicle Taxonomy — Generations, Not Years

The model classifies by generation, not model year. A generation maps to a distinct visual design, which is what the camera actually sees.

**Schema:** `Make → Model → Generation → Body Style Variant`

**Rules:**
- Facelifts that change front fascia / tail lights significantly = 'facelift' flag on same generation, not new generation
- Full body redesign = new generation
- Trim variants visually distinguishable (hatchback vs sedan, wing/no wing) = separate body style variants
- Trim variants that are only interior/spec differences = same entry, not classified

### 3.4 Training Data Strategy

**Phase 1 — Bootstrap (pre-launch, weeks 1–8)**
- Stanford Cars Dataset (16,185 images, 196 classes) — baseline foundation
- VMMRdb (291,752 images, 9,170 models) — model diversity
- Web scraping of public listing images (CarGurus, AutoTrader) — ToS-compliant methods only
- Synthetic augmentation: motion blur, varied lighting, rain/glare overlays, partial occlusion, dashcam perspective warp
- Target: 500+ images per generation entry for top 300 generations at launch

**Phase 2 — Flywheel (post-launch, continuous)**
- Every confirmed catch = labeled training sample
- Player corrections = high-value negative samples, flagged for human review
- Weekly fine-tune cycle: new samples → fine-tune checkpoint → OTA model update

### 3.5 Confidence & Failure Handling

- Confidence ≥ 0.72: auto-catch, result committed
- Confidence 0.50–0.71: 'Probable match' — player prompted to confirm or correct
- Confidence < 0.50: 'Unknown Vehicle' catch — mystery card, community ID flow triggered

> **FAILURE MODE PRIORITY:** Silent wrong answers (high confidence, wrong ID) are worse than loud failures (Unknown card). Tune confidence thresholds conservatively. The Unknown mechanic is a feature, not a fallback.

### 3.6 Amber's Angels Reuse Map

| AA Component | File | Reuse in Chadongcha | Modification Required |
|---|---|---|---|
| YOLOv8 classifier + color extractor | `backend/services/vehicle_classifier.py` | Direct foundation for on-device classification | Port server-side Python → CoreML/TFLite native module; extend body type taxonomy |
| Multi-frame aggregation scoring | `backend/services/aggregation_service.py` | Catch confidence engine | Remove watchlist matching; repurpose as catch confidence threshold |
| Android Foreground Service | `mobile/modules/phone-camera/` | Background scanning while phone in mount | Minimal — already solves exact problem. Adapt Camera2 pipeline for frame buffer |
| Expo RN foundation + auth | `mobile/src/` | App scaffold, JWT auth, API client, settings | Strip mission/coordinator logic; adapt to player account model |
| Fuzzy plate matching | `backend/services/event_service.py` | On-device ALPR confidence scoring | Port to mobile; remove watchlist lookup; use only for classification confidence boost |
| FastAPI + auth routers | `backend/routers/auth.py` | Player account system seed | Remove role tiers; simplify to player account |

> **PORTING NOTE:** AA runs ALPR server-side. Chadongcha requires all camera processing on-device. The Android Foreground Service is the highest-value reuse item: saves an estimated 2–3 weeks of Android background processing work.

---

## 4. ALPR Integration

### 4.1 Architecture Decision

ALPR is used exclusively as a classification confidence booster. It is not the primary identification path.

| Signal | Weight | Purpose |
|---|---|---|
| EfficientNet classification confidence | Primary | Make / model / generation ID |
| ALPR plate → VIN lookup match | Additive +0.15 max | Confirm or boost AI result when plate is legible |
| ALPR color/type consistency | Additive +0.05 max | Cross-check against visual classification |
| Multi-frame consistency bonus | Additive +0.10 max | Repeated consistent reads across frames |

### 4.2 On-Device Porting Plan

**Option A — Custom CoreML/TFLite Plate Model (Recommended)**
Train a lightweight CRAFT text detector + CRNN recognition model for license plate crops. Compile to CoreML (iOS) and TFLite (Android).
- Estimated build time: 4–6 weeks ML work
- Binary size impact: ~8–12MB
- Target latency: < 40ms on minimum spec
- Upside: owned asset, no third-party dependency, improves with our data

**Option B — Commercial Mobile SDK (Fallback for v1 speed)**
Anyline or Microblink BlinkID — React Native wrappers, on-device, 20–40ms. Cost ~$500–2000/month at scale.
- Estimated integration time: 1 week
- Downside: no ownership, ongoing cost, competitor can license same SDK

> **DECISION POINT:** Engineer should spike Option A in week 1 — build a minimal plate detector prototype and benchmark latency on iPhone XS and Pixel 6a. If target latency is achievable, proceed with Option A. If not, fall back to Option B for v1.

### 4.3 Privacy Contract — Enforced at Code Level

> **HARD RULE:** License plates are processed transiently in memory only. No plate data is ever written to disk, transmitted to a server, included in any log or analytics event, or persisted in any form.

```
Wrapper Interface Contract
Input:  ImageFrame (pixel buffer, bounding box)
Output: { make?: string, model?: string, year?: string, confidence_boost: float }

// Plate string NEVER appears in output interface
// Plate string NEVER written to any log
// VIN lookup result used only to populate make/model/year fields
// Function scope ends: all plate variables zeroed
```

Required automated tests:
- No plate string in wrapper return value
- No plate string in any log output when wrapper is called
- No plate string written to app documents directory
- No plate string in network traffic (Charles Proxy / mitmproxy test)

---

## 5. Vehicle Database

### 5.1 Scope

The vehicle database has one primary job: correctly identify make and model with high confidence.

> **PRIORITY:** Make + Model + Generation identification accuracy > everything else. A wrong make/model identification destroys trust. Curate for correctness, not completeness.

### 5.2 Data Sources

| Source | What It Provides | Cost | Priority |
|---|---|---|---|
| NHTSA vPIC API | Make/model/year/trim/body style, US market, comprehensive back to 2000 | Free | Primary backbone |
| Manufacturer press releases + Wikipedia | Generation boundaries, body style variants, global models | Free (manual curation) | Supplement |
| Automotive news feeds | New model announcements | Free RSS | New model early warning |
| Chrome Data / J.D. Power | Full spec dataset including global production volumes | Startup licensing deal — pursue | Rarity tier calculation |
| Community corrections | Corrections, unknown IDs, new variants | Free — player-generated | Ongoing enrichment |

### 5.3 Database Schema

```sql
makes { id, name, country_of_origin, logo_asset }
models { id, make_id, name, class [car/truck/motorcycle/van] }
generations {
  id, model_id, generation_number, common_name,
  year_start, year_end (null if current),
  facelift_flag, facelift_year,
  rarity_tier [common/uncommon/rare/epic/legendary],
  production_volume_annual, production_volume_source,
  3d_asset_ref, hero_image_ref
}
variants {
  id, generation_id, name [Sedan/Hatchback/Si/Type R],
  visually_distinct [bool]
}
first_finders {
  generation_id, variant_id, player_id,
  region [global/continent/country/city],
  caught_at, badge_awarded
}
```

### 5.4 Rarity Tier Logic

| Tier | Annual Production Volume | First Finder Scope | First Finder Cap |
|---|---|---|---|
| Common | > 500,000 / year | City | First 1,000 per city |
| Uncommon | 50,000–500,000 / year | Country | First 100 per country |
| Rare | 5,000–50,000 / year | Continent | First 10 per continent |
| Epic | 500–5,000 / year | Global | First 25 globally |
| Legendary | < 500 / year | Global | First 1 globally — never awarded again |

### 5.5 3D Render Strategy

- Format: glTF 2.0
- One glTF asset per visually distinct variant within a generation
- Rendered using Three.js (React Native via expo-gl) or native SceneKit/ARCore
- Asset delivery: Cloudflare R2 CDN, loaded on first garage view, cached locally
- v1 fallback: high-quality hero image if 3D asset not yet available

---

## 6. Territory & Social Systems

### 6.1 Touge Road Ownership

Every road segment is ownable. Scan enough vehicles on a road and you become its Road King. Your hero car's silhouette is stamped on the road on the map.

**Road Segments**
- Defined using OpenStreetMap road graph
- Segment length: 500m–5km, auto-split at major intersections
- Each segment has: current King, King's hero car, King's scan count, challenger leaderboard (top 5)

**Becoming Road King**
- Scan ≥ 10 vehicles on a segment within any rolling 30-day window
- Challenger must exceed King's 30-day scan count to take over
- King earns +5 passive XP per catch by any player on their road, up to 500 XP/day

### 6.2 City Teams & Regional Competition

- Home city auto-assigned from GPS on first launch — changeable once per month
- City score = sum of all member XP in the rolling 7-day window
- Weekly reset: Sunday midnight UTC
- Top city in each region gets a trophy banner on their roads for the following week

### 6.3 First Finder System

| Rarity | Badge Scope | Cap | Badge Name |
|---|---|---|---|
| Common | City | First 1,000 per city | City Pioneer |
| Uncommon | Country | First 100 per country | National Spotter |
| Rare | Continent | First 10 per continent | Continental Hunter |
| Epic | Global | First 25 globally | Global Elite |
| Legendary | Global | First 1 — ever | World First |

- First Finder credit is permanent — displayed on the vehicle's database entry forever
- Retroactive award: if a player caught an unknown vehicle later confirmed, they receive the badge retroactively

### 6.4 Unknown Vehicle — Community ID Flow

Low-confidence catches (< 0.50) become 'Unknown Vehicle' mystery catches.

1. Catch logged as 'UNIDENTIFIED [body type]' with silhouette card in garage
2. Player optionally shares locally-saved capture photo to community feed (opt-in)
3. Community feed shows mystery catch with photo + body type + city
4. Other players suggest make/model/generation from search dropdown
5. When ≥ 5 unique players agree, a human moderator is notified
6. Moderator confirms → database entry created → all catchers' garage cards updated
7. Original catcher and contributors receive XP: 500 XP base + rarity multiplier
8. First Finder badge awarded to original catcher if applicable

> **UNKNOWN XP INCENTIVE:** Unknown catches deliberately award more XP than known catches of the same rarity tier. This drives hunting behavior toward genuinely rare and novel vehicles.

---

## 7. Backend Architecture

### 7.1 Infrastructure Overview

> **SEPARATION RULE:** Chadongcha runs on entirely separate infrastructure from Amber's Angels. No shared servers, databases, or deployment pipelines.

| Service | Platform | Est. Monthly Cost | Notes |
|---|---|---|---|
| API (catch ingestion, auth, garage) | Railway | $20–40 | Auto-scales |
| Database (Postgres) | Supabase | $0–25 | Free tier covers beta |
| Realtime (leaderboard, road ownership) | Supabase Realtime | Included | WebSocket subscriptions |
| Redis (leaderboard sorted sets) | Railway Redis | $10 | City/global rankings |
| Satellite tracking worker | Railway background worker | $5 | SGP4 propagation |
| Model CDN (OTA updates) | Cloudflare R2 | $0–5 | Free 10GB/10M requests |
| 3D asset CDN | Cloudflare R2 | $5–20 | glTF files, cached aggressively |
| Push notifications | Expo Push / APNs / FCM | $0 | Free tier covers launch scale |

**Total estimated infrastructure cost at beta: $40–105/month.**

### 7.2 Core Services

**Catch Service**
- `POST /catches` — ingest catch event from device
- Payload: `{ make, model, generation_id, color, body_style, rarity, fuzzy_location, timestamp, catch_type }`
- Returns: `{ xp_earned, new_total_xp, level_up?, first_finder_awarded?, road_king_claimed? }`

**Satellite Tracking Worker**
- Polls Celestrak TLE feeds every 6 hours
- Every 10 minutes: compute overhead passes for active player locations using SGP4
- Passes within 60° elevation → insert into `catchable_objects` table
- On `pass_start - 5 minutes`: fire push notification

**Leaderboard Service**
- Redis Sorted Sets for global, regional, and city rankings
- Road King rankings: Postgres query, cached 60s, invalidated on ownership change
- Weekly city score: Redis with TTL reset Sunday midnight UTC

**Model Update Service**
- Receives labeled samples from catch events and community corrections
- Weekly cron: trigger fine-tune pipeline
- On successful validation: upload new CoreML + TFLite models to R2
- App polls `GET /model/latest` on launch — downloads if newer version available

### 7.3 OTA Model Delivery

- Native module loads CoreML / TFLite model from app documents directory
- On app launch: `GET /model/latest` → compare version to cached version
- If newer: download in background (do not block launch)
- On next foreground after download: swap model reference — no restart required
- Rollback: keep previous model version on device; auto-revert if new model validation fails

> **APP STORE NOTE:** Apple permits OTA updates to ML model weights for improving existing features. New capabilities still require app review.

---

## 8. App Architecture

### 8.1 Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React Native (Expo SDK 52+, bare workflow) | Single codebase iOS+Android; bare workflow required for native ML modules |
| ML — iOS | CoreML via custom native module | Hardware-accelerated Neural Engine; dynamic model loading |
| ML — Android | TensorFlow Lite via custom native module | GPU delegate on Snapdragon 778G+ |
| Camera | react-native-vision-camera v4 | Frame Processor API — synchronous per-frame callbacks, zero-copy |
| 3D Rendering | expo-gl + Three.js (react-three-fiber) | glTF model rendering, hardware-accelerated |
| Navigation | Expo Router (file-based) | Deep-link structure for road sharing, vehicle entries |
| State | Zustand + React Query | Lightweight; React Query handles server state + cache |
| Maps | Mapbox GL (react-native-mapbox-gl) | Dark-mode custom styles; road ownership layer; offline support |
| Auth | Supabase Auth (email + Apple + Google) | Consistent with backend |
| Build | EAS Build (Expo cloud) | No Mac required for Android |
| Push notifications | Expo Notifications | Unified APNs + FCM |

### 8.2 Minimum Device Spec

> **SPEC FLOOR:** iPhone XS (2018, A12 Bionic) / Android with Snapdragon 778G or equivalent (2021 mid-range).

| Device Class | ML Runtime | Expected Pipeline Latency | Highway Mode Battery (30min) |
|---|---|---|---|
| iPhone 15+ / A16+ | Neural Engine | ~80ms | ~6% |
| iPhone XS–14 / A12–A15 | Neural Engine | ~120ms | ~10% |
| Snapdragon 8 Gen 1+ Android | Hexagon DSP + GPU | ~100ms | ~8% |
| Snapdragon 778G Android (min spec) | GPU delegate | ~145ms | ~14% |
| Below minimum spec (CPU only) | CPU fallback | ~400ms+ | ~30%+ |

### 8.3 Screens — v1 Scope

| Screen | Description | Key Components |
|---|---|---|
| Highway Mode | Fullscreen camera with minimal HUD. Dims above 15mph. | Vision Camera frame processor, trigger model, minimal overlay |
| 360° Scan | AR guided walk-around. 4-anchor progress ring. | Vision Camera, ARKit/ARCore anchoring, progress UI |
| Radar / Hunt | Satellite radar sweep. Overhead space objects. Catchable window countdown. | Mapbox, SGP4 position overlay, countdown timer |
| Garage | Grid of caught vehicles. Filter by type/rarity. Tap → 3D render + details. | Three.js glTF viewer, filter bar, rarity system |
| Road Map | Dark Mapbox map. Glowing owned road segments. Tap road → King + challenger board. | Mapbox custom layer, road ownership data |
| Community Feed | Unknown vehicle posts. Photo + body type + location. Vote/suggest ID. | Feed UI, voting mechanic, suggestion search |
| Profile | XP, level, hero car selector, badges, road king count, weekly city rank. | XP bar, badge grid, hero car picker |
| Leaderboard | Global / regional / city tabs. Weekly reset countdown. Road King sub-board. | Tabbed leaderboard, Redis-backed |
| Vehicle Entry | Database page per generation: 3D render, variants, First Finders, catch count, lore. | glTF viewer, first finder credits, stats |
| Onboarding | Hero car selection, home city confirm, highway mode explainer, privacy summary. | Stepped flow, car picker, location permission |

---

## 9. XP & Progression

### 9.1 XP Values

| Action | Base XP | Notes |
|---|---|---|
| Highway catch — Common | 40 | — |
| Highway catch — Uncommon | 80 | — |
| Highway catch — Rare | 200 | — |
| Highway catch — Epic | 450 | — |
| Highway catch — Legendary | 900 | 2× if first of this generation ever caught globally |
| 360° Scan bonus | +50% base | Stacks with rarity multiplier |
| Full 4-angle scan quality bonus | +25% on top | All 4 anchor frames captured |
| First catch of generation (personal) | 2× base XP | One-time per player per generation |
| Space object catch — Common sat | 120 | — |
| Space object catch — Rare (ISS) | 600 | — |
| Space object catch — Legendary (active mission) | 2000 | Time-limited window only |
| Unknown vehicle — community confirmed | 500 + rarity multiplier | Retroactive on confirmation |
| Accepted model correction | 150 | Community contribution |
| Road King takeover | 300 flat | On successful claim |
| Road King passive | +5 per catch on your road | Capped at 500 XP/day |
| Daily first catch | +100 flat | Encourages daily play |
| City weekly win contribution | 200 bonus | Top 10 contributors on winning city |

### 9.2 Levels

| Level | XP Required | Title |
|---|---|---|
| 1–5 | 0–2,000 | Street Spotter |
| 6–10 | 2,001–10,000 | Lane Changer |
| 11–20 | 10,001–50,000 | Highway Hunter |
| 21–35 | 50,001–200,000 | Road King |
| 36–50 | 200,001–1,000,000 | Apex Collector |
| 51+ | > 1,000,000 | Legend of the Road |

---

## 10. Privacy Architecture

Privacy is enforced at the architecture level, not policy level.

### 10.1 Data Minimization

| Data Type | Collected? | Notes |
|---|---|---|
| License plate (raw) | NEVER | Transient memory only, never written or transmitted |
| License plate (hashed) | NEVER | No plate data in any form |
| Camera frames / video | NEVER transmitted | All processing on-device |
| Driver / occupant image | NEVER | Bounding box crops to vehicle only |
| Vehicle make/model/generation | YES | Core game data, no PII |
| Catch timestamp | YES | Required for game mechanics |
| Exact GPS coordinates | NO | Fuzzy zone only |
| Fuzzy location (city + district) | YES | No street-level data |
| Player live GPS | YES, ephemeral | Not persisted beyond session |
| Player-shared community photo | Only if explicitly shared | Opt-in upload action |

### 10.2 Opt-In Plate Registration

Players may voluntarily register their own license plate to 'own' their vehicle in-game.
- Plate stored as bcrypt hash (cost factor 12) — never reversible
- Match notification: 'Someone caught your [make/model] in [city]' — no location precision
- Player can de-register at any time, immediately and permanently

---

## 11. Build Milestones

### 11.1 Phased Delivery

| Phase | Deliverable | Duration |
|---|---|---|
| 0 — Foundation | Repo, Expo bare project, Supabase schema, CI/CD, ALPR wrapper stub, AA Foreground Service ported | 1 week |
| 1 — Camera Core | Vision Camera v4 integrated, Stage 1 trigger model on-device, frame processor pipeline working | 2 weeks |
| 2 — ALPR Spike | Prototype plate detector on CoreML + TFLite. Benchmark on iPhone XS + Pixel 6a. Decision: custom vs. commercial. | 1 week |
| 3 — Classification | EfficientNet-Lite B2 integrated, generation taxonomy loaded, make/model/generation output working end-to-end | 3 weeks |
| 4 — Highway Mode | Full drive-by pipeline. Speed-gated UI. Haptic + audio. XP write to Supabase. Battery profiling. | 2 weeks |
| 5 — 360° Scan | AR guided walk-around flow, 4-anchor capture, multi-view ensemble, result screen, local photo save | 2 weeks |
| 6 — Vehicle DB + Garage | NHTSA backbone, top 300 generations curated with rarity tiers, garage UI, 3D render, vehicle entry pages | 3 weeks |
| 7 — Territory | Mapbox road layer, road ownership mechanics, Road King claim/takeover, passive XP, hero car stamping | 2 weeks |
| 8 — Space Mode | Celestrak TLE worker, SGP4 overhead pass computation, Radar screen, catch mechanic, space object cards | 2 weeks |
| 9 — Social | Community feed, unknown vehicle flow, voting/suggestion mechanic, moderator queue, first finder awards | 2 weeks |
| 10 — Privacy Audit | Full ALPR path code review, plate handling tests, Charles Proxy audit, penetration test | 1 week |
| 11 — Beta | TestFlight + Play Store internal track, crash fix sprint, performance profiling on min-spec devices | 2 weeks |

**Total estimated timeline to beta: 23 weeks from kickoff.**

### 11.2 Critical Path — Do These First

> **WEEK 1 SPIKE:** Phase 2 (ALPR) must be spiked in week 1, running parallel to Phase 1. This decision gates the entire pipeline architecture.

- ALPR latency benchmark — gates pipeline architecture
- Vision Camera frame processor proof-of-concept — gates all camera work
- EfficientNet-Lite B2 CoreML + TFLite compile + benchmark — gates classification timeline

### 11.3 v1 Out of Scope — Deferred to v2

- In-app purchases / monetization layer
- Vehicle trading between players
- AR vehicle overlay (pointing phone at empty parking spot)
- DJI / drone integration
- Web dashboard
- Initial D aesthetic / licensed theming — confirm legal clearance before any use
- On-device model fine-tuning (experimental, not production-ready)

---

## 12. Open Questions for Kickoff

| # | Question | Urgency | Owner |
|---|---|---|---|
| 1 | ALPR custom model vs. commercial SDK — spike in week 1, benchmark on iPhone XS + Pixel 6a. | CRITICAL — week 1 | Eng lead |
| 2 | Vision Camera v4 frame processor: confirm synchronous CoreML call is supported in latest release. | High — week 1 | Eng lead |
| 3 | Celestrak API terms of service: confirm free commercial use permitted for SGP4 data. | High — week 2 | Product |
| 4 | Initial D / touge theming: legal review before any trademarked names or artwork are used. | Medium — before beta | Legal |
| 5 | 3D vehicle asset pipeline: license from Sketchfab/TurboSquid, commission, or procedural generation? | Medium — week 4 | Product + Design |
| 6 | Chrome Data / J.D. Power licensing: pursue startup deal for global production volume data. | Medium — week 6 | Product |
| 7 | Community moderation: who reviews unknown vehicle ID confirmations? Gamify at Level 35+? | Medium — week 8 | Product |
| 8 | App Store guidelines on OTA model delivery: confirm weekly weight updates are permitted. | Medium — week 8 | Legal + Eng |

---

## 13. Recommended Repository Structure

```
chadongcha/
├── mobile/
│   ├── modules/
│   │   ├── vehicle-classifier/      # CoreML + TFLite native module (YOLO + EfficientNet)
│   │   ├── alpr-wrapper/            # ALPR — plate text NEVER exits this module
│   │   ├── phone-camera/            # Android Foreground Service (ported from AA)
│   │   └── model-loader/            # OTA model file loading + hot-swap
│   └── src/
│       ├── screens/                 # Highway, Scan360, Radar, Garage, Map, Feed, Profile
│       ├── components/              # VehicleCard, GarageCard, RarityBadge, RoadMarker
│       ├── hooks/                   # useFrameProcessor, useSatelliteTracker, useRoadOwnership
│       ├── stores/                  # Zustand: garage, player, territory, settings
│       └── api/                     # React Query: catches, leaderboard, vehicles, satellites
├── backend/
│   ├── api/                         # FastAPI: catch ingestion, auth, garage, leaderboard
│   ├── workers/
│   │   ├── satellite_tracker.py     # Celestrak + SGP4 overhead pass computation
│   │   └── model_updater.py         # Weekly fine-tune trigger + R2 upload
│   ├── services/
│   │   ├── vehicle_classifier.py    # Ported + extended from AA
│   │   ├── aggregation_service.py   # Ported from AA — catch confidence engine
│   │   ├── xp_service.py
│   │   ├── territory_service.py
│   │   └── first_finder_service.py
│   └── schema.sql
├── ml/
│   ├── training/
│   ├── data/
│   ├── export/
│   └── eval/
├── vehicle-db/
│   ├── seed/
│   ├── curated/
│   └── assets/
└── web/                             # v2 — placeholder only in v1
```

---

*차동차 · CHADONGCHA · Confidential*
