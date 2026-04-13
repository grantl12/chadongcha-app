import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCatchStore } from '@/stores/catchStore';
import { VehicleClassifier, VehicleClassifierStub, type ClassifyResult } from '@/modules/vehicle-classifier';
import { useLocation } from '@/hooks/useLocation';
import { usePlayerStore } from '@/stores/playerStore';

const Classifier = VehicleClassifier ?? VehicleClassifierStub;

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

  const [captured, setCaptured]         = useState<Set<Anchor>>(new Set());
  const [currentAnchor, setCurrentAnchor] = useState<Anchor>('FRONT');
  const [result, setResult]             = useState<ClassifyResult | null>(null);
  const [classifying, setClassifying]   = useState(false);

  const captureAnchor = useCallback(async () => {
    const nextCaptured = new Set(captured);
    nextCaptured.add(currentAnchor);
    setCaptured(nextCaptured);

    const nextIndex = ANCHORS.indexOf(currentAnchor) + 1;

    if (nextIndex < ANCHORS.length) {
      setCurrentAnchor(ANCHORS[nextIndex]);
    } else {
      // All four anchors captured — classify using a photo
      setClassifying(true);
      try {
        const photo = await cameraRef.current?.takePhoto();
        const CLASSIFY_TIMEOUT_MS = 15_000;
        const classification = photo
          ? await Promise.race([
              Classifier.classify(photo.path),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('classify timeout')), CLASSIFY_TIMEOUT_MS)
              ),
            ])
          : null;
        setResult(classification as ClassifyResult | null);
        if (classification) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setResult(null);
      } finally {
        setClassifying(false);
      }
    }
  }, [captured, currentAnchor]);

  const handleConfirm = useCallback(() => {
    if (!result) return;
    addCatch({
      ...result,
      catchType: 'scan360',
      fuzzyCity:     fuzzyCity     ?? undefined,
      fuzzyDistrict: fuzzyDistrict ?? undefined,
    });
    router.back();
  }, [result, addCatch, fuzzyCity, fuzzyDistrict]);

  const handleRescan = useCallback(() => {
    setCaptured(new Set());
    setCurrentAnchor('FRONT');
    setResult(null);
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

      {/* Anchor progress dots */}
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
          {classifying ? (
            <ActivityIndicator color="#e63946" style={{ marginBottom: 8 }} />
          ) : null}
          <Text style={styles.instructionText}>
            {classifying ? 'CLASSIFYING…' : `CAPTURE ${currentAnchor} SIDE`}
          </Text>
        </View>
      )}

      {/* Result sheet */}
      {result && (
        <View style={styles.resultOverlay}>
          <Text style={styles.resultMake}>{result.make}</Text>
          <Text style={styles.resultModel}>{result.model}</Text>
          <Text style={styles.resultGen}>{result.generation}</Text>
          <Text style={styles.resultColor}>{result.color}  ·  {result.bodyStyle}</Text>
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
