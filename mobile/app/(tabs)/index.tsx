import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { useLocation } from '@/hooks/useLocation';
import { usePlayerStore } from '@/stores/playerStore';
import { BoostDecisionModal } from '@/components/BoostDecisionModal';

type CatchableObject = {
  id: string;
  pass_start: string;
  pass_end: string;
  max_elevation: number;
  space_objects: {
    id: string;
    name: string;
    object_type: string;
    rarity_tier: string;
  } | null;
};

const RARITY_COLOR: Record<string, string> = {
  common:    '#555',
  uncommon:  '#4a9eff',
  rare:      '#a855f7',
  epic:      '#f59e0b',
  legendary: '#e63946',
};

function timeUntil(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  if (diff <= 0)   return 'NOW';
  if (diff < 60)   return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${Math.floor(diff % 60)}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function boostRemaining(expires: string | null): number {
  if (!expires) return 0;
  return Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 60000));
}

function SatelliteRow({
  item,
  onCatch,
  alreadyCaught,
}: {
  item: CatchableObject;
  onCatch: (item: CatchableObject) => void;
  alreadyCaught: boolean;
}) {
  const obj    = item.space_objects;
  const rarity = obj?.rarity_tier ?? 'common';
  const color  = RARITY_COLOR[rarity] ?? '#555';
  const [until, setUntil] = useState(() => timeUntil(item.pass_start));
  const isNow  = until === 'NOW';

  useEffect(() => {
    const t = setInterval(() => setUntil(timeUntil(item.pass_start)), 1000);
    return () => clearInterval(t);
  }, [item.pass_start]);

  return (
    <View style={styles.satRow}>
      <View style={[styles.satDot, { backgroundColor: alreadyCaught ? '#333' : color }]} />
      <View style={styles.satBody}>
        <Text style={[styles.satName, alreadyCaught && styles.satNameDim]}>
          {obj?.name ?? 'Unknown Object'}
        </Text>
        <Text style={styles.satType}>
          {obj?.object_type ?? '—'}  ·  {Math.round(item.max_elevation)}° max elevation
        </Text>
      </View>
      <View style={styles.satRight}>
        <Text style={[styles.satCountdown, isNow && !alreadyCaught && styles.satCountdownNow]}>
          {alreadyCaught ? 'LOGGED' : until}
        </Text>
        {isNow && !alreadyCaught ? (
          <Pressable style={styles.catchBtn} onPress={() => onCatch(item)}>
            <Text style={styles.catchBtnText}>CATCH</Text>
          </Pressable>
        ) : isNow && alreadyCaught ? (
          <Text style={styles.caughtBadge}>✓</Text>
        ) : (
          <Text style={styles.satCatchable}>INCOMING</Text>
        )}
      </View>
    </View>
  );
}

function OrbitalBoostBanner({ expires }: { expires: string | null }) {
  const [remaining, setRemaining] = useState(() => boostRemaining(expires));

  useEffect(() => {
    setRemaining(boostRemaining(expires));
    const t = setInterval(() => setRemaining(boostRemaining(expires)), 30_000);
    return () => clearInterval(t);
  }, [expires]);

  if (remaining <= 0) return null;

  return (
    <View style={styles.boostBanner}>
      <Text style={styles.boostIcon}>⚡</Text>
      <View>
        <Text style={styles.boostTitle}>ORBITAL BOOST ACTIVE</Text>
        <Text style={styles.boostSub}>XP multiplier on all vehicle catches · {remaining}m remaining</Text>
      </View>
    </View>
  );
}

