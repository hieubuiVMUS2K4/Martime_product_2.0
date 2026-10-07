import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, MapPin } from 'lucide-react';
import { portApi } from '../../services/crew.service';
import type { Port } from '../../services/crew.service';

interface Props {
  portName: string;
  portCode: string;
  onChange: (portName: string, portCode: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Ô chọn cảng có tìm kiếm — đọc từ danh mục cảng của bờ (/api/ports).
 *
 * Việc lọc do server làm nên không phải tải hết danh sách về máy. Vẫn cho gõ tự do
 * và giữ nguyên giá trị: hồ sơ cũ có thể ghi cảng không nằm trong danh mục.
 */
export const PortCombobox: React.FC<Props> = ({
  portName, portCode, onChange, label, placeholder, required, disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Port[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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
      const res = await portApi.search({ search: q || undefined, isActive: true, pageSize: 20 });
      setResults(res.data ?? []);
    } catch {
      setResults([]); // API lỗi thì vẫn cho nhập tay
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { search(term); }, 250);
    return () => clearTimeout(t);
  }, [term, open, search]);

  const display = portName ? (portCode ? `${portName} (${portCode})` : portName) : '';

  return (
    <div className="relative" ref={boxRef}>
      {label && (
        <span className="text-xs font-semibold text-gray-600">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}

      <div className="relative mt-1">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={open ? term : display}
          onChange={e => { setTerm(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setTerm(''); }}
          placeholder={placeholder ?? 'Tìm theo tên cảng, mã hoặc quốc gia...'}
          disabled={disabled}
          className="w-full border border-gray-300 rounded pl-7 pr-7 py-1.5 text-sm disabled:bg-gray-50"
        />
        {portName && !disabled && (
          <button type="button" onClick={() => { onChange('', ''); setTerm(''); }} title="Xoá cảng đã chọn"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100">
            <X size={13} className="text-gray-400" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
              <Loader2 size={13} className="animate-spin" /> Đang tìm...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500">
              {term ? (
                <>
                  Không thấy cảng nào khớp.
                  <button type="button"
                    onClick={() => { onChange(term, ''); setOpen(false); }}
                    className="ml-1 text-accent hover:underline font-medium">
                    Dùng "{term}"
                  </button>
                </>
              ) : 'Gõ để tìm cảng'}
            </div>
          ) : (
            results.map(p => (
              <button key={p.id} type="button"
                onClick={() => { onChange(p.portName, p.portCode); setOpen(false); setTerm(''); }}
                className="w-full text-left px-3 py-2 hover:bg-teal-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                <MapPin size={13} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 truncate">{p.portName}</div>
                  <div className="text-[10px] text-gray-400 font-mono">
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
