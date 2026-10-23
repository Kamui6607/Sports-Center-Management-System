import '../../../core/error/app_failure.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../classes/domain/entities/course.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/coach_term.dart';
import '../domain/repositories/coach_term_repository.dart';

/// Mock theo `BE/src/modules/terms` (bản rút gọn của bộ đánh giá: đăng ký kỳ, buổi đã dạy/hủy, nghỉ phép).
class CoachTermMockRepository implements CoachTermRepository {
  CoachTermMockRepository(this._server);

  final MockServer _server;

  // Ngưỡng — khớp `BE/src/config/coach-term.ts`.
  static const minSessions = 8;
  static const minSpanDays = 28;
  static const graceDays = 14;
  static const maxLeaveDays = 120;
  static const exemptLeaveShare = 0.5;
  static const _day = Duration(days: 1);

  /// Kỳ (3 kỳ × 4 tháng, theo năm dương lịch) chứa [now] theo giờ VN.
  static AcademicTerm termOf(DateTime now) {
    final wall = VnTime.wall(now);
    final seq = ((wall.month - 1) ~/ 4) + 1;
    final startMonth = (seq - 1) * 4 + 1;
    final start = VnTime.fromWall(wall.year, startMonth, 1);
    final end = VnTime.fromWall(wall.year, startMonth + 4, 1).subtract(const Duration(milliseconds: 1));
    final deadline = start.add(_day * graceDays);
    final phase = now.isBefore(start)
        ? TermPhase.upcoming
        : now.isAfter(end)
        ? TermPhase.ended
        : now.isBefore(deadline)
        ? TermPhase.grace
        : TermPhase.active;
    return AcademicTerm(
      id: 'term-${wall.year}-$seq',
      name: 'Kỳ $seq/${wall.year}',
      startDate: start,
      endDate: end,
      graceDays: graceDays,
      graceDeadline: deadline,
      phase: phase,
    );
  }

  static int _daysBetween(DateTime a, DateTime b) => b.difference(a).inDays;

