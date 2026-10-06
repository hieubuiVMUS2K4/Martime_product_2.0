import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Document Sidebar - Tree View for SMS Library
 * Shows folder structure: ISM Manual, ISPS, STCW, Garbage, etc.
 */
import { useState, useMemo } from 'react';
import { 
  Folder, FileText, 
  Search, Plus, MoreVertical, FolderPlus, Trash2
} from 'lucide-react';
import type { DocCategory, DocTreeNode } from './types';

interface DocumentSidebarProps {
  documents: DocTreeNode[];
  selectedDocId: string | null;
  selectedDocumentIds: string[];
  onSelectDocument: (id: string) => void;
  onToggleDocumentSelection: (id: string) => void;
  onBulkDelete: () => void;
  onCreateDocument: (parentCode?: string, category?: DocCategory) => void;
  onImportDocument: () => void;
}

export function DocumentSidebar({
  documents,
  selectedDocId,
  selectedDocumentIds,
  onSelectDocument,
  onToggleDocumentSelection,
  onBulkDelete,
  onCreateDocument,
  onImportDocument,
}: DocumentSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  const createVirtualFolder = (id: string, title: string): DocTreeNode => ({
    id,
    code: id,
    title,
    type: 'manual',
    children: [],
    status: 'Published',
    currentVersion: '',
    lastModified: '',
    author: '',
    content: '',
    category: 'MANUAL',
    editCount: 0,
    watermarkText: '',
    revisions: [],
    syncStatuses: [],
    attachments: [],
    readLogs: [],
    isVirtual: true,
  });

  const inferLibraryFolderId = (doc: DocTreeNode): string => {
    const haystack = `${doc.code} ${doc.title} ${doc.category}`.toLowerCase();

    if (doc.category === 'CHECKLIST' || haystack.includes('checklist')) return 'library-checklists';
    if (doc.category === 'FORM' || haystack.includes('form')) return 'library-forms';
    if (haystack.includes('isps') || haystack.includes('security')) return 'library-isps';
    if (haystack.includes('stcw') || haystack.includes('seafarer')) return 'library-stcw';
    if (haystack.includes('garbage')) return 'library-garbage';
    if (haystack.includes('ballast')) return 'library-ballast';
    if (haystack.includes('emergency') || haystack.includes('khẩn cấp')) return 'library-emergency';
    if (haystack.includes('policy') || haystack.includes('chính sách')) return 'library-policies';
    if (haystack.includes('work instruction') || haystack.includes('hướng dẫn')) return 'library-work-instructions';
    if (doc.category === 'PROCEDURE') return 'library-work-instructions';
    return 'library-ism';
  };

  const isDocumentControlChild = (doc: DocTreeNode): boolean => {
    const haystack = `${doc.title} ${doc.code}`.toLowerCase();
    return (
      haystack.includes('danh mục tài liệu') ||
      haystack.includes('phiếu yêu cầu') ||
      haystack.includes('sửa đổi') ||
      haystack.includes('bổ sung')
    );
  };

  // Build SMS Library hierarchy from API data. When backend has no parentId yet,
  // group documents into Marad-like manuals and attach related forms under procedures.
  const treeData = useMemo(() => {
    const hasExplicitHierarchy = documents.some(d => d.parentId);

    if (!hasExplicitHierarchy) {
      const folders = [
        createVirtualFolder('library-ism', 'ISM Manual'),
        createVirtualFolder('library-isps', 'ISPS Manual'),
        createVirtualFolder('library-stcw', 'STCW Guide'),
        createVirtualFolder('library-garbage', 'Garbage Management Plan'),
        createVirtualFolder('library-ballast', 'Ballast Water Management Plan'),
        createVirtualFolder('library-emergency', 'Emergency Procedures'),
        createVirtualFolder('library-policies', 'Company Policies'),
        createVirtualFolder('library-work-instructions', 'Work Instructions'),
        createVirtualFolder('library-checklists', 'Checklists'),
        createVirtualFolder('library-forms', 'Forms'),
      ];
      const folderMap = new Map(folders.map(folder => [folder.id, folder]));
      const nodeByCode = new Map(documents.map(doc => [doc.code, { ...doc, children: [] as DocTreeNode[] }]));
      const nestedDocumentIds = new Set<string>();
      const docControlProcedure = documents.find(doc =>
        doc.category === 'PROCEDURE' && doc.title.toLowerCase().includes('kiểm soát tài liệu')
      );
      const docControlNode: DocTreeNode | null = docControlProcedure ? nodeByCode.get(docControlProcedure.code) ?? null : null;

      documents.forEach((doc) => {
        const codeParts = doc.code.split('-');
        if (codeParts.length <= 2) return;

        const parentCode = codeParts.slice(0, -1).join('-');
        const parentNode = nodeByCode.get(parentCode);
        const childNode = nodeByCode.get(doc.code);
        if (parentNode && childNode) {
          parentNode.children.push(childNode);
          nestedDocumentIds.add(doc.id);
        }
      });

      documents.forEach((doc) => {
        if (nestedDocumentIds.has(doc.id)) return;
        if (docControlProcedure && doc.id === docControlProcedure.id) return;

        const node = nodeByCode.get(doc.code) ?? { ...doc, children: [] };
        if (doc.category === 'MANUAL' || doc.category === 'SMS_HANDBOOK') {
          folders.unshift(node);
          return;
        }

        if (docControlNode && isDocumentControlChild(doc)) {
          docControlNode.children.push(node);
          return;
        }

        const folder = folderMap.get(inferLibraryFolderId(doc)) ?? folderMap.get('library-ism');
        folder?.children.push(node);
      });

      if (docControlNode) {
        folderMap.get('library-ism')?.children.unshift(docControlNode);
      }

      return folders.filter(folder => !folder.isVirtual || folder.children.length > 0);
    }

    const roots = documents.filter(d => !d.parentId);
    const buildTree = (parentId: string): DocTreeNode[] => {
      return documents
        .filter(d => d.parentId === parentId)
        .map(d => ({
          ...d,
          children: buildTree(d.id),
        }));
    };
    return roots.map(r => ({
      ...r,
      children: buildTree(r.id),
    }));
  }, [documents]);

  // Filter by search
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return treeData;
    const q = searchQuery.toLowerCase();
    const matchesSearch = (node: DocTreeNode): boolean => {
      if (node.title.toLowerCase().includes(q) || node.code.toLowerCase().includes(q)) return true;
      return node.children.some(matchesSearch);
    };
    return treeData.filter(matchesSearch);
  }, [treeData, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getSelectableDocumentIds = (node: DocTreeNode): string[] => {
    const ownId = node.isVirtual ? [] : [node.id];
    return [
      ...ownId,
      ...node.children.flatMap(getSelectableDocumentIds),
    ];
  };

  const toggleNodeSelection = (node: DocTreeNode) => {
    const ids = getSelectableDocumentIds(node);
    if (ids.length === 0) return;

    const allSelected = ids.every(id => selectedDocumentIds.includes(id));
    ids.forEach((id) => {
      const isSelected = selectedDocumentIds.includes(id);
      if (allSelected && isSelected) onToggleDocumentSelection(id);
      if (!allSelected && !isSelected) onToggleDocumentSelection(id);
    });
  };

  const renderNode = (node: DocTreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.includes(node.id);
    const isSelected = selectedDocId === node.id;
    const hasChildren = node.children.length > 0;
    const isFolder = Boolean(node.isVirtual) || node.type === 'manual' || hasChildren;
    const selectableIds = getSelectableDocumentIds(node);
    const isChecked = selectableIds.length > 0 && selectableIds.every(id => selectedDocumentIds.includes(id));
    const isIndeterminate = !isChecked && selectableIds.some(id => selectedDocumentIds.includes(id));

    return (
      <div key={node.id}>
        <div
          className={`group grid grid-cols-[18px_18px_18px_minmax(0,1fr)_18px] items-center gap-1 py-1.5 pr-2 cursor-pointer rounded transition-all duration-100 ${
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200'
              : 'hover:bg-slate-100 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => {
            if (!node.isVirtual) onSelectDocument(node.id);
            if (isFolder) toggleExpand(node.id);
          }}
        >
          {/* Expand/Collapse Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isFolder) toggleExpand(node.id);
            }}
            className={`flex h-[18px] w-[18px] items-center justify-center rounded ${
              isFolder ? 'hover:bg-slate-200 dark:hover:bg-slate-600' : 'cursor-default'
            }`}
            tabIndex={isFolder ? 0 : -1}
          >
            <span
              className={`block h-0 w-0 transition-transform ${
                isFolder && isExpanded
                  ? 'border-x-[4px] border-t-[5px] border-x-transparent border-t-slate-700 dark:border-t-slate-300'
                  : 'border-y-[4px] border-l-[5px] border-y-transparent border-l-slate-600 dark:border-l-slate-400'
              }`}
            />
          </button>

          {selectableIds.length > 0 ? (
            <input
              type="checkbox"
              checked={isChecked}
              ref={(input) => {
                if (input) input.indeterminate = isIndeterminate;
              }}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleNodeSelection(node)}
              className="mx-auto h-3.5 w-3.5 rounded-none border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          ) : (
            <span className="h-[18px] w-[18px]" />
          )}

          {/* Icon */}
          {isFolder ? (
            <Folder className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-amber-500'}`} />
          ) : (
            <FileText className={`h-4 w-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
          )}

          {/* Label */}
          <span className="truncate text-xs font-medium leading-5">
            {node.title}
          </span>

          {/* Context Menu Trigger */}
          {!node.isVirtual && (
            <PermissionGate permission={'hsqe.create'}><button
              onClick={(e) => {
                e.stopPropagation();
                setContextMenuId(contextMenuId === node.id ? null : node.id);
              }}
              className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded flex-shrink-0 transition-opacity"
            >
              <MoreVertical className="w-3 h-3" />
            </button></PermissionGate>
          )}
        </div>

        {/* Context Menu */}
        {contextMenuId === node.id && (
          <div className="ml-8 mr-2 mb-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50">
            <PermissionGate permission={'hsqe.create'}><button
              onClick={() => { onCreateDocument(node.code, 'FORM'); setContextMenuId(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Plus className="w-3 h-3" /> Thêm tài liệu con
            </button></PermissionGate>
            <PermissionGate permission={'hsqe.create'}><button
              onClick={() => { onCreateDocument(node.code, 'PROCEDURE'); setContextMenuId(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FolderPlus className="w-3 h-3" /> Thêm Chapter
            </button></PermissionGate>
          </div>
        )}

        {/* Children */}
        {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      {/* Search */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5">
          <span className="text-xs text-slate-400 font-medium">Search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none min-w-0"
            placeholder=""
          />
          <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700">
        <PermissionGate permission={'hsqe.create'}><select
          className="text-xs border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex-1"
          defaultValue=""
          onChange={(e) => {
            const action = e.target.value;
            if (action === 'manual') onCreateDocument(undefined, 'MANUAL');
            if (action === 'checklist') onCreateDocument(undefined, 'CHECKLIST');
            if (action === 'form') onCreateDocument(undefined, 'FORM');
            if (action === 'import') onImportDocument();
            e.target.value = '';
          }}
        >
          <option value="">-- Execute Action --</option>
          <option value="manual">Create New Manual</option>
          <option value="checklist">Create New Checklist</option>
          <option value="form">Create New Form</option>
          <option value="import">Import Document</option>
        </select></PermissionGate>
        <PermissionGate permission={'hsqe.create'}><button
          onClick={() => onCreateDocument(undefined, 'PROCEDURE')}
          className="hidden"
          title="Tạo thư mục mới"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button></PermissionGate>
      </div>

      {selectedDocumentIds.length > 0 && (
        <div className="flex items-center justify-between border-b border-slate-200 bg-red-50 px-2 py-1.5 dark:border-slate-700 dark:bg-red-950/20">
          <span className="text-xs font-semibold text-red-700 dark:text-red-300">
            {selectedDocumentIds.length} selected
          </span>
          <PermissionGate permission={'hsqe.delete'}><button
            onClick={onBulkDelete}
            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button></PermissionGate>
        </div>
      )}

      {/* Tree View */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredTree.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {searchQuery ? 'Không tìm thấy tài liệu' : 'Chưa có tài liệu nào'}
            </p>
          </div>
        ) : (
          filteredTree.map(node => renderNode(node))
        )}
      </div>
    </div>
  );
}
