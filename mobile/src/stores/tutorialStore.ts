import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Steps: 0 = welcome card, 1-4 = tab steps, 5 = complete
type TutorialStore = {
  completed: boolean;
  step: number;
  advance: () => void;
  skip: () => void;
  replay: () => void;
};

export const useTutorialStore = create<TutorialStore>()(
  persist(
    (set) => ({
      completed: false,
      step: 0,
      advance: () =>
        set((s) => {
          const next = s.step + 1;
          return next >= 5 ? { completed: true, step: 5 } : { step: next };
        }),
      skip: () => set({ completed: true, step: 5 }),
      replay: () => set({ completed: false, step: 0 }),
    }),
    { name: 'tutorial-store', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
