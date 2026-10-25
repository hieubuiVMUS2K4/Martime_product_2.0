// This is a basic Flutter widget test for Maritime Crew App.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:maritime_crew_app/app.dart';
import 'package:maritime_crew_app/core/di/service_locator.dart';
import 'package:maritime_crew_app/core/localization/locale_provider.dart';
import 'package:maritime_crew_app/presentation/screens/auth/login_screen.dart';

void main() {
  late Directory storage;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    storage = await Directory.systemTemp.createTemp('app_smoke_test_');
    Hive.init(storage.path);
    await setupServiceLocator();
  });
  tearDown(() async {
    await resetServiceLocator();
    await Hive.close();
    await storage.delete(recursive: true);
  });

  testWidgets('App smoke test', (WidgetTester tester) async {
    // Match the provider boundary installed by main.dart.
    await tester.pumpWidget(ChangeNotifierProvider(
      create: (_) => LocaleProvider(),
      child: const MyApp(),
    ));

    // Verify that the app loads without crashing
    await tester.pumpAndSettle();

    // Basic verification that app initializes
    expect(find.byType(MyApp), findsOneWidget);
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
