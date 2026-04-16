import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PlayerStore = {
  userId: string | null;
  username: string | null;
  xp: number;
  level: number;
  credits: number;               // in-game market currency
  accessToken: string | null;
  orbitalBoostExpires: string | null;  // ISO timestamp
  setPlayer: (data: { userId: string; username: string; accessToken: string }) => void;
  setProfile: (xp: number, level: number) => void;
  applyXp: (delta: number, newLevel?: number) => void;
  applyCredits: (delta: number) => void;
  activateOrbitalBoost: (remainingMin: number) => void;
  clearSession: () => void;
};

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      xp: 0,
      level: 1,
      credits: 0,
      accessToken: null,
      orbitalBoostExpires: null,

      setPlayer({ userId, username, accessToken }) {
        set({ userId, username, accessToken });
      },

      setProfile(xp, level) {
        set({ xp, level });
      },

      applyXp(delta, newLevel) {
        set(s => ({
          xp: s.xp + delta,
          level: newLevel ?? s.level,
        }));
      },

      applyCredits(delta) {
        set(s => ({ credits: Math.max(0, s.credits + delta) }));
      },

      activateOrbitalBoost(remainingMin: number) {
        const expires = new Date(Date.now() + remainingMin * 60 * 1000).toISOString();
        set({ orbitalBoostExpires: expires });
      },

      clearSession() {
        set({ userId: null, username: null, accessToken: null, xp: 0, level: 1, credits: 0, orbitalBoostExpires: null });
      },
    }),
    {
      name: 'player-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
