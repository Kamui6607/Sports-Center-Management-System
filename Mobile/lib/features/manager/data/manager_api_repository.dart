import 'dart:typed_data';

import '../../../api/auth_json.dart';
import '../../../api/class_json.dart';
import '../../../api/student_json.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../classes/domain/entities/coach_class.dart';
import '../../classes/domain/entities/course.dart';
import '../../coach/domain/entities/wallet.dart';
import '../domain/entities/approvals.dart';
import '../domain/repositories/manager_repository.dart';

/// [ManagerRepository] gọi BE thật — duyệt CV (`coaches`), khóa học (`classes`), rút tiền (`coach-wallet`).
class ManagerApiRepository implements ManagerRepository {
  ManagerApiRepository(this._api);

  final ApiClient _api;

  Future<int> _total(String path, Map<String, Object?> query) async {
    final res = await _api.get(path, query: {...query, 'page': 1, 'limit': 1});
    return res.pagination?.intOrNull('total') ?? res.list.length;
  }

  @override
  Future<ApprovalCounts> counts() async {
    final results = await Future.wait([
      _total('/coaches/cv/pending', {'status': 'PENDING'}),
      _total('/classes', {'status': 'PENDING'}),
      _total('/coaches/wallet/transactions', {'type': 'WITHDRAWAL', 'status': 'PENDING'}),
      _total('/refunds', {'status': 'PENDING'}),
    ]);
    return ApprovalCounts(cvs: results[0], classes: results[1], withdrawals: results[2], refunds: results[3]);
  }

  static CvApplication _cv(Json p) {
    final user = p.obj('user');
    return CvApplication(
      coachProfileId: p.str('id'),
      userId: user.str('id', p.str('userId')),
      fullName: user.str('fullName'),
      email: user.str('email'),
      phone: user.strOrNull('phone'),
      specialization: p.strOrNull('specialization'),
      experienceYears: p.intOrNull('experienceYears'),
      bio: p.strOrNull('bio'),
      certification: AuthJson.certificationOf(p.obj('certification')),
    );
  }

  @override
  Future<List<CvApplication>> pendingCvs() async =>
      (await _api.getAll('/coaches/cv/pending', query: {'status': 'PENDING'})).map(_cv).toList();

  @override
  Future<CvApplication> cv(String coachProfileId) async {
    // Hồ sơ nằm trong danh sách theo trạng thái (BE không có API xem 1 hồ sơ CV riêng).
    for (final status in const ['PENDING', 'REJECTED', 'APPROVED']) {
      final rows = await _api.getAll('/coaches/cv/pending', query: {'status': status});
      final found = rows.where((p) => p.str('id') == coachProfileId).firstOrNull;
      if (found != null) return _cv(found);
    }
    throw const AppFailure.notFound('Không tìm thấy hồ sơ HLV.');
  }

  @override
  Future<Uint8List> cvFile(String coachProfileId) => _api.getBytes('/coaches/$coachProfileId/cv/file', auth: true);

  @override
  Future<void> reviewCv(String coachProfileId, {required bool approve, String? reason}) => _api.patch(
    '/coaches/$coachProfileId/cv/review',
    body: {
      'action': approve ? 'APPROVE' : 'REJECT',
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    },
  );

  @override
  Future<List<CourseClass>> pendingClasses() async =>
      (await _api.getAll('/classes', query: {'status': 'PENDING'})).map((c) => ClassJson.course(c)).toList();

  @override
  Future<CoachClassDetail> classDetail(String classId) async {
    final results = await Future.wait([
      _api.get('/classes/$classId'),
      _api.getAll('/class-schedules', query: {'classId': classId}),
      _api.get('/classes/$classId/students'),
    ]);
    final cls = (results[0] as ApiResponse).json;
    final roster = (results[2] as ApiResponse).json;
    final sessions = ClassJson.sessions(results[1] as List<Json>, classes: {classId: cls})
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
    return CoachClassDetail(
      course: ClassJson.course(cls, coachRevenue: roster.money('coachRevenue')),
      sessions: sessions,
      students: [for (final s in roster.objList('students')) StudentJson.student(s)],
      grossRevenue: roster.money('grossRevenue'),
    );
  }

  @override
  Future<void> reviewClass(String classId, {required bool approve, String? reason}) => _api.patch(
    '/classes/$classId/review',
    // BE-2: lý do từ chối được lưu để HLV xem & sửa.
    body: {
      'action': approve ? 'APPROVE' : 'REJECT',
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    },
  );

  static WithdrawalRequest _withdrawal(Json t) {
    final bank = t.objOrNull('bankInfo');
    final status = t.enumOr('status', WalletTxStatus.values, WalletTxStatus.pending);
    return WithdrawalRequest(
      transaction: WalletTransaction(
        id: t.str('id'),
        amount: t.money('amount').abs(),
        type: WalletTxType.withdrawal,
        status: status,
        createdAt: t.date('createdAt'),
        className: t.objOrNull('class')?.strOrNull('name'),
        note: t.strOrNull('note'),
        bankInfo: bank == null
            ? null
            : BankInfo(
                bankName: bank.str('bankName'),
                accountNumber: bank.str('accountNumber'),
                accountName: bank.str('accountName'),
              ),
        rejectReason: t.strOrNull('rejectReason'),
        coachName: t.obj('coach').strOrNull('fullName'),
      ),
      coachProfileId: t.obj('coach').str('id'),
      coachName: t.obj('coach').str('fullName'),
      walletBalance: t.obj('wallet').money('balance'),
      pendingRefundHold: t.obj('wallet').money('pendingRefundDebit'),
    );
  }

  @override
  Future<List<WithdrawalRequest>> withdrawals({WalletTxStatus? status}) async =>
      // BE-7: lệnh rút kèm HLV, số dư & tiền tạm giữ của ví.
      (await _api.getAll(
        '/coaches/wallet/transactions',
        query: {'type': 'WITHDRAWAL', 'status': status},
      )).map(_withdrawal).toList();

  @override
  Future<WithdrawalRequest> withdrawal(String transactionId) async =>
      _withdrawal((await _api.get('/coaches/wallet/transactions/$transactionId')).json);

  @override
  Future<void> reviewWithdrawal(String transactionId, {required bool approve, String? reason}) => _api.patch(
    '/coaches/wallet/transactions/$transactionId/review',
    body: {
      'action': approve ? 'APPROVE' : 'REJECT',
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    },
  );
}
