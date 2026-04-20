import { AppState } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { uploadPhoto } from '@/utils/uploadPhoto';
import { posthog } from '@/lib/posthog';

export type CatchRecord = {
  id: string;
  make: string;
  model: string;
  generation: string;
  generationId: string | null;   // resolved from vehicle DB; null until synced
  rarity: string | null;         // resolved from vehicle DB; null until synced
  bodyStyle: string;
  color: string;
  confidence: number;
  catchType: 'highway' | 'scan360' | 'space' | 'unknown';
  fuzzyCity?: string;
  fuzzyDistrict?: string;
  caughtAt: string;
  synced: boolean;
  xpEarned?: number;             // set after successful backend sync
  firstFinderAwarded?: string | null;
  /** Local file path of the scan photo. Cleared after upload. */
  photoPath?: string;
  /** Ordered [front, passenger, rear, driver] permanent local paths (scan360 only). */
  photoPaths?: string[];
  /** R2 object key — set after successful upload. */
  photoRef?: string;
  /** catchable_objects.id — links the catch to the specific orbital pass window. */
  spaceObjectId?: string;
};

type ResolveResult  = { generation_id: string | null; rarity_tier: string | null };
type CatchResponse  = {
  catch_id: string;
  xp_earned: number;
  new_total_xp: number;
  new_level: number;
  level_up: boolean;
  road_king_claimed: boolean;
  first_finder_awarded: string | null;
  orbital_boost_active: boolean;
  orbital_boost_remaining_min: number;
  // Returned for space catches — client decides USE NOW vs STORE
  orbital_boost_earned?: {
    rarity_tier:  string;
    multiplier:   number;
    duration_min: number;
  } | null;
  duplicate: boolean;
};

async function resolveGenerationId(
  make: string,
  model: string,
  generation: string,
): Promise<ResolveResult> {
  try {
    const params = new URLSearchParams({ make, model, generation });
    return await apiClient.get(`/vehicles/resolve?${params}`) as ResolveResult;
  } catch {
    return { generation_id: null, rarity_tier: null };
  }
}

type AddCatchData = Omit<CatchRecord, 'id' | 'caughtAt' | 'synced' | 'generationId' | 'rarity' | 'photoRef'> & {
  /** Pre-generated ID (e.g. from scan360 so photos are stored under the right dir). */
  catchId?: string;
};

type CatchStore = {
  catches: CatchRecord[];
  syncError: string | null;
  addCatch: (data: AddCatchData) => void;
  removeCatch: (catchId: string) => void;
  syncPending: () => Promise<void>;
  clearSyncError: () => void;
};

export const useCatchStore = create<CatchStore>()(
  persist(
    (set, get) => ({
      catches: [],
      syncError: null,

      clearSyncError() {
        set({ syncError: null });
      },

      removeCatch(catchId: string) {
        set(s => ({ catches: s.catches.filter(c => c.id !== catchId) }));
      },

      addCatch(data) {
        const { catchId, ...rest } = data;
        const record: CatchRecord = {
          ...rest,
          generationId: null,
          rarity:       null,
          photoRef:     undefined,
          id:       catchId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
            // Resolve generation ID + rarity if not yet known
            let generationId = catch_.generationId;
            let rarity       = catch_.rarity;
            if (!generationId) {
              const resolved = await resolveGenerationId(
                catch_.make, catch_.model, catch_.generation,
              );
              generationId = resolved?.generation_id ?? null;
              rarity       = resolved?.rarity_tier   ?? null;
              if (generationId) {
                set(s => ({
                  catches: s.catches.map(c =>
                    c.id === catch_.id ? { ...c, generationId, rarity } : c,
                  ),
                }));
              }
            }

            // Upload scan photo to R2 if the user has opted in.
            // For scan360, use the FRONT photo (photoPaths[0]) as the community image.
            // Prefer the permanent saved path; photoPath is a temp VisionCamera cache path that can be evicted.
            const uploadCandidate = catch_.photoPaths?.[0] ?? catch_.photoPath ?? null;
            let photoRef = catch_.photoRef ?? null;
            if (!photoRef && uploadCandidate) {
              const { contributeScans } = useSettingsStore.getState();
              if (contributeScans) {
                const key = await uploadPhoto(uploadCandidate, catch_.catchType);
                if (key) {
                  photoRef = key;
                  // Store the R2 key locally immediately so retries don't re-upload
                  set(s => ({
                    catches: s.catches.map(c =>
                      c.id === catch_.id ? { ...c, photoRef: key, photoPath: undefined } : c,
                    ),
                  }));
                }
              }
            }

            const res = await apiClient.post('/catches', {
              generation_id:    generationId,
              catch_type:       catch_.catchType,
              color:            catch_.color,
              body_style:       catch_.bodyStyle,
              confidence:       catch_.confidence,
              fuzzy_city:       catch_.fuzzyCity    ?? null,
              fuzzy_district:   catch_.fuzzyDistrict ?? null,
              caught_at:        catch_.caughtAt,
              photo_ref:        photoRef            ?? null,
              space_object_id:  catch_.spaceObjectId ?? null,
            }) as CatchResponse;

            // Sync XP from server-authoritative totals on every catch.
            // setProfile replaces the stored total, correcting any drift
            // that built up while catches were queued offline.
            usePlayerStore.getState().setProfile(res.new_total_xp, res.new_level);
            if (res.xp_earned > 0 && res.level_up) {
              // level_up animation trigger still needs the delta path
              usePlayerStore.getState().applyXp(0, res.new_level);
            }

            // Vehicle catch: activate orbital boost banner if one is currently running
            if (catch_.catchType !== 'space' && res.orbital_boost_active && res.orbital_boost_remaining_min > 0) {
              usePlayerStore.getState().activateOrbitalBoost(res.orbital_boost_remaining_min);
            }
            // Space catch: server tells us what boost was earned; client offers USE NOW / STORE
            // (pendingBoostDecision may already be set if satellite-catch screen set it early)
            if (catch_.catchType === 'space' && res.orbital_boost_earned && !usePlayerStore.getState().pendingBoostDecision) {
              usePlayerStore.getState().setPendingBoostDecision({
                rarityTier:  res.orbital_boost_earned.rarity_tier,
                multiplier:  res.orbital_boost_earned.multiplier,
                durationMin: res.orbital_boost_earned.duration_min,
                objectName:  catch_.model,
                xpEarned:    res.xp_earned,
              });
            }

            set(s => ({
              catches: s.catches.map(c =>
                c.id === catch_.id
                  ? { ...c, synced: true, xpEarned: res.xp_earned, firstFinderAwarded: res.first_finder_awarded }
                  : c,
              ),
            }));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Sync failed';
            set({ syncError: msg });
            posthog.capture('sync_failed', {
              error:      msg,
              catch_type: catch_.catchType,
              pending:    get().catches.filter(c => !c.synced).length,
            });
            break;
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

// Retry unsynced catches whenever the app returns to the foreground.
// Covers the case where the network was unavailable at catch time.
AppState.addEventListener('change', state => {
  if (state === 'active') {
    useCatchStore.getState().syncPending().catch(() => {});
  }
});
