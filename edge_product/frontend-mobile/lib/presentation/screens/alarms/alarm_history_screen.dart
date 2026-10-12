import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../data/models/safety_alarm.dart';
import '../../providers/alarm_provider.dart';
import 'alarm_detail_screen.dart';
import '../../../l10n/app_localizations.dart';

class AlarmHistoryScreen extends StatefulWidget {
  const AlarmHistoryScreen({super.key});

  @override
  State<AlarmHistoryScreen> createState() => _AlarmHistoryScreenState();
}

class _AlarmHistoryScreenState extends State<AlarmHistoryScreen> {
  int _selectedDays = 7;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AlarmProvider>().fetchAlarmHistory(days: _selectedDays);
    });
  }

  Future<void> _refresh() async {
    await context.read<AlarmProvider>().fetchAlarmHistory(days: _selectedDays);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.alarmHistory),
      ),
      body: Consumer<AlarmProvider>(
        builder: (context, provider, child) {
          if (provider.isLoadingHistory) {
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
                    '${l10n.error}: ${provider.error}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: MaritimeTheme.error),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _refresh,
                    child: Text(l10n.retry),
                  ),
                ],
              ),
            );
          }

          final alarms = provider.alarmHistory;

          return RefreshIndicator(
            onRefresh: _refresh,
            child: Column(
              children: [
                // Time range selector
                Container(
                  padding: const EdgeInsets.all(16),
                  color: MaritimeTheme.surface,
                  child: Row(
                    children: [
                      Text(
                        l10n.show,
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          children: [7, 30, 90].map((days) {
                            final isSelected = _selectedDays == days;
                            return ChoiceChip(
                              label: Text(l10n.daysCount(days)),
                              selected: isSelected,
                              onSelected: (selected) {
                                if (selected) {
                                  setState(() => _selectedDays = days);
                                  provider.fetchAlarmHistory(days: days);
                                }
                              },
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ),

                // Alarm list
                Expanded(
                  child: alarms.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.history,
                                  size: 64, color: MaritimeTheme.textTertiary),
                              const SizedBox(height: 16),
                              Text(
                                l10n.noAlarmHistory,
                                style: TextStyle(
                                  fontSize: 16,
                                  color: MaritimeTheme.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ListView.builder(
                          itemCount: alarms.length,
                          padding: const EdgeInsets.all(16),
                          itemBuilder: (context, index) {
                            final alarm = alarms[index];
                            return _buildHistoryCard(alarm);
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHistoryCard(SafetyAlarm alarm) {
    final l10n = AppLocalizations.of(context);
    Color severityColor;
    if (alarm.isCritical) {
      severityColor = MaritimeTheme.error;
    } else if (alarm.isWarning) {
      severityColor = MaritimeTheme.warning;
    } else {
      severityColor = MaritimeTheme.accent;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => AlarmDetailScreen(alarm: alarm),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: severityColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      alarm.isCritical
                          ? Icons.warning_amber
                          : alarm.isWarning
                              ? Icons.error_outline
                              : Icons.info_outline,
                      color: severityColor,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          alarm.typeDisplay,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          DateFormat('dd/MM/yyyy HH:mm')
                              .format(alarm.timestamp.toLocal()),
                          style: TextStyle(
                            fontSize: 12,
                            color: MaritimeTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (alarm.isResolved)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.success.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: MaritimeTheme.success),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle, size: 14, color: MaritimeTheme.success),
                          const SizedBox(width: 4),
                          Text(
                            l10n.resolved,
                            style: const TextStyle(
                              fontSize: 11,
                              color: MaritimeTheme.success,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    )
                  else if (alarm.isAcknowledged)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.accent.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: MaritimeTheme.accent),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check, size: 14, color: MaritimeTheme.accent),
                          const SizedBox(width: 4),
                          Text(
                            l10n.acknowledged,
                            style: const TextStyle(
                              fontSize: 11,
                              color: MaritimeTheme.accent,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              if (alarm.description != null) ...[
                const SizedBox(height: 8),
                Text(
                  alarm.description!,
                  style: TextStyle(
                    color: MaritimeTheme.textSecondary,
                    fontSize: 14,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.location_on, size: 14, color: MaritimeTheme.textSecondary),
                  const SizedBox(width: 4),
                  Text(
                    alarm.locationDisplay,
                    style: TextStyle(
                      color: MaritimeTheme.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: severityColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      alarm.severityDisplay,
                      style: TextStyle(
                        color: severityColor,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
