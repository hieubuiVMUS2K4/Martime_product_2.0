import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import '../../../data/models/maintenance_task.dart';
import '../../../data/models/task_checklist_item.dart';
import '../../../data/repositories/task_repository.dart';
import '../../providers/task_provider.dart';
import '../../providers/sync_provider.dart';
import '../../widgets/common/loading_widget.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/cache/cache_manager.dart';
import '../../../core/constants/cache_keys.dart';
import '../../../core/di/service_locator.dart';
import '../../../core/cache/sync_queue.dart';

class CompleteTaskScreen extends StatefulWidget {
  final MaintenanceTask task;
  /// True khi được push từ TaskDetailScreen (cần pop 2 lần sau submit).
  /// False khi được push trực tiếp từ TaskListScreen (chỉ pop 1 lần).
  final bool fromDetail;

  const CompleteTaskScreen({
    super.key,
    required this.task,
    this.fromDetail = false,
  });

  @override
  State<CompleteTaskScreen> createState() => _CompleteTaskScreenState();
}

class _CompleteTaskScreenState extends State<CompleteTaskScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _runningHoursController = TextEditingController();

  /// Giờ chạy máy chỉ bắt buộc khi chu kỳ bảo dưỡng tính theo giờ chạy.
  bool get _requiresRunningHours {
    final type = widget.task.taskType.toUpperCase();
    return type == 'RUNNING_HOURS' || type == 'HYBRID' || (type != 'CALENDAR' && widget.task.intervalHours != null);
  }
  final _sparePartsController = TextEditingController();
  final _notesController = TextEditingController();
  final _actualDurationController = TextEditingController();
  final _startDateController = TextEditingController();
  final _endDateController = TextEditingController();
  final _descriptionController = TextEditingController();
  
  // Tab controller for Work Report layout
  late TabController _tabController;
  
  // Date format
  static final _dateFormat = DateFormat('dd MMM yyyy');
  static final _dateTimeFormat = DateFormat('dd MMM yyyy HH:mm');
  
  bool _isSubmitting = false;
  
  // Checklist state - local copy that can be toggled
  late List<TaskChecklistItem> _checklistItems;
  bool _isTogglingChecklist = false;
  
  // Spare parts from task requirements (display only)
  List<Map<String, dynamic>> _requiredSpareParts = [];
  
  // Actually used spare parts (selected from inventory)
  List<Map<String, dynamic>> _actuallyUsedSpareParts = [];

  @override
  void initState() {
    super.initState();
    // Initialize tab controller (3 tabs: Report, Checklist, Materials)
    _tabController = TabController(length: 3, vsync: this);
    
    // Pre-fill running hours: prefer live currentRunningHours, fallback to last done
    final prefillRH = widget.task.currentRunningHours ?? widget.task.runningHoursAtLastDone;
    if (prefillRH != null) {
      _runningHoursController.text = prefillRH.toString();
    }
    // Pre-fill description
    _descriptionController.text = widget.task.taskDescription;

    // Initialize local checklist state from task
    _checklistItems = List.from(widget.task.checklistItems);
    
    // Parse required spare parts (display only)
    _initializeRequiredSpareParts();
    
    // Load draft spare parts from cache (if user previously exited without submitting)
    _loadDraftSpareParts();
    
    // Load draft form data (notes, etc.)
    _loadDraftFormData();

    // Load latest checklist status from cache/API
    _loadChecklistStatus();
  }

  Future<void> _loadChecklistStatus() async {
    try {
      final repository = sl<TaskRepository>();
      // Use taskId (which is the task code/ID used for API calls)
      final items = await repository.getTaskChecklist(widget.task.taskId);
      
      // Load draft checklist state (local changes not yet submitted)
      await _loadDraftChecklistState(items);
      
      if (mounted) {
        setState(() {
          _checklistItems = items;
        });
        debugPrint('✅ Loaded ${items.length} checklist items from repository');
      }
    } catch (e) {
      debugPrint('⚠️ Error loading checklist status: $e');
    }
  }
  
  /// Load draft checklist state from cache
  Future<void> _loadDraftChecklistState(List<TaskChecklistItem> items) async {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftChecklistPrefix}${widget.task.id}';
      final cached = await cacheManager.getDataNoExpiry(draftKey);
      
      if (cached != null && cached is Map<String, dynamic>) {
        final draftStates = Map<String, dynamic>.from(cached);
        
        // Apply draft states to items
        for (int i = 0; i < items.length; i++) {
          final itemId = items[i].id;
          if (draftStates.containsKey(itemId)) {
            final draftState = draftStates[itemId] as Map<String, dynamic>;
            items[i] = items[i].copyWith(
              isCompleted: draftState['isCompleted'] ?? items[i].isCompleted,
              readingValue: draftState['readingValue']?.toDouble(),
              remarks: draftState['remarks'],
              isAbnormal: draftState['isAbnormal'] ?? items[i].isAbnormal,
            );
          }
        }
        
        debugPrint('📦 Applied draft checklist state for task ${widget.task.id}');
      }
    } catch (e) {
      debugPrint('⚠️ Error loading draft checklist state: $e');
    }
  }
  
  /// Save draft checklist state to cache
  Future<void> _saveDraftChecklistState() async {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftChecklistPrefix}${widget.task.id}';
      
      // Create state map from current checklist
      final draftStates = <String, dynamic>{};
      
      for (final item in _checklistItems) {
        draftStates[item.id] = {
          'isCompleted': item.isCompleted,
          'readingValue': item.readingValue,
          'remarks': item.remarks,
          'isAbnormal': item.isAbnormal,
          'savedAt': DateTime.now().toIso8601String(),
        };
      }
      
      await cacheManager.saveDataForOffline(draftKey, draftStates);
      debugPrint('💾 Saved draft checklist state for task ${widget.task.id}');
    } catch (e) {
      debugPrint('⚠️ Error saving draft checklist state: $e');
    }
  }
  
  /// Load draft spare parts from cache - similar to checklist pending mechanism
  Future<void> _loadDraftSpareParts() async {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftSparePartsPrefix}${widget.task.id}';
      final cached = await cacheManager.getDataNoExpiry(draftKey);
      
      if (cached != null && cached is List) {
        setState(() {
          _actuallyUsedSpareParts = List<Map<String, dynamic>>.from(
            cached.map((item) => Map<String, dynamic>.from(item as Map))
          );
        });
        debugPrint('📦 Loaded ${_actuallyUsedSpareParts.length} draft spare parts for task ${widget.task.id}');
      }
    } catch (e) {
      debugPrint('⚠️ Error loading draft spare parts: $e');
    }
  }
  
  /// Save draft spare parts to cache when user adds/removes/edits
  Future<void> _saveDraftSpareParts() async {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftSparePartsPrefix}${widget.task.id}';
      
      if (_actuallyUsedSpareParts.isEmpty) {
        // Clear cache if empty
        await cacheManager.clearCache(draftKey);
      } else {
        // Save to cache for offline persistence
        await cacheManager.saveDataForOffline(draftKey, _actuallyUsedSpareParts);
      }
      
      // Sync to server for real-time visibility on edge frontend
      await _syncSparePartsToServer();
      
      debugPrint('💾 Saved ${_actuallyUsedSpareParts.length} draft spare parts for task ${widget.task.id}');
    } catch (e) {
      debugPrint('⚠️ Error saving draft spare parts: $e');
    }
  }
  
  /// Sync spare parts to server for real-time visibility
  Future<void> _syncSparePartsToServer() async {
    try {
      final repository = sl<TaskRepository>();
      await repository.syncSparePartsUsed(
        taskCode: widget.task.taskId,
        sparePartsUsed: _actuallyUsedSpareParts,
      );
      debugPrint('✅ Synced spare parts to server for task ${widget.task.taskId}');
    } catch (e) {
      debugPrint('⚠️ Error syncing spare parts to server: $e');
      // Don't throw - this is for real-time visibility, not critical
    }
  }
  
  /// Clear draft after successful submission
  Future<void> _clearDraftData() async {
    try {
      final cacheManager = sl<CacheManager>();
      await cacheManager.clearCache('${CacheKeys.draftSparePartsPrefix}${widget.task.id}');
      await cacheManager.clearCache('${CacheKeys.draftTaskFormPrefix}${widget.task.id}');
      await cacheManager.clearCache('${CacheKeys.draftChecklistPrefix}${widget.task.id}');
      debugPrint('🧹 Cleared draft data for task ${widget.task.id}');
    } catch (e) {
      debugPrint('⚠️ Error clearing draft data: $e');
    }
  }
  
  /// Load draft form data (notes)
  Future<void> _loadDraftFormData() async {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftTaskFormPrefix}${widget.task.id}';
      final cached = await cacheManager.getDataNoExpiry(draftKey);
      
      if (cached != null && cached is Map) {
        final data = Map<String, dynamic>.from(cached);
        if (data['notes'] != null && _notesController.text.isEmpty) {
          _notesController.text = data['notes'].toString();
        }
        debugPrint('📦 Loaded draft form data for task ${widget.task.id}');
      }
    } catch (e) {
      debugPrint('⚠️ Error loading draft form data: $e');
    }
  }
  
  /// Save draft form data
  Future<void> _saveDraftFormData() async {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftTaskFormPrefix}${widget.task.id}';
      
      final data = {
        'notes': _notesController.text,
        'savedAt': DateTime.now().toIso8601String(),
      };
      
      await cacheManager.saveDataForOffline(draftKey, data);
    } catch (e) {
      debugPrint('⚠️ Error saving draft form data: $e');
    }
  }
  
  void _initializeRequiredSpareParts() {
    try {
      // Use requiredSpareParts field (from schedule config), NOT sparePartsUsed (which is for completion)
      final spareParts = widget.task.requiredSpareParts;
      if (spareParts != null && spareParts.startsWith('[')) {
        final parsed = json.decode(spareParts);
        if (parsed is List) {
          _requiredSpareParts = List<Map<String, dynamic>>.from(
            parsed.map((item) => Map<String, dynamic>.from(item))
          );
        }
      }
    } catch (e) {
      debugPrint('Error parsing spare parts: $e');
    }
  }

  @override
  void dispose() {
    // Save draft states before disposing (user might return later)
    _saveDraftFormData();
    _saveDraftSparePartsSync();
    _saveDraftChecklistStateSync();
    
    _tabController.dispose();
    _runningHoursController.dispose();
    _sparePartsController.dispose();
    _notesController.dispose();
    _actualDurationController.dispose();
    _startDateController.dispose();
    _endDateController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }
  
  // Synchronous version for dispose - won't wait for network
  void _saveDraftSparePartsSync() {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftSparePartsPrefix}${widget.task.id}';
      
      if (_actuallyUsedSpareParts.isEmpty) {
        cacheManager.clearCache(draftKey);
      } else {
        cacheManager.saveDataForOffline(draftKey, _actuallyUsedSpareParts);
      }
    } catch (e) {
      debugPrint('⚠️ Error saving draft spare parts sync: $e');
    }
  }
  
  // Synchronous version for dispose - won't wait for network
  void _saveDraftChecklistStateSync() {
    try {
      final cacheManager = sl<CacheManager>();
      final draftKey = '${CacheKeys.draftChecklistPrefix}${widget.task.id}';
      
      final draftStates = <String, dynamic>{};
      for (final item in _checklistItems) {
        draftStates[item.id] = {
          'isCompleted': item.isCompleted,
          'readingValue': item.readingValue,
          'remarks': item.remarks,
          'isAbnormal': item.isAbnormal,
          'savedAt': DateTime.now().toIso8601String(),
        };
      }
      
      cacheManager.saveDataForOffline(draftKey, draftStates);
    } catch (e) {
      debugPrint('⚠️ Error saving draft checklist sync: $e');
    }
  }

  String _getSubmissionErrorMessage(Object error, AppLocalizations l10n) {
    if (error is TaskSubmissionException) {
      final data = error.data;
      switch (error.code) {
        case 'RUNNING_HOURS_BELOW_CURRENT':
          final current = data['current']?.toString() ?? '-';
          final requested = data['requested']?.toString() ?? '-';
          return l10n.runningHoursBelowCurrent(current, requested);
        case 'INSUFFICIENT_STOCK':
          final material = data['materialName'] ?? data['materialCode'] ?? 'vật tư';
          final available = data['available']?.toString() ?? '-';
          final required = data['required']?.toString() ?? '-';
          return l10n.insufficientStockForMaterial(material.toString(), available, required);
        default:
          return data['error']?.toString() ?? l10n.errorCompletingTask(error.code);
      }
    }

    return l10n.errorCompletingTask(error.toString());
  }

  Future<void> _submitCompletion() async {
    final l10n = AppLocalizations.of(context);
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final taskProvider = Provider.of<TaskProvider>(context, listen: false);
      final syncProvider = Provider.of<SyncProvider>(context, listen: false);

        // Build spare parts usage JSON from actually used list
        final sparePartsJson = _actuallyUsedSpareParts.isNotEmpty 
            ? json.encode(_actuallyUsedSpareParts)
            : _sparePartsController.text.trim().isEmpty ? null : _sparePartsController.text.trim();

        // RECTIFY tasks are still in RECTIFY status – must start first (→ IN_PROGRESS)
        // before submitting, otherwise backend rejects with 400.
        if (widget.task.isRectify) {
          await taskProvider.startTask(widget.task.id);
        }

        // Backend uses headers for user identity; body carries workflow fields only.
        final actualDurationHours = double.tryParse(
          _actualDurationController.text.trim().replaceAll(',', '.'),
        );

        await taskProvider.submitTask(
        taskId: widget.task.id,
        runningHours: double.tryParse(_runningHoursController.text),
        sparePartsUsed: sparePartsJson,
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
        actualDurationMinutes: actualDurationHours == null
            ? null
            : (actualDurationHours * 60).round(),
      );

      // Trigger sync if online
      if (syncProvider.isOnline) {
        await syncProvider.syncQueue();
      }
      
      // Clear draft data after successful submission
      await _clearDraftData();

      if (mounted) {
        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    syncProvider.isOnline
                        ? l10n.taskCompletedSuccessfully
                        : l10n.taskSavedWillSync,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            backgroundColor: MaritimeTheme.success,
            duration: const Duration(seconds: 3),
          ),
        );

        // Pop back: 2 lần nếu đến từ TaskDetailScreen, 1 lần nếu đến trực tiếp từ list
        if (mounted) {
          Navigator.pop(context); // Close complete screen
          if (mounted && widget.fromDetail) {
            Navigator.pop(context); // Close detail screen
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_getSubmissionErrorMessage(e, AppLocalizations.of(context))),
            backgroundColor: MaritimeTheme.error,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final syncProvider = Provider.of<SyncProvider>(context);
    final l10n = AppLocalizations.of(context);
    final completedCount = _checklistItems.where((i) => i.isCompleted).length;
    final abnormalCount = _checklistItems.where((i) => i.isAbnormal).length;
    final notCheckedCount = _checklistItems.where((i) => !i.isCompleted).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Báo cáo công việc'),
        actions: [
          // Save draft
          IconButton(
            icon: const Icon(Icons.save_outlined),
            tooltip: l10n.save,
            onPressed: () async {
              await _saveDraftFormData();
              await _saveDraftChecklistState();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Đã lưu nháp'),
                    duration: Duration(seconds: 1),
                    backgroundColor: MaritimeTheme.accent,
                  ),
                );
              }
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: const Icon(Icons.description, size: 20),
              text: 'Báo cáo',
            ),
            Tab(
              icon: Badge(
                label: Text('$completedCount/${_checklistItems.length}'),
                backgroundColor: completedCount == _checklistItems.length && _checklistItems.isNotEmpty
                    ? MaritimeTheme.success : MaritimeTheme.warning,
                child: const Icon(Icons.checklist, size: 20),
              ),
              text: 'Kiểm tra',
            ),
            Tab(
              icon: Badge(
                isLabelVisible: _actuallyUsedSpareParts.isNotEmpty,
                label: Text('${_actuallyUsedSpareParts.length}'),
                child: const Icon(Icons.build, size: 20),
              ),
              text: 'Vật tư',
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          Form(
            key: _formKey,
            child: Column(
              children: [
                // Task Info Header (always visible)
                _buildTaskInfoHeader(context, l10n),
                
                // ĐGRR / BBKT required warning
                if (widget.task.requireRiskAssessment || widget.task.requireInspectionReport)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    color: MaritimeTheme.warningSoft,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.warning_amber_rounded, color: MaritimeTheme.warning, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Công việc này yêu cầu điền '
                            '${[if (widget.task.requireRiskAssessment) 'ĐGRR', if (widget.task.requireInspectionReport) 'BBKT'].join(' và ')} '
                            'trên giao diện web trước khi hoàn thành.',
                            style: TextStyle(fontSize: 12, color: MaritimeTheme.warning),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Offline Warning
                if (!syncProvider.isOnline)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    color: MaritimeTheme.warningSoft,
                    child: Row(
                      children: [
                        Icon(Icons.cloud_off, color: MaritimeTheme.warning, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            l10n.offlineTaskWillSync,
                            style: TextStyle(fontSize: 12, color: MaritimeTheme.warning),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Tab content
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildReportTab(context, l10n),
                      _buildChecklistTab(context, l10n, completedCount, abnormalCount, notCheckedCount),
                      _buildMaterialsTab(context, l10n),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Loading Overlay
          if (_isSubmitting)
            LoadingOverlay(
              message: syncProvider.isOnline
                  ? l10n.completingTask
                  : l10n.savingForOfflineSync,
            ),
        ],
      ),
      // Bottom Submit Button
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.08),
              blurRadius: 12,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submitCompletion,
                icon: _isSubmitting
                    ? const SizedBox(
                        height: 18, width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send, size: 20),
                label: Text(
                  'Hoàn thành báo cáo',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: MaritimeTheme.success,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 2,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Task Info Header — always visible above tabs (mirrors Edge Work Report header)
  Widget _buildTaskInfoHeader(BuildContext context, AppLocalizations l10n) {
    final task = widget.task;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: MaritimeTheme.divider)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Task code + Status + Priority row
          Row(
            children: [
              Expanded(
                child: Text(
                  task.taskId,
                  style: TextStyle(fontSize: 12, color: MaritimeTheme.textSecondary, fontWeight: FontWeight.w500),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: task.statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: task.statusColor.withOpacity(0.4)),
                ),
                child: Text(
                  _statusLabel(task.status),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: task.statusColor),
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: task.priorityColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  _priorityLabel(task.priority),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: task.priorityColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Task name
          Text(
            task.displayName,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          // Equipment info row
          if (task.equipmentId != null || task.equipmentName != null)
            Row(
              children: [
                Icon(Icons.settings, size: 14, color: MaritimeTheme.textTertiary),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${task.equipmentId ?? ''} — ${task.equipmentName ?? ''}',
                    style: TextStyle(fontSize: 12, color: MaritimeTheme.textSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          const SizedBox(height: 4),
          // Due date + Report date
          Row(
            children: [
              Icon(Icons.event, size: 14, color: MaritimeTheme.textTertiary),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  '${l10n.dueDate}: ${_formatDate(task.nextDueAt)}',
                  style: TextStyle(fontSize: 12, color: MaritimeTheme.textSecondary),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.calendar_today, size: 14, color: MaritimeTheme.textTertiary),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  'Ngày BĐ: ${_dateFormat.format(DateTime.now())}',
                  style: TextStyle(fontSize: 12, color: MaritimeTheme.textSecondary),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Tab 1: Báo cáo (Report) — running hours, notes, photos
  Widget _buildReportTab(BuildContext context, AppLocalizations l10n) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Task Description
          Text(
            'Mô tả công việc',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: MaritimeTheme.surfaceLight,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: MaritimeTheme.divider),
            ),
            width: double.infinity,
            child: Text(
              widget.task.taskDescription.isNotEmpty 
                  ? widget.task.taskDescription 
                  : '—',
              style: TextStyle(fontSize: 14, color: MaritimeTheme.textSecondary, height: 1.5),
            ),
          ),

          const SizedBox(height: 20),

          // Running Hours Field — chỉ BẮT BUỘC với công việc tính theo giờ chạy máy (RUNNING_HOURS / HYBRID).
          // Công việc theo lịch (CALENDAR) vẫn nhập được nếu muốn, nhưng không bắt thuyền viên điền số bịa.
          Text(
            _requiresRunningHours ? l10n.runningHoursRequired : l10n.runningHoursRequired.replaceAll('*', '').trim(),
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _runningHoursController,
            decoration: InputDecoration(
              hintText: l10n.enterCurrentRunningHours,
              prefixIcon: const Icon(Icons.access_time, size: 20),
              suffixText: l10n.hours,
              border: const OutlineInputBorder(),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
            ],
            validator: (value) {
              if (value == null || value.isEmpty) {
                return _requiresRunningHours ? l10n.pleaseEnterRunningHours : null;
              }
              final hours = double.tryParse(value);
              if (hours == null || hours < 0) {
                return l10n.pleaseEnterValidNumber;
              }
              final minimumHours = widget.task.currentRunningHours ?? widget.task.runningHoursAtLastDone;
              if (minimumHours != null && hours < minimumHours) {
                return l10n.runningHoursBelowCurrent(
                  minimumHours.toString(),
                  hours.toString(),
                );
              }
              return null;
            },
          ),

          const SizedBox(height: 20),

          // Actual Duration Field
          Text(
            'Thời gian thực hiện',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _actualDurationController,
            decoration: const InputDecoration(
              hintText: 'Nhập thời gian thực hiện',
              prefixIcon: Icon(Icons.timer_outlined, size: 20),
              suffixText: 'giờ',
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d*[,.]?\d{0,2}')),
            ],
          ),

          const SizedBox(height: 20),

          // Notes Field
          Text(
            l10n.notes,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _notesController,
            decoration: InputDecoration(
              hintText: l10n.addAdditionalNotes,
              border: const OutlineInputBorder(),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            maxLines: 4,
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  /// Tab 2: Hạng mục kiểm tra (Checklist) — table-like UI mirroring Edge
  Widget _buildChecklistTab(
    BuildContext context,
    AppLocalizations l10n,
    int completedCount,
    int abnormalCount,
    int notCheckedCount,
  ) {
    if (_checklistItems.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.checklist, size: 64, color: MaritimeTheme.border),
            const SizedBox(height: 12),
            Text(l10n.noChecklistYet, style: TextStyle(color: MaritimeTheme.textTertiary)),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Summary bar (Đạt / Chưa kiểm tra / Bất thường)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: MaritimeTheme.surfaceLight,
            border: Border(bottom: BorderSide(color: MaritimeTheme.divider)),
          ),
          child: Row(
            children: [
              _buildChecklistStat('Đạt', completedCount, MaritimeTheme.success),
              const SizedBox(width: 16),
              _buildChecklistStat('Chưa KT', notCheckedCount, MaritimeTheme.textTertiary),
              const SizedBox(width: 16),
              _buildChecklistStat('Bất thường', abnormalCount, MaritimeTheme.error),
              const Spacer(),
              // Progress
              Text(
                '${(completedCount / _checklistItems.length * 100).toStringAsFixed(0)}%',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: completedCount == _checklistItems.length ? MaritimeTheme.success : MaritimeTheme.warning,
                ),
              ),
            ],
          ),
        ),
        // Checklist items as cards (table-like)
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: _checklistItems.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final item = _checklistItems[index];
              return _buildChecklistCard(item, index, l10n);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildChecklistStat(String label, int count, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          '$label: $count',
          style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  /// Checklist item card — mirrors Edge table row (TT / Mã TB / Tên TB / Giá trị đo / Tình trạng / Bất thường / Ghi chú)
  Widget _buildChecklistCard(TaskChecklistItem item, int index, AppLocalizations l10n) {
    final statusText = item.isCompleted
        ? (item.isAbnormal ? 'Bất thường' : 'Đạt')
        : 'Chưa kiểm tra';
    final statusColor = item.isCompleted
        ? (item.isAbnormal ? MaritimeTheme.error : MaritimeTheme.success)
        : MaritimeTheme.textTertiary;

    return InkWell(
      onTap: _isTogglingChecklist ? null : () => _toggleChecklistItem(index),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: item.isCompleted
                ? (item.isAbnormal ? MaritimeTheme.errorBorder : MaritimeTheme.successBorder)
                : MaritimeTheme.divider,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.03),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Row 1: Sequence + Asset Code + Asset Name + Status icon
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Sequence number
                Container(
                  width: 28, height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${index + 1}',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: statusColor),
                  ),
                ),
                const SizedBox(width: 10),
                // Asset info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.assetCode,
                        style: TextStyle(fontSize: 11, color: MaritimeTheme.textTertiary, fontWeight: FontWeight.w500),
                      ),
                      Text(
                        item.assetName,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: item.isCompleted ? MaritimeTheme.textSecondary : Colors.black87,
                          decoration: item.isCompleted ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      if (item.checkpointDescription != null && item.checkpointDescription!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            item.checkpointDescription!,
                            style: TextStyle(fontSize: 12, color: MaritimeTheme.textTertiary),
                          ),
                        ),
                    ],
                  ),
                ),
                // Status icon
                Icon(
                  item.isCompleted ? Icons.check_circle : Icons.radio_button_unchecked,
                  color: statusColor,
                  size: 24,
                ),
              ],
            ),
            
            const SizedBox(height: 8),
            
            // Row 2: Measured value + Status + Abnormal flag
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Measured value — Flexible so it never overflows
                if (item.requiresReading)
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: item.readingValue != null
                            ? (item.isAbnormal ? MaritimeTheme.errorSoft : MaritimeTheme.accentSoft)
                            : MaritimeTheme.surface,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: item.readingValue != null
                              ? (item.isAbnormal ? MaritimeTheme.errorBorder : MaritimeTheme.accentBorder)
                              : MaritimeTheme.border,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.straighten, size: 14,
                                color: item.isAbnormal ? MaritimeTheme.error : MaritimeTheme.accent,
                              ),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  item.readingValue != null
                                      ? '${item.readingValue} ${item.unit ?? ''}'
                                      : l10n.enterMeasuredValue,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: item.isAbnormal ? MaritimeTheme.error : MaritimeTheme.primary,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          if (item.minValue != null && item.maxValue != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              '(${item.minValue}-${item.maxValue})',
                              style: TextStyle(fontSize: 10, color: MaritimeTheme.textTertiary),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                
                if (item.requiresReading) const SizedBox(width: 8),
                
                // Status badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    statusText,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor),
                  ),
                ),
                
                // Abnormal badge
                if (item.isAbnormal) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: MaritimeTheme.errorSoft,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: MaritimeTheme.errorBorder),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.warning_amber, size: 12, color: MaritimeTheme.error),
                        SizedBox(width: 2),
                        Text('BT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: MaritimeTheme.error)),
                      ],
                    ),
                  ),
                ],
                
                // Mandatory badge
                if (item.isMandatory && !item.isCompleted) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: MaritimeTheme.errorSoft,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      l10n.required,
                      style: const TextStyle(fontSize: 10, color: MaritimeTheme.error, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ],
            ),
            
            // Remarks
            if (item.remarks != null && item.remarks!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.comment, size: 14, color: MaritimeTheme.textTertiary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      item.remarks!,
                      style: TextStyle(fontSize: 12, color: MaritimeTheme.textSecondary, fontStyle: FontStyle.italic),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Tab 3: Vật tư (Materials)
  Widget _buildMaterialsTab(BuildContext context, AppLocalizations l10n) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Required Spare Parts Section (display only - reference)
          if (_requiredSpareParts.isNotEmpty) ...[
            _buildRequiredSparePartsSection(context),
            const SizedBox(height: 16),
          ],

          // Actually Used Spare Parts Section (user selects from inventory)
          _buildActuallyUsedSparePartsSection(context),
        ],
      ),
    );
  }

  String _statusLabel(String status) {
    const labels = {
      'SCHEDULED': 'Chưa bắt đầu',
      'DUE': 'Đến hạn',
      'OVERDUE': 'Quá hạn',
      'IN_PROGRESS': 'Đang thực hiện',
      'PENDING_APPROVAL': 'Chờ duyệt',
      'RECTIFY': 'Trả hoàn',
      'COMPLETED': 'Hoàn thành',
      'CANCELLED': 'Hủy bỏ',
    };
    return labels[status] ?? status;
  }

  String _priorityLabel(String priority) {
    const labels = {
      'CRITICAL': 'Rất cao',
      'HIGH': 'Cao',
      'NORMAL': 'Trung bình',
      'LOW': 'Thấp',
    };
    return labels[priority] ?? priority;
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '—';
    try {
      return _dateFormat.format(DateTime.parse(dateStr));
    } catch (_) {
      return dateStr;
    }
  }

  /// Checklist Section — kept for compatibility but now used inside checklistTab
  /// (No longer used directly — _buildChecklistTab replaces this)

  Future<void> _toggleChecklistItem(int index) async {
    if (_isTogglingChecklist) return;
    
    final item = _checklistItems[index];
    
    // If item requires reading and not completed, show dialog to enter reading
    if (item.requiresReading && !item.isCompleted) {
      _showReadingDialog(index);
      return;
    }
    
    setState(() => _isTogglingChecklist = true);
    
    // Calculate new state BEFORE updating
    final newIsCompleted = !item.isCompleted;
    
    try {
      final taskProvider = Provider.of<TaskProvider>(context, listen: false);
      
      // Update local state FIRST for instant UI feedback
      _checklistItems[index] = item.copyWith(isCompleted: newIsCompleted);
      
      // Single setState after all state changes
      if (mounted) setState(() {});
      
      // Call API in background with explicit isCompleted state
      taskProvider.completeChecklistItem(
        taskCode: widget.task.taskId,
        itemId: item.id,
        readingValue: item.readingValue,
        isCompleted: newIsCompleted, // Pass explicit state for toggle support
      ).then((_) {
        // Save draft state after successful API call
        _saveDraftChecklistState();
      }).catchError((e) {
        // Revert on error
        if (mounted) {
          _checklistItems[index] = item; // Revert to original
          setState(() {});
          final l10n = AppLocalizations.of(context)!;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l10n.errorPrefix(e.toString())),
              backgroundColor: MaritimeTheme.error,
            ),
          );
        }
      });
    } finally {
      if (mounted) {
        setState(() => _isTogglingChecklist = false);
      }
    }
  }

  void _showReadingDialog(int index) {
    final item = _checklistItems[index];
    final readingController = TextEditingController(text: item.readingValue?.toString() ?? '');
    
    showDialog(
      context: context,
      builder: (ctx) => _ReadingInputDialog(
        item: item,
        controller: readingController,
        onSubmit: (value, isAbnormal) async {
          Navigator.pop(ctx);
          if (isAbnormal) {
            // Show confirmation dialog for abnormal values
            final l10n = AppLocalizations.of(context);
            final confirmed = await showDialog<bool>(
              context: context,
              builder: (confirmCtx) => AlertDialog(
                title: Row(
                  children: [
                    Icon(Icons.warning_amber, color: MaritimeTheme.warning),
                    const SizedBox(width: 8),
                    Flexible(child: Text(l10n.abnormalValue)),
                  ],
                ),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.measuredValueIs(value.toString(), item.unit ?? ''),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    if (item.minValue != null && item.maxValue != null)
                      Text(
                        l10n.allowedRange(item.minValue.toString(), item.maxValue.toString(), item.unit ?? ''),
                        style: TextStyle(color: MaritimeTheme.textSecondary),
                      ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.warningSoft,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: MaritimeTheme.warningBorder),
                      ),
                      child: Text(
                        l10n.confirmAbnormalValue,
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(confirmCtx, false),
                    child: Text(l10n.reenter),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(confirmCtx, true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: MaritimeTheme.warning,
                    ),
                    child: Text(l10n.confirmRecord),
                  ),
                ],
              ),
            );
            
            if (confirmed != true) {
              // Re-open the reading dialog
              _showReadingDialog(index);
              return;
            }
          }
          await _submitReadingValue(index, value);
        },
      ),
    );
  }

  Future<void> _submitReadingValue(int index, double? readingValue) async {
    if (readingValue == null) return;
    
    setState(() => _isTogglingChecklist = true);
    final l10n = AppLocalizations.of(context);
    
    try {
      final item = _checklistItems[index];
      final taskProvider = Provider.of<TaskProvider>(context, listen: false);
      
      // Check if reading is within acceptable range
      bool isAbnormal = false;
      if (item.minValue != null && readingValue < item.minValue!) {
        isAbnormal = true;
      }
      if (item.maxValue != null && readingValue > item.maxValue!) {
        isAbnormal = true;
      }
      
      // Call API
      await taskProvider.completeChecklistItem(
        taskCode: widget.task.taskId,
        itemId: item.id,
        readingValue: readingValue,
        remarks: isAbnormal ? l10n.valueOutOfRange : null,
        isAbnormal: isAbnormal,
      );
      
      // Update local state
      setState(() {
        _checklistItems[index] = item.copyWith(
          isCompleted: true,
          readingValue: readingValue,
          isAbnormal: isAbnormal,
        );
      });
      
      // Save draft state for offline persistence
      await _saveDraftChecklistState();
      
      // Trigger immediate sync if online to update edge frontend
      try {
        final syncQueue = sl<SyncQueue>();
        await syncQueue.processSyncQueue();
      } catch (e) {
        debugPrint('⚠️ Error processing sync queue: $e');
        // Don't throw - checklist update already succeeded
      }
      
      if (isAbnormal && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.valueOutOfRangeWarning(readingValue.toString(), item.minValue?.toString() ?? '', item.maxValue?.toString() ?? '')),
            backgroundColor: MaritimeTheme.warning,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.errorMessage(e.toString())), backgroundColor: MaritimeTheme.error),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isTogglingChecklist = false);
      }
    }
  }

  /// Old checklist item widget — replaced by _buildChecklistCard
  /// Kept as reference, no longer called

  /// Build Required Spare Parts Section - DISPLAY ONLY
  Widget _buildRequiredSparePartsSection(BuildContext context) {
    if (_requiredSpareParts.isEmpty) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);

    return Card(
      color: MaritimeTheme.accentSoft,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.list_alt, color: MaritimeTheme.primary, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.sparePartsReference,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: MaritimeTheme.primary,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ..._requiredSpareParts.map((part) => _buildRequiredSparePartItem(part)),
          ],
        ),
      ),
    );
  }

  Widget _buildRequiredSparePartItem(Map<String, dynamic> part) {
    final l10n = AppLocalizations.of(context);
    final materialName = part['materialName']?.toString() ?? 
                         part['name']?.toString() ?? 
                         l10n.unknownMaterial;
    final materialCode = part['materialCode']?.toString() ?? 
                         part['code']?.toString() ?? '';
    final quantityRequired = part['quantityRequired'] ?? 0;
    final isMandatory = part['isMandatory'] ?? false;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(
            isMandatory ? Icons.warning_amber : Icons.inventory_2,
            color: isMandatory ? MaritimeTheme.error : MaritimeTheme.textTertiary,
            size: 16,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  materialName,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                ),
                if (materialCode.isNotEmpty)
                  Text(
                    l10n.materialCodeQuantity(materialCode, quantityRequired.toString()),
                    style: TextStyle(fontSize: 10, color: MaritimeTheme.textSecondary),
                  ),
              ],
            ),
          ),
          if (isMandatory)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: MaritimeTheme.errorSoft,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                l10n.required,
                style: const TextStyle(fontSize: 10, color: MaritimeTheme.error, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }

  /// Build Actually Used Spare Parts Section - COMBOBOX from inventory
  Widget _buildActuallyUsedSparePartsSection(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Card(
      color: MaritimeTheme.warningSoft,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.build, color: MaritimeTheme.warning, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.sparePartsActuallyUsed,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: MaritimeTheme.warning,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              l10n.selectMaterialFromInventory,
              style: TextStyle(
                fontSize: 12,
                color: MaritimeTheme.warning,
                fontStyle: FontStyle.italic,
              ),
            ),
            const SizedBox(height: 12),
            
            // List of actually used spare parts
            if (_actuallyUsedSpareParts.isNotEmpty) ...[
              ..._actuallyUsedSpareParts.asMap().entries.map((entry) => 
                _buildActuallyUsedItem(entry.key, entry.value)),
              const SizedBox(height: 8),
            ],
            
            // Add button
            OutlinedButton.icon(
              onPressed: _showAddMaterialDialog,
              icon: const Icon(Icons.add),
              label: Text(l10n.addUsedMaterial),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                side: BorderSide(color: MaritimeTheme.warning),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActuallyUsedItem(int index, Map<String, dynamic> item) {
    final l10n = AppLocalizations.of(context);
    final materialName = item['materialName']?.toString() ?? 'Unknown';
    final materialCode = item['materialCode']?.toString() ?? '';
    final quantityUsed = item['quantityUsed'] ?? 0;
    final unit = item['unit']?.toString() ?? 'pcs';
    final onHand = item['onHandQuantity'] ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: MaritimeTheme.warningBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  materialName,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  l10n.materialCodeStock(materialCode, onHand.toString(), unit),
                  style: TextStyle(fontSize: 10, color: MaritimeTheme.textSecondary),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(l10n.quantityUsed, style: const TextStyle(fontSize: 12)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.warningSoft,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '$quantityUsed $unit',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: MaritimeTheme.warning,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit, size: 20),
            onPressed: () => _showEditQuantityDialog(index, item),
            color: MaritimeTheme.accent,
          ),
          IconButton(
            icon: const Icon(Icons.delete, size: 20),
            onPressed: () {
              setState(() {
                _actuallyUsedSpareParts.removeAt(index);
              });
              _saveDraftSpareParts(); // Auto-save after removal
            },
            color: MaritimeTheme.error,
          ),
        ],
      ),
    );
  }

  void _showAddMaterialDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _MaterialSelectionSheet(
        taskProvider: Provider.of<TaskProvider>(context, listen: false),
        requiredParts: _requiredSpareParts,
        alreadyUsedParts: _actuallyUsedSpareParts,
        onMaterialSelected: (material) {
          Navigator.pop(ctx);
          _showQuantityInputDialog(material);
        },
      ),
    );
  }

  void _showQuantityInputDialog(Map<String, dynamic> material) {
    final quantityController = TextEditingController(text: '1');
    final name = material['name']?.toString() ?? 'Unknown';
    final onHand = material['onHandQuantity'] ?? 0;
    final unit = material['unit']?.toString() ?? 'pcs';
    final l10n = AppLocalizations.of(context);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.enterQuantity),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(l10n.stockOnHand(onHand.toString(), unit), style: TextStyle(color: MaritimeTheme.textSecondary)),
            const SizedBox(height: 16),
            TextField(
              controller: quantityController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: l10n.quantityUsed,
                suffixText: unit,
                border: const OutlineInputBorder(),
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () {
              final qty = double.tryParse(quantityController.text) ?? 0;
              if (qty > 0) {
                setState(() {
                  _actuallyUsedSpareParts.add({
                    'materialItemId': material['id']?.toString() ?? '',
                    'materialCode': material['itemCode']?.toString() ?? '',
                    'materialName': material['name']?.toString() ?? '',
                    'quantityUsed': qty,
                    'unit': unit,
                    'onHandQuantity': onHand,
                  });
                });
                _saveDraftSpareParts(); // Auto-save after adding
                Navigator.pop(context);
              }
            },
            child: Text(l10n.add),
          ),
        ],
      ),
    );
  }

  void _showEditQuantityDialog(int index, Map<String, dynamic> item) {
    final quantityController = TextEditingController(
      text: (item['quantityUsed'] ?? 1).toString(),
    );
    final name = item['materialName']?.toString() ?? 'Unknown';
    final onHand = item['onHandQuantity'] ?? 0;
    final unit = item['unit']?.toString() ?? 'pcs';
    final l10n = AppLocalizations.of(context);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.editQuantity),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(l10n.stockOnHand(onHand.toString(), unit), style: TextStyle(color: MaritimeTheme.textSecondary)),
            const SizedBox(height: 16),
            TextField(
              controller: quantityController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: l10n.quantityUsed,
                suffixText: unit,
                border: const OutlineInputBorder(),
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () {
              final qty = double.tryParse(quantityController.text) ?? 0;
              if (qty > 0) {
                setState(() {
                  _actuallyUsedSpareParts[index]['quantityUsed'] = qty;
                });
                _saveDraftSpareParts(); // Auto-save after editing
                Navigator.pop(context);
              }
            },
            child: Text(l10n.save),
          ),
        ],
      ),
    );
  }
}

