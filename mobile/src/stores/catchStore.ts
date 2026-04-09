import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/api/client';

export type CatchRecord = {
  id: string;
  make: string;
  model: string;
  generation: string;
  bodyStyle: string;
  color: string;
  confidence: number;
  catchType: 'highway' | 'scan360' | 'space' | 'unknown';
  fuzzyCity?: string;
  caughtAt: string;
  synced: boolean;
};

type CatchStore = {
  catches: CatchRecord[];
  addCatch: (data: Omit<CatchRecord, 'id' | 'caughtAt' | 'synced'>) => void;
  syncPending: () => Promise<void>;
};

export const useCatchStore = create<CatchStore>()(
  persist(
    (set, get) => ({
      catches: [],

      addCatch(data) {
        const record: CatchRecord = {
          ...data,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          caughtAt: new Date().toISOString(),
          synced: false,
        };
        set(s => ({ catches: [record, ...s.catches] }));
        // Fire-and-forget sync attempt
        get().syncPending().catch(() => {});
      },

      async syncPending() {
        const pending = get().catches.filter(c => !c.synced);
        for (const catch_ of pending) {
          try {
            await apiClient.post('/catches', {
              generation_id: null,          // TODO: resolve from vehicle DB lookup
              catch_type: catch_.catchType,
              color: catch_.color,
              body_style: catch_.bodyStyle,
              confidence: catch_.confidence,
              fuzzy_city: catch_.fuzzyCity,
              caught_at: catch_.caughtAt,
            });
            set(s => ({
              catches: s.catches.map(c =>
                c.id === catch_.id ? { ...c, synced: true } : c
              ),
            }));
          } catch {
            // Network unavailable — will retry on next call
          }
        }
      },
    }),
    {
      name: 'catch-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
