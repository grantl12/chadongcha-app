import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HexBadge } from './HexBadge';
import type { Badge } from '@/utils/badges';

interface BadgeAwardModalProps {
  badge: Badge | null;
  onClose: () => void;
}

const NUM_PARTICLES = 20;
const NUM_RAYS = 16;

export function BadgeAwardModal({ badge, onClose }: BadgeAwardModalProps) {
  const [phase, setPhase] = useState(0);

  // Core anims
  const badgeScale   = useRef(new Animated.Value(0.2)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const raysOpacity  = useRef(new Animated.Value(0)).current;
  const textOpacity  = useRef(new Animated.Value(0)).current;
  const textTransY   = useRef(new Animated.Value(16)).current;
  const dismissOpacity = useRef(new Animated.Value(0)).current;

  // Per-particle anims (stable refs)
  const particleData = useRef(
    [...Array(NUM_PARTICLES)].map((_, i) => ({
      x: 40 + Math.random() * 20 - 10,
      y: 40 + Math.random() * 20 - 10,
      color: ['#f59e0b', '#ffffff', '#f0ead8', '#e63946'][Math.floor(Math.random() * 4)],
      size: 4 + Math.random() * 6,
      delay: Math.random() * 400,
      angle: (i / NUM_PARTICLES) * 360 + Math.random() * 18,
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!badge) {
      setPhase(0);
      badgeScale.setValue(0.2);
      badgeOpacity.setValue(0);
      raysOpacity.setValue(0);
      textOpacity.setValue(0);
      textTransY.setValue(16);
      dismissOpacity.setValue(0);
      particleData.forEach(p => { p.translateY.setValue(0); p.opacity.setValue(0); });
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase(1);

    // Phase 1: rays + badge spring-in (immediate)
    Animated.parallel([
      // Rays fade in
      Animated.timing(raysOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      // Badge spring-in with overshoot
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Particles (staggered)
    particleData.forEach(p => {
      const anim = Animated.parallel([
        Animated.timing(p.translateY, {
          toValue: -120,
          duration: 1200,
          delay: p.delay,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(p.opacity, { toValue: 1, duration: 100, delay: p.delay, useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: 900, delay: p.delay + 300, useNativeDriver: true }),
        ]),
      ]);
      anim.start();
    });

    // Phase 2: text reveals at 700ms
    const textTimer = setTimeout(() => {
      setPhase(2);
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(textTransY, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(dismissOpacity, { toValue: 1, duration: 500, delay: 400, useNativeDriver: true }),
      ]).start();
    }, 700);

    return () => clearTimeout(textTimer);
  }, [badge?.id]);

  if (!badge) return null;

  return (
    <Modal transparent visible={!!badge} animationType="fade" statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={() => {}} accessible={false}>

          {/* Light rays */}
          <View style={styles.raysContainer} pointerEvents="none">
            {[...Array(NUM_RAYS)].map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.ray,
                  {
                    opacity: raysOpacity,
                    backgroundColor: badge.color,
                    transform: [
                      { translateX: -1 },
                      { rotate: `${i * 22.5}deg` },
                      { translateY: 0 },
                    ],
                    transformOrigin: 'center bottom',
                  } as any,
                ]}
              />
            ))}
          </View>

          {/* Particles */}
          {particleData.map((p, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.particle,
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  opacity: p.opacity,
                  transform: [{ translateY: p.translateY }],
                },
              ]}
            />
          ))}

          {/* Badge */}
          <Animated.View style={{
            transform: [{ scale: badgeScale }],
            opacity: badgeOpacity,
            marginBottom: 28,
            shadowColor: badge.color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 30,
            elevation: 20,
          }}>
            <HexBadge badge={badge} size={150} pulseGlow />
          </Animated.View>

          {/* Text sequence */}
          <Animated.View style={{
            opacity: textOpacity,
            transform: [{ translateY: textTransY }],
            alignItems: 'center',
          }}>
            <Text style={[styles.unlockLabel, { color: badge.color }]}>BADGE UNLOCKED</Text>
            <Text style={styles.badgeName}>{badge.name}</Text>
            <Text style={styles.badgeDesc}>{badge.description}</Text>
            <View style={[styles.catChip, { borderColor: badge.color + '55', backgroundColor: badge.color + '22' }]}>
              <Text style={[styles.catChipText, { color: badge.color }]}>{badge.category.toUpperCase()}</Text>
            </View>
          </Animated.View>

          {/* Dismiss hint */}
          <Animated.Text style={[styles.dismissHint, { opacity: dismissOpacity }]}>
            TAP ANYWHERE TO DISMISS
          </Animated.Text>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'relative',
    alignItems: 'center',
    padding: 48,
    width: '90%',
    maxWidth: 380,
    overflow: 'visible',
  },
  raysContainer: {
    position: 'absolute',
    width: 320,
    height: 320,
    alignItems: 'center',
    justifyContent: 'flex-end',
    top: '50%',
    left: '50%',
    marginLeft: -160,
    marginTop: -160,
  },
  ray: {
    position: 'absolute',
    bottom: '50%',
    left: '50%',
    width: 2,
    height: 160,
    opacity: 0.4,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
  },
  unlockLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 6,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  badgeName: {
    color: '#f0ead8',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginBottom: 8,
    textAlign: 'center',
  },
  badgeDesc: {
    color: 'rgba(240,234,216,0.6)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 28,
    textAlign: 'center',
  },
  catChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  catChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  dismissHint: {
    marginTop: 32,
    color: 'rgba(240,234,216,0.3)',
    fontSize: 11,
    letterSpacing: 2,
  },
});
