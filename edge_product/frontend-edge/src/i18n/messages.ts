import { translateForLocale, useTranslation } from '@/contexts/I18nContext'
import { useSettingsStore } from '@/stores/settings.store'
import vi from '@/locales/vi.json'
import en from '@/locales/en.json'

/** Read the current language at call time; never translate persisted user content. */
export const translateMessage = (key: string, params?: Record<string, string | number>) =>
  translateForLocale(useSettingsStore.getState().language, key, params)

/** Subscribe even in components whose labels are produced by formatting helpers. */
export function useMessageLocale() { return useTranslation().locale }
export const messageLocale = () => useSettingsStore.getState().language === 'vi' ? 'vi-VN' : 'en-GB'

const systemMessageKeys = new Map<string, string>()
for (const catalog of [vi.pmsRework, en.pmsRework]) {
  for (const [key, text] of Object.entries(catalog)) if (!/\{\w+\}/.test(text)) systemMessageKeys.set(text, `pmsRework.${key}`)
}
/** Exact known system messages only. User-entered names, notes and signed reports stay untouched. */
export function localizePmsMessage(text: string) {
  const key = systemMessageKeys.get(text)
  return key ? translateMessage(key) : text
}
