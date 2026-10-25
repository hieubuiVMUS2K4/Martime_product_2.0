import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Bring general errors into view, including errors without a matching form field. */
export function ReportFormError({ error }: { error: string | null }) {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;

    const frame = requestAnimationFrame(() => {
      const alert = alertRef.current;
      if (!alert) return;

      alert.focus({ preventScroll: true });
      alert.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [error]);

  if (!error) return null;

  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">Error</p>
        <p className="break-words whitespace-pre-wrap text-sm">{error}</p>
      </div>
    </div>
  );
}
