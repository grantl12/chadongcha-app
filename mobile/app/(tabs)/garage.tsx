import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { router } from 'expo-router';
import { useCatchStore, type CatchRecord } from '@/stores/catchStore';
import { usePlayerStore, type StoredBoost, MAX_STORED_BOOSTS } from '@/stores/playerStore';
import { useMarketStore, type MarketListing } from '@/stores/marketStore';
import { GarageCarousel } from '@/components/GarageCarousel';
import { HexBadge } from '@/components/HexBadge';
import { computeBadges, type Badge, type BadgeCategory } from '@/utils/badges';
import { PaywallModal } from '@/components/PaywallModal';
import { useTheme, type Theme } from '@/lib/theme';

const FREE_GARAGE_LIMIT = 75;

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

type GarageTab = 'catches' | 'collection' | 'market' | 'shop' | 'orbital';
type CatchViewMode = 'grid' | '3d';
type SortMode = 'date' | 'rarity_hi' | 'rarity_lo';

const RARITY_ORDER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const SORT_LABEL: Record<SortMode, string> = { date: 'DATE', rarity_hi: 'R↑', rarity_lo: 'R↓' };
const SORT_NEXT: Record<SortMode, SortMode> = { date: 'rarity_hi', rarity_hi: 'rarity_lo', rarity_lo: 'date' };
const FILTER_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'ALL' },
  { key: 'legendary', label: 'LEG' },
  { key: 'epic', label: 'EPIC' },
  { key: 'rare', label: 'RARE' },
  { key: 'uncommon', label: 'UNC' },
  { key: 'common', label: 'CMN' },
];

const WHOLESALER_PRICES: Record<string, number> = {
  common:    10,
  uncommon:  50,
  rare:      200,
  epic:      750,
  legendary: 3_000,
};

// ─── CatchCard ───────────────────────────────────────────────────────────────

const CatchCard = memo(function CatchCard({ item, onSellPress }: { item: CatchRecord; onSellPress?: (item: CatchRecord) => void }) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const rarity = item.rarity ?? (
    item.confidence >= 0.9  ? 'epic'     :
    item.confidence >= 0.8  ? 'rare'     :
    item.confidence >= 0.72 ? 'uncommon' : 'common'
  );
  const bg     = RARITY_COLOR[rarity]  ?? RARITY_COLOR.common;
  const accent = RARITY_ACCENT[rarity] ?? RARITY_ACCENT.common;
  const label  = RARITY_LABEL[rarity]  ?? 'COMMON';
  const date   = new Date(item.caughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const price  = WHOLESALER_PRICES[rarity] ?? WHOLESALER_PRICES.common;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: bg, borderColor: accent + '44' }]}
      onPress={() => item.generationId && router.push(`/vehicle/${item.generationId}`)}
      onLongPress={() => onSellPress?.(item)}
      delayLongPress={400}
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
        <Text style={[styles.dateLabel, { color: accent + '88' }]}>{price} CR</Text>
      </View>
      {item.firstFinderAwarded && (
        <View style={[styles.ffBadge, { borderColor: accent }]}>
          <Text style={[styles.ffText, { color: accent }]}>★ FIRST FINDER</Text>
        </View>
      )}
    </Pressable>
  );
});

// ─── BadgeCard ───────────────────────────────────────────────────────────────

const BadgeCard = memo(function BadgeCard({ badge }: { badge: Badge }) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [expanded, setExpanded] = useState(false);
  const pct = badge.progress
    ? badge.progress.current / badge.progress.total
    : badge.earned ? 1 : 0;

  return (
    <Pressable style={styles.badgeCard} onPress={() => setExpanded(e => !e)}>
      <HexBadge badge={badge} size={76}/>
      <Text style={[styles.badgeName, { color: badge.earned ? '#f0ead8' : '#444' }]} numberOfLines={1}>
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
      {expanded && (
        <Text style={styles.badgeDesc}>{badge.description}</Text>
      )}
    </Pressable>
  );
});

const CAT_COLORS: Record<BadgeCategory | 'all', string> = {
  all:        '#888',
  enthusiast: '#f59e0b',
  style:      '#6366f1',
  rarity:     '#e63946',
  decade:     '#22d3ee',
  grind:      '#f97316',
  social:     '#22c55e',
  collection: '#a855f7',
};

// ─── Collection Tab ───────────────────────────────────────────────────────────

