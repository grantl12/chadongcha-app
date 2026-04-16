import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SettingsStore = {
  privacyShieldEnabled: boolean;
  togglePrivacyShield: () => void;
  /**
   * Opt-in: anonymized scan photos are uploaded to Cloudflare R2 after a
   * successful catch and used to retrain the vehicle classifier.
   * Off by default — user must explicitly enable in Settings.
   */
  contributeScans: boolean;
  toggleContributeScans: () => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      privacyShieldEnabled: true,
      togglePrivacyShield: () => set(s => ({ privacyShieldEnabled: !s.privacyShieldEnabled })),
      contributeScans: false,
      toggleContributeScans: () => set(s => ({ contributeScans: !s.contributeScans })),
    }),
    { name: 'settings-store', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
