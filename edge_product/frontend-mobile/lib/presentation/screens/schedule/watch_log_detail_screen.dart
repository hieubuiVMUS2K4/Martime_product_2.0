import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../providers/watchkeeping_provider.dart';
import '../../../data/models/watchkeeping_log.dart';
import '../../widgets/common/loading_widget.dart';
import '../../../l10n/app_localizations.dart';

class WatchLogDetailScreen extends StatefulWidget {
  final int logId;

  const WatchLogDetailScreen({super.key, required this.logId});

  @override
  State<WatchLogDetailScreen> createState() => _WatchLogDetailScreenState();
}

class _WatchLogDetailScreenState extends State<WatchLogDetailScreen> {
  WatchkeepingLog? _log;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadLog();
  }

  Future<void> _loadLog() async {
    final provider = Provider.of<WatchkeepingProvider>(context, listen: false);
    final log = await provider.getLogById(widget.logId);
    setState(() {
      _log = log;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.watchLogDetails),
        actions: [
          if (_log != null && !_log!.isSigned)
            IconButton(
              icon: const Icon(Icons.add_chart),
              onPressed: () => _showUpdateLogDialog(),
              tooltip: l10n.updateLogEntry,
            ),
        ],
      ),
      body: _isLoading
          ? Center(child: LoadingWidget(message: l10n.loadingWatchLog))
          : _log == null
              ? Center(child: Text(l10n.watchLogNotFound))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header Card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    Icons.calendar_today,
                                    color: Theme.of(context).colorScheme.primary,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    DateFormat('EEEE, MMMM d, yyyy').format(_log!.watchDate),
                                    style: Theme.of(context).textTheme.titleLarge,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Text(
                                _log!.watchPeriodDisplay,
                                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                      fontWeight: FontWeight.bold,
                                    ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: _log!.watchType == 'NAVIGATION'
                                          ? MaritimeTheme.accent.withOpacity(0.1)
                                          : MaritimeTheme.warning.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Text(
                                      _log!.watchTypeDisplay,
                                      style: TextStyle(
                                        color: _log!.watchType == 'NAVIGATION' ? MaritimeTheme.accent : MaritimeTheme.warning,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  const Spacer(),
                                  if (_log!.isSigned)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: MaritimeTheme.success.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.check_circle, color: MaritimeTheme.success, size: 16),
                                          const SizedBox(width: 4),
                                          Text(
                                            l10n.signed,
                                            style: const TextStyle(
                                              color: MaritimeTheme.success,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ],
                                      ),
                                    )
                                  else
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: MaritimeTheme.error.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.warning, color: MaritimeTheme.error, size: 16),
                                          const SizedBox(width: 4),
                                          Text(
                                            l10n.unsigned,
                                            style: const TextStyle(
                                              color: MaritimeTheme.error,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 16),

                      // Personnel
                      _buildSection(
                        l10n.personnel,
                        Icons.people,
                        [
                          _buildInfoRow(l10n.officerOnWatch, _log!.officerOnWatch),
                          if (_log!.lookout != null)
                            _buildInfoRow(l10n.lookout, _log!.lookout!),
                        ],
                      ),

                      // Weather & Sea Conditions
                      _buildSection(
                        l10n.weatherSeaConditions,
                        Icons.wb_cloudy,
                        [
                          if (_log!.weatherConditions != null)
                            _buildInfoRow(l10n.weather, _log!.weatherConditions!),
                          if (_log!.seaState != null)
                            _buildInfoRow(l10n.seaState, _log!.seaStateDisplay),
                          if (_log!.visibility != null)
                            _buildInfoRow(l10n.visibility, _log!.visibilityDisplay),
                        ],
                      ),

                      // Navigation Data
                      if (_log!.courseLogged != null || _log!.speedLogged != null || _log!.positionLat != null)
                        _buildSection(
                          l10n.navigationData,
                          Icons.explore,
                          [
                            if (_log!.courseLogged != null)
                              _buildInfoRow(l10n.course, '${_log!.courseLogged!.toStringAsFixed(0)}° True'),
                            if (_log!.speedLogged != null)
                              _buildInfoRow(l10n.speed, '${_log!.speedLogged!.toStringAsFixed(1)} knots'),
                            if (_log!.distanceRun != null)
                              _buildInfoRow(l10n.distanceRun, '${_log!.distanceRun!.toStringAsFixed(1)} NM'),
                            if (_log!.positionLat != null)
                              _buildInfoRow(l10n.shipPosition, _log!.positionDisplay),
                          ],
                        ),

                      // Engine Status
                      if (_log!.engineStatus != null)
                        _buildSection(
                          l10n.engineStatus,
                          Icons.settings,
                          [
                            _buildInfoRow(l10n.status, _log!.engineStatus!),
                          ],
                        ),

                      // Notable Events
                      if (_log!.hasNotableEvents)
                        _buildSection(
                          l10n.notableEvents,
                          Icons.event_note,
                          [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: MaritimeTheme.warning.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: MaritimeTheme.warning.withOpacity(0.3)),
                              ),
                              child: Text(
                                _log!.notableEvents!,
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ),
                          ],
                        ),

                      // Signature
                      if (_log!.isSigned)
                        _buildSection(
                          l10n.masterSignature,
                          Icons.draw,
                          [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: MaritimeTheme.success.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: MaritimeTheme.success.withOpacity(0.3)),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.check_circle, color: MaritimeTheme.success),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      _log!.masterSignature!,
                                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                            fontStyle: FontStyle.italic,
                                            fontWeight: FontWeight.bold,
                                          ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
    );
  }

  Widget _buildSection(String title, IconData icon, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: children,
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: MaritimeTheme.textSecondary,
                  ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showUpdateLogDialog() async {
    final l10n = AppLocalizations.of(context);
    // Simple dialog to add notable events or update weather conditions
    final notesController = TextEditingController(text: _log?.notableEvents ?? '');
    
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.addLogEntry),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.addNotableEvents),
            const SizedBox(height: 16),
            TextField(
              controller: notesController,
              decoration: InputDecoration(
                labelText: l10n.notableEvents,
                hintText: l10n.notableEventsHint,
                border: const OutlineInputBorder(),
              ),
              maxLines: 4,
              autofocus: true,
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: MaritimeTheme.accent.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: MaritimeTheme.accent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.onlyMasterCanSign,
                      style: const TextStyle(fontSize: 12, color: MaritimeTheme.accent),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.save),
          ),
        ],
      ),
    );

    if (result == true && mounted) {
      // In a real app, you would call an API to update the log
      // For now, just show a success message
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.logEntrySaved),
        ),
      );
    }
  }
}
