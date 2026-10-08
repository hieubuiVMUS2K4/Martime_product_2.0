import React from 'react';
import { Cog } from 'lucide-react';
import type { EquipmentAsset } from '../../types/pms.types';
import { Button, Modal } from '../common';

interface ViewAssetModalProps {
  isOpen: boolean;
  asset: EquipmentAsset | null;
  onClose: () => void;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'bg-emerald-50 text-emerald-700' },
  STANDBY: { label: 'Chờ sẵn', tone: 'bg-sky-50 text-sky-700' },
  UNDER_MAINTENANCE: { label: 'Đang bảo trì', tone: 'bg-amber-50 text-amber-700' },
  DECOMMISSIONED: { label: 'Ngừng sử dụng', tone: 'bg-slate-100 text-slate-600' },
  IN_STORAGE: { label: 'Trong kho', tone: 'bg-violet-50 text-violet-700' },
};

const CRITICALITY: Record<string, { label: string; tone: string }> = {
  CRITICAL: { label: 'Rất quan trọng', tone: 'bg-red-50 text-red-700' },
  HIGH: { label: 'Cao', tone: 'bg-orange-50 text-orange-700' },
  MEDIUM: { label: 'Trung bình', tone: 'bg-amber-50 text-amber-700' },
  LOW: { label: 'Thấp', tone: 'bg-slate-100 text-slate-600' },
};

const Pill: React.FC<{ map: Record<string, { label: string; tone: string }>; value?: string }> = ({ map, value }) => {
  if (!value) return <span className="text-ink-light">—</span>;
  const m = map[value] ?? { label: value, tone: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${m.tone}`}>{m.label}</span>;
};

const Item: React.FC<{ label: string; children?: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="min-w-0">
    <dt className="text-sm font-semibold text-ink-muted">{label}</dt>
    <dd className={`mt-0.5 break-words text-base font-semibold ${children ? 'text-ink' : 'text-ink-light'} ${mono ? 'font-mono' : ''}`}>{children || '—'}</dd>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h3 className="mb-2.5 border-b border-grid-strong pb-1.5 text-base font-bold uppercase tracking-wide text-primary">{title}</h3>
    {children}
  </section>
);

/** Thông số kỹ thuật lưu dạng JSON → danh sách khóa/giá trị; không phải JSON thì hiện nguyên văn. */
function parseSpecs(raw?: string): [string, string][] | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.entries(obj).map(([k, v]) => [k, String(v)]);
  } catch { /* không phải JSON */ }
  return null;
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : null);

export default function ViewAssetModal({ isOpen, asset, onClose }: ViewAssetModalProps) {
  const specs = parseSpecs(asset?.technicalSpecs);

  return (
    <Modal
      isOpen={isOpen && !!asset}
      onClose={onClose}
      size="xl"
      icon={<Cog />}
      title="Chi tiết thiết bị"
      subtitle={asset ? <><span className="font-mono">{asset.assetCode}</span> — {asset.assetName}</> : undefined}
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}
    >
      {asset && (
        <div className="space-y-5">
          <Section title="Thông tin chung">
            <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
              <Item label="Mã thiết bị" mono>{asset.assetCode}</Item>
              <Item label="Tên thiết bị">{asset.assetName}</Item>
              <Item label="Nhóm">{asset.category}</Item>
              <Item label="Vị trí">{asset.location}</Item>
              <Item label="Trạng thái"><Pill map={STATUS} value={asset.status} /></Item>
              <Item label="Sử dụng">
                <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${asset.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {asset.isActive ? 'Đang dùng' : 'Không dùng'}
                </span>
              </Item>
            </dl>
          </Section>

          <Section title="Thông số kỹ thuật">
            <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
              <Item label="Hãng sản xuất">{asset.manufacturer && asset.manufacturer !== 'N/A' ? asset.manufacturer : null}</Item>
              <Item label="Model">{asset.model}</Item>
              <Item label="Số sê-ri" mono>{asset.serialNumber && asset.serialNumber !== 'N/A' ? asset.serialNumber : null}</Item>
              <Item label="Mức độ quan trọng"><Pill map={CRITICALITY} value={asset.criticality} /></Item>
              <Item label="Ngày lắp đặt">{fmtDate(asset.installationDate)}</Item>
            </dl>
            {asset.technicalSpecs && (
              <div className="mt-3">
                <p className="mb-1.5 text-sm font-semibold text-ink-muted">Thông số chi tiết</p>
                {specs ? (
                  <dl className="divide-y divide-grid rounded-md border border-grid">
                    {specs.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-3.5 py-2 text-base">
                        <dt className="font-mono font-semibold text-ink-muted">{k}</dt>
                        <dd className="text-right font-semibold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="whitespace-pre-wrap rounded-md border border-grid bg-canvas px-3.5 py-2.5 text-base text-ink">{asset.technicalSpecs}</p>
                )}
              </div>
            )}
          </Section>

          <Section title="Giờ chạy máy">
            <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
              <Item label="Giờ chạy hiện tại">
                <span className="font-semibold tabular-nums">{(asset.currentRunningHours ?? 0).toLocaleString('vi-VN')} giờ</span>
              </Item>
              <Item label="Cập nhật lần cuối">
                {asset.lastRunningHoursUpdate ? new Date(asset.lastRunningHoursUpdate).toLocaleString('vi-VN') : null}
              </Item>
            </dl>
          </Section>

          <Section title="Phân công">
            <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
              <Item label="Người thực hiện mặc định">{asset.defaultExecutorRole}</Item>
              <Item label="Người duyệt">{asset.approverRole}</Item>
              <Item label="Nhóm thiết bị" mono>{asset.equipmentGroupId}</Item>
            </dl>
          </Section>

          {asset.notes && (
            <Section title="Ghi chú">
              <p className="whitespace-pre-wrap text-base text-ink">{asset.notes}</p>
            </Section>
          )}
        </div>
      )}
    </Modal>
  );
}
