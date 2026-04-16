import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

type BadgeInfo = {
  type: string;
  label: string;
};

interface BadgeAwardModalProps {
  badge: BadgeInfo | null;
  onClose: () => void;
}

export function BadgeAwardModal({ badge, onClose }: BadgeAwardModalProps) {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (badge) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [badge]);

  if (!badge) return null;

  return (
    <Modal transparent visible={!!badge} animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[
          styles.content,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }
        ]}>
          <Text style={styles.icon}>🏆</Text>
          <Text style={styles.title}>BADGE EARNED!</Text>
          <Text style={styles.label}>{badge.label}</Text>
          <Text style={styles.sub}>Added to your profile collection</Text>
          
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>CONTINUE</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  content: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#e63946',
    shadowColor: '#e63946',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  icon: {
    fontSize: 60,
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  label: {
    color: '#e63946',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 30,
  },
  closeBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
});
