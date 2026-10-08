import React, { useId } from 'react';

/*
  Ô nhập liệu dùng chung: nhãn, ô, gợi ý, lỗi theo một kiểu duy nhất.

  `Field` bọc bất kỳ ô nào (kể cả combobox tự viết) để có nhãn/lỗi giống nhau;
  `Input`, `Select`, `Textarea` là bản có sẵn Field bên trong.
  Muốn chỉ lấy kiểu ô mà không cần nhãn thì dùng hằng `fieldClass`.
*/

export const fieldClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-light ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
  'disabled:cursor-not-allowed disabled:bg-primary-soft disabled:text-ink-muted';

const errorClass = 'border-danger focus:border-danger focus:ring-danger/20';

interface FieldProps {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, required, hint, error, htmlFor, className = '', children }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
    )}
    {children}
    {error ? (
      <span className="text-xs text-danger" role="alert">{error}</span>
    ) : hint ? (
      <span className="text-xs text-ink-muted">{hint}</span>
    ) : null}
  </div>
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label, error, hint, fullWidth = false, className = '', id, required, ...props
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={inputId} className={fullWidth ? 'w-full' : ''}>
      <input
        id={inputId}
        required={required}
        aria-invalid={!!error || undefined}
        className={`${fieldClass} ${error ? errorClass : ''} ${className}`}
        {...props}
      />
    </Field>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  fullWidth?: boolean;
  options: Array<{ value: string | number; label: string }>;
  /** Dòng đầu không chọn gì, ví dụ "-- Chọn tàu --". */
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  label, error, hint, fullWidth = false, options, placeholder, className = '', id, required, ...props
}) => {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={selectId} className={fullWidth ? 'w-full' : ''}>
      <select
        id={selectId}
        required={required}
        aria-invalid={!!error || undefined}
        className={`${fieldClass} ${error ? errorClass : ''} ${className}`}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
};

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
}

export const Textarea: React.FC<TextareaProps> = ({
  label, error, hint, className = '', id, required, rows = 3, ...props
}) => {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={areaId}>
      <textarea
        id={areaId}
        rows={rows}
        required={required}
        aria-invalid={!!error || undefined}
        className={`${fieldClass} ${error ? errorClass : ''} ${className}`}
        {...props}
      />
    </Field>
  );
};
