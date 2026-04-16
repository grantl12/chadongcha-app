import { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Camera } from 'react-native-vision-camera';
import * as Notifications from 'expo-notifications';
import { usePlayerStore } from '@/stores/playerStore';
import { apiClient } from '@/api/client';

async function saveHomeLocation(): Promise<void> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await apiClient.patch('/players/home-location', {
      home_lat: loc.coords.latitude,
      home_lon: loc.coords.longitude,
    });
  } catch {
    // Non-fatal — satellite notifications just won't fire until location is set.
    // Player can update from profile settings later.
  }
}

type Step = 'splash' | 'auth' | 'permissions';
type AuthMode = 'signin' | 'signup';

// ─── Splash ──────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '🚗', title: 'Dash Sentry',    body: 'Passive dashcam capture — just drive.' },
  { icon: '🔍', title: '360° Scan',      body: 'Walk around parked cars for bonus XP.' },
  { icon: '🛰',  title: 'Space Objects', body: 'Catch satellites overhead for an XP boost.' },
  { icon: '🗺',  title: 'Road King',     body: 'Own the roads you drive most.' },
];

function SplashStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.splashContainer}>
      <View style={styles.splashHero}>
        <Text style={styles.splashTitle}>차동차</Text>
        <Text style={styles.splashRomaji}>CHADONGCHA</Text>
        <Text style={styles.splashTagline}>Catch every car on the road.</Text>
      </View>

      <View style={styles.featureList}>
        {FEATURES.map(f => (
          <View key={f.title} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.buttonText}>GET STARTED</Text>
      </Pressable>

      <Pressable onPress={onNext} style={styles.secondaryLink}>
        <Text style={styles.secondaryLinkText}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function AuthStep({ onSuccess }: { onSuccess: () => void }) {
  const { setPlayer, setProfile } = usePlayerStore();
  const [mode, setMode]         = useState<AuthMode>('signup');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);

  async function handleSubmit() {
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === 'signup') {
        if (!username) { setError('Username is required.'); setLoading(false); return; }
        const signupRes = await apiClient.post('/auth/signup', { email, password, username }) as {
          user_id: string;
          access_token?: string;
          refresh_token?: string;
        };

        if (signupRes.access_token) {
          // Backend issued a session directly — auto sign-in, no email step.
          setPlayer({ userId: signupRes.user_id, username, accessToken: signupRes.access_token });
          try {
            const profile = await apiClient.get('/auth/me') as { username: string; xp: number; level: number };
            setPlayer({ userId: signupRes.user_id, username: profile.username, accessToken: signupRes.access_token });
            setProfile(profile.xp, profile.level);
          } catch { /* non-fatal — username already set from form */ }
          onSuccess();
          return;
        }

        // Fallback (shouldn't normally hit): manual sign-in
        setInfo('Account created! Sign in to continue.');
        setMode('signin');
        setLoading(false);
        return;
      }

      const signinRes = await apiClient.post('/auth/signin', { email, password }) as {
        access_token: string;
        user_id: string;
      };

      setPlayer({ userId: signinRes.user_id, username: email, accessToken: signinRes.access_token });

      try {
        const profile = await apiClient.get('/auth/me') as { username: string; xp: number; level: number };
        setPlayer({ userId: signinRes.user_id, username: profile.username, accessToken: signinRes.access_token });
        setProfile(profile.xp, profile.level);
      } catch {
        setPlayer({ userId: signinRes.user_id, username: email.split('@')[0], accessToken: signinRes.access_token });
      }

      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      const match = msg.match(/→ \d+: (.*)/);
      setError(match ? match[1] : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.authTitle}>
          {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
        </Text>
        <Text style={styles.authSub}>
          {mode === 'signup' ? 'Start your collection.' : 'Sign in to continue.'}
        </Text>

        <View style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#444"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#444"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#444"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {info  && <Text style={styles.infoText}>{info}</Text>}

          <Pressable
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>
                  {mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
                </Text>
            }
          </Pressable>

          <Pressable
            onPress={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
            style={styles.secondaryLink}
          >
            <Text style={styles.secondaryLinkText}>
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Permissions ──────────────────────────────────────────────────────────────

type PermStatus = 'pending' | 'granted' | 'denied';

type PermState = {
  location:  PermStatus;
  camera:    PermStatus;
  notifications: PermStatus;
};

const PERM_CONFIG = [
  {
    key: 'location' as const,
    icon: '📍',
    title: 'Location',
    body: 'Required for satellite pass alerts and Road King territory.',
    request: async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        await saveHomeLocation();
        return 'granted';
      }
      return 'denied';
    },
  },
  {
    key: 'camera' as const,
    icon: '📷',
    title: 'Camera',
    body: 'Required for Dash Sentry and 360° Scan.',
    request: async () => {
      const status = await Camera.requestCameraPermission();
      return status === 'granted' ? 'granted' : 'denied';
    },
  },
  {
    key: 'notifications' as const,
    icon: '🔔',
    title: 'Notifications',
    body: 'Get alerted when your Road King title is challenged.',
    request: async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted' ? 'granted' : 'denied';
    },
  },
];

function PermRow({
  icon, title, body, status, extraNote,
  onRequest,
}: {
  icon: string; title: string; body: string;
  status: PermStatus; extraNote?: string; onRequest: () => void;
}) {
  return (
    <View style={styles.permRow}>
      <Text style={styles.permIcon}>{icon}</Text>
      <View style={styles.permBody}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{body}</Text>
        {extraNote && status === 'granted' && (
          <Text style={styles.permExtraNote}>{extraNote}</Text>
        )}
      </View>
      {status === 'pending' ? (
        <Pressable style={styles.permBtn} onPress={onRequest}>
          <Text style={styles.permBtnText}>ALLOW</Text>
        </Pressable>
      ) : status === 'granted' ? (
        <Text style={styles.permGranted}>✓</Text>
      ) : (
        <Text style={styles.permDenied}>✕</Text>
      )}
    </View>
  );
}

function PermissionsStep({ onDone }: { onDone: () => void }) {
  const [perms, setPerms] = useState<PermState>({
    location:      'pending',
    camera:        'pending',
    notifications: 'pending',
  });
  const footerAnim = useRef(new Animated.Value(0)).current;

  async function handleRequest(key: keyof PermState, requestFn: () => Promise<PermStatus>) {
    const result = await requestFn();
    setPerms(prev => {
      const next = { ...prev, [key]: result };
      const allResolved = Object.values(next).every(s => s !== 'pending');
      if (allResolved) {
        Animated.spring(footerAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start();
      }
      return next;
    });
  }

  const allResolved = Object.values(perms).every(s => s !== 'pending');
  const coreGranted = perms.location !== 'denied' && perms.camera !== 'denied';

  return (
    <View style={styles.permContainer}>
      <Text style={styles.permHeading}>Permissions</Text>
      <Text style={styles.permSub}>
        The game needs a few things to work. You can change these any time in Settings.
      </Text>

      <View style={styles.permList}>
        {PERM_CONFIG.map(p => (
          <PermRow
            key={p.key}
            icon={p.icon}
            title={p.title}
            body={p.body}
            status={perms[p.key]}
            extraNote={p.key === 'location' ? '📡 Home location set for satellite alerts' : undefined}
            onRequest={() => handleRequest(p.key, p.request)}
          />
        ))}
      </View>

      {allResolved && (
        <Animated.View style={[
          styles.permFooter,
          { opacity: footerAnim, transform: [{ translateY: footerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }
        ]}>
          {!coreGranted && (
            <Text style={styles.permWarning}>
              Location and Camera are required for core gameplay. You can grant them in Settings.
            </Text>
          )}
          <Pressable style={styles.primaryButton} onPress={onDone}>
            <Text style={styles.buttonText}>
              {coreGranted ? "LET'S GO" : 'CONTINUE ANYWAY'}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [step, setStep] = useState<Step>('splash');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  function transition(to: Step) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    // Step updates immediately — fade gives visual separation
    setStep(to);
  }

  function finish() {
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        {step === 'splash'      && <SplashStep onNext={() => transition('auth')} />}
        {step === 'auth'        && <AuthStep onSuccess={() => transition('permissions')} />}
        {step === 'permissions' && <PermissionsStep onDone={finish} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:               { flex: 1, backgroundColor: '#0a0a0a' },

  // Splash
  splashContainer:    { flex: 1, padding: 32, justifyContent: 'space-between', paddingTop: 100, paddingBottom: 50 },
  splashHero:         { alignItems: 'center', gap: 4 },
  splashTitle:        { color: '#fff', fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  splashRomaji:       { color: '#e63946', fontSize: 13, letterSpacing: 5, fontWeight: '700' },
  splashTagline:      { color: '#444', fontSize: 14, marginTop: 8 },

  featureList:        { gap: 20 },
  featureRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  featureIcon:        { fontSize: 24, width: 36, textAlign: 'center', marginTop: 2 },
  featureBody:        { flex: 1, gap: 2 },
  featureTitle:       { color: '#fff', fontSize: 15, fontWeight: '700' },
  featureDesc:        { color: '#555', fontSize: 13 },

  // Auth
  authContainer:      { flexGrow: 1, padding: 32, paddingTop: 100, justifyContent: 'flex-start' },
  authTitle:          { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 6 },
  authSub:            { color: '#555', fontSize: 14, marginBottom: 40 },
  form:               { gap: 12 },
  input:              { backgroundColor: '#141414', color: '#fff', borderRadius: 8, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#222' },
  error:              { color: '#e63946', fontSize: 13, textAlign: 'center' },
  infoText:           { color: '#4ade80', fontSize: 13, textAlign: 'center' },

  // Permissions
  permContainer:      { flex: 1, padding: 32, paddingTop: 100 },
  permHeading:        { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 8 },
  permSub:            { color: '#555', fontSize: 14, marginBottom: 40, lineHeight: 20 },
  permList:           { gap: 0 },
  permRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#111', gap: 16 },
  permIcon:           { fontSize: 22, width: 32, textAlign: 'center' },
  permBody:           { flex: 1, gap: 3 },
  permTitle:          { color: '#fff', fontSize: 15, fontWeight: '700' },
  permDesc:           { color: '#555', fontSize: 13, lineHeight: 18 },
  permExtraNote:      { color: '#4ade80', fontSize: 11, marginTop: 4, fontWeight: '600' },
  permBtn:            { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  permBtnText:        { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  permGranted:        { color: '#4ade80', fontSize: 18, fontWeight: '700', width: 32, textAlign: 'center' },
  permDenied:         { color: '#333', fontSize: 18, fontWeight: '700', width: 32, textAlign: 'center' },
  permFooter:         { marginTop: 32, gap: 12 },
  permWarning:        { color: '#f59e0b', fontSize: 13, lineHeight: 18 },

  // Shared
  primaryButton:      { backgroundColor: '#e63946', borderRadius: 8, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled:     { opacity: 0.6 },
  buttonText:         { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 2 },
  secondaryLink:      { alignItems: 'center', paddingVertical: 8 },
  secondaryLinkText:  { color: '#555', fontSize: 13 },
});
