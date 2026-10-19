import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/json.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../domain/entities/coach_class.dart';
import '../../domain/entities/course.dart';

/// Dữ liệu nháp của wizard — giữ trong bộ nhớ khi rời màn (khóa: 'new', draftId hoặc classId) và được
/// TỰ LƯU lên server (`Class.draftData`, trạng thái DRAFT) để HLV mở lại được khi app bị thoát/lỗi.
class WizardData {
  String name = '';
  String description = '';

  /// Mô tả chi tiết mục tiêu khóa học.
  String goal = '';

  /// Mã mục tiêu khóa (1–[kMaxClassGoals]).
  List<String> goalTags = [];
  TrainingLevel? targetLevel;
  ClassType classType = ClassType.regular;
  int capacity = 12;
  int price = 1000000;
  String? roomId;
  DateTime? startDate;
  Set<int> weekdays = {};
  TimeOfDay startTime = const TimeOfDay(hour: 18, minute: 0);
  int durationMinutes = 60;
  int sessionCount = 8;
  List<DraftSession> sessions = [];

  /// Bước wizard đang đứng (mở lại nháp đúng chỗ).
  int step = 0;

  /// Id bản nháp trên server (null = chưa lưu lần nào).
  String? draftId;
  bool loaded = false;

  /// Phạm vi Gym: bộ môn cố định, khu vực trong nhà.
  AreaType get areaType => AreaType.indoor;

  /// Ngày kết thúc dự kiến = ngày của buổi cuối cùng.
  DateTime? get endDate => sessions.isEmpty ? null : sessions.map((s) => s.end).reduce((a, b) => a.isAfter(b) ? a : b);

  /// Sinh danh sách buổi từ ngày bắt đầu + các thứ trong tuần + giờ + số buổi (giờ VN).
  /// Trả `false` nếu thiếu dữ liệu để sinh.
  bool generateSessions() {
    final start = startDate;
    if (start == null || weekdays.isEmpty || sessionCount < 1) {
      sessions = [];
      return false;
    }
    final out = <DraftSession>[];
    var day = VnTime.startOfDay(start);
    while (out.length < sessionCount && out.length < 200) {
      final w = VnTime.wall(day);
      if (weekdays.contains(w.weekday)) {
        final s = VnTime.fromWall(w.year, w.month, w.day, startTime.hour, startTime.minute);
        out.add(DraftSession(s, s.add(Duration(minutes: durationMinutes))));
      }
      day = day.add(const Duration(days: 1));
    }
    sessions = out;
    return true;
  }

  ClassDraft toDraft() => ClassDraft(
    name: name.trim(),
    description: description.trim().isEmpty ? null : description.trim(),
    goal: goal.trim().isEmpty ? null : goal.trim(),
    goalTags: goalTags,
    targetLevel: targetLevel,
    sportIds: [kGymSport.id],
    capacity: capacity,
    classType: classType,
    areaType: areaType,
    price: price,
    roomId: roomId ?? '',
    sessions: sessions,
  );

  /// Trạng thái wizard gửi lên server (`draftData`).
  Map<String, Object?> toState() => {
    'v': 1,
    'step': step,
    'roomId': roomId,
    'startDate': startDate?.toUtc().toIso8601String(),
    'weekdays': weekdays.toList()..sort(),
    'startTime': '${startTime.hour.toString().padLeft(2, '0')}:${startTime.minute.toString().padLeft(2, '0')}',
    'durationMinutes': durationMinutes,
    'sessionCount': sessionCount,
    'sessions': [
      for (final s in sessions) {'start': s.start.toUtc().toIso8601String(), 'end': s.end.toUtc().toIso8601String()},
    ],
  };

  /// Khôi phục từ bản nháp server: [course] = field của Class, [state] = `draftData`.
  void restore(CourseClass course, Map<String, Object?> state) {
    final Json j = state;
    name = course.name;
    description = course.description ?? '';
    goal = course.goal ?? '';
    goalTags = [...course.goalTags];
    targetLevel = course.targetLevel;
    classType = course.classType;
    capacity = course.capacity < 1 ? 12 : course.capacity;
    price = course.price;
    step = j.integer('step').clamp(0, 2);
    roomId = j.strOrNull('roomId');
    startDate = j.dateOrNull('startDate');
    weekdays = {for (final w in j.strList('weekdays')) ?int.tryParse(w)};
    final hm = j.str('startTime', '18:00').split(':');
    startTime = TimeOfDay(hour: int.tryParse(hm.first) ?? 18, minute: int.tryParse(hm.last) ?? 0);
    durationMinutes = j.integer('durationMinutes', 60);
    sessionCount = j.integer('sessionCount', 8);
    sessions = [for (final s in j.objList('sessions')) DraftSession(s.date('start'), s.date('end'))]
        .where((s) => s.start.isAfter(DateTime.now()))
        .toList();
    loaded = true;
  }
}

final classDraftStoreProvider = Provider<Map<String, WizardData>>((ref) => {});
