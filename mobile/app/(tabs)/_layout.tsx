import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a' },
        tabBarActiveTintColor: '#e63946',
        tabBarInactiveTintColor: '#555',
      }}
    >
      <Tabs.Screen name="index"      options={{ title: 'Radar' }} />
      <Tabs.Screen name="garage"     options={{ title: 'Garage' }} />
      <Tabs.Screen name="map"        options={{ title: 'Roads' }} />
      <Tabs.Screen name="feed"       options={{ title: 'Feed' }} />
      <Tabs.Screen name="profile"    options={{ title: 'Profile' }} />
    </Tabs>
  );
}
