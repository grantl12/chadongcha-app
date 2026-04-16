import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Switch, TextInput, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePlayerStore } from '@/stores/playerStore';
import { useCatchStore } from '@/stores/catchStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { apiClient } from '@/api/client';
import { sha256Plate } from '@/utils/plateHash';

// ─── Level math (mirrors backend _level_for_xp) ────────────────────────────
// Bands: [level, xpMin, xpMax | null]
const LEVEL_BANDS = [
  { level: 1,  xpMin: 0,       xpMax: 2001 },
  { level: 6,  xpMin: 2001,    xpMax: 10001 },
  { level: 11, xpMin: 10001,   xpMax: 50001 },
  { level: 21, xpMin: 50001,   xpMax: 200001 },
  { level: 36, xpMin: 200001,  xpMax: 1000001 },
  { level: 51, xpMin: 1000001, xpMax: null },
] as const;

function levelProgress(xp: number): { progress: number; xpInBand: number; bandSize: number; nextLevel: number } {
  for (let i = 0; i < LEVEL_BANDS.length; i++) {
    const band = LEVEL_BANDS[i];
    const next = LEVEL_BANDS[i + 1];
    if (!next || xp < next.xpMin) {
      const xpInBand  = xp - band.xpMin;
      const bandSize  = band.xpMax ? band.xpMax - band.xpMin : 0;
      const progress  = bandSize > 0 ? Math.min(xpInBand / bandSize, 1) : 1;
      const nextLevel = next?.level ?? band.level;
      return { progress, xpInBand, bandSize, nextLevel };
    }
  }
  return { progress: 1, xpInBand: 0, bandSize: 0, nextLevel: 51 };
}

// ─── Types ──────────────────────────────────────────────────────────────────
type PlayerStats = {
  total_catches: number;
  catches_by_rarity: Record<string, number>;
  road_king_count: number;
  first_finder_badges: {
    badge_name: string;
    region_scope: string;
    region_value: string;
    awarded_at: string;
    vehicle_name: string;
  }[];
};

// ─── Constants ───────────────────────────────────────────────────────────────
const RARITY_ORDER   = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const RARITY_COLOR: Record<string, string> = {
  common:    '#333',
  uncommon:  '#4a9eff',
  rare:      '#a855f7',
  epic:      '#f59e0b',
  legendary: '#e63946',
};
const RARITY_LABEL: Record<string, string> = {
  common:    'COM',
  uncommon:  'UNC',
  rare:      'RARE',
  epic:      'EPIC',
  legendary: 'LEG',
};
const BADGE_EMOJI: Record<string, string> = {
  'City Pioneer':       '🏙',
  'National Spotter':   '🗺',
  'Continental Hunter': '🌎',
  'Global Elite':       '🌐',
  'World First':        '★',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function BoostBanner({ expires }: { expires: string | null }) {
  if (!expires) return null;
  const remaining = Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 60000));
  if (remaining <= 0) return null;
  return (
    <View style={styles.boostBanner}>
      <Text style={styles.boostIcon}>⚡</Text>
      <View>
        <Text style={styles.boostTitle}>ORBITAL BOOST ACTIVE</Text>
        <Text style={styles.boostSub}>{remaining}m remaining · XP multiplier on all catches</Text>
      </View>
    </View>
  );
}

