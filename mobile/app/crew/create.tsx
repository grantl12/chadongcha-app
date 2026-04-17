import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { crewApi } from '../../src/api/crews';

const COLORS = ['#e63946', '#4a9eff', '#a855f7', '#f59e0b', '#22c55e', '#ffffff'];

export default function CreateCrewScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const createMutation = useMutation({
    mutationFn: () => crewApi.create({
      name,
      home_city: city,
      description: desc,
      team_color: color
    }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crews-list'] });
      router.replace('/crew/index');
    }
  });

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>FOUND A TEAM</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>TEAM NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. AKINA SPEEDSTARS"
          placeholderTextColor="#333"
          value={name}
          onChangeText={setName}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>HOME TURF (CITY)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Gunma"
          placeholderTextColor="#333"
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What is your team about?"
          placeholderTextColor="#333"
          value={desc}
          onChangeText={setDesc}
          multiline
        />

        <Text style={styles.label}>TEAM COLOR</Text>
        <View style={styles.colorRow}>
          {COLORS.map(c => (
            <Pressable 
              key={c}
              style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setColor(c);
              }}
            />
          ))}
        </View>

        <Pressable 
          style={[styles.submitBtn, (!name || createMutation.isPending) && styles.submitBtnDisabled]}
          disabled={!name || createMutation.isPending}
          onPress={() => createMutation.mutate()}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitBtnText}>FORM TEAM</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0a0a0a' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#141414' },
  backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText:       { color: '#555', fontSize: 22 },
  title:          { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 4 },

  scroll:         { padding: 24 },
  label:          { color: '#555', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 8, marginTop: 24 },
  input:          { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 8, padding: 16, color: '#fff', fontSize: 16, fontWeight: '800' },
  textArea:       { height: 100, textAlignVertical: 'top' },

  colorRow:       { flexDirection: 'row', gap: 12, marginTop: 8 },
  colorOption:    { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  colorActive:    { borderColor: '#fff' },

  submitBtn:      { backgroundColor: '#fff', borderRadius: 8, paddingVertical: 18, alignItems: 'center', marginTop: 48 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:  { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
});
