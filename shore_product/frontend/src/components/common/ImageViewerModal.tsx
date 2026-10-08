import React, { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { fetchProtectedMediaObjectUrl, isProtectedMediaPath } from '../../services/protectedMedia';

interface ImageViewerModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  documentId?: string;
  onClose: () => void;
  onFileChanged?: () => void;
  customUploadHandler?: (documentId: string, formData: FormData) => Promise<any>;
}

function isPdfUrl(url: string | null): boolean {
  if (!url) return false;
  return url.split('?')[0].toLowerCase().endsWith('.pdf');
}

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen, imageUrl, documentId, onClose, onFileChanged, customUploadHandler,
}) => {
  const [uploading, setUploading] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(imageUrl);

  useEffect(() => {
    setCurrentImageUrl(imageUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
  }, [imageUrl]);

  useEffect(() => {
    if (!currentImageUrl || !isProtectedMediaPath(currentImageUrl)) {
      setResolvedImageUrl(currentImageUrl);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    fetchProtectedMediaObjectUrl(currentImageUrl, controller.signal)
      .then((url) => {
        objectUrl = url;
        setResolvedImageUrl(url);
      })
      .catch(() => setResolvedImageUrl(null));

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentImageUrl]);

  const isCurrentPdf = previewFile
    ? previewFile.type === 'application/pdf'
    : isPdfUrl(currentImageUrl || imageUrl);

  if (!isOpen || !imageUrl) return null;

  const handleSelectFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setPreviewFile(file);
      setPreviewUrl(url);
    };
    input.click();
  };

  const handleConfirmChange = async () => {
    if (!previewFile || !documentId || !customUploadHandler) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', previewFile);
      const result = await customUploadHandler(documentId, formData);
      const newUrl = result.fileUrl || result.documentFilePath;
      if (newUrl) setCurrentImageUrl(`${newUrl}?t=${Date.now()}`);
      setPreviewFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      onFileChanged?.();
    } catch (error: any) {
      console.error('Failed to change file:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleCancelChange = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxWidth: 900, maxHeight: '90vh', width: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #d6dee8' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#14202e' }}>
            {previewFile
              ? (isCurrentPdf ? 'Xem trước PDF mới' : 'Xem trước ảnh mới')
              : (isPdfUrl(currentImageUrl || imageUrl) ? 'Tài liệu PDF' : 'Ảnh tài liệu')}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f8fc', minHeight: 400 }}>
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div className="animate-spin" style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #0b2545', borderTopColor: 'transparent' }} />
              <p style={{ color: '#64748b', fontWeight: 500 }}>Đang tải lên...</p>
            </div>
          ) : isCurrentPdf ? (
            <iframe
              src={previewUrl || resolvedImageUrl || ''}
              title="PDF Document"
              style={{ width: '100%', height: '100%', minHeight: '60vh', border: 'none' }}
            />
          ) : (
            <img
              src={previewUrl || resolvedImageUrl || ''}
              alt="Document"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 16, borderTop: '1px solid #d6dee8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {documentId && customUploadHandler && !previewFile && (
              <button onClick={handleSelectFile} disabled={uploading}
                style={{ padding: '8px 16px', background: '#0b2545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 500 }}>
                <Upload style={{ width: 16, height: 16 }} /> Thay đổi file
              </button>
            )}
            {previewFile && (
              <>
                <button onClick={handleConfirmChange} disabled={uploading}
                  style={{ padding: '8px 16px', background: '#0b2545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                  ✓ Xác nhận
                </button>
                <button onClick={handleCancelChange} disabled={uploading}
                  style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                  ✕ Hủy
                </button>
              </>
            )}
          </div>
          <button onClick={onClose} disabled={uploading}
            style={{ padding: '8px 16px', background: '#64748b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageViewerModal;

