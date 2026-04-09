import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { router } from 'expo-router';

// 4 anchor positions required for a full 360° scan
const ANCHORS = ['FRONT', 'PASSENGER', 'REAR', 'DRIVER'] as const;
type Anchor = typeof ANCHORS[number];

export default function Scan360Screen() {
  const device = useCameraDevice('back');
  const [captured, setCaptured] = useState<Set<Anchor>>(new Set());
  const [currentAnchor, setCurrentAnchor] = useState<Anchor>('FRONT');

  const captureAnchor = () => {
    // TODO Phase 5: run EfficientNet on captured frame, accumulate into multi-view ensemble
    setCaptured(prev => {
      const next = new Set(prev);
      next.add(currentAnchor);
      const nextIndex = ANCHORS.indexOf(currentAnchor) + 1;
      if (nextIndex < ANCHORS.length) setCurrentAnchor(ANCHORS[nextIndex]);
      return next;
    });
  };

  const isComplete = captured.size === ANCHORS.length;

  if (!device) return null;

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive />

      {/* Progress ring */}
      <View style={styles.progressRow}>
        {ANCHORS.map(a => (
          <View key={a} style={[styles.pip, captured.has(a) && styles.pipDone, a === currentAnchor && styles.pipActive]}>
            <Text style={styles.pipLabel}>{a[0]}</Text>
          </View>
        ))}
      </View>

      {/* Instruction */}
      <View style={styles.instruction}>
        <Text style={styles.instructionText}>
          {isComplete ? 'SCAN COMPLETE — CLASSIFYING…' : `POINT AT ${currentAnchor} OF VEHICLE`}
        </Text>
      </View>

      {/* Capture / finish */}
      {!isComplete ? (
        <Pressable style={styles.captureButton} onPress={captureAnchor}>
          <View style={styles.captureInner} />
        </Pressable>
      ) : (
        <Pressable style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneText}>DONE</Text>
        </Pressable>
      )}

      <Pressable style={styles.exitButton} onPress={() => router.back()}>
        <Text style={styles.exitText}>CANCEL</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#000' },
  progressRow:     { position: 'absolute', top: 80, alignSelf: 'center', flexDirection: 'row', gap: 12 },
  pip:             { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  pipDone:         { backgroundColor: '#e63946', borderColor: '#e63946' },
  pipActive:       { borderColor: '#fff' },
  pipLabel:        { color: '#fff', fontWeight: '700', fontSize: 12 },
  instruction:     { position: 'absolute', bottom: 200, left: 24, right: 24, alignItems: 'center' },
  instructionText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 2 },
  captureButton:   { position: 'absolute', bottom: 80, alignSelf: 'center', width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  captureInner:    { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  doneButton:      { position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: '#e63946', borderRadius: 8, paddingVertical: 18, paddingHorizontal: 48 },
  doneText:        { color: '#fff', fontWeight: '900', letterSpacing: 3 },
  exitButton:      { position: 'absolute', top: 60, left: 24 },
  exitText:        { color: '#ffffff66', fontSize: 13, letterSpacing: 2 },
});
