import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../data/models/safety_alarm.dart';
import '../../providers/alarm_provider.dart';
import '../../../l10n/app_localizations.dart';

class AlarmDetailScreen extends StatefulWidget {
  final SafetyAlarm alarm;

  const AlarmDetailScreen({super.key, required this.alarm});

  @override
  State<AlarmDetailScreen> createState() => _AlarmDetailScreenState();
}

class _AlarmDetailScreenState extends State<AlarmDetailScreen> {
  bool _isProcessing = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    Color severityColor;
    if (widget.alarm.isCritical) {
      severityColor = MaritimeTheme.error;
    } else if (widget.alarm.isWarning) {
      severityColor = MaritimeTheme.warning;
    } else {
      severityColor = MaritimeTheme.accent;
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.alarmDetails),
        backgroundColor: severityColor,
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header section with severity
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: severityColor.withOpacity(0.1),
                border: Border(
                  bottom: BorderSide(color: severityColor, width: 3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        widget.alarm.isCritical
                            ? Icons.warning_amber
                            : widget.alarm.isWarning
                                ? Icons.error_outline
                                : Icons.info_outline,
                        color: severityColor,
                        size: 48,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.alarm.severityDisplay,
                              style: TextStyle(
                                color: severityColor,
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              widget.alarm.typeDisplay,
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (!widget.alarm.isAcknowledged) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.accent.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.notification_important,
                              color: MaritimeTheme.accent),
                          const SizedBox(width: 8),
                          Text(
                            l10n.needsAcknowledgment,
                            style: const TextStyle(
                              color: MaritimeTheme.accent,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // Alarm details
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.alarm.description != null) ...[
                    _buildInfoCard(
                      l10n.description,
                      widget.alarm.description!,
                      Icons.description,
                    ),
                    const SizedBox(height: 16),
                  ],
                  Row(
                    children: [
                      Expanded(
                        child: _buildInfoCard(
                          l10n.location,
                          widget.alarm.locationDisplay,
                          Icons.location_on,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildInfoCard(
                          l10n.alarmCode,
                          widget.alarm.alarmCode ?? 'N/A',
                          Icons.tag,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _buildInfoCard(
                    l10n.timestamp,
                    DateFormat('dd/MM/yyyy HH:mm:ss')
                        .format(widget.alarm.timestamp.toLocal()),
                    Icons.access_time,
                    subtitle: widget.alarm.timeAgo,
                  ),
                  const SizedBox(height: 16),
                  _buildInfoCard(
                    l10n.status,
                    widget.alarm.statusDisplay,
                    Icons.info_outline,
                  ),

                  // Acknowledgment info
                  if (widget.alarm.isAcknowledged) ...[
                    const SizedBox(height: 24),
                    const Divider(),
                    const SizedBox(height: 16),
                    Text(
                      l10n.acknowledgmentInfo,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: MaritimeTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildInfoCard(
                      l10n.acknowledgedBy,
                      widget.alarm.acknowledgedBy ?? 'N/A',
                      Icons.person,
                    ),
                    const SizedBox(height: 12),
                    _buildInfoCard(
                      l10n.acknowledgedAt,
                      widget.alarm.acknowledgedAt != null
                          ? DateFormat('dd/MM/yyyy HH:mm:ss')
                              .format(widget.alarm.acknowledgedAt!.toLocal())
                          : 'N/A',
                      Icons.check_circle,
                    ),
                  ],

                  // Resolution info
                  if (widget.alarm.isResolved) ...[
                    const SizedBox(height: 16),
                    _buildInfoCard(
                      l10n.resolvedAt,
                      widget.alarm.resolvedAt != null
                          ? DateFormat('dd/MM/yyyy HH:mm:ss')
                              .format(widget.alarm.resolvedAt!.toLocal())
                          : 'N/A',
                      Icons.done_all,
                    ),
                  ],

                  const SizedBox(height: 100), // Space for FAB
                ],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: widget.alarm.isResolved
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!widget.alarm.isAcknowledged)
                  FloatingActionButton.extended(
                    onPressed: _isProcessing ? null : _acknowledgeAlarm,
                    backgroundColor: MaritimeTheme.success,
                    icon: _isProcessing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.check),
                    label: Text(l10n.acknowledge),
                  ),
                if (widget.alarm.isAcknowledged) ...[
                  const SizedBox(height: 12),
                  FloatingActionButton.extended(
                    onPressed: _isProcessing ? null : _resolveAlarm,
                    backgroundColor: MaritimeTheme.accent,
                    icon: _isProcessing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.done_all),
                    label: Text(l10n.resolve),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _buildInfoCard(String label, String value, IconData icon,
      {String? subtitle}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MaritimeTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MaritimeTheme.border!),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: MaritimeTheme.accent, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: MaritimeTheme.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: MaritimeTheme.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _acknowledgeAlarm() async {
    setState(() => _isProcessing = true);

    try {
      // Get crew name from SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      final crewName = prefs.getString('crew_name') ?? 'Unknown';

      final success = await context
          .read<AlarmProvider>()
          .acknowledgeAlarm(widget.alarm.id, crewName);

      if (mounted) {
        if (success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).alarmAcknowledged),
              backgroundColor: MaritimeTheme.success,
            ),
          );
          if (mounted) {
            Navigator.pop(context);
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).failedToAcknowledgeAlarm),
              backgroundColor: MaritimeTheme.error,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context).error}: $e'),
            backgroundColor: MaritimeTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _resolveAlarm() async {
    final l10n = AppLocalizations.of(context);
    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.confirmResolution),
        content: Text(l10n.areYouSureResolveAlarm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: MaritimeTheme.accent),
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isProcessing = true);

    try {
      final success =
          await context.read<AlarmProvider>().resolveAlarm(widget.alarm.id);

      if (mounted) {
        if (success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l10n.alarmResolved),
              backgroundColor: MaritimeTheme.success,
            ),
          );
          if (mounted) {
            Navigator.pop(context);
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l10n.failedToResolveAlarm),
              backgroundColor: MaritimeTheme.error,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppLocalizations.of(context).error}: $e'),
            backgroundColor: MaritimeTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }
}
