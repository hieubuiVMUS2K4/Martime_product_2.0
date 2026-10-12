import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Attached Documents Tab - File attachment management
 * Upload, view, download, delete attachments
 */
import { useState } from 'react';
import {
  Upload, FileText, Image, FileSpreadsheet, File as FileIcon,
  Download, Trash2, Eye, Paperclip, HardDrive
} from 'lucide-react';
import type { DocAttachment } from '../types';

interface AttachedDocumentsTabProps {
  attachments: DocAttachment[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (attachmentId: string) => void;
  isEditing: boolean;
}

export function AttachedDocumentsTab({
  attachments,
  onUpload,
  onDelete,
  isEditing,
}: AttachedDocumentsTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <Image className="w-5 h-5 text-emerald-500" />;
    if (fileType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv'))
      return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    if (fileType.includes('word') || fileType.includes('document'))
      return <FileText className="w-5 h-5 text-blue-600" />;
    return <FileIcon className="w-5 h-5 text-slate-400" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploading(true);
      try {
        for (const file of files) {
          await onUpload(file);
        }
      } finally {
        setUploading(false);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setUploading(true);
      try {
        for (const file of files) {
          await onUpload(file);
        }
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
      {/* Upload Zone */}
      {isEditing && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
            isDragging
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-700 bg-slate-50 dark:bg-slate-900/30'
          }`}
        >
          <Upload className={`w-8 h-8 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            {uploading ? 'Đang tải lên...' : 'Kéo thả tệp vào đây để upload'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Hỗ trợ: PDF, Word, Excel, Images, ZIP (tối đa 50MB)
          </p>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition shadow-sm">
            <Paperclip className="w-3.5 h-3.5" />
            Chọn tệp
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Attachments Table */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-500" />
            Danh sách tệp đính kèm
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {attachments.length}
            </span>
          </h3>
        </div>

        {attachments.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
            <FileIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Chưa có tệp đính kèm nào
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Upload tệp để đính kèm vào tài liệu này
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10">TT</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tên tệp</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Kích thước</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Loại</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Người tải lên</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Ngày tải</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {attachments.map((att, idx) => (
                  <tr key={att.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-700/30 transition">
                    <td className="px-4 py-3 text-xs text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getFileIcon(att.fileType)}
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{att.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatFileSize(att.fileSize)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 uppercase">{att.fileType.split('/').pop()}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{att.uploadedBy}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{att.uploadedAt.split('T')[0]}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            if (att.url) {
                              window.open(att.url, '_blank');
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
                          title="Xem trước"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (att.url) {
                              const link = document.createElement('a');
                              link.href = att.url;
                              link.download = att.fileName;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition"
                          title="Tải xuống"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {isEditing && (
                          <PermissionGate permission={'hsqe.update'}><button
                            onClick={() => onDelete(att.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button></PermissionGate>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
