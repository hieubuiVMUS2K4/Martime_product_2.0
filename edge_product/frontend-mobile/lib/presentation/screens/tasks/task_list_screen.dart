import 'dart:async';
import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../providers/task_provider.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/error_widget.dart';
import '../../widgets/common/empty_state_widget.dart';
import '../../widgets/task/task_card.dart';
import 'task_detail_screen.dart';
import 'complete_task_screen.dart';
import '../../../l10n/app_localizations.dart';

class TaskListScreen extends StatefulWidget {
  const TaskListScreen({super.key});

  @override
  State<TaskListScreen> createState() => _TaskListScreenState();
}

class _TaskListScreenState extends State<TaskListScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late TabController _tabController;
  String _searchQuery = '';
  // PERFORMANCE: Cache lowercase search query to avoid repeated toLowerCase() calls
  String _searchQueryLower = '';
  final TextEditingController _searchController = TextEditingController();
  
  // Auto-refresh timer để sync với backend khi Captain giao task mới
  Timer? _refreshTimer;
  // PERFORMANCE: Debounce timer for search input
  Timer? _searchDebounceTimer;
  // Use optimized interval from constants (30s) - balances battery life with real-time updates
  static const _refreshInterval = PerformanceConstants.taskListRefreshInterval;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 7, vsync: this);
    WidgetsBinding.instance.addObserver(this);
    
    // Fetch tasks on init
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _fetchAndStartTimer();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _searchDebounceTimer?.cancel();
    _tabController.dispose();
    _searchController.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Refresh khi app quay lại foreground, pause timer khi app đi background
    if (state == AppLifecycleState.resumed) {
      Provider.of<TaskProvider>(context, listen: false).fetchMyTasks(forceRefresh: true);
      _startRefreshTimer();
    } else if (state == AppLifecycleState.paused) {
      // PERFORMANCE: Stop refresh timer when app is in background to save battery
      _refreshTimer?.cancel();
    }
  }

  void _startRefreshTimer() {
    final taskProvider = Provider.of<TaskProvider>(context, listen: false);
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(_refreshInterval, (_) {
      if (mounted && !taskProvider.isLoading) {
        taskProvider.fetchMyTasks(forceRefresh: true);
      }
    });
  }

  void _fetchAndStartTimer() {
    final taskProvider = Provider.of<TaskProvider>(context, listen: false);
    taskProvider.fetchMyTasks(forceRefresh: true); // Force API call on init
    _startRefreshTimer();
  }

  // PERFORMANCE: Debounced search to avoid excessive rebuilds
  void _onSearchChanged(String value) {
    _searchDebounceTimer?.cancel();
    _searchDebounceTimer = Timer(const Duration(milliseconds: 300), () {
      if (mounted) {
        setState(() {
          _searchQuery = value;
          // PERFORMANCE: Cache lowercase version once instead of calling toLowerCase() N times
          _searchQueryLower = value.toLowerCase();
        });
      }
    });
  }

  Widget _buildTab({
    required String label,
    required int count,
    required IconData icon,
    required bool isSmallScreen,
  }) {
    if (isSmallScreen) {
      // Compact mode for small screens
      return Tab(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18),
            const SizedBox(width: 4),
            Text(
              '($count)',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      );
    } else {
      // Full mode for larger screens
      return Tab(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 20),
            const SizedBox(width: 8),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontSize: 13),
                ),
                Text(
                  '($count)',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final taskProvider = Provider.of<TaskProvider>(context);
    final screenWidth = MediaQuery.of(context).size.width;
    final isSmallScreen = screenWidth < 400;
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myTasks),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: TabBar(
            controller: _tabController,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelPadding: EdgeInsets.symmetric(
              horizontal: isSmallScreen ? 12 : 16,
              vertical: 8,
            ),
            tabs: [
              _buildTab(
                label: 'Tất cả',
                count: taskProvider.allActiveTasks.length,
                icon: Icons.list_alt,
                isSmallScreen: isSmallScreen,
              ),
              _buildTab(
                label: 'Chưa bắt đầu',
                count: taskProvider.notStartedTasks.length,
                icon: Icons.schedule,
                isSmallScreen: isSmallScreen,
              ),
              _buildTab(
                label: l10n.statusDue,
                count: taskProvider.dueTasks.length,
                icon: Icons.event_available,
                isSmallScreen: isSmallScreen,
              ),
              _buildTab(
                label: l10n.statusInProgress,
                count: taskProvider.inProgressTasks.length,
                icon: Icons.play_arrow,
                isSmallScreen: isSmallScreen,
              ),
              _buildTab(
                label: l10n.statusOverdue,
                count: taskProvider.overdueTasks.length,
                icon: Icons.warning,
                isSmallScreen: isSmallScreen,
              ),
              _buildTab(
                label: l10n.statusPendingApproval,
                count: taskProvider.pendingApprovalTasks.length,
                icon: Icons.pending_actions,
                isSmallScreen: isSmallScreen,
              ),
              _buildTab(
                label: l10n.statusCompleted,
                count: taskProvider.completedTasks.length,
                icon: Icons.check_circle,
                isSmallScreen: isSmallScreen,
              ),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: EdgeInsets.symmetric(
              horizontal: screenWidth < 600 ? 12 : 16,
              vertical: 12,
            ),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: l10n.searchByEquipmentName,
                hintStyle: TextStyle(fontSize: isSmallScreen ? 13 : 14),
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _searchQuery = '';
                            _searchQueryLower = '';
                          });
                        },
                      )
                    : null,
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: isSmallScreen ? 12 : 16,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onChanged: _onSearchChanged,
            ),
          ),

          // Task list
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTaskList(taskProvider.allActiveTasks, taskProvider, 'all'),
                _buildTaskList(taskProvider.notStartedTasks, taskProvider, 'not_started'),
                _buildTaskList(taskProvider.dueTasks, taskProvider, 'due'),
                _buildTaskList(taskProvider.inProgressTasks, taskProvider, 'in_progress'),
                _buildTaskList(taskProvider.overdueTasks, taskProvider, 'overdue'),
                _buildTaskList(taskProvider.pendingApprovalTasks, taskProvider, 'pending_approval'),
                _buildTaskList(taskProvider.completedTasks, taskProvider, 'completed'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskList(List<dynamic> tasks, TaskProvider taskProvider, String tabType) {
    final l10n = AppLocalizations.of(context);
    
    if (taskProvider.isLoading && tasks.isEmpty) {
      return LoadingWidget(message: l10n.loadingTasks);
    }

    if (taskProvider.error != null && tasks.isEmpty) {
      return ErrorDisplayWidget(
        message: taskProvider.error!,
        onRetry: () => taskProvider.fetchMyTasks(),
      );
    }

    // Filter by search query - PERFORMANCE: Use cached lowercase search query
    final filteredTasks = tasks.where((task) {
      final nameMatch = (task.equipmentName ?? task.equipmentGroupName ?? '')
              .toLowerCase()
              .contains(_searchQueryLower);
      final descMatch = task.taskDescription
              .toLowerCase()
              .contains(_searchQueryLower);
      return nameMatch || descMatch;
    }).toList();

    if (filteredTasks.isEmpty) {
      String emptyMessage = l10n.noTasksFound;
      String emptySubtitle = l10n.noTasksInCategory;
      
      if (_searchQuery.isEmpty) {
        switch (tabType) {
          case 'all':
            emptyMessage = l10n.noTasksAvailable;
            emptySubtitle = l10n.noTasksInCategory;
            break;
          case 'not_started':
            emptyMessage = 'Không có công việc chưa bắt đầu';
            emptySubtitle = 'Tất cả công việc đã được bắt đầu';
            break;
          case 'due':
          case 'pending':
            emptyMessage = l10n.noPendingTasks;
            emptySubtitle = l10n.allTasksStartedOrCompleted;
            break;
          case 'in_progress':
            emptyMessage = l10n.noTasksInProgress;
            emptySubtitle = l10n.startPendingTaskToSeeHere;
            break;
          case 'overdue':
            emptyMessage = l10n.noOverdueTasks;
            emptySubtitle = l10n.allTasksOnSchedule;
            break;
          case 'completed':
            emptyMessage = l10n.noCompletedTasks;
            emptySubtitle = l10n.completedTasksAppearHere;
            break;
        }
      } else {
        emptyMessage = l10n.noTasksMatchSearch;
        emptySubtitle = l10n.tryDifferentSearchTerm;
      }
      
      return EmptyStateWidget(
        message: emptyMessage,
        subtitle: emptySubtitle,
        icon: _searchQuery.isEmpty ? Icons.task_alt : Icons.search_off,
      );
    }

    return RefreshIndicator(
      onRefresh: () => taskProvider.fetchMyTasks(),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isNarrow = constraints.maxWidth < 600;
          return ListView.builder(
            padding: EdgeInsets.symmetric(
              horizontal: isNarrow ? 12 : 16,
              vertical: 8,
            ),
            itemCount: filteredTasks.length,
            itemBuilder: (context, index) {
              final task = filteredTasks[index];
              return Padding(
                // PERFORMANCE: Use ValueKey for efficient widget recycling
                key: ValueKey(task.id),
                padding: EdgeInsets.only(bottom: isNarrow ? 8 : 12),
                child: TaskCard(
                  task: task,
                  onTap: () {
                    if (task.isUpcoming) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('${task.statusText} - Công việc chưa đến thời điểm thực hiện'),
                          duration: const Duration(seconds: 2),
                          backgroundColor: MaritimeTheme.textSecondary,
                        ),
                      );
                      return;
                    }
                    // Block tap for pending approval tasks
                    if (task.isPendingApproval) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(AppLocalizations.of(context).pendingApproval +
                              ' – Công việc đang chờ thuyền trưởng phê duyệt'),
                          duration: const Duration(seconds: 2),
                          backgroundColor: MaritimeTheme.warning,
                        ),
                      );
                      return;
                    }
                    // Block tap for completed tasks
                    if (task.isCompleted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(AppLocalizations.of(context).alreadyCompletedCanUpdate),
                          duration: const Duration(seconds: 2),
                          backgroundColor: MaritimeTheme.success,
                        ),
                      );
                      return;
                    }
                    // Tasks not yet started → TaskDetailScreen (has "Start Task" button)
                    // Tasks already in progress or further → CompleteTaskScreen directly
                    final needsStart = task.isDue || task.isOverdueStatus || task.isScheduled ||
                        task.status == 'NOT_STARTED' || task.status == 'SCHEDULED';
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => needsStart
                            ? TaskDetailScreen(task: task)
                            : CompleteTaskScreen(task: task),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
