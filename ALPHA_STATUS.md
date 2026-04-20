# ChaDongCha — Alpha Status (Last Updated: 2026-04-20)

This file is the ground truth for what is actually working, what is genuinely broken,
and what the next actions are. Read this at the start of any session.

---

## What Was Fixed This Session (2026-04-20)

### CRITICAL: Catches Were Never Writing to DB
**Root cause:** Supabase access tokens expire after ~1 hour. `apiClient` was reading
`accessToken` from `playerStore`, which was set once at login and never refreshed.
After an hour, every API call returned 401. The `syncPending` loop caught the 401,
set `syncError` (invisible to the user), and `break`ed — silently blocking the queue
until the next app foreground, which also immediately failed.

**Fixes applied (commit `12c84e2`):**
- `mobile/src/api/client.ts` — now calls `supabase.auth.getSession()` so the Supabase
  client's auto-refresh always provides a valid token
- `mobile/app/onboarding.tsx` — email login/signup now calls `supabase.auth.setSession()`
  with backend tokens so email-auth users also get auto-refresh (SSO users were already OK)
- `mobile/app/(tabs)/index.tsx` — added sync error banner on Operations screen showing
  pending catch count and error message (previously invisible)
- `mobile/app/(tabs)/garage.tsx` — moved error/pending banners inside the header so they
  render below the safe area and are actually readable (they were hidden behind the status bar)

**Action required:** Install the new build on your phone. Re-login after install to
establish a fresh Supabase session. Then go scan something. You should see it write.

---

## CI / Build Status

**CI is working fine.** Previous "canceled" builds were canceled by the workflow's
cancel-pending job (by design — cancels stale builds when a new push lands). Not a CI bug.

**Current builds in progress (both from commit `12c84e2`):**
- Android APK: `45ecf201` — IN_PROGRESS as of 2026-04-20
- iOS IPA: `d0b8e0f8` — NEW/queued as of 2026-04-20

Check expo.dev → chadongcha project for build completion and download links.

**To install on device:** Download the APK (Android) or use TestFlight (iOS) once
the builds complete.

---

## Satellite Events — NOT WORKING

**Status: Broken. Zero satellite events have ever been seen because `catchable_objects`
table is empty.**

**Confirmed:** `GET /satellites/catchable?lat=40.71&lon=-74.00` returns `[]`.

**Root cause options (one of these is true — check Railway to know which):**
1. The `sat-worker` Railway service was never deployed / is not running
2. The `sat-worker` crashed and hit its 3-retry limit (`restartPolicyMaxRetries = 3`),
   so Railway stopped trying
3. The worker is running but its TLE fetch from Celestrak is failing (rate limit, timeout,
   or changed URL format)

