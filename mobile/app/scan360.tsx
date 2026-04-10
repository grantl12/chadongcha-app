import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, NativeModules } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCatchStore } from '@/stores/catchStore';
import { VehicleClassifier, VehicleClassifierStub, ClassifyResult } from '@/modules/vehicle-classifier';
import { useLocation } from '@/hooks/useLocation';

// Auto-detect native module — falls back to stub until Phase 5 implementation
const Classifier = NativeModules.VehicleClassifierModule
  ? VehicleClassifier
  : VehicleClassifierStub;

const ANCHORS = ['FRONT', 'PASSENGER', 'REAR', 'DRIVER'] as const;
type Anchor = typeof ANCHORS[number];

export default function Scan360Screen() {
  const device = useCameraDevice('back');
  const { addCatch } = useCatchStore();
  const { fuzzyCity } = useLocation();

  const [captured, setCaptured]     = useState<Set<Anchor>>(new Set());
  const [currentAnchor, setCurrentAnchor] = useState<Anchor>('FRONT');
  const [result, setResult]         = useState<ClassifyResult | null>(null);
  const [classifying, setClassifying] = useState(false);

  const captureAnchor = useCallback(() => {
    const nextCaptured = new Set(captured);
    nextCaptured.add(currentAnchor);

    const nextIndex = ANCHORS.indexOf(currentAnchor) + 1;
    if (nextIndex < ANCHORS.length) {
      setCurrentAnchor(ANCHORS[nextIndex]);
      setCaptured(nextCaptured);
    } else {
      // All anchors captured — run classifier
      setCaptured(nextCaptured);
      setClassifying(true);
      // Stub ignores frame param; Phase 5 will pass real frame buffers here
      const classification = Classifier.classify(null as unknown);
      setClassifying(false);
      setResult(classification);
      if (classification) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [captured, currentAnchor]);

  const handleConfirm = useCallback(() => {
    if (!result) return;
    addCatch({ ...result, catchType: 'scan360', fuzzyCity: fuzzyCity ?? undefined });
    router.back();
  }, [result, addCatch]);

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
      <Camera style={StyleSheet.absoluteFill} device={device} isActive />

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

      {/* Instruction */}
      {!result && (
        <View style={styles.instruction}>
          <Text style={styles.instructionText}>
            {classifying
              ? 'CLASSIFYING…'
              : `POINT AT ${currentAnchor} OF VEHICLE`}
          </Text>
        </View>
      )}

      {/* Result overlay */}
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

      {/* Capture button — only while scanning */}
      {!result && !classifying && (
        <Pressable style={styles.captureButton} onPress={captureAnchor}>
          <View style={styles.captureInner} />
        </Pressable>
      )}

      {/* Cancel */}
      {!result && (
        <Pressable style={styles.exitButton} onPress={() => router.back()}>
          <Text style={styles.exitText}>CANCEL</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#000' },
  error:             { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText:         { color: '#e63946' },
  progressRow:       { position: 'absolute', top: 80, alignSelf: 'center', flexDirection: 'row', gap: 12 },
  pip:               { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  pipDone:           { backgroundColor: '#e63946', borderColor: '#e63946' },
  pipActive:         { borderColor: '#fff' },
  pipLabel:          { color: '#fff', fontWeight: '700', fontSize: 12 },
  instruction:       { position: 'absolute', bottom: 200, left: 24, right: 24, alignItems: 'center' },
  instructionText:   { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 2 },
  captureButton:     { position: 'absolute', bottom: 80, alignSelf: 'center', width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  captureInner:      { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  exitButton:        { position: 'absolute', top: 60, left: 24 },
  exitText:          { color: '#ffffff66', fontSize: 13, letterSpacing: 2 },
  resultOverlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0a0a0aee', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, gap: 4 },
  resultMake:        { color: '#888', fontSize: 14, letterSpacing: 2 },
  resultModel:       { color: '#fff', fontSize: 32, fontWeight: '900' },
  resultGen:         { color: '#e63946', fontSize: 14, fontWeight: '700', marginTop: 2 },
  resultColor:       { color: '#888', fontSize: 13, marginTop: 4 },
  resultConfidence:  { color: '#555', fontSize: 13 },
  resultActions:     { flexDirection: 'row', gap: 12, marginTop: 24 },
  rescanButton:      { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  rescanText:        { color: '#888', fontWeight: '700', letterSpacing: 2 },
  catchButton:       { flex: 2, backgroundColor: '#e63946', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  catchText:         { color: '#fff', fontWeight: '900', letterSpacing: 2, fontSize: 16 },
});
