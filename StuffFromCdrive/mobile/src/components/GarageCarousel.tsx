/**
 * GarageCarousel — 3D coverflow-style showcase for caught vehicles.
 *
 * Uses React Native's Animated + perspective transforms (no WebGL).
 * When asset_3d_ref is populated and a glTF loader is wired in,
 * replace the VehiclePlaceholder with an actual model render.
 */

import {
  useRef, useState, useCallback, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, Animated, PanResponder,
  Dimensions, Pressable,
} from 'react-native';
import { router } from 'expo-router';
import type { CatchRecord } from '@/stores/catchStore';
import { Scan360PhotoViewer } from '@/components/Scan360PhotoViewer';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CARD_W      = SCREEN_W * 0.62;
const CARD_H      = SCREEN_H * 0.44;
const ROTATE_DEG  = 48;     // degrees each adjacent card rotates away
const TRANSLATE_X = SCREEN_W * 0.38;
const TRANSLATE_Z = -280;
const SWIPE_THRESHOLD = 40;

const RARITY_COLOR: Record<string, string> = {
  common:    '#444',
  uncommon:  '#4a9eff',
  rare:      '#a855f7',
  epic:      '#f59e0b',
  legendary: '#e63946',
};

const RARITY_LABEL: Record<string, string> = {
  common:    'COMMON',
  uncommon:  'UNCOMMON',
  rare:      'RARE',
  epic:      'EPIC',
  legendary: 'LEGENDARY',
};

// ── Vehicle placeholder — geometric car silhouette ─────────────────────────────
function VehiclePlaceholder({ rarity, catchType }: { rarity: string; catchType: string }) {
  const accent = RARITY_COLOR[rarity] ?? '#444';
  const isSpace = catchType === 'space';

  if (isSpace) {
    return (
      <View style={styles.placeholder}>
        <View style={[styles.orb, { borderColor: accent, shadowColor: accent }]}>
          <Text style={styles.orbIcon}>🛰</Text>
        </View>
        <View style={[styles.glow, { backgroundColor: accent }]} />
      </View>
    );
  }

  return (
    <View style={styles.placeholder}>
      {/* Roof */}
      <View style={[styles.carRoof, { borderColor: accent }]} />
      {/* Body */}
      <View style={[styles.carBody, { borderColor: accent }]}>
        {/* Windows strip */}
        <View style={[styles.windowStrip, { backgroundColor: accent + '22' }]} />
      </View>
      {/* Wheels */}
      <View style={styles.wheelsRow}>
        <View style={[styles.wheel, { borderColor: accent }]} />
        <View style={[styles.wheel, { borderColor: accent }]} />
      </View>
      {/* Ground glow */}
      <View style={[styles.glow, { backgroundColor: accent }]} />
    </View>
  );
}

