import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../catalog/domain/entities/catalog.dart';
import '../../domain/entities/coach_class.dart';
import '../../domain/entities/course.dart';

/// Dữ liệu nháp của wizard — giữ lại khi rời màn (khóa: 'new' hoặc classId).
class WizardData {
  String name = '';
  String description = '';
  List<String> sportIds = [];
  ClassType classType = ClassType.regular;
  AreaType areaType = AreaType.indoor;
  int capacity = 12;
  int price = 1000000;
  String? roomId;
  DateTime? startDate;
  Set<int> weekdays = {};
  TimeOfDay startTime = const TimeOfDay(hour: 18, minute: 0);
  int durationMinutes = 60;
  int sessionCount = 8;
  List<DraftSession> sessions = [];
  bool loaded = false;

  ClassDraft toDraft() => ClassDraft(
    name: name,
    description: description.trim().isEmpty ? null : description.trim(),
    sportIds: sportIds,
    capacity: capacity,
    classType: classType,
    areaType: areaType,
    price: price,
    roomId: roomId ?? '',
    sessions: sessions,
  );
}

final classDraftStoreProvider = Provider<Map<String, WizardData>>((ref) => {});