**What needs to happen to fix this:**
1. Open Railway dashboard → navigate to `sat-worker` service
2. Check if it is running. If not running, check the crash logs.
3. If the Celestrak TLE URL is returning errors, the worker will log it but silently
   keep running (it only `log.error`s, doesn't crash). The `space_objects` table might
   be empty, which means `compute_passes()` returns early (`if not rows.data: return`).
4. If everything looks running but the table is still empty, manually trigger one cycle
   by hitting Celestrak directly and verifying the format hasn't changed.

**The `/satellites/catchable` endpoint also has a design note:**
It accepts `lat`/`lon` params but doesn't use them — returns all globally active passes.
This is fine once the worker is running (you'd see passes from anywhere), but lat/lon
filtering per-user would be cleaner. Not the priority right now.

---

## Core Loop Status

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (Apple SSO) | ✅ Working | Supabase auto-refresh was already correct for SSO |
| Auth (Email) | ✅ Fixed | Now sets Supabase session for token refresh |
| Catch → DB sync | ✅ Fixed | Token refresh fix lands in current build |
| Highway (Dash Sentry) | ⚠️ Unverified | Code looks correct but no confirmed DB writes yet |
| 360° Scan | ⚠️ Unverified | Same — no confirmed DB writes yet |
| Feed | ⚠️ Unverified | Will show data once catches start writing |
| Satellite events | ❌ Broken | `catchable_objects` is empty — sat-worker issue |
| Push notifications (sat) | ❌ Broken | Depends on sat-worker being fixed first |
| Road King / Territory | ⚠️ Unverified | Logic looks correct; needs actual catches to test |
| Garage / Collections | ✅ Working | Banner fix applied; data shows from local store |
| Leaderboard | ⚠️ Unverified | Backend uses direct DB, not Redis yet (TODO in code) |
| Crew system | ⚠️ Unverified | Code complete; needs real users to test |
| Market | ⚠️ Unverified | Code complete |
| Identify mini-game | ⚠️ Unverified | Code complete |
| Badges | ⚠️ Unverified | Computed locally from catch store; should work |
| Satellite catch (Space mode) | ❌ Blocked | Blocked on sat-worker fix |

---

## ML Model

**Current state:**
- Model in app (MobileNetV3, ~100 classes) was trained on a messy dataset that includes
  vehicle parts, interior shots, and random DDG scrape garbage
- New model trained with more classes but **lower accuracy** — not ready to ship
- Dataset needs cleaning before retraining: remove vehicle parts, interior pics, misc junk

**Next steps for ML:**
1. Run the image scraper against the current dataset to flag bad images
   (DDG rate limiting was blocking this — status unknown)
2. Clean the dataset manually or with a classifier pass
3. Retrain with `bootstrap.py` (GPU guard + DirectML fixes applied in this session)
4. Export → CoreML + ONNX → drop into `mobile/modules/vehicle-classifier/`
5. Update `MODEL_CURRENT_VERSION` env var in Railway

**bootstrap.py improvements applied this session:**
- Refuses to train on CPU (was silently training on CPU and producing garbage)
- Batch size 32→64 (better GPU utilization)
- AdamW→SGD+Nesterov (AdamW's lerp_ op not supported on DirectML/AMD GPU)
- Per-epoch timing output

---

## Known Remaining Issues

### Leaderboard Redis TODO
`backend/routers/leaderboard.py:11` has `# TODO: wire to Redis sorted set for real-time city score`.
Currently does direct DB queries. Functional but not real-time.

### No Sentry / Crash Reporting
No visibility into production crashes. When things go wrong on device, you have no logs.
(Sentry integration was explicitly deferred last session — see memory.)

### Push Notifications (Vehicle Catches)
Road King takeover, level up, first finder notifications are wired in the backend.
Never been able to verify they work because no catches have reached the backend until now.

### `ascAppId` not set in `eas.json`
`submit.production.ios.ascAppId` is set to `"your-app-store-connect-app-id"`.
Not needed for preview builds, but needs to be filled in before TestFlight submission.

---

## Immediate Action List (Priority Order)

1. **[YOU] Check Railway sat-worker service** — Is it running? What do the logs say?
   Fix whatever is stopping it from populating `catchable_objects`.

2. **[YOU] Install the new build on your phone** — Android APK from build `45ecf201`
   or iOS from `d0b8e0f8`. Re-login after install.

3. **[TEST] Go scan a car** — After installing new build + re-login, go do a Dash Sentry
   or 360° Scan. Check Supabase → catches table directly to confirm a row was written.
   If the sync error banner appears on the Operations screen, that's your debug signal.

4. **[CODE] Clean + retrain ML model** — Once dataset is cleaned, retrain and swap model.
   This is the path from "barely works" to "actually good".

5. **[CODE] Sentry integration** — Backend + mobile. Gives visibility into crashes.

6. **[LATER] Leaderboard Redis** — Wire city leaderboard to Redis sorted set.

---

## What Is Actually Solid

- Auth flows (Apple, Google, email)
- Backend schema + RLS (Supabase migrations are idempotent and clean)
- Catch ingest logic (dedup, XP, territory, first finder all look correct)
- Garage UI (local store is reliable)
- EAS CI pipeline (builds automatically on push to main)
- Railway API service (backend is live at chadongcha-production.up.railway.app)
- Native ML inference module (CoreML on iOS, TFLite on Android) — the *infrastructure*
  is solid, just needs a better model
