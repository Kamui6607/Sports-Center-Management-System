/// Kết quả một buổi tập (`TrainingResult`).
class TrainingResult {
  const TrainingResult({required this.id, required this.date, this.metrics = const {}, this.coachNote});

  final String id;
  final DateTime date;

  /// Chỉ số tự do (VD "Cân nặng": "58 kg").
  final Map<String, String> metrics;

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
  const ResultDraft({required this.date, this.metrics = const {}, this.coachNote});

  final DateTime date;
  final Map<String, String> metrics;
  final String? coachNote;
}
