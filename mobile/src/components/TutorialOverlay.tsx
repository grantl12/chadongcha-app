import { useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated,
  useWindowDimensions,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTutorialStore } from '@/stores/tutorialStore';
import { useTheme, type Theme } from '@/lib/theme';

const TAB_COUNT = 5;
const TAB_BAR_HEIGHT = 49;

type StepConfig = {
  tabIndex: number;
  route: string;
  label: string;
  body: string;
};

const STEPS: StepConfig[] = [
  { tabIndex: 0, route: '/',       label: 'OPS',    body: 'Your mission control. Launch Dash Sentry and 360° Scan from here.' },
  { tabIndex: 1, route: '/garage', label: 'GARAGE', body: 'Every vehicle you catch lands here. Check your collection.' },
  { tabIndex: 2, route: '/map',    label: 'ROADS',  body: 'Own the roads you drive most. Challenge rivals for Road King.' },
  { tabIndex: 3, route: '/feed',   label: 'FEED',   body: 'See what the community is catching in real time.' },
];

const WELCOME_ITEMS = [
  { label: 'OPS',    desc: 'Mission control — Dash Sentry & 360° Scan' },
  { label: 'GARAGE', desc: 'Your full vehicle collection' },
  { label: 'ROADS',  desc: 'Territory — own the roads you drive' },
  { label: 'FEED',   desc: 'Live community catches' },
];

export function TutorialOverlay() {
  const T = useTheme();
  const { completed, step, advance, skip } = useTutorialStore();
  const pathname = usePathname();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // Auto-advance when user navigates to the expected tab
  useEffect(() => {
    if (completed || step === 0) return;
    const config = STEPS[step - 1];
    if (config && pathname === config.route) {
      const timer = setTimeout(() => advance(), 600);
      return () => clearTimeout(timer);
    }
  }, [pathname, step, completed]);

  // Pulse animation for the ring
  useEffect(() => {
    if (completed || step === 0) return;
    pulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [step, completed]);

  // Fade in on step change
  useEffect(() => {
    if (completed) return;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [step, completed]);

  if (completed) return null;

  const styles = makeStyles(T);
  const tabBarTotal = TAB_BAR_HEIGHT + insets.bottom;

  // ── Welcome card (step 0) ─────────────────────────────────────────────────
  if (step === 0) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.welcomeBg]}>
        <Animated.View style={[styles.welcomeCard, { opacity: fadeAnim }]}>
          <Text style={styles.welcomeEyebrow}>TUTORIAL</Text>
          <Text style={styles.welcomeTitle}>차동차</Text>
          <Text style={styles.welcomeSub}>
            Quick tour — we'll show you the 4 key screens.
          </Text>

          <View style={styles.welcomeItems}>
            {WELCOME_ITEMS.map((item) => (
              <View key={item.label} style={styles.welcomeRow}>
                <Text style={[styles.welcomeItemLabel, { color: T.accent }]}>{item.label}</Text>
                <Text style={styles.welcomeItemDesc}>{item.desc}</Text>
              </View>
            ))}
          </View>

          <Pressable style={[styles.btn, { backgroundColor: T.accent }]} onPress={advance}>
            <Text style={styles.btnText}>START TOUR</Text>
          </Pressable>
          <Pressable style={styles.skipLink} onPress={skip}>
            <Text style={styles.skipLinkText}>Skip tutorial</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // ── Tab guidance steps (1-4) ──────────────────────────────────────────────
  const config = STEPS[step - 1];
  if (!config) return null;

  const tabCenterX = (config.tabIndex + 0.5) / TAB_COUNT * screenWidth;
  const ringSize   = 52;

  const ringScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 0.5, 0.1] });

  return (
    // box-none: outer container doesn't capture touches; children may
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">

      {/* Dim backdrop — non-interactive so tab bar touches pass through */}
      <View
        style={[StyleSheet.absoluteFillObject, styles.dimBg]}
        pointerEvents="none"
      />

      {/* Skip button — sits above dim, fully interactive */}
      <Pressable
        style={[styles.skipBtn, { top: insets.top + 16 }]}
        onPress={skip}
      >
        <Text style={styles.skipBtnText}>SKIP</Text>
      </Pressable>

      {/* Tooltip above tab bar — non-interactive */}
      <Animated.View
        style={[styles.tooltip, { bottom: tabBarTotal + 12, opacity: fadeAnim }]}
        pointerEvents="none"
      >
        <View style={styles.tooltipHeader}>
          <Text style={[styles.tooltipLabel, { color: T.accent }]}>{config.label}</Text>
          <Text style={styles.tooltipStep}>{step} / {STEPS.length}</Text>
        </View>
        <Text style={styles.tooltipBody}>{config.body}</Text>
        <Text style={styles.tooltipHint}>Tap the tab ↓</Text>
      </Animated.View>

      {/* Pulse ring over target tab — non-interactive */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: T.accent,
            bottom: insets.bottom + (TAB_BAR_HEIGHT - ringSize) / 2,
            left: tabCenterX - ringSize / 2,
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          },
        ]}
      />
    </View>
  );
}

function makeStyles(T: Theme) {
  return StyleSheet.create({
    // Welcome
    welcomeBg:        { backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    welcomeCard:      { width: '100%', maxWidth: 360, gap: 20 },
    welcomeEyebrow:   { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 4 },
    welcomeTitle:     { color: T.text, fontSize: 48, fontWeight: '900', letterSpacing: -1 },
    welcomeSub:       { color: T.text2, fontSize: 14, lineHeight: 20 },
    welcomeItems:     { gap: 14, paddingVertical: 8 },
    welcomeRow:       { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    welcomeItemLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 2, width: 56, paddingTop: 1 },
    welcomeItemDesc:  { color: T.text2, fontSize: 13, flex: 1, lineHeight: 18 },
    btn:              { borderRadius: 8, paddingVertical: 16, alignItems: 'center' },
    btnText:          { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 2 },
    skipLink:         { alignItems: 'center', paddingVertical: 6 },
    skipLinkText:     { color: T.text3, fontSize: 13 },

    // Tab steps
    dimBg:            { backgroundColor: 'rgba(0,0,0,0.72)' },
    skipBtn:          { position: 'absolute', right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: T.border },
    skipBtnText:      { color: T.text2, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
    tooltip:          { position: 'absolute', left: 20, right: 20, backgroundColor: T.card, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: T.border, gap: 6 },
    tooltipHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tooltipLabel:     { fontSize: 15, fontWeight: '900', letterSpacing: 2 },
    tooltipStep:      { color: T.text3, fontSize: 11, fontWeight: '700' },
    tooltipBody:      { color: T.text, fontSize: 14, lineHeight: 20 },
    tooltipHint:      { color: T.text3, fontSize: 11, fontWeight: '600', marginTop: 4 },
    pulseRing:        { position: 'absolute', borderWidth: 2 },
  });
}
