import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoredBoost = {
  id:          string;
  rarityTier:  string;
  multiplier:  number;
  durationMin: number;
  objectName:  string;
  storedAt:    string;
};

export type PendingBoostDecision = {
  rarityTier:  string;
  multiplier:  number;
  durationMin: number;
  objectName:  string;
  xpEarned:    number;
};

export const MAX_STORED_BOOSTS = 5;

type PlayerStore = {
  userId: string | null;
  username: string | null;
  xp: number;
  level: number;
  credits: number;
  accessToken: string | null;
  orbitalBoostExpires: string | null;
  xpBoostExpires: string | null;
  scanBoostExpires: string | null;
  idHints: number;
  storedBoosts: StoredBoost[];
  pendingBoostDecision: PendingBoostDecision | null;

  setPlayer: (data: { userId: string; username: string; accessToken: string }) => void;
  setProfile: (xp: number, level: number) => void;
  setFullProfile: (data: {
    xp: number; level: number; credits: number;
    xpBoostExpires?: string | null;
    scanBoostExpires?: string | null;
    idHints?: number;
  }) => void;
  applyXp: (delta: number, newLevel?: number) => void;
  applyCredits: (delta: number) => void;
  setCredits: (total: number) => void;
  activateOrbitalBoost: (remainingMin: number) => void;
  applyShopPurchase: (data: {
    newCredits: number;
    xpBoostExpires?: string | null;
    scanBoostExpires?: string | null;
    idHints?: number;
  }) => void;
  setPendingBoostDecision: (boost: PendingBoostDecision) => void;
  clearPendingBoostDecision: () => void;
  addStoredBoost: (boost: StoredBoost) => void;
  consumeStoredBoost: (id: string) => void;
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
      xpBoostExpires: null,
      scanBoostExpires: null,
      idHints: 0,
      storedBoosts: [],
      pendingBoostDecision: null,

      setPlayer({ userId, username, accessToken }) {
        set({ userId, username, accessToken });
      },

      setProfile(xp, level) {
        set({ xp, level });
      },

      setFullProfile({ xp, level, credits, xpBoostExpires, scanBoostExpires, idHints }) {
        set({
          xp, level, credits,
          xpBoostExpires:   xpBoostExpires  ?? null,
          scanBoostExpires: scanBoostExpires ?? null,
          idHints:          idHints          ?? 0,
        });
      },

      applyXp(delta, newLevel) {
        set(s => ({ xp: s.xp + delta, level: newLevel ?? s.level }));
      },

      applyCredits(delta) {
        set(s => ({ credits: Math.max(0, s.credits + delta) }));
      },

      setCredits(total) {
        set({ credits: total });
      },

      activateOrbitalBoost(remainingMin: number) {
        const expires = new Date(Date.now() + remainingMin * 60 * 1000).toISOString();
        set({ orbitalBoostExpires: expires });
      },

      applyShopPurchase({ newCredits, xpBoostExpires, scanBoostExpires, idHints }) {
        set(s => ({
          credits:          newCredits,
          xpBoostExpires:   xpBoostExpires  !== undefined ? xpBoostExpires  : s.xpBoostExpires,
          scanBoostExpires: scanBoostExpires !== undefined ? scanBoostExpires : s.scanBoostExpires,
          idHints:          idHints          !== undefined ? idHints          : s.idHints,
        }));
      },

      setPendingBoostDecision(boost) {
        set({ pendingBoostDecision: boost });
      },

      clearPendingBoostDecision() {
        set({ pendingBoostDecision: null });
      },

      addStoredBoost(boost) {
        set(s => ({
          storedBoosts: s.storedBoosts.length < MAX_STORED_BOOSTS
            ? [...s.storedBoosts, boost]
            : s.storedBoosts,
        }));
      },

      consumeStoredBoost(id) {
        set(s => ({ storedBoosts: s.storedBoosts.filter(b => b.id !== id) }));
      },

      clearSession() {
        set({
          userId: null, username: null, accessToken: null,
          xp: 0, level: 1, credits: 0,
          orbitalBoostExpires: null, xpBoostExpires: null,
          scanBoostExpires: null, idHints: 0,
          storedBoosts: [], pendingBoostDecision: null,
        });
      },
    }),
    {
      name: 'player-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
