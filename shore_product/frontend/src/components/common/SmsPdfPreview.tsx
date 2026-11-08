import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

const SmsPdfViewer = lazy(() => import('./SmsPdfViewer'));

export function pdfPreviewUrl(path: string): string {
  // Encode each segment once, including filenames already escaped by the API.
  const url = new URL(path.replace(/\\/g, '/'), window.location.origin);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Đường dẫn tài liệu không hợp lệ.');
  }
  url.pathname = url.pathname.split('/').map(segment => {
    try {
      return encodeURIComponent(decodeURIComponent(segment));
    } catch {
      return encodeURIComponent(segment);
    }
  }).join('/');
  url.hash = '';
  return url.toString();
}

export async function loadPreviewPdf(path: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(pdfPreviewUrl(path), { signal });
  if (response.status === 525 || response.status === 526) {
    throw new Error('Kết nối HTTPS tới máy chủ tài liệu gặp lỗi. Vui lòng thử lại sau.');
  }
  if (!response.ok) {
    throw new Error(response.status === 404
      ? 'Không tìm thấy file tài liệu trên máy chủ.'
      : `Không thể tải tài liệu (HTTP ${response.status}). Vui lòng thử lại.`);
  }
  const blob = await response.blob();
  // A proxy or login page can return HTML with HTTP 200. Never embed it as a PDF.
  if (!blob.type.toLowerCase().startsWith('application/pdf')
    || await blob.slice(0, 5).text() !== '%PDF-') {
    throw new Error('Máy chủ trả về nội dung không phải PDF. Vui lòng thử tải lại tài liệu.');
  }
  return blob;
}

interface Props {
  path: string;
  title: string;
  className?: string;
}

export function SmsPdfPreview({ path, title, className = '' }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ path: string; blob: Blob | null; error: string }>({ path: '', blob: null, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    setPreview({ path, blob: null, error: '' });
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);

    loadPreviewPdf(path, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      setPreview({ path, blob, error: '' });
    }).catch(error => {
      if (controller.signal.aborted && !timedOut) return;
      setPreview({ path, blob: null, error: timedOut
        ? 'Tải tài liệu quá thời gian chờ. Vui lòng kiểm tra kết nối và thử lại.'
        : error instanceof TypeError
          ? 'Không kết nối được máy chủ tài liệu. Vui lòng thử lại.'
          : error.message || 'Không thể tải tài liệu.' });
    }).finally(() => window.clearTimeout(timeout));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [path, attempt]);

  const current = preview.path === path ? preview : { blob: null, error: '' };
  return (
    <div className={`flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-900 ${className}`}>
      {current.blob ? (
        <Suspense fallback={<p role="status" className="p-6 text-center text-sm">Đang mở tài liệu…</p>}>
          <SmsPdfViewer key={`${path}-${attempt}`} blob={current.blob} title={title} />
        </Suspense>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role={current.error ? 'alert' : 'status'}>
          {current.error ? <AlertTriangle className="h-6 w-6 text-amber-600" /> : <Loader2 className="h-6 w-6 animate-spin text-accent" />}
          <p className="max-w-lg text-sm text-slate-650 dark:text-slate-300">
            {current.error || 'Đang tải bản xem trước tài liệu…'}
          </p>
          {current.error && (
            <button type="button" onClick={() => setAttempt(value => value + 1)}
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-200">
              <RefreshCw className="h-4 w-4" /> Tải lại tài liệu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
