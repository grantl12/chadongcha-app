import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useLocation } from '@/hooks/useLocation';
import { useCatchStore } from '@/stores/catchStore';
import { usePlayerStore } from '@/stores/playerStore';
import { posthog } from '@/lib/posthog';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  VehicleClassifier,
  VehicleClassifierStub,
  type ClassifyResult,
} from '@/modules/vehicle-classifier';

type DetectionState = 'idle' | 'scanning' | 'probable' | 'caught';

// Use native CoreML module if available, else fall back to stub.
const Classifier = VehicleClassifier ?? VehicleClassifierStub;

const SPEED_THRESHOLD_MPH         = 15;
const POLL_INTERVAL_MS            = 500;
const CONFIDENCE_AUTO_CATCH       = 0.80;
const CONFIDENCE_PROBABLE         = 0.65;
// Scan boost lowers thresholds by this much
const SCAN_BOOST_REDUCTION        = 0.05;

function boostRemainingMin(expires: string | null): number {
  if (!expires) return 0;
  return Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 60000));
}

function SafetyInterstitial({ onConfirm }: { onConfirm: () => void }) {
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.interstitialOverlay}>
        <View style={styles.interstitialCard}>
          <Text style={styles.interstitialIcon}>⚠️</Text>
          <Text style={styles.interstitialTitle}>Passenger Use Only</Text>
          <Text style={styles.interstitialBody}>
            To ensure safety, ChaDongCha must be used by passengers only. Please ensure your device is securely mounted and do not interact with the screen while operating a vehicle.
          </Text>
          <Pressable style={styles.interstitialButton} onPress={onConfirm}>
            <Text style={styles.interstitialButtonText}>I am a Passenger</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Radar dot pulse colours ───────────────────────────────────────────────────
// green = recent catch  |  blue = orbital boost active  |  red = idle
function dotColor(boostActive: boolean, catchFlash: 'catch' | null): string {
  if (catchFlash === 'catch') return '#22c55e';
  if (boostActive)            return '#4a9eff';
  return '#e63946';
}

function RadarDot({ boostActive, catchFlash }: { boostActive: boolean; catchFlash: 'catch' | null }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.6, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const color = dotColor(boostActive, catchFlash);
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotRing, { backgroundColor: color, transform: [{ scale }], opacity }]} />
      <View style={[styles.radarDot, { backgroundColor: color }]} />
    </View>
  );
}

const BRACKET_LEG   = 22;
const BRACKET_INSET = 44;

function SentryOverlay({ state }: { state: DetectionState }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = state === 'caught' ? 1 : state === 'probable' ? 0.6 : 0;
    Animated.timing(anim, { toValue: target, duration: 200, useNativeDriver: false }).start();
  }, [state]);

  const color = anim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: ['#ffffff22', '#f59e0b', '#22c55e'],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.bkt, styles.bktTL, { borderColor: color }]} />
      <Animated.View style={[styles.bkt, styles.bktTR, { borderColor: color }]} />
      <Animated.View style={[styles.bkt, styles.bktBL, { borderColor: color }]} />
      <Animated.View style={[styles.bkt, styles.bktBR, { borderColor: color }]} />
    </View>
  );
}