function CollectionTab({ badges }: { badges: Badge[] }) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [activeCat, setActiveCat] = useState<BadgeCategory | 'all'>('all');
  const earned = useMemo(() => badges.filter(b => b.earned).length, [badges]);
  const categories: (BadgeCategory | 'all')[] = ['all', 'enthusiast', 'grind', 'rarity', 'style', 'decade', 'social'];

  const filtered = useMemo(() => {
    const list = activeCat === 'all' ? badges : badges.filter(b => b.category === activeCat);
    return [...list].sort((a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0));
  }, [badges, activeCat]);

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
          <Text style={[styles.statNum, { color: '#f59e0b' }]}>{badges.length}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statNum}>{Math.round((earned / badges.length) * 100)}%</Text>
          <Text style={styles.statLabel}>COMPLETE</Text>
        </View>
      </View>

      {/* Master progress bar */}
      <View style={styles.masterProgress}>
        <View style={[styles.masterFill, { width: `${(earned / badges.length) * 100}%` as any }]} />
      </View>

      {/* Category filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catTabsScroll} contentContainerStyle={styles.catTabsRow}>
        {categories.map(cat => {
          const on = activeCat === cat;
          const count = cat === 'all' ? badges.length : badges.filter(b => b.category === cat).length;
          const color = CAT_COLORS[cat];
          return (
            <Pressable key={cat} style={[styles.catTab, on && { borderBottomColor: color, borderBottomWidth: 2 }]} onPress={() => setActiveCat(cat)}>
              <Text style={[styles.catTabText, { color: on ? color : '#555' }]}>
                {cat === 'all' ? 'ALL' : CATEGORY_LABEL[cat as BadgeCategory]}
              </Text>
              <Text style={[styles.catTabCount, { color: on ? color : '#333' }]}>{count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Badge grid */}
      <View style={styles.badgeGrid}>
        {filtered.map(b => <BadgeCard key={b.id} badge={b} />)}
      </View>
    </ScrollView>
  );
}

// ─── Market Tab ───────────────────────────────────────────────────────────────

function ListingCard({ listing, onBid }: { listing: MarketListing; onBid: (l: MarketListing) => void }) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
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
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
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
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { listings, loading, error, fetchListings } = useMarketStore();
  const [bidTarget, setBidTarget] = useState<MarketListing | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'sell'>('browse');

  useEffect(() => { fetchListings(); }, []);

  const syncedForSale = mycatches;

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
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
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

// ─── OrbitalTab ──────────────────────────────────────────────────────────────

const SPACE_WHOLESALER: Record<string, number> = {
  common:    50,
  uncommon:  150,
  rare:      600,
  epic:      2_000,
  legendary: 8_000,
};

