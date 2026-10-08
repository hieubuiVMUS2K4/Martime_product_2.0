import { useState, useEffect, useCallback } from 'react'
import {
  X, Settings, Upload, Loader2, CheckCircle2, XCircle,
  Plug, ShieldCheck, History, RefreshCw, AlertTriangle
} from 'lucide-react'
import {
  provisioningService,
  type EdgeProvisioningStatus,
  type EdgeProvisioningHistoryItem,
} from '@/services/maritime.service'

interface ShoreConfigModalProps {
  onClose: () => void
}

export function ShoreConfigModal({ onClose }: ShoreConfigModalProps) {
  const [status, setStatus] = useState<EdgeProvisioningStatus | null>(null)
  const [history, setHistory] = useState<EdgeProvisioningHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [activatingId, setActivatingId] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [statusRes, historyRes] = await Promise.all([
        provisioningService.getStatus(),
        provisioningService.getHistory(),
      ])
      setStatus(statusRes)
      setHistory(historyRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được trạng thái cấu hình')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await provisioningService.import(file)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import gói cấu hình thất bại')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleTest = async (id: number) => {
    setTestingId(id)
    setTestResult(null)
    setError(null)
    try {
      const result = await provisioningService.testConnection(id)
      setTestResult({ id, success: result.success, message: result.message })
      await load()
    } catch (err) {
      setTestResult({ id, success: false, message: err instanceof Error ? err.message : 'Test thất bại' })
    } finally {
      setTestingId(null)
    }
  }

  const handleActivate = async (id: number) => {
    const item = history.find(h => h.id === id)
    if (item && item.handshakeStatus !== 'success') {
      const confirmed = window.confirm(
        '⚠ Chưa test kết nối thành công. Activate có thể làm mất kết nối sync.\n\nBạn có chắc chắn muốn tiếp tục?'
      )
      if (!confirmed) return
      const confirmedAgain = window.confirm('Xác nhận lần 2: Vẫn muốn Activate profile này?')
      if (!confirmedAgain) return
    }
    setActivatingId(id)
    setError(null)
    try {
      // Gói của tàu khác: máy tàu chỉ giữ dữ liệu của MỘT tàu → xoá sạch dữ liệu tàu cũ, nhận lại từ bờ.
      const check = await provisioningService.switchCheck(id)
      let confirmReset = false
      if (check.requiresReset) {
        const current = check.currentVesselName
          ? `${check.currentVesselName} (IMO ${check.currentVesselImo ?? '—'})`
          : 'dữ liệu hiện có trên máy'
        const pending = check.pendingUploads > 0
          ? `

⚠ Còn ${check.pendingUploads} thay đổi CHƯA gửi lên bờ — sẽ mất vĩnh viễn.`
          : ''
        const typed = window.prompt(
          `ĐỔI TÀU: ${current} → ${check.newVesselName} (IMO ${check.newVesselImo}).

` +
          'Toàn bộ dữ liệu của tàu hiện tại (thuyền viên, chuyến đi, PMS, vật tư, báo cáo, nhật ký...) sẽ bị XOÁ, ' +
          'sau đó tàu nhận lại toàn bộ dữ liệu của tàu mới từ bờ. Danh mục dùng chung và tài khoản quản trị được giữ.' +
          pending + `

Gõ IMO của tàu mới (${check.newVesselImo}) để xác nhận:`
        )
        if (typed === null) return
        if (typed.trim() !== (check.newVesselImo ?? '').trim()) {
          setError('IMO không khớp — chưa kích hoạt, dữ liệu giữ nguyên.')
          return
        }
        confirmReset = true
      }
      const result = await provisioningService.activate(id, confirmReset)
      if (result.reset) {
        setTestResult({
          id, success: result.fullSyncRequested,
          message: result.fullSyncRequested
            ? `Đã đổi tàu: xoá ${result.wipedRows} dòng dữ liệu cũ, đang nhận dữ liệu tàu mới từ bờ.`
            : `Đã đổi tàu và xoá ${result.wipedRows} dòng dữ liệu cũ. Bờ chưa trả lời — tàu sẽ tự xin lại dữ liệu khi có kết nối.`,
        })
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activate thất bại')
    } finally {
      setActivatingId(null)
    }
  }

  const [resetting, setResetting] = useState(false)
  const handleReset = async () => {
    if (!status?.vesselImo) return
    const typed = window.prompt(
      `Làm sạch tàu ${status.vesselName} (IMO ${status.vesselImo}).

` +
      'Toàn bộ dữ liệu trên máy tàu sẽ bị XOÁ (thay đổi chưa gửi lên bờ cũng mất), sau đó nhận lại toàn bộ dữ liệu của tàu từ bờ. ' +
      `Danh mục dùng chung và tài khoản quản trị được giữ.

Gõ IMO ${status.vesselImo} để xác nhận:`
    )
    if (typed === null) return
    setResetting(true)
    setError(null)
    try {
      const r = await provisioningService.resetFromShore(typed.trim())
      setTestResult({
        id: -1, success: r.fullSyncRequested,
        message: r.fullSyncRequested
          ? `Đã xoá ${r.wipedRows} dòng, đang nhận lại dữ liệu từ bờ.`
          : `Đã xoá ${r.wipedRows} dòng. Bờ chưa trả lời — tàu sẽ tự xin lại dữ liệu khi có kết nối.`,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Làm sạch thất bại')
    } finally {
      setResetting(false)
    }
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const isFailed = (handshakeStatus?: string) => handshakeStatus?.toLowerCase() === 'failed'
  const activeProfileNeedsReimport = status?.isActive && isFailed(status.handshakeStatus)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl mx-3 max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sticky top-0 z-10">
          <div className="flex min-w-0 items-center gap-2 text-gray-900">
            <Settings className="w-5 h-5" />
            <span className="text-sm font-semibold">Cấu hình kết nối bờ</span>
          </div>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Current status */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Trạng thái hiện tại
                </h3>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
                  {status?.isActive ? (
                    <div className="space-y-3">
                      {activeProfileNeedsReimport && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="font-medium">Profile đang dùng không còn hợp lệ. Hãy tải Provisioning Package mới từ Shore rồi import lại.</div>
                            {status.lastHandshakeError && (
                              <div className="text-xs mt-1 text-red-600">{status.lastHandshakeError}</div>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-gray-500">Node ID:</span> <span className="font-medium">{status.nodeId}</span></div>
                        <div><span className="text-gray-500">Tàu:</span> <span className="font-medium">{status.vesselName} (IMO {status.vesselImo})</span></div>
                        <div><span className="text-gray-500">Shore URL:</span> <span className="font-medium">{status.shoreUrl}</span></div>
                        <div className="col-span-2 break-all"><span className="text-gray-500">Shore Vessel ID:</span> <span className="font-medium">{status.shoreVesselId}</span></div>
                        <div><span className="text-gray-500">Handshake:</span> <span className={`font-medium ${activeProfileNeedsReimport ? 'text-red-600' : ''}`}>{status.handshakeStatus ?? '—'}</span></div>
                        <div><span className="text-gray-500">Lần cuối:</span> <span className="font-medium">{formatTime(status.lastHandshake)}</span></div>
                      </div>
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-500">Dữ liệu tàu lệch bờ? Xoá dữ liệu tàu và nhận lại toàn bộ từ bờ.</span>
                        <button type="button" onClick={handleReset} disabled={resetting}
                          className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">
                          {resetting ? 'Đang làm sạch…' : 'Làm sạch & nhận lại từ bờ'}
                        </button>
                      </div>
                      {testResult?.id === -1 && (
                        <div className={`text-xs ${testResult.success ? 'text-green-700' : 'text-amber-700'}`}>{testResult.message}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Chưa có cấu hình đang hoạt động (Legacy/Chưa cấu hình)
                    </span>
                  )}
                </div>
              </section>

              {/* Upload */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  Import gói cấu hình mới
                </h3>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-600">Đang tải lên...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">Chọn file .zip hoặc .json (Provisioning Package)</span>
                    </>
                  )}
                  <input type="file" accept=".zip,.json" className="hidden" disabled={uploading} onChange={handleFileChange} />
                </label>
              </section>

              {/* History / Test / Activate */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-600" />
                    Lịch sử cấu hình
                  </h3>
                  <button onClick={load} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Làm mới
                  </button>
                </div>

                {history.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-6">Chưa có gói cấu hình nào được import.</div>
                ) : (
                  <div className="space-y-2">
                    {history.map(item => (
                      <div key={item.id} className={`border rounded-xl p-3 text-sm ${item.isActive ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{item.vesselName}</span>{' '}
                            <span className="text-gray-400">({item.nodeId})</span>
                            {item.isActive && !isFailed(item.handshakeStatus) && (
                              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">ĐANG DÙNG</span>
                            )}
                            {item.isActive && isFailed(item.handshakeStatus) && (
                              <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">CẦN IMPORT LẠI</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{formatTime(item.importedAt)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Shore: {item.shoreBaseUrl} · Key v{item.keyVersion} · Handshake: {item.handshakeStatus ?? 'never'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 break-all">
                          IMO: {item.vesselImo} · Shore Vessel ID: {item.shoreVesselId}
                        </div>
                        {item.isActive && isFailed(item.handshakeStatus) && item.lastHandshakeError && (
                          <div className="mt-2 text-xs text-red-600 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            {item.lastHandshakeError}
                          </div>
                        )}

                        {testResult?.id === item.id && (
                          <div className={`mt-2 text-xs flex items-center gap-1 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                            {testResult.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {testResult.message}
                          </div>
                        )}

                        {!item.isActive && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleTest(item.id)}
                              disabled={testingId === item.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              {testingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
                              Test kết nối
                            </button>
                            <button
                              onClick={() => handleActivate(item.id)}
                              disabled={activatingId === item.id || item.handshakeStatus !== 'success'}
                              title={item.handshakeStatus === 'success' ? 'Activate profile' : 'Test Connection thành công trước khi Activate'}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                            >
                              {activatingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                              Activate
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
