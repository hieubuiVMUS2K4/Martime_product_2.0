import { toast } from 'sonner'

export function getSigningErrorMessage(error: unknown, fallback = 'Không thể ký xác nhận. Vui lòng thử lại.'): string {
  const failure = error as { message?: unknown; response?: { data?: { message?: unknown; error?: unknown } } } | null
  const messages = [failure?.response?.data?.message, failure?.response?.data?.error, failure?.message]
  const message = messages.find((message): message is string => typeof message === 'string' && Boolean(message.trim())) || fallback
  if (message === 'Request timeout') return 'Yêu cầu ký hết thời gian chờ. Vui lòng kiểm tra trạng thái hồ sơ trước khi thử lại.'
  if (['Failed to fetch', 'Network Error', 'Network request failed'].includes(message)) return 'Không thể kết nối đến máy chủ để ký xác nhận. Vui lòng kiểm tra kết nối và thử lại.'
  return message
}

export function isSigningCancelled(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'ApprovalCancelledError'
}

export function reportSigningError(error: unknown, fallback?: string): void {
  const message = getSigningErrorMessage(error, fallback)
  if (isSigningCancelled(error)) toast.info(message)
  else toast.error(message)
}
