import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { useLocation } from '@/hooks/useLocation';

type LeaderboardEntry = {
  id: string;
  username: string;
  xp: number;
  level: number;
};

type Tab = 'global' | 'city';

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: '#f59e0b', 2: '#9ca3af', 3: '#b45309' };
  const color = colors[rank] ?? '#333';
  return (
    <View style={[styles.rankBadge, { borderColor: color }]}>
      <Text style={[styles.rankText, { color }]}>{rank}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<Tab>('global');
  const userId    = usePlayerStore(s => s.userId);
  const { fuzzyCity } = useLocation();

  const globalQ = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard-global'],
    queryFn:  () => apiClient.get('/leaderboard/global?limit=100') as Promise<LeaderboardEntry[]>,
    staleTime: 60_000,
  });

  const cityQ = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard-city', fuzzyCity],
    queryFn:  () => apiClient.get(`/leaderboard/city/${encodeURIComponent(fuzzyCity ?? '')}`) as Promise<LeaderboardEntry[]>,
    enabled:  !!fuzzyCity,
    staleTime: 60_000,
  });

  const { data, isLoading, isError } = tab === 'global' ? globalQ : cityQ;

  function renderEntry({ item, index }: { item: LeaderboardEntry; index: number }) {
    const rank   = index + 1;
    const isMe   = item.id === userId;
    return (
      <View style={[styles.row, isMe && styles.rowMe]}>
        <RankBadge rank={rank} />
        <View style={styles.rowBody}>
          <Text style={[styles.rowUsername, isMe && styles.rowUsernameMe]}>
            {item.username}{isMe ? '  ·  YOU' : ''}
          </Text>
          <Text style={styles.rowLevel}>LV {item.level}</Text>
        </View>
        <Text style={styles.rowXp}>{item.xp.toLocaleString()} XP</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>LEADERBOARD</Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tabButton, tab === 'global' && styles.tabButtonActive]}
          onPress={() => setTab('global')}
        >
          <Text style={[styles.tabText, tab === 'global' && styles.tabTextActive]}>GLOBAL</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === 'city' && styles.tabButtonActive]}
          onPress={() => setTab('city')}
        >
          <Text style={[styles.tabText, tab === 'city' && styles.tabTextActive]}>MY CITY</Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color="#e63946" />
        </View>
      )}

      {!isLoading && (isError || !data) && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {tab === 'city' && !fuzzyCity
              ? 'Catch a vehicle first to unlock your city board.'
              : 'Could not load leaderboard.'}
          </Text>
        </View>
      )}

      {!isLoading && data && data.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No players ranked yet.</Text>
        </View>
      )}

      {!isLoading && data && data.length > 0 && (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          renderItem={renderEntry}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0a0a0a' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, gap: 16 },
  backButton:       { padding: 4 },
  backText:         { color: '#888', fontSize: 22 },
  title:            { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  tabs:             { flexDirection: 'row', marginHorizontal: 20, marginBottom: 8, backgroundColor: '#111', borderRadius: 8, padding: 4 },
  tabButton:        { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabButtonActive:  { backgroundColor: '#1a1a1a' },
  tabText:          { color: '#444', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  tabTextActive:    { color: '#fff' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText:        { color: '#444', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  list:             { paddingBottom: 40 },
  row:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#111', gap: 14 },
  rowMe:            { backgroundColor: '#1a0a0a' },
  rankBadge:        { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rankText:         { fontSize: 13, fontWeight: '800' },
  rowBody:          { flex: 1, gap: 2 },
  rowUsername:      { color: '#ccc', fontSize: 15, fontWeight: '600' },
  rowUsernameMe:    { color: '#e63946' },
  rowLevel:         { color: '#444', fontSize: 11, letterSpacing: 1 },
  rowXp:            { color: '#555', fontSize: 13, fontWeight: '600' },
});
