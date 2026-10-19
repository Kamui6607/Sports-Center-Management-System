import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/refund.dart';
import '../domain/repositories/refund_repository.dart';

/// [RefundRepository] gọi BE thật — module `refunds`.
class RefundApiRepository implements RefundRepository {
  RefundApiRepository(this._api);

  final ApiClient _api;

  static Refund _refund(Json r) {
    final status = r.enumOr('status', RefundStatus.values, RefundStatus.pending);
    // L8: ghi chú tách riêng; bản ghi cũ (trước migration) chỉ có `note`.
    final legacy = r.strOrNull('note');
    // Hoàn tiền đơn hàng: không có lớp/HLV; người nhận là người mua đơn (HLV mua hàng không có `member`).
    final order = r.objOrNull('order');
    final bi = r.objOrNull('bankInfo');
    return Refund(
      id: r.str('id'),
      classId: r.str('classId', r.obj('class').str('id')),
      className: order != null ? 'Đơn hàng ${order.str('code')}' : r.obj('class').str('name'),
      orderId: r.strOrNull('orderId') ?? order?.strOrNull('id'),
      orderCode: order?.strOrNull('code'),
      reason: r.enumOr('reason', RefundReason.values, RefundReason.memberCancelCourse),
      amount: r.money('amount'),
      coachDebitAmount: r.money('coachDebitAmount'),
      status: status,
      createdAt: r.date('createdAt'),
      memberName: r.obj('member').obj('user').strOrNull('fullName') ?? order?.obj('user').str('fullName') ?? '',
      // BE-17: kèm HLV của khóa.
      coachName: r.obj('class').obj('coach').obj('user').str('fullName'),
      sessionStart: r.objOrNull('schedule')?.dateOrNull('startTime'),
      note: r.strOrNull('memberNote') ?? (status == RefundStatus.completed ? null : legacy),
      processedAt: r.dateOrNull('processedAt'),
      processedNote: r.strOrNull('managerNote') ?? (status == RefundStatus.completed ? legacy : null),
      rejectReason: r.strOrNull('rejectReason'),
      paidAmount: r.objOrNull('payment')?.money('amount'),
      bankInfo: bi == null || bi.str('bankName').isEmpty || bi.str('bankAccountNumber').isEmpty
          ? null
          : RefundBankInfo(
              bankName: bi.str('bankName'),
              accountNumber: bi.str('bankAccountNumber'),
              accountName: bi.str('bankAccountName'),
              vietQrUrl: bi.strOrNull('vietQrUrl'),
            ),
      grossAmount: r['grossAmount'] == null ? null : r.money('grossAmount'),
      feePercent: r.intOrNull('feePercent'),
    );
  }

  @override
  Future<CancellationEligibility> eligibility(String classId) async {
    // BE-16: điều kiện hủy khóa do BE tính (hạn khai giảng − 24h, tiền còn hoàn, đã gửi chưa).
    final p = (await _api.get('/refunds/course-cancellation/preview', query: {'classId': classId})).json;
    final late = p.objOrNull('lateRefund');
    return CancellationEligibility(
      allowed: p.boolean('allowed'),
      paidAmount: p.money('paidAmount'),
      estimatedRefund: p.money('estimatedRefundAmount'),
      fullRefund: p.integer('refundPercent') == 100,
      deadline: p.dateOrNull('fullRefundDeadline') ?? p.dateOrNull('deadline'),
      blockReason: p.strOrNull('blockMessage'),
      lateRefund: late == null
          ? null
          : LateRefundOption(
              available: late.boolean('available'),
              grossAmount: late.money('grossAmount'),
              feePercent: late.integer('feePercent'),
              estimatedAmount: late.money('estimatedAmount'),
              futureSessions: late.integer('futureMainSessions'),
              totalSessions: late.integer('totalMainSessions'),
            ),
    );
  }

  @override
  Future<CancellationResult> requestCancellation(
    String classId, {
    String? note,
    String? bankName,
    String? bankAccountNumber,
    String? bankAccountName,
    bool lateRefund = false,
  }) async {
    final res = await _api.post(
      '/refunds/course-cancellation',
      body: {
        'classId': classId,
        if (note?.trim().isNotEmpty ?? false) 'note': note!.trim(),
        if (bankName?.trim().isNotEmpty ?? false) 'bankName': bankName!.trim(),
        if (bankAccountNumber?.trim().isNotEmpty ?? false) 'bankAccountNumber': bankAccountNumber!.trim(),
        if (bankAccountName?.trim().isNotEmpty ?? false) 'bankAccountName': bankAccountName!.trim(),
        if (lateRefund) 'lateRefund': true,
      },
    );
    final d = res.json;
    final refund = d.objOrNull('refund');
    return CancellationResult(
      mode: switch (d.strOrNull('mode')) {
        'REFUND_REQUESTED' => CancellationMode.refundRequested,
        'LATE_REFUND_REQUESTED' => CancellationMode.lateRefundRequested,
        _ => CancellationMode.cancelledNoRefund,
      },
      refund: refund == null ? null : _refund(refund),
      cancelledSessions: d.integer('cancelledEnrollments'),
    );
  }

  @override
  Future<List<Refund>> myRefunds() async => (await _api.getAll('/refunds/my')).map(_refund).toList();

  @override
  Future<Refund> refund(String id) async => _refund((await _api.get('/refunds/$id')).json);

  @override
  Future<void> cancelRequest(String refundId) => _api.patch('/refunds/$refundId/cancel');

  @override
  Future<List<Refund>> all({RefundStatus? status}) async =>
      (await _api.getAll('/refunds', query: {'status': status})).map(_refund).toList();

  @override
  Future<void> approve(String id, {String? transactionRef}) {
    final trimmed = transactionRef?.trim();
    return _api.patch(
      '/refunds/$id/approve',
      body: {if (trimmed != null && trimmed.isNotEmpty) 'transactionRef': trimmed},
    );
  }

  @override
  Future<void> reject(String id, String reason) => _api.patch('/refunds/$id/reject', body: {'reason': reason.trim()});
}
