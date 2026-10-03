part of 'sync_item.dart';

// Keep type IDs and field numbers aligned with the Hive annotations.
// These adapters are maintained manually to avoid generator conflicts.
class SyncItemAdapter extends TypeAdapter<SyncItem> {
  @override
  final int typeId = 0;

  @override
  SyncItem read(BinaryReader reader) {
    final fieldCount = reader.readByte();
    final fields = <int, dynamic>{
      for (var i = 0; i < fieldCount; i++) reader.readByte(): reader.read(),
    };
    return SyncItem(
      id: fields[0] as String,
      type: fields[1] as SyncItemType,
      data: (fields[2] as Map).cast<String, dynamic>(),
      createdAt: fields[3] as DateTime,
      retryCount: fields[4] as int,
    );
  }

  @override
  void write(BinaryWriter writer, SyncItem obj) {
    writer
      ..writeByte(5)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.type)
      ..writeByte(2)
      ..write(obj.data)
      ..writeByte(3)
      ..write(obj.createdAt)
      ..writeByte(4)
      ..write(obj.retryCount);
  }
}

class SyncItemTypeAdapter extends TypeAdapter<SyncItemType> {
  @override
  final int typeId = 1;

  @override
  SyncItemType read(BinaryReader reader) {
    switch (reader.readByte()) {
      case 0:
        return SyncItemType.taskComplete;
      case 1:
        return SyncItemType.taskStart;
      case 2:
        return SyncItemType.profileUpdate;
      case 3:
        return SyncItemType.checklistComplete;
      case 4:
        return SyncItemType.taskSubmit;
      case 5:
        return SyncItemType.deferralCreate;
      case 6:
        return SyncItemType.deferralCancel;
      case 7:
        return SyncItemType.sparePartsSync;
      default:
        return SyncItemType.taskComplete;
    }
  }

  @override
  void write(BinaryWriter writer, SyncItemType obj) {
    switch (obj) {
      case SyncItemType.taskComplete:
        writer.writeByte(0);
      case SyncItemType.taskStart:
        writer.writeByte(1);
      case SyncItemType.profileUpdate:
        writer.writeByte(2);
      case SyncItemType.checklistComplete:
        writer.writeByte(3);
      case SyncItemType.taskSubmit:
        writer.writeByte(4);
      case SyncItemType.deferralCreate:
        writer.writeByte(5);
      case SyncItemType.deferralCancel:
        writer.writeByte(6);
      case SyncItemType.sparePartsSync:
        writer.writeByte(7);
    }
  }
}
