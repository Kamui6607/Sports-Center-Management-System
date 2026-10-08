import '../../../core/error/app_failure.dart';
import '../../../core/utils/money.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../../classes/domain/entities/coach_class.dart';
import '../../classes/domain/entities/course.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/coach_dashboard.dart';
import '../domain/entities/wallet.dart';
import '../domain/repositories/coach_repository.dart';

/// Mock theo `BE/src/modules/coaches` (ví, rút tiền) + tổng hợp tổng quan.
class CoachMockRepository implements CoachRepository {
  CoachMockRepository(this._server);

  final MockServer _server;

  static WalletTransaction toTx(MockDatabase db, WalletTxRow t) {
    final wallet = db.wallets.firstWhere((w) => w.id == t.walletId);
    return WalletTransaction(
      id: t.id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      createdAt: t.createdAt,
      className: t.classId == null ? null : db.classRow(t.classId!).name,
      note: t.note,
      bankInfo: t.bankInfo,
      rejectReason: t.rejectReason,
      coachName: db.userOfCoach(wallet.coachProfileId).fullName,
    );
  }

  /// Điều kiện rút tiền theo `coach-wallet.service.ts` (Q10 — mock theo BE).
  static CoachWallet buildWallet(MockDatabase db, String coachProfileId) {
    final w = db.walletOf(coachProfileId);
    final hold = db.refundHold(w.id);
    final open = db.classes
        .where(
          (c) =>
              c.coachProfileId == coachProfileId &&
              (c.status == ClassStatus.pending || c.status == ClassStatus.approved),
        )
        .toList();
    final pendingTx = db.walletTxs
        .where((t) => t.walletId == w.id && t.type == WalletTxType.withdrawal && t.status == WalletTxStatus.pending)
        .firstOrNull;
    final available = w.balance - hold;
    return CoachWallet(
      balance: w.balance,
      pendingRefundHold: hold,
      pendingWithdrawal: pendingTx == null ? null : toTx(db, pendingTx),
      checks: [
        WithdrawCheck(
          code: 'CLASS_NOT_COMPLETED',
          label: 'Tất cả khóa học đã kết thúc',
          passed: open.isEmpty,
          detail: open.isEmpty ? null : 'Còn ${open.length} khóa chưa kết thúc: ${open.map((c) => c.name).join(', ')}.',
        ),
        WithdrawCheck(
          code: 'WITHDRAWAL_PENDING',
          label: 'Không có lệnh rút đang chờ duyệt',
          passed: pendingTx == null,
          detail: pendingTx == null ? null : 'Lệnh rút ${Money.format(pendingTx.amount)} đang chờ Quản lý duyệt.',
        ),
        WithdrawCheck(
          code: 'BALANCE_HELD_FOR_REFUND',
          label: 'Có số dư khả dụng để rút',
          passed: available > 0,
          detail: hold > 0 ? 'Đang tạm giữ ${Money.format(hold)} cho yêu cầu hoàn tiền chờ duyệt.' : null,
        ),
      ],
    );
  }

  @override
  Future<CoachWallet> wallet() => _server.run(() => buildWallet(_server.db, _server.requireCoach().id));

  @override
  Future<List<WalletTransaction>> transactions() => _server.run(() {
    final db = _server.db;
    final w = db.walletOf(_server.requireCoach().id);
    return db.walletTxs.where((t) => t.walletId == w.id).map((t) => toTx(db, t)).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });

