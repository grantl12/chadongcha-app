import { View, Text, StyleSheet } from 'react-native';

// TODO Phase 9: Unknown vehicle posts, community voting, ID suggestions
export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FEED</Text>
      <Text style={styles.empty}>Community ID feed coming in Phase 9.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  title:     { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  empty:     { color: '#444', marginTop: 12, fontSize: 14 },
});
