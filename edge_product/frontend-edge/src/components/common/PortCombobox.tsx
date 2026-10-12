import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, MapPin } from 'lucide-react';
import { voyageMgmtService } from '../../services/voyage.service';
import type { Port } from '@/types/voyage.types';

interface Props {
  /** Tên cảng đang chọn */
  portName: string;
  /** Mã UN/LOCODE đang chọn */
  portCode: string;
  onChange: (portName: string, portCode: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Ô chọn cảng có tìm kiếm.
 *
 * Gõ để lọc theo tên cảng, mã UN/LOCODE hoặc quốc gia — việc lọc do server làm
 * (GET /api/ports?search=) nên không phải tải hết danh sách về máy.
 *
 * Vẫn cho phép gõ tự do và giữ nguyên giá trị: hồ sơ cũ có thể ghi cảng không nằm
 * trong danh mục, không được ép người dùng phải chọn từ danh sách.
 */
export const PortCombobox: React.FC<Props> = ({
  portName, portCode, onChange, label, placeholder, required, disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Port[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Đóng khi bấm ra ngoài
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await voyageMgmtService.ports.search({ search: q || undefined, isActive: true, pageSize: 20 });
      setResults(res.data ?? []);
    } catch {
      setResults([]); // không chặn nhập tay nếu API lỗi
    } finally {
      setLoading(false);
    }
  }, []);

  // Hoãn 250ms để không bắn request theo từng phím gõ
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { search(term); }, 250);
    return () => clearTimeout(t);
  }, [term, open, search]);

  const pick = (p: Port) => {
    onChange(p.portName, p.portCode);
    setOpen(false);
    setTerm('');
  };

  const clear = () => {
    onChange('', '');
    setTerm('');
  };

  const display = portName
    ? (portCode ? `${portName} (${portCode})` : portName)
    : '';

  return (
    <div className="relative" ref={boxRef}>
      {label && (
        <span className="text-xs font-semibold text-slate-600">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}

      <div className="relative mt-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={open ? term : display}
          onChange={e => { setTerm(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setTerm(''); }}
          placeholder={placeholder ?? 'Tìm theo tên cảng, mã hoặc quốc gia...'}
          disabled={disabled}
          required={required && !portName}
          className="w-full border border-slate-300 rounded pl-7 pr-7 py-1.5 text-sm disabled:bg-slate-50"
        />
        {portName && !disabled && (
          <button type="button" onClick={clear} title="Xoá cảng đã chọn"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tìm...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">
              {term ? (
                <>
                  Không thấy cảng nào khớp.
                  <button type="button"
                    onClick={() => { onChange(term, ''); setOpen(false); }}
                    className="ml-1 text-blue-600 hover:underline font-medium">
                    Dùng "{term}"
                  </button>
                </>
              ) : 'Gõ để tìm cảng'}
            </div>
          ) : (
            results.map(p => (
              <button key={p.id} type="button" onClick={() => pick(p)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 border-b border-slate-50 last:border-0">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-slate-800 truncate">{p.portName}</div>
                  <div className="text-xs text-slate-400 font-mono">
                    {p.portCode}{p.country ? ` · ${p.country}` : ''}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
