import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { usePlayerStore } from '@/stores/playerStore';

function LevelUpBanner({ level }: { level: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [level]);

  return (
    <Animated.View style={[styles.banner, { opacity }]} pointerEvents="none">
      <Text style={styles.bannerText}>LEVEL UP</Text>
      <Text style={styles.bannerLevel}>{level}</Text>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const accessToken = usePlayerStore(s => s.accessToken);
  const level       = usePlayerStore(s => s.level);
  const [bannerKey, setBannerKey] = useState<number | null>(null);
  const prevLevel = useRef(level);

  useEffect(() => {
    if (level > prevLevel.current) {
      setBannerKey(level);
    }
    prevLevel.current = level;
  }, [level]);

  if (!accessToken) return <Redirect href="/onboarding" />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a' },
          tabBarActiveTintColor: '#e63946',
          tabBarInactiveTintColor: '#555',
        }}
      >
        <Tabs.Screen name="index"   options={{ title: 'Radar' }} />
        <Tabs.Screen name="garage"  options={{ title: 'Garage' }} />
        <Tabs.Screen name="map"     options={{ title: 'Roads' }} />
        <Tabs.Screen name="feed"    options={{ title: 'Feed' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      {bannerKey && <LevelUpBanner key={bannerKey} level={bannerKey} />}
    </View>
  );
}

const styles = StyleSheet.create({
  banner:      { position: 'absolute', top: 80, alignSelf: 'center', backgroundColor: '#e63946', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center', gap: 2, shadowColor: '#e63946', shadowOpacity: 0.6, shadowRadius: 20, elevation: 10 },
  bannerText:  { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  bannerLevel: { color: '#fff', fontSize: 36, fontWeight: '900', lineHeight: 40 },
});
