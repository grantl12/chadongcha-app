import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCatchStore } from '@/stores/catchStore';
import { usePlayerStore } from '@/stores/playerStore';
import { posthog } from '@/lib/posthog';
import { useTheme } from '@/lib/theme';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOCK_MS = 3000;

const RARITY_COLOR: Record<string, string> = {
  common:    '#555',
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

const BOOST_INFO: Record<string, { multiplier: number; durationMin: number }> = {
  legendary: { multiplier: 2.00, durationMin: 60 },
  epic:      { multiplier: 1.75, durationMin: 45 },
  rare:      { multiplier: 1.50, durationMin: 30 },
  uncommon:  { multiplier: 1.25, durationMin: 20 },
  common:    { multiplier: 1.25, durationMin: 20 },
};

const RING_SIZE = 210;

// ─── Star field ───────────────────────────────────────────────────────────────

type StarDef = { key: number; top: number; left: number; size: number; opacity: number };

function Stars({ stars }: { stars: StarDef[] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map(s => (
        <View
          key={s.key}
          style={{
            position:        'absolute',
            top:             `${s.top}%` as any,
            left:            `${s.left}%` as any,
            width:           s.size,
            height:          s.size,
            borderRadius:    s.size / 2,
            backgroundColor: '#fff',
            opacity:         s.opacity,
          }}
        />
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SatelliteCatchScreen() {
  const T = useTheme();
  const params = useLocalSearchParams<{
    catchableId: string;
    objectName:  string;
    objectType:  string;
    rarityTier:  string;
  }>();

  const rarity      = (params.rarityTier  ?? 'common') as string;
  const color       = RARITY_COLOR[rarity]  ?? '#555';
  const rarityLabel = RARITY_LABEL[rarity]  ?? 'COMMON';
  const boostInfo   = BOOST_INFO[rarity]    ?? BOOST_INFO.common;
  const objectName  = params.objectName     ?? 'UNKNOWN OBJECT';
  const objectType  = (params.objectType    ?? 'satellite').toUpperCase();

  const addCatch           = useCatchStore(s => s.addCatch);
  const setPendingBoost    = usePlayerStore(s => s.setPendingBoostDecision);

  const [phase, setPhase]         = useState<'ready' | 'locking' | 'caught'>('ready');
  const [countdown, setCountdown] = useState(3);

  // Keep stars stable across renders
  const stars = useRef<StarDef[]>(
    Array.from({ length: 55 }, (_, i) => ({
      key:     i,
      top:     Math.random() * 100,
      left:    Math.random() * 100,
      size:    Math.random() * 2.2 + 0.8,
      opacity: Math.random() * 0.5 + 0.1,
    }))
  ).current;

  const progress    = useRef(new Animated.Value(0)).current;
  const lockRef     = useRef<Animated.CompositeAnimation | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef    = useRef(0);

  // Ring border color: red → yellow → green
  const ringColor = progress.interpolate({
    inputRange:  [0, 0.45, 1],
    outputRange: ['#e63946', '#f59e0b', '#4ade80'],
  });

  // Progress bar fill
  const barWidth = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Outer glow opacity
  const glowOpacity = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.04, 0.25],
  });

  function startLock() {
    if (phase !== 'ready') return;
    setPhase('locking');
    startRef.current = Date.now();

    posthog.capture('satellite_lock_started', {
      object_name: objectName,
      rarity:      rarity,
    });

    lockRef.current = Animated.timing(progress, {
      toValue:         1,
      duration:        LOCK_MS,
      useNativeDriver: false,
    });
    lockRef.current.start(({ finished }) => {
      if (finished) doCapture();
    });

    intervalRef.current = setInterval(() => {
      const elapsed  = Date.now() - startRef.current;
      const secs     = Math.max(0, Math.ceil((LOCK_MS - elapsed) / 1000));
      setCountdown(secs);
    }, 80);
  }

  function releaseLock() {
    if (phase === 'caught') return;
    lockRef.current?.stop();
    clearInterval(intervalRef.current!);
    progress.setValue(0);
    setPhase('ready');
    setCountdown(3);
  }

  function doCapture() {
    clearInterval(intervalRef.current!);
    setPhase('caught');
    setCountdown(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    posthog.capture('satellite_caught', {
      object_name: objectName,
      rarity:      rarity,
      object_type: params.objectType,
    });

    addCatch({
      make:         'Space Object',
      model:        objectName,
      generation:   objectName,
      bodyStyle:    params.objectType ?? 'satellite',
      color:        'N/A',
      confidence:   1.0,
      catchType:    'space',
      spaceObjectId: params.catchableId,
    });

    // Show boost decision immediately (client-side; backend confirms on sync)
    setPendingBoost({
      rarityTier:  rarity,
      multiplier:  boostInfo.multiplier,
      durationMin: boostInfo.durationMin,
      objectName,
      xpEarned:    0,
    });

    setTimeout(() => router.back(), 1800);
  }

  useEffect(() => () => {
    lockRef.current?.stop();
    clearInterval(intervalRef.current!);
  }, []);

  const isCaught  = phase === 'caught';
  const isLocking = phase === 'locking';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050510" />
      <Stars stars={stars} />

      {/* Cancel */}
      <Pressable style={styles.cancelBtn} onPress={() => router.back()} disabled={isCaught}>
        <Text style={[styles.cancelText, { color: T.text3 }]}>✕</Text>
      </Pressable>

      {/* Object info */}
      <View style={styles.objectInfo}>
        <Text style={styles.objectName} numberOfLines={1}>{objectName}</Text>
        <Text style={[styles.objectMeta, { color }]}>
          {rarityLabel} · {objectType}
        </Text>
        <Text style={styles.boostPreview}>
          Earns {boostInfo.multiplier}× orbital boost · {boostInfo.durationMin}m
        </Text>
      </View>

      {/* Lock-on target (press-and-hold area) */}
      <View style={styles.targetArea}>
        {/* Glow halo */}
        <Animated.View style={[styles.glowHalo, { backgroundColor: color, opacity: glowOpacity }]} />

        {/* Outer decorative ring */}
        <View style={[styles.outerDecor, { borderColor: color + '18' }]} />

        <Pressable
          onPressIn={startLock}
          onPressOut={releaseLock}
          disabled={isCaught}
          style={styles.pressTarget}
        >
          {/* Main ring — color animates */}
          <Animated.View
            style={[
              styles.mainRing,
              { borderColor: isCaught ? '#4ade80' : ringColor },
            ]}
          >
            {/* Crosshair lines */}
            <View style={[styles.crossH, { backgroundColor: isCaught ? '#4ade8055' : '#ffffff18' }]} />
            <View style={[styles.crossV, { backgroundColor: isCaught ? '#4ade8055' : '#ffffff18' }]} />

            {/* Center content */}
            <View style={styles.centerContent} pointerEvents="none">
              {isCaught ? (
                <Text style={styles.caughtText}>CAUGHT</Text>
              ) : isLocking ? (
                <Text style={[styles.countdownNum, { color }]}>{countdown}</Text>
              ) : (
                <>
                  <Text style={[styles.holdIcon, { color: color + '66' }]}>◎</Text>
                  <Text style={styles.holdLabel}>HOLD</Text>
                </>
              )}
            </View>
          </Animated.View>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: barWidth, backgroundColor: isCaught ? '#4ade80' : ringColor },
          ]}
        />
      </View>

      {/* Instruction text */}
      <Text style={styles.instruction}>
        {isCaught   ? 'LOCKED ON · LOGGING' :
         isLocking  ? 'HOLD · KEEP ON TARGET' :
                      'POINT AT SKY · PRESS AND HOLD TO LOCK ON'}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#050510',
    alignItems:      'center',
  },

  cancelBtn:  { position: 'absolute', top: 58, left: 20, zIndex: 10, padding: 12 },
  cancelText: { color: '#555', fontSize: 18, fontWeight: '700' },

  objectInfo: {
    marginTop:  90,
    alignItems: 'center',
    gap:        5,
    paddingHorizontal: 32,
  },
  objectName:   { color: '#fff',  fontSize: 22, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  objectMeta:   { fontSize: 12,   fontWeight: '700', letterSpacing: 2 },
  boostPreview: { color: '#333',  fontSize: 11, marginTop: 3 },

  targetArea: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
  },

  glowHalo: {
    position:     'absolute',
    width:        RING_SIZE + 80,
    height:       RING_SIZE + 80,
    borderRadius: (RING_SIZE + 80) / 2,
  },

  outerDecor: {
    position:     'absolute',
    width:        RING_SIZE + 50,
    height:       RING_SIZE + 50,
    borderRadius: (RING_SIZE + 50) / 2,
    borderWidth:  1,
  },

  pressTarget: {
    alignItems:     'center',
    justifyContent: 'center',
    padding:        18,
  },

  mainRing: {
    width:          RING_SIZE,
    height:         RING_SIZE,
    borderRadius:   RING_SIZE / 2,
    borderWidth:    4,
    alignItems:     'center',
    justifyContent: 'center',
  },

  crossH: { position: 'absolute', width: RING_SIZE - 30, height: 1 },
  crossV: { position: 'absolute', width: 1, height: RING_SIZE - 30 },

  centerContent: { alignItems: 'center', gap: 4 },
  holdIcon:      { fontSize: 36 },
  holdLabel:     { color: '#333', fontSize: 12, fontWeight: '800', letterSpacing: 4 },
  countdownNum:  { fontSize: 68, fontWeight: '900', lineHeight: 76, fontVariant: ['tabular-nums'] },
  caughtText:    { color: '#4ade80', fontSize: 20, fontWeight: '900', letterSpacing: 3 },

  progressTrack: {
    width:        '55%',
    height:       3,
    backgroundColor: '#0d0d20',
    borderRadius: 2,
    overflow:     'hidden',
    marginBottom: 18,
  },
  progressFill: { height: '100%', borderRadius: 2 },

  instruction: {
    color:         '#2a2a4a',
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 2,
    marginBottom:  60,
  },
});
