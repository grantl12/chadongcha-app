import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/api/client';
import { useCatchStore } from '@/stores/catchStore';
import { usePlayerStore } from '@/stores/playerStore';

type FirstFinder = {
  region_scope: string;
  region_value: string;
  badge_name: string;
  awarded_at: string;
  players: { username: string } | null;
};

type Variant = {
  id: string;
  name: string;
  visually_distinct: boolean;
};

type GenerationDetail = {
  id: string;
  common_name: string;
  generation_number: number;
  year_start: number;
  year_end: number | null;
  rarity_tier: string;
  production_volume_annual: number | null;
  production_volume_source: string | null;
  global_catch_count: number;
  first_finders: FirstFinder[];
  variants: Variant[];
  models: {
    name: string;
    class: string;
    makes: { name: string; country: string | null };
  };
};

type RecentCatch = {
  id: string;
  caught_at: string;
  catch_type: string;
  color: string | null;
  players: { username: string } | null;
};

const RARITY_COLOR: Record<string, string> = {
  common:    '#444',
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

const BADGE_EMOJI: Record<string, string> = {
  'City Pioneer':        '🏙',
  'National Spotter':    '🗺',
  'Continental Hunter':  '🌎',
  'Global Elite':        '🌐',
  'World First':         '★',
};

const CATCH_TYPE_LABEL: Record<string, string> = {
  highway: 'HWY',
  scan360: '360°',
  space:   'SPC',
  unknown: '???',
};

function formatVolume(v: number | null): string {
  if (!v) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M / yr`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K / yr`;
  return `${v} / yr`;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function VehicleEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId  = usePlayerStore(s => s.userId);
  const catches = useCatchStore(s => s.catches);

  // Personal stats from local store — no network call needed
  const personalCatches = useMemo(
    () => catches.filter(c => c.generationId === id),
    [catches, id],
  );
  const firstCaughtAt = personalCatches.length > 0
    ? personalCatches[personalCatches.length - 1].caughtAt
    : null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicle', id],
    queryFn:  () => apiClient.get(`/vehicles/generations/${id}`) as Promise<GenerationDetail>,
    enabled:  !!id,
  });

  const { data: recentData } = useQuery({
    queryKey: ['vehicle-recent', id],
    queryFn:  () => apiClient.get(`/catches/recent?generation_id=${id}&limit=8`) as Promise<RecentCatch[]>,
    enabled:  !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e63946" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Vehicle not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← BACK</Text>
        </Pressable>
      </View>
    );
  }

  const accentColor   = RARITY_COLOR[data.rarity_tier] ?? '#444';
  const make          = data.models?.makes?.name ?? '—';
  const model         = data.models?.name ?? '—';
  const years         = data.year_end
    ? `${data.year_start}–${data.year_end}`
    : `${data.year_start}–present`;
  const isLegendary   = data.rarity_tier === 'legendary';
  const isEpic        = data.rarity_tier === 'epic';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backText}>← BACK</Text>
      </Pressable>

      {/* Hero */}
      <View style={[styles.hero, isLegendary && styles.heroLegendary, isEpic && styles.heroEpic]}>
        <View style={[styles.renderPlaceholder, { borderColor: accentColor + '44' }]}>
          <Text style={[styles.renderIcon, { color: accentColor }]}>🚗</Text>
          <Text style={styles.renderHint}>3D render coming soon</Text>
        </View>

        <Text style={styles.heroMake}>{make}{data.models?.makes?.country ? `  ·  ${data.models.makes.country}` : ''}</Text>
        <Text style={styles.heroModel}>{model}</Text>
        <Text style={[styles.heroGen, { color: accentColor }]}>{data.common_name}</Text>

        <View style={[styles.rarityPill, { backgroundColor: accentColor + '22', borderColor: accentColor + '66' }]}>
          <Text style={[styles.rarityText, { color: accentColor }]}>
            {RARITY_LABEL[data.rarity_tier] ?? data.rarity_tier.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Personal catch badge */}
      {personalCatches.length > 0 && (
        <View style={[styles.ownedBanner, { borderColor: accentColor + '44' }]}>
          <Text style={[styles.ownedCount, { color: accentColor }]}>
            {personalCatches.length}×
          </Text>
          <View>
            <Text style={styles.ownedLabel}>IN YOUR GARAGE</Text>
            <Text style={styles.ownedDate}>
              First caught {new Date(firstCaughtAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              {personalCatches[0]?.xpEarned ? `  ·  +${personalCatches.reduce((s, c) => s + (c.xpEarned ?? 0), 0)} XP total` : ''}
            </Text>
          </View>
        </View>
      )}

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatBox label="YEARS"      value={years} />
        <StatBox label="PRODUCTION" value={formatVolume(data.production_volume_annual)} />
        <StatBox label="CLASS"      value={data.models?.class?.toUpperCase() ?? '—'} />
        <StatBox label="CAUGHT"     value={`${data.global_catch_count}×`} accent={accentColor} />
      </View>

      {/* Recent sightings */}
      {recentData && recentData.length > 0 && (
        <Section title="RECENT SIGHTINGS">
          {recentData.map(c => (
            <View key={c.id} style={styles.sightingRow}>
              <View style={styles.sightingLeft}>
                <Text style={styles.sightingPlayer}>
                  {c.players?.username ?? '—'}
                  {c.players && userId && c.players.username ===
                    catches.find(x => x.generationId === id)?.make ? '' : ''}
                </Text>
                {c.color ? <Text style={styles.sightingColor}>{c.color}</Text> : null}
              </View>
              <View style={styles.sightingRight}>
                <View style={styles.typePill}>
                  <Text style={styles.typePillText}>{CATCH_TYPE_LABEL[c.catch_type] ?? '—'}</Text>
                </View>
                <Text style={styles.sightingTime}>{timeAgo(c.caught_at)}</Text>
              </View>
            </View>
          ))}
        </Section>
      )}

      {/* Variants */}
      {data.variants?.length > 0 && (
        <Section title="VARIANTS">
          {data.variants.map(v => (
            <View key={v.id} style={styles.variantRow}>
              <Text style={styles.variantName}>{v.name}</Text>
              {v.visually_distinct && (
                <Text style={styles.variantTag}>DISTINCT</Text>
              )}
            </View>
          ))}
        </Section>
      )}

      {/* First Finders */}
      <Section title="FIRST FINDERS">
        {data.first_finders?.length > 0 ? (
          data.first_finders.map((ff, i) => (
            <View key={i} style={styles.ffRow}>
              <Text style={styles.ffEmoji}>{BADGE_EMOJI[ff.badge_name] ?? '★'}</Text>
              <View style={styles.ffBody}>
                <Text style={styles.ffPlayer}>{ff.players?.username ?? '—'}</Text>
                <Text style={styles.ffBadge}>{ff.badge_name}  ·  {ff.region_value}</Text>
              </View>
              <Text style={styles.ffDate}>
                {new Date(ff.awarded_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.ffEmpty}>No first finders yet — be the first.</Text>
        )}
      </Section>
    </ScrollView>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0a0a0a' },
  content:            { padding: 20, paddingTop: 60, paddingBottom: 60 },
  center:             { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText:          { color: '#555', fontSize: 14 },
  backRow:            { marginBottom: 20 },
  backButton:         {},
  backText:           { color: '#555', fontSize: 13, letterSpacing: 2, fontWeight: '700' },

  hero:               { alignItems: 'center', gap: 8, marginBottom: 20, borderRadius: 16, padding: 20, backgroundColor: '#111' },
  heroLegendary:      { backgroundColor: '#1a0505' },
  heroEpic:           { backgroundColor: '#120e02' },
  renderPlaceholder:  { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', marginBottom: 8, gap: 8 },
  renderIcon:         { fontSize: 48 },
  renderHint:         { color: '#2a2a2a', fontSize: 12 },
  heroMake:           { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  heroModel:          { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  heroGen:            { fontSize: 14, fontWeight: '600' },
  rarityPill:         { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 5, marginTop: 4 },
  rarityText:         { fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  ownedBanner:        { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#111', borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 20 },
  ownedCount:         { fontSize: 32, fontWeight: '900' },
  ownedLabel:         { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  ownedDate:          { color: '#444', fontSize: 12, marginTop: 2 },

  statsGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  statBox:            { flex: 1, minWidth: '45%', backgroundColor: '#111', borderRadius: 10, padding: 14, gap: 4 },
  statLabel:          { color: '#444', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  statValue:          { color: '#fff', fontSize: 16, fontWeight: '700' },

  section:            { marginBottom: 32 },
  sectionTitle:       { color: '#333', fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },

  sightingRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  sightingLeft:       { flex: 1, gap: 2 },
  sightingPlayer:     { color: '#fff', fontSize: 14, fontWeight: '600' },
  sightingColor:      { color: '#444', fontSize: 12 },
  sightingRight:      { alignItems: 'flex-end', gap: 4 },
  typePill:           { backgroundColor: '#1a1a1a', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  typePillText:       { color: '#e63946', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  sightingTime:       { color: '#333', fontSize: 11 },

  variantRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  variantName:        { color: '#fff', fontSize: 14 },
  variantTag:         { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  ffRow:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111', gap: 12 },
  ffEmoji:            { fontSize: 20, width: 28, textAlign: 'center' },
  ffBody:             { flex: 1, gap: 2 },
  ffPlayer:           { color: '#fff', fontSize: 14, fontWeight: '700' },
  ffBadge:            { color: '#555', fontSize: 12 },
  ffDate:             { color: '#333', fontSize: 12 },
  ffEmpty:            { color: '#333', fontSize: 13, fontStyle: 'italic' },
});
