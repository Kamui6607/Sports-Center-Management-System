import '../../../api/class_json.dart';
import '../../../api/student_json.dart';
import '../../../api/training_json.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/utils/money.dart';
import '../../../core/utils/vn_time.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/coach_dashboard.dart';
import '../domain/entities/wallet.dart';
import '../domain/repositories/coach_repository.dart';

/// [CoachRepository] gọi BE thật — ví & rút tiền (`coaches/me/wallet`), hồ sơ học viên
/// (`coaches/me/students/:id`), tổng quan từ `classes`, `class-schedules?mine=true`, `feedbacks`.
class CoachApiRepository implements CoachRepository {
  CoachApiRepository(this._api, {DateTime Function()? clock}) : _now = clock ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;

  static WalletTransaction _tx(Json t) {
    final bank = t.objOrNull('bankInfo');
    final status = t.enumOr('status', WalletTxStatus.values, WalletTxStatus.pending);
    final note = t.strOrNull('note');
    return WalletTransaction(
      id: t.str('id'),
      amount: t.money('amount').abs(),
      type: t.enumOr('type', WalletTxType.values, WalletTxType.deposit),
      status: status,
      createdAt: t.date('createdAt'),
      className: t.objOrNull('class')?.strOrNull('name'),
      note: note,
      bankInfo: bank == null
          ? null
          : BankInfo(
              bankName: bank.str('bankName'),
              accountNumber: bank.str('accountNumber'),
              accountName: bank.str('accountName'),
            ),
      rejectReason:
          t.strOrNull('rejectReason') ??
          (status == WalletTxStatus.rejected ? note?.replaceFirst(RegExp(r'^Bị từ chối:?\s*'), '') : null),
      coachName: t.objOrNull('coach')?.strOrNull('fullName'),
    );
  }

  /// BE-5 / L4: số dư, tiền tạm giữ, khả dụng và điều kiện rút theo TỪNG KHÓA do BE tính.
  static CoachWallet _wallet(Json w, WalletTransaction? pending) {
    final eligibility = w.obj('withdrawEligibility');
    final balance = w.obj('wallet').money('balance');
    final hold = w.money('pendingRefundDebit');
    final blockers = eligibility.objList('blockers');
    final classes = eligibility.objList('classes');
    final finished = classes.where((c) => c.boolean('withdrawable')).toList();
    final locked = classes.where((c) => !c.boolean('withdrawable')).toList();
    final available = w.money('available');
    Json? blocker(String code) => blockers.where((b) => b.str('code') == code).firstOrNull;
    return CoachWallet(
      balance: balance,
      pendingRefundHold: hold,
      // Khả dụng do BE tính (đã trừ tạm giữ + lệnh rút đang chờ, chỉ tính khóa đã kết thúc).
      availableOverride: available,
      pendingWithdrawal: pending,
      checks: [
        WithdrawCheck(
          code: 'CLASS_NOT_COMPLETED',
          label: 'Có khóa học đã kết thúc để rút tiền',
          passed: finished.isNotEmpty,
          detail: locked.isEmpty ? null : locked.map((c) => '${c.str('className')}: ${c.str('reason')}').join('\n'),
        ),
        WithdrawCheck(
          code: 'WITHDRAWAL_PENDING',
          label: 'Không có lệnh rút đang chờ duyệt',
          passed: blocker('WITHDRAWAL_PENDING') == null,
          detail: blocker('WITHDRAWAL_PENDING')?.strOrNull('message'),
        ),
        WithdrawCheck(
          code: 'BALANCE_HELD_FOR_REFUND',
          label: 'Có số dư khả dụng để rút',
          passed: available > 0,
          detail:
              (blocker('BALANCE_HELD_FOR_REFUND') ?? blocker('NO_AVAILABLE_BALANCE'))?.strOrNull('message') ??
              (hold > 0 ? 'Đang tạm giữ ${Money.format(hold)} cho yêu cầu hoàn tiền chờ duyệt.' : null),
        ),
      ],
    );
  }

  Future<CoachWallet> _loadWallet() async {
    final results = await Future.wait([
      _api.get('/coaches/me/wallet'),
      _api.get('/coaches/me/wallet/transactions', query: {'type': 'WITHDRAWAL', 'status': 'PENDING', 'limit': 1}),
    ]);
    return _wallet(results[0].json, results[1].list.map(_tx).firstOrNull);
  }

