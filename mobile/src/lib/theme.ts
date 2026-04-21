import React, { createContext, useContext } from 'react';
import { usePlayerStore } from '@/stores/playerStore';

export type ThemeName = 'tactical' | 'carbon' | 'ghost';

export type Theme = {
  bg:      string;
  card:    string;
  card2:   string;
  border:  string;
  accent:  string;
  accent2: string;
  accent3: string;
  text:    string;
  text2:   string;
  text3:   string;
  name:    string;
  tagline: string;
};

export const THEMES: Record<ThemeName, Theme> = {
  tactical: {
    bg:      '#0a0a0a',
    card:    '#141414',
    card2:   '#1c1c1c',
    border:  '#222222',
    accent:  '#e63946',
    accent2: '#f59e0b',
    accent3: '#4a9eff',
    text:    '#ffffff',
    text2:   '#888888',
    text3:   '#444444',
    name:    'TACTICAL',
    tagline: 'Dark · Red · HUD',
  },
  carbon: {
    bg:      '#0c0b09',
    card:    '#171410',
    card2:   '#201d17',
    border:  '#2b2620',
    accent:  '#f59e0b',
    accent2: '#e63946',
    accent3: '#78d97b',
    text:    '#f0ead8',
    text2:   '#7a7060',
    text3:   '#3d3830',
    name:    'CARBON',
    tagline: 'Warm · Amber · Premium',
  },
  ghost: {
    bg:      '#0d0e14',
    card:    '#13141e',
    card2:   '#191b28',
    border:  '#1f2132',
    accent:  '#6366f1',
    accent2: '#e05c6e',
    accent3: '#22d3ee',
    text:    '#e8e8f5',
    text2:   '#6a6a90',
    text3:   '#35364a',
    name:    'GHOST',
    tagline: 'Cool · Indigo · Editorial',
  },
};

export const ThemeContext = createContext<Theme>(THEMES.tactical);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeName = usePlayerStore(s => s.theme);
  const theme = THEMES[themeName] ?? THEMES.tactical;
  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