  CoachTermEvaluation _evaluate(MockDatabase db, CoachProfileRow coach, AcademicTerm term, DateTime now) {
    final classes = db.classes.where(
      (c) =>
          c.coachProfileId == coach.id &&
          (c.status == ClassStatus.pending || c.status == ClassStatus.approved || c.status == ClassStatus.completed),
    );
    var completed = 0, awaiting = 0, future = 0, cancelled = 0;
    var bestCount = 0, bestSpan = 0;
    String? bestName;
    var bestPending = false;
    for (final cls in classes) {
      final rows = db.sessions.where(
        (s) => s.classId == cls.id && !s.start.isBefore(term.startDate) && !s.start.isAfter(term.endDate),
      );
      final live = rows.where((s) => s.status != ScheduleStatus.cancelled).toList()
        ..sort((a, b) => a.start.compareTo(b.start));
      for (final s in rows) {
        switch (s.status) {
          case ScheduleStatus.cancelled:
            cancelled++;
          case ScheduleStatus.completed:
            completed++;
          case ScheduleStatus.scheduled:
            s.end.isBefore(now) ? awaiting++ : future++;
        }
      }
      if (live.isNotEmpty) {
        final span = _daysBetween(live.first.start, live.last.start);
        if (live.length > bestCount) {
          bestCount = live.length;
          bestSpan = span;
          bestName = cls.name;
          bestPending = cls.status == ClassStatus.pending;
        }
      }
    }
    final registrationOk = bestCount >= minSessions && bestSpan >= minSpanDays;

    // Nghỉ phép được duyệt.
    final leaves = db.coachLeaves.where((l) => l.coachProfileId == coach.id && l.status == LeaveStatus.approved);
    final leaveDays = <int>{};
    for (final l in leaves) {
      for (var d = VnTime.startOfDay(l.startDate); !d.isAfter(l.endDate); d = d.add(_day)) {
        if (!d.isBefore(term.startDate) && !d.isAfter(term.endDate)) leaveDays.add(d.millisecondsSinceEpoch);
      }
    }
    final termDays = _daysBetween(term.startDate, term.endDate) + 1;
    final extension = leaveDays.where((ms) => ms < term.graceDeadline.millisecondsSinceEpoch).length;
    final deadline = term.graceDeadline.add(_day * extension);

    final due = completed + awaiting + cancelled;
    final planned = due + future;
    final completionRate = due == 0 ? null : completed / due;
    final cancelRate = planned == 0 ? null : cancelled / planned;
    final ended = term.phase == TermPhase.ended;

    final reasons = <String>[];
    final warnings = <String>[];
    CoachTermState state;
    var atRisk = false;
    if (leaveDays.length / termDays >= exemptLeaveShare) {
      state = CoachTermState.exempt;
      reasons.add('Nghỉ phép được duyệt ${leaveDays.length}/$termDays ngày của kỳ ⇒ miễn kỳ.');
    } else if (!registrationOk) {
      if (ended || !now.isBefore(deadline)) {
        state = CoachTermState.nonCompliant;
        reasons.add('Chưa có khóa học hợp lệ trong kỳ (cần ≥ $minSessions buổi, trải ≥ $minSpanDays ngày).');
      } else {
        state = CoachTermState.pending;
        reasons.add(
          'Cần tạo khóa học hợp lệ trước ${VnTime.date(deadline.subtract(const Duration(milliseconds: 1)))}.',
        );
      }
    } else {
      final failures = <String>[
        if (completionRate != null && completionRate < 0.9)
          'Tỷ lệ buổi đã dạy ${(completionRate * 100).round()}% (< 90%).',
        if (cancelRate != null && cancelRate > 0.2) 'Tỷ lệ buổi bị hủy ${(cancelRate * 100).round()}% (> 20%).',
      ];
      if (ended) {
        state = failures.isEmpty ? CoachTermState.compliant : CoachTermState.nonCompliant;
        reasons.addAll(failures.isEmpty ? ['Đạt kỳ: khóa "$bestName" hợp lệ, dạy đủ buổi.'] : failures);
      } else {
        state = CoachTermState.compliant;
        reasons.add('Đã đăng ký kỳ với khóa "$bestName"${bestPending ? ' (chờ Quản lý duyệt)' : ''}.');
        if (due >= 4 && failures.isNotEmpty) {
          atRisk = true;
          warnings.addAll(failures.map((f) => 'Có nguy cơ không đạt cuối kỳ: $f'));
        }
      }
      if (awaiting > 0) {
        warnings.add('Có $awaiting buổi đã qua nhưng chưa bấm "Hoàn tất" — buổi này không được tính là đã dạy.');
      }
    }

    return CoachTermEvaluation(
      state: state,
      isFinal: ended,
      reasons: reasons,
      warnings: warnings,
      atRisk: atRisk,
      deadlineAt: deadline,
      daysToDeadline: registrationOk ? null : deadline.difference(now).inDays + 1,
      registration: TermRegistration(
        ok: registrationOk,
        qualifyingClassName: bestName,
        mainSessions: bestCount,
        spanDays: bestSpan,
        requiredSessions: minSessions,
        requiredSpanDays: minSpanDays,
        pendingApproval: registrationOk && bestPending,
      ),
      delivery: TermDelivery(
        completed: completed,
        awaitingComplete: awaiting,
        scheduledFuture: future,
        cancelled: cancelled,
        completionRate: completionRate,
        cancelRate: cancelRate,
      ),
      leaveApprovedDays: leaveDays.length,
      graceExtensionDays: extension,
    );
  }

  static PassVerdict _verdict(CoachTermEvaluation? ev) {
    if (ev == null) {
      return const PassVerdict(
        valid: false,
        level: PassLevel.deny,
        reason: 'Hồ sơ Coach chưa được duyệt hoặc tài khoản đang bị khóa.',
      );
    }
    return switch (ev.state) {
      CoachTermState.compliant => const PassVerdict(
        valid: true,
        level: PassLevel.ok,
        reason: 'Đã đạt yêu cầu kỳ hiện tại.',
      ),
      CoachTermState.exempt => const PassVerdict(
        valid: true,
        level: PassLevel.ok,
        reason: 'Được miễn yêu cầu kỳ hiện tại.',
      ),
      CoachTermState.nonCompliant => PassVerdict(
        valid: false,
        level: PassLevel.deny,
        reason: ev.reasons.isEmpty ? 'Chưa đạt yêu cầu kỳ hiện tại.' : ev.reasons.first,
      ),
      CoachTermState.pending => PassVerdict(
        valid: true,
        level: PassLevel.warn,
        reason:
            'Đang trong thời gian ân hạn — còn ${(ev.daysToDeadline ?? 1) < 1 ? 1 : ev.daysToDeadline} ngày để tạo khóa học hợp lệ.',
      ),
    };
  }