export default function OperationsScreen() {
  const { latitude, longitude } = useLocation();
  const orbitalBoostExpires     = usePlayerStore(s => s.orbitalBoostExpires);
  const [caught, setCaught]     = useState<Set<string>>(new Set());

  const satQuery = useQuery({
    queryKey: ['satellites', latitude, longitude],
    queryFn: () => {
      if (!latitude || !longitude) return Promise.resolve([]);
      return apiClient.get(`/satellites/catchable?lat=${latitude}&lon=${longitude}`) as Promise<CatchableObject[]>;
    },
    enabled: !!(latitude && longitude),
    refetchInterval: 60_000,
  });

  const satellites = satQuery.data ?? [];

  function handleCatch(item: CatchableObject) {
    if (caught.has(item.id)) return;
    setCaught(prev => new Set(prev).add(item.id));

    const obj = item.space_objects;
    router.push({
      pathname: '/satellite-catch',
      params: {
        catchableId: item.id,
        objectName:  obj?.name         ?? 'Unknown Object',
        objectType:  obj?.object_type  ?? 'satellite',
        rarityTier:  obj?.rarity_tier  ?? 'common',
      },
    });
  }

  return (
    <View style={styles.container}>
      <OrbitalBoostBanner expires={orbitalBoostExpires} />

      {/* Mode entry buttons */}
      <View style={styles.modeSection}>
        <Text style={styles.title}>OPERATIONS</Text>
        <Text style={styles.subtitle}>Vehicle hunting · Space objects overhead</Text>

        <Pressable style={styles.primaryButton} onPress={() => router.push('/highway')}>
          <Text style={styles.buttonText}>DASH SENTRY</Text>
          <Text style={styles.buttonSub}>Passive dashcam capture</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.push('/scan360')}>
          <Text style={styles.buttonText}>360° SCAN</Text>
          <Text style={styles.buttonSub}>Active parked vehicle scan</Text>
        </Pressable>

        <Pressable style={styles.identifyButton} onPress={() => router.push('/identify')}>
          <Text style={styles.buttonText}>IDENTIFY</Text>
          <Text style={styles.buttonSub}>Guess mystery cars · earn XP</Text>
        </Pressable>
      </View>

      {/* Satellite overhead section */}
      <View style={styles.satSection}>
        <View style={styles.satHeader}>
          <Text style={styles.satTitle}>OVERHEAD NOW</Text>
          <View style={[styles.statusPill, satQuery.isLoading ? styles.statusSyncing : satQuery.isError ? styles.statusError : styles.statusOnline]}>
            <View style={[styles.statusDot, satQuery.isLoading ? styles.statusDotSyncing : satQuery.isError ? styles.statusDotError : styles.statusDotOnline]} />
            <Text style={styles.statusText}>
              {satQuery.isLoading ? 'SYNCING' : satQuery.isError ? 'OFFLINE' : 'ONLINE'}
            </Text>
          </View>
        </View>

        {!latitude ? (
          <Text style={styles.satHint}>Enable location for satellite tracking.</Text>
        ) : satQuery.isLoading ? (
          <View style={styles.satLoadingRow}>
            <ActivityIndicator size="small" color="#e63946" />
            <Text style={styles.satLoadingText}>Computing orbital passes…</Text>
          </View>
        ) : satQuery.isError ? (
          <Text style={styles.satHint}>Could not load satellite data.</Text>
        ) : satellites.length === 0 ? (
          <Text style={styles.satHint}>No space objects catchable right now.</Text>
        ) : (
          <FlatList
            data={satellites}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <SatelliteRow
                item={item}
                onCatch={handleCatch}
                alreadyCaught={caught.has(item.id)}
              />
            )}
            scrollEnabled={false}
          />
        )}
      </View>

      {/* Boost decision modal — appears after a satellite catch syncs */}
      <BoostDecisionModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0a0a0a', padding: 24, paddingTop: 70 },

  boostBanner:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1200', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 20 },
  boostIcon:        { fontSize: 20 },
  boostTitle:       { color: '#f59e0b', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  boostSub:         { color: '#f59e0b88', fontSize: 11, marginTop: 2 },

  modeSection:      { gap: 12, marginBottom: 40 },
  title:            { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 4 },
  subtitle:         { color: '#444', fontSize: 12, marginBottom: 8 },
  primaryButton:    { backgroundColor: '#e63946', borderRadius: 10, paddingVertical: 18, paddingHorizontal: 24 },
  secondaryButton:  { backgroundColor: '#141414', borderRadius: 10, paddingVertical: 18, paddingHorizontal: 24, borderWidth: 1, borderColor: '#222' },
  identifyButton:   { backgroundColor: '#141414', borderRadius: 10, paddingVertical: 18, paddingHorizontal: 24, borderWidth: 1, borderColor: '#e6394633' },
  buttonText:       { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 2 },
  buttonSub:        { color: '#ffffff66', fontSize: 12, marginTop: 3 },

  satSection:       { flex: 1 },
  satHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  satTitle:         { color: '#333', fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  satHint:          { color: '#333', fontSize: 13 },
  statusPill:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  statusOnline:     { backgroundColor: '#0a1a0a', borderColor: '#1a3a1a' },
  statusSyncing:    { backgroundColor: '#1a0a00', borderColor: '#3a1a00' },
  statusError:      { backgroundColor: '#1a0a0a', borderColor: '#3a1a1a' },
  statusDot:        { width: 5, height: 5, borderRadius: 3 },
  statusDotOnline:  { backgroundColor: '#22c55e' },
  statusDotSyncing: { backgroundColor: '#f59e0b' },
  statusDotError:   { backgroundColor: '#e63946' },
  statusText:       { color: '#555', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  satLoadingRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  satLoadingText:   { color: '#333', fontSize: 13 },
  satRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  satDot:           { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  satBody:          { flex: 1, gap: 3 },
  satName:          { color: '#fff', fontSize: 14, fontWeight: '700' },
  satNameDim:       { color: '#444' },
  satType:          { color: '#444', fontSize: 12 },
  satRight:         { alignItems: 'flex-end', gap: 4 },
  satCountdown:     { color: '#555', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  satCountdownNow:  { color: '#e63946' },
  satCatchable:     { color: '#333', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  caughtBadge:      { color: '#22c55e', fontSize: 14, fontWeight: '900' },

  catchBtn:         { backgroundColor: '#e63946', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 12 },
  catchBtnText:     { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
});
