/**
 * Document Preview Modal
 * Quick preview for drill documents without opening Edit modal
 * Marad UX: Instant access for PSC inspections
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Download, FileText, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DocumentAttachment } from '@/types/drill.types';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentAttachment[];
  drillName: string;
}

export function DocumentPreviewModal({ isOpen, onClose, documents, drillName }: DocumentPreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset to first document when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
    }
  }, [isOpen]);

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : documents.length - 1));
  }, [documents.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < documents.length - 1 ? prev + 1 : 0));
  }, [documents.length]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrevious, handleNext, onClose]);

  if (!isOpen) return null;

  const currentDoc = documents[currentIndex];
  const isPDF = currentDoc?.mimeType?.includes('pdf') || currentDoc?.url.toLowerCase().endsWith('.pdf');
  const isImage = currentDoc?.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(currentDoc?.url || '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header with Close and Download */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-red-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Document Preview</h2>
              <p className="text-sm text-gray-500">{drillName}</p>
            </div>
          </div>
          
          {/* Header Actions */}
          <div className="flex items-center gap-2">
            {currentDoc && (
              <a
                href={currentDoc.url}
                download={currentDoc.name}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                title="Download document"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
              title="Close preview (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Navigation - if multiple documents */}
        {documents.length > 1 && (
          <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
            <button
              onClick={handlePrevious}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
              title="Previous document"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex-1 flex items-center gap-2 overflow-x-auto px-4">
              {documents.map((doc, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition flex-shrink-0 ${
                    idx === currentIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {idx + 1}. {doc.name}
                </button>
              ))}
            </div>
            
            <button
              onClick={handleNext}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
              title="Next document"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Document Viewer */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {currentDoc ? (
            <>
              {isPDF && (
                <iframe
                  src={currentDoc.url}
                  className="w-full h-full"
                  title={currentDoc.name}
                />
              )}
              
              {isImage && (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={currentDoc.url}
                    alt={currentDoc.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              
              {!isPDF && !isImage && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">Preview not available for this file type</p>
                    <a
                      href={currentDoc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in New Tab
                    </a>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">No documents attached</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Document Info */}
        <div className="px-6 py-3 border-t bg-gray-50">
          <div className="flex items-center justify-between text-sm">
            {currentDoc && (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{currentDoc.name}</span>
                  {currentDoc.fileSize && (
                    <span className="text-gray-500">
                      • {(currentDoc.fileSize / 1024 / 1024).toFixed(2)} MB
                    </span>
                  )}
                </div>
                <div className="text-gray-500">
                  {documents.length > 1 && (
                    <span>{currentIndex + 1} of {documents.length}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