// ── Single card in the carousel ────────────────────────────────────────────────
function CarouselCard({
  item,
  offset,     // position relative to active: -2, -1, 0, 1, 2
  dragX,      // shared Animated.Value for live drag tracking
}: {
  item: CatchRecord;
  offset: number;
  dragX: Animated.Value;
}) {
  const rarity  = item.rarity ?? 'common';
  const accent  = RARITY_COLOR[rarity]  ?? '#444';
  const label   = RARITY_LABEL[rarity]  ?? 'COMMON';
  const isActive = offset === 0;

  // Continuous rotation tracks finger drag between snapped positions
  const rotateY = dragX.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: [
      `${(offset - 0.5) * ROTATE_DEG}deg`,
      `${offset * ROTATE_DEG}deg`,
      `${(offset + 0.5) * ROTATE_DEG}deg`,
    ],
    extrapolate: 'clamp',
  });

  const tx = dragX.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: [
      (offset - 0.5) * TRANSLATE_X,
      offset * TRANSLATE_X,
      (offset + 0.5) * TRANSLATE_X,
    ],
    extrapolate: 'clamp',
  });

  const opacity = Math.abs(offset) > 2 ? 0 : Math.max(0, 1 - Math.abs(offset) * 0.35);
  const scale   = isActive ? 1 : 0.78;

  return (
    <Animated.View
      pointerEvents={isActive ? 'auto' : 'none'}
      style={[
        styles.card,
        {
          width:   CARD_W,
          height:  CARD_H,
          opacity,
          borderColor: accent + '55',
          zIndex: 10 - Math.abs(offset),
          transform: [
            { perspective: 1000 },
            { translateX: tx },
            { rotateY },
            { translateZ: isActive ? 0 : TRANSLATE_Z } as any,
            { scale },
          ],
        },
      ]}
    >
      {/* Rarity accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      {/* Vehicle visual — real photos for scan360, geometric placeholder otherwise */}
      {item.catchType === 'scan360' && item.photoPaths && item.photoPaths.length > 0
        ? <Scan360PhotoViewer photoPaths={item.photoPaths} accent={accent} flex />
        : <VehiclePlaceholder rarity={rarity} catchType={item.catchType} />
      }

      {/* Info panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.infoMake}>{item.make}</Text>
        <Text style={styles.infoModel} numberOfLines={1}>{item.model}</Text>
        <Text style={[styles.infoGen, { color: accent }]} numberOfLines={1}>{item.generation}</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.rarityLabel, { color: accent }]}>{label}</Text>
          {item.firstFinderAwarded && (
            <Text style={[styles.ffBadge, { color: accent }]}>★ FIRST FINDER</Text>
          )}
        </View>
        <Text style={styles.infoColor}>{item.color}</Text>
        {item.xpEarned ? (
          <Text style={[styles.xpBadge, { color: accent }]}>+{item.xpEarned} XP</Text>
        ) : null}
      </View>

      {/* Detail tap — active card only */}
      {isActive && item.generationId && (
        <Pressable
          style={[styles.detailButton, { borderColor: accent + '55' }]}
          onPress={() => router.push(`/vehicle/${item.generationId}`)}
        >
          <Text style={[styles.detailText, { color: accent }]}>VIEW DETAILS →</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ── Main carousel ──────────────────────────────────────────────────────────────
export function GarageCarousel({ catches }: { catches: CatchRecord[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const dragX  = useRef(new Animated.Value(0)).current;

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(catches.length - 1, idx));
    setActiveIndex(clamped);
    dragX.setValue(0);
  }, [catches.length, dragX]);

  // Keep refs current so the pan responder (created once) always sees fresh values
  const activeIndexRef = useRef(activeIndex);
  const goToRef = useRef(goTo);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { goToRef.current = goTo; }, [goTo]);

  const panResponder = useRef(
    PanResponder.create({
      // Don't claim touch at start — lets child Pressables receive taps
      onStartShouldSetPanResponder: () => false,
      // Only claim after meaningful horizontal movement
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => {
        dragX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) {
          goToRef.current(activeIndexRef.current + 1);
        } else if (g.dx > SWIPE_THRESHOLD) {
          goToRef.current(activeIndexRef.current - 1);
        } else {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: false, tension: 120, friction: 8 }).start();
        }
      },
    }),
  ).current;

  const item = catches[activeIndex];

  return (
    <View style={styles.container}>
      {/* Garage floor grid */}
      <View style={styles.floor} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.floorLine} />
        ))}
      </View>

      {/* Card stack */}
      <View style={styles.stage} {...panResponder.panHandlers}>
        {catches.map((c, i) => {
          const offset = i - activeIndex;
          if (Math.abs(offset) > 2) return null;
          return (
            <CarouselCard
              key={c.id}
              item={c}
              offset={offset}
              dragX={dragX}
            />
          );
        })}
      </View>

      {/* Dot pagination */}
      <View style={styles.dots}>
        {catches.map((_, i) => (
          <Pressable key={i} onPress={() => goTo(i)}>
            <View style={[
              styles.dot,
              i === activeIndex && styles.dotActive,
            ]} />
          </Pressable>
        ))}
      </View>

      {/* Counter */}
      <Text style={styles.counter}>{activeIndex + 1} / {catches.length}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060608',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Perspective grid floor
  floor: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    height: 160,
    overflow: 'hidden',
    transform: [{ perspective: 400 }, { rotateX: '65deg' }],
    gap: 22,
    paddingHorizontal: 0,
  },
  floorLine: {
    height: 1,
    backgroundColor: '#1a1a2a',
    marginHorizontal: 0,
  },

  stage: {
    width: SCREEN_W,
    height: CARD_H + 60,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cards
  card: {
    position: 'absolute',
    backgroundColor: '#0e0e14',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // Placeholder geometry
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    gap: 4,
  },
  carRoof: {
    width: '44%',
    height: '22%',
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#111',
  },
  carBody: {
    width: '72%',
    height: '30%',
    borderRadius: 6,
    borderWidth: 1.5,
    backgroundColor: '#111',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  windowStrip: {
    height: '50%',
    borderRadius: 3,
  },
  wheelsRow: {
    flexDirection: 'row',
    width: '68%',
    justifyContent: 'space-between',
  },
  wheel: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: '#0e0e14',
  },
  glow: {
    position: 'absolute',
    bottom: 0,
    width: '80%',
    height: 20,
    borderRadius: 40,
    opacity: 0.18,
    transform: [{ scaleX: 1.4 }],
  },
  orb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    backgroundColor: '#0e0e14',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  orbIcon: { fontSize: 36 },

  // Info panel
  infoPanel: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 2,
  },
  infoMake:   { color: '#555', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  infoModel:  { color: '#fff', fontSize: 22, fontWeight: '900' },
  infoGen:    { fontSize: 12, fontWeight: '700' },
  infoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rarityLabel:{ fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  ffBadge:    { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  infoColor:  { color: '#444', fontSize: 11, marginTop: 2 },
  xpBadge:    { fontSize: 12, fontWeight: '800', marginTop: 2 },

  detailButton: {
    marginHorizontal: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  detailText: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  // Pagination
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 40,
    maxHeight: 40,
  },
  dot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2a2a2a' },
  dotActive: { backgroundColor: '#e63946', width: 16 },

  counter: {
    color: '#333',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 8,
    fontWeight: '700',
  },
});
