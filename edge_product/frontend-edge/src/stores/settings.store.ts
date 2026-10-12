import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================
// Type Definitions
// ============================================

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type Language = 'en' | 'vi';

interface SettingsState {
  // Settings
  theme: Theme;
  fontSize: FontSize;
  language: Language;
  
  // UI State
  isSettingsOpen: boolean;
  
  // Initialization flag
  _hasHydrated: boolean;
  
  // Actions
  setTheme: (theme: Theme) => void;
  setFontSize: (size: FontSize) => void;
  setLanguage: (lang: Language) => void;
  openSettings: () => void;
  closeSettings: () => void;
  resetToDefaults: () => void;
  
  // Internal
  setHasHydrated: (state: boolean) => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SETTINGS = {
  theme: 'system' as Theme,
  fontSize: 'medium' as FontSize,
  language: 'en' as Language,
};

const VALID_THEMES: Theme[] = ['light', 'dark', 'system'];
const VALID_FONT_SIZES: FontSize[] = ['small', 'medium', 'large', 'xlarge'];
const VALID_LANGUAGES: Language[] = ['en', 'vi'];

const FONT_SCALES: Record<FontSize, number> = {
  small: 1, // không thu nhỏ nữa: chữ tối thiểu 14px
  medium: 1,
  large: 1.125,
  xlarge: 1.25,
};

// ============================================
// Safe localStorage Wrapper
// ============================================

function getStoredSettings(): Partial<SettingsState> | null {
  try {
    const stored = localStorage.getItem('maritime-edge-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log('[Settings] Loaded from storage:', parsed);
      return parsed.state || parsed;
    }
  } catch (error) {
    console.warn('[Settings] Failed to load from localStorage:', error);
  }
  return null;
}

function saveSettings(state: Partial<SettingsState>): void {
  try {
    const toSave = {
      state: {
        theme: state.theme,
        fontSize: state.fontSize,
        language: state.language,
      },
      version: 0,
    };
    localStorage.setItem('maritime-edge-settings', JSON.stringify(toSave));
    console.log('[Settings] Saved to storage:', toSave);
  } catch (error) {
    console.warn('[Settings] Failed to save to localStorage:', error);
  }
}

// ============================================
// Validation Helpers
// ============================================

function validateTheme(theme: unknown): Theme {
  if (typeof theme === 'string' && VALID_THEMES.includes(theme as Theme)) {
    return theme as Theme;
  }
  console.warn(`[Settings] Invalid theme: ${theme}, using default`);
  return DEFAULT_SETTINGS.theme;
}

function validateFontSize(size: unknown): FontSize {
  if (typeof size === 'string' && VALID_FONT_SIZES.includes(size as FontSize)) {
    return size as FontSize;
  }
  console.warn(`[Settings] Invalid fontSize: ${size}, using default`);
  return DEFAULT_SETTINGS.fontSize;
}

function validateLanguage(lang: unknown): Language {
  if (typeof lang === 'string' && VALID_LANGUAGES.includes(lang as Language)) {
    return lang as Language;
  }
  console.warn(`[Settings] Invalid language: ${lang}, using default`);
  return DEFAULT_SETTINGS.language;
}

// ============================================
// Theme Application
// ============================================

let systemThemeListener: MediaQueryList | null = null;

function handleSystemThemeChange(e: MediaQueryListEvent): void {
  const state = useSettingsStore.getState();
  if (state.theme === 'system') {
    document.documentElement.classList.toggle('dark', e.matches);
  }
}

function applyTheme(theme: Theme): void {
  try {
    const root = document.documentElement;
    
    // Clean up previous system theme listener
    if (systemThemeListener) {
      systemThemeListener.removeEventListener('change', handleSystemThemeChange);
      systemThemeListener = null;
    }
    
    if (theme === 'system') {
      // Set up listener for system theme changes
      systemThemeListener = window.matchMedia('(prefers-color-scheme: dark)');
      systemThemeListener.addEventListener('change', handleSystemThemeChange);
      
      const isDark = systemThemeListener.matches;
      root.classList.toggle('dark', isDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  } catch (error) {
    console.error('[Settings] Failed to apply theme:', error);
  }
}

// ============================================
// Font Size Application
// ============================================

function applyFontSize(size: FontSize): void {
  try {
    const scale = FONT_SCALES[size] ?? 1;
    document.documentElement.style.setProperty('--font-scale', String(scale));
    document.documentElement.dataset.fontSize = size;
  } catch (error) {
    console.error('[Settings] Failed to apply font size:', error);
  }
}

// ============================================
// Zustand Store
// ============================================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      isSettingsOpen: false,
      _hasHydrated: false,
      
      setTheme: (theme) => {
        const validTheme = validateTheme(theme);
        set({ theme: validTheme });
        applyTheme(validTheme);
        // Manual save
        saveSettings({ ...get(), theme: validTheme });
      },
      
      setFontSize: (fontSize) => {
        const validSize = validateFontSize(fontSize);
        set({ fontSize: validSize });
        applyFontSize(validSize);
        // Manual save
        saveSettings({ ...get(), fontSize: validSize });
      },
      
      setLanguage: (language) => {
        const validLang = validateLanguage(language);
        set({ language: validLang });
        // Manual save
        saveSettings({ ...get(), language: validLang });
      },
      
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
      
      resetToDefaults: () => {
        set({ ...DEFAULT_SETTINGS });
        applyTheme(DEFAULT_SETTINGS.theme);
        applyFontSize(DEFAULT_SETTINGS.fontSize);
        saveSettings(DEFAULT_SETTINGS);
      },
      
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'maritime-edge-settings',
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        language: state.language,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Settings] Failed to rehydrate:', error);
          return;
        }
        
        if (state) {
          console.log('[Settings] Rehydrating with:', state);
          // Validate rehydrated values
          state.theme = validateTheme(state.theme);
          state.fontSize = validateFontSize(state.fontSize);
          state.language = validateLanguage(state.language);
          
          // Apply settings after hydration
          applyTheme(state.theme);
          applyFontSize(state.fontSize);
          
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// ============================================
// Initialize on Module Load
// ============================================

if (typeof window !== 'undefined') {
  // Load stored settings and apply immediately
  const stored = getStoredSettings();
  if (stored) {
    const theme = validateTheme(stored.theme);
    const fontSize = validateFontSize(stored.fontSize);
    applyTheme(theme);
    applyFontSize(fontSize);
    console.log('[Settings] Applied stored settings on load:', { theme, fontSize, language: stored.language });
  } else {
    // Apply default settings to prevent flash
    applyTheme(DEFAULT_SETTINGS.theme);
    applyFontSize(DEFAULT_SETTINGS.fontSize);
    console.log('[Settings] No stored settings, using defaults');
  }
}

// ============================================
// Selector Hooks for Performance
// ============================================

export const useTheme = () => useSettingsStore((s) => s.theme);
export const useFontSize = () => useSettingsStore((s) => s.fontSize);
export const useLanguage = () => useSettingsStore((s) => s.language);
export const useIsSettingsOpen = () => useSettingsStore((s) => s.isSettingsOpen);
