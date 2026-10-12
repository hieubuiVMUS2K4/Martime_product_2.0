import { useCallback, type ChangeEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { useSettingsStore, type Theme, type FontSize } from '@/stores/settings.store';
import { useTranslation } from '@/contexts/I18nContext';

// ============================================
// Constants
// ============================================

const THEME_OPTIONS: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

const FONT_SIZE_OPTIONS: FontSize[] = ['medium', 'large', 'xlarge'];

// ============================================
// Main Component
// ============================================

export function SettingsDialog() {
  const { t } = useTranslation();
  const {
    isSettingsOpen,
    closeSettings,
    theme,
    setTheme,
    fontSize,
    setFontSize,
    language,
    setLanguage,
    resetToDefaults,
  } = useSettingsStore();

  // Memoize handlers to prevent unnecessary re-renders
  const handleThemeChange = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme);
    },
    [setTheme]
  );

  const handleFontSizeChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setFontSize(e.target.value as FontSize);
    },
    [setFontSize]
  );

  const handleLanguageChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setLanguage(e.target.value as 'en' | 'vi');
    },
    [setLanguage]
  );

  const handleReset = useCallback(() => {
    const confirmMessage = t('settings.confirmReset');
    toast(confirmMessage, {
      action: {
        label: t('common.reset') || 'Reset',
        onClick: () => {
          resetToDefaults();
        }
      }
    });
  }, [resetToDefaults, t]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeSettings();
      }
    },
    [closeSettings]
  );

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" />

        {/* Content */}
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
            bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 w-full max-w-md p-6
            animate-in fade-in zoom-in-95 duration-200
            focus:outline-none"
          onEscapeKeyDown={closeSettings}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
              <Settings className="w-5 h-5" />
              {t('settings.title')}
            </Dialog.Title>
            <Dialog.Close
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('common.close')}
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            {/* Theme Selection */}
            <ThemeSection
              theme={theme}
              onThemeChange={handleThemeChange}
              t={t}
            />

            {/* Font Size Selection */}
            <FontSizeSection
              fontSize={fontSize}
              onFontSizeChange={handleFontSizeChange}
              t={t}
            />

            {/* Language Selection */}
            <LanguageSection
              language={language}
              onLanguageChange={handleLanguageChange}
              t={t}
            />
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <button
              type="button"
              onClick={handleReset}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors focus:outline-none focus:underline"
            >
              {t('common.reset')}
            </button>
            <button
              type="button"
              onClick={closeSettings}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('common.done')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ============================================
// Theme Section
// ============================================

interface ThemeSectionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  t: (key: string) => string;
}

function ThemeSection({ theme, onThemeChange, t }: ThemeSectionProps) {
  return (
    <div>
      <label className="text-sm font-medium mb-3 block text-gray-700 dark:text-gray-300">
        {t('settings.theme.label')}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => onThemeChange(value)}
            className={`p-3 rounded-md border-2 flex flex-col items-center gap-2 transition-all
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${
                theme === value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400'
              }`}
            aria-pressed={theme === value}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">
              {t(`settings.theme.${value}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Font Size Section
// ============================================

interface FontSizeSectionProps {
  fontSize: FontSize;
  onFontSizeChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  t: (key: string) => string;
}

function FontSizeSection({ fontSize, onFontSizeChange, t }: FontSizeSectionProps) {
  return (
    <div>
      <label
        htmlFor="fontSize"
        className="text-sm font-medium mb-2 block text-gray-700 dark:text-gray-300"
      >
        {t('settings.fontSize.label')}
      </label>
      <select
        id="fontSize"
        value={fontSize}
        onChange={onFontSizeChange}
        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-md 
          bg-white dark:bg-gray-700 text-gray-900 dark:text-white
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        {FONT_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {t(`settings.fontSize.${size}`)}
          </option>
        ))}
      </select>
      {/* Preview text */}
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
        {t('settings.fontSize.preview')}
      </p>
    </div>
  );
}

// ============================================
// Language Section
// ============================================

interface LanguageSectionProps {
  language: 'en' | 'vi';
  onLanguageChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  t: (key: string) => string;
}

function LanguageSection({ language, onLanguageChange, t }: LanguageSectionProps) {
  return (
    <div>
      <label
        htmlFor="language"
        className="text-sm font-medium mb-2 block text-gray-700 dark:text-gray-300"
      >
        {t('settings.language.label')}
      </label>
      <select
        id="language"
        value={language}
        onChange={onLanguageChange}
        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-md 
          bg-white dark:bg-gray-700 text-gray-900 dark:text-white
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        <option value="en">🇬🇧 English</option>
        <option value="vi">🇻🇳 Tiếng Việt</option>
      </select>
    </div>
  );
}

export default SettingsDialog;
