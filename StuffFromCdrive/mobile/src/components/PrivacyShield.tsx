/**
 * PrivacyShield — overlays a frosted region over the passenger compartment
 * zone of the camera frame to obscure vehicle occupants and interiors.
 *
 * Current implementation: geometric stub covering the windshield band
 * (top 40% of frame, center 70% of width). The real implementation will
 * replace this with per-bounding-box redaction driven by a lightweight
 * face/body detector (e.g. MediaPipe BlazeFace) running as a VisionCamera
 * frame processor worklet — see Phase 5 notes.
 *
 * The shield is always rendered as a View overlay on top of the Camera.
 * When disabled by the user, it renders nothing.
 */
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  enabled: boolean;
  /** Pass the camera frame dimensions if known — defaults to full-width band */
  frameWidth?: number;
  frameHeight?: number;
};

export function PrivacyShield({ enabled }: Props) {
  if (!enabled) return null;

  return (
    <>
      {/*
       * Windshield band — covers the upper-center zone where occupants sit.
       * Phase 5: replace with dynamically positioned BlurBox components
       * per detected face/person bounding box from the frame processor.
       */}
      <View style={styles.windshieldBand} pointerEvents="none">
        <View style={styles.pill}>
          <Text style={styles.pillText}>PRIVACY SHIELD</Text>
        </View>
      </View>

      {/*
       * Side-window zones — driver and passenger windows.
       * Phase 5: driven by detection bounding boxes, not fixed geometry.
       */}
      <View style={styles.sideLeft}  pointerEvents="none" />
      <View style={styles.sideRight} pointerEvents="none" />
    </>
  );
}

const SHIELD_COLOR = 'rgba(0, 0, 0, 0.55)';

const styles = StyleSheet.create({
  // Upper-center band — windshield + headrests
  windshieldBand: {
    position: 'absolute',
    top: '18%',
    left: '10%',
    right: '10%',
    height: '28%',
    backgroundColor: SHIELD_COLOR,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Left side window
  sideLeft: {
    position: 'absolute',
    top: '22%',
    left: 0,
    width: '12%',
    height: '22%',
    backgroundColor: SHIELD_COLOR,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  // Right side window
  sideRight: {
    position: 'absolute',
    top: '22%',
    right: 0,
    width: '12%',
    height: '22%',
    backgroundColor: SHIELD_COLOR,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