/// Separate StatefulWidget for material selection to handle its own state
class _MaterialSelectionSheet extends StatefulWidget {
  final TaskProvider taskProvider;
  final List<Map<String, dynamic>> requiredParts;
  final List<Map<String, dynamic>> alreadyUsedParts;
  final Function(Map<String, dynamic>) onMaterialSelected;

  const _MaterialSelectionSheet({
    required this.taskProvider,
    required this.requiredParts,
    required this.alreadyUsedParts,
    required this.onMaterialSelected,
  });

  @override
  State<_MaterialSelectionSheet> createState() => _MaterialSelectionSheetState();
}

class _MaterialSelectionSheetState extends State<_MaterialSelectionSheet> {
  List<Map<String, dynamic>> _materials = [];
  bool _isLoading = true;
  bool _isOffline = false;
  bool _showRequiredOnly = false;
  late final Set<String> _requiredCodes;
  late final Set<String> _requiredNames;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _requiredCodes = widget.requiredParts
        .map((p) => (p['materialCode'] ?? '').toString().trim().toLowerCase())
        .where((c) => c.isNotEmpty)
        .toSet();
    _requiredNames = widget.requiredParts
        .map((p) => (p['materialName'] ?? '').toString().trim().toLowerCase())
        .where((n) => n.isNotEmpty)
        .toSet();
    // UX: Default to Required view when we actually have a required list
    _showRequiredOnly = widget.requiredParts.isNotEmpty;
    _loadMaterials();
  }

  Future<void> _loadMaterials() async {
    setState(() => _isLoading = true);
    try {
      final materials = await widget.taskProvider.fetchAvailableMaterials();
      final isOnline = await widget.taskProvider.isOnline();
      if (mounted) {
        setState(() {
          _materials = materials;
          _isLoading = false;
          // Check if we're using cached data (materials loaded but might be offline)
          _isOffline = !isOnline;
        });
      }
    } catch (e) {
      debugPrint('Error loading materials: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isOffline = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    bool matchesRequired(Map<String, dynamic> m) {
      if (_requiredCodes.isEmpty && _requiredNames.isEmpty) return false;
      final code = (m['itemCode'] ?? '').toString().trim().toLowerCase();
      final name = (m['name'] ?? '').toString().trim().toLowerCase();
      return (_requiredCodes.isNotEmpty && _requiredCodes.contains(code)) ||
          (_requiredNames.isNotEmpty && _requiredNames.contains(name));
    }

    final filtered = _materials.where((m) {
      final query = _searchController.text.toLowerCase();
      if (query.isEmpty) return true;
      final name = (m['name'] ?? '').toString().toLowerCase();
      final code = (m['itemCode'] ?? '').toString().toLowerCase();
      return name.contains(query) || code.contains(query);
    }).where((m) {
      if (!_showRequiredOnly) return true;
      return matchesRequired(m);
    }).toList();

    final hasRequiredList = widget.requiredParts.isNotEmpty;

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) => Container(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.inventory_2, color: MaritimeTheme.warning),
                const SizedBox(width: 8),
                Text(
                  l10n.selectFromGallery.replaceAll('Gallery', 'Inventory'),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Required-first toggle
            Row(
              children: [
                ChoiceChip(
                  label: Text(l10n.required),
                  selected: _showRequiredOnly,
                  onSelected: hasRequiredList
                      ? (_) => setState(() => _showRequiredOnly = true)
                      : null,
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.spareParts),
                  selected: !_showRequiredOnly,
                  onSelected: (_) => setState(() => _showRequiredOnly = false),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: l10n.searchByEquipmentName,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            // Offline indicator banner
            if (_isOffline && _materials.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: MaritimeTheme.warningSoft,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: MaritimeTheme.warningBorder),
                ),
                child: Row(
                  children: [
                    Icon(Icons.wifi_off, color: MaritimeTheme.warning, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Offline mode - using cached data',
                        style: TextStyle(
                          fontSize: 12,
                          color: MaritimeTheme.warning,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            Text(l10n.materialsCount(filtered.length), style: TextStyle(color: MaritimeTheme.textSecondary)),
            const SizedBox(height: 8),
            Expanded(
              child: _isLoading
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const CircularProgressIndicator(),
                          const SizedBox(height: 16),
                          Text(l10n.loadingMaterials),
                        ],
                      ),
                    )
                  : filtered.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.inventory_2_outlined, size: 48, color: MaritimeTheme.textTertiary),
                              const SizedBox(height: 16),
                              Text(
                                _showRequiredOnly
                                    ? 'No required materials found in inventory'
                                    : l10n.noMaterialsFound,
                              ),
                              const SizedBox(height: 8),
                              if (_showRequiredOnly)
                                TextButton.icon(
                                  onPressed: () => setState(() => _showRequiredOnly = false),
                                  icon: const Icon(Icons.list),
                                  label: const Text('Show all materials'),
                                )
                              else
                                TextButton.icon(
                                  onPressed: _loadMaterials,
                                  icon: const Icon(Icons.refresh),
                                  label: Text(l10n.reload),
                                ),
                            ],
                          ),
                        )
                      : ListView.builder(
                          controller: scrollController,
                          itemCount: filtered.length,
                          itemBuilder: (context, index) {
                            final material = filtered[index];
                            final id = material['id']?.toString() ?? '';
                            final name = material['name']?.toString() ?? 'Unknown';
                            final code = material['itemCode']?.toString() ?? '';
                            final onHand = material['onHandQuantity'] ?? 0;
                            final unit = material['unit']?.toString() ?? 'pcs';
                            
                            // Check if already added
                            final alreadyAdded = widget.alreadyUsedParts.any(
                              (p) => p['materialItemId'] == id
                            );

                            return ListTile(
                              leading: Icon(
                                Icons.inventory_2,
                                color: alreadyAdded ? MaritimeTheme.textTertiary : MaritimeTheme.warning,
                              ),
                              title: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis),
                              subtitle: Text(l10n.materialCode(code, onHand.toString(), unit)),
                              trailing: alreadyAdded
                                  ? const Icon(Icons.check, color: MaritimeTheme.success)
                                  : Icon(Icons.add_circle, color: MaritimeTheme.warning),
                              onTap: alreadyAdded
                                  ? null
                                  : () => widget.onMaterialSelected(material),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

/// Dialog widget for entering reading values with real-time validation
class _ReadingInputDialog extends StatefulWidget {
  final TaskChecklistItem item;
  final TextEditingController controller;
  final Function(double value, bool isAbnormal) onSubmit;

  const _ReadingInputDialog({
    required this.item,
    required this.controller,
    required this.onSubmit,
  });

  @override
  State<_ReadingInputDialog> createState() => _ReadingInputDialogState();
}

class _ReadingInputDialogState extends State<_ReadingInputDialog> {
  bool _isAbnormal = false;
  String? _errorMessage;
  double? _currentValue;

  @override
  void initState() {
    super.initState();
    _validateValue(widget.controller.text);
    widget.controller.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    _validateValue(widget.controller.text);
  }

  void _validateValue(String text) {
    final value = double.tryParse(text);
    setState(() {
      _currentValue = value;
      
      if (text.isEmpty) {
        _errorMessage = null;
        _isAbnormal = false;
        return;
      }
      
      if (value == null) {
        _errorMessage = _getValidNumberError();
        _isAbnormal = false;
        return;
      }
      
      _errorMessage = null;
      
      // Check min/max bounds
      if (widget.item.minValue != null && value < widget.item.minValue!) {
        _isAbnormal = true;
      } else if (widget.item.maxValue != null && value > widget.item.maxValue!) {
        _isAbnormal = true;
      } else {
        _isAbnormal = false;
      }
    });
  }

  String _getValidNumberError() {
    return AppLocalizations.of(context).pleaseEnterValidNumber;
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final hasRange = widget.item.minValue != null || widget.item.maxValue != null;
    
    return AlertDialog(
      title: Text(widget.item.assetName),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Description
            if (widget.item.checkpointDescription != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  widget.item.checkpointDescription!,
                  style: TextStyle(color: MaritimeTheme.textSecondary, fontSize: 14),
                ),
              ),
            
            // Range indicator
            if (hasRange)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: MaritimeTheme.accentSoft,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: MaritimeTheme.accentBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.info_outline, size: 16, color: MaritimeTheme.primary),
                        const SizedBox(width: 6),
                        Text(
                          l10n.allowedRange('', '', '').split(':')[0],
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: MaritimeTheme.primary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _buildRangeText(),
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: MaritimeTheme.primary,
                      ),
                    ),
                  ],
                ),
              ),
            
            // Input field
            TextField(
              controller: widget.controller,
              decoration: InputDecoration(
                labelText: l10n.enterMeasuredValue,
                suffixText: widget.item.unit ?? '',
                border: OutlineInputBorder(
                  borderSide: BorderSide(
                    color: _isAbnormal ? MaritimeTheme.warning : MaritimeTheme.textTertiary,
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(
                    color: _isAbnormal ? MaritimeTheme.warning : MaritimeTheme.textTertiary,
                    width: _isAbnormal ? 2 : 1,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderSide: BorderSide(
                    color: _isAbnormal ? MaritimeTheme.warning : MaritimeTheme.accent,
                    width: 2,
                  ),
                ),
                errorText: _errorMessage,
                errorBorder: const OutlineInputBorder(
                  borderSide: BorderSide(color: MaritimeTheme.error, width: 2),
                ),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              autofocus: true,
            ),
            
            // Warning message for abnormal values
            if (_isAbnormal && _currentValue != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(top: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: MaritimeTheme.warningSoft,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: MaritimeTheme.warningBorder),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.warning_amber, color: MaritimeTheme.warning, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.valueOutOfRange,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: MaritimeTheme.warning,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _buildAbnormalReason(l10n),
                            style: TextStyle(
                              color: MaritimeTheme.warning,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.cancel),
        ),
        ElevatedButton(
          onPressed: _currentValue == null || _errorMessage != null
              ? null
              : () => widget.onSubmit(_currentValue!, _isAbnormal),
          style: ElevatedButton.styleFrom(
            backgroundColor: _isAbnormal ? MaritimeTheme.warning : null,
          ),
          child: Text(_isAbnormal ? l10n.confirmRecord : l10n.confirm),
        ),
      ],
    );
  }

  String _buildRangeText() {
    final min = widget.item.minValue;
    final max = widget.item.maxValue;
    final unit = widget.item.unit ?? '';
    
    if (min != null && max != null) {
      return '$min - $max $unit';
    } else if (min != null) {
      return '≥ $min $unit';
    } else if (max != null) {
      return '≤ $max $unit';
    }
    return '';
  }

  String _buildAbnormalReason(AppLocalizations l10n) {
    if (_currentValue == null) return '';
    
    final min = widget.item.minValue;
    final max = widget.item.maxValue;
    final unit = widget.item.unit ?? '';
    
    if (min != null && _currentValue! < min) {
      return l10n.valueOutOfRangeWarning(_currentValue.toString(), min.toString(), max?.toString() ?? '');
    } else if (max != null && _currentValue! > max) {
      return l10n.valueOutOfRangeWarning(_currentValue.toString(), min?.toString() ?? '', max.toString());
    }
    return '';
  }
}
