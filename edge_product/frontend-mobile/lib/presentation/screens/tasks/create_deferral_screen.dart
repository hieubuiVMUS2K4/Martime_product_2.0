import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../data/models/maintenance_task.dart';
import '../../../data/models/create_deferral_request_dto.dart';
import '../../providers/task_provider.dart';
import '../../../l10n/app_localizations.dart';

class CreateDeferralScreen extends StatefulWidget {
  final MaintenanceTask task;

  const CreateDeferralScreen({
    super.key,
    required this.task,
  });

  @override
  State<CreateDeferralScreen> createState() => _CreateDeferralScreenState();
}

class _CreateDeferralScreenState extends State<CreateDeferralScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  final _additionalNoteController = TextEditingController();
  final _rootCauseController = TextEditingController();
  final _preventiveMeasuresController = TextEditingController();
  
  DateTime? _proposedDate;
  String _priority = 'NORMAL';
  bool _isSubmitting = false;
  
  // Common reasons for deferral - will be populated from l10n
  String? _selectedReason;
  List<String> _commonReasons = [];
  
  // Common reasons for overdue tasks (more detailed)
  String? _selectedOverdueReason;
  List<String> _commonOverdueReasons = [];

  @override
  void dispose() {
    _reasonController.dispose();
    _additionalNoteController.dispose();
    _rootCauseController.dispose();
    _preventiveMeasuresController.dispose();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context) async {
    final now = DateTime.now();
    final currentDue = widget.task.nextDueAt != null ? DateTime.parse(widget.task.nextDueAt!) : now;
    final initialDate = currentDue.isAfter(now) ? currentDue.add(const Duration(days: 1)) : now.add(const Duration(days: 1));
    
    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );

    if (picked != null && picked != _proposedDate) {
      setState(() {
        _proposedDate = picked;
      });
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (!_formKey.currentState!.validate()) return;
    if (_proposedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.pleaseSelectDeferralDate)),
      );
      return;
    }

    // Validate reason selection
    final isOverdue = widget.task.isOverdue;
    final selectedReason = isOverdue ? _selectedOverdueReason : _selectedReason;
    if (selectedReason == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.pleaseSelectDeferralReason)),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      // Build final reason: selected reason + optional note
      String finalReason = selectedReason;
      final additionalNote = _additionalNoteController.text.trim();
      if (additionalNote.isNotEmpty) {
        finalReason = '$selectedReason. $additionalNote';
      }

      print('📤 Creating deferral request for task ${widget.task.id}');
      print('   Reason: $finalReason');
      if (isOverdue) {
        print('   Root cause: ${_rootCauseController.text.trim()}');
        print('   Preventive measures: ${_preventiveMeasuresController.text.trim()}');
      }
      
      final dto = CreateDeferralRequestDto(
        taskId: widget.task.id,
        reason: finalReason,
        proposedDueDate: _proposedDate!.toIso8601String(),
        priority: _priority,
        rootCause: isOverdue ? _rootCauseController.text.trim() : null,
        preventiveMeasures: isOverdue ? _preventiveMeasuresController.text.trim() : null,
        attachments: null,
      );

      await Provider.of<TaskProvider>(context, listen: false).createDeferralRequest(dto);
      print('✅ Deferral request sent successfully');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.deferralRequestSent),
            backgroundColor: MaritimeTheme.success,
          ),
        );
        Navigator.pop(context); // Close screen
        Navigator.pop(context); // Close detail screen (optional, or just refresh)
      }
    } catch (e) {
      print('❌ Error creating deferral: $e');
      if (mounted) {
        // Extract meaningful error message
        String errorMsg = e.toString();
        if (errorMsg.contains('DioException')) {
          if (errorMsg.contains('timeout')) {
            errorMsg = l10n.requestTimeoutError;
          } else if (errorMsg.contains('400')) {
            errorMsg = l10n.validationError;
          } else if (errorMsg.contains('500')) {
            errorMsg = l10n.serverError;
          }
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.errorMessage(errorMsg)),
            backgroundColor: MaritimeTheme.error,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isOverdue = widget.task.isOverdue;
    final dateFormat = DateFormat('dd/MM/yyyy');
    
    // Populate reasons from l10n
    if (_commonReasons.isEmpty) {
      _commonReasons = [
        l10n.deferralReasonPartsPending,
        l10n.deferralReasonWeatherCondition,
        l10n.deferralReasonHigherPriority,
        l10n.deferralReasonAwaitingApproval,
        l10n.deferralReasonPersonnelUnavailable,
        l10n.deferralReasonEquipmentInUse,
        l10n.deferralReasonOther,
      ];
    }
    if (_commonOverdueReasons.isEmpty) {
      _commonOverdueReasons = [
        l10n.overdueReasonPartsPending,
        l10n.overdueReasonExternalFactors,
        l10n.overdueReasonHigherPriority,
        l10n.overdueReasonResourceShortage,
        l10n.overdueReasonAwaitingApproval,
        l10n.overdueReasonTechnicalIssue,
        l10n.overdueReasonOther,
      ];
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.requestDeferral),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Task Info Summary
            Card(
              color: MaritimeTheme.surfaceLight,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.task.displayName,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    const SizedBox(height: 4),
                    Text(l10n.currentDueDate(widget.task.nextDueAt != null ? dateFormat.format(DateTime.parse(widget.task.nextDueAt!)) : "N/A")),
                    if (isOverdue)
                      Text(
                        l10n.statusOverdue.toUpperCase(),
                        style: const TextStyle(color: MaritimeTheme.error, fontWeight: FontWeight.bold),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Proposed Date
            InkWell(
              onTap: () => _selectDate(context),
              child: InputDecorator(
                decoration: InputDecoration(
                  labelText: '${l10n.deferralRequest} *',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.calendar_today),
                ),
                child: Text(
                  _proposedDate != null ? dateFormat.format(_proposedDate!) : l10n.selectDate,
                  style: TextStyle(
                    color: _proposedDate != null ? Colors.black : MaritimeTheme.textTertiary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Priority
            DropdownButtonFormField<String>(
              value: _priority,
              decoration: InputDecoration(
                labelText: l10n.taskPriority,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(value: 'LOW', child: Text(l10n.priorityLow)),
                DropdownMenuItem(value: 'NORMAL', child: Text(l10n.priorityNormal)),
                DropdownMenuItem(value: 'HIGH', child: Text(l10n.priorityHigh)),
              ],
              onChanged: (val) => setState(() => _priority = val!),
            ),
            const SizedBox(height: 16),

            // Reason Selection - Normal tasks
            if (!isOverdue) ...[
              DropdownButtonFormField<String>(
                value: _selectedReason,
                decoration: InputDecoration(
                  labelText: '${l10n.deferralRequest} *',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.format_list_bulleted),
                ),
                hint: Text(l10n.selectReason),
                items: _commonReasons.map((reason) {
                  return DropdownMenuItem(value: reason, child: Text(reason));
                }).toList(),
                onChanged: (val) => setState(() => _selectedReason = val),
                validator: (value) {
                  if (value == null) return l10n.pleaseSelectDeferralReason;
                  return null;
                },
              ),
              const SizedBox(height: 16),
              
              // Additional note (optional)
              TextFormField(
                controller: _additionalNoteController,
                decoration: InputDecoration(
                  labelText: l10n.notesOptional,
                  border: const OutlineInputBorder(),
                  hintText: l10n.enterMoreDetails,
                  prefixIcon: const Icon(Icons.note_add),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
            ],

            // Overdue specific fields
            if (isOverdue) ...[
              // Reason Selection - Overdue tasks
              DropdownButtonFormField<String>(
                value: _selectedOverdueReason,
                decoration: InputDecoration(
                  labelText: '${l10n.deferralRequest} *',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.format_list_bulleted),
                ),
                hint: Text(l10n.selectReason),
                items: _commonOverdueReasons.map((reason) {
                  return DropdownMenuItem(value: reason, child: Text(reason));
                }).toList(),
                onChanged: (val) => setState(() => _selectedOverdueReason = val),
                validator: (value) {
                  if (value == null) return l10n.pleaseSelectDeferralReason;
                  return null;
                },
              ),
              const SizedBox(height: 16),
              
              // Additional note for overdue (optional)
              TextFormField(
                controller: _additionalNoteController,
                decoration: InputDecoration(
                  labelText: l10n.notesOptional,
                  border: const OutlineInputBorder(),
                  hintText: l10n.enterMoreDetails,
                  prefixIcon: const Icon(Icons.note_add),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              
              const Divider(),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  l10n.additionalInfoOverdue,
                  style: const TextStyle(fontWeight: FontWeight.bold, color: MaritimeTheme.warning),
                ),
              ),
              TextFormField(
                controller: _rootCauseController,
                decoration: InputDecoration(
                  labelText: l10n.rootCauseLabel,
                  border: const OutlineInputBorder(),
                  hintText: l10n.rootCauseHint,
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _preventiveMeasuresController,
                decoration: InputDecoration(
                  labelText: l10n.preventiveMeasuresLabel,
                  border: const OutlineInputBorder(),
                  hintText: l10n.preventiveMeasuresHint,
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
            ],

            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _isSubmitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: Theme.of(context).primaryColor,
                foregroundColor: Colors.white,
              ),
              child: _isSubmitting
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(l10n.submitRequest),
            ),
          ],
        ),
      ),
    );
  }
}
