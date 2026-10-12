import 'dart:convert';
import 'package:flutter/material.dart';
import '../../../core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../data/models/maintenance_task.dart';
import '../../../data/models/task_checklist_item.dart';
import '../../providers/task_provider.dart';
import '../../widgets/task/priority_badge.dart';
import '../../widgets/task/status_badge.dart';
import 'complete_task_screen.dart';
import 'create_deferral_screen.dart';
import '../../../l10n/app_localizations.dart';

// 🎨 Maritime Professional Color Palette

class TaskDetailScreen extends StatefulWidget {
  final MaintenanceTask task;

  const TaskDetailScreen({
    super.key,
    required this.task,
  });

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  // PERFORMANCE: Static DateFormat instances to avoid recreating on every build
  static final _dateFormat = DateFormat('dd MMM yyyy');
  static final _dateTimeFormat = DateFormat('dd MMM yyyy HH:mm');
  
  List<TaskChecklistItem>? _checklistItems;
  List<dynamic>? _statusHistory;
  bool _loadingChecklist = false;
  String? _checklistError;
  bool _isOffline = false;

  @override
  void initState() {
    super.initState();
    // Load checklist after frame is built to avoid setState during build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadChecklistIfNeeded();
      _loadTaskDetails();
    });
  }

  Future<void> _loadTaskDetails() async {
    if (!mounted) return;
    try {
      final taskProvider = Provider.of<TaskProvider>(context, listen: false);
      final details = await taskProvider.fetchTaskDetails(widget.task.id);
      if (mounted && details['statusHistory'] != null) {
        setState(() {
          _statusHistory = details['statusHistory'];
        });
      }
    } catch (e) {
      print('Failed to load task details: $e');
    }
  }

  Future<void> _loadChecklistIfNeeded() async {
    if (!mounted) return;
    
    setState(() {
      _loadingChecklist = true;
      _checklistError = null;
    });

    try {
      final taskProvider = Provider.of<TaskProvider>(context, listen: false);
      final isOnline = await taskProvider.isOnline();
      await taskProvider.fetchTaskChecklist(widget.task.taskId);
      
      if (mounted) {
        setState(() {
          _checklistItems = taskProvider.currentChecklist;
          _loadingChecklist = false;
          _isOffline = !isOnline && _checklistItems != null && _checklistItems!.isNotEmpty;
        });
      }
    } catch (e) {
      if (mounted) {
        final taskProvider = Provider.of<TaskProvider>(context, listen: false);
        // Even on error, check if we have cached checklist
        final cachedItems = taskProvider.currentChecklist;
        setState(() {
          if (cachedItems.isNotEmpty) {
            _checklistItems = cachedItems;
            _isOffline = true;
            _checklistError = null; // Clear error if we have cached data
          } else {
            _checklistError = e.toString();
          }
          _loadingChecklist = false;
        });
      }
    }
  }

  Future<void> _refreshTaskData() async {
    // Refresh cả task info và checklist khi Captain update
    final taskProvider = Provider.of<TaskProvider>(context, listen: false);
    
    try {
      // Reload task list để có task mới nhất
      await taskProvider.fetchMyTasks();
      
      // Reload checklist nếu có TaskType
      await _loadChecklistIfNeeded();
      await _loadTaskDetails();
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).taskDataRefreshed),
            duration: const Duration(seconds: 1),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).failedToRefresh(e.toString())),
            backgroundColor: MaritimeTheme.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final taskProvider = Provider.of<TaskProvider>(context);
    // PERFORMANCE: Use static cached DateFormat instead of creating new instance
    final dateFormat = _dateFormat;
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.taskDetails),
        actions: [
          if (widget.task.canRequestDeferral && !widget.task.hasPendingDeferral)
            IconButton(
              icon: const Icon(Icons.schedule_send),
              tooltip: l10n.requestDeferralTooltip,
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => CreateDeferralScreen(task: widget.task),
                  ),
                );
              },
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.refreshTaskData,
            onPressed: _refreshTaskData,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshTaskData,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Overdue Warning Banner - Maritime theme
              if (widget.task.isOverdue && !widget.task.isCompleted)
                Container(
                  width: double.infinity,
                  color: MaritimeTheme.overdue,
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                  child: Row(
                    children: [
                      const Icon(Icons.warning_rounded, color: Colors.white, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          l10n.overdueDaysPastDue(widget.task.daysUntilDue.abs()),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              
              // SUPPORT/RECEIVER role: view-only banner
              if (!widget.task.isPic)
                Container(
                  width: double.infinity,
                  color: MaritimeTheme.surfaceLight,
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                  child: Row(
                    children: [
                      Icon(Icons.visibility, color: MaritimeTheme.textTertiary, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Vai trò: ${widget.task.crewRole} — Chỉ xem',
                          style: TextStyle(
                            color: MaritimeTheme.textSecondary,
                            fontWeight: FontWeight.w500,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

              // Rejection Info
              if (widget.task.isRectify) ...[
                const SizedBox(height: 16),
                _buildRejectionInfoCard(),
              ],

              // Pending Approval Panel
              if (widget.task.isPendingApproval) ...[
                const SizedBox(height: 16),
                _buildPendingApprovalPanel(),
              ],

              // Pending Deferral Card
              if (widget.task.hasPendingDeferral) ...[
                const SizedBox(height: 16),
                _buildDeferralPendingCard(context, taskProvider),
              ],

              // Professional Compact Header Card
              Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Equipment Name + Task ID in one row
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              widget.task.displayName,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: MaritimeTheme.textPrimary,
                                height: 1.2,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      
                      // Task ID + Badges in one compact row - Using Wrap to prevent overflow
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: MaritimeTheme.surface,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '#${widget.task.taskId}',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: MaritimeTheme.textSecondary,
                              ),
                            ),
                          ),
                          PriorityBadge(priority: widget.task.priority),
                          StatusBadge(task: widget.task),
                        ],
                      ),
                      
                      const SizedBox(height: 10),
                      const Divider(height: 1, color: MaritimeTheme.border),
                      const SizedBox(height: 10),
                      
                      // Description (only show if not empty)
                      if (widget.task.taskDescription.trim().isNotEmpty) ...[
                        Text(
                          widget.task.taskDescription,
                          style: TextStyle(
                            fontSize: 13,
                            color: MaritimeTheme.textSecondary,
                            height: 1.4,
                          ),
                        ),
                        
                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 12),
                      ],
                      
                      // Compact Info Grid (2 columns)
                      _buildCompactInfoGrid(context, dateFormat, l10n),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 8),

            // CHECKLIST SECTION (CHỈ HIỂN thị NẾU CÓ TASKTYPE)
            if (widget.task.hasTaskType) ...[
              Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Clean header - no icon
                      Text(
                        l10n.taskChecklist,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: MaritimeTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildChecklistContent(),
                    ],
                  ),
                ),
              ),
            ],

            const SizedBox(height: 16),

            // STATUS HISTORY SECTION
            if (_statusHistory != null && _statusHistory!.isNotEmpty) ...[
              Card(
                elevation: 2,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.statusHistory,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: MaritimeTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildStatusHistory(),
                    ],
                  ),
                ),
              ),
            ],

            const SizedBox(height: 100), // Space for bottom bar + safety margin
          ],
        ),
      ),
    ),
      bottomNavigationBar: _buildBottomActionBar(context, taskProvider),
    );
  }

  Widget _buildCompactInfoGrid(
    BuildContext context,
    DateFormat dateFormat,
    AppLocalizations l10n,
  ) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isSmallScreen = screenWidth < 360;
    final spacing = isSmallScreen ? 6.0 : 8.0;
    
    return Column(
      children: [
        // Row 1: Type + Interval (Horizontal compact)
        Row(
          children: [
            Expanded(
              child: _buildInfoItem(
                label: l10n.type,
                // PERFORMANCE: Use pre-computed taskTypeDisplay instead of replaceAll()
                value: widget.task.taskTypeDisplay,
                isSmallScreen: isSmallScreen,
                color: MaritimeTheme.primaryLight,
              ),
            ),
            if (widget.task.intervalDays != null || widget.task.intervalHours != null) ...[
              SizedBox(width: spacing),
              Expanded(
                child: _buildInfoItem(
                  label: l10n.interval,
                  value: widget.task.intervalDays != null
                      ? l10n.daysValue(widget.task.intervalDays!.toInt())
                      : l10n.runningHoursValue(widget.task.intervalHours!.toInt()),
                  isSmallScreen: isSmallScreen,
                  color: MaritimeTheme.accent,
                ),
              ),
            ],
          ],
        ),
        SizedBox(height: spacing),
        
        // Row 2: Combined Next Due + Days Left (Merged for prominence)
        Container(
          padding: EdgeInsets.all(isSmallScreen ? 10 : 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: widget.task.isOverdue 
                ? [
                    MaritimeTheme.error.withOpacity(0.1),
                    MaritimeTheme.error.withOpacity(0.05),
                  ]
                : widget.task.isDueSoon
                  ? [
                      MaritimeTheme.warning.withOpacity(0.1),
                      MaritimeTheme.warning.withOpacity(0.05),
                    ]
                  : [
                      MaritimeTheme.accent.withOpacity(0.08),
                      MaritimeTheme.accent.withOpacity(0.03),
                    ],
            ),
            border: Border.all(
              color: widget.task.isOverdue
                  ? MaritimeTheme.errorBorder
                  : widget.task.isDueSoon
                      ? MaritimeTheme.warningBorder
                      : MaritimeTheme.accentSoft,
              width: 1,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.nextDue,
                      style: TextStyle(
                        fontSize: isSmallScreen ? 10 : 11,
                        fontWeight: FontWeight.w500,
                        color: MaritimeTheme.textTertiary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      // PERFORMANCE: Use cached date getter instead of DateTime.parse()
                      widget.task.nextDueAtDate != null ? dateFormat.format(widget.task.nextDueAtDate!) : 'N/A',
                      style: TextStyle(
                        fontSize: isSmallScreen ? 13 : 14,
                        fontWeight: FontWeight.w700,
                        color: MaritimeTheme.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    l10n.daysUntilDue,
                    style: TextStyle(
                      fontSize: isSmallScreen ? 10 : 11,
                      fontWeight: FontWeight.w500,
                      color: MaritimeTheme.textTertiary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.daysValue(widget.task.daysUntilDue),
                    style: TextStyle(
                      fontSize: isSmallScreen ? 13 : 14,
                      fontWeight: FontWeight.w700,
                      color: widget.task.isOverdue
                          ? MaritimeTheme.overdue
                          : widget.task.isDueSoon
                              ? MaritimeTheme.inProgress
                              : MaritimeTheme.completed,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        
        // Row 3: Last Done + Running Hours (if available)
        if (widget.task.lastDoneAt != null || widget.task.runningHoursAtLastDone != null) ...[
          SizedBox(height: spacing),
          Row(
            children: [
              if (widget.task.lastDoneAt != null)
                Expanded(
                  child: _buildInfoItem(
                    label: l10n.lastDone,
                    // PERFORMANCE: Use cached date getter instead of DateTime.parse()
                    value: widget.task.lastDoneAtDate != null 
                        ? dateFormat.format(widget.task.lastDoneAtDate!) 
                        : 'N/A',
                    isSmallScreen: isSmallScreen,
                  ),
                ),
              if (widget.task.lastDoneAt != null && widget.task.runningHoursAtLastDone != null)
                SizedBox(width: spacing),
              if (widget.task.runningHoursAtLastDone != null)
                Expanded(
                  child: _buildInfoItem(
                    label: l10n.runningHours,
                    value: l10n.hoursValue(widget.task.runningHoursAtLastDone!.toInt()),
                    isSmallScreen: isSmallScreen,
                  ),
                ),
            ],
          ),
        ],
        
        // Completion Info (if completed) - Maritime green theme
        if (widget.task.isCompleted) ...[
          SizedBox(height: spacing),
          Container(
            padding: EdgeInsets.all(isSmallScreen ? 10 : 12),
            decoration: BoxDecoration(
              color: MaritimeTheme.completed.withOpacity(0.08),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: MaritimeTheme.completed.withOpacity(0.3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: isSmallScreen ? 18 : 20,
                      height: isSmallScreen ? 18 : 20,
                      decoration: const BoxDecoration(
                        color: MaritimeTheme.completed,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.check,
                        size: isSmallScreen ? 11 : 12,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(width: isSmallScreen ? 6 : 8),
                    Text(
                      l10n.completionDetails,
                      style: TextStyle(
                        fontSize: isSmallScreen ? 11 : 12,
                        fontWeight: FontWeight.w700,
                        color: MaritimeTheme.completed,
                      ),
                    ),
                  ],
                ),
                if (widget.task.completedBy != null || 
                    widget.task.completedAt != null ||
                    widget.task.runningHoursAtCompletion != null) ...[
                  SizedBox(height: isSmallScreen ? 6 : 8),
                  if (widget.task.completedBy != null)
                    _buildCompactInfoRow(
                      l10n.completedBy,
                      widget.task.completedBy!,
                      isSmallScreen,
                    ),
                  if (widget.task.completedAt != null)
                    _buildCompactInfoRow(
                      l10n.completedAt,
                      // PERFORMANCE: Use cached date getter instead of DateTime.parse()
                      widget.task.completedAtDate != null 
                          ? dateFormat.format(widget.task.completedAtDate!) 
                          : 'N/A',
                      isSmallScreen,
                    ),
                  if (widget.task.runningHoursAtCompletion != null)
                    _buildCompactInfoRow(
                      l10n.runningHours,
                      l10n.hoursValue(widget.task.runningHoursAtCompletion!.toInt()),
                      isSmallScreen,
                    ),
                  if (widget.task.sparePartsUsed != null)
                    _buildSparePartsSection(
                      l10n.spareParts,
                      widget.task.sparePartsUsed!,
                      isSmallScreen,
                    ),
                ],
                if (widget.task.notes != null && widget.task.notes!.isNotEmpty) ...[
                  SizedBox(height: isSmallScreen ? 6 : 8),
                  Text(
                    '${l10n.notes}:',
                    style: TextStyle(
                      fontSize: isSmallScreen ? 10 : 11,
                      fontWeight: FontWeight.w600,
                      color: MaritimeTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.task.notes!,
                    style: TextStyle(
                      fontSize: isSmallScreen ? 10 : 11,
                      color: MaritimeTheme.textPrimary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildInfoItem({
    required String label,
    required String value,
    required bool isSmallScreen,
    Color? valueColor,
    Color? color,  // Add color parameter for subtle theme variations
    bool fullWidth = false,
  }) {
    final fontSize = isSmallScreen ? 10.0 : 11.0;
    final valueFontSize = isSmallScreen ? 12.0 : 13.0;
    final padding = isSmallScreen ? 8.0 : 10.0;
    
    return Container(
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            (color ?? Theme.of(context).primaryColor).withOpacity(0.08),
            (color ?? Theme.of(context).primaryColor).withOpacity(0.03),
          ],
        ),
        border: Border.all(
          color: (color ?? Theme.of(context).primaryColor).withOpacity(0.15),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: fontSize,
              color: MaritimeTheme.textSecondary,
              fontWeight: FontWeight.w500,
              height: 1.2,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          SizedBox(height: isSmallScreen ? 3 : 4),
          Text(
            value,
            style: TextStyle(
              fontSize: valueFontSize,
              fontWeight: FontWeight.w700,
              color: valueColor ?? MaritimeTheme.textPrimary,
              height: 1.2,
            ),
            maxLines: fullWidth ? 2 : 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildCompactInfoRow(String label, String value, bool isSmallScreen) {
    return Padding(
      padding: EdgeInsets.only(bottom: isSmallScreen ? 3 : 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: isSmallScreen ? 90 : 100,
            child: Text(
              label,
              style: TextStyle(
                fontSize: isSmallScreen ? 10 : 11,
                color: MaritimeTheme.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: isSmallScreen ? 10 : 11,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Widget hiển thị danh sách vật tư sử dụng với đầy đủ tên
  Widget _buildSparePartsSection(String label, String sparePartsJson, bool isSmallScreen) {
    final l10n = AppLocalizations.of(context)!;
    List<dynamic> spareParts = [];
    try {
      if (sparePartsJson.startsWith('[')) {
        spareParts = json.decode(sparePartsJson);
      }
    } catch (e) {
      // Fallback to plain text display if JSON parsing fails
      return _buildCompactInfoRow(label, sparePartsJson, isSmallScreen);
    }

    if (spareParts.isEmpty) {
      return _buildCompactInfoRow(label, l10n.notAvailableShort, isSmallScreen);
    }

    return Padding(
      padding: EdgeInsets.only(bottom: isSmallScreen ? 3 : 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isSmallScreen ? 10 : 11,
              color: MaritimeTheme.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
          SizedBox(height: isSmallScreen ? 4 : 6),
          ...spareParts.map((part) {
            final materialName = part['materialName']?.toString() ?? 
                                 part['name']?.toString() ?? 
                                 l10n.unknownMaterial;
            final materialCode = part['materialCode']?.toString() ?? 
                                 part['code']?.toString() ?? 
                                 part['itemCode']?.toString() ?? '';
            final quantityUsed = part['quantityUsed'] ?? part['quantity'] ?? 0;
            
            return Container(
              margin: EdgeInsets.only(bottom: isSmallScreen ? 4 : 6),
              padding: EdgeInsets.all(isSmallScreen ? 8 : 10),
              decoration: BoxDecoration(
                color: MaritimeTheme.accentSoft,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: MaritimeTheme.accentSoft),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.inventory_2_outlined,
                    size: isSmallScreen ? 16 : 18,
                    color: MaritimeTheme.accent,
                  ),
                  SizedBox(width: isSmallScreen ? 6 : 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          materialName,
                          style: TextStyle(
                            fontSize: isSmallScreen ? 11 : 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                        if (materialCode.isNotEmpty) ...[
                          SizedBox(height: isSmallScreen ? 2 : 3),
                          Text(
                            l10n.materialCodeInfo(materialCode),
                            style: TextStyle(
                              fontSize: isSmallScreen ? 9 : 10,
                              color: MaritimeTheme.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: isSmallScreen ? 6 : 8,
                      vertical: isSmallScreen ? 2 : 4,
                    ),
                    decoration: BoxDecoration(
                      color: MaritimeTheme.successSoft,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'SL: $quantityUsed',
                      style: TextStyle(
                        fontSize: isSmallScreen ? 10 : 11,
                        fontWeight: FontWeight.bold,
                        color: MaritimeTheme.success,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ],
      ),
    );
  }

  Widget _buildChecklistContent() {
    final l10n = AppLocalizations.of(context);
    if (_loadingChecklist) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_checklistError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              const Icon(Icons.error_outline, color: MaritimeTheme.error, size: 48),
              const SizedBox(height: 8),
              Text(
                l10n.errorLoadingChecklist,
                style: TextStyle(color: MaritimeTheme.error, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                _checklistError!,
                style: TextStyle(color: MaritimeTheme.textSecondary, fontSize: 12),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: _loadChecklistIfNeeded,
                icon: const Icon(Icons.refresh),
                label: Text(l10n.tryAgain),
              ),
            ],
          ),
        ),
      );
    }

    if (_checklistItems == null || _checklistItems!.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            children: [
              Icon(Icons.checklist, color: MaritimeTheme.textTertiary, size: 64),
              const SizedBox(height: 12),
              Text(
                l10n.noChecklistYet,
                style: TextStyle(color: MaritimeTheme.textSecondary, fontSize: 16),
              ),
              const SizedBox(height: 4),
              Text(
                l10n.thisTaskHasNoDetails,
                style: TextStyle(color: MaritimeTheme.textTertiary, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    // Hiển thị danh sách checklist items
    return Column(
      children: [
        // Offline mode indicator
        if (_isOffline)
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
                    'Offline mode - changes will sync when online',
                    style: TextStyle(
                      fontSize: 12,
                      color: MaritimeTheme.warning,
                    ),
                  ),
                ),
              ],
            ),
          ),
        // Progress bar
        if (_checklistItems!.isNotEmpty) ...[
          _buildProgressBar(),
          const SizedBox(height: 16),
        ],
        
        // PERFORMANCE: Use Column instead of ListView.separated with shrinkWrap
        // This avoids O(n) layout calculation that shrinkWrap causes while preserving UI
        ...List.generate(_checklistItems!.length, (index) {
          final item = _checklistItems![index];
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildChecklistItem(item, index + 1),
              if (index < _checklistItems!.length - 1)
                const Divider(height: 1),
            ],
          );
        }),
      ],
    );
  }

  Widget _buildProgressBar() {
    final l10n = AppLocalizations.of(context);
    final totalItems = _checklistItems!.length;
    final completedItems = _checklistItems!.where((item) => item.isCompleted).length;
    final progress = totalItems > 0 ? completedItems / totalItems : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              l10n.progressCount(completedItems, totalItems),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: MaritimeTheme.textSecondary,
              ),
            ),
            Text(
              '${(progress * 100).toStringAsFixed(0)}%',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: progress == 1.0 
                    ? MaritimeTheme.completed 
                    : MaritimeTheme.primary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        // PERFORMANCE: RepaintBoundary prevents progress bar from repainting entire parent subtree
        RepaintBoundary(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: MaritimeTheme.surface,
              valueColor: AlwaysStoppedAnimation<Color>(
                progress == 1.0 
                    ? MaritimeTheme.completed 
                    : MaritimeTheme.primary,
              ),
              minHeight: 6,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildChecklistItem(TaskChecklistItem item, int index) {
    final l10n = AppLocalizations.of(context);
    final isCompleted = item.isCompleted;
    final title = (item.checkpointDescription != null && item.checkpointDescription!.trim().isNotEmpty)
        ? item.checkpointDescription!.trim()
        : '${item.assetName} (${item.assetCode})';
    
    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          if ((widget.task.isInProgress || isCompleted) && widget.task.isPic) {
            _showQuickChecklistDialog(item, index);
          }
        },
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: isCompleted 
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    MaritimeTheme.success.withOpacity(0.08),
                    MaritimeTheme.success.withOpacity(0.03),
                  ],
                )
              : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row with number, title, and icon
              Row(
                children: [
                  // Number circle - Modern style
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: isCompleted 
                          ? MaritimeTheme.success 
                          : MaritimeTheme.accent.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: isCompleted
                          ? const Icon(
                              Icons.check,
                              color: Colors.white,
                              size: 18,
                            )
                          : Text(
                              '$index',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: MaritimeTheme.primary,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  
                  // Title and badges
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: isCompleted 
                                ? MaritimeTheme.textSecondary
                                : MaritimeTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            _buildDetailTypeBadge(item.requiresReading ? 'MEASUREMENT' : 'CHECKLIST'),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                '${item.assetName} (${item.assetCode})',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: MaritimeTheme.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  
                  // Action icon - Clean modern
                  Icon(
                    isCompleted ? Icons.visibility_outlined : Icons.chevron_right,
                    color: isCompleted
                        ? (item.isAbnormal ? MaritimeTheme.mandatory : MaritimeTheme.completed)
                        : MaritimeTheme.textTertiary,
                    size: 20,
                  ),
                ],
              ),

              if (item.requiresReading && (item.normalRangeMin != null || item.normalRangeMax != null)) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF4E6),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: const Color(0xFFFFD699),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.info_outline,
                        size: 14,
                        color: Color(0xFF996600),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          l10n.limitRange(
                            item.normalRangeMin?.toString() ?? '?',
                            item.normalRangeMax?.toString() ?? '?',
                            item.unit ?? '',
                          ),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF663D00),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              if (isCompleted && item.requiresReading && item.readingValue != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.speed,
                      size: 14,
                      color: MaritimeTheme.textTertiary,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        l10n.measuredValueWithUnit(
                          item.readingValue!.toString(),
                          item.unit ?? '',
                        ),
                        style: TextStyle(
                          fontSize: 11,
                          color: MaritimeTheme.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailTypeBadge(String type) {
    Color color;
    String label;

    final l10n = AppLocalizations.of(context);

    switch (type) {
      case 'MEASUREMENT':
        color = MaritimeTheme.accent;
        label = l10n.measurement;
        break;
      case 'CHECKLIST':
        color = MaritimeTheme.success;
        label = l10n.checklist;
        break;
      case 'INSPECTION':
        color = MaritimeTheme.warning;
        label = l10n.inspection;
        break;
      default:
        color = MaritimeTheme.textTertiary;
        label = type;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w600,
          color: color,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  void _showQuickChecklistDialog(TaskChecklistItem item, int index) {
    final isAlreadyCompleted = item.isCompleted;
    final l10n = AppLocalizations.of(context);
    final title = (item.checkpointDescription != null && item.checkpointDescription!.trim().isNotEmpty)
        ? item.checkpointDescription!.trim()
        : '${item.assetName} (${item.assetCode})';

    // Controllers for input
    final measurementController = TextEditingController(
      text: item.readingValue?.toString() ?? '',
    );
    final notesController = TextEditingController(
      text: item.remarks ?? '',
    );
    bool checkResult = !item.isAbnormal; // OK = not abnormal

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
            ),
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header with drag handle
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: MaritimeTheme.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Title with number
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: MaritimeTheme.primary.withOpacity(0.15),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: MaritimeTheme.primary.withOpacity(0.3),
                              width: 1.5,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              '$index',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.bold,
                                color: MaritimeTheme.primary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.bold,
                                  color: MaritimeTheme.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  _buildDetailTypeBadge(item.requiresReading ? 'MEASUREMENT' : 'CHECKLIST'),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      '${item.assetName} (${item.assetCode})',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: MaritimeTheme.textSecondary,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // ===== INPUT BASED ON TYPE =====

                    // OK / NG selection (maps to isAbnormal)
                    Text(
                      l10n.checkResult.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                        color: MaritimeTheme.textTertiary,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _buildCheckButton(
                            context: context,
                            label: l10n.okPass,
                            icon: Icons.check_circle,
                            isSelected: checkResult == true,
                            color: MaritimeTheme.completed,
                            onTap: isAlreadyCompleted
                                ? () {}
                                : () {
                                    setDialogState(() {
                                      checkResult = true;
                                    });
                                  },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildCheckButton(
                            context: context,
                            label: l10n.ngFail,
                            icon: Icons.cancel,
                            isSelected: checkResult == false,
                            color: MaritimeTheme.mandatory,
                            onTap: isAlreadyCompleted
                                ? () {}
                                : () {
                                    setDialogState(() {
                                      checkResult = false;
                                    });
                                  },
                          ),
                        ),
                      ],
                    ),

                    if (item.requiresReading) ...[
                      const SizedBox(height: 18),
                      Text(
                        l10n.measuredValue.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.5,
                          color: MaritimeTheme.textTertiary,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: measurementController,
                        enabled: !isAlreadyCompleted,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        autofocus: !isAlreadyCompleted,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: MaritimeTheme.textPrimary,
                          letterSpacing: 0.5,
                        ),
                        decoration: InputDecoration(
                          hintText: '_ _ . _',
                          hintStyle: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w400,
                            color: MaritimeTheme.textTertiary.withOpacity(0.3),
                            letterSpacing: 2,
                          ),
                          suffix: Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: Text(
                              item.unit ?? '',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: MaritimeTheme.textTertiary,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          filled: true,
                          fillColor: MaritimeTheme.surface,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                            borderSide: const BorderSide(
                              color: MaritimeTheme.border,
                              width: 1,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                            borderSide: const BorderSide(
                              color: MaritimeTheme.border,
                              width: 1,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                            borderSide: const BorderSide(
                              color: MaritimeTheme.primary,
                              width: 2,
                            ),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                        ),
                      ),
                      if (item.normalRangeMin != null || item.normalRangeMax != null) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF4E6),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: const Color(0xFFFFD699),
                              width: 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.info_outline,
                                size: 16,
                                color: Color(0xFF996600),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  l10n.limitRange(
                                    item.normalRangeMin?.toString() ?? '?',
                                    item.normalRangeMax?.toString() ?? '?',
                                    item.unit ?? '',
                                  ),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF663D00),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],

                    const SizedBox(height: 18),
                    Text(
                      l10n.notesOptional.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                        color: MaritimeTheme.textTertiary,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: notesController,
                      enabled: !isAlreadyCompleted,
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: l10n.addNotesIfNeeded,
                        hintStyle: TextStyle(
                          fontSize: 13,
                          color: MaritimeTheme.textTertiary.withOpacity(0.4),
                        ),
                        filled: true,
                        fillColor: MaritimeTheme.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                          borderSide: const BorderSide(
                            color: MaritimeTheme.border,
                            width: 1,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                          borderSide: const BorderSide(
                            color: MaritimeTheme.border,
                            width: 1,
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                          borderSide: const BorderSide(
                            color: MaritimeTheme.primary,
                            width: 1.5,
                          ),
                        ),
                        contentPadding: const EdgeInsets.all(12),
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Action buttons
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(context),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              side: const BorderSide(
                                color: MaritimeTheme.border,
                                width: 1.5,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: Text(
                              l10n.cancel,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: MaritimeTheme.textSecondary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: ElevatedButton(
                            onPressed: () async {
                              if (!widget.task.isInProgress || isAlreadyCompleted) {
                                Navigator.pop(context);
                                return;
                              }

                              double? readingValue;
                              if (item.requiresReading) {
                                if (measurementController.text.trim().isEmpty) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(l10n.pleaseEnterMeasuredValue),
                                      backgroundColor: MaritimeTheme.error,
                                    ),
                                  );
                                  return;
                                }

                                readingValue = double.tryParse(measurementController.text.trim());
                                if (readingValue == null) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(l10n.invalidValue),
                                      backgroundColor: MaritimeTheme.error,
                                    ),
                                  );
                                  return;
                                }
                              }

                              // Save data
                              try {
                                final taskProvider = Provider.of<TaskProvider>(
                                  context, 
                                  listen: false,
                                );
                                
                                await taskProvider.completeChecklistItem(
                                  taskCode: widget.task.taskId,
                                  itemId: item.id,
                                  readingValue: readingValue,
                                  remarks: notesController.text.trim().isNotEmpty
                                      ? notesController.text.trim()
                                      : null,
                                  isAbnormal: !checkResult,
                                );

                                if (context.mounted) {
                                  Navigator.pop(context);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Row(
                                        children: [
                                          const Icon(Icons.check_circle, color: Colors.white),
                                          const SizedBox(width: 8),
                                          Expanded(child: Text(l10n.savedItem(title))),
                                        ],
                                      ),
                                      backgroundColor: MaritimeTheme.success,
                                      behavior: SnackBarBehavior.floating,
                                    ),
                                  );
                                  
                                  // Reload checklist
                                  setState(() {
                                    _checklistItems = taskProvider.currentChecklist;
                                  });
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(l10n.errorMessage(e.toString())),
                                      backgroundColor: MaritimeTheme.error,
                                    ),
                                  );
                                }
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: MaritimeTheme.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: Text(
                              (isAlreadyCompleted || !widget.task.isInProgress) ? l10n.close : l10n.complete,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildCheckButton({
    required BuildContext context,
    required String label,
    required IconData icon,
    required bool isSelected,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.08) : Colors.white,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSelected ? color : MaritimeTheme.border,
            width: isSelected ? 2 : 1,
          ),
          boxShadow: isSelected ? [
            BoxShadow(
              color: color.withOpacity(0.15),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ] : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 20,
              color: isSelected ? color : MaritimeTheme.textTertiary,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: isSelected ? color : MaritimeTheme.textSecondary,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusHistory() {
    // PERFORMANCE: Use static cached DateTimeFormat
    final dateFormat = _dateTimeFormat;
    
    // PERFORMANCE: Use Column instead of ListView.separated with shrinkWrap
    // Status history is typically small (<20 items), so Column is more efficient
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(_statusHistory!.length, (index) {
        final history = _statusHistory![index];
        final isFirst = index == 0;
        final isLast = index == _statusHistory!.length - 1;
        
        // Parse status - backend returns 'toStatus' field
        final status = history['toStatus'] as String? ?? history['status'] as String? ?? 'UNKNOWN';
        final changedAt = history['changedAt'] as String?;
        final changedBy = history['changedByName'] as String? ?? history['changedBy'] as String? ?? 'System';
        final remarks = history['notes'] as String? ?? history['reason'] as String? ?? history['remarks'] as String?;
        
        // Determine color based on status
        Color statusColor;
        IconData statusIcon;
        
        switch (status) {
          case 'COMPLETED':
            statusColor = MaritimeTheme.completed;
            statusIcon = Icons.check_circle;
            break;
          case 'IN_PROGRESS':
            statusColor = MaritimeTheme.inProgress;
            statusIcon = Icons.play_circle_fill;
            break;
          case 'OVERDUE':
            statusColor = MaritimeTheme.overdue;
            statusIcon = Icons.warning;
            break;
          case 'PENDING_APPROVAL':
            statusColor = MaritimeTheme.accent;
            statusIcon = Icons.pending;
            break;
          case 'RECTIFY':
            statusColor = MaritimeTheme.mandatory;
            statusIcon = Icons.build_circle;
            break;
          case 'SCHEDULED':
            statusColor = MaritimeTheme.textTertiary;
            statusIcon = Icons.schedule;
            break;
          case 'DUE':
            statusColor = MaritimeTheme.warning;
            statusIcon = Icons.event;
            break;
          case 'DEFERRAL_PENDING':
            statusColor = MaritimeTheme.warning;
            statusIcon = Icons.hourglass_top;
            break;
          case 'DEFERRAL_APPROVED':
            statusColor = MaritimeTheme.info;
            statusIcon = Icons.check;
            break;
          case 'DEFERRAL_REJECTED':
            statusColor = MaritimeTheme.error;
            statusIcon = Icons.close;
            break;
          default:
            statusColor = MaritimeTheme.textTertiary;
            statusIcon = Icons.circle;
        }

        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Timeline column
              SizedBox(
                width: 40,
                child: Column(
                  children: [
                    // Top line
                    Expanded(
                      flex: 1,
                      child: Container(
                        width: 2,
                        color: isFirst ? Colors.transparent : MaritimeTheme.border,
                      ),
                    ),
                    // Dot
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: statusColor,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                        boxShadow: [
                          BoxShadow(
                            color: statusColor.withOpacity(0.3),
                            blurRadius: 4,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                    ),
                    // Bottom line
                    Expanded(
                      flex: 5,
                      child: Container(
                        width: 2,
                        color: isLast ? Colors.transparent : MaritimeTheme.border,
                      ),
                    ),
                  ],
                ),
              ),
              
              // Content column
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 20, top: 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              status.replaceAll('_', ' '),
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: statusColor,
                                fontSize: 14,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (changedAt != null)
                            Text(
                              dateFormat.format(DateTime.parse(changedAt)),
                              style: TextStyle(
                                color: MaritimeTheme.textTertiary,
                                fontSize: 11,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'By: $changedBy',
                        style: TextStyle(
                          color: MaritimeTheme.textSecondary,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (remarks != null && remarks.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: MaritimeTheme.surfaceLight,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: MaritimeTheme.divider),
                          ),
                          child: Text(
                            remarks,
                            style: TextStyle(
                              color: MaritimeTheme.textPrimary,
                              fontSize: 12,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  // New Bottom Action Bar - Professional Maritime Design
  Widget? _buildBottomActionBar(BuildContext context, TaskProvider taskProvider) {
    final l10n = AppLocalizations.of(context);
    
    // Don't show action bar for SUPPORT/RECEIVER crew (read-only)
    if (!widget.task.isPic) {
      return null;
    }

    // Don't show action bar for completed tasks
    if (widget.task.isCompleted) {
      return null;
    }

    // Don't show action bar for pending approval tasks
    if (widget.task.isPendingApproval) {
      return null;
    }

    // Show Start button for PENDING or OVERDUE tasks
    // Show Complete button for IN_PROGRESS tasks
    return Container(
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
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: widget.task.isRectify
              ? _buildFixAndContinueButton(context, taskProvider)
              : widget.task.canStart
                  ? _buildStartTaskButton(context, taskProvider, l10n)
                  : widget.task.isInProgress
                      ? _buildCompleteTaskButton(context, l10n)
                      : const SizedBox.shrink(),
        ),
      ),
    );
  }

  Widget _buildFixAndContinueButton(BuildContext context, TaskProvider taskProvider) {
    final l10n = AppLocalizations.of(context);
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: taskProvider.isLoading
            ? null
            : () async {
                try {
                  await taskProvider.startTask(widget.task.id);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(l10n.taskRestartedForFix),
                        backgroundColor: MaritimeTheme.warning,
                      ),
                    );
                    Navigator.pop(context);
                  }
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(l10n.errorMessage(e.toString())),
                        backgroundColor: MaritimeTheme.error,
                      ),
                    );
                  }
                }
              },
        icon: const Icon(Icons.build_circle, size: 22),
        label: Text(
          l10n.fixAndContinue,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: MaritimeTheme.warning,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
        ),
      ),
    );
  }

  Widget _buildStartTaskButton(
    BuildContext context,
    TaskProvider taskProvider,
    AppLocalizations l10n,
  ) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: taskProvider.isLoading
            ? null
            : () async {
                // Show warning if task is overdue (by status or by days)
                if (widget.task.isOverdueStatus || widget.task.isOverdue) {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      icon: const Icon(
                        Icons.warning_rounded,
                        color: MaritimeTheme.overdue,
                        size: 44,
                      ),
                      title: Text(l10n.taskOverdue),
                      content: Text(l10n.thisTaskIsOverdue),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: Text(l10n.cancel),
                        ),
                        ElevatedButton(
                          onPressed: () => Navigator.pop(context, true),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: MaritimeTheme.overdue,
                          ),
                          child: Text(l10n.startAnyway),
                        ),
                      ],
                    ),
                  );
                  
                  if (confirmed != true) return;
                }
                
                try {
                  await taskProvider.startTask(widget.task.id);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          widget.task.isOverdue 
                            ? l10n.overdueTaskStarted
                            : l10n.taskStartedSuccessfully,
                        ),
                        backgroundColor: widget.task.isOverdue 
                            ? MaritimeTheme.inProgress 
                            : MaritimeTheme.completed,
                      ),
                    );
                    Navigator.pop(context);
                  }
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(l10n.failedToStartTask(e.toString())),
                        backgroundColor: MaritimeTheme.overdue,
                      ),
                    );
                  }
                }
              },
        icon: const Icon(Icons.play_arrow_rounded, size: 22),
        label: Text(
          l10n.startTask,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: widget.task.isOverdueStatus || widget.task.isOverdue
              ? MaritimeTheme.error 
              : Theme.of(context).primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
        ),
      ),
    );
  }

  Widget _buildCompleteTaskButton(BuildContext context, AppLocalizations l10n) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => CompleteTaskScreen(task: widget.task, fromDetail: true),
            ),
          );
        },
        icon: const Icon(Icons.check_circle_rounded, size: 22),
        label: Text(
          l10n.completeTask,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: MaritimeTheme.success,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
        ),
      ),
    );
  }

  Widget _buildRejectionInfoCard() {
    final l10n = AppLocalizations.of(context)!;
    return Card(
      color: MaritimeTheme.warningSoft,
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: MaritimeTheme.warningBorder, width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: MaritimeTheme.warning, size: 24),
                const SizedBox(width: 8),
                Text(
                  l10n.taskRejectedTitle,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: MaritimeTheme.warning,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: MaritimeTheme.warningBorder),
              ),
              child: Text(
                widget.task.rejectionReason ?? 'No reason provided',
                style: const TextStyle(fontSize: 14, height: 1.5),
              ),
            ),
            const SizedBox(height: 12),
            _buildRejectionDetails(),
          ],
        ),
      ),
    );
  }

  Widget _buildRejectionDetails() {
    final l10n = AppLocalizations.of(context)!;
    return Column(
      children: [
        _buildInfoRow(l10n.rejectedByLabel, widget.task.lastRejectedBy ?? 'Unknown'),
        _buildInfoRow(l10n.timeLabel, _formatDateTime(widget.task.lastRejectedAt)),
        _buildInfoRow(l10n.rejectionCount, l10n.rejectionCountLabel(widget.task.rejectionCount)),
        
        if (widget.task.rejectionCount >= 3)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: MaritimeTheme.errorSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: MaritimeTheme.errorBorder),
            ),
            child: Row(
              children: [
                Icon(Icons.error_outline, color: MaritimeTheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.multipleRejectionWarning,
                    style: TextStyle(color: MaritimeTheme.error, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: MaritimeTheme.textSecondary, fontSize: 13)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value, 
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(String? isoString) {
    if (isoString == null) return '-';
    try {
      final date = DateTime.parse(isoString);
      return DateFormat('dd/MM/yyyy HH:mm').format(date);
    } catch (e) {
      return isoString;
    }
  }

  Widget _buildPendingApprovalPanel() {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MaritimeTheme.warningSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MaritimeTheme.warningBorder),
      ),
      child: Column(
        children: [
          Icon(Icons.pending_actions, size: 48, color: MaritimeTheme.warning),
          const SizedBox(height: 8),
          Text(
            l10n.waitingForCEApproval,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: MaritimeTheme.warning,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            l10n.yourReportBeingReviewed,
            style: TextStyle(color: MaritimeTheme.warning),
          ),
        ],
      ),
    );
  }

  Widget _buildDeferralPendingCard(BuildContext context, TaskProvider taskProvider) {
    final l10n = AppLocalizations.of(context)!;
    return Card(
      color: MaritimeTheme.warningSoft,
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: MaritimeTheme.warningBorder, width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.schedule, color: MaritimeTheme.warning, size: 24),
                const SizedBox(width: 8),
                Text(
                  l10n.deferralPendingApprovalTitle,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: MaritimeTheme.warning,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              l10n.deferralPendingApprovalMessage,
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (widget.task.lastDeferredAt != null)
              _buildInfoRow(l10n.requestDate, _formatDateTime(widget.task.lastDeferredAt)),
            
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  final l10n = AppLocalizations.of(context);
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: Text(l10n.cancelDeferralQuestion),
                      content: Text(l10n.cancelDeferralConfirm),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: Text(l10n.no),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: Text(l10n.cancelRequest),
                        ),
                      ],
                    ),
                  );

                  if (confirm == true) {
                    try {
                       await taskProvider.cancelPendingDeferralForTask(widget.task.id);
                       if (context.mounted) {
                         ScaffoldMessenger.of(context).showSnackBar(
                           SnackBar(content: Text(l10n.deferralCancelled)),
                         );
                       }
                    } catch (e) {
                       if (context.mounted) {
                         final l10n = AppLocalizations.of(context);
                         ScaffoldMessenger.of(context).showSnackBar(
                           SnackBar(content: Text(l10n.errorMessage(e.toString()))),
                         );
                       }
                    }
                  }
                },
                icon: const Icon(Icons.cancel_outlined),
                label: Text(AppLocalizations.of(context).cancelRequest),
                style: OutlinedButton.styleFrom(
                  foregroundColor: MaritimeTheme.error,
                  side: const BorderSide(color: MaritimeTheme.error),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
