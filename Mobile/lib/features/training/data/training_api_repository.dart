import '../../../api/training_json.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/training.dart';
import '../domain/repositories/training_repository.dart';

/// [TrainingRepository] gọi BE thật — module `training-plans`.
class TrainingApiRepository implements TrainingRepository {
  TrainingApiRepository(this._api);

  final ApiClient _api;

  Future<List<TrainingPlan>> _plans({String? memberId}) async {
    final rows = (await _api.get('/training-plans', query: {'memberId': memberId})).list;
    return rows.map(TrainingJson.plan).toList()..sort((a, b) => b.startDate.compareTo(a.startDate));
  }

  @override
  Future<List<TrainingPlan>> myPlans() => _plans();

  @override
  Future<TrainingPlan> plan(String planId) async => TrainingJson.plan((await _api.get('/training-plans/$planId')).json);

  @override
  Future<List<TrainingPlan>> plansForMember(String memberProfileId) => _plans(memberId: memberProfileId);

  @override
  Future<TrainingPlan> createPlan(PlanDraft d) async {
    // BE yêu cầu `coachId` = CoachProfile của chính HLV đang đăng nhập.
    final coachId = (await _api.get('/auth/me')).json.obj('coachProfile').str('id');
    final res = await _api.post(
      '/training-plans',
      body: {
        'memberId': d.memberProfileId,
        'coachId': coachId,
        'name': d.name.trim(),
        if (d.description?.trim().isNotEmpty ?? false) 'description': d.description!.trim(),
        'startDate': d.startDate.toUtc().toIso8601String(),
        'endDate': d.endDate.toUtc().toIso8601String(),
      },
    );
    return TrainingJson.plan(res.json);
  }

  @override
  Future<void> addResult(String planId, ResultDraft d) async {
    // L9: BE chỉ nhận chỉ số có giá trị SỐ (form đã kiểm tra — đây là lưới an toàn).
    final invalid = d.metrics.where((m) => m.value == null).firstOrNull;
    if (invalid != null) {
      throw AppFailure.validation(
        'Chỉ số "${invalid.name}" cần giá trị là số.',
        fieldErrors: {'metrics': 'Giá trị chỉ số phải là số'},
      );
    }
    final note = d.coachNote?.trim();
    await _api.post(
      '/training-plans/results',
      body: {
        'planId': planId,
        'date': d.date.toUtc().toIso8601String(),
        if (d.metrics.isNotEmpty) 'metrics': d.metrics.map(TrainingJson.metric).toList(),
        if (note != null && note.isNotEmpty) 'coachNote': note,
      },
    );
  }
}
