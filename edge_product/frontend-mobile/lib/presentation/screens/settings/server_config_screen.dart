import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/api_constants.dart';

class ServerConfigScreen extends StatefulWidget {
  const ServerConfigScreen({super.key});

  @override
  State<ServerConfigScreen> createState() => _ServerConfigScreenState();
}

class _ServerConfigScreenState extends State<ServerConfigScreen> {
  final _formKey = GlobalKey<FormState>();
  final _baseUrlController = TextEditingController();
  bool _isLoading = false;
  String _currentUrl = '';

  @override
  void initState() {
    super.initState();
    _loadCurrentUrl();
  }

  Future<void> _loadCurrentUrl() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      final savedUrl = prefs.getString('api_base_url') ?? ApiConstants.baseUrl;
      setState(() {
        _currentUrl = savedUrl;
        _baseUrlController.text = savedUrl;
      });
    } catch (e) {
      print('Error loading URL: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _saveUrl() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('api_base_url', _baseUrlController.text);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Server URL saved successfully! Please restart the app.'),
            backgroundColor: MaritimeTheme.success,
            duration: Duration(seconds: 4),
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save URL: $e'),
            backgroundColor: MaritimeTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _resetToDefault() async {
    setState(() {
      _baseUrlController.text = ApiConstants.baseUrl;
    });
  }

  @override
  void dispose() {
    _baseUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Server Configuration'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Info Card
                    Card(
                      color: MaritimeTheme.accentSoft,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Icon(Icons.info_outline, color: MaritimeTheme.primary),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Configure the API server address. Make sure the server is accessible from your device.',
                                style: TextStyle(color: MaritimeTheme.primary),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Current URL
                    Text(
                      'Current Server URL',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(16),
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: MaritimeTheme.surface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: MaritimeTheme.border),
                      ),
                      child: Text(
                        _currentUrl.isEmpty ? 'Loading...' : _currentUrl,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // New URL Input
                    Text(
                      'New Server URL',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _baseUrlController,
                      decoration: const InputDecoration(
                        hintText: 'http://192.168.1.100:5001',
                        prefixIcon: Icon(Icons.link),
                        border: OutlineInputBorder(),
                        helperText: 'Enter full URL including http:// or https://',
                      ),
                      keyboardType: TextInputType.url,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter a server URL';
                        }
                        if (!value.startsWith('http://') && !value.startsWith('https://')) {
                          return 'URL must start with http:// or https://';
                        }
                        // Remove trailing slash if present
                        if (value.endsWith('/')) {
                          _baseUrlController.text = value.substring(0, value.length - 1);
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 16),

                    // Reset to Default Button
                    TextButton.icon(
                      onPressed: _resetToDefault,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Reset to Default'),
                    ),

                    const SizedBox(height: 32),

                    // Default Endpoints Info
                    Text(
                      'Default API Endpoints',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 12),
                    _buildEndpointInfo('Login', ApiConstants.login),
                    _buildEndpointInfo('My Tasks', ApiConstants.myTasks),
                    _buildEndpointInfo('Profile', ApiConstants.crewProfile),

                    const SizedBox(height: 32),

                    // Warning Card
                    Card(
                      color: MaritimeTheme.warningSoft,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Icon(Icons.warning_amber_rounded, color: MaritimeTheme.warning),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Changing the server URL requires app restart to take effect.',
                                style: TextStyle(color: MaritimeTheme.warning),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Save Button
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        onPressed: _isLoading ? null : _saveUrl,
                        icon: const Icon(Icons.save),
                        label: const Text(
                          'Save Configuration',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildEndpointInfo(String label, String endpoint) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(
                color: MaritimeTheme.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              endpoint,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
