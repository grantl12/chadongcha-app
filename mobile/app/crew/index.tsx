import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Alert,
  ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crewApi, Crew, CrewMember, CrewRanking } from '@/api/crews';
import { usePlayerStore } from '@/stores/playerStore';
import { PaywallModal } from '@/components/PaywallModal';
import { useTheme, type Theme } from '@/lib/theme';

type BrowseTab = 'browse' | 'leaderboard';

export default function CrewScreen() {
  const T = useTheme();
  const styles = makeStyles(T);
  const queryClient  = useQueryClient();
  const crewId       = usePlayerStore(s => s.crewId);
  const userId       = usePlayerStore(s => s.userId);
  const isSubscriber = usePlayerStore(s => s.isSubscriber);
  const setCrewId    = usePlayerStore(s => s.setCrewId);
  const [browseTab, setBrowseTab] = useState<BrowseTab>('browse');
  const [refreshing, setRefreshing]   = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const { data: crew, isLoading: isLoadingCrew, refetch: refetchCrew } = useQuery({
    queryKey: ['crew', crewId],
    queryFn:  () => crewId ? crewApi.get(crewId) : Promise.resolve(null),
    enabled:  !!crewId,
  });

  const { data: availableCrews = [], isLoading: isLoadingList, refetch: refetchList } = useQuery({
    queryKey: ['crews-list'],
    queryFn:  () => crewApi.list(),
    enabled:  !crewId,
  });

  const { data: leaderboard = [], isLoading: isLoadingLb, refetch: refetchLb } = useQuery({
    queryKey: ['crews-leaderboard'],
    queryFn:  () => crewApi.leaderboard(),
    enabled:  !crewId,
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => crewApi.join(id),
    onSuccess: (_, id) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCrewId(id);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => crewApi.leave(),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setCrewId(null);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crews-list'] });
      queryClient.invalidateQueries({ queryKey: ['crews-leaderboard'] });
    },
  });

  const disbandMutation = useMutation({
    mutationFn: () => crewApi.disband(crewId!),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setCrewId(null);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crews-list'] });
      queryClient.invalidateQueries({ queryKey: ['crews-leaderboard'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (crewId) {
      await refetchCrew();
    } else {
      await Promise.all([refetchList(), refetchLb()]);
    }
    setRefreshing(false);
  }, [crewId]);

  if (isLoadingCrew || (isLoadingList && !crewId)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    );
  }

  // ── Browse / Leaderboard (no crew) ───────────────────────────────────────
  if (!crewId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.title}>TEAMS</Text>
          <Pressable
            style={[styles.createBtn, !isSubscriber && styles.createBtnLocked]}
            onPress={() => {
              if (!isSubscriber) { setPaywallVisible(true); return; }
              router.push('/crew/create');
            }}
          >
            <Text style={styles.createBtnText}>{isSubscriber ? 'NEW' : '🔒'}</Text>
          </Pressable>
        </View>

        <PaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          feature="Create a Crew"
          description="Pro subscribers can found crews, customize colors, and lead their team on the touge."
        />

        {/* Tab toggle */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabPill, browseTab === 'browse' && { backgroundColor: T.accent }]}
            onPress={() => setBrowseTab('browse')}
          >
            <Text style={[styles.tabPillText, browseTab === 'browse' && { color: '#fff' }]}>BROWSE</Text>
          </Pressable>
          <Pressable
            style={[styles.tabPill, browseTab === 'leaderboard' && { backgroundColor: T.accent }]}
            onPress={() => setBrowseTab('leaderboard')}
          >
            <Text style={[styles.tabPillText, browseTab === 'leaderboard' && { color: '#fff' }]}>RANKINGS</Text>
          </Pressable>
        </View>

        {browseTab === 'browse' ? (
          <FlatList
            data={availableCrews}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.crewCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  joinMutation.mutate(item.id);
                }}
                disabled={joinMutation.isPending}
              >
                <View style={[styles.colorStrip, { backgroundColor: item.team_color }]} />
                <View style={styles.crewCardBody}>
                  <Text style={styles.crewName}>{item.name.toUpperCase()}</Text>
                  <Text style={styles.crewCity}>{item.home_city || 'Vagabond Team'}</Text>
                </View>
                <Text style={[styles.joinText, { color: T.accent }]}>JOIN →</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No active crews on the touge.</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={leaderboard}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <View style={styles.rankRow}>
                <Text style={[
                  styles.rankNum,
                  index === 0 && { color: '#f59e0b' },
                  index === 1 && { color: '#aaa' },
                  index === 2 && { color: '#cd7c3a' },
                ]}>
                  #{index + 1}
                </Text>
                <View style={[styles.colorStrip, { backgroundColor: item.team_color, height: 48, borderRadius: 2 }]} />
                <View style={styles.rankBody}>
                  <Text style={styles.crewName}>{item.name.toUpperCase()}</Text>
                  <Text style={styles.crewCity}>
                    {item.home_city || 'Vagabond'} · {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
                  </Text>
                </View>
                <Text style={[styles.rankXp, { color: T.accent }]}>
                  {(item.total_xp / 1000).toFixed(1)}K XP
                </Text>
              </View>
            )}
            ListEmptyComponent={
              isLoadingLb ? (
                <View style={styles.center}>
                  <ActivityIndicator color={T.accent} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No crews on the board yet.</Text>
                </View>
              )
            }
          />
        )}
      </View>
    );
  }

  // ── My Crew ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>MY CREW</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroName, { color: crew?.team_color }]}>
            {crew?.name.toUpperCase()}
          </Text>
          <Text style={styles.heroSub}>
            {crew?.home_city} · {crew?.members?.length || 0} Members
          </Text>
          {crew?.description && <Text style={styles.heroDesc}>{crew.description}</Text>}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROSTER</Text>
          <View style={styles.sectionLine} />
        </View>

        {crew?.members?.map((member: CrewMember, i: number) => (
          <View key={member.id} style={styles.memberRow}>
            <Text style={[styles.memberRank, { color: T.accent }]}>#{i + 1}</Text>
            <View style={styles.memberBody}>
              <Text style={styles.memberName}>{member.username}</Text>
              <Text style={styles.memberStats}>LVL {member.level} · {member.xp.toLocaleString()} XP</Text>
            </View>
            {member.id === crew?.leader_id && (
              <Text style={styles.leaderTag}>LEADER</Text>
            )}
          </View>
        ))}

        <Pressable
          style={[styles.leaveBtn, crew?.leader_id === userId && styles.disbandBtn]}
          disabled={leaveMutation.isPending || disbandMutation.isPending}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            if (crew?.leader_id === userId) {
              Alert.alert(
                'Disband Crew',
                `This will permanently delete ${crew?.name} and remove all members. Are you sure?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disband', style: 'destructive', onPress: () => disbandMutation.mutate() },
                ],
              );
            } else {
              Alert.alert(
                'Leave Crew',
                `Leave ${crew?.name}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
                ],
              );
            }
          }}
        >
          <Text style={[styles.leaveBtnText, crew?.leader_id === userId && { color: T.accent }]}>
            {crew?.leader_id === userId ? 'DISBAND CREW' : 'LEAVE TEAM'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function makeStyles(T: Theme) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: T.bg },
    center:        { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
    header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.border },
    backBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backText:      { color: T.text3, fontSize: 22 },
    title:         { color: T.text, fontSize: 14, fontWeight: '900', letterSpacing: 6 },
    createBtn:     { backgroundColor: T.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
    createBtnLocked: { backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
    createBtnText: { color: '#fff', fontSize: 10, fontWeight: '900' },

    tabRow:        { flexDirection: 'row', gap: 8, margin: 16 },
    tabPill:       { flex: 1, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: T.border, alignItems: 'center', backgroundColor: T.card },
    tabPillText:   { color: T.text3, fontSize: 11, fontWeight: '800', letterSpacing: 2 },

    list:          { padding: 16, paddingTop: 0 },
    crewCard:      { backgroundColor: T.card, borderRadius: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: T.border },
    colorStrip:    { width: 6, alignSelf: 'stretch' },
    crewCardBody:  { flex: 1, padding: 16 },
    crewName:      { color: T.text, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
    crewCity:      { color: T.text3, fontSize: 12, marginTop: 2 },
    joinText:      { fontSize: 12, fontWeight: '900', marginRight: 16 },

    rankRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 8, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: T.border, gap: 12 },
    rankNum:       { color: T.text3, fontWeight: '900', fontSize: 16, width: 32, textAlign: 'center' },
    rankBody:      { flex: 1 },
    rankXp:        { fontSize: 13, fontWeight: '900' },

    empty:         { padding: 40, alignItems: 'center' },
    emptyText:     { color: T.text3, textAlign: 'center', fontSize: 14 },

    scroll:        { padding: 24 },
    hero:          { alignItems: 'center', marginBottom: 40 },
    heroName:      { fontSize: 36, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
    heroSub:       { color: T.text3, fontSize: 14, fontWeight: '700', marginTop: 8, letterSpacing: 2 },
    heroDesc:      { color: T.text2, fontSize: 13, marginTop: 16, textAlign: 'center', lineHeight: 20 },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    sectionTitle:  { color: T.text3, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
    sectionLine:   { flex: 1, height: 1, backgroundColor: T.border },

    memberRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, padding: 16, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: T.border },
    memberRank:    { fontWeight: '900', fontSize: 12, marginRight: 16, width: 24 },
    memberBody:    { flex: 1 },
    memberName:    { color: T.text, fontSize: 15, fontWeight: '800' },
    memberStats:   { color: T.text3, fontSize: 11, marginTop: 2, fontWeight: '600' },
    leaderTag:     { color: '#f59e0b', fontSize: 10, fontWeight: '900', letterSpacing: 2, backgroundColor: '#2a1902', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },

    leaveBtn:      { marginTop: 60, paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border },
    leaveBtnText:  { color: T.text3, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
    disbandBtn:    { borderColor: T.accent, borderWidth: 1, borderRadius: 4 },
  });
}
