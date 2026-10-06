import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Chapter Versions Tab - Version history and comparison
 * Shows all versions of a document with diff capability
 */
import { useState } from 'react';
import { GitBranch, Eye, Clock, User, ArrowRight, RotateCcw } from 'lucide-react';
import { RichContentViewer } from '@/components/editor/RichTextEditor';
import type { DocChapterVersion } from '../types';

interface ChapterVersionsTabProps {
  versions: DocChapterVersion[];
  currentVersion: string;
  documentTitle: string;
  onRestoreVersion?: (version: DocChapterVersion) => void;
}

export function ChapterVersionsTab({
  versions,
  currentVersion,
  documentTitle,
  onRestoreVersion,
}: ChapterVersionsTabProps) {
  const [selectedVersion, setSelectedVersion] = useState<DocChapterVersion | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const sortedVersions = [...versions].sort((a, b) => {
    // Sort newest first
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Published':
        return <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-[10px] font-bold">Published</span>;
      case 'Obsolete':
        return <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full text-[10px] font-bold line-through">Obsolete</span>;
      case 'Draft':
        return <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[10px] font-bold">Draft</span>;
      default:
        return <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-[10px] font-bold">{status}</span>;
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Version List */}
      <div className={`${selectedVersion ? 'w-[380px]' : 'w-full'} flex flex-col border-r border-slate-200 dark:border-slate-700 transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-500" />
            Lịch sử phiên bản
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {versions.length}
            </span>
          </h3>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`text-xs px-3 py-1 rounded-lg font-semibold transition ${
              compareMode
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            So sánh
          </button>
        </div>

        {/* Version Timeline */}
        <div className="flex-1 overflow-y-auto py-3 px-4 space-y-2">
          {sortedVersions.length === 0 ? (
            <div className="text-center py-12">
              <GitBranch className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Chưa có lịch sử phiên bản
              </p>
            </div>
          ) : (
            sortedVersions.map((ver, idx) => {
              const isCurrent = ver.version === currentVersion;
              const isSelected = selectedVersion?.version === ver.version;

              return (
                <div
                  key={`${ver.version}-${idx}`}
                  onClick={() => setSelectedVersion(isSelected ? null : ver)}
                  className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-sm'
                      : isCurrent
                      ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40 hover:border-green-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  {/* Timeline connector */}
                  {idx < sortedVersions.length - 1 && (
                    <div className="absolute left-8 top-[56px] bottom-[-12px] w-px bg-slate-200 dark:bg-slate-700" />
                  )}

                  <div className="flex items-start gap-3">
                    {/* Version circle */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ${
                      isCurrent
                        ? 'bg-green-500 text-white'
                        : isSelected
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {ver.version.replace('Rev ', '').split('.')[0]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {ver.version}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 bg-green-600 text-white text-[8px] font-bold rounded uppercase">
                            Current
                          </span>
                        )}
                        {getStatusBadge(ver.status)}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">
                        {ver.changeSummary}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {ver.modifiedBy}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {ver.date}
                        </span>
                      </div>
                    </div>

                    {/* View button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedVersion(ver); }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition flex-shrink-0"
                      title="Xem nội dung phiên bản"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Version Preview Panel */}
      {selectedVersion && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-white">
                Xem phiên bản {selectedVersion.version}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">{documentTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <PermissionGate permission={'hsqe.update'}><button
                onClick={() => onRestoreVersion && onRestoreVersion(selectedVersion)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 rounded-lg transition"
                title="Khôi phục phiên bản này"
              >
                <RotateCcw className="w-3 h-3" /> Khôi phục
              </button></PermissionGate>
              <button
                onClick={() => setSelectedVersion(null)}
                className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 rounded-lg transition"
              >
                Đóng
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-800">
            {compareMode ? (
              <div className="grid grid-cols-2 gap-6 h-full">
                <div className="flex flex-col gap-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="font-bold text-blue-600">Phiên bản so sánh: {selectedVersion.version}</span>
                    <p className="text-slate-450 mt-1">Người sửa: {selectedVersion.modifiedBy} • Ngày: {selectedVersion.date}</p>
                    <p className="text-slate-500 mt-1 italic">Tóm tắt: {selectedVersion.changeSummary}</p>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed border border-slate-200 dark:border-slate-700 rounded-lg p-6 overflow-y-auto flex-1 h-[600px]">
                    <RichContentViewer html={selectedVersion.content} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="font-bold text-green-600">Phiên bản hiện tại: {currentVersion}</span>
                    <p className="text-slate-450 mt-1">Nội dung đang áp dụng chính thức.</p>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed border border-slate-200 dark:border-slate-700 rounded-lg p-6 overflow-y-auto flex-1 h-[600px]">
                    <RichContentViewer html={versions.find(v => v.version === currentVersion)?.content || ''} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">Phiên bản</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedVersion.version}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Người sửa đổi</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedVersion.modifiedBy}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Ngày</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedVersion.date}</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                    <span className="text-slate-500">Tóm tắt: </span>
                    {selectedVersion.changeSummary}
                  </div>
                </div>

                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                  <RichContentViewer html={selectedVersion.content} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
