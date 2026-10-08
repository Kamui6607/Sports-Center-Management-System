import '../../../core/error/app_failure.dart';
import '../../../core/utils/money.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../auth/domain/entities/auth_models.dart';
import '../../classes/data/course_mock_rules.dart';
import '../../classes/domain/entities/coach_class.dart';
import '../../classes/domain/entities/course.dart';
import '../../coach/data/coach_mock_repository.dart';
import '../../coach/domain/entities/wallet.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../../refunds/domain/entities/refund.dart';
import '../domain/entities/approvals.dart';
import '../domain/repositories/manager_repository.dart';

/// Mock nghiệp vụ duyệt của Manager (`coaches/cv`, `classes/:id/review`,
/// `coaches/wallet/transactions/:id/review`).
class ManagerMockRepository implements ManagerRepository {
  ManagerMockRepository(this._server);

  final MockServer _server;

  void _requireManager() => _server.requireRole(UserRole.manager);

  CvApplication _toCv(MockDatabase db, CertificationRow c) {
    final cp = db.coachProfile(c.coachProfileId);
    final u = db.user(cp.userId);
    return CvApplication(
      coachProfileId: cp.id,
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      specialization: cp.specialization,
      experienceYears: cp.experienceYears,
      bio: cp.bio,
      certification: db.toCertification(cp.id)!,
    );
  }

  WithdrawalRequest _toWithdrawal(MockDatabase db, WalletTxRow t) {
    final w = db.wallets.firstWhere((x) => x.id == t.walletId);
    return WithdrawalRequest(
      transaction: CoachMockRepository.toTx(db, t),
      coachProfileId: w.coachProfileId,
      coachName: db.userOfCoach(w.coachProfileId).fullName,
      walletBalance: w.balance,
      pendingRefundHold: db.refundHold(w.id),
    );
  }

  @override
  Future<ApprovalCounts> counts() => _server.run(() {
    final db = _server.db;
    _requireManager();
    return ApprovalCounts(
      cvs: db.certifications.where((c) => c.status == CoachApprovalStatus.pending).length,
      classes: db.classes.where((c) => c.status == ClassStatus.pending).length,
      withdrawals: db.walletTxs
          .where((t) => t.type == WalletTxType.withdrawal && t.status == WalletTxStatus.pending)
          .length,
      refunds: db.refunds.where((r) => r.status == RefundStatus.pending).length,
    );
  });

  @override
  Future<List<CvApplication>> pendingCvs() => _server.run(() {
    final db = _server.db;
    _requireManager();
    return db.certifications.where((c) => c.status == CoachApprovalStatus.pending).map((c) => _toCv(db, c)).toList()
      ..sort((a, b) => a.certification.submittedAt.compareTo(b.certification.submittedAt));
  });

  @override
  Future<CvApplication> cv(String coachProfileId) => _server.run(() {
    final db = _server.db;
    _requireManager();
    final c = db.certifications.where((x) => x.coachProfileId == coachProfileId).firstOrNull;
    if (c == null) throw const AppFailure.notFound('Không tìm thấy hồ sơ.');
    return _toCv(db, c);
  });

  @override
  Future<void> reviewCv(String coachProfileId, {required bool approve, String? reason}) => _server.run(() {
    final db = _server.db;
    _requireManager();
    final c = db.certifications.where((x) => x.coachProfileId == coachProfileId).firstOrNull;
    if (c == null) throw const AppFailure.notFound('Không tìm thấy hồ sơ.');
    if (c.status != CoachApprovalStatus.pending) throw const AppFailure.business('Hồ sơ đã được xử lý.');
    final u = db.userOfCoach(coachProfileId);
    if (approve) {
      c.status = CoachApprovalStatus.approved;
      u.isActive = true;
      db.notify(u.id, NotificationType.general, 'Hồ sơ đã được duyệt', 'Chúc mừng! Bạn có thể bắt đầu tạo khóa học.');
    } else {
      c
        ..status = CoachApprovalStatus.rejected
        ..rejectReason = reason?.trim();
      db.notify(
        u.id,
        NotificationType.general,
        'Hồ sơ bị từ chối',
        'Vui lòng xem lý do và nộp lại CV.',
        reason: reason?.trim(),
      );
    }
  });

