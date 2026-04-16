import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  feature: string;
  description?: string;
};

export function PaywallModal({ visible, onClose, feature, description }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.topStripe} />

          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.headline}>PRO FEATURE</Text>
          <Text style={styles.featureName}>{feature.toUpperCase()}</Text>

          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}

          <View style={styles.perksContainer}>
            <PerkRow text="Unlimited garage" />
            <PerkRow text="Advanced Telemetry (HP · Torque · Weight · MSRP)" />
            <PerkRow text="10 market listings · No seller fee" />
            <PerkRow text="Create & lead a crew" />
          </View>

          <Pressable style={styles.ctaBtn} onPress={onClose}>
            <Text style={styles.ctaText}>UPGRADE TO PRO</Text>
          </Pressable>

          <Pressable style={styles.dismissBtn} onPress={onClose}>
            <Text style={styles.dismissText}>MAYBE LATER</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PerkRow({ text }: { text: string }) {
  return (
    <View style={styles.perkRow}>
      <Text style={styles.perkDot}>▸</Text>
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e63946',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 28,
  },
  topStripe: {
    width: '100%',
    height: 3,
    backgroundColor: '#e63946',
    marginBottom: 24,
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  headline: {
    color: '#e63946',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 6,
  },
  featureName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  description: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  perksContainer: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 24,
    gap: 8,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  perkDot: {
    color: '#e63946',
    fontSize: 11,
    marginTop: 1,
  },
  perkText: {
    color: '#aaa',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  ctaBtn: {
    backgroundColor: '#e63946',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 6,
    marginBottom: 12,
    width: '88%',
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  dismissBtn: {
    paddingVertical: 8,
  },
  dismissText: {
    color: '#333',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
