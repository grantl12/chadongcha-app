import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  Pressable, SectionList,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';

type FeedCatch = {
  id: string;
  caught_at: string;
  catch_type: 'highway' | 'scan360' | 'space' | 'unknown';
  confidence: number | null;
  color: string | null;
  body_style: string | null;
  player_id: string;
  players: { username: string } | null;
  generations: {
    common_name: string;
    rarity_tier: string;
    models: { name: string; makes: { name: string } };
  } | null;
  catchable_objects: {
    space_objects: {
      name: string;
      object_type: string;
      rarity_tier: string;
    } | null;
  } | null;
};

type Section = { title: string; data: FeedCatch[] };

const RARITY_COLOR: Record<string, string> = {
  common:    '#555',
  uncommon:  '#4a9eff',
  rare:      '#a855f7',
  epic:      '#f59e0b',
  legendary: '#e63946',
};

const CATCH_TYPE_LABEL: Record<string, string> = {
  highway: 'SENTRY',
  scan360: '360°',
  space:   'SPC',
  unknown: '???',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function sectionLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today))     return 'TODAY';
  if (sameDay(d, yesterday)) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function groupBySections(catches: FeedCatch[]): Section[] {
  const map = new Map<string, FeedCatch[]>();
  for (const c of catches) {
    const label = sectionLabel(c.caught_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(c);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function vehicleInfo(item: FeedCatch) {
  const spaceObj = item.catchable_objects?.space_objects;
  if (item.catch_type === 'space' && spaceObj) {
    return {
      make:    'Space Object',
      model:   spaceObj.name,
      name:    spaceObj.object_type,
      rarity:  spaceObj.rarity_tier,
    };
  }
  const gen   = item.generations;
  const make  = gen?.models?.makes?.name ?? '?';
  const model = gen?.models?.name ?? '?';
  const name  = gen?.common_name ?? 'Unknown Vehicle';
  const rarity = gen?.rarity_tier ?? 'common';
  return { make, model, name, rarity };
}

function FeedItem({ item, isMe }: { item: FeedCatch; isMe: boolean }) {
  const { make, model, name, rarity } = vehicleInfo(item);
  const rarityColor   = RARITY_COLOR[rarity] ?? '#555';
  const isLegendary   = rarity === 'legendary';
  const isEpic        = rarity === 'epic';
  const isSpace       = item.catch_type === 'space';

  return (
    <View style={[
      styles.item,
      isLegendary && styles.itemLegendary,
      isEpic      && styles.itemEpic,
      isMe        && styles.itemMine,
    ]}>
      <View style={styles.itemLeft}>
        <View style={[styles.rarityBar, { backgroundColor: rarityColor }]} />
      </View>

      <View style={styles.itemBody}>
        <Text style={styles.itemMake}>
          {isSpace ? '🛰  SPACE' : make}
        </Text>
        <Text style={styles.itemModel}>{model}</Text>
        <Text style={[styles.itemGen, { color: rarityColor }]}>{name}</Text>
        {!isSpace && (item.color || item.body_style) ? (
          <Text style={styles.itemMeta}>
            {[item.color, item.body_style].filter(Boolean).join('  ·  ')}
          </Text>
        ) : null}
        {!isSpace && item.confidence != null ? (
          <Text style={styles.itemConf}>{Math.round(item.confidence * 100)}% conf</Text>
        ) : null}
      </View>

      <View style={styles.itemRight}>
        <View style={[styles.typeBadge, isSpace && styles.typeBadgeSpace]}>
          <Text style={[styles.typeBadgeText, isSpace && styles.typeBadgeTextSpace]}>
            {CATCH_TYPE_LABEL[item.catch_type]}
          </Text>
        </View>
        <Text style={[styles.itemPlayer, isMe && styles.itemPlayerMe]}>
          {item.players?.username ?? '—'}
        </Text>
        <Text style={styles.itemTime}>{timeAgo(item.caught_at)}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

type Filter = 'all' | 'mine';

export default function FeedScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const userId = usePlayerStore(s => s.userId);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['feed', filter, userId],
    queryFn: () => {
      const base = '/catches/recent?limit=50';
      const url  = filter === 'mine' && userId ? `${base}&player_id=${userId}` : base;
      return apiClient.get(url) as Promise<FeedCatch[]>;
    },
    refetchInterval: 30_000,
  });

  const sections = useMemo(
    () => groupBySections(data ?? []),
    [data],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>FEED</Text>
          {isFetching && !isLoading && (
            <ActivityIndicator size="small" color="#333" />
          )}
        </View>

        {/* Filter tabs */}
        <View style={styles.tabs}>
          {(['all', 'mine'] as Filter[]).map(f => (
            <Pressable
              key={f}
              style={[styles.tab, filter === f && styles.tabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                {f === 'all' ? 'GLOBAL' : 'MINE'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e63946" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load feed.</Text>
          <Pressable onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>RETRY</Text>
          </Pressable>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>
            {filter === 'mine' ? 'NO CATCHES YET' : 'EMPTY'}
          </Text>
          <Text style={styles.emptyText}>
            {filter === 'mine'
              ? 'Head to Radar and start hunting.'
              : 'No catches yet. Be the first.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <FeedItem item={item} isMe={item.player_id === userId} />
          )}
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isFetching}
          stickySectionHeadersEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0a0a0a' },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header:             { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:              { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 3 },

  tabs:               { flexDirection: 'row', gap: 0 },
  tab:                { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:          { borderBottomColor: '#e63946' },
  tabText:            { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  tabTextActive:      { color: '#fff' },

  sectionHeader:      { backgroundColor: '#0a0a0a', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#111' },
  sectionTitle:       { color: '#333', fontSize: 10, fontWeight: '800', letterSpacing: 3 },

  list:               { paddingBottom: 40 },

  item:               { flexDirection: 'row', paddingVertical: 14, paddingRight: 20, borderBottomWidth: 1, borderBottomColor: '#111' },
  itemLegendary:      { backgroundColor: '#1a0505' },
  itemEpic:           { backgroundColor: '#120e02' },
  itemMine:           { backgroundColor: '#110008' },

  itemLeft:           { width: 20, alignItems: 'center', paddingTop: 4 },
  rarityBar:          { width: 3, height: '100%', borderRadius: 2, minHeight: 40 },

  itemBody:           { flex: 1, paddingLeft: 12, gap: 2 },
  itemMake:           { color: '#555', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  itemModel:          { color: '#fff', fontSize: 17, fontWeight: '700' },
  itemGen:            { fontSize: 12, fontWeight: '600' },
  itemMeta:           { color: '#444', fontSize: 12, marginTop: 2 },
  itemConf:           { color: '#2a2a2a', fontSize: 11, marginTop: 1 },

  itemRight:          { alignItems: 'flex-end', gap: 4, justifyContent: 'center' },
  typeBadge:          { backgroundColor: '#1a1a1a', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  typeBadgeSpace:     { backgroundColor: '#0d1a2e' },
  typeBadgeText:      { color: '#e63946', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  typeBadgeTextSpace: { color: '#4a9eff' },
  itemPlayer:         { color: '#555', fontSize: 12 },
  itemPlayerMe:       { color: '#e63946' },
  itemTime:           { color: '#2a2a2a', fontSize: 11 },

  emptyTitle:         { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 4 },
  emptyText:          { color: '#444', fontSize: 14 },
  errorText:          { color: '#555', fontSize: 14 },
  retryButton:        { borderWidth: 1, borderColor: '#333', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:          { color: '#888', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
});
