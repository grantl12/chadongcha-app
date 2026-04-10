import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useCatchStore, CatchRecord } from '@/stores/catchStore';

const RARITY_COLOR: Record<string, string> = {
  common:    '#2a2a2a',
  uncommon:  '#0f2040',
  rare:      '#1e0f40',
  epic:      '#302000',
  legendary: '#3a0a0e',
};

const RARITY_ACCENT: Record<string, string> = {
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

const CATCH_TYPE_LABEL: Record<string, string> = {
  highway: 'HWY',
  scan360: '360°',
  space:   'SPC',
  unknown: '???',
};

function CatchCard({ item }: { item: CatchRecord }) {
  // Use DB rarity if resolved, otherwise infer from confidence while pending
  const rarity = item.rarity ?? (
    item.confidence >= 0.9  ? 'epic'     :
    item.confidence >= 0.8  ? 'rare'     :
    item.confidence >= 0.72 ? 'uncommon' : 'common'
  );
  const bg     = RARITY_COLOR[rarity]   ?? RARITY_COLOR.common;
  const accent = RARITY_ACCENT[rarity]  ?? RARITY_ACCENT.common;
  const label  = RARITY_LABEL[rarity]   ?? 'COMMON';
  const date   = new Date(item.caughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  function handlePress() {
    if (item.generationId) {
      router.push(`/vehicle/${item.generationId}`);
    }
  }

  return (
    <Pressable
      style={[styles.card, { backgroundColor: bg, borderColor: accent + '44' }]}
      onPress={handlePress}
      disabled={!item.generationId}
    >
      {/* Top row: catch type + sync dot */}
      <View style={styles.cardTop}>
        <View style={[styles.typeBadge, { borderColor: accent + '66' }]}>
          <Text style={[styles.typeText, { color: accent }]}>{CATCH_TYPE_LABEL[item.catchType]}</Text>
        </View>
        {!item.synced && <View style={styles.unsyncedDot} />}
        {item.xpEarned ? (
          <Text style={[styles.xpBadge, { color: accent }]}>+{item.xpEarned}</Text>
        ) : null}
      </View>

      {/* Vehicle info */}
      <View style={styles.cardBody}>
        <Text style={styles.cardMake}>{item.make}</Text>
        <Text style={styles.cardModel} numberOfLines={1}>{item.model}</Text>
        <Text style={[styles.cardGen, { color: accent }]} numberOfLines={1}>{item.generation}</Text>
      </View>

      {/* Bottom row: rarity + date */}
      <View style={styles.cardBottom}>
        <Text style={[styles.rarityLabel, { color: accent }]}>{label}</Text>
        <Text style={styles.dateLabel}>{date}</Text>
      </View>

      {/* First finder badge */}
      {item.firstFinderAwarded && (
        <View style={[styles.ffBadge, { borderColor: accent }]}>
          <Text style={[styles.ffText, { color: accent }]}>★ FIRST FINDER</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function GarageScreen() {
  const catches = useCatchStore(s => s.catches);

  if (catches.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>GARAGE</Text>
        <Text style={styles.emptyText}>No catches yet. Hit the road.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GARAGE</Text>
        <Text style={styles.count}>{catches.length} caught</Text>
      </View>
      <FlatList
        data={catches}
        keyExtractor={item => item.id}
        numColumns={2}
        renderItem={({ item }) => <CatchCard item={item} />}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  title:        { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  count:        { color: '#555', fontSize: 13 },
  grid:         { padding: 12, paddingBottom: 40 },
  row:          { gap: 10, marginBottom: 10 },
  card:         { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8, minHeight: 160 },
  cardTop:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeText:     { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  unsyncedDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#555', marginLeft: 'auto' },
  xpBadge:      { fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  cardBody:     { flex: 1, gap: 2 },
  cardMake:     { color: '#666', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  cardModel:    { color: '#fff', fontSize: 17, fontWeight: '800' },
  cardGen:      { fontSize: 11, fontWeight: '600' },
  cardBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rarityLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dateLabel:    { color: '#444', fontSize: 11 },
  ffBadge:      { position: 'absolute', top: 10, right: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  ffText:       { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  empty:        { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  emptyText:    { color: '#444', marginTop: 12, fontSize: 14 },
});
