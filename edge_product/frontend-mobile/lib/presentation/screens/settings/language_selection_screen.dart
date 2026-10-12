import 'package:flutter/material.dart';
import 'package:maritime_crew_app/core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import '../../../core/localization/locale_provider.dart';
import '../../../l10n/app_localizations.dart';

/// Màn hình chọn ngôn ngữ
class LanguageSelectionScreen extends StatelessWidget {
  const LanguageSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final localeProvider = Provider.of<LocaleProvider>(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.languageSettings),
        elevation: 0,
      ),
      body: Column(
        children: [
          // Header Section
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.language,
                  size: 48,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  l10n.selectLanguage,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${l10n.language}: ${localeProvider.currentLanguageFlag} ${localeProvider.currentLanguageName}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onPrimaryContainer.withOpacity(0.7),
                      ),
                ),
              ],
            ),
          ),

          // Language List
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: LocaleProvider.supportedLocales.length,
              itemBuilder: (context, index) {
                final localeInfo = LocaleProvider.supportedLocales[index];
                final isSelected = localeProvider.locale.languageCode == 
                                   localeInfo.locale.languageCode;

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  elevation: isSelected ? 4 : 1,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: isSelected
                        ? BorderSide(
                            color: Theme.of(context).colorScheme.primary,
                            width: 2,
                          )
                        : BorderSide.none,
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 8,
                    ),
                    leading: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? Theme.of(context).colorScheme.primaryContainer
                            : MaritimeTheme.surface,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Center(
                        child: Text(
                          localeInfo.flag,
                          style: const TextStyle(fontSize: 32),
                        ),
                      ),
                    ),
                    title: Text(
                      localeInfo.name,
                      style: TextStyle(
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        fontSize: 18,
                      ),
                    ),
                    subtitle: Text(
                      _getLanguageSubtitle(localeInfo.locale.languageCode),
                      style: TextStyle(
                        color: MaritimeTheme.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                    trailing: isSelected
                        ? Icon(
                            Icons.check_circle,
                            color: Theme.of(context).colorScheme.primary,
                            size: 28,
                          )
                        : Icon(
                            Icons.circle_outlined,
                            color: MaritimeTheme.textTertiary,
                            size: 28,
                          ),
                    onTap: () => _changeLanguage(
                      context,
                      localeProvider,
                      localeInfo.locale,
                    ),
                  ),
                );
              },
            ),
          ),

          // Info Footer
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  Icons.info_outline,
                  size: 20,
                  color: MaritimeTheme.textSecondary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.restartRequired,
                    style: TextStyle(
                      fontSize: 12,
                      color: MaritimeTheme.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _getLanguageSubtitle(String code) {
    switch (code) {
      case 'en':
        return 'IMO Standard Language';
      case 'vi':
        return 'Vietnamese Language';
      case 'fil':
        return 'Wikang Filipino';
      case 'hi':
        return 'भारतीय भाषा';
      case 'zh':
        return '中国语言';
      case 'ja':
        return '日本の言語';
      case 'ko':
        return '한국어';
      default:
        return '';
    }
  }

  void _changeLanguage(
    BuildContext context,
    LocaleProvider provider,
    Locale locale,
  ) async {
    final l10n = AppLocalizations.of(context);
    
    if (provider.locale.languageCode == locale.languageCode) {
      return;
    }

    // Show loading indicator
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    await provider.setLocale(locale);
    
    // Wait for rebuild
    await Future.delayed(const Duration(milliseconds: 300));

    if (context.mounted) {
      // Close loading dialog
      Navigator.pop(context);
      
      // Show success message
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.languageChanged),
          backgroundColor: MaritimeTheme.success,
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
      
      // Navigate back after short delay
      await Future.delayed(const Duration(milliseconds: 500));
      if (context.mounted) {
        Navigator.pop(context);
      }
    }
  }
}
