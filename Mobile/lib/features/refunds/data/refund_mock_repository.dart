import '../../../core/error/app_failure.dart';
import '../../../core/utils/money.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../coach/domain/entities/wallet.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../../payments/domain/entities/payment.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/refund.dart';
import '../domain/repositories/refund_repository.dart';

/// Mock theo `BE/src/modules/refunds`.
class RefundMockRepository implements RefundRepository {
  RefundMockRepository(this._server);

  final MockServer _server;

  /// Hạn hủy khóa: ≥ 24 giờ trước buổi khai giảng.
  static const cancelWindow = Duration(hours: 24);

  Refund _toRefund(MockDatabase db, RefundRow r) {
    final c = db.classRow(r.classId);
    return Refund(
      id: r.id,
      classId: c.id,
      className: c.name,
      reason: r.reason,
      amount: r.amount,
      coachDebitAmount: r.coachDebitAmount,
      status: r.status,
      createdAt: r.createdAt,
      memberName: db.userOfMember(r.memberProfileId).fullName,
      coachName: db.userOfCoach(c.coachProfileId).fullName,
      sessionStart: r.scheduleId == null ? null : db.session(r.scheduleId!).start,
      note: r.note,
      processedAt: r.processedAt,
      processedNote: r.processedNote,
      rejectReason: r.rejectReason,
      paidAmount: db.payments.firstWhere((p) => p.id == r.paymentId).amount,
    );
  }

  CancellationEligibility _eligibility(MockDatabase db, String memberId, String classId) {
    final payment = db.coursePayment(memberId, classId);
    if (payment == null) {
      return const CancellationEligibility(
        allowed: false,
        paidAmount: 0,
        estimatedRefund: 0,
        blockReason: 'Bạn chưa mua khóa học này.',
      );
    }
    final remaining = payment.amount - db.refundedOf(payment.id);
    final first = db.mainSessionsOf(classId).where((s) => s.status != ScheduleStatus.cancelled).firstOrNull;
    final deadline = first?.start.subtract(cancelWindow);
    String? block;
    if (db.refunds.any(
      (r) =>
          r.paymentId == payment.id && r.reason == RefundReason.memberCancelCourse && r.status == RefundStatus.pending,
    )) {
      block = 'Bạn đã gửi yêu cầu hủy khóa, đang chờ Quản lý duyệt.';
    } else if (deadline == null || !db.now().isBefore(deadline)) {
      block = 'Đã quá hạn hủy khóa (phải trước buổi khai giảng ít nhất 24 giờ).';
    } else if (remaining <= 0) {
      block = 'Giao dịch đã được hoàn hết.';
    }
    return CancellationEligibility(
      allowed: block == null,
      paidAmount: payment.amount,
      estimatedRefund: remaining.clamp(0, payment.amount),
      deadline: deadline,
      blockReason: block,
    );
  }

  @override
  Future<CancellationEligibility> eligibility(String classId) =>
      _server.run(() => _eligibility(_server.db, _server.requireMember().id, classId));

