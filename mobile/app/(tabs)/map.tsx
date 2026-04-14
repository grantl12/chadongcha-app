import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Mapbox, { Camera, LocationPuck, MapView, ShapeSource, LineLayer, SymbolLayer } from '@rnmapbox/maps';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useLocation } from '@/hooks/useLocation';
import { usePlayerStore } from '@/stores/playerStore';

// Set token once at module level — safe to call multiple times
const token: string = Constants.expoConfig?.extra?.mapboxPublicToken ?? '';
Mapbox.setAccessToken(token);

// Dark road-ownership style
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

type RoadSegment = {
  id: string;
  name: string | null;
  city: string | null;
  king_id: string | null;
  king_scan_count: number;
  king_since: string | null;
  players: { username: string } | null;
  geometry?: GeoJSON.LineString;
};

type BottomSheetData = {
  segment: RoadSegment;
  challengers: { players: { username: string }; scan_count_30d: number }[];
} | null;

export default function MapScreen() {
  const { latitude, longitude } = useLocation();
  const userId = usePlayerStore(s => s.userId);
  const [selected, setSelected] = useState<BottomSheetData>(null);
  const camera = useRef<Camera>(null);

  // Nearby road segments around player's position
  // Road segments are populated via the territory worker (Phase 7 backend).
  // Until OSM data is seeded, this returns an empty list gracefully.
  const { data: segments = [], isLoading } = useQuery<RoadSegment[]>({
    queryKey: ['road-segments', latitude?.toFixed(2), longitude?.toFixed(2)],
    queryFn: () =>
      apiClient.get(
        `/territory/nearby?lat=${latitude}&lon=${longitude}&radius_km=5`,
      ) as Promise<RoadSegment[]>,
    enabled: !!(latitude && longitude),
    staleTime: 60_000,
  });

  // Centre map on player when location first resolves
  useEffect(() => {
    if (latitude && longitude) {
      camera.current?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 14,
        animationDuration: 800,
      });
    }
  }, [!!latitude]);  // fire once when location becomes available

  async function handleSegmentPress(segmentId: string) {
    try {
      const res = await apiClient.get(`/leaderboard/road/${segmentId}`) as BottomSheetData;
      setSelected(res);
    } catch {
      setSelected(null);
    }
  }

  // Build GeoJSON for all road segments — unclaimed + owned
  // status: 'mine' | 'theirs' | 'unclaimed'
  const allFeatures: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: segments
      .filter(s => s.geometry)
      .map(s => ({
        type: 'Feature' as const,
        id: s.id,
        geometry: s.geometry!,
        properties: {
          status:   s.king_id ? (s.king_id === userId ? 'mine' : 'theirs') : 'unclaimed',
          kingName: s.players?.username ?? null,
        },
      })),
  };

  return (
    <View style={styles.container}>
      {!token ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Mapbox token not configured.</Text>
        </View>
      ) : (
        <MapView
          style={styles.map}
          styleURL={MAP_STYLE}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
        >
          <Camera ref={camera} zoomLevel={13} />

          {/* Player location puck */}
          <LocationPuck
            puckBearingEnabled
            puckBearing="heading"
            pulsing={{ isEnabled: true, color: '#e63946' }}
          />

          {/* All road segments — unclaimed dim, owned glowing */}
          {allFeatures.features.length > 0 && (
            <ShapeSource
              id="all-roads"
              shape={allFeatures}
              onPress={e => {
                const id = e.features?.[0]?.id as string | undefined;
                if (id) handleSegmentPress(id);
              }}
            >
              {/* Glow layer — only on owned roads */}
              <LineLayer
                id="road-glow"
                style={{
                  lineColor: ['case',
                    ['==', ['get', 'status'], 'mine'],    '#e63946',
                    ['==', ['get', 'status'], 'theirs'],  '#4a9eff',
                    'transparent',
                  ],
                  lineWidth: 8,
                  lineOpacity: 0.15,
                  lineBlur: 4,
                }}
              />
              {/* Main road line */}
              <LineLayer
                id="road-line"
                style={{
                  lineColor: ['case',
                    ['==', ['get', 'status'], 'mine'],    '#e63946',
                    ['==', ['get', 'status'], 'theirs'],  '#4a9eff',
                    '#2a2a2a',
                  ],
                  lineWidth: ['case',
                    ['==', ['get', 'status'], 'unclaimed'], 1.5,
                    2.5,
                  ],
                  lineOpacity: ['case',
                    ['==', ['get', 'status'], 'unclaimed'], 0.5,
                    0.9,
                  ],
                }}
              />
            </ShapeSource>
          )}
        </MapView>
      )}

      {/* Recenter button */}
      {latitude && longitude && (
        <Pressable
          style={styles.recenterBtn}
          onPress={() => camera.current?.setCamera({
            centerCoordinate: [longitude, latitude],
            zoomLevel: 14,
            animationDuration: 600,
          })}
        >
          <Text style={styles.recenterIcon}>⊕</Text>
        </Pressable>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingBadge}>
          <ActivityIndicator size="small" color="#e63946" />
        </View>
      )}

      {/* Empty state overlay — road data not seeded yet */}
      {!isLoading && segments.length === 0 && latitude && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyTitle}>ROADS</Text>
          <Text style={styles.emptyText}>No road data in this area yet.</Text>
          <Text style={styles.emptyHint}>Road Kings appear as you catch vehicles.</Text>
        </View>
      )}

      {/* No location state */}
      {!latitude && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyTitle}>ROADS</Text>
          <Text style={styles.emptyText}>Enable location to view your territory.</Text>
        </View>
      )}

      {/* Road segment bottom sheet */}
      {selected?.segment && (
        <View style={styles.sheet}>
          <Pressable style={styles.sheetClose} onPress={() => setSelected(null)}>
            <Text style={styles.sheetCloseText}>✕</Text>
          </Pressable>

          <Text style={styles.sheetRoad}>{selected.segment.name ?? 'Unnamed Road'}</Text>
          <Text style={styles.sheetCity}>{selected.segment.city ?? '—'}</Text>

          <View style={styles.sheetKingRow}>
            <Text style={styles.sheetKingLabel}>ROAD KING</Text>
            <Text style={styles.sheetKingName}>
              {selected.segment.players?.username ?? 'Unclaimed'}
            </Text>
            {selected.segment.king_id === userId && (
              <Text style={styles.sheetYouBadge}>YOU</Text>
            )}
          </View>

          {selected.segment.king_id && (() => {
            const kingCount = selected.segment.king_scan_count ?? 0;
            const myCount   = selected.challengers?.find(
              c => (c as any).player_id === userId
            )?.scan_count_30d ?? 0;
            const isKing    = selected.segment.king_id === userId;
            const needed    = isKing ? null : Math.max(0, kingCount - myCount + 1);
            return (
              <View style={{ gap: 4 }}>
                <Text style={styles.sheetScans}>{kingCount} scans in 30 days</Text>
                {!isKing && needed !== null && (
                  <Text style={styles.sheetClaim}>
                    {needed === 0
                      ? '🔥 You can claim this road — go drive it!'
                      : `${needed} more scan${needed === 1 ? '' : 's'} to claim`}
                  </Text>
                )}
              </View>
            );
          })()}

          {selected.challengers?.length > 0 && (
            <>
              <Text style={styles.sheetChallengersLabel}>CHALLENGERS</Text>
              {selected.challengers.slice(0, 3).map((c, i) => (
                <View key={i} style={styles.challengerRow}>
                  <Text style={styles.challengerRank}>{i + 1}</Text>
                  <Text style={styles.challengerName}>{c.players?.username ?? '—'}</Text>
                  <Text style={styles.challengerScans}>{c.scan_count_30d} scans</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: '#0a0a0a' },
  map:                   { flex: 1 },
  center:                { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:             { color: '#555', fontSize: 14 },
  recenterBtn:           { position: 'absolute', bottom: 140, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  recenterIcon:          { color: '#e63946', fontSize: 22, lineHeight: 24 },
  loadingBadge:          { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: '#0a0a0acc', borderRadius: 20, padding: 10 },
  emptyOverlay:          { position: 'absolute', bottom: 120, left: 24, right: 24, backgroundColor: '#0a0a0acc', borderRadius: 12, padding: 20, alignItems: 'center', gap: 6 },
  emptyTitle:            { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  emptyText:             { color: '#555', fontSize: 13 },
  emptyHint:             { color: '#333', fontSize: 12 },
  sheet:                 { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0f0f0f', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 6, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  sheetClose:            { position: 'absolute', top: 16, right: 20 },
  sheetCloseText:        { color: '#444', fontSize: 18 },
  sheetRoad:             { color: '#fff', fontSize: 20, fontWeight: '800' },
  sheetCity:             { color: '#555', fontSize: 13, marginBottom: 8 },
  sheetKingRow:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetKingLabel:        { color: '#333', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sheetKingName:         { color: '#e63946', fontSize: 15, fontWeight: '700' },
  sheetYouBadge:         { backgroundColor: '#e6394622', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sheetScans:            { color: '#444', fontSize: 12 },
  sheetClaim:            { color: '#e63946', fontSize: 12, fontWeight: '600' },
  sheetChallengersLabel: { color: '#333', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: 8 },
  challengerRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  challengerRank:        { color: '#333', fontSize: 13, fontWeight: '700', width: 20 },
  challengerName:        { color: '#888', fontSize: 13, flex: 1 },
  challengerScans:       { color: '#444', fontSize: 12 },
});