export default function DashSentry() {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const classifyingRef = useRef(false);

  const { speedMph, fuzzyCity, fuzzyDistrict } = useLocation();
  const { addCatch } = useCatchStore();
  const orbitalBoostExpires = usePlayerStore(s => s.orbitalBoostExpires);
  const scanBoostExpires    = usePlayerStore(s => s.scanBoostExpires);
  const boostActive    = boostRemainingMin(orbitalBoostExpires) > 0;
  const scanBoostActive = !!scanBoostExpires && new Date(scanBoostExpires) > new Date();
  const autoCatchThreshold = CONFIDENCE_AUTO_CATCH - (scanBoostActive ? SCAN_BOOST_REDUCTION : 0);
  const probableThreshold  = CONFIDENCE_PROBABLE   - (scanBoostActive ? SCAN_BOOST_REDUCTION : 0);

  const [catchFlash, setCatchFlash] = useState<'catch' | null>(null);
  const catchFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [catchBanner, setCatchBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const detectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMoving = speedMph > SPEED_THRESHOLD_MPH;

  // ── Classify loop — snapshot every 500ms, run CoreML, handle result ─────────
  useEffect(() => {
    if (!safetyConfirmed) return;

    const timer = setInterval(async () => {
      if (classifyingRef.current || !cameraRef.current) return;
      classifyingRef.current = true;
      setDetectionState('scanning');
      try {
        const snapshot = await cameraRef.current.takeSnapshot({ quality: 85 });
        const result   = await Classifier.classify(snapshot.path);

        if (!result || result.make === '_Background') {
          setDetectionState('idle');
          return;
        }

        if (result.confidence >= autoCatchThreshold) {
          setDetectionState('caught');
          scheduleDetectionReset(3500);
          handleCatch(result);
        } else if (result.confidence >= probableThreshold) {
          setDetectionState('probable');
          scheduleDetectionReset(2000);
          handleProbable(result);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
          setDetectionState('idle');
        }
      } catch {
        setDetectionState('idle');
      } finally {
        classifyingRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [safetyConfirmed]);

  const scheduleDetectionReset = useCallback((delay: number) => {
    if (detectionTimer.current) clearTimeout(detectionTimer.current);
    detectionTimer.current = setTimeout(() => setDetectionState('idle'), delay);
  }, []);

  const handleCatch = useCallback((result: ClassifyResult) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addCatch({
      ...result,
      catchType: 'highway',
      fuzzyCity:     fuzzyCity     ?? undefined,
      fuzzyDistrict: fuzzyDistrict ?? undefined,
    });
    posthog.capture('catch_recorded', {
      catch_type:  'highway',
      make:        result.make,
      model:       result.model,
      confidence:  result.confidence,
      fuzzy_city:  fuzzyCity ?? null,
      scan_boost:  scanBoostActive,
    });
    showBanner(`CAUGHT: ${result.make} ${result.model} · ${Math.round(result.confidence * 100)}%`);
    setCatchFlash('catch');
    if (catchFlashTimer.current) clearTimeout(catchFlashTimer.current);
    catchFlashTimer.current = setTimeout(() => setCatchFlash(null), 3500);
  }, [addCatch, fuzzyCity, fuzzyDistrict]);

  const handleProbable = useCallback((result: ClassifyResult) => {
    showBanner(`PROBABLE: ${result.make} ${result.model} — confirm?`);
  }, []);

  const showBanner = (msg: string) => {
    setCatchBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setCatchBanner(null), 3500);
  };

  if (!device) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>No camera available</Text>
      </View>
    );
  }

  return (
    <>
      {!safetyConfirmed && <SafetyInterstitial onConfirm={() => setSafetyConfirmed(true)} />}

      <View style={styles.container}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          photo={false}
          video={false}
        />

        <SentryOverlay state={detectionState} />

        {/* Safety banner — always visible */}
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyText}>KEEP EYES ON ROAD</Text>
        </View>

        {boostActive && (
          <View style={styles.boostPill}>
            <Text style={styles.boostPillText}>⚡ BOOST ACTIVE · {boostRemainingMin(orbitalBoostExpires)}m</Text>
          </View>
        )}
        {scanBoostActive && (
          <View style={[styles.boostPill, styles.scanBoostPill]}>
            <Text style={styles.scanBoostPillText}>📡 SCAN BOOST</Text>
          </View>
        )}

        {/* HUD dims above 15mph */}
        {isMoving ? (
          <View style={styles.minimalHud}>
            <RadarDot boostActive={boostActive} catchFlash={catchFlash} />
          </View>
        ) : (
          <View style={styles.fullHud}>
            <Text style={styles.speedLabel}>PARKED · SCANNING</Text>
          </View>
        )}

        {catchBanner && (
          <View style={styles.catchBanner}>
            <Text style={styles.catchText}>{catchBanner}</Text>
          </View>
        )}

        {!isMoving && (
          <View style={styles.exitButton}>
            <Text style={styles.exitText} onPress={() => router.back()}>EXIT</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  error:        { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText:    { color: '#e63946' },
  safetyBanner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#e6394688', padding: 8, alignItems: 'center' },
  safetyText:   { color: '#fff', fontWeight: '900', letterSpacing: 3, fontSize: 12 },
  minimalHud:   { position: 'absolute', bottom: 40, alignSelf: 'center' },
  dotWrap:      { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dotRing:      { position: 'absolute', width: 24, height: 24, borderRadius: 12, opacity: 0.4 },
  radarDot:     { width: 10, height: 10, borderRadius: 5 },
  fullHud:      { position: 'absolute', bottom: 60, alignSelf: 'center' },
  speedLabel:   { color: '#ffffff88', fontSize: 13, letterSpacing: 2 },
  catchBanner:  { position: 'absolute', bottom: 140, left: 24, right: 24, backgroundColor: '#0a0a0aee', borderRadius: 10, padding: 16 },
  catchText:    { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  exitButton:   { position: 'absolute', top: 60, right: 24 },
  exitText:     { color: '#ffffff66', fontSize: 13, letterSpacing: 2 },
  boostPill:        { position: 'absolute', top: 60, left: 24, backgroundColor: '#1a120088', borderWidth: 1, borderColor: '#f59e0b88', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  boostPillText:    { color: '#f59e0b', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  scanBoostPill:    { top: 96, backgroundColor: '#001a1a88', borderColor: '#4a9eff88' },
  scanBoostPillText:{ color: '#4a9eff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  bkt:    { position: 'absolute', width: BRACKET_LEG, height: BRACKET_LEG, borderWidth: 2 },
  bktTL:  { top: BRACKET_INSET,  left: BRACKET_INSET,  borderRightWidth: 0, borderBottomWidth: 0 },
  bktTR:  { top: BRACKET_INSET,  right: BRACKET_INSET, borderLeftWidth: 0,  borderBottomWidth: 0 },
  bktBL:  { bottom: BRACKET_INSET, left: BRACKET_INSET,  borderRightWidth: 0, borderTopWidth: 0 },
  bktBR:  { bottom: BRACKET_INSET, right: BRACKET_INSET, borderLeftWidth: 0,  borderTopWidth: 0 },

  interstitialOverlay:    { flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 32 },
  interstitialCard:       { backgroundColor: '#111', borderRadius: 16, padding: 28, alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#222' },
  interstitialIcon:       { fontSize: 36 },
  interstitialTitle:      { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  interstitialBody:       { color: '#aaa', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  interstitialButton:     { marginTop: 8, backgroundColor: '#e63946', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  interstitialButtonText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
});
