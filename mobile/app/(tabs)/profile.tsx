import { View, Text, StyleSheet } from 'react-native';
import { usePlayerStore } from '@/stores/playerStore';

export default function ProfileScreen() {
  const { xp, level, username } = usePlayerStore();

  return (
    <View style={styles.container}>
      <Text style={styles.username}>{username ?? 'Driver'}</Text>
      <Text style={styles.level}>Level {level}</Text>
      <Text style={styles.xp}>{xp.toLocaleString()} XP</Text>
      {/* TODO Phase 4+: badge grid, hero car picker, road king count, weekly city rank */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  username:  { color: '#fff', fontSize: 26, fontWeight: '800' },
  level:     { color: '#e63946', fontSize: 16, marginTop: 6, fontWeight: '700' },
  xp:        { color: '#888', fontSize: 14, marginTop: 4 },
});