  @override
  Future<List<CourseClass>> pendingClasses() => _server.run(() {
    final db = _server.db;
    _requireManager();
    return db.classes.where((c) => c.status == ClassStatus.pending).map(db.toCourse).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  });

  @override
  Future<CoachClassDetail> classDetail(String classId) => _server.run(() => buildCoachClassDetail(_server, classId));

  @override
  Future<void> reviewClass(String classId, {required bool approve, String? reason}) => _server.run(() {
    final db = _server.db;
    _requireManager();
    final c = db.classRow(classId);
    if (c.status != ClassStatus.pending) {
      throw AppFailure.business('Khóa học đã ở trạng thái ${c.status.name}, không thể duyệt lại.');
    }
    final coachUser = db.userOfCoach(c.coachProfileId);
    if (approve) {
      c.status = ClassStatus.approved;
      db.notify(
        coachUser.id,
        NotificationType.classApproved,
        'Khóa học đã được duyệt',
        'Khóa "${c.name}" đã mở bán.',
        metadata: {'classId': c.id},
      );
      for (final m in db.users.where((u) => u.role == UserRole.member)) {
        db.notify(
          m.id,
          NotificationType.newClass,
          'Khóa học mới',
          'Khóa "${c.name}" vừa mở bán.',
          metadata: {'classId': c.id},
        );
      }
    } else {
      c
        ..status = ClassStatus.rejected
        ..rejectReason = reason?.trim(); // TODO BE-2: BE chưa lưu lý do.
      db.notify(
        coachUser.id,
        NotificationType.classRejected,
        'Khóa học bị từ chối',
        'Khóa "${c.name}" bị từ chối. Xem lý do và gửi lại.',
        metadata: {'classId': c.id},
        reason: reason?.trim(),
      );
    }
  });

  @override
  Future<List<WithdrawalRequest>> withdrawals({WalletTxStatus? status}) => _server.run(() {
    final db = _server.db;
    _requireManager();
    return db.walletTxs
        .where((t) => t.type == WalletTxType.withdrawal && (status == null || t.status == status))
        .map((t) => _toWithdrawal(db, t))
        .toList()
      ..sort((a, b) => b.transaction.createdAt.compareTo(a.transaction.createdAt));
  });

  @override
  Future<WithdrawalRequest> withdrawal(String transactionId) => _server.run(() {
    final db = _server.db;
    _requireManager();
    final t = db.walletTxs.where((x) => x.id == transactionId && x.type == WalletTxType.withdrawal).firstOrNull;
    if (t == null) throw const AppFailure.notFound('Không tìm thấy lệnh rút tiền.');
    return _toWithdrawal(db, t);
  });

  @override
  Future<void> reviewWithdrawal(String transactionId, {required bool approve, String? reason}) => _server.run(() {
    final db = _server.db;
    _requireManager();
    final t = db.walletTxs.where((x) => x.id == transactionId && x.type == WalletTxType.withdrawal).firstOrNull;
    if (t == null) throw const AppFailure.notFound('Không tìm thấy lệnh rút tiền.');
    if (t.status != WalletTxStatus.pending) throw const AppFailure.business('Lệnh rút đã được xử lý.');
    final w = db.wallets.firstWhere((x) => x.id == t.walletId);
    final coachUser = db.userOfCoach(w.coachProfileId);
    if (approve) {
      if (w.balance < t.amount) throw const AppFailure.business('Số dư ví HLV không đủ để duyệt.');
      w.balance -= t.amount;
      t.status = WalletTxStatus.completed;
      db.notify(
        coachUser.id,
        NotificationType.withdrawalApproved,
        'Rút tiền thành công',
        'Lệnh rút ${Money.format(t.amount)} đã được duyệt.',
      );
    } else {
      t
        ..status = WalletTxStatus.rejected
        ..rejectReason = reason?.trim();
      db.notify(
        coachUser.id,
        NotificationType.withdrawalRejected,
        'Lệnh rút tiền bị từ chối',
        'Lệnh rút ${Money.format(t.amount)} bị từ chối.',
        reason: reason?.trim(),
      );
    }
  });
}
