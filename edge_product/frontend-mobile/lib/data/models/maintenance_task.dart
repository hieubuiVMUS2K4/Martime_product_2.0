import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'task_checklist_item.dart';

class MaintenanceTask extends Equatable {
  /// Workflow key (edge-services uses Guid/UUID)
  final String id;

  /// Human/task code key used by checklist endpoints (e.g. SCHED-..., MT-...)
  final String taskId;
  final String? equipmentId;
  final String? equipmentName;
  final String? equipmentAssetId; // UUID — used to fetch currentRunningHours
  final String? equipmentGroupId;
  final String? equipmentGroupName;
  final String taskType;
  final String taskDescription;
  final double? intervalHours;
  final int? intervalDays;
  final String? lastDoneAt;
  final String? nextDueAt;
  final double? runningHoursAtLastDone;
  final double? currentRunningHours; // Live value from equipment asset (injected by API)
  final String priority;
  final String status;
  final String? assignedTo;
  final String? assignedToCrewId;
  final String? assignedDepartment;
  final String? completedAt;
  final String? completedBy;
  final String? completedByCrewId;
  final String? notes;
  final String? requiredSpareParts; // From schedule config - what's needed
  final String? sparePartsUsed; // Filled by crew - what was actually used
  final double? runningHoursAtCompletion;
  final String? photoUrls;
  final bool isSynced;
  final String createdAt;
  final String? updatedAt;
  
  // New fields for TaskType integration
  final int? taskTypeId;
  final String? taskTypeName;

  // Checklist items from API
  final List<TaskChecklistItem> checklistItems;

  // === PMS WORKFLOW v2.0 (Phase 1 fields) ===

  // Rejection tracking
  final String? rejectionReason;
  final int rejectionCount;
  final String? lastRejectedAt;
  final String? lastRejectedBy;

  // Deferral tracking
  final bool hasPendingDeferral;
  final int deferralCount;
  final String? lastDeferredAt;
  final String? lastDeferredBy;

  // Photo requirements
  final int requiredPhotos;
  final int photosUploaded;

  // CMS flag
  final bool isCms;

  // Submission tracking
  final String? submittedAt;
  final String? submittedBy;

  // Verification tracking
  final String? verifiedAt;
  final String? verifiedBy;
  final String? verificationResult;
  
  // Optimized: Checklist summary for list view (without loading full items)
  final int checklistItemsCount;
  final int checklistCompletedCount;

  // Crew role for this user on this task (PIC, SUPPORT, RECEIVER)
  final String crewRole;

  // Form requirements (set from schedule config)
  final bool requireRiskAssessment;
  final bool requireInspectionReport;
  
  const MaintenanceTask({
    required this.id,
    required this.taskId,
    this.equipmentId,
    this.equipmentName,
    this.equipmentAssetId,
    this.equipmentGroupId,
    this.equipmentGroupName,
    required this.taskType,
    required this.taskDescription,
    this.intervalHours,
    this.intervalDays,
    this.lastDoneAt,
    this.nextDueAt,
    this.runningHoursAtLastDone,
    this.currentRunningHours,
    required this.priority,
    required this.status,
    this.assignedTo,
    this.assignedToCrewId,
    this.assignedDepartment,
    this.completedAt,
    this.completedBy,
    this.completedByCrewId,
    this.notes,
    this.requiredSpareParts,
    this.sparePartsUsed,
    this.runningHoursAtCompletion,
    this.photoUrls,
    required this.isSynced,
    required this.createdAt,
    this.updatedAt,
    this.taskTypeId,
    this.taskTypeName,
    this.checklistItems = const [],

    // PMS workflow
    this.rejectionReason,
    this.rejectionCount = 0,
    this.lastRejectedAt,
    this.lastRejectedBy,
    this.hasPendingDeferral = false,
    this.deferralCount = 0,
    this.lastDeferredAt,
    this.lastDeferredBy,
    this.requiredPhotos = 0,
    this.photosUploaded = 0,
    this.isCms = false,
    this.submittedAt,
    this.submittedBy,
    this.verifiedAt,
    this.verifiedBy,
    this.verificationResult,
    this.checklistItemsCount = 0,
    this.checklistCompletedCount = 0,
    this.crewRole = 'PIC',
    this.requireRiskAssessment = false,
    this.requireInspectionReport = false,
  });
  
