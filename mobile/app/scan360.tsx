import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCatchStore } from '@/stores/catchStore';
import { VehicleClassifier, VehicleClassifierStub, type ClassifyResult } from '@/modules/vehicle-classifier';
import { useLocation } from '@/hooks/useLocation';
import { usePlayerStore } from '@/stores/playerStore';
import { savePhotos } from '@/utils/savePhotos';

const Classifier = VehicleClassifier ?? VehicleClassifierStub;

/** Below this confidence the classifier result is discarded as unreliable. */
const MIN_CONFIDENCE = 0.45;

const ANCHORS = ['FRONT', 'PASSENGER', 'REAR', 'DRIVER'] as const;
type Anchor = typeof ANCHORS[number];

function boostRemainingMin(expires: string | null): number {
  if (!expires) return 0;
  return Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 60000));
}

export default function Scan360Screen() {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);

  const { addCatch } = useCatchStore();
  const { fuzzyCity, fuzzyDistrict } = useLocation();
  const orbitalBoostExpires = usePlayerStore(s => s.orbitalBoostExpires);
  const boostMins = boostRemainingMin(orbitalBoostExpires);

  const [captured, setCaptured]           = useState<Set<Anchor>>(new Set());
  const [currentAnchor, setCurrentAnchor] = useState<Anchor>('FRONT');
  const [result, setResult]               = useState<ClassifyResult | null>(null);
  const [classifying, setClassifying]     = useState(false);
  const [lowConfidence, setLowConfidence] = useState(false);

  // All 4 temp photo paths, keyed by anchor index
  const tempPhotos = useRef<(string | null)[]>([null, null, null, null]);

  const captureAnchor = useCallback(async () => {
    const anchorIndex = ANCHORS.indexOf(currentAnchor);

    // Take a photo at every anchor — these are the collector's artifact
    const photo = await cameraRef.current?.takePhoto();
    if (photo) {
      tempPhotos.current[anchorIndex] = photo.path;
    }

    const nextCaptured = new Set(captured);
    nextCaptured.add(currentAnchor);
    setCaptured(nextCaptured);

    const nextIndex = anchorIndex + 1;

    if (nextIndex < ANCHORS.length) {
      setCurrentAnchor(ANCHORS[nextIndex]);
    } else {
      // All four anchors captured — classify using the FRONT photo (best angle for ID)
      const classifyPath = tempPhotos.current[0] ?? photo?.path ?? null;
      if (!classifyPath) {
        setResult(null);
        return;
      }

      setClassifying(true);
      setLowConfidence(false);
      try {
        const CLASSIFY_TIMEOUT_MS = 15_000;
        const classification = await Promise.race([
          Classifier.classify(classifyPath),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('classify timeout')), CLASSIFY_TIMEOUT_MS)
          ),
        ]);

        if (classification && classification.confidence < MIN_CONFIDENCE) {
          setLowConfidence(true);
          setResult(null);
        } else {
          setResult(classification as ClassifyResult | null);
          if (classification) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        setResult(null);
      } finally {
        setClassifying(false);
      }
    }
  }, [captured, currentAnchor]);

  const handleConfirm = useCallback(async () => {
    if (!result) return;

    // Generate the catch ID here so we can use it as the photo folder name
    const catchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Copy temp photos to permanent storage (non-blocking — addCatch is called after)
    const photoPaths = await savePhotos(tempPhotos.current, catchId);

    addCatch({
      ...result,
      catchId,                  // pre-generated so photos are stored in the right dir
      catchType:    'scan360',
      fuzzyCity:     fuzzyCity     ?? undefined,
      fuzzyDistrict: fuzzyDistrict ?? undefined,
      photoPaths:    photoPaths.filter(Boolean),
      // Community upload uses the FRONT photo (index 0) if contributeScans is on
      photoPath:     tempPhotos.current[0] ?? undefined,
    });

    router.back();
  }, [result, addCatch, fuzzyCity, fuzzyDistrict]);

  const handleRescan = useCallback(() => {
    setCaptured(new Set());
    setCurrentAnchor('FRONT');
    setResult(null);
    setLowConfidence(false);
    tempPhotos.current = [null, null, null, null];
  }, []);

  if (!device) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>No camera available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo={true}
      />

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

      {!result && (
        <View style={styles.instruction}>
          {classifying && <ActivityIndicator color="#e63946" style={{ marginBottom: 8 }} />}
          <Text style={styles.instructionText}>
            {classifying
              ? 'CLASSIFYING…'
              : lowConfidence
              ? 'NO VEHICLE DETECTED'
              : `CAPTURE ${currentAnchor} SIDE`}
          </Text>
          {lowConfidence && !classifying && (
            <Text style={styles.lowConfText}>
              Couldn't identify a vehicle. Try again with better framing.
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

      {!result && !classifying && (
        <Pressable style={styles.captureButton} onPress={captureAnchor}>
          <View style={styles.captureInner} />
        </Pressable>
      )}

      {!result && (
        <Pressable style={styles.exitButton} onPress={() => router.back()}>
          <Text style={styles.exitText}>CANCEL</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  error:            { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText:        { color: '#e63946' },
  progressRow:      { position: 'absolute', top: 80, alignSelf: 'center', flexDirection: 'row', gap: 12 },
  pip:              { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  pipDone:          { backgroundColor: '#e63946', borderColor: '#e63946' },
  pipActive:        { borderColor: '#fff' },
  pipLabel:         { color: '#fff', fontWeight: '700', fontSize: 12 },
  instruction:      { position: 'absolute', bottom: 200, left: 24, right: 24, alignItems: 'center', gap: 8 },
  instructionText:  { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 2 },
  lowConfText:      { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },
  captureButton:    { position: 'absolute', bottom: 80, alignSelf: 'center', width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  captureInner:     { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
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
