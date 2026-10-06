import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { fieldClass } from './Input';

/*
  Ô nhập ngày luôn theo dạng dd/mm/yyyy.

  Ô <input type="date"> của trình duyệt hiển thị theo ngôn ngữ của máy: máy cài tiếng Anh
  (Mỹ) sẽ ra mm/dd/yyyy, nên "02/07/1980" đọc được hai cách. Ô này cho gõ dd/mm/yyyy (tự
  chèn dấu /), vẫn có nút mở lịch của trình duyệt.

  Giá trị vào/ra giữ đúng dạng yyyy-mm-dd như API đang dùng, nên dữ liệu không đổi.
*/

const toDisplay = (iso?: string | null) => {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const toIso = (display: string): string | null => {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(dd) || d.getMonth() + 1 !== Number(mm)) return null;
  return `${yyyy}-${mm}-${dd}`;
};

/** Gõ số tới đâu tự chèn dấu "/" tới đó: 0207 → 02/07, 02071980 → 02/07/1980. */
const mask = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

interface DateInputProps {
  /** yyyy-mm-dd (có thể kèm giờ "T..." — phần giờ bị bỏ qua). */
  value?: string | null;
  /** Trả yyyy-mm-dd, hoặc '' khi xóa trống. */
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const DateInput: React.FC<DateInputProps> = ({ value, onChange, id, disabled, className = '', ...rest }) => {
  const [text, setText] = useState(toDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Giá trị đổi từ bên ngoài (tải lại, Hủy sửa) thì hiển thị theo.
  useEffect(() => { setText(toDisplay(value)); setInvalid(false); }, [value]);

  const commit = (next: string) => {
    if (next === '') { setInvalid(false); onChange(''); return; }
    const iso = toIso(next);
    setInvalid(!iso);
    if (iso) onChange(iso);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-label={rest['aria-label']}
        onChange={e => {
          const next = mask(e.target.value);
          setText(next);
          if (next === '' || next.length === 10) commit(next);
        }}
        onBlur={() => commit(text)}
        className={`${fieldClass} pr-9 tabular-nums ${invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : ''}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Chọn ngày trên lịch"
        title="Chọn ngày trên lịch"
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          try { el.showPicker(); } catch { el.focus(); }
        }}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:bg-primary-soft hover:text-primary disabled:opacity-40"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* Lịch của trình duyệt, ẩn đi; chỉ dùng để chọn bằng chuột. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={(value ?? '').slice(0, 10)}
        onChange={e => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
      {invalid && <span className="mt-1 block text-xs text-danger">Ngày không hợp lệ (dd/mm/yyyy)</span>}
    </div>
  );
};