function RarityBar({ byRarity, total }: { byRarity: Record<string, number>; total: number }) {
  if (total === 0) return null;
  return (
    <View style={styles.raritySection}>
      {/* Stacked bar */}
      <View style={styles.rarityBar}>
        {RARITY_ORDER.map(r => {
          const count = byRarity[r] ?? 0;
          const pct   = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <View
              key={r}
              style={[styles.raritySegment, { flex: pct, backgroundColor: RARITY_COLOR[r] }]}
            />
          );
        })}
      </View>
      {/* Legend */}
      <View style={styles.rarityLegend}>
        {RARITY_ORDER.map(r => {
          const count = byRarity[r] ?? 0;
          if (count === 0) return null;
          return (
            <View key={r} style={styles.rarityLegendItem}>
              <View style={[styles.rarityDot, { backgroundColor: RARITY_COLOR[r] }]} />
              <Text style={styles.rarityLegendText}>
                {RARITY_LABEL[r]} {count}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const {
    xp, level, username, userId,
    clearSession, setPlayer, setProfile,
    accessToken, orbitalBoostExpires,
  } = usePlayerStore();
  const { privacyShieldEnabled, togglePrivacyShield, contributeScans, toggleContributeScans } = useSettingsStore();
  const queryClient = useQueryClient();
  const [plateInput, setPlateInput] = useState('');
  const [plateLabel, setPlateLabel] = useState('');
  const [addingPlate, setAddingPlate] = useState(false);
  const [showPlateForm, setShowPlateForm] = useState(false);

  const { data: plateHashes, refetch: refetchPlates } = useQuery<{ id: string; label: string | null; created_at: string }[]>({
    queryKey: ['plate-hashes', userId],
    queryFn:  () => apiClient.get('/players/plate-hashes') as Promise<{ id: string; label: string | null; created_at: string }[]>,
    enabled:  !!accessToken,
  });

  async function handleAddPlate() {
    if (!plateInput.trim()) return;
    setAddingPlate(true);
    try {
      const hash = await sha256Plate(plateInput.trim());
      await apiClient.post('/players/plate-hashes', {
        plate_hash: hash,
        label: plateLabel.trim() || null,
      });
      setPlateInput('');
      setPlateLabel('');
      setShowPlateForm(false);
      refetchPlates();
    } catch (e: any) {
      const msg = e?.message ?? '';
      Alert.alert('Error', msg.includes('409') ? 'That plate is already registered.' : 'Could not register plate.');
    } finally {
      setAddingPlate(false);
    }
  }

  async function handleRemovePlate(id: string) {
    try {
      await apiClient.delete(`/players/plate-hashes/${id}`);
      refetchPlates();
    } catch {
      Alert.alert('Error', 'Could not remove plate.');
    }
  }

  // Re-sync from server each focus
  useFocusEffect(useCallback(() => {
    if (!accessToken || !userId) return;
    apiClient.get('/auth/me')
      .then((profile: any) => {
        setPlayer({ userId, username: profile.username, accessToken });
        setProfile(profile.xp, profile.level);
      })
      .catch(() => {});
  }, [accessToken, userId]));

  const { data: stats, isLoading: statsLoading } = useQuery<PlayerStats>({
    queryKey: ['player-stats', userId],
    queryFn:  () => apiClient.get(`/players/${userId}/stats`) as Promise<PlayerStats>,
    enabled:  !!userId,
    staleTime: 60_000,
  });

  const { progress, xpInBand, bandSize, nextLevel } = levelProgress(xp);
  const xpToNext = bandSize > 0 ? bandSize - xpInBand : 0;
  const atMaxLevel = level >= 51;

  function handleSignOut() {
    clearSession();
    router.replace('/onboarding');
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Identity block */}
      <View style={styles.identityBlock}>
        <Text style={styles.username}>{username ?? 'Driver'}</Text>
        <Text style={styles.levelLabel}>LEVEL {level}</Text>

        {/* XP progress */}
        <View style={styles.xpRow}>
          <Text style={styles.xpCurrent}>{xp.toLocaleString()} XP</Text>
          {!atMaxLevel && (
            <Text style={styles.xpNext}>{xpToNext.toLocaleString()} to LV {nextLevel}</Text>
          )}
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>

      {/* Orbital Boost */}
      <BoostBanner expires={orbitalBoostExpires} />

      {/* Key stats */}
      <View style={styles.statsRow}>
        <StatCell
          value={statsLoading ? '—' : String(stats?.total_catches ?? 0)}
          label="CAUGHT"
          accent="#fff"
        />
        <View style={styles.statDivider} />
        <StatCell
          value={statsLoading ? '—' : String(stats?.road_king_count ?? 0)}
          label="ROAD KING"
          accent="#e63946"
        />
        <View style={styles.statDivider} />
        <StatCell
          value={xp.toLocaleString()}
          label="TOTAL XP"
        />
      </View>

      {/* Collection rarity breakdown */}
      {!statsLoading && stats && stats.total_catches > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COLLECTION</Text>
          <RarityBar byRarity={stats.catches_by_rarity} total={stats.total_catches} />
        </View>
      )}

      {/* First finder badges */}
      {!statsLoading && stats && stats.first_finder_badges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FIRST FINDER BADGES</Text>
          {stats.first_finder_badges.map((b, i) => (
            <View key={i} style={styles.badgeRow}>
              <Text style={styles.badgeEmoji}>{BADGE_EMOJI[b.badge_name] ?? '★'}</Text>
              <View style={styles.badgeBody}>
                <Text style={styles.badgeName}>{b.badge_name}</Text>
                <Text style={styles.badgeVehicle}>{b.vehicle_name}</Text>
              </View>
              <Text style={styles.badgeRegion}>{b.region_value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty badges hint */}
      {!statsLoading && stats && stats.first_finder_badges.length === 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FIRST FINDER BADGES</Text>
          <Text style={styles.emptyHint}>Catch a rare vehicle before anyone else to earn badges.</Text>
        </View>
      )}

      {/* My Plates */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>MY PLATES</Text>
          <Pressable onPress={() => setShowPlateForm(v => !v)}>
            <Text style={styles.sectionAction}>{showPlateForm ? 'CANCEL' : '+ ADD'}</Text>
          </Pressable>
        </View>
        <Text style={styles.plateHint}>
          Register your plate. When another player catches your car, they earn bonus XP — and you'll be notified.
          Your plate is hashed on-device and never leaves it.
        </Text>

        {showPlateForm && (
          <View style={styles.plateForm}>
            <TextInput
              style={styles.plateInput}
              placeholder="Plate number (e.g. ABC 1234)"
              placeholderTextColor="#444"
              value={plateInput}
              onChangeText={setPlateInput}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              style={styles.plateInput}
              placeholder="Label (optional — e.g. Daily driver)"
              placeholderTextColor="#444"
              value={plateLabel}
              onChangeText={setPlateLabel}
              autoCorrect={false}
            />
            <Pressable
              style={[styles.plateAddBtn, addingPlate && { opacity: 0.6 }]}
              onPress={handleAddPlate}
              disabled={addingPlate}
            >
              {addingPlate
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.plateAddBtnText}>REGISTER</Text>
              }
            </Pressable>
          </View>
        )}

        {(plateHashes ?? []).length === 0 && !showPlateForm && (
          <Text style={styles.emptyHint}>No plates registered yet.</Text>
        )}

        {(plateHashes ?? []).map(ph => (
          <View key={ph.id} style={styles.plateRow}>
            <View style={styles.plateDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.plateLabel}>{ph.label ?? 'Plate'}</Text>
              <Text style={styles.plateDate}>
                Registered {new Date(ph.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
            <Pressable onPress={() => handleRemovePlate(ph.id)} hitSlop={12}>
              <Text style={styles.plateRemove}>REMOVE</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SETTINGS</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingBody}>
            <Text style={styles.settingLabel}>Privacy Shield</Text>
            <Text style={styles.settingDesc}>Blur faces and plates on photos before community sharing</Text>
          </View>
          <Switch
            value={privacyShieldEnabled}
            onValueChange={togglePrivacyShield}
            trackColor={{ false: '#222', true: '#e63946' }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingBody}>
            <Text style={styles.settingLabel}>Contribute Scans</Text>
            <Text style={styles.settingDesc}>
              Anonymized scan photos are uploaded after each catch to help improve the AI model.
              Photos may be visible to community reviewers.{'\n'}
              <Text style={styles.settingDisclaimer}>
                Do not include people, license plates, or private property in frame.
                See our Terms of Service for details.
              </Text>
            </Text>
          </View>
          <Switch
            value={contributeScans}
            onValueChange={toggleContributeScans}
            trackColor={{ false: '#222', true: '#4a9eff' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={() => router.push('/leaderboard')}>
          <Text style={styles.actionText}>LEADERBOARD</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.signOutButton]} onPress={handleSignOut}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function StatCell({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#0a0a0a' },
  content:           { padding: 24, paddingTop: 72, paddingBottom: 48, gap: 24 },

  identityBlock:     { gap: 6 },
  username:          { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  levelLabel:        { color: '#e63946', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  xpRow:             { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  xpCurrent:         { color: '#888', fontSize: 13 },
  xpNext:            { color: '#333', fontSize: 13 },
  barTrack:          { height: 3, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  barFill:           { height: 3, backgroundColor: '#e63946', borderRadius: 2 },

  boostBanner:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1200', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  boostIcon:         { fontSize: 20 },
  boostTitle:        { color: '#f59e0b', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  boostSub:          { color: '#f59e0b66', fontSize: 11, marginTop: 2 },

  statsRow:          { flexDirection: 'row', backgroundColor: '#111', borderRadius: 12, paddingVertical: 20 },
  statCell:          { flex: 1, alignItems: 'center', gap: 4 },
  statValue:         { color: '#fff', fontSize: 24, fontWeight: '900' },
  statLabel:         { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  statDivider:       { width: 1, backgroundColor: '#1a1a1a', marginVertical: 4 },

  section:           { gap: 12 },
  sectionTitle:      { color: '#333', fontSize: 10, fontWeight: '800', letterSpacing: 3 },
  emptyHint:         { color: '#2a2a2a', fontSize: 13, fontStyle: 'italic' },

  raritySection:     { gap: 10 },
  rarityBar:         { height: 6, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', gap: 1 },
  raritySegment:     { borderRadius: 2 },
  rarityLegend:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rarityLegendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rarityDot:         { width: 6, height: 6, borderRadius: 3 },
  rarityLegendText:  { color: '#555', fontSize: 11, fontWeight: '600' },

  badgeRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111', gap: 12 },
  badgeEmoji:        { fontSize: 20, width: 28, textAlign: 'center' },
  badgeBody:         { flex: 1, gap: 2 },
  badgeName:         { color: '#fff', fontSize: 14, fontWeight: '700' },
  badgeVehicle:      { color: '#555', fontSize: 12 },
  badgeRegion:       { color: '#333', fontSize: 11 },

  sectionHeaderRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionAction:     { color: '#e63946', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  plateHint:         { color: '#333', fontSize: 12, lineHeight: 17 },
  plateForm:         { gap: 8, marginTop: 4 },
  plateInput:        { backgroundColor: '#141414', color: '#fff', borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#222' },
  plateAddBtn:       { backgroundColor: '#e63946', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  plateAddBtnText:   { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 2 },
  plateRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111', gap: 12 },
  plateDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e63946' },
  plateLabel:        { color: '#fff', fontSize: 14, fontWeight: '600' },
  plateDate:         { color: '#333', fontSize: 11, marginTop: 2 },
  plateRemove:       { color: '#333', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  settingRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  settingBody:       { flex: 1, gap: 3 },
  settingLabel:      { color: '#fff', fontSize: 14, fontWeight: '600' },
  settingDesc:       { color: '#444', fontSize: 12, lineHeight: 16 },
  settingDisclaimer: { color: '#333', fontSize: 11, fontStyle: 'italic' },

  actions:           { gap: 10, marginTop: 8 },
  actionButton:      { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  signOutButton:     { backgroundColor: 'transparent', borderColor: '#1a1a1a' },
  actionText:        { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  signOutText:       { color: '#333', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
});
