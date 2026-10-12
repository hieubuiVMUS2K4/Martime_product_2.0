import { useMaritimeStore } from '@/stores/maritime.store'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { SettingsButton } from '@/components/settings'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { UserMenu } from './UserMenu'
import { SyncNotificationBell } from './SyncNotificationBell'

export function Header() {
  const { isOnline, isSyncing, lastSyncTime } = useMaritimeStore()
  const { t } = useTranslationSafe()

  return (
    <header className="h-16 shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4 px-[clamp(12px,1.5vw,24px)]">
      {/* Tiêu đề co lại và cắt "…" khi hẹp, không bị cụm bên phải đè lên */}
      <div className="flex min-w-0 items-center">
        <h1 className="truncate text-xl font-semibold text-gray-800 dark:text-white">
          {t('header.title')}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-[clamp(8px,1vw,16px)]">
        {/* Sync Status — ẩn trên màn hẹp */}
        <div className="hidden xl:flex items-center gap-2 text-sm whitespace-nowrap">
          {isSyncing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-yellow-500" />
              <span className="text-gray-600 dark:text-gray-300">{t('header.syncing')}</span>
            </>
          ) : lastSyncTime ? (
            <span className="text-gray-600 dark:text-gray-300">
              {t('header.lastSync', { time: format(lastSyncTime, 'HH:mm:ss') })}
            </span>
          ) : null}
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 whitespace-nowrap" title={isOnline ? t('header.online') : t('header.offline')}>
          {isOnline ? (
            <>
              <Wifi className="w-5 h-5 text-green-500" />
              <span className="hidden md:inline text-sm text-gray-600 dark:text-gray-300">{t('header.online')}</span>
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5 text-red-500" />
              <span className="hidden md:inline text-sm text-gray-600 dark:text-gray-300">{t('header.offline')}</span>
            </>
          )}
        </div>

        {/* Settings Button */}
        <SettingsButton />

        {/* Sync Notifications từ bờ */}
        <SyncNotificationBell />

        {/* Current Time */}
        <div className="hidden lg:block whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
          {format(new Date(), 'dd MMM yyyy HH:mm')}
        </div>

        {/* User Menu / Logout */}
        <div className="border-l border-gray-200 dark:border-gray-700 pl-[clamp(8px,1vw,16px)]">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
