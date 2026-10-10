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
    );
  }

  @override
  Future<CancellationEligibility> eligibility(String classId) async {
    // BE-16: điều kiện hủy khóa do BE tính (hạn khai giảng − 24h, tiền còn hoàn, đã gửi chưa).
    final p = (await _api.get('/refunds/course-cancellation/preview', query: {'classId': classId})).json;
    return CancellationEligibility(
      allowed: p.boolean('allowed'),
      paidAmount: p.money('paidAmount'),
      estimatedRefund: p.money('refundableAmount'),
      deadline: p.dateOrNull('deadline'),
      blockReason: p.strOrNull('blockMessage'),
    );
  }

  @override
  Future<Refund> requestCancellation(String classId, {String? note}) async {
    final trimmed = note?.trim();
    final res = await _api.post(
      '/refunds/course-cancellation',
      body: {'classId': classId, if (trimmed != null && trimmed.isNotEmpty) 'note': trimmed},
    );
    return _refund(res.json);
  }

  @override
  Future<List<Refund>> myRefunds() async => (await _api.getAll('/refunds/my')).map(_refund).toList();

  @override
  Future<Refund> refund(String id) async => _refund((await _api.get('/refunds/$id')).json);

  @override
  Future<List<Refund>> all({RefundStatus? status}) async =>
      (await _api.getAll('/refunds', query: {'status': status})).map(_refund).toList();

  @override
  Future<void> approve(String id, {String? note}) {
    final trimmed = note?.trim();
    return _api.patch('/refunds/$id/approve', body: {if (trimmed != null && trimmed.isNotEmpty) 'note': trimmed});
  }

  @override
  Future<void> reject(String id, String reason) => _api.patch('/refunds/$id/reject', body: {'reason': reason.trim()});
}
