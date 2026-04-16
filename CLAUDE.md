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
- **Supabase:** All database changes must be idempotent migrations in `backend/migrations/`. 
- **Security:** Rigorously maintain Row Level Security (RLS). Ensure `auth.uid() = player_id` for all private data.
- **Type Safety:** Maintain strict parity between FastAPI Pydantic models and Expo TypeScript interfaces.
- **Fuzzy Matching:** Use the `is_close_match` helper in `community.py` for all text-based comparisons to ensure robustness.

## 📋 Refactoring Priority
1. **The Garage:** Optimization of large vehicle collections.
2. **Crew Social Layer:** Building the UI for Team creation, joining, and leaderboards.
3. **Training Opt-In:** Implementing the UI/UX for users to legally opt-in their catch data for ML retraining.

---
*Last updated: April 16, 2026*
