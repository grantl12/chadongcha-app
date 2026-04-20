# ChaDongCha — Sound Design Brief

**Project:** ChaDongCha ("Pokémon GO for Gearheads")
**Platform:** iOS + Android (React Native / Expo)
**Aesthetic:** Initial D × Eurobeat × Dark Arcade. High-energy, high-contrast, slightly retro-digital. Think GT3 AE86 cresting a mountain pass at 2am — clean, purposeful, and fast. No cutesy sounds; everything should feel earned.

---

## Sonic Identity Guidelines

- **Palette:** Short, punchy synth hits. Distorted digital textures are welcome. Avoid orchestral swells or natural/acoustic tones.
- **Rhythm:** Many sounds will fire on button taps — keep attack times near-instant (≤10ms).
- **Duration:** Most UI sounds should be ≤500ms. Celebration sounds (badge unlock, level-up) can extend to 1–2s.
- **Dynamic range:** Master loud enough to cut through road noise, but designed so they layer without clashing when two fire quickly.
- **Format:** `.mp3` + `.wav` at 44.1kHz / 16-bit stereo.

---

## Sound Inventory

### 1. CATCHES — Core gameplay loop

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| C1 | `scan_anchor_lock` | Each of 4 photo anchors locks during a Scan360 capture | Short hard click/beep. Fires 4× in sequence — must sound good repeated. Like a radar ping. |
| C2 | `scan_complete` | All 4 anchors captured, classification result arrives | Ascending 2–3 note synth phrase. "Analysis complete" energy. |
| C3 | `catch_confirm` | Player taps "CATCH IT" to register the vehicle | Satisfying thud + shimmer. The payoff moment. |
| C4 | `catch_highway` | Passive highway catch detected at speed | Urgent, doppler-inspired swoosh + registration beep. Fast car energy. |
| C5 | `catch_probable` | Uncertain detection — "probable vehicle" banner | Softer, hesitant version of C4. Lower confidence = lower tone. |
| C6 | `scan_low_confidence` | Photo rejected — confidence too low, try again | Short negative buzz. Not harsh — just a gentle "nope." |
| C7 | `satellite_tick` | Each second of the 3-second lock-on hold countdown | Soft metronome tick, pitch rises each beat (3 ticks total). |
| C8 | `satellite_catch` | Orbital/satellite object successfully captured | Sci-fi shimmer — think sonar ping meets synthesizer arp. Distinct from ground catches. |

---

### 2. PROGRESSION — XP, levels, badges

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| P1 | `xp_earn` | XP counter animates after any catch or correct ID | Light coin-collect chime. Short (≤300ms). Can fire frequently. |
| P2 | `level_up` | Level-up banner slides in from top of screen | The big one. 1–2s fanfare. Eurobeat-inspired 4-note ascending hit. Should feel like crossing a finish line. |
| P3 | `badge_unlock` | BadgeAwardModal appears — achievement earned | Triumphant sting. Slightly longer than level-up, more ceremonial. Layered with P2 if both fire together. |

---

### 3. IDENTIFY GAME — Mini-game loop

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| I1 | `guess_submit` | Player submits a vehicle guess | Crisp click-submit sound. Neutral — answer not yet revealed. |
| I2 | `guess_correct` | Correct answer revealed | Quick ascending chime. Warm, rewarding. |
| I3 | `guess_wrong` | Wrong answer revealed | Low descending buzz. Classic game-show "wrong answer" feel, but subtle. |
| I4 | `answer_reveal` | Correct answer card flips/appears | Soft whoosh or card-flip swipe. Accompanies visual reveal animation. |

---

### 4. ROAD KINGS — Territory control

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| R1 | `road_king_claimed` | Player becomes king of a road segment | Aggressive synth stab. "Territory seized." Short but assertive. |
| R2 | `road_king_dethroned` | Player loses a segment to a rival (feed notification) | Descending tone, slightly ominous. Loss without being demoralizing. |

---

### 5. CREW / SOCIAL

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| S1 | `crew_join` | Player joins an existing crew | Upbeat 2-note hit. "You're in." Team energy. |
| S2 | `crew_create` | Player successfully founds a new crew | Slightly more epic than S1 — you're the founder. 3-note rising phrase. |
| S3 | `crew_leave` | Player leaves a crew | Subdued, minor-key descending note. No drama, just departure. |
| S4 | `crew_disband` | Crew is disbanded by its leader | More final than S3. Brief low thud + fade. |
| S5 | `color_select` | Tapping a color swatch in the crew creation picker | Tiny synth blip. Must loop cleanly — user may tap many swatches fast. |

---

### 6. BOOSTS & POWER-UPS

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| B1 | `boost_activate` | Player activates an XP or scan boost ("USE NOW") | Energizing power-up whoosh. Rising pitch sweep. |
| B2 | `boost_store` | Player stores a boost for later | Softer version of B1 — stored, not consumed. Slight "click into inventory" feel. |

---

### 7. UI & NAVIGATION

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| U1 | `tab_switch` | Switching between the 5 main tabs (Ops/Garage/Roads/Feed/Profile) | Very subtle tick or soft click. Should barely register consciously — background texture only. |
| U2 | `screen_push` | Navigating into a major screen (Highway, Scan360, Identify launch buttons) | Light whoosh, slightly heavier than tab switch. "Entering a mode." |
| U3 | `modal_open` | Any full-screen modal appears | Soft downward sweep — "something arrived." |
| U4 | `modal_dismiss` | Modal dismissed / closed | Inverse of U3 — upward sweep, brief. |

---

### 8. ERRORS & WARNINGS

| ID | Name | Moment | Notes |
|----|------|---------|-------|
| E1 | `error_network` | Network failure / API error on crew or catch actions | Low double-buzz. Clinical, not alarming. |
| E2 | `paywall_block` | Tapping a paywalled feature | Soft "locked" clunk. Not punishing — informational. |

---

## Deliverables Summary

**32 individual sound files** across 8 categories:

| Category | Count |
|----------|-------|
| Catches | 8 |
| Progression | 3 |
| Identify Game | 4 |
| Road Kings | 2 |
| Crew / Social | 5 |
| Boosts | 2 |
| UI / Navigation | 4 |
| Errors | 2 |
| **Total** | **30** |

All files named per the `ID` column above (e.g., `catch_confirm.mp3`). Please deliver both `.mp3` (for mobile bundling) and `.wav` (source) for each asset.

---

## Reference Aesthetic

- **Initial D OST** — Eurobeat tempo, synth-forward, high energy
- **Ridge Racer / Gran Turismo UI sounds** — clean, precise, automotive
- **Tekken / Street Fighter hit sounds** — punchy, definitive
- **Avoid:** nature sounds, acoustic instruments, lo-fi, anything "cute"
