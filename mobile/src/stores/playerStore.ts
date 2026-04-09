import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PlayerStore = {
  userId: string | null;
  username: string | null;
  xp: number;
  level: number;
  accessToken: string | null;
  setPlayer: (data: { userId: string; username: string; accessToken: string }) => void;
  applyXp: (delta: number, newLevel?: number) => void;
  clearSession: () => void;
};

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      xp: 0,
      level: 1,
      accessToken: null,

      setPlayer({ userId, username, accessToken }) {
        set({ userId, username, accessToken });
      },

      applyXp(delta, newLevel) {
        set(s => ({
          xp: s.xp + delta,
          level: newLevel ?? s.level,
        }));
      },

      clearSession() {
        set({ userId: null, username: null, accessToken: null, xp: 0, level: 1 });
      },
    }),
    {
      name: 'player-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
