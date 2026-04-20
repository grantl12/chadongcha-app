# 🏎️ Project ChaDongCha: Claude Editor Handbook

## 🎯 The Mission
Refining the "Pokémon GO for Gearheads" experience. Claude is the primary maintainer of architectural elegance, schema integrity, and the "Initial D" stylistic anchor.

## 👥 The AI Trinity
- **Claude Code (The Editor):** Deep refactoring, schema migrations, complex state management, and high-fidelity UI.
- **CMD Gemini (The Specialist):** Local execution, terminal debugging, and core gameplay mechanics.
- **Browser Gemini (The Architect):** High-level strategy and project memory.

## 🎨 Aesthetic & UX Mandates
- **Initial D Style:** Dark mode, high-contrast red/white accents, bold typography (900 weight), and subtle scanline/Eurobeat-inspired animations.
- **Completionist Loop:** Every action must provide haptic feedback and visual "pop" (e.g., `BadgeAwardModal`).
- **Telemetry:** Future paywalled features should focus on "Advanced Telemetry" (MSRP, HP, Torque, Weight).

## 🛠️ Engineering Standards
- **Supabase:** All database changes must be idempotent migrations in `backend/migrations/`. Migrations 001–013 applied. Apply new ones via Supabase Dashboard → SQL Editor.
- **Security:** Rigorously maintain Row Level Security (RLS). Ensure `auth.uid() = player_id` for all private data. AI rivals and workers use `SUPABASE_SERVICE_ROLE_KEY`.
- **Type Safety:** Maintain strict parity between FastAPI Pydantic models and Expo TypeScript interfaces.
- **Fuzzy Matching:** Use the `is_close_match` helper in `community.py` for all text-based comparisons.
- **CI Check:** Run `bash scripts/check.sh` before every commit. Mirrors CI: ruff + mypy (Python 3.12 — our venv is 3.10, stub divergence is possible) + tsc.

## 🧠 ML Status
- **Model:** MobileNetV3-Large-100 via timm. ~170 classes (bootstrap.py `GENERATION_CLASSES`). Checkpoint at `ml/models/best.pt`.
- **Training:** `python training/bootstrap.py --phase classify --optimizer sam --epochs 30` (SAM = sharpness-aware, ~2× slower, better generalization on small classes).
- **Incremental class addition:** `--freeze-backbone --resume` — trains only the classifier head. Use this when promoting ghost classes to avoid full retraining.
- **Ghost classes:** Unknown community-identified vehicles accumulate in `ghost_classes` table. At 5 confirmed catches → `status = promotion_ready`. Call `GET /community/ghost-classes?status=promotion_ready` before a training run to know what to add to `GENERATION_CLASSES`.
- **Export:** `--phase export` → CoreML `.mlpackage` + ONNX. Deploy via `ml/deploy_model.py --version X.Y.Z`, then update `MODEL_CURRENT_VERSION` Railway shared variable.

## 🌍 Live Data (as of April 20, 2026)
- **space_objects:** 10,143 TLEs from Celestrak
- **catchable_objects:** 25,910 pass windows across 16 seed regions
- **road_segments:** Carrollton GA (192), Atlanta GA (2,169), Johnson City TN (298), Seoul KR (808)
- **AI rivals:** Seeded for Carrollton, Atlanta, Johnson City. Seoul skipped (no testers there).
- **Players:** 0 real users (dev/testing phase). Ghost rivals use `is_ai_rival = true`.

## 📡 PostHog
- **Mobile key:** `phc_AF7zruUuPR2rA5g6t4p58uWNqEth9qhVCL8jik2h84Sa` (in `mobile/src/lib/posthog.ts`)
- **Backend key:** same, set via `ph.api_key` in `main.py`
- **Key events:** `catch_recorded`, `catch_synced`, `dash_sentry_started`, `satellite_caught`, `onboarding_complete`, `auth_success`, `sync_failed`, `exception`
- **Person properties:** `username`, `provider` (set on `posthog.identify` in `_layout.tsx`)
- **PostHog UI priority:** Build activation funnel `onboarding_started → auth_success → username_set → onboarding_complete → catch_recorded` first.

## ⚙️ Workers & Infra
- **sat-worker** (`railway.sat.toml`): polls Celestrak every 6h, computes SGP4 passes every 10min, batched upserts (500/req). Run locally: `cd backend && .venv/Scripts/python workers/satellite_tracker.py --once`
- **osm-seeder** (`railway.seeder.toml`): `python workers/osm_seeder.py --city Atlanta --country US --bbox "lat_min,lon_min,lat_max,lon_max"`
- **rivals seeder** (local only): `python scripts/seed_ai_rivals.py --city Atlanta --density 0.30`
- **`db.py`** uses `SUPABASE_SERVICE_ROLE_KEY` (preferred) falling back to `SUPABASE_SERVICE_KEY`.

## 📋 Priority Queue (pick up here)
1. **EAS build** — last build (0f0e26a) crashed on launch. posthog was pinned to 3.3.7 and lockfile regenerated in 4ba5701. New build needed to verify fix.
2. **Onboarding tutorial** — scripted walkthrough, forced interactions, skip + replay. ~3–4 days. See backlog memory for full spec.
3. **Crew Social Layer** — UI for team creation, joining, leaderboards.
4. **Ghost class mobile UI** — garage display for ghost-confirmed catches (`??? RARE VEHICLE` with special glow badge).
5. **Training opt-in UI** — legal opt-in for contributing catch data to ML retraining.
6. **Image scraper fix** — ddgs rate limiting blocking model retrain with 170 classes.

---
*Last updated: April 20, 2026*