  CoachLeave _leave(CoachLeaveRow l) => CoachLeave(
    id: l.id,
    startDate: l.startDate,
    endDate: l.endDate,
    kind: l.kind,
    reason: l.reason,
    status: l.status,
    reviewNote: l.reviewNote,
  );

  @override
  Future<CoachTermStatus> myStatus() => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final now = db.now();
    final term = termOf(now);
    final ev = _evaluate(db, coach, term, now);
    return CoachTermStatus(eligible: true, term: term, evaluation: ev, pass: _verdict(ev));
  });

  @override
  Future<CoachPass> pass() => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final now = db.now();
    final ev = _evaluate(db, coach, termOf(now), now);
    return CoachPass(
      token: 'mock-pass.${coach.id}.${now.millisecondsSinceEpoch}',
      expiresIn: 60,
      verdict: _verdict(ev),
      state: ev.state,
    );
  });

  @override
  Future<List<CoachLeave>> myLeaves() => _server.run(() {
    final coach = _server.requireCoach();
    final rows = _server.db.coachLeaves.where((l) => l.coachProfileId == coach.id).toList()
      ..sort((a, b) => b.startDate.compareTo(a.startDate));
    return rows.map(_leave).toList();
  });

  @override
  Future<CoachLeave> createLeave({
    required DateTime startDate,
    required DateTime endDate,
    required LeaveKind kind,
    required String reason,
  }) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final now = db.now();
    final start = VnTime.startOfDay(startDate);
    final end = VnTime.startOfDay(endDate).add(_day).subtract(const Duration(milliseconds: 1));
    if (end.isBefore(start)) {
      throw const AppFailure.validation('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
    }
    if (_daysBetween(start, end) + 1 > maxLeaveDays) {
      throw const AppFailure.business('Đơn nghỉ tối đa 120 ngày.', code: 'LEAVE_TOO_LONG');
    }
    if (start.isBefore(VnTime.startOfDay(now).subtract(_day * 14))) {
      throw const AppFailure.business('Chỉ được xin nghỉ bù trong 14 ngày gần nhất.', code: 'LEAVE_TOO_OLD');
    }
    final clash = db.coachLeaves.any(
      (l) =>
          l.coachProfileId == coach.id &&
          (l.status == LeaveStatus.pending || l.status == LeaveStatus.approved) &&
          !l.startDate.isAfter(end) &&
          !l.endDate.isBefore(start),
    );
    if (clash) {
      throw const AppFailure.conflict(
        'Đã có đơn nghỉ (chờ duyệt hoặc đã duyệt) trùng khoảng thời gian này.',
        code: 'LEAVE_OVERLAP',
      );
    }
    final row = CoachLeaveRow(
      id: db.nextId('leave'),
      coachProfileId: coach.id,
      startDate: start,
      endDate: end,
      kind: kind,
      reason: reason.trim(),
      createdAt: now,
    );
    db.coachLeaves.add(row);
    return _leave(row);
  });

  @override
  Future<CoachLeave> cancelLeave(String id) => _server.run(() {
    final db = _server.db;
    final coach = _server.requireCoach();
    final row = db.coachLeaves.where((l) => l.id == id && l.coachProfileId == coach.id).firstOrNull;
    if (row == null) throw const AppFailure.notFound('Không tìm thấy đơn nghỉ.');
    final leave = _leave(row);
    if (!leave.canCancel(db.now())) {
      throw const AppFailure.conflict(
        'Chỉ hủy được đơn đang chờ duyệt hoặc đơn đã duyệt nhưng chưa bắt đầu.',
        code: 'LEAVE_NOT_CANCELLABLE',
      );
    }
    row.status = LeaveStatus.cancelled;
    return _leave(row);
  });
}
