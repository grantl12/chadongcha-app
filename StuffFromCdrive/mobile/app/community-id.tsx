/**
 * Community ID — detail screen for an unknown catch.
 *
 * Shows the community photo and suggestion tally. Players can submit
 * a make/model guess. 3+ agreeing votes auto-confirm.
 *
 * Route: /community-id?unknownId=<uuid>
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, Image, Pressable, ScrollView,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { r2Url } from '@/utils/r2';

type Suggestion = {
  generationId: string;
  label: string;
  votes: number;
};

type UnknownDetail = {
  id: string;
  catchId: string;
  bodyType: string | null;
  city: string | null;
  photoRef: string | null;
  status: string;
  createdAt: string;
  catcher: string;
  catchType: string;
  suggestions: Suggestion[];
};

const CATCH_TYPE_LABEL: Record<string, string> = {
  highway: 'SENTRY',
  scan360: '360°',
  space:   'SPC',
  unknown: '???',
};

export default function CommunityIdScreen() {
  const { unknownId } = useLocalSearchParams<{ unknownId: string }>();
  const queryClient = useQueryClient();

  const [make, setMake]   = useState('');
  const [model, setModel] = useState('');
  const [gen, setGen]     = useState('');

  const { data, isLoading, isError } = useQuery<UnknownDetail>({
    queryKey: ['community-unknown', unknownId],
    queryFn:  () => apiClient.get(`/community/unknown/${unknownId}`) as Promise<UnknownDetail>,
    enabled:  !!unknownId,
  });

  const mutation = useMutation({
    mutationFn: ({ make, model, generation }: { make: string; model: string; generation: string }) =>
      apiClient.post('/community/suggest', {
        unknown_catch_id: unknownId,
        make,
        model,
        generation,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-unknown', unknownId] });
      queryClient.invalidateQueries({ queryKey: ['community-unknown-list'] });
      setMake('');
      setModel('');
      setGen('');
      Alert.alert('Thanks!', 'Your suggestion has been recorded.');
    },
    onError: (e: any) => {
      const msg = e?.message ?? 'Could not submit suggestion';
      // Surface the "could not find vehicle" hint cleanly
      const detail = msg.includes('422') || msg.includes('Could not find')
        ? 'Vehicle not found in our catalog. Try a different spelling (e.g. "Civic" not "Honda Civic").'
        : msg;
      Alert.alert('Error', detail);
    },
  });

  function handleSubmit() {
    if (!make.trim() || !model.trim()) {
      Alert.alert('Missing info', 'Please enter at least a make and model.');
      return;
    }
    mutation.mutate({ make: make.trim(), model: model.trim(), generation: gen.trim() });
  }

  const photoUrl = data?.photoRef ? r2Url(data.photoRef) : null;
  const topSuggestion = data?.suggestions[0];

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e63946" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load catch.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>GO BACK</Text>
        </Pressable>
      </View>
    );
  }

  const isConfirmed = data.status === 'confirmed';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Text style={styles.backLabel}>← COMMUNITY ID</Text>
        </Pressable>

        {/* Photo */}
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.noPhoto}>
            <Text style={styles.noPhotoText}>NO PHOTO AVAILABLE</Text>
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={[styles.badge, isConfirmed && styles.badgeConfirmed]}>
            <Text style={[styles.badgeText, isConfirmed && styles.badgeTextConfirmed]}>
              {isConfirmed ? 'CONFIRMED' : 'NEEDS ID'}
            </Text>
          </View>
          <Text style={styles.metaType}>{CATCH_TYPE_LABEL[data.catchType]}</Text>
          {data.city && <Text style={styles.metaCity}>{data.city}</Text>}
          {data.bodyType && <Text style={styles.metaBody}>{data.bodyType}</Text>}
        </View>
        <Text style={styles.catcher}>Caught by {data.catcher}</Text>

        {/* Confirmed result */}
        {isConfirmed && topSuggestion && (
          <View style={styles.confirmedBlock}>
            <Text style={styles.confirmedLabel}>IDENTIFIED AS</Text>
            <Text style={styles.confirmedVehicle}>{topSuggestion.label}</Text>
            <Text style={styles.confirmedVotes}>{topSuggestion.votes} votes agreed</Text>
          </View>
        )}

        {/* Suggestion tally */}
        {data.suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COMMUNITY VOTES</Text>
            {data.suggestions.map((s, i) => (
              <View key={s.generationId} style={styles.suggestionRow}>
                <View style={styles.voteBar}>
                  <View
                    style={[
                      styles.voteFill,
                      { width: `${Math.round((s.votes / data.suggestions[0].votes) * 100)}%` as any },
                      i === 0 && styles.voteFillTop,
                    ]}
                  />
                </View>
                <Text style={[styles.suggestionLabel, i === 0 && styles.suggestionLabelTop]}>
                  {s.label}
                </Text>
                <Text style={styles.voteCount}>{s.votes}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Suggestion form */}
        {!isConfirmed && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>I KNOW THIS ONE</Text>
            <Text style={styles.formHint}>
              Use exact names from our catalog (e.g. "Toyota", "Camry", "XV70 (2019–present)").
              Generation is optional.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Make (e.g. Toyota)"
              placeholderTextColor="#444"
              value={make}
              onChangeText={setMake}
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Model (e.g. Camry)"
              placeholderTextColor="#444"
              value={model}
              onChangeText={setModel}
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Generation hint (optional, e.g. XV70)"
              placeholderTextColor="#444"
              value={gen}
              onChangeText={setGen}
              autoCorrect={false}
            />
            <Pressable
              style={[styles.submitBtn, mutation.isPending && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.submitBtnText}>SUBMIT ID</Text>
              }
            </Pressable>
          </View>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Photos are submitted by players who opted into community contribution.
          If this photo contains inappropriate content, please report it to support.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0a0a0a' },
  content:             { paddingBottom: 60 },
  center:              { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText:           { color: '#555', fontSize: 14 },

  backRow:             { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16 },
  backLabel:           { color: '#555', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  backBtn:             { borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText:         { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  photo:               { width: '100%', height: 280, backgroundColor: '#111' },
  noPhoto:             { width: '100%', height: 200, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  noPhotoText:         { color: '#333', fontSize: 11, letterSpacing: 2, fontWeight: '700' },

  metaRow:             { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16, flexWrap: 'wrap' },
  badge:               { backgroundColor: '#1a1a1a', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeConfirmed:      { backgroundColor: '#0a2e18' },
  badgeText:           { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  badgeTextConfirmed:  { color: '#4caf50' },
  metaType:            { color: '#e63946', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  metaCity:            { color: '#555', fontSize: 12 },
  metaBody:            { color: '#555', fontSize: 12 },
  catcher:             { color: '#333', fontSize: 12, paddingHorizontal: 20, marginTop: 4, marginBottom: 20 },

  confirmedBlock:      { marginHorizontal: 20, backgroundColor: '#0a2e18', borderRadius: 12, borderWidth: 1, borderColor: '#4caf5033', padding: 16, marginBottom: 24 },
  confirmedLabel:      { color: '#4caf50', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  confirmedVehicle:    { color: '#fff', fontSize: 22, fontWeight: '900' },
  confirmedVotes:      { color: '#4caf5088', fontSize: 12, marginTop: 4 },

  section:             { paddingHorizontal: 20, marginBottom: 28, gap: 12 },
  sectionTitle:        { color: '#333', fontSize: 10, fontWeight: '800', letterSpacing: 3 },

  suggestionRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voteBar:             { flex: 1, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  voteFill:            { height: '100%', backgroundColor: '#333', borderRadius: 2 },
  voteFillTop:         { backgroundColor: '#e63946' },
  suggestionLabel:     { color: '#555', fontSize: 13, flex: 2 },
  suggestionLabelTop:  { color: '#fff', fontWeight: '700' },
  voteCount:           { color: '#333', fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'right' },

  formHint:            { color: '#333', fontSize: 12, lineHeight: 17 },
  input:               { backgroundColor: '#111', color: '#fff', borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#1a1a1a' },
  submitBtn:           { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitBtnText:       { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 2 },

  disclaimer:          { color: '#2a2a2a', fontSize: 11, paddingHorizontal: 20, lineHeight: 16, marginTop: 8 },
});