function BoostStorageSection() {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const storedBoosts         = usePlayerStore(s => s.storedBoosts);
  const orbitalBoostExpires  = usePlayerStore(s => s.orbitalBoostExpires);
  const activateOrbitalBoost = usePlayerStore(s => s.activateOrbitalBoost);
  const consumeStoredBoost   = usePlayerStore(s => s.consumeStoredBoost);
  const [activating, setActivating] = useState<string | null>(null);

  function boostRemaining(expires: string | null) {
    if (!expires) return 0;
    return Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 60000));
  }

  const activeRemaining = boostRemaining(orbitalBoostExpires);
  const isActive        = activeRemaining > 0;

  async function activateStored(boost: StoredBoost) {
    setActivating(boost.id);
    activateOrbitalBoost(boost.durationMin);
    consumeStoredBoost(boost.id);
    try {
      await apiClient.post('/boosts/activate', { rarity_tier: boost.rarityTier });
    } catch { /* non-fatal */ }
    setActivating(null);
  }

  return (
    <View style={styles.orbtSection}>
      <Text style={styles.orbtSectionTitle}>ORBITAL BOOST</Text>

      {/* Active boost status */}
      {isActive ? (
        <View style={styles.activeBoostBanner}>
          <Text style={styles.activeBoostIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeBoostTitle}>BOOST ACTIVE</Text>
            <Text style={styles.activeBoostSub}>{activeRemaining}m remaining · all vehicle XP boosted</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.noBoostHint}>No active boost — catch a satellite to earn one.</Text>
      )}

      {/* Stored boosts */}
      {storedBoosts.length > 0 && (
        <View style={styles.storedList}>
          <View style={styles.storedHeader}>
            <Text style={styles.storedTitle}>STORED</Text>
            <Text style={styles.storedCount}>{storedBoosts.length}/{MAX_STORED_BOOSTS}</Text>
          </View>
          {storedBoosts.map(boost => {
            const color   = RARITY_ACCENT[boost.rarityTier] ?? '#444';
            const bg      = RARITY_COLOR[boost.rarityTier]  ?? '#1a1a1a';
            const isAct   = activating === boost.id;
            const stored  = new Date(boost.storedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return (
              <View key={boost.id} style={[styles.storedCard, { backgroundColor: bg, borderColor: color + '44' }]}>
                <View style={styles.storedCardLeft}>
                  <Text style={[styles.storedMulti, { color }]}>{boost.multiplier}×</Text>
                  <View>
                    <Text style={styles.storedName} numberOfLines={1}>{boost.objectName}</Text>
                    <Text style={styles.storedMeta}>{boost.durationMin}m · {stored}</Text>
                  </View>
                </View>
                <Pressable
                  style={[styles.activateBtn, { borderColor: color + '88' }, isAct && styles.activateBtnDim]}
                  onPress={() => activateStored(boost)}
                  disabled={!!activating}
                >
                  {isAct
                    ? <ActivityIndicator size="small" color={color} />
                    : <Text style={[styles.activateBtnText, { color }]}>ACTIVATE</Text>
                  }
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SpaceCatchCard({ item, onSell }: { item: CatchRecord; onSell?: (item: CatchRecord) => void }) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const rarity = item.rarity ?? 'common';
  const color  = RARITY_ACCENT[rarity] ?? '#444';
  const bg     = RARITY_COLOR[rarity]  ?? '#1a1a1a';
  const date   = new Date(item.caughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const price  = SPACE_WHOLESALER[rarity] ?? SPACE_WHOLESALER.common;

  return (
    <Pressable
      style={[styles.spaceCard, { backgroundColor: bg, borderColor: color + '44' }]}
      onLongPress={() => onSell?.(item)}
      delayLongPress={400}
    >
      <View style={styles.spaceCardTop}>
        <View style={[styles.spaceTypeBadge, { borderColor: color + '66' }]}>
          <Text style={[styles.spaceTypeText, { color }]}>SPC</Text>
        </View>
        {!item.synced && <View style={styles.unsyncedDot} />}
        {item.xpEarned ? <Text style={[styles.xpBadge, { color }]}>+{item.xpEarned}</Text> : null}
      </View>
      <Text style={styles.spaceCardName} numberOfLines={1}>{item.model}</Text>
      <Text style={[styles.spaceCardType, { color: color + 'aa' }]}>
        {(item.bodyStyle ?? 'satellite').toUpperCase()}
      </Text>
      <View style={styles.spaceCardBottom}>
        <Text style={[styles.spaceRarity, { color }]}>{(RARITY_LABEL[rarity] ?? 'COMMON')}</Text>
        <Text style={[styles.spaceDate, { color: color + '88' }]}>{date}</Text>
      </View>
      <Text style={[styles.spaceSellHint, { color: color + '55' }]}>{price} CR</Text>
    </Pressable>
  );
}

function OrbitalTab({ catches, onSell }: { catches: CatchRecord[]; onSell: (item: CatchRecord) => void }) {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.orbtContainer} showsVerticalScrollIndicator={false}>
      <BoostStorageSection />

      <View style={styles.orbtSection}>
        <Text style={styles.orbtSectionTitle}>CAUGHT SATELLITES</Text>
        {catches.length === 0 ? (
          <View style={styles.orbtEmpty}>
            <Text style={styles.orbtEmptyTitle}>NONE YET</Text>
            <Text style={styles.orbtEmptyText}>
              Watch for overhead passes in the Operations screen. When one appears, hit CATCH.
            </Text>
          </View>
        ) : (
          <View style={styles.spaceGrid}>
            {catches.map(c => (
              <SpaceCatchCard key={c.id} item={c} onSell={onSell} />
            ))}
          </View>
        )}
      </View>

      {catches.length > 0 && (
        <Text style={styles.sellHint}>Long-press any catch to sell to wholesaler</Text>
      )}
    </ScrollView>
  );
}

// ─── ShopTab ──────────────────────────────────────────────────────────────────

type ShopItem = { id: string; name: string; desc: string; cost: number; icon: string; category: string };

function ShopTab() {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const credits          = usePlayerStore(s => s.credits);
  const applyShopPurchase = usePlayerStore(s => s.applyShopPurchase);
  const xpBoostExpires   = usePlayerStore(s => s.xpBoostExpires);
  const scanBoostExpires = usePlayerStore(s => s.scanBoostExpires);
  const idHints          = usePlayerStore(s => s.idHints);

  const { data: items = [], isLoading } = useQuery<ShopItem[]>({
    queryKey: ['shop-items'],
    queryFn:  () => apiClient.get('/shop/items') as Promise<ShopItem[]>,
    staleTime: Infinity,
  });

  const buyMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiClient.post('/shop/buy', { item_id: itemId }) as Promise<any>,
    onSuccess(data) {
      applyShopPurchase({
        newCredits:       data.new_credits,
        xpBoostExpires:   data.xp_boost_expires,
        scanBoostExpires: data.scan_boost_expires,
        idHints:          data.id_hints,
      });
    },
    onError() {
      Alert.alert('Purchase failed', 'Not enough credits or item unavailable.');
    },
  });

  function isBoostActive(expires: string | null | undefined): boolean {
    return !!expires && new Date(expires) > new Date();
  }

  function boostLabel(expires: string | null | undefined): string {
    if (!expires || new Date(expires) <= new Date()) return '';
    const mins = Math.max(0, Math.round((new Date(expires).getTime() - Date.now()) / 60000));
    return ` · ${mins}m left`;
  }

  return (
    <ScrollView contentContainerStyle={styles.shopContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.shopBalance}>{credits.toLocaleString()} CR</Text>
      <Text style={styles.shopBalanceLabel}>AVAILABLE CREDITS</Text>

      {/* Active boosts summary */}
      {(isBoostActive(xpBoostExpires) || isBoostActive(scanBoostExpires) || idHints > 0) && (
        <View style={styles.activeBoosts}>
          <Text style={styles.activeBoostsLabel}>ACTIVE</Text>
          {isBoostActive(xpBoostExpires) && (
            <Text style={styles.activeBoostItem}>⚡ XP Boost{boostLabel(xpBoostExpires)}</Text>
          )}
          {isBoostActive(scanBoostExpires) && (
            <Text style={styles.activeBoostItem}>📡 Scan Boost{boostLabel(scanBoostExpires)}</Text>
          )}
          {idHints > 0 && (
            <Text style={styles.activeBoostItem}>🔍 ID Hints × {idHints}</Text>
          )}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color="#e63946" style={{ marginTop: 40 }} />
      ) : (
        items.map(item => {
          const canAfford = credits >= item.cost;
          const buying    = buyMutation.isPending && buyMutation.variables === item.id;
          return (
            <View key={item.id} style={styles.shopItem}>
              <Text style={styles.shopItemIcon}>{item.icon}</Text>
              <View style={styles.shopItemBody}>
                <Text style={styles.shopItemName}>{item.name}</Text>
                <Text style={styles.shopItemDesc}>{item.desc}</Text>
              </View>
              <View style={styles.shopItemRight}>
                <Text style={styles.shopItemCost}>{item.cost} CR</Text>
                <Pressable
                  style={[styles.shopBuyBtn, !canAfford && styles.shopBuyBtnDim]}
                  onPress={() => buyMutation.mutate(item.id)}
                  disabled={!canAfford || buyMutation.isPending}
                >
                  {buying
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.shopBuyBtnText}>BUY</Text>
                  }
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GarageScreen() {
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const catches       = useCatchStore(s => s.catches);
  const removeCatch   = useCatchStore(s => s.removeCatch);
  const syncError     = useCatchStore(s => s.syncError);
  const clearError    = useCatchStore(s => s.clearSyncError);
  const credits       = usePlayerStore(s => s.credits);
  const setCredits    = usePlayerStore(s => s.setCredits);
  const isSubscriber  = usePlayerStore(s => s.isSubscriber);
  const [activeTab, setActiveTab] = useState<GarageTab>('catches');
  const [sellTarget, setSellTarget] = useState<CatchRecord | null>(null);
  const [selling, setSelling] = useState(false);
  const [catchViewMode, setCatchViewMode] = useState<CatchViewMode>('3d');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [filterRarity, setFilterRarity] = useState('all');

  const garageFull   = !isSubscriber && catches.length >= FREE_GARAGE_LIMIT;
  const pendingCount = useMemo(() => catches.filter(c => !c.synced).length, [catches]);

  const badges     = useMemo(() => computeBadges(catches), [catches]);
  const earnedCount = useMemo(() => badges.filter(b => b.earned).length, [badges]);

  const spaceCatches  = useMemo(() => catches.filter(c => c.catchType === 'space'), [catches]);
  const syncedCatches = useMemo(() => catches.filter(c => c.synced), [catches]);

  const displayedCatches = useMemo(() => {
    let list = filterRarity === 'all' ? catches : catches.filter(c => (c.rarity ?? 'common') === filterRarity);
    if (sortMode === 'date')       return [...list].sort((a, b) => new Date(b.caughtAt).getTime() - new Date(a.caughtAt).getTime());
    if (sortMode === 'rarity_hi')  return [...list].sort((a, b) => (RARITY_ORDER[b.rarity ?? 'common'] ?? 0) - (RARITY_ORDER[a.rarity ?? 'common'] ?? 0));
    if (sortMode === 'rarity_lo')  return [...list].sort((a, b) => (RARITY_ORDER[a.rarity ?? 'common'] ?? 0) - (RARITY_ORDER[b.rarity ?? 'common'] ?? 0));
    return list;
  }, [catches, sortMode, filterRarity]);

  return (
    <View style={styles.container}>
      {/* Header — paddingTop clears the status bar */}
      <View style={styles.header}>
        <Text style={styles.title}>GARAGE</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.metaLabel}>
            {catches.length}{!isSubscriber ? `/${FREE_GARAGE_LIMIT}` : ''} CAUGHT
          </Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaLabel}>{earnedCount} BADGES</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaLabel}>{credits.toLocaleString()} CR</Text>
        </View>

        {/* Sync error banner — inside header so it's below the safe area */}
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

        {/* Garage cap banner */}
        {garageFull && (
          <Pressable style={styles.garageCap} onPress={() => setPaywallVisible(true)}>
            <Text style={styles.garageCapText}>GARAGE FULL · {catches.length}/{FREE_GARAGE_LIMIT} · UPGRADE TO PRO →</Text>
          </Pressable>
        )}
        {!isSubscriber && !garageFull && catches.length >= FREE_GARAGE_LIMIT - 10 && (
          <Pressable style={styles.garageCapWarn} onPress={() => setPaywallVisible(true)}>
            <Text style={styles.garageCapWarnText}>
              {FREE_GARAGE_LIMIT - catches.length} garage slots remaining · Upgrade for unlimited
            </Text>
          </Pressable>
        )}
      </View>

      {/* Top tab bar */}
      <View style={styles.tabBar}>
        {(['catches', 'collection', 'market', 'shop', 'orbital'] as GarageTab[]).map(tab => (
          <Pressable
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'orbital' ? 'ORBT' : tab.toUpperCase()}
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
            {/* Controls row: count + sort cycle + view toggle */}
            <View style={styles.viewToggleRow}>
              <Text style={styles.count}>
                {displayedCatches.length}{filterRarity !== 'all' ? `/${catches.length}` : ''} vehicles
              </Text>
              <View style={styles.controlsRight}>
                <Pressable
                  style={styles.sortBtn}
                  onPress={() => setSortMode(m => SORT_NEXT[m])}
                >
                  <Text style={styles.sortBtnText}>{SORT_LABEL[sortMode]}</Text>
                </Pressable>
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
            </View>
            {/* Rarity filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTER_CHIPS.map(chip => (
                <Pressable
                  key={chip.key}
                  style={[
                    styles.filterChip,
                    filterRarity === chip.key && styles.filterChipActive,
                    chip.key !== 'all' && filterRarity === chip.key && { borderColor: RARITY_ACCENT[chip.key] + '88' },
                  ]}
                  onPress={() => setFilterRarity(chip.key)}
                >
                  <Text style={[
                    styles.filterChipText,
                    filterRarity === chip.key && styles.filterChipTextActive,
                    chip.key !== 'all' && filterRarity === chip.key && { color: RARITY_ACCENT[chip.key] },
                  ]}>
                    {chip.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {catchViewMode === '3d' ? (
              <GarageCarousel catches={displayedCatches} onSellPress={setSellTarget} />
            ) : (
              <FlatList
                data={displayedCatches}
                keyExtractor={item => item.id}
                numColumns={2}
                renderItem={({ item }) => (
                  <CatchCard item={item} onSellPress={item.synced ? setSellTarget : undefined} />
                )}
                contentContainerStyle={styles.grid}
                columnWrapperStyle={styles.row}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                maxToRenderPerBatch={6}
                windowSize={10}
                removeClippedSubviews
              />
            )}
            {catchViewMode === 'grid' && displayedCatches.length > 0 && (
              <Text style={styles.sellHint}>Long-press any car to sell to wholesaler</Text>
            )}
            {displayedCatches.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No {filterRarity !== 'all' ? filterRarity : ''} catches yet.</Text>
              </View>
            )}
          </View>
        )
      )}

      {activeTab === 'collection' && <CollectionTab badges={badges} />}
      {activeTab === 'market' && <MarketTab mycatches={syncedCatches} />}
      {activeTab === 'shop' && <ShopTab />}
      {activeTab === 'orbital' && <OrbitalTab catches={spaceCatches} onSell={setSellTarget} />}

      {/* Sell to Wholesaler modal */}
      <Modal
        visible={!!sellTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setSellTarget(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSellTarget(null)}>
          <View style={styles.sellModal}>
            {sellTarget && (() => {
              const rarity = sellTarget.rarity ?? 'common';
              const accent = RARITY_ACCENT[rarity] ?? '#444';
              const price  = WHOLESALER_PRICES[rarity] ?? 10;
              return (
                <>
                  <Text style={styles.sellModalTitle}>SELL TO WHOLESALER</Text>
                  <Text style={styles.sellModalCar}>{sellTarget.make} {sellTarget.model}</Text>
                  <Text style={[styles.sellModalRarity, { color: accent }]}>
                    {RARITY_LABEL[rarity]}
                  </Text>
                  <Text style={styles.sellModalPrice}>{price.toLocaleString()} CR</Text>
                  <Text style={styles.sellModalNote}>
                    This vehicle will be removed from your garage permanently.
                  </Text>
                  <View style={styles.sellModalBtns}>
                    <Pressable
                      style={styles.sellModalCancel}
                      onPress={() => setSellTarget(null)}
                    >
                      <Text style={styles.sellModalCancelText}>CANCEL</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.sellModalConfirm, selling && { opacity: 0.6 }]}
                      disabled={selling}
                      onPress={async () => {
                        if (!sellTarget) return;
                        setSelling(true);
                        try {
                          const res: any = await apiClient.post('/market/sell', {
                            catch_id: sellTarget.id,
                          });
                          removeCatch(sellTarget.id);
                          setCredits(res.new_credits);
                          setSellTarget(null);
                        } catch {
                          Alert.alert('Error', 'Could not complete sale. Try again.');
                        } finally {
                          setSelling(false);
                        }
                      }}
                    >
                      {selling
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.sellModalConfirmText}>SELL</Text>
                      }
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="Unlimited Garage"
        description="Free accounts hold up to 75 vehicles. Go Pro to park as many as you can catch."
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(T: Theme) {
  return StyleSheet.create({
    container:          { flex: 1, backgroundColor: T.bg },
    garageCap:          { backgroundColor: T.accent, paddingVertical: 8, paddingHorizontal: 16, marginTop: 8, borderRadius: 8, alignItems: 'center' },
    garageCapText:      { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
    garageCapWarn:      { backgroundColor: '#1a0a0a', paddingVertical: 6, paddingHorizontal: 16, marginTop: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#e6394622' },
    garageCapWarnText:  { color: '#e63946aa', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    syncErrorBanner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#2a0a0a', paddingHorizontal: 16, paddingVertical: 10, marginTop: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e6394633' },
    syncErrorText:      { color: '#e63946', fontSize: 12, fontWeight: '700', flex: 1 },
    syncErrorDismiss:   { color: '#e63946', fontSize: 14, marginLeft: 12 },
    syncPendingBanner:  { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8, borderRadius: 8 },
    syncPendingText:    { color: T.text3, fontSize: 12 },

    // Header
    header:          { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 10 },
    title:           { color: T.text, fontSize: 22, fontWeight: '900', letterSpacing: 3 },
    headerMeta:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    metaLabel:       { color: T.text2, fontSize: 12, letterSpacing: 1, fontWeight: '600' },
    metaDivider:     { color: T.text3, fontSize: 12 },

    // Tab bar
    tabBar:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.card2 },
    tabBtn:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabBtnActive:    { borderBottomWidth: 2, borderBottomColor: T.text },
    tabText:         { color: T.text3, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
    tabTextActive:   { color: T.text },

    // Catches tab
    viewToggleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    count:              { color: T.text2, fontSize: 13 },
    controlsRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sortBtn:            { borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 },
    sortBtnText:        { color: T.text2, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    viewToggle:         { flexDirection: 'row', borderWidth: 1, borderColor: T.border, borderRadius: 6, overflow: 'hidden' },
    toggleBtn:          { paddingHorizontal: 10, paddingVertical: 5 },
    toggleBtnActive:    { backgroundColor: T.card2 },
    toggleText:         { color: T.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    toggleTextActive:   { color: T.text },
    filterRow:          { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
    filterChip:         { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    filterChipActive:   { borderColor: T.text2, backgroundColor: T.card2 },
    filterChipText:     { color: T.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    filterChipTextActive:{ color: T.text },
    grid:               { padding: 12, paddingBottom: 40 },
    row:                { gap: 10, marginBottom: 10 },

    // Catch card
    card:            { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8, minHeight: 160 },
    cardTop:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
    typeBadge:       { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    typeText:        { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    unsyncedDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: T.text2, marginLeft: 'auto' },
    xpBadge:         { fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
    cardBody:        { flex: 1, gap: 2 },
    cardMake:        { color: T.text3, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
    cardModel:       { color: T.text, fontSize: 17, fontWeight: '800' },
    cardGen:         { fontSize: 11, fontWeight: '600' },
    cardBottom:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rarityLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    dateLabel:       { color: T.text3, fontSize: 11 },
    ffBadge:         { position: 'absolute', top: 10, right: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
    ffText:          { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

    // Empty state
    empty:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle:      { color: T.text, fontSize: 28, fontWeight: '900', letterSpacing: 4 },
    emptyText:       { color: T.text3, marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

    // Collection tab
    collectionContainer: { padding: 16, paddingBottom: 60 },
    collectionStats:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    statBlock:           { alignItems: 'center', paddingHorizontal: 24 },
    statNum:             { color: T.text, fontSize: 28, fontWeight: '900' },
    statLabel:           { color: T.text2, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
    statDivider:         { width: 1, height: 36, backgroundColor: T.border },
    masterProgress:      { height: 4, backgroundColor: T.card2, borderRadius: 2, marginBottom: 24, overflow: 'hidden' },
    masterFill:          { height: '100%', backgroundColor: T.text, borderRadius: 2 },
    catTabsScroll:       { marginBottom: 16, marginHorizontal: -16 },
    catTabsRow:          { paddingHorizontal: 16, gap: 4 },
    catTab:              { paddingVertical: 8, paddingHorizontal: 10, borderBottomColor: 'transparent', borderBottomWidth: 2 },
    catTabText:          { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
    catTabCount:         { fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 2 },
    badgeGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
    badgeCard:           { width: '30%', alignItems: 'center', gap: 6, paddingVertical: 8 },
    badgeName:           { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center', maxWidth: 76 },
    badgeDesc:           { fontSize: 9, color: T.text2, textAlign: 'center', marginTop: 2 },
    progressBar:         { width: '90%', height: 3, backgroundColor: T.border, borderRadius: 2, overflow: 'hidden' },
    progressFill:        { height: '100%', borderRadius: 2 },
    progressText:        { color: T.text3, fontSize: 9, fontWeight: '700' },

    // Market tab
    marketNav:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.card2 },
    marketNavBtn:    { flex: 1, paddingVertical: 10, alignItems: 'center' },
    marketNavActive: { borderBottomWidth: 1, borderBottomColor: T.text2 },
    marketNavText:   { color: T.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    marketNavTextActive: { color: T.text2 },
    marketList:      { padding: 12, paddingBottom: 40 },
    listingCard:     { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
    listingTop:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    listingMake:     { color: T.text3, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
    listingModel:    { color: T.text, fontSize: 18, fontWeight: '800' },
    listingGen:      { fontSize: 11, fontWeight: '600', marginTop: 2 },
    listingRight:    { alignItems: 'flex-end', gap: 4 },
    listingRarity:   { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    listingColor:    { color: T.text2, fontSize: 11 },
    listingBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    listingAsk:      { color: T.text, fontSize: 18, fontWeight: '900' },
    listingTopBid:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
    listingMeta:     { alignItems: 'flex-end', gap: 2 },
    listingBidCount: { color: T.text2, fontSize: 11 },
    listingExpiry:   { color: T.text3, fontSize: 11 },

    // Bid modal
    modalOverlay:    { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    modalCard:       { backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
    modalTitle:      { color: T.text, fontSize: 20, fontWeight: '900' },
    modalSub:        { color: T.text3, fontSize: 13 },
    modalRow:        { flexDirection: 'row', justifyContent: 'space-between' },
    modalLabel:      { color: T.text2, fontSize: 13 },
    modalValue:      { color: T.text, fontSize: 13, fontWeight: '700' },
    modalError:      { color: '#e63946', fontSize: 12 },
    bidInput:        { borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, color: T.text, fontSize: 16, backgroundColor: T.bg },
    bidBtn:          { backgroundColor: T.text, borderRadius: 10, padding: 14, alignItems: 'center' },
    bidBtnText:      { color: T.bg, fontSize: 14, fontWeight: '900', letterSpacing: 1 },

    // Sell tab
    sellContainer:   { padding: 16, paddingBottom: 60 },
    sellHeading:     { color: T.text2, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
    sellCard:        { backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
    sellMake:        { color: T.text3, fontSize: 11, letterSpacing: 1, flex: 0 },
    sellModel:       { color: T.text, fontSize: 15, fontWeight: '800', flex: 1 },
    sellRarity:      { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    selectedMark:    { width: 6, height: 6, borderRadius: 3 },
    priceSection:    { marginTop: 20, gap: 12 },

    // Misc
    centered:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText:       { color: '#e63946', fontSize: 14, textAlign: 'center', marginBottom: 16 },
    retryBtn:        { borderWidth: 1, borderColor: T.text3, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
    retryText:       { color: T.text, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    sellHint:        { color: T.text3, fontSize: 11, textAlign: 'center', paddingBottom: 12 },

    // Sell to wholesaler modal
    sellModal:          { width: '100%', backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 28, gap: 10, borderTopWidth: 1, borderColor: T.card2 },
    sellModalTitle:     { color: T.text2, fontSize: 10, fontWeight: '800', letterSpacing: 3, textAlign: 'center' },
    sellModalCar:       { color: T.text, fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
    sellModalRarity:    { fontSize: 12, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
    sellModalPrice:     { color: T.text, fontSize: 36, fontWeight: '900', textAlign: 'center', letterSpacing: 2 },
    sellModalNote:      { color: T.text3, fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 4 },
    sellModalBtns:      { flexDirection: 'row', gap: 10, marginTop: 8 },
    sellModalCancel:    { flex: 1, backgroundColor: T.card2, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
    sellModalCancelText:{ color: T.text2, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
    sellModalConfirm:   { flex: 1, backgroundColor: T.accent, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
    sellModalConfirmText:{ color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2 },

    // Orbital tab
    orbtContainer:      { padding: 16, paddingBottom: 60, gap: 24 },
    orbtSection:        { gap: 12 },
    orbtSectionTitle:   { color: T.text3, fontSize: 10, fontWeight: '800', letterSpacing: 3, marginBottom: 4 },

    activeBoostBanner:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1200', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
    activeBoostIcon:    { fontSize: 22 },
    activeBoostTitle:   { color: '#f59e0b', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    activeBoostSub:     { color: '#f59e0b88', fontSize: 11, marginTop: 2 },
    noBoostHint:        { color: T.text3, fontSize: 13 },

    storedList:         { gap: 8 },
    storedHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    storedTitle:        { color: T.text2, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
    storedCount:        { color: T.text3, fontSize: 11 },
    storedCard:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
    storedCardLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    storedMulti:        { fontSize: 22, fontWeight: '900', width: 44 },
    storedName:         { color: T.text, fontSize: 13, fontWeight: '700' },
    storedMeta:         { color: T.text2, fontSize: 11, marginTop: 2 },
    activateBtn:        { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
    activateBtnDim:     { opacity: 0.5 },
    activateBtnText:    { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

    orbtEmpty:          { alignItems: 'center', paddingVertical: 32, gap: 10 },
    orbtEmptyTitle:     { color: T.text3, fontSize: 22, fontWeight: '900', letterSpacing: 3 },
    orbtEmptyText:      { color: T.text3, fontSize: 13, textAlign: 'center', lineHeight: 19 },

    spaceGrid:          { gap: 10 },
    spaceCard:          { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
    spaceCardTop:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
    spaceTypeBadge:     { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    spaceTypeText:      { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    spaceCardName:      { color: T.text, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
    spaceCardType:      { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
    spaceCardBottom:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    spaceRarity:        { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    spaceDate:          { fontSize: 11 },
    spaceSellHint:      { fontSize: 10, fontWeight: '700' },

    // Shop tab
    shopContainer:      { padding: 20, paddingBottom: 60, gap: 12 },
    shopBalance:        { color: T.text, fontSize: 40, fontWeight: '900', textAlign: 'center', letterSpacing: 2 },
    shopBalanceLabel:   { color: T.text3, fontSize: 10, fontWeight: '800', letterSpacing: 3, textAlign: 'center', marginBottom: 8 },
    activeBoosts:       { backgroundColor: T.card, borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: T.card2 },
    activeBoostsLabel:  { color: T.text3, fontSize: 9, fontWeight: '800', letterSpacing: 3 },
    activeBoostItem:    { color: '#22c55e', fontSize: 13, fontWeight: '700' },
    shopItem:           { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: T.card2 },
    shopItemIcon:       { fontSize: 28, width: 36, textAlign: 'center' },
    shopItemBody:       { flex: 1, gap: 3 },
    shopItemName:       { color: T.text, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
    shopItemDesc:       { color: T.text3, fontSize: 11, lineHeight: 15 },
    shopItemRight:      { alignItems: 'flex-end', gap: 6 },
    shopItemCost:       { color: T.text2, fontSize: 12, fontWeight: '700' },
    shopBuyBtn:         { backgroundColor: T.accent, borderRadius: 7, paddingVertical: 7, paddingHorizontal: 14 },
    shopBuyBtnDim:      { backgroundColor: T.card2 },
    shopBuyBtnText:     { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  });
}
