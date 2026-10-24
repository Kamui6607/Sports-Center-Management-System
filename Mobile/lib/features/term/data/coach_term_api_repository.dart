import 'package:intl/intl.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/utils/vn_time.dart';
import '../domain/entities/coach_term.dart';
import '../domain/repositories/coach_term_repository.dart';

/// [CoachTermRepository] gọi BE thật — module `terms`.
class CoachTermApiRepository implements CoachTermRepository {
  CoachTermApiRepository(this._api);

  final ApiClient _api;

  static final _dayKey = DateFormat('yyyy-MM-dd');

  /// Ngày lịch (giờ VN) của [d] dạng `YYYY-MM-DD` — BE nhận ngày, không nhận giờ.
  static String dayKey(DateTime d) => _dayKey.format(VnTime.wall(d));

  static AcademicTerm term(Json t) => AcademicTerm(
    id: t.str('id'),
    name: t.str('name'),
    startDate: t.date('startDate'),
    endDate: t.date('endDate'),
    graceDays: t.integer('graceDays'),
    graceDeadline: t.date('graceDeadline'),
    phase: t.enumOr('phase', TermPhase.values, TermPhase.active),
  );

  static PassVerdict verdict(Json v) => PassVerdict(
    valid: v.boolean('valid'),
    level: v.enumOr('level', PassLevel.values, PassLevel.deny),
    reason: v.str('reason'),
  );

  static CoachTermEvaluation evaluation(Json e) {
    final reg = e.obj('registration');
    final del = e.obj('delivery');
    final leave = e.obj('leave');
    final required = reg.obj('required');
    return CoachTermEvaluation(
      state: e.enumOr('state', CoachTermState.values, CoachTermState.pending),
      isFinal: e.boolean('final'),
      reasons: e.strList('reasons'),
      warnings: e.strList('warnings'),
      atRisk: e.boolean('atRisk'),
      deadlineAt: e.date('deadlineAt'),
      daysToDeadline: e.intOrNull('daysToDeadline'),
      registration: TermRegistration(
        ok: reg.boolean('ok'),
        qualifyingClassName: reg.strOrNull('qualifyingClassName'),
        mainSessions: reg.integer('mainSessions'),
        spanDays: reg.integer('spanDays'),
        requiredSessions: required.integer('sessions', 8),
        requiredSpanDays: required.integer('spanDays', 28),
        pendingApproval: reg.boolean('pendingApproval'),
      ),
      delivery: TermDelivery(
        completed: del.integer('completed'),
        awaitingComplete: del.integer('awaitingComplete'),
        scheduledFuture: del.integer('scheduledFuture'),
        cancelled: del.integer('cancelled'),
        completionRate: del['completionRate'] == null ? null : del.dbl('completionRate'),
        cancelRate: del['cancelRate'] == null ? null : del.dbl('cancelRate'),
        evidenceRate: del['evidenceRate'] == null ? null : del.dbl('evidenceRate'),
      ),
      leaveApprovedDays: leave.integer('approvedDays'),
      graceExtensionDays: leave.integer('graceExtensionDays'),
    );
  }

  static CoachLeave leave(Json l) => CoachLeave(
    id: l.str('id'),
    startDate: l.date('startDate'),
    endDate: l.date('endDate'),
    kind: l.enumOr('kind', LeaveKind.values, LeaveKind.personal),
    reason: l.str('reason'),
    status: l.enumOr('status', LeaveStatus.values, LeaveStatus.pending),
    reviewNote: l.strOrNull('reviewNote'),
  );

  @override
  Future<CoachTermStatus> myStatus() async {
    final j = (await _api.get('/terms/me')).json;
    final ev = j.objOrNull('evaluation');
    final prev = j.objOrNull('previousTerm');
    return CoachTermStatus(
      eligible: j.boolean('eligible'),
      term: term(j.obj('term')),
      evaluation: ev == null ? null : evaluation(ev),
      previousTermName: prev?.strOrNull('name'),
      previousState: prev?.enumOrNull('state', CoachTermState.values),
      pass: verdict(j.obj('pass')),
    );
  }

  @override
  Future<CoachPass> pass() async {
    final j = (await _api.get('/terms/me/pass')).json;
    return CoachPass(
      token: j.str('token'),
      expiresIn: j.integer('expiresIn', 60),
      verdict: verdict(j.obj('verdict')),
      state: j.enumOrNull('state', CoachTermState.values),
    );
  }

  @override
  Future<List<CoachLeave>> myLeaves() async => (await _api.get('/terms/me/leaves')).list.map(leave).toList();

  @override
  Future<CoachLeave> createLeave({
    required DateTime startDate,
    required DateTime endDate,
    required LeaveKind kind,
    required String reason,
  }) async {
    final res = await _api.post(
      '/terms/me/leaves',
      body: {'startDate': dayKey(startDate), 'endDate': dayKey(endDate), 'kind': beName(kind), 'reason': reason.trim()},
    );
    return leave(res.json);
  }

  static CheckInUsage usage(Json u) => CheckInUsage(
    monthKey: u.str('monthKey'),
    daysUsed: u.integer('daysUsed'),
    freeDaysUsed: u.integer('freeDaysUsed'),
    freeDaysPerMonth: u.integer('freeDaysPerMonth'),
    freeDaysLeft: u.integer('freeDaysLeft'),
    feePerDay: u.integer('feePerDay'),
    entitled: u.boolean('entitled'),
    feeAssessedThisMonth: u.money('feeAssessedThisMonth'),
    feeChargedThisMonth: u.money('feeChargedThisMonth'),
    feeDebt: u.money('feeDebt'),
    checkedInToday: u.boolean('checkedInToday'),
  );

  static CoachCheckIn checkInRow(Json c) => CoachCheckIn(
    dayKey: c.str('dayKey'),
    checkedInAt: c.date('checkedInAt'),
    dayIndex: c.integer('dayIndex'),
    free: c.boolean('free'),
    feeAssessed: c.money('feeAssessed'),
    feeCharged: c.money('feeCharged'),
    feeDebt: c.money('feeDebt'),
  );

  @override
  Future<CheckInResult> checkIn(String token) async {
    final j = (await _api.post('/terms/check-in', body: {'token': token.trim()})).json;
    return CheckInResult(
      alreadyCheckedIn: j.boolean('alreadyCheckedIn'),
      checkIn: checkInRow(j.obj('checkIn')),
      usage: usage(j.obj('usage')),
      pass: verdict(j.obj('pass')),
    );
  }

  @override
  Future<MyCheckIns> myCheckIns() async {
    final j = (await _api.get('/terms/me/check-ins')).json;
    return MyCheckIns(
      eligible: j.boolean('eligible'),
      usage: usage(j.obj('usage')),
      items: j.objList('items').map(checkInRow).toList(),
    );
  }

  @override
  Future<CoachLeave> cancelLeave(String id) async =>
      leave((await _api.delete('/terms/me/leaves/${Uri.encodeComponent(id)}')).json);
}
