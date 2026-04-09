import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useLocation } from '@/hooks/useLocation';
import { useCatchStore } from '@/stores/catchStore';
import {
  VehicleClassifier,
  VehicleClassifierStub,
} from '@/modules/vehicle-classifier';

// Swap to stub for dev builds without native modules:
// const Classifier = VehicleClassifierStub;
const Classifier = VehicleClassifier;

const SPEED_THRESHOLD_MPH  = 15;
const TRIGGER_FPS           = 2;    // Stage 1: MobileNet SSD poll rate
const FRAME_INTERVAL_MS     = 1000 / TRIGGER_FPS;
const CONFIDENCE_AUTO_CATCH = 0.72;
const CONFIDENCE_PROBABLE   = 0.50;

export default function HighwayMode() {
  const device = useCameraDevice('back');
  const { speedMph } = useLocation();
  const { addCatch } = useCatchStore();

  const isMoving       = speedMph > SPEED_THRESHOLD_MPH;
  const lastFrameTime  = useSharedValue(0);
  const pipelineActive = useSharedValue(false);

  const [catchBanner, setCatchBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AA-inspired adaptive throttle: only run full classify when Stage 1 fires
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const now = Date.now();
    if (now - lastFrameTime.value < FRAME_INTERVAL_MS) return;
    if (pipelineActive.value) return;           // already classifying
    lastFrameTime.value = now;

    // Stage 1 — lightweight trigger (MobileNet SSD at 2fps)
    const triggered = Classifier.triggerDetect(frame);
    if (!triggered) return;

    // Stage 2 — full classify only on trigger (adaptive throttle from AA)
    pipelineActive.value = true;
    const result = Classifier.classify(frame);
    pipelineActive.value = false;

    if (result && result.confidence >= CONFIDENCE_AUTO_CATCH) {
      runOnJS(handleCatch)(result);
    } else if (result && result.confidence >= CONFIDENCE_PROBABLE) {
      runOnJS(handleProbable)(result);
    }
  }, []);

  const handleCatch = useCallback((result: ClassifyResult) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addCatch({ ...result, catchType: 'highway' });
    showBanner(`CAUGHT: ${result.make} ${result.model} · ${Math.round(result.confidence * 100)}%`);
  }, [addCatch]);

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
    <View style={styles.container}>
      {/* Camera — always rendering, frame processor runs at 2fps trigger rate */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        fps={30}
      />

      {/* Safety banner — always visible in highway mode */}
      <View style={styles.safetyBanner}>
        <Text style={styles.safetyText}>KEEP EYES ON ROAD</Text>
      </View>

      {/* HUD dims above 15 mph — minimal radar indicator only */}
      {isMoving ? (
        <View style={styles.minimalHud}>
          <View style={styles.radarDot} />
        </View>
      ) : (
        <View style={styles.fullHud}>
          <Text style={styles.speedLabel}>PARKED · TAP TO SCAN</Text>
        </View>
      )}

      {/* Catch notification — audio-only above 15mph, banner always */}
      {catchBanner && (
        <View style={styles.catchBanner}>
          <Text style={styles.catchText}>{catchBanner}</Text>
        </View>
      )}

      {/* Exit — only when stationary */}
      {!isMoving && (
        <View style={styles.exitButton}>
          <Text style={styles.exitText} onPress={() => router.back()}>EXIT</Text>
        </View>
      )}
    </View>
  );
}

type ClassifyResult = {
  make: string; model: string; generation: string;
  bodyStyle: string; color: string; confidence: number;
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  error:        { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText:    { color: '#e63946' },
  safetyBanner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#e6394688', padding: 8, alignItems: 'center' },
  safetyText:   { color: '#fff', fontWeight: '900', letterSpacing: 3, fontSize: 12 },
  minimalHud:   { position: 'absolute', bottom: 40, alignSelf: 'center' },
  radarDot:     { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e63946' },
  fullHud:      { position: 'absolute', bottom: 60, alignSelf: 'center' },
  speedLabel:   { color: '#ffffff88', fontSize: 13, letterSpacing: 2 },
  catchBanner:  { position: 'absolute', bottom: 140, left: 24, right: 24, backgroundColor: '#0a0a0aee', borderRadius: 10, padding: 16 },
  catchText:    { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  exitButton:   { position: 'absolute', top: 60, right: 24 },
  exitText:     { color: '#ffffff66', fontSize: 13, letterSpacing: 2 },
});
