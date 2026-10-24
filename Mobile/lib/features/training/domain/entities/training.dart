/// Một chỉ số tập luyện (L9 — BE `ProgressMetric`): giá trị SỐ + đơn vị + ghi chú chữ tùy chọn.
class TrainingMetric {
  const TrainingMetric({required this.name, this.value, this.unit, this.note, this.lowerIsBetter = false});

  final String name;

  /// Giá trị số (null với dữ liệu cũ chỉ có ghi chú chữ).
  final double? value;
  final String? unit;
  final String? note;

  /// Số càng nhỏ càng tốt (VD thời gian chạy).
  final bool lowerIsBetter;

  /// "58.5 kg" / "90 giây" / ghi chú khi không có số.
  String get display {
    final v = value;
    if (v == null) return note ?? '';
    final number = v == v.roundToDouble() ? v.toInt().toString() : v.toString();
    final u = unit?.trim() ?? '';
    return u.isEmpty ? number : '$number $u';
  }
}

/// Kết quả một buổi tập (`TrainingResult`).
class TrainingResult {
  const TrainingResult({required this.id, required this.date, this.metrics = const [], this.coachNote});

  final String id;
  final DateTime date;

  final List<TrainingMetric> metrics;

  /// "Nhận xét của HLV" (Q6).
  final String? coachNote;
}

/// Lộ trình tập luyện (`TrainingPlan`).
class TrainingPlan {
  const TrainingPlan({
    required this.id,
    required this.name,
    required this.startDate,
    required this.endDate,
    required this.coachProfileId,
    required this.coachName,
    required this.memberProfileId,
    required this.memberName,
    this.description,
    this.results = const [],
  });

  final String id;
  final String name;
  final String? description;
  final DateTime startDate;
  final DateTime endDate;
  final String coachProfileId;
  final String coachName;
  final String memberProfileId;
  final String memberName;
  final List<TrainingResult> results;

  bool isActive(DateTime now) => !now.isBefore(startDate) && now.isBefore(endDate);

  bool hasEnded(DateTime now) => !now.isBefore(endDate);
}

class PlanDraft {
  const PlanDraft({
    required this.memberProfileId,
    required this.name,
    required this.startDate,
    required this.endDate,
    this.description,
  });

  final String memberProfileId;
  final String name;
  final String? description;
  final DateTime startDate;
  final DateTime endDate;
}

class ResultDraft {
  const ResultDraft({required this.date, this.metrics = const [], this.coachNote});

  final DateTime date;
  final List<TrainingMetric> metrics;
  final String? coachNote;
}
