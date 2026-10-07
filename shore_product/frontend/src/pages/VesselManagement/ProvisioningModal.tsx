import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Loader2, Download, Key, ShieldCheck, RefreshCw } from 'lucide-react';
import { ENV } from '../../config/env';
import { buildAuthHeaders } from '../../services/api.client';
import { useConfirm } from '@/components/common/ConfirmDialog';
// Hộp thoại này vẫn dùng khung .vp-* cũ; trang danh sách tàu đã chuyển sang Tailwind.
import './VesselsPage.css';

const BASE = ENV.API_BASE_URL;

function parseDownloadFileName(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(disposition);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const plainMatch = /filename=([^;]+)/i.exec(disposition);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim().replace(/^"|"$/g, '');
  }

  return fallback;
}

interface ProvisioningModalProps {
  vesselId: string;
  vesselName: string;
  imo: string;
  provisioningStatus?: string;
  onChanged?: () => void;
  onClose: () => void;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

const STATUS_LABELS: Record<string, string> = {
  Unknown: 'Chưa tạo secrets',
  Provisioned: 'Đã tạo secrets, chờ tải package',
  Downloaded: 'Đã tải package, tàu cần import lại',
  PendingFirstContact: 'Đang chờ Edge liên hệ',
  Registered: 'Edge đã đăng ký',
  Active: 'Đang hoạt động',
  Revoked: 'Đã thu hồi',
  Disabled: 'Đã vô hiệu hóa',
};

const STATUS_HINTS: Record<string, string> = {
  Provisioned: 'Bước tiếp theo: tải Provisioning Package rồi import vào Edge.',
  Downloaded: 'Bước tiếp theo: import package mới vào Edge, Test Connection, rồi Activate.',
  PendingFirstContact: 'Edge đã activate profile, đang chờ lần liên hệ/sync đầu tiên.',
  Registered: 'Edge đã xác thực thành công với Shore.',
  Active: 'Profile đang hợp lệ. Chỉ rotate key khi cần cấp lại secrets.',
};

export const ProvisioningModal: React.FC<ProvisioningModalProps> = ({ vesselId, vesselName, imo, provisioningStatus, onChanged, onClose }) => {
  const ask = useConfirm();
  const [provisionState, setProvisionState] = useState<ActionState>('idle');
  const [rotateState, setRotateState] = useState<ActionState>('idle');
  const [downloadState, setDownloadState] = useState<ActionState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [lastNodeId, setLastNodeId] = useState<string | null>(null);
  const [lastKeyVersion, setLastKeyVersion] = useState<number | null>(null);
  const [currentStatus, setCurrentStatus] = useState(provisioningStatus ?? 'Unknown');

  useEffect(() => {
    setCurrentStatus(provisioningStatus ?? 'Unknown');
  }, [provisioningStatus]);

  const hasSecrets = !['Unknown', 'Revoked', 'Disabled'].includes(currentStatus);
  const isBusy = provisionState === 'loading' || rotateState === 'loading' || downloadState === 'loading';
  const canProvision = !hasSecrets && provisionState !== 'loading';
  const canExportSecrets = hasSecrets;
  const statusLabel = STATUS_LABELS[currentStatus] ?? currentStatus;
  const statusHint = STATUS_HINTS[currentStatus];

  const handleProvision = async () => {
    setProvisionState('loading'); setMessage(null);
    try {
      const res = await fetch(`${BASE}/vessels/${vesselId}/provision`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLastNodeId(data.nodeId);
      setLastKeyVersion(data.keyVersion);
      setCurrentStatus(data.status ?? 'Provisioned');
      setMessage(data.message ?? 'Secrets đã được sinh thành công.');
      setProvisionState('success');
      onChanged?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Provision thất bại');
      setProvisionState('error');
    }
  };

  const handleRotate = async () => {
    const confirmed = await ask(
      'Sau khi đổi khóa, tàu phải nhập lại tệp cấu hình. Nếu đang bắt buộc xác thực token/HMAC, đồng bộ sẽ lỗi ngay cho tới khi tàu nhập lại. Tiếp tục?',
      { title: 'Đổi khóa kết nối', confirmLabel: 'Đổi khóa', variant: 'warning' }
    );
    if (!confirmed) return;
    setRotateState('loading'); setMessage(null);
    try {
      const res = await fetch(`${BASE}/vessels/${vesselId}/provision/rotate`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLastNodeId(data.nodeId);
      setLastKeyVersion(data.newKeyVersion);
      setCurrentStatus(data.status ?? 'Downloaded');
      setMessage(data.message ?? 'Key mới đã được sinh.');
      setRotateState('success');
      onChanged?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Rotate key thất bại');
      setRotateState('error');
    }
  };

  const handleDownload = async () => {
    setDownloadState('loading'); setMessage(null);
    try {
      const res = await fetch(`${BASE}/vessels/${vesselId}/provisioning-package`, {
        headers: buildAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const fileName = parseDownloadFileName(disposition, `edge-provisioning-${imo}.zip`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      setCurrentStatus(prev => (prev === 'Provisioned' ? 'Downloaded' : prev));
      setDownloadState('success');
      onChanged?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Tải Provisioning Package thất bại');
      setDownloadState('error');
    }
  };

  return (
    <div className="vp-overlay" onClick={onClose}>
      <div className="vp-modal" onClick={e => e.stopPropagation()}>
        <div className="vp-modal-head">
          <h2>Cấu hình kết nối Edge — {vesselName}</h2>
          <button className="vp-icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {message && (
            <div className="vp-form-error" style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}>
              {message}
            </div>
          )}

          <div className={`vp-provision-profile ${hasSecrets ? 'vp-provision-profile--ready' : 'vp-provision-profile--empty'}`}>
            <div className="vp-provision-profile__head">
              <ShieldCheck size={15} />
              <span>Hồ sơ cấu hình hiện tại</span>
            </div>
            <div className="vp-provision-profile__grid">
              <span>Trạng thái</span>
              <strong>{statusLabel}</strong>
              {lastNodeId && (
                <>
                  <span>Node ID</span>
                  <strong>{lastNodeId}</strong>
                </>
              )}
              {lastKeyVersion != null && (
                <>
                  <span>Key version</span>
                  <strong>v{lastKeyVersion}</strong>
                </>
              )}
            </div>
            {statusHint && <div className="vp-provision-profile__hint">{statusHint}</div>}
            {!hasSecrets && <div className="vp-provision-profile__hint">Bấm Generate Secrets để tạo token/key đầu tiên cho Edge.</div>}
          </div>

          <button
            className="vp-btn vp-btn--primary"
            onClick={handleProvision}
            disabled={!canProvision || isBusy}
            style={{ justifyContent: 'flex-start' }}
            title={hasSecrets ? 'Secrets đã được tạo. Hãy tải package hoặc rotate key nếu cần.' : undefined}
          >
            {provisionState === 'loading' ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            Generate Secrets (Provision)
          </button>

          <button
            className="vp-btn"
            onClick={handleDownload}
            disabled={!canExportSecrets || isBusy}
            style={{ justifyContent: 'flex-start' }}
            title={!canExportSecrets ? 'Cần Generate Secrets trước khi tải package.' : undefined}
          >
            {downloadState === 'loading' ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            Tải Provisioning Package (.zip)
          </button>

          <button
            className="vp-btn vp-btn--danger"
            onClick={handleRotate}
            disabled={!canExportSecrets || isBusy}
            style={{ justifyContent: 'flex-start' }}
            title={!canExportSecrets ? 'Cần Generate Secrets trước khi rotate key.' : undefined}
          >
            {rotateState === 'loading' ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
            Rotate Key
          </button>

          <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Sau khi Provision hoặc Rotate, tải Provisioning Package và import vào Edge UI
              (⚙ Cấu hình kết nối bờ trên tàu), sau đó Test Connection trước khi Activate.
            </span>
          </div>
        </div>

        <div className="vp-form-footer">
          <button className="vp-btn" onClick={onClose}>
            <RefreshCw size={12} /> Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
