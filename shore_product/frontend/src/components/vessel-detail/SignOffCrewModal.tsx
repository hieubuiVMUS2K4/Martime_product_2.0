import React, { useState } from 'react';
import { X, LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import { crewApi } from '../../services/crew.service';
import { PortCombobox } from '../common/PortCombobox';
import type { CrewMember } from '../../types/crew.types';

interface Props {
  crew: CrewMember;
  vesselName: string;
  onClose: () => void;
  onDone: () => void;
}

/** Lý do rời tàu theo nghiệp vụ hàng hải. */
const REASONS = [
  'Hết hợp đồng',
  'Kết thúc chuyến đi',
  'Lý do sức khoẻ',
  'Việc gia đình',
  'Kỷ luật',
  'Theo yêu cầu công ty',
  'Khác',
];

const CONDUCTS = ['Tốt / Good', 'Khá / Fair', 'Trung bình / Average', 'Kém / Poor'];

/**
 * Cho thuyền viên xuống tàu từ bờ.
 *
 * Đây KHÔNG phải "gỡ khỏi tàu" đơn thuần: nó đóng kỳ phục vụ trong sổ thuyền viên —
 * điền ngày, cảng, lý do và hạnh kiểm. Kỳ đã đóng là một mục lý lịch đi biển hoàn chỉnh
 * và không mở lại được, nên form buộc nhập đủ trước khi cho bấm.
 */
export const SignOffCrewModal: React.FC<Props> = ({ crew, vesselName, onClose, onDone }) => {
  const [signOffDate, setSignOffDate] = useState(new Date().toISOString().split('T')[0]);
  const [portName, setPortName] = useState('');
  const [portCode, setPortCode] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [conduct, setConduct] = useState(CONDUCTS[0]);
  const [remarks, setRemarks] = useState('');
  const [signedOffBy, setSignedOffBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await crewApi.signOffFromVessel(crew.id, {
        signOffDate: new Date(signOffDate).toISOString(),
        portCode: portCode || undefined,
        portName: portName || undefined,
        reason,
        conduct,
        remarks: remarks || undefined,
        signedOffBy: signedOffBy || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cho xuống tàu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-modal p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <LogOut size={16} className="text-rose-600" />
            <h2 className="font-bold text-gray-800">Cho thuyền viên xuống tàu</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-b border-gray-200 text-sm">
          <div className="font-semibold text-gray-800">{crew.fullName}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {crew.crewId} · {crew.rankName ?? '—'} · đang trên tàu <strong>{vesselName}</strong>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Ngày rời tàu <span className="text-red-500">*</span></span>
              <input
                type="date" required value={signOffDate}
                onChange={e => setSignOffDate(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Lý do <span className="text-red-500">*</span></span>
              <select
                required value={reason} onChange={e => setReason(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white"
              >
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>

          <PortCombobox
            label="Cảng rời tàu"
            portName={portName}
            portCode={portCode}
            onChange={(name, code) => { setPortName(name); setPortCode(code); }}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Hạnh kiểm</span>
              <select
                value={conduct} onChange={e => setConduct(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white"
              >
                {CONDUCTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Người quyết định</span>
              <input
                value={signedOffBy} onChange={e => setSignedOffBy(e.target.value)}
                placeholder="Tên cán bộ nhân sự"
                className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Ghi chú</span>
            <textarea
              value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
              className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            />
          </label>

          <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Kỳ phục vụ trên tàu <strong>{vesselName}</strong> sẽ được đóng lại và ghi vĩnh viễn vào
            sổ thuyền viên. Thuyền viên trở về danh bạ chung và có thể gán lên tàu khác.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-3.5 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">
              Hủy
            </button>
            <button type="submit" disabled={saving}
              className="px-3.5 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 inline-flex items-center gap-1.5">
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Đang xử lý...' : 'Xác nhận cho xuống tàu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
