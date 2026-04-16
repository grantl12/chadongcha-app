import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  RefreshControl, ScrollView, Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crewApi, Crew, CrewMember } from '@/api/crews';
import { usePlayerStore } from '@/stores/playerStore';

export default function CrewDetailScreen() {
  const queryClient = useQueryClient();
  const currentPlayerId = usePlayerStore(s => s.userId); // Assuming userId is stored here
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: crew, isLoading, isError } = useQuery<Crew>({
    queryKey: ['crew', id],
    queryFn: () => crewApi.get(id!),
    enabled: !!id,
  });

  const leaveMutation = useMutation({
    mutationFn: () => crewApi.leave(),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      queryClient.invalidateQueries({ queryKey: ['crew'] }); // Invalidate current crew data
      queryClient.setQueryData(['crew'], null); // Clear crew data from cache
      queryClient.invalidateQueries({ queryKey: ['crews-list'] }); // Refresh list of crews
      // Update player store if it holds crewId
      // playerStore.setCrewId(null); 
      router.replace('/crew'); // Navigate back to the crew hub/list
    },
    onError: (error: Error) => {
      console.error("Failed to leave crew:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['crew', id] });
    setRefreshing(false);
  }, [id]);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#e63946" /></View>;
  }
  if (isError || !crew) {
    return <View style={styles.center}><Text style={styles.hint}>Could not load crew details.</Text></View>;
  }

  const isLeader = crew.leader_id === currentPlayerId;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>CREW DETAILS</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e63946" />}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroName, { color: crew.team_color }]}>
            {crew.name.toUpperCase()}
          </Text>
          <Text style={styles.heroSub}>{crew.home_city || 'Vagabond Team'} · {crew.members?.length || 0} Members</Text>
          {crew.description && <Text style={styles.heroDesc}>{crew.description}</Text>}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROSTER</Text>
          <View style={styles.sectionLine} />
        </View>

        {crew.members?.map((member: CrewMember, i: number) => (
          <View key={member.id} style={styles.memberRow}>
            <Text style={styles.memberRank}>#{i + 1}</Text>
            <View style={styles.memberBody}>
              <Text style={styles.memberName}>{member.username}</Text>
              <Text style={styles.memberStats}>LVL {member.level} · {member.xp.toLocaleString()} XP</Text>
            </View>
            {member.id === crew.leader_id && <Text style={styles.leaderTag}>LEADER</Text>}
          </View>
        ))}

        <Pressable 
          style={[styles.leaveBtn, isLeader && styles.leaderLeaveBtn]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            if (isLeader) {
              // TODO: Handle leader leaving scenario (e.g., prompt for new leader or disband)
              Alert.alert("Cannot Leave", "As leader, you must disband the crew or appoint a new leader first.", [{ text: "OK" }]);
            } else {
              // Prompt user before leaving
              Alert.alert("Leave Crew", `Are you sure you want to leave ${crew.name}?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Leave", onPress: () => leaveMutation.mutate(), style: "destructive" }
              ]);
            }
          }}
          disabled={leaveMutation.isPending}
        >
          <Text style={[styles.leaveBtnText, isLeader && styles.leaderLeaveBtnText]}>
            {isLeader ? "DISBAND CREW" : "LEAVE CREW"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0a0a0a' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#141414' },
  backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText:       { color: '#555', fontSize: 22 },
  title:          { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 4 },
  createBtn:      { backgroundColor: '#e63946', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
  createBtnText:  { color: '#fff', fontSize: 10, fontWeight: '900' },
  hint:           { color: '#444', fontSize: 14, textAlign: 'center' },

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
  leaderTag:      { color: '#f59e0b', fontSize: 10, fontWeight: '900', letterSpacing: 2, backgroundColor: '#2a1902', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },

  leaveBtn:       { marginTop: 60, paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#141414' },
  leaveBtnText:   { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  leaderLeaveBtn: { borderColor: '#e63946', borderWidth: 1 },
  leaderLeaveBtnText: { color: '#e63946' },
});
