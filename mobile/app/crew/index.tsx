import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  ActivityIndicator, ScrollView, RefreshControl
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crewApi, Crew, CrewMember } from '@/api/crews';
import { usePlayerStore } from '@/stores/playerStore';
import { PaywallModal } from '@/components/PaywallModal';

export default function CrewScreen() {
  const queryClient  = useQueryClient();
  const crewId       = usePlayerStore(s => s.crewId);
  const isSubscriber = usePlayerStore(s => s.isSubscriber);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const { data: crew, isLoading: isLoadingCrew, refetch: refetchCrew } = useQuery({
    queryKey: ['crew', crewId],
    queryFn: () => crewId ? crewApi.get(crewId) : Promise.resolve(null),
    enabled: !!crewId,
  });

  const { data: availableCrews = [], isLoading: isLoadingList, refetch: refetchList } = useQuery({
    queryKey: ['crews-list'],
    queryFn: () => crewApi.list(),
    enabled: !crewId,
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => crewApi.join(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      // Note: In a real app, you'd update the player profile in the store here
      // setFullProfile({ ...profile, crewId: id });
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (crewId) await refetchCrew();
    else await refetchList();
    setRefreshing(false);
  }, [crewId]);

  if (isLoadingCrew || isLoadingList) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  // --- RENDERING: NO CREW (Browse mode) ---
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

        <FlatList
          data={availableCrews}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e63946" />}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <Pressable 
              style={styles.crewCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                joinMutation.mutate(item.id);
              }}
            >
              <View style={[styles.colorStrip, { backgroundColor: item.team_color }]} />
              <View style={styles.crewCardBody}>
                <Text style={styles.crewName}>{item.name.toUpperCase()}</Text>
                <Text style={styles.crewCity}>{item.home_city || 'Vagabond Team'}</Text>
              </View>
              <Text style={styles.joinText}>JOIN →</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No active crews found on the touge.</Text>
            </View>
          }
        />
      </View>
    );
  }

  // --- RENDERING: IN A CREW ---
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e63946" />}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroName, { color: crew?.team_color }]}>
            {crew?.name.toUpperCase()}
          </Text>
          <Text style={styles.heroSub}>{crew?.home_city} · {crew?.members?.length || 0} Members</Text>
          {crew?.description && <Text style={styles.heroDesc}>{crew.description}</Text>}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROSTER</Text>
          <View style={styles.sectionLine} />
        </View>

        {crew?.members?.map((member: CrewMember, i: number) => (
          <View key={member.id} style={styles.memberRow}>
            <Text style={styles.memberRank}>#{i + 1}</Text>
            <View style={styles.memberBody}>
              <Text style={styles.memberName}>{member.username}</Text>
              <Text style={styles.memberStats}>LVL {member.level} · {member.xp.toLocaleString()} XP</Text>
            </View>
          </View>
        ))}

        <Pressable 
          style={styles.leaveBtn}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            // leaveMutation.mutate();
          }}
        >
          <Text style={styles.leaveBtnText}>LEAVE TEAM</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0a0a0a' },
  center:         { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#141414' },
  backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText:       { color: '#555', fontSize: 22 },
  title:          { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 6 },
  createBtn:        { backgroundColor: '#e63946', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
  createBtnLocked:  { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  createBtnText:    { color: '#fff', fontSize: 10, fontWeight: '900' },

  list:           { padding: 20 },
  crewCard:       { backgroundColor: '#141414', borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  colorStrip:     { width: 6, height: '100%' },
  crewCardBody:   { flex: 1, padding: 16 },
  crewName:       { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  crewCity:       { color: '#555', fontSize: 12, marginTop: 2 },
  joinText:       { color: '#e63946', fontSize: 12, fontWeight: '900', marginRight: 16 },

  empty:          { padding: 40, alignItems: 'center' },
  emptyText:      { color: '#333', textAlign: 'center', fontSize: 14 },

  scroll:         { padding: 24 },
  hero:           { alignItems: 'center', marginBottom: 40 },
  heroName:       { fontSize: 36, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  heroSub:        { color: '#555', fontSize: 14, fontWeight: '700', marginTop: 8, letterSpacing: 2 },
  heroDesc:       { color: '#444', fontSize: 13, marginTop: 16, textAlign: 'center', lineHeight: 20 },

  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sectionTitle:   { color: '#333', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  sectionLine:    { flex: 1, height: 1, backgroundColor: '#141414' },

  memberRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', padding: 16, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  memberRank:     { color: '#e63946', fontWeight: '900', fontSize: 12, marginRight: 16, width: 24 },
  memberBody:     { flex: 1 },
  memberName:     { color: '#fff', fontSize: 15, fontWeight: '800' },
  memberStats:    { color: '#444', fontSize: 11, marginTop: 2, fontWeight: '600' },

  leaveBtn:       { marginTop: 60, paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#141414' },
  leaveBtnText:   { color: '#333', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
});
