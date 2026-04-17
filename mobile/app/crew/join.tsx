import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  RefreshControl, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crewApi, Crew, CrewMember } from '@/api/crews';
import { usePlayerStore } from '@/stores/playerStore';

export default function JoinCrewScreen() {
  const queryClient = useQueryClient();
  const currentPlayerId = usePlayerStore(s => s.userId); // Assuming userId is stored here
  const [refreshing, setRefreshing] = useState(false);

  const { data: availableCrews = [], isLoading, isError } = useQuery<Crew[]>({
    queryKey: ['crews-list'],
    queryFn: () => crewApi.list(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => crewApi.join(id),
    onSuccess: (data, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.setQueryData(['crew'], null); // Clear crew data from cache
      queryClient.invalidateQueries({ queryKey: ['crews-list'] }); // Refresh list of crews
      // Update player store with new crewId if available from backend response
      // In a real app, you'd likely fetch player profile again or get ID from response
      // For now, just navigate back to the crew hub.
      router.replace('/crew/index');
    },
    onError: (error) => {
      console.error("Failed to join crew:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Display error to user if needed
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['crews-list'] });
    setRefreshing(false);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>FIND A TEAM</Text>
        <Pressable style={styles.createBtn} onPress={() => router.push('/crew/create')}>
          <Text style={styles.createBtnText}>NEW</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e63946" />
          <Text style={styles.emptyText}>Searching for crews…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Could not load crews. Try again later.</Text>
        </View>
      ) : (
        <FlatList
          data={availableCrews}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e63946" />}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <Pressable 
              style={[styles.crewCard, joinMutation.isPending && styles.disabledCard]}
              onPress={() => {
                if (!joinMutation.isPending) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  joinMutation.mutate(item.id);
                }
              }}
              disabled={joinMutation.isPending}
            >
              <View style={[styles.colorStrip, { backgroundColor: item.team_color }]} />
              <View style={styles.crewCardBody}>
                <Text style={styles.crewName}>{item.name.toUpperCase()}</Text>
                <Text style={styles.crewCity}>{item.home_city || 'Vagabond Team'} · {item.members?.length || 0} Members</Text>
              </View>
              <Text style={styles.joinText}>JOIN →</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No active crews found on the touge.</Text>
              <Text style={styles.emptySubText}>Why not start your own?</Text>
            </View>
          }
        />
      )}
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

  list:           { padding: 20 },
  crewCard:       { backgroundColor: '#141414', borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a' },
  disabledCard:   { opacity: 0.6 },
  colorStrip:     { width: 6, height: '100%' },
  crewCardBody:   { flex: 1, padding: 16 },
  crewName:       { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  crewCity:       { color: '#555', fontSize: 12, marginTop: 2 },
  joinText:       { color: '#e63946', fontSize: 12, fontWeight: '900', marginRight: 16 },

  empty:          { padding: 40, alignItems: 'center' },
  emptyText:      { color: '#333', textAlign: 'center', fontSize: 14 },
  emptySubText:   { color: '#555', textAlign: 'center', fontSize: 12, marginTop: 4 },
});
