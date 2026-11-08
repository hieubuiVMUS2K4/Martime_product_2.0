import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

function PdfPage({ document, page, width, title }: { document: PDFDocumentProxy; page: number; width: number; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    setError('');
    setRendering(true);

    document.getPage(page).then(async pdfPage => {
      if (cancelled) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: width / original.width });
      const resolution = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * resolution);
      canvas.height = Math.ceil(viewport.height * resolution);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = pdfPage.render({
        canvas,
        viewport,
        transform: [resolution, 0, 0, resolution, 0, 0],
      });
      await renderTask.promise;
      if (!cancelled) setRendering(false);
    }).catch(() => {
      if (!cancelled) {
        setRendering(false);
        setError('Không thể hiển thị trang tài liệu. Vui lòng tải lại.');
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, page, width]);

  return (
    <div className="relative mx-auto w-fit">
      {rendering && <p role="status" className="p-3 text-center text-sm">Đang hiển thị trang {page}…</p>}
      {error && <p role="alert" className="p-3 text-center text-sm text-rose-600">{error}</p>}
      <canvas ref={canvasRef} role="img" aria-label={`${title} — Trang ${page}`}
        className="bg-white shadow-sm" />
    </div>
  );
}

export default function SmsPdfViewer({ blob, title }: { blob: Blob; title: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, Math.floor(entry.contentRect.width - 32))));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | undefined;
    setDocument(null);
    setError('');
    setPage(1);
    blob.arrayBuffer().then(data => {
      if (cancelled) return;
      loadingTask = getDocument({ data, useSystemFonts: true, isEvalSupported: false });
      return loadingTask.promise.then(pdf => {
        if (!cancelled) setDocument(pdf);
      });
    }).catch(() => {
      if (!cancelled) setError('Không đọc được nội dung PDF. Vui lòng kiểm tra tài liệu hoặc thử lại.');
    });
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [blob, attempt]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-850">
        <span aria-live="polite">{document ? `Trang ${page} / ${document.numPages}` : 'Bản xem trước tài liệu'}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Trang trước" disabled={!document || page <= 1}
            onClick={() => setPage(value => value - 1)} className="rounded border border-slate-300 p-2 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Trang sau" disabled={!document || page >= document.numPages}
            onClick={() => setPage(value => value + 1)} className="rounded border border-slate-300 p-2 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Tải lại bản xem trước" onClick={() => setAttempt(value => value + 1)}
            className="rounded border border-slate-300 p-2"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-4">
        {error ? <p role="alert" className="p-4 text-center text-sm text-rose-600">{error}</p>
          : document && width > 0 ? <PdfPage key={`${page}-${width}`} document={document} page={page} width={width} title={title} />
            : <div role="status" className="flex items-center justify-center gap-2 p-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Đang đọc tài liệu…</div>}
      </div>
    </div>
  );
}
