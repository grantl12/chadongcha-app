import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/api/client';

export type CatchRecord = {
  id: string;
  make: string;
  model: string;
  generation: string;
  generationId: string | null;   // resolved from vehicle DB; null until synced
  bodyStyle: string;
  color: string;
  confidence: number;
  catchType: 'highway' | 'scan360' | 'space' | 'unknown';
  fuzzyCity?: string;
  caughtAt: string;
  synced: boolean;
};

type ResolveResult = { generation_id: string | null; rarity_tier: string | null };

async function resolveGenerationId(
  make: string,
  model: string,
  generation: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ make, model, generation });
    const res = await apiClient.get(`/vehicles/resolve?${params}`) as ResolveResult;
    return res.generation_id ?? null;
  } catch {
    return null;
  }
}

type CatchStore = {
  catches: CatchRecord[];
  addCatch: (data: Omit<CatchRecord, 'id' | 'caughtAt' | 'synced' | 'generationId'>) => void;
  syncPending: () => Promise<void>;
};

export const useCatchStore = create<CatchStore>()(
  persist(
    (set, get) => ({
      catches: [],

      addCatch(data) {
        const record: CatchRecord = {
          ...data,
          generationId: null,
          id:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          caughtAt: new Date().toISOString(),
          synced:   false,
        };
        set(s => ({ catches: [record, ...s.catches] }));
        get().syncPending().catch(() => {});
      },

      async syncPending() {
        const pending = get().catches.filter(c => !c.synced);
        for (const catch_ of pending) {
          try {
            // Resolve generation ID if not yet known
            let generationId = catch_.generationId;
            if (!generationId) {
              generationId = await resolveGenerationId(
                catch_.make, catch_.model, catch_.generation,
              );
              if (generationId) {
                set(s => ({
                  catches: s.catches.map(c =>
                    c.id === catch_.id ? { ...c, generationId } : c,
                  ),
                }));
              }
            }

            await apiClient.post('/catches', {
              generation_id: generationId,
              catch_type:    catch_.catchType,
              color:         catch_.color,
              body_style:    catch_.bodyStyle,
              confidence:    catch_.confidence,
              fuzzy_city:    catch_.fuzzyCity ?? null,
              caught_at:     catch_.caughtAt,
            });

            set(s => ({
              catches: s.catches.map(c =>
                c.id === catch_.id ? { ...c, synced: true } : c,
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
    },
  ),
);
