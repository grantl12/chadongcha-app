import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useCatchStore, type CatchRecord } from '@/stores/catchStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useMarketStore, type MarketListing } from '@/stores/marketStore';
import { GarageCarousel } from '@/components/GarageCarousel';
import { computeBadges, type Badge, type BadgeCategory } from '@/utils/badges';

// ─── Constants ───────────────────────────────────────────────────────────────

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
  highway: 'SENTRY',
  scan360: '360°',
  space:   'SPC',
  unknown: '???',
};

const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  enthusiast: 'ENTHUSIAST',
  grind:      'GRIND',
  rarity:     'RARITY',
  style:      'STYLE',
  decade:     'DECADE',
  social:     'SOCIAL',
  collection: 'COLLECTION',
};

type GarageTab = 'catches' | 'collection' | 'market';
type CatchViewMode = 'grid' | '3d';

// ─── CatchCard ───────────────────────────────────────────────────────────────

function CatchCard({ item }: { item: CatchRecord }) {
  const rarity = item.rarity ?? (
    item.confidence >= 0.9  ? 'epic'     :
    item.confidence >= 0.8  ? 'rare'     :
    item.confidence >= 0.72 ? 'uncommon' : 'common'
  );
  const bg     = RARITY_COLOR[rarity]  ?? RARITY_COLOR.common;
  const accent = RARITY_ACCENT[rarity] ?? RARITY_ACCENT.common;
  const label  = RARITY_LABEL[rarity]  ?? 'COMMON';
  const date   = new Date(item.caughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Pressable
      style={[styles.card, { backgroundColor: bg, borderColor: accent + '44' }]}
      onPress={() => item.generationId && router.push(`/vehicle/${item.generationId}`)}
      disabled={!item.generationId}
    >
      <View style={styles.cardTop}>
        <View style={[styles.typeBadge, { borderColor: accent + '66' }]}>
          <Text style={[styles.typeText, { color: accent }]}>{CATCH_TYPE_LABEL[item.catchType]}</Text>
        </View>
        {!item.synced && <View style={styles.unsyncedDot} />}
        {item.xpEarned ? <Text style={[styles.xpBadge, { color: accent }]}>+{item.xpEarned}</Text> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardMake}>{item.make}</Text>
        <Text style={styles.cardModel} numberOfLines={1}>{item.model}</Text>
        <Text style={[styles.cardGen, { color: accent }]} numberOfLines={1}>{item.generation}</Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={[styles.rarityLabel, { color: accent }]}>{label}</Text>
        <Text style={styles.dateLabel}>{date}</Text>
      </View>
      {item.firstFinderAwarded && (
        <View style={[styles.ffBadge, { borderColor: accent }]}>
          <Text style={[styles.ffText, { color: accent }]}>★ FIRST FINDER</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── BadgeCard ───────────────────────────────────────────────────────────────

function BadgeCard({ badge }: { badge: Badge }) {
  const [expanded, setExpanded] = useState(false);
  const pct = badge.progress
    ? badge.progress.current / badge.progress.total
    : badge.earned ? 1 : 0;

  return (
    <Pressable
      style={[
        styles.badgeCard,
        { borderColor: badge.earned ? badge.color + 'aa' : '#222' },
        !badge.earned && styles.badgeCardLocked,
      ]}
      onPress={() => setExpanded(e => !e)}
    >
      <Text style={[styles.badgeIcon, !badge.earned && styles.badgeLocked]}>{badge.icon}</Text>
      <Text style={[styles.badgeName, { color: badge.earned ? '#fff' : '#555' }]} numberOfLines={1}>
        {badge.name}
      </Text>
      {badge.progress && !badge.earned && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: badge.color }]} />
        </View>
      )}
      {badge.progress && !badge.earned && (
        <Text style={styles.progressText}>{badge.progress.current}/{badge.progress.total}</Text>
      )}
      {badge.earned && (
        <View style={[styles.earnedDot, { backgroundColor: badge.color }]} />
      )}
      {expanded && (
        <Text style={styles.badgeDesc}>{badge.description}</Text>
      )}
    </Pressable>
  );
}

// ─── Collection Tab ───────────────────────────────────────────────────────────

