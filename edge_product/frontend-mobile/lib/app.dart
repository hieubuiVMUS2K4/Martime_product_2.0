import 'package:flutter/material.dart';
import 'core/theme/maritime_theme.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'presentation/screens/auth/login_screen.dart';
import 'presentation/screens/home/home_screen.dart';
import 'presentation/screens/alarms/alarm_list_screen.dart';
import 'presentation/screens/alarms/alarm_statistics_screen.dart';
import 'presentation/screens/alarms/alarm_history_screen.dart';
import 'presentation/screens/chat/chat_screen.dart';
import 'presentation/providers/auth_provider.dart';
import 'presentation/providers/task_provider.dart';
import 'presentation/providers/sync_provider.dart';
import 'presentation/providers/alarm_provider.dart';
import 'presentation/providers/chat_provider.dart';
import 'providers/watchkeeping_provider.dart';
import 'core/di/service_locator.dart';
import 'data/repositories/alarm_repository.dart';
import 'data/repositories/chat_repository.dart';
import 'core/localization/locale_provider.dart';

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // LocaleProvider đã được provide từ main.dart
    return Consumer<LocaleProvider>(
      builder: (context, localeProvider, child) {
        // Return the MaterialApp, providers should be set up outside or with child
        return child!;
      },
      child: MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(create: (_) => TaskProvider()),
          ChangeNotifierProvider(create: (_) => SyncProvider()),
          ChangeNotifierProvider(
            create: (_) => AlarmProvider(sl<AlarmRepository>()),
          ),
          ChangeNotifierProvider(create: (_) => WatchkeepingProvider()),
          ChangeNotifierProvider(
            create: (_) => ChatProvider(sl<ChatRepository>()),
          ),
        ],
        child: Builder(
          builder: (context) {
            // Get locale provider from the outer context
            final localeProvider = Provider.of<LocaleProvider>(context);
            
            return MaterialApp(
            title: 'Maritime Crew App',
            debugShowCheckedModeBanner: false,
            
            // Localization delegates
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            
            // Supported locales
            supportedLocales: const [
              Locale('en'), // English
              Locale('vi'), // Vietnamese
              Locale('fil'), // Filipino
              Locale('hi'), // Hindi
              Locale('zh'), // Chinese
              Locale('ja'), // Japanese
              Locale('ko'), // Korean
            ],
            
            // Current locale from provider
            locale: localeProvider.locale,
            
            // Fallback locale resolution
            localeResolutionCallback: (locale, supportedLocales) {
              // Check if current locale is supported
              if (locale != null) {
                for (var supportedLocale in supportedLocales) {
                  if (supportedLocale.languageCode == locale.languageCode) {
                    return supportedLocale;
                  }
                }
              }
              // Default to English if not supported
              return const Locale('en');
            },
            
            theme: MaritimeTheme.lightTheme,
            home: const LoginScreen(),
            routes: {
              '/login': (context) => const LoginScreen(),
              '/home': (context) => const HomeScreen(),
              '/alarms': (context) => const AlarmListScreen(),
              '/alarms/statistics': (context) => const AlarmStatisticsScreen(),
              '/alarms/history': (context) => const AlarmHistoryScreen(),
              '/chat': (context) => const ChatScreen(),
            },
            );
          },
        ),
      ),
    );
  }
}
