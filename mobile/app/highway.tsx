import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useLocation } from '@/hooks/useLocation';
import { useCatchStore } from '@/stores/catchStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { PrivacyShield } from '@/components/PrivacyShield';
import {
  VehicleClassifier,
  VehicleClassifierStub,
  type ClassifyResult,
} from '@/modules/vehicle-classifier';

// Use native CoreML module if available, else fall back to stub.
const Classifier = VehicleClassifier ?? VehicleClassifierStub;

const SPEED_THRESHOLD_MPH  = 15;
const POLL_INTERVAL_MS      = 500;    // classify at ~2fps
const CONFIDENCE_AUTO_CATCH = 0.72;
const CONFIDENCE_PROBABLE   = 0.50;

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

export default function DashSentry() {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const classifyingRef = useRef(false);

  const { speedMph, fuzzyCity, fuzzyDistrict } = useLocation();
  const { addCatch } = useCatchStore();
  const orbitalBoostExpires = usePlayerStore(s => s.orbitalBoostExpires);
  const boostActive = boostRemainingMin(orbitalBoostExpires) > 0;
  const privacyShieldEnabled = useSettingsStore(s => s.privacyShieldEnabled);

  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [catchBanner, setCatchBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMoving = speedMph > SPEED_THRESHOLD_MPH;

  // ── Classify loop — snapshot every 500ms, run CoreML, handle result ─────────
  useEffect(() => {
    if (!safetyConfirmed) return;

    const timer = setInterval(async () => {
      if (classifyingRef.current || !cameraRef.current) return;
      classifyingRef.current = true;
      try {
        const snapshot = await cameraRef.current.takeSnapshot({ quality: 85 });
        const result   = await Classifier.classify(snapshot.path);
        if (!result) return;

        if (result.confidence >= CONFIDENCE_AUTO_CATCH) {
          handleCatch(result);
        } else if (result.confidence >= CONFIDENCE_PROBABLE) {
          handleProbable(result);
        }
      } catch {
        // Camera not ready or classify failed — silently skip this frame
      } finally {
        classifyingRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [safetyConfirmed]);

  const handleCatch = useCallback((result: ClassifyResult) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addCatch({
      ...result,
      catchType: 'highway',
      fuzzyCity:     fuzzyCity     ?? undefined,
      fuzzyDistrict: fuzzyDistrict ?? undefined,
    });
    showBanner(`CAUGHT: ${result.make} ${result.model} · ${Math.round(result.confidence * 100)}%`);
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

        {/* Safety banner — always visible */}
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyText}>KEEP EYES ON ROAD</Text>
        </View>

        <PrivacyShield enabled={privacyShieldEnabled} />

        {boostActive && (
          <View style={styles.boostPill}>
            <Text style={styles.boostPillText}>⚡ BOOST ACTIVE · {boostRemainingMin(orbitalBoostExpires)}m</Text>
          </View>
        )}

        {/* HUD dims above 15mph */}
        {isMoving ? (
          <View style={styles.minimalHud}>
            <View style={styles.radarDot} />
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
  radarDot:     { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e63946' },
  fullHud:      { position: 'absolute', bottom: 60, alignSelf: 'center' },
  speedLabel:   { color: '#ffffff88', fontSize: 13, letterSpacing: 2 },
  catchBanner:  { position: 'absolute', bottom: 140, left: 24, right: 24, backgroundColor: '#0a0a0aee', borderRadius: 10, padding: 16 },
  catchText:    { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  exitButton:   { position: 'absolute', top: 60, right: 24 },
  exitText:     { color: '#ffffff66', fontSize: 13, letterSpacing: 2 },
  boostPill:    { position: 'absolute', top: 60, left: 24, backgroundColor: '#1a120088', borderWidth: 1, borderColor: '#f59e0b88', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  boostPillText:{ color: '#f59e0b', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  interstitialOverlay:    { flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 32 },
  interstitialCard:       { backgroundColor: '#111', borderRadius: 16, padding: 28, alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#222' },
  interstitialIcon:       { fontSize: 36 },
  interstitialTitle:      { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  interstitialBody:       { color: '#aaa', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  interstitialButton:     { marginTop: 8, backgroundColor: '#e63946', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  interstitialButtonText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
});