function CollectionTab({ catches }: { catches: CatchRecord[] }) {
  const badges = useMemo(() => computeBadges(catches), [catches]);
  const earned = badges.filter(b => b.earned).length;
  const categories = ['enthusiast', 'grind', 'rarity', 'style', 'decade', 'social', 'collection'] as BadgeCategory[];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.collectionContainer} showsVerticalScrollIndicator={false}>
      {/* Header stats */}
      <View style={styles.collectionStats}>
        <View style={styles.statBlock}>
          <Text style={styles.statNum}>{earned}</Text>
          <Text style={styles.statLabel}>EARNED</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statNum}>{badges.length}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statNum}>{Math.round((earned / badges.length) * 100)}%</Text>
          <Text style={styles.statLabel}>COMPLETE</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.masterProgress}>
        <View style={[styles.masterFill, { width: `${(earned / badges.length) * 100}%` as any }]} />
      </View>

      {/* Badge sections by category */}
      {categories.map(cat => {
        const catBadges = badges.filter(b => b.category === cat);
        const catEarned = catBadges.filter(b => b.earned).length;
        return (
          <View key={cat} style={styles.badgeSection}>
            <View style={styles.badgeSectionHeader}>
              <Text style={styles.badgeSectionTitle}>{CATEGORY_LABEL[cat]}</Text>
              <Text style={styles.badgeSectionCount}>{catEarned}/{catBadges.length}</Text>
            </View>
            <View style={styles.badgeGrid}>
              {catBadges.map(b => <BadgeCard key={b.id} badge={b} />)}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Market Tab ───────────────────────────────────────────────────────────────

function ListingCard({ listing, onBid }: { listing: MarketListing; onBid: (l: MarketListing) => void }) {
  const accent = RARITY_ACCENT[listing.rarity] ?? '#444';
  const bg     = RARITY_COLOR[listing.rarity]  ?? '#1a1a1a';
  const timeLeft = (() => {
    const ms = new Date(listing.expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3_600_000);
    if (h < 24) return `${h}h left`;
    return `${Math.floor(h / 24)}d left`;
  })();

  return (
    <Pressable
      style={[styles.listingCard, { backgroundColor: bg, borderColor: accent + '55' }]}
      onPress={() => onBid(listing)}
    >
      <View style={styles.listingTop}>
        <View>
          <Text style={styles.listingMake}>{listing.make}</Text>
          <Text style={styles.listingModel}>{listing.model}</Text>
          <Text style={[styles.listingGen, { color: accent }]} numberOfLines={1}>{listing.generation}</Text>
        </View>
        <View style={styles.listingRight}>
          <Text style={[styles.listingRarity, { color: accent }]}>{listing.rarity.toUpperCase()}</Text>
          <Text style={styles.listingColor}>{listing.color}</Text>
        </View>
      </View>
      <View style={styles.listingBottom}>
        <View>
          <Text style={styles.listingAsk}>{listing.askingPrice.toLocaleString()} CR</Text>
          {listing.topBid > 0 && (
            <Text style={[styles.listingTopBid, { color: accent }]}>
              Top bid: {listing.topBid.toLocaleString()} CR
            </Text>
          )}
        </View>
        <View style={styles.listingMeta}>
          <Text style={styles.listingBidCount}>{listing.bidCount} bid{listing.bidCount !== 1 ? 's' : ''}</Text>
          <Text style={styles.listingExpiry}>{timeLeft}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function BidModal({ listing, visible, onClose }: {
  listing: MarketListing | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const { placeBid, loading, error } = useMarketStore();
  const credits = usePlayerStore(s => s.credits);
  const minBid = listing ? Math.max(listing.topBid + 1, Math.floor(listing.askingPrice * 0.5)) : 0;

  async function submit() {
    if (!listing) return;
    const val = parseInt(amount, 10);
    if (isNaN(val) || val < minBid) {
      Alert.alert('Bid Too Low', `Minimum bid is ${minBid.toLocaleString()} CR.`);
      return;
    }
    if (val > credits) {
      Alert.alert('Not Enough Credits', `You have ${credits.toLocaleString()} CR.`);
      return;
    }
    await placeBid(listing.id, val);
    if (!useMarketStore.getState().error) {
      setAmount('');
      onClose();
    }
  }

  if (!listing) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{listing.make} {listing.model}</Text>
          <Text style={styles.modalSub}>{listing.generation}</Text>
          <Text style={styles.modalSub}>{listing.color} · {listing.rarity.toUpperCase()}</Text>

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>Ask</Text>
            <Text style={styles.modalValue}>{listing.askingPrice.toLocaleString()} CR</Text>
          </View>
          {listing.topBid > 0 && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Top bid</Text>
              <Text style={styles.modalValue}>{listing.topBid.toLocaleString()} CR</Text>
            </View>
          )}
          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>Min bid</Text>
            <Text style={styles.modalValue}>{minBid.toLocaleString()} CR</Text>
          </View>
          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>Your credits</Text>
            <Text style={styles.modalValue}>{credits.toLocaleString()} CR</Text>
          </View>

          {error && <Text style={styles.modalError}>{error}</Text>}

          <TextInput
            style={styles.bidInput}
            placeholder={`Min ${minBid.toLocaleString()} CR`}
            placeholderTextColor="#555"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Pressable style={styles.bidBtn} onPress={submit} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.bidBtnText}>PLACE BID</Text>
            }
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MarketTab({ mycatches }: { mycatches: CatchRecord[] }) {
  const { listings, loading, error, fetchListings } = useMarketStore();
  const [bidTarget, setBidTarget] = useState<MarketListing | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'sell'>('browse');

  useEffect(() => { fetchListings(); }, []);

  const syncedForSale = mycatches.filter(c => c.synced && c.generationId);

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-nav */}
      <View style={styles.marketNav}>
        <Pressable
          style={[styles.marketNavBtn, viewMode === 'browse' && styles.marketNavActive]}
          onPress={() => setViewMode('browse')}
        >
          <Text style={[styles.marketNavText, viewMode === 'browse' && styles.marketNavTextActive]}>BROWSE</Text>
        </Pressable>
        <Pressable
          style={[styles.marketNavBtn, viewMode === 'sell' && styles.marketNavActive]}
          onPress={() => setViewMode('sell')}
        >
          <Text style={[styles.marketNavText, viewMode === 'sell' && styles.marketNavTextActive]}>SELL</Text>
        </Pressable>
      </View>

      {viewMode === 'browse' ? (
        loading && listings.length === 0 ? (
          <View style={styles.centered}><ActivityIndicator color="#fff" /></View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={fetchListings}>
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          </View>
        ) : listings.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Market is empty. Be the first to list.</Text>
          </View>
        ) : (
          <FlatList
            data={listings.filter(l => l.status === 'active')}
            keyExtractor={l => l.id}
            renderItem={({ item }) => <ListingCard listing={item} onBid={setBidTarget} />}
            contentContainerStyle={styles.marketList}
            showsVerticalScrollIndicator={false}
            onRefresh={fetchListings}
            refreshing={loading}
          />
        )
      ) : (
        <SellTab catches={syncedForSale} />
      )}

      <BidModal listing={bidTarget} visible={!!bidTarget} onClose={() => setBidTarget(null)} />
    </View>
  );
}

function SellTab({ catches }: { catches: CatchRecord[] }) {
  const { createListing, loading, error } = useMarketStore();
  const [selected, setSelected] = useState<CatchRecord | null>(null);
  const [price, setPrice] = useState('');

  async function listForSale() {
    if (!selected) return;
    const val = parseInt(price, 10);
    if (isNaN(val) || val < 1) {
      Alert.alert('Enter a price', 'Asking price must be at least 1 credit.');
      return;
    }
    await createListing({
      catchId:     selected.id,
      make:        selected.make,
      model:       selected.model,
      generation:  selected.generation,
      bodyStyle:   selected.bodyStyle,
      color:       selected.color,
      rarity:      selected.rarity ?? 'common',
      askingPrice: val,
    });
    if (!useMarketStore.getState().error) {
      setSelected(null);
      setPrice('');
      Alert.alert('Listed!', `${selected.make} ${selected.model} is now on the market.`);
    }
  }

  if (catches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No synced vehicles to sell yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sellContainer}>
      <Text style={styles.sellHeading}>SELECT VEHICLE TO LIST</Text>
      {catches.map(c => {
        const rarity = c.rarity ?? 'common';
        const accent = RARITY_ACCENT[rarity] ?? '#444';
        const isSelected = selected?.id === c.id;
        return (
          <Pressable
            key={c.id}
            style={[styles.sellCard, isSelected && { borderColor: accent }]}
            onPress={() => setSelected(c)}
          >
            <Text style={styles.sellMake}>{c.make}</Text>
            <Text style={styles.sellModel}>{c.model}</Text>
            <Text style={[styles.sellRarity, { color: accent }]}>{rarity.toUpperCase()}</Text>
            {isSelected && <View style={[styles.selectedMark, { backgroundColor: accent }]} />}
          </Pressable>
        );
      })}

      {selected && (
        <View style={styles.priceSection}>
          <Text style={styles.sellHeading}>SET ASKING PRICE (CR)</Text>
          <TextInput
            style={styles.bidInput}
            placeholder="e.g. 500"
            placeholderTextColor="#555"
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
          {error && <Text style={styles.modalError}>{error}</Text>}
          <Pressable style={styles.bidBtn} onPress={listForSale} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.bidBtnText}>LIST FOR SALE</Text>
            }
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GarageScreen() {
  const catches    = useCatchStore(s => s.catches);
  const syncError  = useCatchStore(s => s.syncError);
  const clearError = useCatchStore(s => s.clearSyncError);
  const credits    = usePlayerStore(s => s.credits);
  const [activeTab, setActiveTab] = useState<GarageTab>('catches');
  const [catchViewMode, setCatchViewMode] = useState<CatchViewMode>('3d');

  const pendingCount = catches.filter(c => !c.synced).length;
  const earnedCount  = useMemo(() => computeBadges(catches).filter(b => b.earned).length, [catches]);

  return (
    <View style={styles.container}>
      {/* Sync error banner */}
      {syncError && (
        <Pressable style={styles.syncErrorBanner} onPress={clearError}>
          <Text style={styles.syncErrorText}>⚠ Sync failed — catches will retry when online</Text>
          <Text style={styles.syncErrorDismiss}>✕</Text>
        </Pressable>
      )}

      {/* Pending sync indicator */}
      {!syncError && pendingCount > 0 && (
        <View style={styles.syncPendingBanner}>
          <ActivityIndicator size="small" color="#555" style={{ marginRight: 8 }} />
          <Text style={styles.syncPendingText}>Syncing {pendingCount} catch{pendingCount > 1 ? 'es' : ''}…</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>GARAGE</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.metaLabel}>{catches.length} CAUGHT</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaLabel}>{earnedCount} BADGES</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaLabel}>{credits.toLocaleString()} CR</Text>
        </View>
      </View>

      {/* Top tab bar */}
      <View style={styles.tabBar}>
        {(['catches', 'collection', 'market'] as GarageTab[]).map(tab => (
          <Pressable
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'catches' && (
        catches.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>EMPTY</Text>
            <Text style={styles.emptyText}>No catches yet. Hit the road.</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.viewToggleRow}>
              <Text style={styles.count}>{catches.length} vehicles</Text>
              <View style={styles.viewToggle}>
                {(['3d', 'grid'] as CatchViewMode[]).map(mode => (
                  <Pressable
                    key={mode}
                    style={[styles.toggleBtn, catchViewMode === mode && styles.toggleBtnActive]}
                    onPress={() => setCatchViewMode(mode)}
                  >
                    <Text style={[styles.toggleText, catchViewMode === mode && styles.toggleTextActive]}>
                      {mode.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {catchViewMode === '3d' ? (
              <GarageCarousel catches={catches} />
            ) : (
              <FlatList
                data={catches}
                keyExtractor={item => item.id}
                numColumns={2}
                renderItem={({ item }) => <CatchCard item={item} />}
                contentContainerStyle={styles.grid}
                columnWrapperStyle={styles.row}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )
      )}

      {activeTab === 'collection' && <CollectionTab catches={catches} />}
      {activeTab === 'market' && <MarketTab mycatches={catches} />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0a0a0a' },
  syncErrorBanner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#2a0a0a', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e6394633' },
  syncErrorText:      { color: '#e63946', fontSize: 12, fontWeight: '700', flex: 1 },
  syncErrorDismiss:   { color: '#e63946', fontSize: 14, marginLeft: 12 },
  syncPendingBanner:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  syncPendingText:    { color: '#444', fontSize: 12 },

  // Header
  header:          { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 10 },
  title:           { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  headerMeta:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaLabel:       { color: '#555', fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  metaDivider:     { color: '#333', fontSize: 12 },

  // Tab bar
  tabBar:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  tabBtn:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:    { borderBottomWidth: 2, borderBottomColor: '#fff' },
  tabText:         { color: '#444', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  tabTextActive:   { color: '#fff' },

  // Catches tab
  viewToggleRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  count:           { color: '#555', fontSize: 13 },
  viewToggle:      { flexDirection: 'row', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 6, overflow: 'hidden' },
  toggleBtn:       { paddingHorizontal: 10, paddingVertical: 5 },
  toggleBtnActive: { backgroundColor: '#1a1a1a' },
  toggleText:      { color: '#444', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  toggleTextActive:{ color: '#fff' },
  grid:            { padding: 12, paddingBottom: 40 },
  row:             { gap: 10, marginBottom: 10 },

  // Catch card
  card:            { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8, minHeight: 160 },
  cardTop:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge:       { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeText:        { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  unsyncedDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#555', marginLeft: 'auto' },
  xpBadge:         { fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  cardBody:        { flex: 1, gap: 2 },
  cardMake:        { color: '#666', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  cardModel:       { color: '#fff', fontSize: 17, fontWeight: '800' },
  cardGen:         { fontSize: 11, fontWeight: '600' },
  cardBottom:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rarityLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dateLabel:       { color: '#444', fontSize: 11 },
  ffBadge:         { position: 'absolute', top: 10, right: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  ffText:          { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  // Empty state
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:      { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  emptyText:       { color: '#444', marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  // Collection tab
  collectionContainer: { padding: 16, paddingBottom: 60 },
  collectionStats:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  statBlock:           { alignItems: 'center', paddingHorizontal: 24 },
  statNum:             { color: '#fff', fontSize: 28, fontWeight: '900' },
  statLabel:           { color: '#555', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  statDivider:         { width: 1, height: 36, backgroundColor: '#222' },
  masterProgress:      { height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, marginBottom: 24, overflow: 'hidden' },
  masterFill:          { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  badgeSection:        { marginBottom: 28 },
  badgeSectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  badgeSectionTitle:   { color: '#777', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  badgeSectionCount:   { color: '#444', fontSize: 11, fontWeight: '700' },
  badgeGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard:           { width: '30%', borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', gap: 6, backgroundColor: '#111' },
  badgeCardLocked:     { opacity: 0.55 },
  badgeIcon:           { fontSize: 28 },
  badgeLocked:         { opacity: 0.4 },
  badgeName:           { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  badgeDesc:           { fontSize: 9, color: '#666', textAlign: 'center', marginTop: 2 },
  progressBar:         { width: '100%', height: 3, backgroundColor: '#222', borderRadius: 2, overflow: 'hidden' },
  progressFill:        { height: '100%', borderRadius: 2 },
  progressText:        { color: '#555', fontSize: 9, fontWeight: '700' },
  earnedDot:           { width: 6, height: 6, borderRadius: 3 },

  // Market tab
  marketNav:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  marketNavBtn:    { flex: 1, paddingVertical: 10, alignItems: 'center' },
  marketNavActive: { borderBottomWidth: 1, borderBottomColor: '#555' },
  marketNavText:   { color: '#444', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  marketNavTextActive: { color: '#aaa' },
  marketList:      { padding: 12, paddingBottom: 40 },
  listingCard:     { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  listingTop:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  listingMake:     { color: '#666', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  listingModel:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  listingGen:      { fontSize: 11, fontWeight: '600', marginTop: 2 },
  listingRight:    { alignItems: 'flex-end', gap: 4 },
  listingRarity:   { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  listingColor:    { color: '#555', fontSize: 11 },
  listingBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  listingAsk:      { color: '#fff', fontSize: 18, fontWeight: '900' },
  listingTopBid:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
  listingMeta:     { alignItems: 'flex-end', gap: 2 },
  listingBidCount: { color: '#555', fontSize: 11 },
  listingExpiry:   { color: '#444', fontSize: 11 },

  // Bid modal
  modalOverlay:    { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
  modalCard:       { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle:      { color: '#fff', fontSize: 20, fontWeight: '900' },
  modalSub:        { color: '#666', fontSize: 13 },
  modalRow:        { flexDirection: 'row', justifyContent: 'space-between' },
  modalLabel:      { color: '#555', fontSize: 13 },
  modalValue:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalError:      { color: '#e63946', fontSize: 12 },
  bidInput:        { borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, backgroundColor: '#0d0d0d' },
  bidBtn:          { backgroundColor: '#fff', borderRadius: 10, padding: 14, alignItems: 'center' },
  bidBtnText:      { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  // Sell tab
  sellContainer:   { padding: 16, paddingBottom: 60 },
  sellHeading:     { color: '#555', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  sellCard:        { backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: '#222', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sellMake:        { color: '#666', fontSize: 11, letterSpacing: 1, flex: 0 },
  sellModel:       { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  sellRarity:      { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  selectedMark:    { width: 6, height: 6, borderRadius: 3 },
  priceSection:    { marginTop: 20, gap: 12 },

  // Misc
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:       { color: '#e63946', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn:        { borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:       { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