  factory MaintenanceTask.fromJson(Map<String, dynamic> json) {
    return MaintenanceTask(
      id: json['id']?.toString() ?? '',
      taskId: json['taskId']?.toString() ?? '',
      equipmentId: json['equipmentId']?.toString(),
      equipmentName: json['equipmentName']?.toString(),
      equipmentAssetId: json['equipmentAssetId']?.toString(),
      equipmentGroupId: json['equipmentGroupId']?.toString(),
      equipmentGroupName: json['equipmentGroupName']?.toString(),
      taskType: json['taskType']?.toString() ?? 'UNKNOWN',
      taskDescription: json['taskDescription']?.toString() ?? '',
      intervalHours: json['intervalHours']?.toDouble(),
      intervalDays: json['intervalDays'],
      lastDoneAt: json['lastDoneAt']?.toString(),
      nextDueAt: json['nextDueAt']?.toString(),
      runningHoursAtLastDone: json['runningHoursAtLastDone']?.toDouble(),
      currentRunningHours: json['currentRunningHours']?.toDouble(),
      priority: json['priority']?.toString() ?? 'MEDIUM',
      status: json['status']?.toString() ?? 'PENDING',
      assignedTo: json['assignedTo']?.toString(),
      assignedToCrewId: json['assignedToCrewId']?.toString(),
      assignedDepartment: json['assignedDepartment']?.toString(),
      completedAt: json['completedAt']?.toString(),
      completedBy: json['completedBy']?.toString(),
      completedByCrewId: json['completedByCrewId']?.toString(),
      notes: json['notes']?.toString(),
      requiredSpareParts: json['requiredSpareParts']?.toString(),
      sparePartsUsed: json['sparePartsUsed']?.toString(),
      runningHoursAtCompletion: json['runningHoursAtCompletion']?.toDouble(),
      photoUrls: json['photoUrls']?.toString(),
      isSynced: json['isSynced'] ?? false,
      createdAt: json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
      updatedAt: json['updatedAt']?.toString(),
      taskTypeId: json['taskTypeId'],
      taskTypeName: json['taskTypeName']?.toString(),
      
      // Parse checklistItems array
      checklistItems: json['checklistItems'] != null
          ? (json['checklistItems'] as List)
              .map((item) => TaskChecklistItem.fromJson(item as Map<String, dynamic>))
              .toList()
          : [],

      // PMS workflow
      rejectionReason: json['rejectionReason'],
      rejectionCount: json['rejectionCount'] ?? 0,
      lastRejectedAt: json['lastRejectedAt'],
      lastRejectedBy: json['lastRejectedBy'],
      hasPendingDeferral: json['hasPendingDeferral'] ?? false,
      deferralCount: json['deferralCount'] ?? 0,
      lastDeferredAt: json['lastDeferredAt'],
      lastDeferredBy: json['lastDeferredBy'],
      requiredPhotos: json['requiredPhotos'] ?? 0,
      photosUploaded: json['photosUploaded'] ?? 0,
      isCms: json['isCms'] ?? false,
      submittedAt: json['submittedAt'],
      submittedBy: json['submittedBy'],
      verifiedAt: json['verifiedAt'],
      verifiedBy: json['verifiedBy'],
      verificationResult: json['verificationResult'],
      // Optimized checklist summary from API
      checklistItemsCount: json['checklistItemsCount'] ?? (json['checklistItems'] as List?)?.length ?? 0,
      checklistCompletedCount: json['checklistCompletedCount'] ?? (json['checklistItems'] as List?)?.where((i) => i['isCompleted'] == true).length ?? 0,
      crewRole: json['crewRole']?.toString() ?? 'PIC',
      requireRiskAssessment: json['requireRiskAssessment'] ?? false,
      requireInspectionReport: json['requireInspectionReport'] ?? false,
    );
  }
  
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'taskId': taskId,
      'equipmentId': equipmentId,
      'equipmentName': equipmentName,
      'equipmentAssetId': equipmentAssetId,
      'equipmentGroupId': equipmentGroupId,
      'equipmentGroupName': equipmentGroupName,
      'taskType': taskType,
      'taskDescription': taskDescription,
      'intervalHours': intervalHours,
      'intervalDays': intervalDays,
      'lastDoneAt': lastDoneAt,
      'nextDueAt': nextDueAt,
      'runningHoursAtLastDone': runningHoursAtLastDone,
      'currentRunningHours': currentRunningHours,
      'priority': priority,
      'status': status,
      'assignedTo': assignedTo,
      'assignedToCrewId': assignedToCrewId,
      'assignedDepartment': assignedDepartment,
      'completedAt': completedAt,
      'completedBy': completedBy,
      'completedByCrewId': completedByCrewId,
      'notes': notes,
      'requiredSpareParts': requiredSpareParts,
      'sparePartsUsed': sparePartsUsed,
      'runningHoursAtCompletion': runningHoursAtCompletion,
      'photoUrls': photoUrls,
      'isSynced': isSynced,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'taskTypeId': taskTypeId,
      'taskTypeName': taskTypeName,
      'checklistItems': checklistItems.map((item) => item.toJson()).toList(),