  @override
  Future<Refund> requestCancellation(String classId, {String? note}) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final e = _eligibility(db, member.id, classId);
    if (!e.allowed) throw AppFailure.business(e.blockReason!, code: 'CANCELLATION_NOT_ALLOWED');
    final payment = db.coursePayment(member.id, classId)!;
    final cls = db.classRow(classId);
    final row = RefundRow(
      id: db.nextId('rf'),
      paymentId: payment.id,
      memberProfileId: member.id,
      classId: classId,
      reason: RefundReason.memberCancelCourse,
      amount: e.estimatedRefund,
      coachDebitAmount: (e.estimatedRefund * MockDatabase.coachShare).round(),
      walletId: db.walletOf(cls.coachProfileId).id,
      createdAt: db.now(),
      note: note?.trim().isEmpty ?? true ? null : note!.trim(),
    );
    db.refunds.add(row);
    final memberName = db.userOfMember(member.id).fullName;
    db.notify(
      db.userOfCoach(cls.coachProfileId).id,
      NotificationType.paymentRefunded,
      'Yêu cầu hoàn tiền mới',
      '$memberName yêu cầu hủy khóa "${cls.name}". Tiền đang được tạm giữ.',
      metadata: {'classId': classId},
    );
    db.notifyManagers(
      'Yêu cầu hoàn tiền mới',
      '$memberName yêu cầu hủy khóa "${cls.name}".',
      metadata: {'refundId': row.id},
    );
    return _toRefund(db, row);
  });

  @override
  Future<List<Refund>> myRefunds() => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    return db.refunds.where((r) => r.memberProfileId == member.id).map((r) => _toRefund(db, r)).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  @override
  Future<Refund> refund(String id) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final r = db.refunds.where((x) => x.id == id).firstOrNull;
    if (r == null) throw const AppFailure.notFound('Không tìm thấy yêu cầu hoàn tiền.');
    if (u.role != UserRole.manager && db.memberOfUser(u.id)?.id != r.memberProfileId) {
      throw const AppFailure.forbidden();
    }
    return _toRefund(db, r);
  });

  @override
  Future<List<Refund>> all({RefundStatus? status}) => _server.run(() {
    final db = _server.db;
    _server.requireRole(UserRole.manager);
    return db.refunds.where((r) => status == null || r.status == status).map((r) => _toRefund(db, r)).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  RefundRow _pending(String id) {
    _server.requireRole(UserRole.manager);
    final r = _server.db.refunds.where((x) => x.id == id).firstOrNull;
    if (r == null) throw const AppFailure.notFound('Không tìm thấy yêu cầu hoàn tiền.');
    if (r.status != RefundStatus.pending) throw const AppFailure.business('Yêu cầu đã được xử lý.');
    return r;
  }

  @override
  Future<void> approve(String id, {String? note}) => _server.run(() {
    final db = _server.db;
    final r = _pending(id);
    final now = db.now();
    r
      ..status = RefundStatus.completed
      ..processedAt = now
      ..processedNote = note?.trim().isEmpty ?? true ? null : note!.trim();
    // Trừ ví HLV đúng tỷ lệ đã nhận.
    final wallet = db.wallets.firstWhere((w) => w.id == r.walletId);
    wallet.balance -= r.coachDebitAmount;
    db.walletTxs.add(
      WalletTxRow(
        id: db.nextId('wtx'),
        walletId: wallet.id,
        amount: r.coachDebitAmount,
        type: WalletTxType.refundDebit,
        status: WalletTxStatus.completed,
        createdAt: now,
        classId: r.classId,
        paymentId: r.paymentId,
        note: 'Hoàn tiền — ${db.userOfMember(r.memberProfileId).fullName}',
      ),
    );
    final cls = db.classRow(r.classId);
    if (r.reason == RefundReason.memberCancelCourse) {
      // Hủy khóa: giao dịch REFUNDED, hóa đơn hủy, giải phóng chỗ.
      db.payments.firstWhere((p) => p.id == r.paymentId).status = PaymentStatus.refunded;
      for (final i in db.invoices.where((i) => i.paymentId == r.paymentId)) {
        i.status = InvoiceStatus.cancelled;
      }
      for (final e in db.enrollments.where(
        (e) =>
            e.memberProfileId == r.memberProfileId &&
            e.status == EnrollmentStatus.booked &&
            db.session(e.sessionId).classId == r.classId,
      )) {
        e
          ..status = EnrollmentStatus.cancelled
          ..cancelledAt = now;
      }
    }
    db.notify(
      db.userOfMember(r.memberProfileId).id,
      NotificationType.paymentRefunded,
      'Đã hoàn tiền',
      'Yêu cầu hoàn tiền khóa "${cls.name}" đã được duyệt: ${Money.format(r.amount)}.',
      metadata: {'refundId': r.id},
    );
    db.notify(
      db.userOfCoach(cls.coachProfileId).id,
      NotificationType.paymentRefunded,
      'Ví bị trừ do hoàn tiền',
      'Ví của bạn bị trừ ${Money.format(r.coachDebitAmount)} cho yêu cầu hoàn tiền khóa "${cls.name}".',
      metadata: {'classId': cls.id},
    );
  });

  @override
  Future<void> reject(String id, String reason) => _server.run(() {
    final db = _server.db;
    final r = _pending(id);
    if (reason.trim().length < 3) {
      throw const AppFailure.validation(
        'Lý do từ chối tối thiểu 3 ký tự.',
        fieldErrors: {'reason': 'Tối thiểu 3 ký tự'},
      );
    }
    r
      ..status = RefundStatus.rejected
      ..processedAt = db.now()
      ..rejectReason = reason.trim();
    db.notify(
      db.userOfMember(r.memberProfileId).id,
      NotificationType.paymentRefunded,
      'Yêu cầu hoàn tiền bị từ chối',
      'Yêu cầu hoàn tiền khóa "${db.classRow(r.classId).name}" bị từ chối.',
      metadata: {'refundId': r.id},
      reason: reason.trim(),
    );
  });
}
