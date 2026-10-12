import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/sync_provider.dart';
import '../../../core/cache/cache_manager.dart';
import '../../../core/localization/locale_provider.dart';
import '../auth/login_screen.dart';
import 'server_config_screen.dart';
import 'language_selection_screen.dart';
import '../../../l10n/app_localizations.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final syncProvider = Provider.of<SyncProvider>(context);
    final localeProvider = Provider.of<LocaleProvider>(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.settings),
      ),
      body: ListView(
        children: [
          // Language Section
          _buildSection(
            context,
            title: l10n.language,
            children: [
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.language, size: 24),
                ),
                title: Text(l10n.languageSettings),
                subtitle: Text(
                  '${localeProvider.currentLanguageFlag} ${localeProvider.currentLanguageName}',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const LanguageSelectionScreen(),
                    ),
                  );
                },
              ),
            ],
          ),

          // User Info Section
          _buildSection(
            context,
            title: l10n.account,
            children: [
              ListTile(
                leading: CircleAvatar(
                  child: Text(
                    authProvider.fullName?.substring(0, 1).toUpperCase() ?? '?',
                  ),
                ),
                title: Text(authProvider.fullName ?? l10n.user),
                subtitle: Text(authProvider.position ?? l10n.position),
                trailing: Text(
                  '${l10n.crewId}: ${authProvider.crewId ?? l10n.notAvailable}',
                  style: TextStyle(color: MaritimeTheme.textSecondary),
                ),
              ),
            ],
          ),

          // Sync Section
          _buildSection(
            context,
            title: l10n.synchronization,
            children: [
              ListTile(
                leading: Icon(
                  syncProvider.isOnline ? Icons.cloud_done : Icons.cloud_off,
                  color: syncProvider.isOnline ? MaritimeTheme.success : MaritimeTheme.error,
                ),
                title: Text(l10n.syncStatus),
                subtitle: Text(syncProvider.isOnline ? l10n.online : l10n.offline),
              ),
              ListTile(
                leading: const Icon(Icons.sync),
                title: Text(l10n.itemsWaitingToSync(syncProvider.queueSize)),
                subtitle: syncProvider.lastSyncTime != null 
                    ? Text(l10n.lastSyncAt(_formatDateTime(syncProvider.lastSyncTime!, context)))
                    : null,
                trailing: syncProvider.isSyncing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : null,
              ),
              if (syncProvider.queueSize > 0 && syncProvider.isOnline)
                ListTile(
                  leading: const Icon(Icons.cloud_upload),
                  title: Text(l10n.syncNow),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: syncProvider.isSyncing
                      ? null
                      : () async {
                          await syncProvider.syncQueue();
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(l10n.connectionSuccessful)),
                            );
                          }
                        },
                ),
            ],
          ),

          // Server Section
          _buildSection(
            context,
            title: l10n.serverConfiguration,
            children: [
              ListTile(
                leading: const Icon(Icons.dns),
                title: Text(l10n.serverConfiguration),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const ServerConfigScreen(),
                    ),
                  );
                },
              ),
            ],
          ),

          // Cache Section
          _buildSection(
            context,
            title: l10n.dataStorage,
            children: [
              ListTile(
                leading: const Icon(Icons.storage),
                title: Text(l10n.clearCache),
                subtitle: Text(l10n.removeAllCachedData),
                trailing: const Icon(Icons.delete_outline),
                onTap: () {
                  _showClearCacheDialog(context);
                },
              ),
            ],
          ),

          // About Section
          _buildSection(
            context,
            title: l10n.about,
            children: [
              ListTile(
                leading: const Icon(Icons.info_outline),
                title: Text(l10n.version),
                subtitle: const Text('1.0.0'),
              ),
              ListTile(
                leading: const Icon(Icons.description),
                title: Text(l10n.license),
                subtitle: Text(l10n.proprietary),
              ),
            ],
          ),

          // Logout Button
          Padding(
            padding: const EdgeInsets.all(16),
            child: ElevatedButton.icon(
              onPressed: () {
                _showLogoutDialog(context, authProvider);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: MaritimeTheme.error,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              icon: const Icon(Icons.logout),
              label: Text(l10n.logout),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime dateTime, BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final now = DateTime.now();
    final difference = now.difference(dateTime);
    
    if (difference.inMinutes < 1) {
      return l10n.justNow;
    } else if (difference.inMinutes < 60) {
      return l10n.minutesAgo(difference.inMinutes);
    } else if (difference.inHours < 24) {
      return l10n.hoursAgo(difference.inHours);
    } else {
      return '${dateTime.day}/${dateTime.month} ${dateTime.hour}:${dateTime.minute.toString().padLeft(2, '0')}';
    }
  }

  Widget _buildSection(
    BuildContext context, {
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
          child: Text(
            title.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
          ),
        ),
        Card(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: children,
          ),
        ),
      ],
    );
  }

  void _showClearCacheDialog(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.clearCacheTitle),
        content: Text(l10n.clearCacheMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () async {
              final cacheManager = CacheManager();
              await cacheManager.clearAllCache();
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(l10n.cacheClearedSuccess)),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: MaritimeTheme.error,
              foregroundColor: Colors.white,
            ),
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, AuthProvider authProvider) {
    final l10n = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.logoutTitle),
        content: Text(l10n.logoutMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () async {
              await authProvider.logout();
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (context) => const LoginScreen()),
                  (route) => false,
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: MaritimeTheme.error,
              foregroundColor: Colors.white,
            ),
            child: Text(l10n.logout),
          ),
        ],
      ),
    );
  }
}
