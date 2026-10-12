import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/server_config_dialog.dart';
import '../../../core/storage/server_config_storage.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _crewIdController = TextEditingController();
  final _passwordController = TextEditingController();
  String _currentServerUrl = '';
  
  @override
  void initState() {
    super.initState();
    _loadServerUrl();
  }
  
  Future<void> _loadServerUrl() async {
    final url = await ServerConfigStorage.getServerUrl();
    setState(() {
      _currentServerUrl = url;
    });
  }
  
  @override
  void dispose() {
    _crewIdController.dispose();
    _passwordController.dispose();
    super.dispose();
  }
  
  Future<void> _openServerConfig() async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => const ServerConfigDialog(),
    );
    
    // Reload URL if changed
    if (result == true) {
      await _loadServerUrl();
    }
  }
  
  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    
    final success = await authProvider.login(
      crewId: _crewIdController.text.trim(),
      password: _passwordController.text,
    );
    
    if (success && mounted) {
      Navigator.pushReplacementNamed(context, '/home');
    } else if (authProvider.error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Login failed: ${authProvider.error}'),
          backgroundColor: MaritimeTheme.error,
        ),
      );
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaritimeTheme.accentSoft,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  Icon(
                    Icons.sailing,
                    size: 100,
                    color: MaritimeTheme.primary,
                  ),
                  const SizedBox(height: 16),
                  
                  // Title
                  Text(
                    'Maritime Crew App',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: MaritimeTheme.primary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Login to manage your tasks',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: MaritimeTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 48),
                  
                  // Card with form
                  Card(
                    elevation: 4,
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        children: [
                          // Crew ID field (used as username)
                          TextFormField(
                            controller: _crewIdController,
                            decoration: const InputDecoration(
                              labelText: 'Crew ID (Username)',
                              prefixIcon: Icon(Icons.person),
                              hintText: 'Enter your Crew ID',
                              helperText: 'Use your Crew ID as username',
                            ),
                            textInputAction: TextInputAction.next,
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter your Crew ID';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),
                          
                          // Password field
                          TextFormField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Password',
                              prefixIcon: Icon(Icons.lock),
                              hintText: 'Enter your password',
                              helperText: 'Default: Your date of birth (ddMMyyyy)',
                            ),
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _login(),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter your password';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 24),
                          
                          // Login button
                          Consumer<AuthProvider>(
                            builder: (context, authProvider, child) {
                              return SizedBox(
                                width: double.infinity,
                                height: 48,
                                child: ElevatedButton(
                                  onPressed: authProvider.isLoading ? null : _login,
                                  style: ElevatedButton.styleFrom(
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                  ),
                                  child: authProvider.isLoading
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Text(
                                          'Login',
                                          style: TextStyle(fontSize: 16),
                                        ),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Current Server URL Display
                  if (_currentServerUrl.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: MaritimeTheme.accentSoft,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: MaritimeTheme.accentBorder),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.cloud, size: 16, color: MaritimeTheme.primary),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              _currentServerUrl,
                              style: TextStyle(
                                fontSize: 12,
                                color: MaritimeTheme.primary,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                  
                  // Server Settings Button
                  TextButton.icon(
                    onPressed: _openServerConfig,
                    icon: const Icon(Icons.settings),
                    label: const Text('Server Settings'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