      // PMS workflow
      'rejectionReason': rejectionReason,
      'rejectionCount': rejectionCount,
      'lastRejectedAt': lastRejectedAt,
      'lastRejectedBy': lastRejectedBy,
      'hasPendingDeferral': hasPendingDeferral,
      'deferralCount': deferralCount,
      'lastDeferredAt': lastDeferredAt,
      'lastDeferredBy': lastDeferredBy,
      'requiredPhotos': requiredPhotos,
      'photosUploaded': photosUploaded,
      'isCms': isCms,
      'submittedAt': submittedAt,
      'submittedBy': submittedBy,
      'verifiedAt': verifiedAt,
      'verifiedBy': verifiedBy,
      'verificationResult': verificationResult,
      'checklistItemsCount': checklistItemsCount,
      'checklistCompletedCount': checklistCompletedCount,
      'crewRole': crewRole,
      'requireRiskAssessment': requireRiskAssessment,
      'requireInspectionReport': requireInspectionReport,
    };
  }
  
  // PERFORMANCE: Parse dates on demand - const class cannot have mutable cache fields
  // For hot paths, consider using a separate cache layer outside the model
  DateTime? get _dueDate {
    if (nextDueAt == null) return null;
    try {
      return DateTime.parse(nextDueAt!);
    } catch (e) {
      return null;
    }
  }
  
  // Date getters for UI - parse on access
  DateTime? get lastDoneAtDate {
    if (lastDoneAt == null) return null;
    try {
      return DateTime.parse(lastDoneAt!);
    } catch (e) {
      return null;
    }
  }
  
  DateTime? get completedAtDate {
    if (completedAt == null) return null;
    try {
      return DateTime.parse(completedAt!);
    } catch (e) {
      return null;
    }
  }
  
  DateTime? get nextDueAtDate => _dueDate;
  
  // PERFORMANCE: Pre-compute display string
  String get taskTypeDisplay => taskType.replaceAll('_', ' ');
  
  // Computed properties - handle nullable nextDueAt (OPTIMIZED)
  int get daysUntilDue {
    final due = _dueDate;
    if (due == null) return 0;
    return due.difference(DateTime.now()).inDays;
  }
  
  bool get isOverdue => daysUntilDue < 0;
  bool get isDueSoon => daysUntilDue >= 0 && daysUntilDue <= 7;
  // Workflow helpers
  bool get isRectify => status == 'RECTIFY';
  bool get isPendingApproval => status == 'PENDING_APPROVAL';
  bool get isPic => crewRole == 'PIC';
  bool get canRequestDeferral => isPic && (status == 'DUE' || status == 'OVERDUE' || status == 'SCHEDULED' || hasMissingStatus);
  bool get canFixAndContinue => isPic && isRectify;
  bool get hasEnoughPhotos => photosUploaded >= requiredPhotos;

  bool get isUpcoming => status == 'UPCOMING';
  bool get isScheduled => status == 'SCHEDULED';
  bool get isDue => status == 'DUE';
  bool get isOverdueStatus => status == 'OVERDUE';
  bool get isInProgress => status == 'IN_PROGRESS';
  bool get isCompleted => status == 'COMPLETED';
  bool get isCancelled => status == 'CANCELLED';
  
  // Missing status checks (tasks that need attention before they can proceed normally)
  bool get isMissingPic => status == 'MISSING_PIC';
  bool get isMissingChecklist => status == 'MISSING_CHECKLIST';
  bool get isMissingBoth => status == 'MISSING_BOTH';
  bool get hasMissingStatus => isMissingPic || isMissingChecklist || isMissingBoth;

  /// Not started = UPCOMING, SCHEDULED, or MISSING_* (tasks not yet actionable or pending setup)
  bool get isNotStarted => isUpcoming || isScheduled || hasMissingStatus;

  /// Start is allowed by backend for DUE/OVERDUE/RECTIFY/MISSING_*, but blocked if hasPendingDeferral
  /// Tasks with MISSING_* status can be started at any time (crew can self-assign)
  bool get canStart => isPic && (isDue || isOverdueStatus || isRectify || hasMissingStatus) && !hasPendingDeferral;
  
  /// Check if this task uses the new TaskType system
  bool get hasTaskType => taskTypeId != null;
  
  Color get priorityColor {
    switch (priority) {
      case 'CRITICAL':
        return MaritimeTheme.error;
      case 'HIGH':
        return MaritimeTheme.warning;
      case 'NORMAL':
        return MaritimeTheme.primary;
      case 'LOW':
        return MaritimeTheme.textSecondary;
      default:
        return MaritimeTheme.textSecondary;
    }
  }
  
  Color get statusColor {
    if (isRectify) return MaritimeTheme.warning;
    if (isPendingApproval) return MaritimeTheme.warning;
    if (isOverdueStatus || (isOverdue && !isCompleted)) return MaritimeTheme.error;
    if (isInProgress) return MaritimeTheme.primary;
    if (isCompleted) return MaritimeTheme.success;
    if (isDue) return MaritimeTheme.info;
    if (isUpcoming || isScheduled) return MaritimeTheme.textSecondary;
    if (hasMissingStatus) return Colors.purple.shade600;
    return MaritimeTheme.textSecondary;
  }
  
  String get statusText {
    switch (status) {
      case 'UPCOMING': return 'Sắp tới';
      case 'SCHEDULED': return 'Đã lên kế hoạch';
      case 'DUE': return 'Đến hạn';
      case 'OVERDUE': return 'Quá hạn';
      case 'IN_PROGRESS': return 'Đang thực hiện';
      case 'PENDING_APPROVAL': return 'Chờ duyệt';
      case 'RECTIFY': return 'Cần sửa';
      case 'COMPLETED': return 'Hoàn thành';
      case 'CANCELLED': return 'Đã hủy';
      case 'MISSING_PIC': return 'Thiếu PIC';
      case 'MISSING_CHECKLIST': return 'Thiếu checklist';
      case 'MISSING_BOTH': return 'Thiếu PIC & checklist';
      default: return status;
    }
  }

  /// Get display name - prefers equipment name, falls back to group name
  String get displayName {
    if (equipmentName != null && equipmentName!.isNotEmpty) {
      return equipmentName!;
    }
    if (equipmentGroupName != null && equipmentGroupName!.isNotEmpty) {
      return equipmentGroupName!;
    }
    return taskDescription;
  }

  /// Check if this task is for equipment group (not single equipment)
  bool get isGroupTask => equipmentGroupId != null && equipmentId == null;
  
  @override
  List<Object?> get props => [
    id, taskId, status, updatedAt,
    equipmentId, equipmentName,
    equipmentGroupId, equipmentGroupName,
    assignedTo, assignedDepartment,
    requiredSpareParts, sparePartsUsed,
    checklistItemsCount, checklistCompletedCount,
    crewRole, requireRiskAssessment, requireInspectionReport,
  ];
}
