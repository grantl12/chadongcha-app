import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { apiClient } from '@/api/client';
import {
  usePlayerStore,
  type StoredBoost,
  MAX_STORED_BOOSTS,
} from '@/stores/playerStore';

const RARITY_COLOR: Record<string, string> = {
  common:    '#555',
  uncommon:  '#4a9eff',
  rare:      '#a855f7',
  epic:      '#f59e0b',
  legendary: '#e63946',
};

const RARITY_LABEL: Record<string, string> = {
  common:    'COMMON',
  uncommon:  'UNCOMMON',
  rare:      'RARE',
  epic:      'EPIC',
  legendary: 'LEGENDARY',
};

export function BoostDecisionModal() {
  const pending              = usePlayerStore(s => s.pendingBoostDecision);
  const clearPending         = usePlayerStore(s => s.clearPendingBoostDecision);
  const addStoredBoost       = usePlayerStore(s => s.addStoredBoost);
  const activateOrbitalBoost = usePlayerStore(s => s.activateOrbitalBoost);
  const storedBoosts         = usePlayerStore(s => s.storedBoosts);

  if (!pending) return null;

  const color       = RARITY_COLOR[pending.rarityTier]  ?? '#555';
  const rarityLabel = RARITY_LABEL[pending.rarityTier]  ?? 'COMMON';
  const canStore    = storedBoosts.length < MAX_STORED_BOOSTS;

  async function useNow() {
    // Activate locally for instant banner feedback
    activateOrbitalBoost(pending!.durationMin);
    clearPending();
    // Tell backend so server-side XP boost fires on next vehicle catch
    try {
      await apiClient.post('/boosts/activate', { rarity_tier: pending!.rarityTier });
    } catch {
      // Non-fatal — server falls back to catch-time derivation
    }
  }

  function store() {
    if (!canStore) return;
    const boost: StoredBoost = {
      id:          `boost-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      rarityTier:  pending!.rarityTier,
      multiplier:  pending!.multiplier,
      durationMin: pending!.durationMin,
      objectName:  pending!.objectName,
      storedAt:    new Date().toISOString(),
    };
    addStoredBoost(boost);
    clearPending();
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>

          {/* Caught header */}
          <View style={styles.header}>
            <View style={[styles.rarityPip, { backgroundColor: color }]} />
            <View>
              <Text style={styles.caughtLabel}>SATELLITE CAUGHT</Text>
              <Text style={styles.objectName} numberOfLines={1}>{pending.objectName}</Text>
              <Text style={[styles.rarityText, { color }]}>{rarityLabel}</Text>
            </View>
          </View>

          {/* Boost box */}
          <View style={[styles.boostBox, { borderColor: color + '44', backgroundColor: color + '0d' }]}>
            <Text style={styles.boostIcon}>⚡</Text>
            <View style={styles.boostMeta}>
              <Text style={[styles.boostMulti, { color }]}>
                {pending.multiplier}× ORBITAL BOOST
              </Text>
              <Text style={styles.boostDesc}>
                {pending.durationMin}m · applies to all vehicle catches
              </Text>
            </View>
          </View>

          {/* Stored indicator */}
          <View style={styles.storageRow}>
            <Text style={styles.storageLabel}>BOOST STORAGE</Text>
            <View style={styles.storagePips}>
              {Array.from({ length: MAX_STORED_BOOSTS }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.storagePip,
                    i < storedBoosts.length && { backgroundColor: '#4a9eff' },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.storageCount}>{storedBoosts.length}/{MAX_STORED_BOOSTS}</Text>
          </View>

          {/* Actions */}
          <Pressable style={[styles.useNowBtn, { backgroundColor: color }]} onPress={useNow}>
            <Text style={styles.useNowText}>USE NOW</Text>
            <Text style={styles.useNowSub}>{pending.multiplier}× for {pending.durationMin}m</Text>
          </Pressable>

          <Pressable
            style={[styles.storeBtn, !canStore && styles.storeBtnDisabled]}
            onPress={store}
            disabled={!canStore}
          >
            <Text style={[styles.storeText, !canStore && styles.storeTextDim]}>
              {canStore ? 'STORE FOR LATER' : `STORAGE FULL · ${MAX_STORED_BOOSTS}/${MAX_STORED_BOOSTS}`}
            </Text>
          </Pressable>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: '#000000cc',
    justifyContent:  'flex-end',
  },
  card: {
    backgroundColor:     '#111',
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:             28,
    gap:                 16,
    borderTopWidth:      1,
    borderColor:         '#1a1a1a',
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rarityPip: { width: 10, height: 40, borderRadius: 5 },
  caughtLabel: { color: '#444', fontSize: 10, fontWeight: '800', letterSpacing: 3 },
  objectName:  { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  rarityText:  { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: 2 },

  boostBox: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    borderWidth:   1,
    borderRadius:  10,
    padding:       14,
  },
  boostIcon:  { fontSize: 24 },
  boostMeta:  { flex: 1, gap: 3 },
  boostMulti: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  boostDesc:  { color: '#555', fontSize: 12 },

  storageRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storageLabel:{ color: '#333', fontSize: 10, fontWeight: '800', letterSpacing: 2, flex: 1 },
  storagePips: { flexDirection: 'row', gap: 5 },
  storagePip:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#222' },
  storageCount:{ color: '#444', fontSize: 11, fontWeight: '700' },

  useNowBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', gap: 2 },
  useNowText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  useNowSub:  { color: '#00000088', fontSize: 11, fontWeight: '600' },

  storeBtn: {
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
    backgroundColor: '#1a1a1a',
    borderWidth:     1,
    borderColor:     '#2a2a2a',
  },
  storeBtnDisabled: { opacity: 0.4 },
  storeText:    { color: '#aaa', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  storeTextDim: { color: '#444' },
});
