import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import '../../core/storage/server_config_storage.dart';
import '../../core/network/api_client.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class ServerConfigDialog extends StatefulWidget {
  const ServerConfigDialog({super.key});

  @override
  State<ServerConfigDialog> createState() => _ServerConfigDialogState();
}

class _ServerConfigDialogState extends State<ServerConfigDialog> {
  final _formKey = GlobalKey<FormState>();
  final _urlController = TextEditingController();
  bool _isLoading = false;
  bool _isTesting = false;
  String? _testResult;

  @override
  void initState() {
    super.initState();
    _loadCurrentUrl();
  }

  Future<void> _loadCurrentUrl() async {
    final url = await ServerConfigStorage.getServerUrl();
    setState(() {
      _urlController.text = url;
    });
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isTesting = true;
      _testResult = null;
    });

    try {
      final url = _urlController.text.trim();
      
      // Create temporary ApiClient to test connection
      final dio = ApiClient().dio;
      dio.options.baseUrl = url;
      
      // Test with health endpoint
      final response = await dio.get(
        '/api/health',
        options: Options(
          validateStatus: (status) => status != null && status < 500,
        ),
      ).timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        setState(() {
          _testResult = '✓ Connection successful!';
          _isTesting = false;
        });
      } else {
        setState(() {
          _testResult = '⚠ Server responded with status ${response.statusCode}';
          _isTesting = false;
        });
      }
    } catch (e) {
      setState(() {
        _testResult = '✗ Connection failed: ${e.toString()}';
        _isTesting = false;
      });
    }
  }

  Future<void> _saveAndApply() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final url = _urlController.text.trim();
      
      // Save to storage
      await ServerConfigStorage.saveServerUrl(url);
      
      // Update ApiClient with new URL
      ApiClient().updateBaseUrl(url);
      
      // Reset auth state when changing server
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      await authProvider.logout();
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Server URL updated to: $url'),
            backgroundColor: MaritimeTheme.success,
            duration: const Duration(seconds: 3),
          ),
        );
        Navigator.pop(context, true); // Return true to indicate URL changed
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error saving URL: $e'),
            backgroundColor: MaritimeTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showExamples() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Example Server URLs'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Click on an example to use it:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ...ServerConfigStorage.getExampleUrls().map(
              (example) => ListTile(
                dense: true,
                title: Text(example),
                leading: const Icon(Icons.link, size: 20),
                onTap: () {
                  setState(() {
                    _urlController.text = example;
                  });
                  Navigator.pop(context);
                },
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Tips:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              '• Use "ipconfig" on Windows to find your IP\n'
              '• Use "ifconfig" on Mac/Linux\n'
              '• Server must run on 0.0.0.0:5001\n'
              '• Both devices must be on same WiFi',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  children: [
                    Icon(Icons.settings, color: MaritimeTheme.primary),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Server Configuration',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // URL Input
                TextFormField(
                  controller: _urlController,
                  decoration: InputDecoration(
                    labelText: 'Server URL',
                    hintText: 'http://192.168.1.100:5001',
                    prefixIcon: const Icon(Icons.cloud),
                    suffixIcon: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.help_outline),
                          onPressed: _showExamples,
                          tooltip: 'Show examples',
                        ),
                        IconButton(
                          icon: const Icon(Icons.content_paste),
                          onPressed: () async {
                            final data = await Clipboard.getData('text/plain');
                            if (data?.text != null) {
                              setState(() {
                                _urlController.text = data!.text!;
                              });
                            }
                          },
                          tooltip: 'Paste from clipboard',
                        ),
                      ],
                    ),
                  ),
                  keyboardType: TextInputType.url,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Please enter server URL';
                    }
                    if (!ServerConfigStorage.isValidUrl(value)) {
                      return 'Invalid URL format (must start with http:// or https://)';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Test Result
                if (_testResult != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _testResult!.startsWith('✓')
                          ? MaritimeTheme.successSoft
                          : MaritimeTheme.warningSoft,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: _testResult!.startsWith('✓')
                            ? MaritimeTheme.success
                            : MaritimeTheme.warning,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _testResult!.startsWith('✓')
                              ? Icons.check_circle
                              : Icons.warning,
                          color: _testResult!.startsWith('✓')
                              ? MaritimeTheme.success
                              : MaritimeTheme.warning,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _testResult!,
                            style: TextStyle(
                              color: _testResult!.startsWith('✓')
                                  ? MaritimeTheme.success
                                  : MaritimeTheme.warning,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 24),

                // Info Card
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: MaritimeTheme.accentSoft,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.info_outline, size: 16, color: MaritimeTheme.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'How to connect to Edge Server:',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: MaritimeTheme.primary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        '1. Find your PC IP address (ipconfig)\n'
                        '2. Start Edge Server: dotnet run --urls "http://0.0.0.0:5001"\n'
                        '3. Enter URL: http://YOUR_IP:5001\n'
                        '4. Test connection before saving',
                        style: TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Action Buttons
                Wrap(
                  alignment: WrapAlignment.end,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    TextButton(
                      onPressed: _isLoading || _isTesting ? null : () => Navigator.pop(context),
                      child: const Text('Cancel'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _isLoading || _isTesting ? null : _testConnection,
                      icon: _isTesting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.wifi_find, size: 18),
                      label: const Text('Test'),
                    ),
                    ElevatedButton.icon(
                      onPressed: _isLoading || _isTesting ? null : _saveAndApply,
                      icon: _isLoading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.save, size: 18),
                      label: const Text('Save'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
