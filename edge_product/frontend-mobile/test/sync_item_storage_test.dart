import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:maritime_crew_app/data/models/sync_item.dart';

void main() {
  test('sync queue preserves all item types and fields after reopening',
      () async {
    final directory = await Directory.systemTemp.createTemp('sync_item_test_');
    Hive.init(directory.path);
    Hive.registerAdapter(SyncItemAdapter());
    Hive.registerAdapter(SyncItemTypeAdapter());
    try {
      final createdAt = DateTime.utc(2026, 10, 3);
      var box = await Hive.openBox<SyncItem>('queue');
      for (final type in SyncItemType.values) {
        await box.put(
            type.name,
            SyncItem(
              id: type.name,
              type: type,
              data: {
                'taskId': 42,
                'nested': {'done': true},
                'items': [1, 2]
              },
              createdAt: createdAt,
              retryCount: 3,
            ));
      }
      await box.close();
      box = await Hive.openBox<SyncItem>('queue');
      for (final type in SyncItemType.values) {
        final item = box.get(type.name)!;
        expect(item.id, type.name);
        expect(item.type, type);
        expect(item.data, {
          'taskId': 42,
          'nested': {'done': true},
          'items': [1, 2]
        });
        expect(item.createdAt, createdAt);
        expect(item.retryCount, 3);
      }
    } finally {
      await Hive.close();
      Hive.resetAdapters();
      await directory.delete(recursive: true);
    }
  });
}
