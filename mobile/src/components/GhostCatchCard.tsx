import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { type CatchRecord } from '@/stores/catchStore';

const GHOST_BG     = '#07020f';
const GHOST_PURPLE = '#8b5cf6';
const GHOST_DIM    = '#4c1d95';

export function GhostCatchCard({ item }: { item: CatchRecord }) {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const glowOpacity  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] });
  const innerOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.0] });

  const date = new Date(item.caughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      '??? GHOST SPECIMEN',
      'This vehicle couldn\'t be identified by the AI. Help the community classify it in the Feed.',
      [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'Go to Feed', onPress: () => router.push('/(tabs)/feed') },
      ],
    );
  }

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      {/* Animated glow ring */}
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.glowRing, { opacity: glowOpacity }]} />

      <View style={styles.topRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>???</Text>
        </View>
        {!item.synced && <View style={styles.unsyncedDot} />}
      </View>

      {/* Mystery symbol */}
      <Animated.View style={[styles.symbolWrap, { opacity: innerOpacity }]}>
        <Text style={styles.symbol}>◈</Text>
      </Animated.View>

      <View style={styles.body}>
        <Text style={styles.unknownLabel}>UNKNOWN</Text>
        <Text style={styles.unknownSub}>VEHICLE</Text>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.ghostLabel}>GHOST SPECIMEN</Text>
        <Text style={styles.dateLabel}>{date}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    height: 190,
    backgroundColor: GHOST_BG,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: GHOST_DIM,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'space-between',
    marginRight: 10,
  },
  glowRing: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GHOST_PURPLE,
    shadowColor: GHOST_PURPLE,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge:   { borderWidth: 1, borderColor: GHOST_DIM, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeText:    { color: GHOST_PURPLE, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  unsyncedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  symbolWrap:  { alignItems: 'center', justifyContent: 'center', flex: 1 },
  symbol:      { color: GHOST_PURPLE, fontSize: 40, textAlign: 'center' },
  body:        { alignItems: 'center', gap: 1 },
  unknownLabel:{ color: '#c4b5fd', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  unknownSub:  { color: GHOST_DIM, fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  bottomRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ghostLabel:  { color: GHOST_PURPLE, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  dateLabel:   { color: GHOST_DIM, fontSize: 9 },
});
