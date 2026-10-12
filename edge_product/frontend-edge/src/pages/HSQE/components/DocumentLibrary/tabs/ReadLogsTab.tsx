/**
 * Read Logs Tab - Track who has read the document
 * Shows crew members who acknowledged reading the document
 */
import { useState } from 'react';
import { BookOpen, Check, X, User, Clock, Search, CheckCircle } from 'lucide-react';
import type { DocReadLog } from '../types';

interface ReadLogsTabProps {
  readLogs: DocReadLog[];
  documentTitle: string;
  onMarkAsRead: () => void;
  currentUserName: string;
}

export function ReadLogsTab({
  readLogs,
  documentTitle,
  onMarkAsRead,
  currentUserName,
}: ReadLogsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = readLogs.filter(log =>
    !searchQuery || log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.rank.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const acknowledgedCount = readLogs.filter(l => l.acknowledged).length;
  const totalCount = readLogs.length;
  const hasCurrentUserRead = readLogs.some(l => l.userName === currentUserName);

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl p-4 border border-blue-200/60 dark:border-blue-800/40">
          <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-300">{totalCount}</div>
          <div className="text-xs font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase tracking-wider mt-0.5">Tổng người đã xem</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 rounded-xl p-4 border border-green-200/60 dark:border-green-800/40">
          <div className="text-2xl font-extrabold text-green-700 dark:text-green-300">{acknowledgedCount}</div>
          <div className="text-xs font-semibold text-green-600/70 dark:text-green-400/70 uppercase tracking-wider mt-0.5">Đã xác nhận đọc</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl p-4 border border-amber-200/60 dark:border-amber-800/40">
          <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-300">{totalCount - acknowledgedCount}</div>
          <div className="text-xs font-semibold text-amber-600/70 dark:text-amber-400/70 uppercase tracking-wider mt-0.5">Chưa xác nhận</div>
        </div>
      </div>

      {/* Mark as Read Action */}
      {!hasCurrentUserRead && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Bạn chưa xác nhận đã đọc tài liệu này
            </p>
            <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mt-0.5">
              "{documentTitle}"
            </p>
          </div>
          <button
            onClick={onMarkAsRead}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition shadow-sm"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Xác nhận đã đọc
          </button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo tên hoặc chức vụ..."
            className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none"
          />
        </div>
      </div>

      {/* Read Logs Table */}
      <div className="flex-1">
        {filteredLogs.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
            <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {readLogs.length === 0 ? 'Chưa có ai đọc tài liệu này' : 'Không tìm thấy kết quả'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10">TT</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Họ và tên</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Chức danh</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40">Thời gian đọc</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Xác nhận</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredLogs.map((log, idx) => (
                  <tr key={log.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-700/30 transition">
                    <td className="px-4 py-3 text-xs text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{log.userName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{log.rank}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {new Date(log.readAt).toLocaleString('vi-VN')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.acknowledged ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold">
                          <Check className="w-3 h-3" /> Đã đọc
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full text-xs font-bold">
                          <X className="w-3 h-3" /> Chưa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 italic">{log.notes || '—'}</td>
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
