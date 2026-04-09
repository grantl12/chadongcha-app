import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';

// Radar / Hunt screen — satellite overhead tracker + highway mode entry
export default function RadarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RADAR</Text>
      <Text style={styles.subtitle}>Space objects overhead · Road hunting</Text>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/highway')}>
        <Text style={styles.buttonText}>HIGHWAY MODE</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.push('/scan360')}>
        <Text style={styles.buttonText}>360° SCAN</Text>
      </Pressable>

      {/* TODO Phase 8: Mapbox satellite radar sweep + overhead pass list */}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title:          { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 4 },
  subtitle:       { color: '#555', fontSize: 13, marginTop: 4, marginBottom: 48 },
  primaryButton:  { backgroundColor: '#e63946', borderRadius: 8, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 16 },
  secondaryButton:{ backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 16, paddingHorizontal: 40 },
  buttonText:     { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 2 },
});
