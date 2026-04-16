import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCatchStore } from '@/stores/catchStore';
import { VehicleClassifier, VehicleClassifierStub, type ClassifyResult } from '@/modules/vehicle-classifier';
import { useLocation } from '@/hooks/useLocation';
import { usePlayerStore } from '@/stores/playerStore';
import { savePhotos } from '@/utils/savePhotos';

const Classifier = VehicleClassifier ?? VehicleClassifierStub;

/** Below this confidence the FRONT gate rejects the frame.
 *  Raised from 0.45 — closed-set softmax always forces a winner, so low
 *  thresholds let non-vehicle textures through at "high confidence". */
const MIN_CONFIDENCE = 0.65;

/** How long to show the "position vehicle" ready overlay before enabling capture. */
const READY_DELAY_MS = 2000;

const ANCHORS = ['FRONT', 'PASSENGER', 'REAR', 'DRIVER'] as const;
type Anchor = typeof ANCHORS[number];

function boostRemainingMin(expires: string | null): number {
  if (!expires) return 0;
  return Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 60000));
}

// ─── Lock-on brackets ─────────────────────────────────────────────────────────

function LockOnBrackets({ locked }: { locked: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: locked ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [locked]);

  const color = anim.interpolate({ inputRange: [0, 1], outputRange: ['#ffffff33', '#4ade80'] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.bracket, styles.bracketTL, { borderColor: color }]} />
      <Animated.View style={[styles.bracket, styles.bracketTR, { borderColor: color }]} />
      <Animated.View style={[styles.bracket, styles.bracketBL, { borderColor: color }]} />
      <Animated.View style={[styles.bracket, styles.bracketBR, { borderColor: color }]} />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Scan360Screen() {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);

  const { addCatch } = useCatchStore();
  const { fuzzyCity, fuzzyDistrict } = useLocation();
  const orbitalBoostExpires = usePlayerStore(s => s.orbitalBoostExpires);
  const boostMins = boostRemainingMin(orbitalBoostExpires);

  const [isReady, setIsReady]             = useState(false);
  const [captured, setCaptured]           = useState<Set<Anchor>>(new Set());
  const [currentAnchor, setCurrentAnchor] = useState<Anchor>('FRONT');
  const [result, setResult]               = useState<ClassifyResult | null>(null);
  const [classifying, setClassifying]     = useState(false);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [locked, setLocked]               = useState(false);

  // FRONT classification stored here; promoted to `result` only after all 4 anchors
  const pendingResult = useRef<ClassifyResult | null>(null);
  // All 4 temp photo paths keyed by anchor index
  const tempPhotos = useRef<(string | null)[]>([null, null, null, null]);

  // Ready gate — unlock capture after READY_DELAY_MS
  useEffect(() => {
    const t = setTimeout(() => setIsReady(true), READY_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const captureAnchor = useCallback(async () => {
    if (!isReady || classifying) return;

    const anchorIndex = ANCHORS.indexOf(currentAnchor);
    const photo = await cameraRef.current?.takePhoto();
    if (photo) tempPhotos.current[anchorIndex] = photo.path;

    // ── FRONT: classify as gate before advancing ──────────────────────────
    if (anchorIndex === 0) {
      const classifyPath = photo?.path ?? null;
      if (!classifyPath) return;

      setClassifying(true);
      setLowConfidence(false);

      try {
        const classification = await Promise.race([
          Classifier.classify(classifyPath),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('classify timeout')), 15_000)
          ),
        ]);

        if (!classification || classification.confidence < MIN_CONFIDENCE) {
          // Reject — stay on FRONT, clear the bad photo
          setLowConfidence(true);
          tempPhotos.current[0] = null;
          return;
        }

        // FRONT passed — lock on and advance
        pendingResult.current = classification as ClassifyResult;
        setLocked(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        setCaptured(new Set(['FRONT']));
        setCurrentAnchor('PASSENGER');
      } catch {
        setLowConfidence(true);
        tempPhotos.current[0] = null;
      } finally {
        setClassifying(false);
      }
      return;
    }

    // ── PASSENGER / REAR / DRIVER: just record and advance ───────────────
    const nextCaptured = new Set(captured);
    nextCaptured.add(currentAnchor);
    setCaptured(nextCaptured);

    const nextIndex = anchorIndex + 1;
    if (nextIndex < ANCHORS.length) {
      setCurrentAnchor(ANCHORS[nextIndex]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // All 4 done — promote FRONT result to result sheet
      setResult(pendingResult.current);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [isReady, classifying, captured, currentAnchor]);

  const handleConfirm = useCallback(async () => {
    if (!result) return;

    const catchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const photoPaths = await savePhotos(tempPhotos.current, catchId);

    addCatch({
      ...result,
      catchId,
      catchType:     'scan360',
      fuzzyCity:     fuzzyCity     ?? undefined,
      fuzzyDistrict: fuzzyDistrict ?? undefined,
      photoPaths:    photoPaths.filter(Boolean),
      photoPath:     tempPhotos.current[0] ?? undefined,
    });

    router.back();
  }, [result, addCatch, fuzzyCity, fuzzyDistrict]);

  const handleRescan = useCallback(() => {
    setCaptured(new Set());
    setCurrentAnchor('FRONT');
    setResult(null);
    setLowConfidence(false);
    setLocked(false);
    pendingResult.current = null;
    tempPhotos.current = [null, null, null, null];
  }, []);

  if (!device) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>No camera available</Text>
      </View>
    );
  }

  const allCaptured = captured.size === ANCHORS.length;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo={true}
      />

      <LockOnBrackets locked={locked} />

      {boostMins > 0 && (
        <View style={styles.boostPill}>
          <Text style={styles.boostPillText}>⚡ BOOST ACTIVE · {boostMins}m</Text>
        </View>
      )}

      {/* Anchor progress pips */}
      <View style={styles.progressRow}>
        {ANCHORS.map(a => (
          <View
            key={a}
            style={[
              styles.pip,
              captured.has(a) && styles.pipDone,
              a === currentAnchor && !result && styles.pipActive,
            ]}
          >
            <Text style={styles.pipLabel}>{a[0]}</Text>
          </View>
        ))}
      </View>

      {/* Lock-on confirmed pill (visible after FRONT passes, until all 4 done) */}
      {locked && !allCaptured && !result && (
        <View style={styles.lockedPill}>
          <Text style={styles.lockedPillText}>🎯  LOCKED ON</Text>
        </View>
      )}

      {!result && (
        <View style={styles.instruction}>
          {classifying && <ActivityIndicator color="#e63946" style={{ marginBottom: 8 }} />}
          <Text style={styles.instructionText}>
            {classifying
              ? 'SCANNING FOR VEHICLE…'
              : lowConfidence
              ? 'NO VEHICLE DETECTED'
              : `CAPTURE ${currentAnchor}`}
          </Text>
          {lowConfidence && !classifying && (
            <Text style={styles.lowConfText}>
              Couldn't confirm a vehicle. Adjust framing and try again.
            </Text>
          )}
        </View>
      )}

      {/* Result sheet */}
      {result && (
        <View style={styles.resultOverlay}>
          <Text style={styles.resultMake}>{result.make}</Text>
          <Text style={styles.resultModel}>{result.model}</Text>
          <Text style={styles.resultGen}>{result.generation}</Text>
          {(result.color || result.bodyStyle) ? (
            <Text style={styles.resultColor}>
              {[result.color, result.bodyStyle].filter(Boolean).join('  ·  ')}
            </Text>
          ) : null}
          <Text style={styles.resultConfidence}>{Math.round(result.confidence * 100)}% confidence</Text>
          <View style={styles.resultActions}>
            <Pressable style={styles.rescanButton} onPress={handleRescan}>
              <Text style={styles.rescanText}>RESCAN</Text>
            </Pressable>
            <Pressable style={styles.catchButton} onPress={handleConfirm}>
              <Text style={styles.catchText}>CATCH IT</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!result && !classifying && isReady && (
        <Pressable style={styles.captureButton} onPress={captureAnchor}>
          <View style={styles.captureInner} />
        </Pressable>
      )}

      {/* Ready overlay — blocks capture for READY_DELAY_MS on mount */}
      {!isReady && (
        <View style={styles.readyOverlay}>
          <Text style={styles.readyText}>POSITION VEHICLE IN FRAME</Text>
        </View>
      )}

      {!result && (
        <Pressable style={styles.exitButton} onPress={() => router.back()}>
          <Text style={styles.exitText}>CANCEL</Text>
        </Pressable>
      )}
    </View>
  );
}

const BRACKET_SIZE  = 52;
const BRACKET_LEG   = 18;
const BRACKET_INSET = 48;

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  error:            { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText:        { color: '#e63946' },

  // Lock-on brackets
  bracket:          { position: 'absolute', width: BRACKET_LEG, height: BRACKET_LEG, borderWidth: 2 },
  bracketTL:        { top: BRACKET_INSET,  left: BRACKET_INSET,  borderRightWidth: 0, borderBottomWidth: 0 },
  bracketTR:        { top: BRACKET_INSET,  right: BRACKET_INSET, borderLeftWidth: 0,  borderBottomWidth: 0 },
  bracketBL:        { bottom: 220,         left: BRACKET_INSET,  borderRightWidth: 0, borderTopWidth: 0 },
  bracketBR:        { bottom: 220,         right: BRACKET_INSET, borderLeftWidth: 0,  borderTopWidth: 0 },

  progressRow:      { position: 'absolute', top: 80, alignSelf: 'center', flexDirection: 'row', gap: 12 },
  pip:              { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  pipDone:          { backgroundColor: '#e63946', borderColor: '#e63946' },
  pipActive:        { borderColor: '#fff' },
  pipLabel:         { color: '#fff', fontWeight: '700', fontSize: 12 },

  lockedPill:       { position: 'absolute', top: 136, alignSelf: 'center', backgroundColor: '#0a180a', borderWidth: 1, borderColor: '#4ade80', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 16 },
  lockedPillText:   { color: '#4ade80', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  instruction:      { position: 'absolute', bottom: 200, left: 24, right: 24, alignItems: 'center', gap: 8 },
  instructionText:  { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 2 },
  lowConfText:      { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },

  captureButton:    { position: 'absolute', bottom: 80, alignSelf: 'center', width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  captureInner:     { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  readyOverlay:     { position: 'absolute', bottom: 140, left: 24, right: 24, alignItems: 'center' },
  readyText:        { color: '#ffffff88', fontSize: 12, fontWeight: '700', letterSpacing: 3, textAlign: 'center' },

  exitButton:       { position: 'absolute', top: 60, left: 24 },
  exitText:         { color: '#ffffff66', fontSize: 13, letterSpacing: 2 },

  boostPill:        { position: 'absolute', top: 60, right: 24, backgroundColor: '#1a120088', borderWidth: 1, borderColor: '#f59e0b88', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  boostPillText:    { color: '#f59e0b', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  resultOverlay:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0a0a0aee', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, gap: 4 },
  resultMake:       { color: '#888', fontSize: 14, letterSpacing: 2 },
  resultModel:      { color: '#fff', fontSize: 32, fontWeight: '900' },
  resultGen:        { color: '#e63946', fontSize: 14, fontWeight: '700', marginTop: 2 },
  resultColor:      { color: '#888', fontSize: 13, marginTop: 4 },
  resultConfidence: { color: '#555', fontSize: 13 },
  resultActions:    { flexDirection: 'row', gap: 12, marginTop: 24 },
  rescanButton:     { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  rescanText:       { color: '#888', fontWeight: '700', letterSpacing: 2 },
  catchButton:      { flex: 2, backgroundColor: '#e63946', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  catchText:        { color: '#fff', fontWeight: '900', letterSpacing: 2, fontSize: 16 },
});
