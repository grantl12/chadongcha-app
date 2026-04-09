import { View, Text, StyleSheet } from 'react-native';

// TODO Phase 7: Mapbox GL dark-mode road ownership layer, Road King overlays
export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ROADS</Text>
      <Text style={styles.empty}>Territory map coming in Phase 7.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  title:     { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  empty:     { color: '#444', marginTop: 12, fontSize: 14 },
});
