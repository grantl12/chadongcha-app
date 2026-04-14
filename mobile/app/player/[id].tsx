/**
 * Public player card — viewable by anyone with the link.
 * No auth required: calls GET /players/{id}/card
 */

import { View, Text, StyleSheet, Pressable, ActivityIndicator, Share } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

type PlayerCard = {
  player_id:       string;
  username:        string;
  level:           number;
  xp:              number;
  total_catches:   number;
  catches_by_rarity: Record<string, number>;
  road_king_count: number;
  top_badge:       { badge_name: string; vehicle_name: string } | null;
};

const RARITY_COLOR: Record<string, string> = {
  common:    '#333',
  uncommon:  '#4a9eff',
  rare:      '#a855f7',
  epic:      '#f59e0b',
  legendary: '#e63946',
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const RARITY_LABEL: Record<string, string> = {
  common: 'COM', uncommon: 'UNC', rare: 'RARE', epic: 'EPIC', legendary: 'LEG',
};

export default function PlayerCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery<PlayerCard>({
    queryKey: ['player-card', id],
    queryFn:  () => apiClient.get(`/players/${id}/card`) as Promise<PlayerCard>,
    enabled:  !!id,
    staleTime: 60_000,
  });

  async function handleShare() {
    if (!data) return;
    await Share.share({
      message: `Check out ${data.username} on ChaDongCha — Level ${data.level}, ${data.total_catches} catches, ${data.road_king_count} road king territories.`,
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>PLAYER CARD</Text>
        <Pressable style={styles.shareBtn} onPress={handleShare} disabled={!data}>
          <Text style={styles.shareText}>SHARE</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e63946" />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Player not found.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {/* Identity */}
          <View style={styles.identityBlock}>
            <Text style={styles.username}>{data.username}</Text>
            <Text style={styles.levelBadge}>LEVEL {data.level}</Text>
            <Text style={styles.xp}>{data.xp.toLocaleString()} XP</Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{data.total_catches}</Text>
              <Text style={styles.statLabel}>CAUGHT</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: '#e63946' }]}>{data.road_king_count}</Text>
              <Text style={styles.statLabel}>ROAD KING</Text>
            </View>
          </View>

          {/* Rarity breakdown */}
          {data.total_catches > 0 && (
            <View style={styles.raritySection}>
              <Text style={styles.sectionLabel}>COLLECTION</Text>
              <View style={styles.rarityBar}>
                {RARITY_ORDER.map(r => {
                  const count = data.catches_by_rarity[r] ?? 0;
                  const pct   = (count / data.total_catches) * 100;
                  if (pct === 0) return null;
                  return <View key={r} style={[styles.raritySegment, { flex: pct, backgroundColor: RARITY_COLOR[r] }]} />;
                })}
              </View>
              <View style={styles.rarityLegend}>
                {RARITY_ORDER.map(r => {
                  const count = data.catches_by_rarity[r] ?? 0;
                  if (!count) return null;
                  return (
                    <View key={r} style={styles.rarityLegendItem}>
                      <View style={[styles.rarityDot, { backgroundColor: RARITY_COLOR[r] }]} />
                      <Text style={styles.rarityLegendText}>{RARITY_LABEL[r]} {count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Top badge */}
          {data.top_badge && (
            <View style={styles.badgeSection}>
              <Text style={styles.sectionLabel}>TOP BADGE</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.badgeEmoji}>★</Text>
                <View>
                  <Text style={styles.badgeName}>{data.top_badge.badge_name}</Text>
                  <Text style={styles.badgeVehicle}>{data.top_badge.vehicle_name}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0a0a0a' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#141414' },
  backBtn:         { width: 44, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  backText:        { color: '#555', fontSize: 22 },
  title:           { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 4 },
  shareBtn:        { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  shareText:       { color: '#e63946', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint:            { color: '#444', fontSize: 14 },

  card:            { padding: 24, gap: 28 },
  identityBlock:   { gap: 4 },
  username:        { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  levelBadge:      { color: '#e63946', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  xp:              { color: '#444', fontSize: 13, marginTop: 4 },

  statsRow:        { flexDirection: 'row', backgroundColor: '#111', borderRadius: 12, paddingVertical: 20 },
  statCell:        { flex: 1, alignItems: 'center', gap: 4 },
  statValue:       { color: '#fff', fontSize: 28, fontWeight: '900' },
  statLabel:       { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  statDivider:     { width: 1, backgroundColor: '#1a1a1a', marginVertical: 4 },

  raritySection:   { gap: 10 },
  sectionLabel:    { color: '#333', fontSize: 10, fontWeight: '800', letterSpacing: 3 },
  rarityBar:       { height: 6, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', gap: 1 },
  raritySegment:   { borderRadius: 2 },
  rarityLegend:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rarityLegendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  rarityDot:       { width: 6, height: 6, borderRadius: 3 },
  rarityLegendText:{ color: '#555', fontSize: 11, fontWeight: '600' },

  badgeSection:    { gap: 10 },
  badgeRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badgeEmoji:      { color: '#f59e0b', fontSize: 22 },
  badgeName:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  badgeVehicle:    { color: '#555', fontSize: 12, marginTop: 2 },
});
