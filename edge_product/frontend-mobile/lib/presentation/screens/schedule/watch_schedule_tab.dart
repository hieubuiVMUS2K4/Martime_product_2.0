import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../providers/watchkeeping_provider.dart';
import '../../../data/models/watchkeeping_log.dart';
import '../../widgets/common/loading_widget.dart';
import '../../widgets/common/empty_state_widget.dart';
import 'watch_log_detail_screen.dart';

class WatchScheduleTab extends StatefulWidget {
  const WatchScheduleTab({super.key});

  @override
  State<WatchScheduleTab> createState() => _WatchScheduleTabState();
}

class _WatchScheduleTabState extends State<WatchScheduleTab> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<WatchkeepingProvider>(context, listen: false).fetchActiveLogs();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<WatchkeepingProvider>(context);
    final logsByDate = provider.logsByDate;

    return Scaffold(
      body: provider.isLoading
          ? const Center(child: LoadingWidget(message: 'Loading watch logs...'))
          : Column(
              children: [
                // Filter chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      _buildFilterChip('All', 'all', provider),
                      const SizedBox(width: 8),
                      _buildFilterChip('🧭 Navigation', 'NAVIGATION', provider),
                      const SizedBox(width: 8),
                      _buildFilterChip('⚙️ Engine', 'ENGINE', provider),
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
                        'Total',
                        provider.filteredLogs.length,
                        Icons.list,
                      ),
                      _buildStatItem(
                        context,
                        'Navigation',
                        provider.navigationLogsCount,
                        Icons.explore,
                        color: MaritimeTheme.accent,
                      ),
                      _buildStatItem(
                        context,
                        'Engine',
                        provider.engineLogsCount,
                        Icons.settings,
                        color: MaritimeTheme.warning,
                      ),
                      _buildStatItem(
                        context,
                        'Unsigned',
                        provider.unsignedLogsCount,
                        Icons.edit_note,
                        color: MaritimeTheme.error,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Watch logs grouped by date
                Expanded(
                  child: provider.filteredLogs.isEmpty
                      ? const EmptyStateWidget(
                          icon: Icons.access_time,
                          message: 'No watch schedule',
                          subtitle: 'No watch schedules have been assigned yet. Please contact your Master.',
                        )
                      : RefreshIndicator(
                          onRefresh: () => provider.fetchActiveLogs(),
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: logsByDate.length,
                            itemBuilder: (context, index) {
                              final date = logsByDate.keys.elementAt(index);
                              final logs = logsByDate[date]!;
                              final parsedDate = DateTime.parse(date);
                              
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
                                          DateFormat('EEEE, MMM d, yyyy').format(parsedDate),
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
                                            '${logs.length}',
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
                                  ...logs.map((log) => _buildWatchLogCard(context, log)),
                                  const SizedBox(height: 8),
                                ],
                              );
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildWatchLogCard(BuildContext context, WatchkeepingLog log) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => WatchLogDetailScreen(logId: log.id!),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      log.watchPeriodDisplay,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                  ),
                  if (!log.isSigned)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.error.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: MaritimeTheme.error),
                      ),
                      child: const Text(
                        'Unsigned',
                        style: TextStyle(
                          color: MaritimeTheme.error,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    log.watchType == 'NAVIGATION' ? Icons.explore : Icons.settings,
                    size: 16,
                    color: log.watchType == 'NAVIGATION' ? MaritimeTheme.accent : MaritimeTheme.warning,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    log.watchTypeDisplay,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(width: 16),
                  const Icon(Icons.person, size: 16, color: MaritimeTheme.textTertiary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      log.officerOnWatch,
                      style: Theme.of(context).textTheme.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              if (log.weatherConditions != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.wb_sunny, size: 16, color: MaritimeTheme.warning),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        log.weatherConditions!,
                        style: Theme.of(context).textTheme.bodySmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
              if (log.hasNotableEvents) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: MaritimeTheme.warning.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: MaritimeTheme.warning.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.warning, size: 16, color: MaritimeTheme.warning),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          log.notableEvents!,
                          style: Theme.of(context).textTheme.bodySmall,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 2,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChip(String label, String value, WatchkeepingProvider provider) {
    final isSelected = provider.filterType == value;
    
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        provider.setFilterType(value);
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
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
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
