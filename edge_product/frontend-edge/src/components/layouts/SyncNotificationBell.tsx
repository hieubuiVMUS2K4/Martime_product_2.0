import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncNotification {
  id: number
  timestamp: string
  action: 'CREW_UPDATED_FROM_SHORE' | 'CREW_CREATED_FROM_SHORE'
  message: string
  entityId: string
  details: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'edge_sync_notif_last_seen'
const CLEARED_AT_KEY = 'edge_sync_notif_cleared_at'
const POLL_INTERVAL_MS = 30_000 // 30 giây

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastSeenAt(): Date | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function setLastSeenAt(date: Date) {
  localStorage.setItem(STORAGE_KEY, date.toISOString())
}

function getClearedAt(): string | undefined {
  return localStorage.getItem(CLEARED_AT_KEY) ?? undefined
}

function setClearedAt(date: Date) {
  localStorage.setItem(CLEARED_AT_KEY, date.toISOString())
}

async function fetchNotifications(since?: string): Promise<SyncNotification[]> {
  const params = new URLSearchParams({ limit: '30' })
  if (since) params.set('since', since)
  const resp = await fetch(`/api/sync/notifications?${params}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('maritime_token') ?? ''}`,
    },
  })
  if (!resp.ok) return []
  return resp.json()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SyncNotificationBell() {
  const [notifications, setNotifications] = useState<SyncNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const seenIdsRef = useRef<Set<number>>(new Set())

  // Tính số chưa đọc dựa vào lastSeenAt trong localStorage
  const computeUnread = useCallback((items: SyncNotification[]) => {
    const last = getLastSeenAt()
    if (!last) return items.length
    return items.filter(n => new Date(n.timestamp) > last).length
  }, [])

  // Fetch và hiển thị toast cho thông báo mới
  const poll = useCallback(async (silent = false) => {
    try {
      const data = await fetchNotifications(getClearedAt())
      setNotifications(data)

      if (!silent) {
        // Tìm các thông báo mới chưa từng toast
        const newItems = data.filter(n => !seenIdsRef.current.has(n.id))
        for (const n of newItems) {
          seenIdsRef.current.add(n.id)
          const isCreate = n.action === 'CREW_CREATED_FROM_SHORE'
          toast(isCreate ? '🆕 Thuyền viên mới từ bờ' : '🔄 Cập nhật từ bờ', {
            description: n.message,
            duration: 6000,
          })
        }
      } else {
        // Lần đầu: đánh dấu tất cả đã "thấy" để không toast lại
        data.forEach(n => seenIdsRef.current.add(n.id))
      }

      setUnreadCount(computeUnread(data))
    } catch {
      // silent fail
    }
  }, [computeUnread])

  // Poll lần đầu (silent) rồi mỗi 30s
  useEffect(() => {
    poll(true)
    const timer = setInterval(() => poll(false), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [poll])

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Khi mở dropdown → đánh dấu đã đọc
  function handleOpen() {
    setOpen(v => {
      if (!v) {
        // Đánh dấu đã xem
        setLastSeenAt(new Date())
        setUnreadCount(0)
      }
      return !v
    })
  }

  // Xoá toàn bộ thông báo — chỉ lấy thông báo mới sau thời điểm này
  function handleClear() {
    const now = new Date()
    setClearedAt(now)
    setLastSeenAt(now)
    setNotifications([])
    setUnreadCount(0)
    seenIdsRef.current.clear()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="Thông báo đồng bộ từ bờ"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Thông báo từ bờ
            </span>
            {notifications.length > 0 && (
              <button
                onClick={handleClear}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Xoá tất cả thông báo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                Chưa có thông báo nào
              </p>
            ) : (
              notifications.map(n => (
                <NotificationItem key={n.id} notification={n} />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 text-center">
              Hiển thị {notifications.length} thông báo gần nhất
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-component: Notification Item ────────────────────────────────────────

function NotificationItem({ notification: n }: { notification: SyncNotification }) {
  const isCreate = n.action === 'CREW_CREATED_FROM_SHORE'
  const lastSeen = getLastSeenAt()
  const isUnread = lastSeen ? new Date(n.timestamp) > lastSeen : true

  let changedFields: string[] = []
  try {
    if (n.details) {
      const parsed = JSON.parse(n.details)
      if (Array.isArray(parsed.changedFields)) changedFields = parsed.changedFields
    }
  } catch { /* ignore */ }

  return (
    <div className={`px-4 py-3 ${isUnread ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">{isCreate ? '🆕' : '🔄'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800 dark:text-gray-100 font-medium leading-snug">
            {n.message}
          </p>
          {changedFields.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Thay đổi: {changedFields.join(' · ')}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            {format(new Date(n.timestamp), 'HH:mm dd/MM/yyyy')}
          </p>
        </div>
        {isUnread && (
          <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
        )}
      </div>
    </div>
  )
}
