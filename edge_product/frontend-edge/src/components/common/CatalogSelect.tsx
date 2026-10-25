import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

interface CatalogSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly string[];
}

/** Standard choices while preserving saved values from older records. */
export const CatalogSelect = forwardRef<HTMLSelectElement, CatalogSelectProps>(
  function CatalogSelect({ options, value, ...props }, ref) {
    const current = String(value ?? '');
    return <select {...props} ref={ref} value={current}>
      <option value="">? Ch?n ?</option>
      {current && !options.includes(current) && <option value={current}>{current}</option>}
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
);
