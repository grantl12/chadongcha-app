/**
 * Scan360PhotoViewer — swipeable photo viewer for 360° scan catches.
 *
 * Shows up to 4 captured angles (FRONT · PASSENGER · REAR · DRIVER) as
 * a paginated horizontal scroll. Photos are loaded from local file paths
 * (stored in the app's documents directory after the scan).
 *
 * Falls back gracefully if a photo is missing or the path is stale.
 */

import { useRef, useState, useCallback } from 'react';
import {
  View, Image, Text, StyleSheet, ScrollView,
  Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

const ANGLE_LABELS = ['FRONT', 'PASSENGER', 'REAR', 'DRIVER'] as const;

type Props = {
  /** Ordered [front, passenger, rear, driver] — empty string means missing. */
  photoPaths: string[];
  /** Accent colour for the angle indicator. */
  accent?: string;
  /** Fill the parent container; defaults to true. */
  flex?: boolean;
};

export function Scan360PhotoViewer({ photoPaths, accent = '#e63946', flex = true }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const validPhotos = photoPaths
    .map((path, i) => ({ path, label: ANGLE_LABELS[i] ?? `ANGLE ${i + 1}` }))
    .filter(p => !!p.path);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      setActiveIndex(Math.min(Math.max(idx, 0), validPhotos.length - 1));
    },
    [validPhotos.length],
  );

  if (validPhotos.length === 0) {
    return (
      <View style={[styles.noPhoto, flex && { flex: 1 }]}>
        <Text style={styles.noPhotoText}>NO PHOTOS</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, flex && { flex: 1 }]}>
      {/* Photo pages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={StyleSheet.absoluteFill}
      >
        {validPhotos.map(({ path, label }) => (
          <View key={label} style={styles.page}>
            <Image
              source={{ uri: path.startsWith('file://') ? path : `file://${path}` }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              // On error (stale path), show nothing — the card's placeholder renders behind
              onError={() => {}}
            />
          </View>
        ))}
      </ScrollView>

      {/* Angle label */}
      <View style={styles.labelRow}>
        <View style={[styles.anglePill, { borderColor: accent + '88' }]}>
          <Text style={[styles.angleText, { color: accent }]}>
            {validPhotos[activeIndex]?.label}
          </Text>
        </View>
      </View>

      {/* Dot indicators */}
      {validPhotos.length > 1 && (
        <View style={styles.dots}>
          {validPhotos.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && styles.dotActive,
                i === activeIndex && { backgroundColor: accent },
              ]}
            />
          ))}
        </View>
      )}

      {/* Scan type badge — top right */}
      <View style={[styles.scanBadge, { borderColor: accent + '55' }]}>
        <Text style={[styles.scanBadgeText, { color: accent }]}>360°</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { overflow: 'hidden', backgroundColor: '#0a0a0a' },
  page:          { width: SCREEN_W * 0.62, overflow: 'hidden' },

  noPhoto:       { backgroundColor: '#0e0e14', alignItems: 'center', justifyContent: 'center' },
  noPhotoText:   { color: '#222', fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  labelRow:      { position: 'absolute', top: 10, left: 10 },
  anglePill:     { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#00000088' },
  angleText:     { fontSize: 9, fontWeight: '800', letterSpacing: 2 },

  dots:          { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot:           { width: 4, height: 4, borderRadius: 2, backgroundColor: '#333' },
  dotActive:     { width: 12 },

  scanBadge:     { position: 'absolute', top: 10, right: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#00000088' },
  scanBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
