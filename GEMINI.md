# 🏎️ Project ChaDongCha: Gemini Specialist Handbook

## 🎯 The Mission
To build "Pokémon GO for Gearheads"—a high-performance vehicle identification platform utilizing specialized ML models (MobileNetV3) to identify 200+ vehicle classes. Supports both public safety (Amber's Angels) and community-driven car spotting.

## 👥 The AI Trinity
- **CMD Gemini (The Specialist):** Local execution, terminal debugging, real-time ML monitoring, and core gameplay implementation.
- **Browser Gemini (The Architect):** Oversees Supabase, high-level strategy, and project memory.
- **Claude Code (The Editor):** Deep code refactoring, complex schema management, and UI/UX polish.

## 🕹️ Core Gameplay Mechanics
- **Satellite Catch:** "Appointment viewing" via orbital passes. Real-time tracking and catch loops.
- **ID Game:** Minigame for earning XP/Badges. Supports Multiple Choice and Manual Text Entry (Fuzzy Matching).
- **Crews (Teams):** Initial D inspired "Crews" with Home Turf bonuses (+5% XP on teammate-owned roads).
- **Achievements:** Completionist badges (Sharpshooter, Type Master, Catalog Chronicler).

## 🛠️ Technical Ground Truth
- **Storage:** Heavy ML assets on `D:\Users\grant\Documents\ChaDongCha\ml`.
- **Assets:** Game images stored on Cloudflare R2 (`chadongcha-assets/id_game/`).
- **Compute:** Local training on AMD Radeon 5700 XT via `torch-directml`.
- **Backend:** Python/FastAPI (Railway) + Supabase (PostgreSQL).
- **Frontend:** Expo/React Native (Dark Mode / Initial D Aesthetic).

## 📋 Specialist Rules
1. **D: Drive First:** All heavy ML assets MUST stay on the D: drive.
2. **Data Flywheel:** Prioritize labeled data collection from community-verified, opted-in catches for model retraining (0.3.0+).
3. **Fuzzy Logic:** Use Levenshtein-based fuzzy matching for all manual vehicle identifications to handle spelling errors.
4. **DirectML Awareness:** Be mindful of `aten::lerp` CPU fallbacks on the DML backend.

---
*Last updated: April 16, 2026*
