import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/task_provider.dart';
import '../../../data/models/maintenance_task.dart';
import '../../widgets/task/task_card.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/empty_state_widget.dart';
import '../tasks/task_detail_screen.dart';
import 'watch_schedule_tab.dart';
import '../../../l10n/app_localizations.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> with SingleTickerProviderStateMixin {
  String _filter = 'upcoming'; // upcoming, week, month, all
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<TaskProvider>(context, listen: false).fetchMyTasks();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<MaintenanceTask> _getFilteredTasks(List<MaintenanceTask> allTasks) {
    final now = DateTime.now();
    
    return allTasks.where((task) {
      if (task.nextDueAt == null) return false;
      final nextDue = DateTime.parse(task.nextDueAt!);
      
      switch (_filter) {
        case 'upcoming':
          // Next 7 days
          return nextDue.isAfter(now) &&
              nextDue.isBefore(now.add(const Duration(days: 7)));
        case 'week':
          // This week
          return nextDue.isAfter(now) &&
              nextDue.isBefore(now.add(const Duration(days: 7)));
        case 'month':
          // This month
          return nextDue.isAfter(now) &&
              nextDue.isBefore(now.add(const Duration(days: 30)));
        case 'all':
          return true;
        default:
          return true;
      }
    }).toList()
      ..sort((a, b) {
        final aDate = a.nextDueAt != null ? DateTime.parse(a.nextDueAt!) : DateTime.now();
        final bDate = b.nextDueAt != null ? DateTime.parse(b.nextDueAt!) : DateTime.now();
        return aDate.compareTo(bDate);
      });
  }

  Map<String, List<MaintenanceTask>> _groupTasksByDate(List<MaintenanceTask> tasks) {
    final Map<String, List<MaintenanceTask>> grouped = {};
    final dateFormat = DateFormat('EEEE, MMM d, yyyy');
    
    for (var task in tasks) {
      if (task.nextDueAt == null) continue;
      final date = dateFormat.format(DateTime.parse(task.nextDueAt!));
      if (!grouped.containsKey(date)) {
        grouped[date] = [];
      }
      grouped[date]!.add(task);
    }
    
    return grouped;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.schedule),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: const Icon(Icons.build),
              text: l10n.maintenance,
            ),
            Tab(
              icon: const Icon(Icons.access_time),
              text: l10n.watchSchedule,
            ),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildMaintenanceTab(),
          const WatchScheduleTab(),
        ],
      ),
    );
  }

  Widget _buildMaintenanceTab() {
    final l10n = AppLocalizations.of(context);
    final taskProvider = Provider.of<TaskProvider>(context);
    final allTasks = taskProvider.tasks;
    final filteredTasks = _getFilteredTasks(allTasks);
    final groupedTasks = _groupTasksByDate(filteredTasks);

    return taskProvider.isLoading
        ? Center(child: LoadingWidget(message: l10n.loadingSchedule))
        : Column(
              children: [
                // Filter chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      _buildFilterChip(l10n.upcomingDays(7), 'upcoming'),
                      const SizedBox(width: 8),
                      _buildFilterChip(l10n.thisWeek, 'week'),
                      const SizedBox(width: 8),
                      _buildFilterChip(l10n.thisMonth, 'month'),
                      const SizedBox(width: 8),
                      _buildFilterChip(l10n.allTasks, 'all'),
                    ],
                  ),
                ),

                // Stats
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildStatItem(
                        context,
                        l10n.total,
                        filteredTasks.length,
                        Icons.list,
                      ),
                      _buildStatItem(
                        context,
                        l10n.overdue,
                        filteredTasks.where((t) => t.isOverdue).length,
                        Icons.error,
                        color: MaritimeTheme.error,
                      ),
                      _buildStatItem(
                        context,
                        l10n.dueSoon,
                        filteredTasks.where((t) => t.isDueSoon).length,
                        Icons.warning,
                        color: MaritimeTheme.warning,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Task list grouped by date
                Expanded(
                  child: filteredTasks.isEmpty
                      ? EmptyStateWidget(
                          icon: Icons.check_circle_outline,
                          message: l10n.noTasksScheduled,
                          subtitle: l10n.noMaintenanceTasksMatch,
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: groupedTasks.length,
                          itemBuilder: (context, index) {
                            final date = groupedTasks.keys.elementAt(index);
                            final tasks = groupedTasks[date]!;
                            
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  child: Row(
                                    children: [
                                      Icon(
                                        Icons.calendar_today,
                                        size: 16,
                                        color: Theme.of(context).colorScheme.primary,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        date,
                                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                              fontWeight: FontWeight.bold,
                                              color: Theme.of(context).colorScheme.primary,
                                            ),
                                      ),
                                      const SizedBox(width: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Theme.of(context).colorScheme.primary,
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                        child: Text(
                                          '${tasks.length}',
                                          style: TextStyle(
                                            color: Theme.of(context).colorScheme.onPrimary,
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                ...tasks.map((task) => TaskCard(
                                      task: task,
                                      onTap: () {
                                        Navigator.push(
                                          context,
                                          MaterialPageRoute(
                                            builder: (context) => TaskDetailScreen(task: task),
                                          ),
                                        );
                                      },
                                    )),
                                const SizedBox(height: 8),
                              ],
                            );
                          },
                        ),
                ),
              ],
            );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _filter == value;
    
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        setState(() {
          _filter = value;
        });
      },
      selectedColor: Theme.of(context).colorScheme.primary.withOpacity(0.2),
      checkmarkColor: Theme.of(context).colorScheme.primary,
    );
  }

  Widget _buildStatItem(
    BuildContext context,
    String label,
    int count,
    IconData icon, {
    Color? color,
  }) {
    return Column(
      children: [
        Icon(
          icon,
          color: color ?? Theme.of(context).colorScheme.primary,
          size: 20,
        ),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
        ),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
