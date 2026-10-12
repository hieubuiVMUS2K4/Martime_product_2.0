import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../../providers/watchkeeping_provider.dart';
import '../../../data/models/watchkeeping_log.dart';

class CreateWatchLogScreen extends StatefulWidget {
  const CreateWatchLogScreen({super.key});

  @override
  State<CreateWatchLogScreen> createState() => _CreateWatchLogScreenState();
}

class _CreateWatchLogScreenState extends State<CreateWatchLogScreen> {
  final _formKey = GlobalKey<FormState>();
  
  DateTime _watchDate = DateTime.now();
  String _watchPeriod = '08-12';
  String _watchType = 'NAVIGATION';
  final _officerController = TextEditingController();
  final _lookoutController = TextEditingController();
  final _weatherController = TextEditingController();
  String _seaState = 'Calm';
  String _visibility = 'Good';
  final _courseController = TextEditingController();
  final _speedController = TextEditingController();
  final _latController = TextEditingController();
  final _lonController = TextEditingController();
  final _distanceController = TextEditingController();
  final _engineStatusController = TextEditingController();
  final _notableEventsController = TextEditingController();

  bool _isSubmitting = false;

  final List<String> _watchPeriods = [
    '00-04',
    '04-08',
    '08-12',
    '12-16',
    '16-20',
    '20-24',
  ];

  final List<String> _seaStates = ['Calm', 'Moderate', 'Rough', 'Very Rough'];
  final List<String> _visibilities = ['Good', 'Moderate', 'Poor', 'Fog'];