  @override
  Future<WalletTransaction> withdraw({required int amount, required BankInfo bank, String? note}) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final wallet = buildWallet(db, coach.id);
    if (amount <= 0) {
      throw const AppFailure.validation('Số tiền phải lớn hơn 0.', fieldErrors: {'amount': 'Phải lớn hơn 0'});
    }
    if (amount > wallet.balance) {
      throw AppFailure.business(
        'Số dư không đủ. Ví hiện có ${Money.format(wallet.balance)}.',
        code: 'INSUFFICIENT_BALANCE',
      );
    }
    if (amount > wallet.available) {
      throw AppFailure.business(
        'Số dư khả dụng chỉ còn ${Money.format(wallet.available)}.',
        code: 'BALANCE_HELD_FOR_REFUND',
      );
    }
    final failed = wallet.checks.where((c) => !c.passed).firstOrNull;
    if (failed != null) throw AppFailure.business(failed.detail ?? failed.label, code: failed.code);
    final w = db.walletOf(coach.id);
    final tx = WalletTxRow(
      id: db.nextId('wtx'),
      walletId: w.id,
      amount: amount,
      type: WalletTxType.withdrawal,
      status: WalletTxStatus.pending,
      createdAt: db.now(),
      note: note?.trim().isEmpty ?? true ? 'Yêu cầu rút tiền' : note!.trim(),
      bankInfo: bank,
    );
    db.walletTxs.add(tx);
    db.notifyManagers(
      'Yêu cầu rút tiền mới',
      'Coach ${db.user(coach.userId).fullName} yêu cầu rút ${Money.format(amount)} từ ví.',
      metadata: {'transactionId': tx.id},
    );
    return toTx(db, tx);
  });

  @override
  Future<CoachDashboard> dashboard() => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final now = db.now();
    final classes = db.classes.where((c) => c.coachProfileId == coach.id).toList();
    final teaching = classes
        .where((c) => c.status == ClassStatus.approved || c.status == ClassStatus.completed)
        .map((c) => c.id)
        .toSet();
    final sessions = db.sessions.where((s) => teaching.contains(s.classId)).toList()
      ..sort((a, b) => a.start.compareTo(b.start));
    final weekStart = VnTime.startOfWeek(now);
    final weekEnd = weekStart.add(const Duration(days: 7));
    final week = sessions.where(
      (s) => !s.start.isBefore(weekStart) && s.start.isBefore(weekEnd) && s.status != ScheduleStatus.cancelled,
    );
    final next = sessions.where((s) => s.status == ScheduleStatus.scheduled && s.end.isAfter(now)).firstOrNull;
    final rating = db.coachRating(coach.id);
    final wallet = buildWallet(db, coach.id);
    final students = {for (final id in teaching) ...db.studentsOf(id)};
    final todos = <CoachTodo>[
      for (final s in sessions.where((s) => s.status == ScheduleStatus.scheduled && !s.end.isAfter(now)))
        CoachTodo(
          kind: CoachTodoKind.completeSession,
          title: 'Hoàn tất buổi "${db.classRow(s.classId).name}"',
          subtitle: 'Buổi ${VnTime.sessionLabel(s.start, s.end)} đã kết thúc nhưng chưa hoàn tất.',
          targetId: s.id,
        ),
      for (final c in classes.where((c) => c.status == ClassStatus.rejected))
        CoachTodo(
          kind: CoachTodoKind.classRejected,
          title: 'Khóa "${c.name}" bị từ chối',
          subtitle: 'Xem lý do, sửa và gửi lại.',
          targetId: c.id,
        ),
      for (final c in classes.where((c) => c.status == ClassStatus.pending))
        CoachTodo(
          kind: CoachTodoKind.classPending,
          title: 'Khóa "${c.name}" đang chờ duyệt',
          subtitle: 'Quản lý sẽ xét duyệt sớm.',
          targetId: c.id,
        ),
      if (wallet.pendingRefundHold > 0)
        CoachTodo(
          kind: CoachTodoKind.refundHold,
          title: 'Đang tạm giữ ${Money.format(wallet.pendingRefundHold)}',
          subtitle: 'Cho yêu cầu hoàn tiền chờ Quản lý duyệt.',
          targetId: '',
        ),
    ];
    return CoachDashboard(
      todaySessions: sessions.where((s) => VnTime.sameDay(s.start, now)).map(db.toSession).toList(),
      nextSession: next == null ? null : db.toSession(next),
      weekSessionCount: week.length,
      weekCompletedCount: week.where((s) => s.status == ScheduleStatus.completed).length,
      studentCount: students.length,
      availableBalance: wallet.available,
      ratingAverage: rating.average,
      ratingCount: rating.count,
      todos: todos,
    );
  });

  @override
  Future<StudentProfile> student(String memberProfileId) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final mp = db.memberProfiles.where((m) => m.id == memberProfileId).firstOrNull;
    if (mp == null) throw const AppFailure.notFound('Không tìm thấy học viên.');
    final now = db.now();
    final myClasses = db.classes
        .where((c) => c.coachProfileId == coach.id && db.studentsOf(c.id).contains(mp.id))
        .toList();
    if (myClasses.isEmpty) throw const AppFailure.forbidden('Học viên không thuộc khóa học của bạn.');
    final stats = <StudentClassStat>[];
    var attendedTotal = 0, pastTotal = 0;
    for (final c in myClasses) {
      final past = db
          .sessionsOf(c.id)
          .where(
            (s) =>
                s.status == ScheduleStatus.completed || (s.status == ScheduleStatus.scheduled && s.end.isBefore(now)),
          )
          .map((s) => s.id)
          .toSet();
      final enrolled = db.enrollments
          .where(
            (e) => e.memberProfileId == mp.id && past.contains(e.sessionId) && e.status != EnrollmentStatus.cancelled,
          )
          .length;
      final attended = db.attendance
          .where(
            (a) =>
                a.memberProfileId == mp.id &&
                past.contains(a.sessionId) &&
                (a.status == AttendanceStatus.present || a.status == AttendanceStatus.late),
          )
          .length;
      attendedTotal += attended;
      pastTotal += enrolled;
      stats.add(StudentClassStat(classId: c.id, className: c.name, attended: attended, pastSessions: enrolled));
    }
    final u = db.user(mp.userId);
    final plans = db.trainingPlans
        .where((p) => p.memberProfileId == mp.id && p.coachProfileId == coach.id)
        .map(db.toTrainingPlan)
        .toList();
    return StudentProfile(
      student: StudentSummary(
        memberProfileId: mp.id,
        userId: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        email: u.email,
        phone: u.phone,
        trainingLevel: mp.trainingLevel,
        fitnessGoal: mp.fitnessGoal,
        trainingPreference: mp.trainingPreference,
        attendedCount: attendedTotal,
        pastSessionCount: pastTotal,
      ),
      classes: stats,
      plans: plans,
    );
  });
}
