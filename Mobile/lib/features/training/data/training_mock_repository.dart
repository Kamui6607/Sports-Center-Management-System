import '../../../core/error/app_failure.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../domain/entities/training.dart';
import '../domain/repositories/training_repository.dart';

/// Mock theo `BE/src/modules/training-plans`.
class TrainingMockRepository implements TrainingRepository {
  TrainingMockRepository(this._server);

  final MockServer _server;

  @override
  Future<List<TrainingPlan>> myPlans() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    return db.trainingPlans.where((p) => p.memberProfileId == member.id).map(db.toTrainingPlan).toList()
      ..sort((a, b) => b.startDate.compareTo(a.startDate));
  });

  @override
  Future<TrainingPlan> plan(String planId) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final p = db.trainingPlans.where((x) => x.id == planId).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Không tìm thấy lộ trình.');
    final allowed =
        db.memberOfUser(u.id)?.id == p.memberProfileId ||
        db.coachOfUser(u.id)?.id == p.coachProfileId ||
        u.role == UserRole.manager;
    if (!allowed) throw const AppFailure.forbidden();
    return db.toTrainingPlan(p);
  });

  @override
  Future<List<TrainingPlan>> plansForMember(String memberProfileId) => _server.run(() {
    final db = _server.db;
    _server.requireCoach();
    return db.trainingPlans.where((p) => p.memberProfileId == memberProfileId).map(db.toTrainingPlan).toList()
      ..sort((a, b) => b.startDate.compareTo(a.startDate));
  });

  @override
  Future<TrainingPlan> createPlan(PlanDraft d) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    // Chỉ lập lộ trình cho học viên đang học khóa của mình.
    final teaches = db.classes
        .where((c) => c.coachProfileId == coach.id)
        .any((c) => db.studentsOf(c.id).contains(d.memberProfileId));
    if (!teaches) throw const AppFailure.forbidden('Học viên không thuộc khóa học của bạn.');
    if (d.name.trim().isEmpty) {
      throw const AppFailure.validation('Tên lộ trình là bắt buộc.', fieldErrors: {'name': 'Bắt buộc'});
    }
    if (!d.endDate.isAfter(d.startDate)) {
      throw const AppFailure.validation(
        'Ngày kết thúc phải sau ngày bắt đầu.',
        fieldErrors: {'endDate': 'Phải sau ngày bắt đầu'},
      );
    }
    final row = TrainingPlanRow(
      id: db.nextId('tp'),
      memberProfileId: d.memberProfileId,
      coachProfileId: coach.id,
      name: d.name.trim(),
      description: d.description?.trim(),
      startDate: d.startDate,
      endDate: d.endDate,
    );
    db.trainingPlans.add(row);
    db.notify(
      db.userOfMember(d.memberProfileId).id,
      NotificationType.trainingPlanAssigned,
      'Lộ trình mới',
      'HLV ${db.user(coach.userId).fullName} đã giao "${row.name}".',
      metadata: {'planId': row.id},
    );
    return db.toTrainingPlan(row);
  });

  @override
  Future<void> addResult(String planId, ResultDraft d) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final p = db.trainingPlans.where((x) => x.id == planId).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Không tìm thấy lộ trình.');
    if (p.coachProfileId != coach.id) {
      throw const AppFailure.forbidden('Bạn chỉ ghi kết quả cho lộ trình mình phụ trách.');
    }
    if (d.date.isBefore(p.startDate) || d.date.isAfter(p.endDate)) {
      throw const AppFailure.validation('Ngày ghi nhận phải nằm trong thời hạn lộ trình.');
    }
    if (d.date.isAfter(db.now())) throw const AppFailure.validation('Không ghi kết quả cho ngày trong tương lai.');
    if (d.metrics.isEmpty && (d.coachNote?.trim().isEmpty ?? true)) {
      throw const AppFailure.validation('Nhập nhận xét hoặc ít nhất một chỉ số.');
    }
    db.trainingResults.add(
      TrainingResultRow(
        id: db.nextId('tr'),
        planId: planId,
        date: d.date,
        metrics: d.metrics,
        coachNote: d.coachNote?.trim().isEmpty ?? true ? null : d.coachNote!.trim(),
      ),
    );
  });
}