  @override
  void dispose() {
    _officerController.dispose();
    _lookoutController.dispose();
    _weatherController.dispose();
    _courseController.dispose();
    _speedController.dispose();
    _latController.dispose();
    _lonController.dispose();
    _distanceController.dispose();
    _engineStatusController.dispose();
    _notableEventsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Watch Log'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Date & Time
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Date & Time',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
                    ListTile(
                      leading: const Icon(Icons.calendar_today),
                      title: const Text('Watch Date'),
                      subtitle: Text('${_watchDate.year}-${_watchDate.month.toString().padLeft(2, '0')}-${_watchDate.day.toString().padLeft(2, '0')}'),
                      onTap: () async {
                        final date = await showDatePicker(
                          context: context,
                          initialDate: _watchDate,
                          firstDate: DateTime.now().subtract(const Duration(days: 365)),
                          lastDate: DateTime.now(),
                        );
                        if (date != null) {
                          setState(() => _watchDate = date);
                        }
                      },
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: _watchPeriod,
                      decoration: const InputDecoration(
                        labelText: 'Watch Period',
                        prefixIcon: Icon(Icons.access_time),
                        border: OutlineInputBorder(),
                      ),
                      items: _watchPeriods.map((period) {
                        return DropdownMenuItem(
                          value: period,
                          child: Text(period),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) setState(() => _watchPeriod = value);
                      },
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: _watchType,
                      decoration: const InputDecoration(
                        labelText: 'Watch Type',
                        prefixIcon: Icon(Icons.category),
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'NAVIGATION', child: Text('🧭 Navigation Watch')),
                        DropdownMenuItem(value: 'ENGINE', child: Text('⚙️ Engine Watch')),
                      ],
                      onChanged: (value) {
                        if (value != null) setState(() => _watchType = value);
                      },
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Personnel
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Personnel',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _officerController,
                      decoration: const InputDecoration(
                        labelText: 'Officer on Watch *',
                        prefixIcon: Icon(Icons.person),
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Officer on watch is required';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _lookoutController,
                      decoration: const InputDecoration(
                        labelText: 'Lookout',
                        prefixIcon: Icon(Icons.visibility),
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Weather & Sea
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Weather & Sea Conditions',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _weatherController,
                      decoration: const InputDecoration(
                        labelText: 'Weather Conditions',
                        prefixIcon: Icon(Icons.wb_sunny),
                        border: OutlineInputBorder(),
                        hintText: 'Temperature: 25°C, Wind: 15 knots',
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _seaState,
                      decoration: const InputDecoration(
                        labelText: 'Sea State',
                        prefixIcon: Icon(Icons.waves),
                        border: OutlineInputBorder(),
                      ),
                      items: _seaStates.map((state) {
                        return DropdownMenuItem(value: state, child: Text(state));
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) setState(() => _seaState = value);
                      },
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _visibility,
                      decoration: const InputDecoration(
                        labelText: 'Visibility',
                        prefixIcon: Icon(Icons.remove_red_eye),
                        border: OutlineInputBorder(),
                      ),
                      items: _visibilities.map((vis) {
                        return DropdownMenuItem(value: vis, child: Text(vis));
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) setState(() => _visibility = value);
                      },
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Navigation Data
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Navigation Data',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _courseController,
                            decoration: const InputDecoration(
                              labelText: 'Course (°)',
                              prefixIcon: Icon(Icons.explore),
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.number,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            controller: _speedController,
                            decoration: const InputDecoration(
                              labelText: 'Speed (knots)',
                              prefixIcon: Icon(Icons.speed),
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.number,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _latController,
                            decoration: const InputDecoration(
                              labelText: 'Latitude',
                              border: OutlineInputBorder(),
                              hintText: '12.3456',
                            ),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            controller: _lonController,
                            decoration: const InputDecoration(
                              labelText: 'Longitude',
                              border: OutlineInputBorder(),
                              hintText: '123.4567',
                            ),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _distanceController,
                      decoration: const InputDecoration(
                        labelText: 'Distance Run (NM)',
                        prefixIcon: Icon(Icons.straighten),
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Engine & Events
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Engine & Notable Events',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _engineStatusController,
                      decoration: const InputDecoration(
                        labelText: 'Engine Status',
                        prefixIcon: Icon(Icons.settings),
                        border: OutlineInputBorder(),
                        hintText: 'Main Engine: 75% RPM',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _notableEventsController,
                      decoration: const InputDecoration(
                        labelText: 'Notable Events',
                        prefixIcon: Icon(Icons.event_note),
                        border: OutlineInputBorder(),
                        hintText: 'Course altered, ships sighted, weather changes...',
                      ),
                      maxLines: 3,
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Submit Button
            FilledButton.icon(
              onPressed: _isSubmitting ? null : _submitForm,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save),
              label: Text(_isSubmitting ? 'Creating...' : 'Create Watch Log'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.all(16),
              ),
            ),

            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Future<void> _submitForm() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    final log = WatchkeepingLog(
      watchDate: _watchDate,
      watchPeriod: _watchPeriod,
      watchType: _watchType,
      officerOnWatch: _officerController.text,
      lookout: _lookoutController.text.isEmpty ? null : _lookoutController.text,
      weatherConditions: _weatherController.text.isEmpty ? null : _weatherController.text,
      seaState: _seaState,
      visibility: _visibility,
      courseLogged: _courseController.text.isEmpty ? null : double.tryParse(_courseController.text),
      speedLogged: _speedController.text.isEmpty ? null : double.tryParse(_speedController.text),
      positionLat: _latController.text.isEmpty ? null : double.tryParse(_latController.text),
      positionLon: _lonController.text.isEmpty ? null : double.tryParse(_lonController.text),
      distanceRun: _distanceController.text.isEmpty ? null : double.tryParse(_distanceController.text),
      engineStatus: _engineStatusController.text.isEmpty ? null : _engineStatusController.text,
      notableEvents: _notableEventsController.text.isEmpty ? null : _notableEventsController.text,
    );

    final provider = Provider.of<WatchkeepingProvider>(context, listen: false);
    final success = await provider.createLog(log);

    setState(() => _isSubmitting = false);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Watch log created successfully')),
        );
        Navigator.pop(context, true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(provider.error ?? 'Failed to create watch log'),
            backgroundColor: MaritimeTheme.error,
          ),
        );
      }
    }
  }
}
