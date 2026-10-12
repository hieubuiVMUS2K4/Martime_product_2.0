import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../providers/alarm_provider.dart';
import '../../../l10n/app_localizations.dart';

class AlarmStatisticsScreen extends StatefulWidget {
  const AlarmStatisticsScreen({super.key});

  @override
  State<AlarmStatisticsScreen> createState() => _AlarmStatisticsScreenState();
}

class _AlarmStatisticsScreenState extends State<AlarmStatisticsScreen> {
  int _selectedDays = 30;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AlarmProvider>().fetchStatistics(days: _selectedDays);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.alarmStatistics),
      ),
      body: Consumer<AlarmProvider>(
        builder: (context, provider, child) {
          if (provider.isLoadingStats) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.error != null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 64, color: MaritimeTheme.error),
                  const SizedBox(height: 16),
                  Text(
                    l10n.errorPrefix(provider.error ?? ''),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: MaritimeTheme.error),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      provider.fetchStatistics(days: _selectedDays);
                    },
                    child: Text(l10n.retry),
                  ),
                ],
              ),
            );
          }

          final stats = provider.statistics;
          if (stats == null) {
            return Center(child: Text(l10n.noDataAvailable));
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Time range selector
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Time Range',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          children: [7, 30, 90].map((days) {
                            final isSelected = _selectedDays == days;
                            return ChoiceChip(
                              label: Text('$days days'),
                              selected: isSelected,
                              onSelected: (selected) {
                                if (selected) {
                                  setState(() => _selectedDays = days);
                                  provider.fetchStatistics(days: days);
                                }
                              },
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Overview cards
                Row(
                  children: [
                    Expanded(
                      child: _buildStatCard(
                        'Total',
                        '${stats.total}',
                        Icons.notifications,
                        MaritimeTheme.accent,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildStatCard(
                        'Active',
                        '${stats.active}',
                        Icons.warning_amber,
                        MaritimeTheme.warning,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _buildStatCard(
                        'Acknowledged',
                        '${stats.acknowledged}',
                        Icons.check_circle,
                        MaritimeTheme.success,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildStatCard(
                        'Resolved',
                        '${stats.resolved}',
                        Icons.done_all,
                        Colors.purple,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // By severity
                const Text(
                  'By Severity',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                ...stats.bySeverity.map((item) {
                  Color color;
                  if (item.severity.toUpperCase() == 'CRITICAL') {
                    color = MaritimeTheme.error;
                  } else if (item.severity.toUpperCase() == 'WARNING') {
                    color = MaritimeTheme.warning;
                  } else {
                    color = MaritimeTheme.accent;
                  }
                  
                  final percentage = stats.total > 0 
                      ? (item.count / stats.total * 100).toStringAsFixed(1)
                      : '0.0';

                  return _buildProgressBar(
                    item.severity,
                    item.count,
                    stats.total,
                    color,
                    percentage,
                  );
                }),
                const SizedBox(height: 24),

                // By type
                const Text(
                  'By Alarm Type',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                ...stats.byType.map((item) {
                  final percentage = stats.total > 0
                      ? (item.count / stats.total * 100).toStringAsFixed(1)
                      : '0.0';
                      
                  return _buildProgressBar(
                    item.type,
                    item.count,
                    stats.total,
                    MaritimeTheme.accent,
                    percentage,
                  );
                }),
                const SizedBox(height: 24),

                // By location
                if (stats.byLocation.isNotEmpty) ...[
                  const Text(
                    'By Location',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  ...stats.byLocation.map((item) {
                    final percentage = stats.total > 0
                        ? (item.count / stats.total * 100).toStringAsFixed(1)
                        : '0.0';
                        
                    return _buildProgressBar(
                      item.location,
                      item.count,
                      stats.total,
                      MaritimeTheme.info,
                      percentage,
                    );
                  }),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatCard(
      String label, String value, IconData icon, Color color) {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: MaritimeTheme.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressBar(
      String label, int count, int total, Color color, String percentage) {
    final progress = total > 0 ? count / total : 0.0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                '$count ($percentage%)',
                style: TextStyle(
                  fontSize: 14,
                  color: MaritimeTheme.textSecondary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 12,
              backgroundColor: MaritimeTheme.divider,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
  }
}
