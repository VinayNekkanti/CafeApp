import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { colorsFor, ThemeMode } from '../constants/theme';

const STORAGE_KEY = 'findmycafe.themeMode';

interface ThemeContextType {
  mode: ThemeMode;
  colors: ReturnType<typeof colorsFor>;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('coffee');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'coffee' || saved === 'matcha') setModeState(saved);
      })
      .catch((err) => console.warn('[Theme] Failed to load saved theme mode:', err))
      .finally(() => setLoaded(true));
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((err) =>
      console.warn('[Theme] Failed to persist theme mode:', err)
    );
  };

  const toggleMode = () => setMode(mode === 'coffee' ? 'matcha' : 'coffee');

  // Wait for the saved mode to load before rendering anything themed, so we
  // don't flash coffee colors for a frame before switching to a saved matcha
  // preference. Sits behind the font-loading gate in app/_layout.tsx already,
  // so this is a brief extra beat, not a new splash state.
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ mode, colors: colorsFor(mode), toggleMode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
};
