/**
 * History Tab - Audit Trail / Change History
 * Shows timeline of all actions performed on the document
 */
import { useState, useMemo } from 'react';
import {
  History, FileText, Edit2, Check, Shield, Eye, Paperclip,
  Trash2, RefreshCw, Search, Calendar, Filter
} from 'lucide-react';
import type { DocHistoryEntry, DocChapterVersion } from '../types';

interface HistoryTabProps {
  history: DocHistoryEntry[];
  revisions: DocChapterVersion[];
  documentCode: string;
}

export function HistoryTab({ history, revisions, documentCode }: HistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');

  // Build combined timeline from explicit history + revisions
  const timeline = useMemo(() => {
    const entries: DocHistoryEntry[] = [...history];

    // Add revision entries if not already in history
    revisions.forEach((rev, idx) => {
      const exists = entries.some(e => e.version === rev.version && e.action === 'edited');
      if (!exists) {
        entries.push({
          id: `rev-${idx}`,
          action: idx === 0 ? 'created' : 'edited',
          userName: rev.modifiedBy,
          timestamp: rev.date,
          details: rev.changeSummary || `Phiên bản ${rev.version}`,
          version: rev.version,
        });

        // Add status-based entries
        if (rev.status === 'Published') {
          entries.push({
            id: `pub-${idx}`,
            action: 'released',
            userName: rev.modifiedBy,
            timestamp: rev.date,
            details: `Ban hành phiên bản ${rev.version}`,
            version: rev.version,
          });
        }
      }
    });

    // Sort by timestamp, newest first
    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [history, revisions]);

  // Filter
  const filtered = useMemo(() => {
    let result = timeline;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.userName.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q)
      );
    }
    if (filterAction) {
      result = result.filter(e => e.action === filterAction);
    }
    return result;
  }, [timeline, searchQuery, filterAction]);

  const getActionConfig = (action: string) => {
    switch (action) {
      case 'created':
        return { icon: <FileText className="w-3.5 h-3.5" />, color: 'bg-blue-500', label: 'Tạo mới', bgLight: 'bg-blue-50 dark:bg-blue-900/20' };
      case 'edited':
        return { icon: <Edit2 className="w-3.5 h-3.5" />, color: 'bg-amber-500', label: 'Chỉnh sửa', bgLight: 'bg-amber-50 dark:bg-amber-900/20' };
      case 'approved':
        return { icon: <Check className="w-3.5 h-3.5" />, color: 'bg-green-500', label: 'Phê duyệt', bgLight: 'bg-green-50 dark:bg-green-900/20' };
      case 'released':
        return { icon: <Shield className="w-3.5 h-3.5" />, color: 'bg-emerald-600', label: 'Ban hành', bgLight: 'bg-emerald-50 dark:bg-emerald-900/20' };
      case 'obsoleted':
        return { icon: <Trash2 className="w-3.5 h-3.5" />, color: 'bg-red-500', label: 'Hủy bỏ', bgLight: 'bg-red-50 dark:bg-red-900/20' };
      case 'read':
        return { icon: <Eye className="w-3.5 h-3.5" />, color: 'bg-cyan-500', label: 'Đọc', bgLight: 'bg-cyan-50 dark:bg-cyan-900/20' };
      case 'attachment_added':
        return { icon: <Paperclip className="w-3.5 h-3.5" />, color: 'bg-violet-500', label: 'Đính kèm', bgLight: 'bg-violet-50 dark:bg-violet-900/20' };
      case 'attachment_removed':
        return { icon: <Trash2 className="w-3.5 h-3.5" />, color: 'bg-rose-500', label: 'Xóa tệp', bgLight: 'bg-rose-50 dark:bg-rose-900/20' };
      case 'synced':
        return { icon: <RefreshCw className="w-3.5 h-3.5" />, color: 'bg-indigo-500', label: 'Đồng bộ', bgLight: 'bg-indigo-50 dark:bg-indigo-900/20' };
      default:
        return { icon: <History className="w-3.5 h-3.5" />, color: 'bg-slate-500', label: action, bgLight: 'bg-slate-50 dark:bg-slate-900/20' };
    }
  };

  const actionTypes = ['created', 'edited', 'approved', 'released', 'obsoleted', 'read', 'attachment_added', 'synced'];

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          Nhật ký thay đổi — {documentCode}
          <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold px-2 py-0.5 rounded-full">
            {filtered.length} sự kiện
          </span>
        </h3>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo người thực hiện, nội dung..."
            className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none"
          >
            <option value="">Tất cả hành động</option>
            {actionTypes.map(a => (
              <option key={a} value={a}>{getActionConfig(a).label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1">
        {filtered.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
            <History className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {timeline.length === 0 ? 'Chưa có lịch sử thay đổi' : 'Không tìm thấy kết quả'}
            </p>
          </div>
        ) : (
          <div className="relative space-y-1">
            {/* Timeline Line */}
            <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-700" />

            {filtered.map((entry) => {
              const config = getActionConfig(entry.action);

              return (
                <div
                  key={entry.id}
                  className={`relative flex items-start gap-3 p-3 rounded-xl transition-colors hover:${config.bgLight}`}
                >
                  {/* Timeline Dot */}
                  <div className={`w-[22px] h-[22px] rounded-full ${config.color} flex items-center justify-center text-white flex-shrink-0 z-10 shadow-sm`}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {entry.userName}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${config.bgLight} text-slate-600 dark:text-slate-400`}>
                        {config.label}
                      </span>
                      {entry.version && (
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                          ({entry.version})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {entry.details}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                    <Calendar className="w-3 h-3" />
                    {entry.timestamp}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