  @override
  Future<CoachDashboard> dashboard() async {
    final now = _now();
    final weekStart = VnTime.startOfWeek(now);
    final weekEnd = weekStart.add(const Duration(days: 7));
    final from = weekStart.isBefore(now) ? weekStart.subtract(const Duration(days: 30)) : weekStart;
    final results = await Future.wait([
      _api.getAll('/classes', query: {'createdByMe': 'true'}),
      // BE-15: buổi các khóa của tôi (30 ngày trước tuần này → hết 60 ngày tới).
      _api.getAll(
        '/class-schedules',
        query: {
          'mine': 'true',
          'from': from.toUtc().toIso8601String(),
          'to': now.add(const Duration(days: 60)).toUtc().toIso8601String(),
        },
      ),
      _loadWallet(),
      _api.get('/auth/me'),
    ]);
    final classes = results[0] as List<Json>;
    final byId = {for (final c in classes) c.str('id'): c};
    final teaching = {
      for (final c in classes)
        if (const {'APPROVED', 'COMPLETED'}.contains(c.str('status'))) c.str('id'),
    };
    final sessions = ClassJson.sessions(
      (results[1] as List<Json>).where((s) => teaching.contains(s.str('classId'))).toList(),
      classes: byId,
    )..sort((a, b) => a.startTime.compareTo(b.startTime));
    final wallet = results[2] as CoachWallet;
    final coachProfileId = (results[3] as ApiResponse).json.obj('coachProfile').str('id');
    final rating = (await _api.get('/feedbacks', query: {'coachId': coachProfileId, 'limit': 1})).json.obj('summary');
    final week = sessions.where(
      (s) => !s.startTime.isBefore(weekStart) && s.startTime.isBefore(weekEnd) && s.status != ScheduleStatus.cancelled,
    );
    final todos = <CoachTodo>[
      for (final s in sessions.where((s) => s.status == ScheduleStatus.scheduled && s.hasEnded(now)))
        CoachTodo(
          kind: CoachTodoKind.completeSession,
          title: 'Hoàn tất buổi "${s.className}"',
          subtitle: 'Buổi ${VnTime.sessionLabel(s.startTime, s.endTime)} đã kết thúc nhưng chưa hoàn tất.',
          targetId: s.id,
        ),
      for (final c in classes.where((c) => c.str('status') == 'REJECTED'))
        CoachTodo(
          kind: CoachTodoKind.classRejected,
          title: 'Khóa "${c.str('name')}" bị từ chối',
          subtitle: c.strOrNull('rejectReason') == null
              ? 'Xem lý do, sửa và gửi lại.'
              : 'Lý do: ${c.str('rejectReason')}',
          targetId: c.str('id'),
        ),
      for (final c in classes.where((c) => c.str('status') == 'PENDING'))
        CoachTodo(
          kind: CoachTodoKind.classPending,
          title: 'Khóa "${c.str('name')}" đang chờ duyệt',
          subtitle: 'Quản lý sẽ xét duyệt sớm.',
          targetId: c.str('id'),
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
      todaySessions: sessions.where((s) => VnTime.sameDay(s.startTime, now)).toList(),
      nextSession: sessions.where((s) => s.status == ScheduleStatus.scheduled && s.endTime.isAfter(now)).firstOrNull,
      weekSessionCount: week.length,
      weekCompletedCount: week.where((s) => s.status == ScheduleStatus.completed).length,
      // BE-12: số học viên thật của từng khóa đang dạy.
      studentCount: teaching.fold<int>(0, (sum, id) => sum + byId[id]!.obj('summary').integer('studentCount')),
      availableBalance: wallet.available,
      ratingAverage: rating.dbl('averageRating'),
      ratingCount: rating.integer('totalFeedbacks'),
      todos: todos,
    );
  }

  @override
  Future<CoachWallet> wallet() => _loadWallet();

  @override
  Future<List<WalletTransaction>> transactions() async =>
      (await _api.getAll('/coaches/me/wallet/transactions')).map(_tx).toList();

  @override
  Future<WalletTransaction> withdraw({required int amount, required BankInfo bank, String? note}) async {
    final trimmed = note?.trim();
    final res = await _api.post(
      '/coaches/me/wallet/withdraw',
      body: {
        'amount': amount,
        'bankInfo': {
          'bankName': bank.bankName.trim(),
          'accountNumber': bank.accountNumber.trim(),
          'accountName': bank.accountName.trim(),
        },
        if (trimmed != null && trimmed.isNotEmpty) 'note': trimmed,
      },
    );
    return _tx(res.json);
  }

  @override
  Future<StudentProfile> student(String memberProfileId) async {
    // BE-19: hồ sơ + chuyên cần theo khóa + lộ trình — một request.
    final j = (await _api.get('/coaches/me/students/$memberProfileId')).json;
    final member = j.obj('member');
    return StudentProfile(
      student: StudentJson.student(
        member,
        attendedCount: j.integer('attendedCount'),
        pastSessionCount: j.integer('pastSessionCount'),
      ),
      classes: [
        for (final c in j.objList('classes'))
          StudentClassStat(
            classId: c.str('classId'),
            className: c.str('className'),
            attended: c.integer('attended'),
            pastSessions: c.integer('pastSessions'),
          ),
      ],
      plans: [
        for (final p in j.objList('plans')) TrainingJson.plan(p, memberName: member.obj('user').strOrNull('fullName')),
      ],
    );
  }
}
