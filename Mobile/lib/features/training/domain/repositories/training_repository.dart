import '../entities/training.dart';

/// Lộ trình tập luyện — module `training-plans`.
abstract interface class TrainingRepository {
  /// Lộ trình của Member đang đăng nhập (`GET /training-plans?memberId=`).
  Future<List<TrainingPlan>> myPlans();

  Future<TrainingPlan> plan(String planId);

  /// Lộ trình HLV lập cho một học viên.
  Future<List<TrainingPlan>> plansForMember(String memberProfileId);

  /// `POST /training-plans`.
  Future<TrainingPlan> createPlan(PlanDraft draft);

  /// `POST /training-plans/results`.
  Future<void> addResult(String planId, ResultDraft draft);
}
