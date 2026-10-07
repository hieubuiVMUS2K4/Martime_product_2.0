/**
 * Document Upload Zone Component
 * Professional drag & drop upload for maritime drill documents
 * Designed for crew with gloves and tablets
 */

import { useCallback, useState } from 'react';
import { Upload, FileText, Image as ImageIcon, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentAttachment } from '@/types/drill.types';
import { uploadDrillDocument } from '@/services/drill.service';
import { API_CONFIG } from '@/config/app.config';
import { usePermission } from '@/stores/permissions.store';

// Server root URL (strip trailing /api if present)
const SERVER_ROOT = API_CONFIG.BASE_URL.replace(/\/api\/?$/, '');

interface DocumentUploadZoneProps {
  documents: DocumentAttachment[];
  onChange: (documents: DocumentAttachment[]) => void;
  maxFileSize?: number; // bytes, default 10MB
  acceptedFileTypes?: string[]; // mimeTypes
}

export function DocumentUploadZone({
  documents,
  onChange,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  acceptedFileTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
}: DocumentUploadZoneProps) {
  const canUpload = usePermission('drills.create');
  const canUpdate = usePermission('drills.update');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([]);

  /**
   * Validate file before upload
   */
  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File "${file.name}" is too large. Max size: ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`;
    }

    // Check file type
    if (!acceptedFileTypes.includes(file.type)) {
      return `File type "${file.type}" is not supported. Accepted: PDF, JPEG, PNG, WEBP, GIF`;
    }

    return null;
  };

  /**
   * Upload file to server and return persistent DocumentAttachment
   */
  const uploadFile = async (file: File): Promise<DocumentAttachment> => {
    setUploadingFiles(prev => [...prev, { name: file.name, progress: 50 }]);
    try {
      const result = await uploadDrillDocument(file);
      return {
        name: result.name,
        url: `${SERVER_ROOT}${result.url}`,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        uploadedAt: result.uploadedAt,
        uploadedBy: 'Current User'
      };
    } finally {
      setUploadingFiles(prev => prev.filter(f => f.name !== file.name));
    }
  };

  /**
   * Handle file selection (from dropzone or file input)
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!canUpload) return;
    const fileArray = Array.from(files);
    
    // Validate all files first
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
    }

    // Upload files sequentially
    try {
      for (const file of fileArray) {
        const uploadedDoc = await uploadFile(file);
        onChange([...documents, uploadedDoc]);
        toast.success(`"${file.name}" uploaded successfully`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload failed. Please try again.');
    }
  }, [documents, onChange, canUpload]);

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  /**
   * Handle file input change
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset input value to allow re-uploading same file
    e.target.value = '';
  };

  /**
   * Remove document
   */
  const handleRemove = (index: number) => {
    if (!canUpload && !canUpdate) return;
    const newDocs = documents.filter((_, i) => i !== index);
    onChange(newDocs);
    toast.success('Document removed');
  };

  /**
   * Get file icon based on mime type
   */
  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-blue-600" />;
    }
    return <FileText className="w-5 h-5 text-red-600" />;
  };

  /**
   * Format file size
   */
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      {canUpload && <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer
          ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
          }
        `}
      >
        <input
          type="file"
          multiple
          accept={acceptedFileTypes.join(',')}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          id="file-upload"
        />
        
        <div className="text-center">
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-base font-medium text-gray-700 mb-1">
            Kéo thả file vào đây hoặc click để chọn
          </p>
          <p className="text-sm text-gray-500">
            Hỗ trợ: PDF, JPEG, PNG, WEBP, GIF (tối đa {(maxFileSize / 1024 / 1024).toFixed(0)}MB)
          </p>
        </div>
      </div>}

      {/* Uploading Progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((file) => (
            <div key={file.name} className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="flex items-center gap-3 mb-2">
                <Upload className="w-4 h-4 text-blue-600 animate-pulse" />
                <span className="text-sm font-medium text-gray-700 flex-1 truncate">
                  {file.name}
                </span>
                <span className="text-xs text-blue-600 font-semibold">
                  {file.progress}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Uploaded Documents ({documents.length})
          </h4>
          
          {documents.map((doc, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition group"
            >
              {/* File icon */}
              <div className="flex-shrink-0">
                {getFileIcon(doc.mimeType)}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {doc.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{formatFileSize(doc.fileSize)}</span>
                  <span>•</span>
                  <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  View
                </a>
                {(canUpload || canUpdate) && <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                  title="Remove document"
                >
                  <X className="w-4 h-4" />
                </button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && uploadingFiles.length === 0 && (
        <div className="text-center py-4 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
      )}
    </div>
  );
}
