import { View, Text, StyleSheet } from 'react-native';

// TODO Phase 6: Grid of caught vehicles, rarity filter, tap → 3D glTF render
export default function GarageScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GARAGE</Text>
      <Text style={styles.empty}>No catches yet. Hit the road.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  title:     { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  empty:     { color: '#444', marginTop: 12, fontSize: 14 },
});
