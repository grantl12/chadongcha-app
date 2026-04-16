# 🏎️ Project ChaDongCha: AI Collaboration Handbook

## 🎯 The Mission
To build a high-performance vehicle identification platform utilizing specialized ML models (MobileNetV3) to identify 40+ vehicle classes. This project supports both public safety (Amber's Angels) and community-driven car spotting.

## 👥 The AI Trinity
- **Browser Gemini (The Architect):** Oversees Supabase, high-level strategy, and project memory.
- **CMD Gemini (The Specialist):** Local execution, terminal debugging, and real-time ML monitoring.
- **Claude Code (The Editor):** Deep code refactoring and complex schema management.

## 🛠️ Technical Ground Truth
- **Storage:** All ML assets (data, models, exports) are stored on `D:\Users\grant\Documents\ChaDongCha\ml`.
- **Compute:** Local training runs on an **AMD Radeon 5700 XT** using the `torch-directml` backend.
- **Backend:** Python/FastAPI deployed on Railway.
- **Database:** Supabase (PostgreSQL) for user data and activity feeds.
- **Frontend:** Expo/React Native for the mobile car-spotting experience.

## 📋 Ongoing Project Rules
1. **D: Drive First:** Always assume heavy ML assets are on the D: drive.
2. **Veteran Owned:** This is a Service-Disabled Veteran-Owned Small Business (SDVOSB) project.
3. **Accuracy Goals:** Target >90% accuracy for the 41-class vehicle classifier.
4. **DirectML Awareness:** Be mindful of `aten::lerp` CPU fallbacks on the DML backend.

---
*Last updated: April 2026*