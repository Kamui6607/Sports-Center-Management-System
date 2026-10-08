import '../../features/coach/domain/entities/wallet.dart';
import '../../features/payments/domain/entities/payment.dart';
import '../../features/refunds/domain/entities/refund.dart';
import '../../features/schedule/domain/entities/session.dart';
import '../mock_database.dart';
import '../mock_tables.dart';
import 'seed_classes.dart';
import 'seed_helpers.dart';

/// Mua khóa, điểm danh, phạt chuyên cần, hoàn tiền, ví & rút tiền của các khóa
/// do [seedClasses] tạo.
void seedClassActivity(Seeder s, SeededSessions sessions) {
  final db = s.db;
  final (:c1, :c6, :c8) = sessions;

  // ── Mua khóa ─────────────────────────────────────────────────────────
  for (final m in ['mp-1', 'mp-3', 'mp-4', 'mp-5', 'mp-6', 'mp-7']) {
    s.purchase(m, 'c1', -18);
  }
  s.purchase('mp-2', 'c2', -3);
  s.purchase('mp-8', 'c2', -2);
  for (final m in ['mp-3', 'mp-4', 'mp-5', 'mp-9']) {
    s.purchase(m, 'c3', -62);
  }
  for (final m in ['mp-1', 'mp-6', 'mp-10']) {
    s.purchase(m, 'c6', -17);
  }
  for (final m in ['mp-2', 'mp-3', 'mp-4', 'mp-5', 'mp-6', 'mp-7', 'mp-8', 'mp-9', 'mp-10']) {
    s.purchase(m, 'c7', -6);
  }
  s.purchase('mp-1', 'c8', -22);
  s.purchase('mp-4', 'c8', -21);
  for (final m in ['mp-2', 'mp-3', 'mp-4', 'mp-5', 'mp-6', 'mp-7', 'mp-8', 'mp-9']) {
    s.purchase(m, 'c9', -5);
  }
  s.purchase('mp-9', 'c10', -2);
  s.purchase('mp-10', 'c10', -1);
  final c12Payment = s.purchase('mp-1', 'c12', -12);
  s.purchase('mp-2', 'c12', -5);
  for (final m in ['mp-2', 'mp-4', 'mp-6', 'mp-8']) {
    s.purchase(m, 'c13', -52);
  }
  for (final m in ['mp-3', 'mp-5', 'mp-7', 'mp-9', 'mp-10']) {
    s.purchase(m, 'c14', -47);
  }

  // Member 1 đã tự hủy buổi cuối của c1 ⇒ có buổi trống để thử "Đổi buổi" (Q3).
  final lastC1 = db.sessionsOf('c1').where((x) => x.makeupForId == null).last;
  db.enrollments.firstWhere((e) => e.sessionId == lastC1.id && e.memberProfileId == 'mp-1')
    ..status = EnrollmentStatus.cancelled
    ..cancelledAt = s.at(-2, 21);

  // ── Điểm danh ────────────────────────────────────────────────────────
  s.attendance('c1', 'mp-1', 'PPLPP');
  s.attendance('c1', 'mp-3', 'P');
  s.attendance('c1', 'mp-4', 'PAP');
  s.attendance('c1', 'mp-5', 'PPE');
  s.attendance('c1', 'mp-6', 'PL');
  s.attendance('c1', 'mp-7', 'P');
  s.attendance('c6', 'mp-1', 'PAA');
  s.attendance('c6', 'mp-6', 'P');
  s.attendance('c6', 'mp-10', 'PL');
  s.attendance('c8', 'mp-1', 'PAAPAAAP');
  s.attendance('c8', 'mp-4', 'P');
  for (final m in ['mp-3', 'mp-4', 'mp-5', 'mp-9']) {
    s.attendance('c3', m, m == 'mp-9' ? 'PAP' : 'P');
  }
  for (final m in ['mp-2', 'mp-4', 'mp-6', 'mp-8']) {
    s.attendance('c13', m, 'PPL');
  }
  for (final m in ['mp-3', 'mp-5', 'mp-7', 'mp-9', 'mp-10']) {
    s.attendance('c14', m, 'PPA');
  }

  // ── Phạt chuyên cần Member 1 ở c8: thu hồi chỗ tương lai ─────────────
  final future = db.enrollments.where(
    (e) =>
        e.memberProfileId == 'mp-1' &&
        e.status == EnrollmentStatus.booked &&
        db.session(e.sessionId).classId == 'c8' &&
        db.session(e.sessionId).start.isAfter(s.now),
  );
  var released = 0;
  for (final e in future) {
    e
      ..status = EnrollmentStatus.cancelled
      ..cancelledAt = s.at(-1, 8);
    released++;
  }
  db.penalties.add(
    PenaltyRow(
      id: 'pen-1',
      memberProfileId: 'mp-1',
      classId: 'c8',
      reason: 'Tỷ lệ chuyên cần dưới 80% sau 7 buổi đã học',
      attendanceRate: 0.43,
      releasedCount: released,
      createdAt: s.at(-1, 8),
      blockedUntil: s.at(10, 23, 59),
    ),
  );

  // ── Hoàn tiền ────────────────────────────────────────────────────────
  RefundRow refund(
    String id,
    String member,
    String classId,
    RefundReason reason,
    int amount, {
    String? scheduleId,
    RefundStatus status = RefundStatus.pending,
    int day = -1,
    String? note,
    String? processedNote,
    String? rejectReason,
    int? processedDay,
  }) {
    final payment =
        db.coursePayment(member, classId) ??
        db.payments.firstWhere((p) => p.memberProfileId == member && p.classId == classId);
    final wallet = db.walletOf(db.classRow(classId).coachProfileId);
    final r =
        RefundRow(
            id: id,
            paymentId: payment.id,
            memberProfileId: member,
            classId: classId,
            scheduleId: scheduleId,
            reason: reason,
            amount: amount,
            coachDebitAmount: (amount * MockDatabase.coachShare).round(),
            walletId: wallet.id,
            createdAt: s.at(day, 11),
            note: note,
            status: status,
          )
          ..processedAt = processedDay == null ? null : s.at(processedDay, 15)
          ..processedNote = processedNote
          ..rejectReason = rejectReason;
    db.refunds.add(r);
    return r;
  }

  for (final m in ['mp-1', 'mp-6', 'mp-10']) {
    refund('rf-c6-$m', m, 'c6', RefundReason.sessionCancelled, 1800000 ~/ 8, scheduleId: c6[1].id, day: -8);
  }
  refund(
    'rf-c8-mp-1',
    'mp-1',
    'c8',
    RefundReason.sessionCancelled,
    900000 ~/ 12,
    scheduleId: c8[2].id,
    day: -14,
    status: RefundStatus.rejected,
    processedDay: -12,
    rejectReason: 'Học viên đã tham gia buổi tập bù ngoài giờ theo thỏa thuận với HLV.',
  );
  refund(
    'rf-c8-mp-4',
    'mp-4',
    'c8',
    RefundReason.sessionCancelled,
    900000 ~/ 12,
    scheduleId: c8[2].id,
    day: -14,
    status: RefundStatus.completed,
    processedDay: -12,
    processedNote: 'Đã chuyển khoản, mã GD FT26101234567',
  );
  refund(
    'rf-c2-mp-8',
    'mp-8',
    'c2',
    RefundReason.memberCancelCourse,
    2400000,
    day: -1,
    note: 'Chuyển công tác nên không theo được lịch tối.',
  );

  // Member 1 đã hủy c12 và được hoàn tiền: giao dịch REFUNDED, hóa đơn hủy,
  // chỗ được giải phóng, ví HLV bị trừ.
  final c12Refund = refund(
    'rf-c12-mp-1',
    'mp-1',
    'c12',
    RefundReason.memberCancelCourse,
    1000000,
    day: -10,
    status: RefundStatus.completed,
    processedDay: -9,
    note: 'Trùng lịch công tác',
    processedNote: 'Đã chuyển khoản, mã GD FT26100987654',
  );
  c12Payment.status = PaymentStatus.refunded;
  db.invoices.firstWhere((i) => i.paymentId == c12Payment.id).status = InvoiceStatus.cancelled;
  for (final e in db.enrollments.where(
    (e) => e.memberProfileId == 'mp-1' && db.session(e.sessionId).classId == 'c12',
  )) {
    e.status = EnrollmentStatus.cancelled;
  }
  final w2 = db.walletOf('cp-2');
  w2.balance -= c12Refund.coachDebitAmount;
  db.walletTxs.add(
    WalletTxRow(
      id: 'wtx-rf-c12',
      walletId: w2.id,
      amount: c12Refund.coachDebitAmount,
      type: WalletTxType.refundDebit,
      status: WalletTxStatus.completed,
      createdAt: s.at(-9, 15),
      classId: 'c12',
      paymentId: c12Payment.id,
      note: 'Hoàn tiền hủy khóa — Nguyễn Minh Anh',
    ),
  );
  final w3 = db.walletOf('cp-3');
  w3.balance -= (75000 * MockDatabase.coachShare).round();
  db.walletTxs.add(
    WalletTxRow(
      id: 'wtx-rf-c8',
      walletId: w3.id,
      amount: (75000 * MockDatabase.coachShare).round(),
      type: WalletTxType.refundDebit,
      status: WalletTxStatus.completed,
      createdAt: s.at(-12, 15),
      classId: 'c8',
      note: 'Hoàn tiền buổi bị hủy — Phạm Đức Long',
    ),
  );

  // ── Rút tiền ─────────────────────────────────────────────────────────
  void withdrawal(String coach, int amount, WalletTxStatus status, int day, {String? reject}) {
    final w = db.walletOf(coach);
    if (status == WalletTxStatus.completed) w.balance -= amount;
    final u = db.userOfCoach(coach);
    db.walletTxs.add(
      WalletTxRow(
        id: 'wtx-wd-$coach-$day',
        walletId: w.id,
        amount: amount,
        type: WalletTxType.withdrawal,
        status: status,
        createdAt: s.at(day, 16),
        note: 'Yêu cầu rút tiền',
        bankInfo: BankInfo(
          bankName: 'Vietcombank',
          accountNumber: '10${coach.hashCode.abs() % 100000000}',
          accountName: u.fullName.toUpperCase(),
        ),
      )..rejectReason = reject,
    );
  }

  withdrawal('cp-1', 2500000, WalletTxStatus.completed, -25);
  withdrawal('cp-4', 3000000, WalletTxStatus.completed, -20);
  withdrawal('cp-5', 2000000, WalletTxStatus.pending, -1);
  withdrawal('cp-3', 1500000, WalletTxStatus.rejected, -9, reject: 'Thông tin tài khoản nhận không khớp tên HLV.');
}
