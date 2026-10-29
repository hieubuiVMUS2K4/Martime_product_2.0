import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useSettingsStore, type Language } from '@/stores/settings.store';

// Import translations statically (small files, no need for lazy load)
import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

// ============================================
// Types
// ============================================

type TranslationData = typeof en;

interface I18nContextType {
  locale: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ============================================
// Translation Data
// ============================================

const translations: Record<Language, TranslationData> = { en, vi };

// ============================================
// Context
// ============================================

const I18nContext = createContext<I18nContextType | null>(null);

// ============================================
// Helper Functions
// ============================================

/**
 * Get nested value from object using dot notation
 * Example: getNestedValue(obj, 'settings.theme.label') 
 * Returns undefined if path doesn't exist
 */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let value: unknown = obj;
  
  for (const key of keys) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  
  return typeof value === 'string' ? value : undefined;
}

/**
 * Replace placeholders like {name} with actual values
 * Example: interpolate('Hello {name}!', { name: 'John' }) => 'Hello John!'
 */
function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, paramKey) => {
    const paramValue = params[paramKey];
    return paramValue !== undefined ? String(paramValue) : match;
  });
}

/** Same catalog and fallback for React views and non-React formatting/validation helpers. */
export function translateForLocale(locale: Language, key: string, params?: Record<string, string | number>): string {
  const value = getNestedValue(translations[locale] ?? translations.en, key) ?? getNestedValue(translations.en, key) ?? key;
  return params ? interpolate(value, params) : value;
}

// ============================================
// Provider Component
// ============================================

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useSettingsStore((state) => state.language);
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<I18nContextType>(() => {
    const currentTranslations = translations[language] ?? translations.en;
    const fallbackTranslations = translations.en;
    
    const t = (key: string, params?: Record<string, string | number>): string => {
      // Validate key
      if (!key || typeof key !== 'string') {
        console.warn('[i18n] Invalid translation key:', key);
        return String(key);
      }
      
      // Try current language first
      let value = getNestedValue(currentTranslations, key);
      
      // Fallback to English if not found
      if (value === undefined && language !== 'en') {
        value = getNestedValue(fallbackTranslations, key);
        if (value !== undefined && process.env.NODE_ENV === 'development') {
          console.debug(`[i18n] Using fallback for key: ${key}`);
        }
      }
      
      // If still not found, return key as-is (development helper)
      if (value === undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[i18n] Missing translation: ${key}`);
        }
        return key;
      }
      
      // Replace params if provided
      if (params && Object.keys(params).length > 0) {
        return interpolate(value, params);
      }
      
      return value;
    };
    
    return { locale: language, t };
  }, [language]);
  
  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}

// ============================================
// Hooks
// ============================================

/**
 * Hook to access translations
 * @throws Error if used outside I18nProvider
 */
export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error(
      '[useTranslation] Must be used within I18nProvider. ' +
      'Wrap your app with <I18nProvider> in main.tsx'
    );
  }
  return context;
}

/**
 * Safe version that returns fallback instead of throwing
 * Useful for components that may render before provider is ready
 */
export function useTranslationSafe(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    // Return fallback that just returns the key
    return {
      locale: 'en',
      t: (key: string) => key,
    };
  }
  return context;
}

// ============================================
// Utility Exports
// ============================================

export { I18nContext };
export type { I18nContextType };
