import 'dart:typed_data';

import '../../../api/payment_json.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/payment.dart';
import '../domain/repositories/payment_repository.dart';

/// [PaymentRepository] gọi BE thật — module `payments` (SePay / VietQR, lịch sử thanh toán).
class PaymentApiRepository implements PaymentRepository {
  PaymentApiRepository(this._api);

  final ApiClient _api;

  @override
  Future<Checkout> checkoutCourse(String classId) async {
    try {
      final res = await _api.post('/payments/sepay/checkout', body: {'classId': classId});
      return PaymentJson.checkout(res.json);
    } on AppFailure catch (f) {
      // Còn giao dịch chờ chưa hết hạn ⇒ BE trả lại QR cũ: tiếp tục thanh toán giao dịch đó.
      final pending = PaymentJson.pendingCheckout(f);
      if (pending != null) return pending;
      rethrow;
    }
  }

  @override
  Future<Checkout> checkout(String paymentId) async {
    // BE-21: giao dịch đơn hàng kèm `order.items` (tên, số lượng) ⇒ không phải tra thêm.
    final j = (await _api.get('/payments/sepay/$paymentId')).json;
    int? enrolled;
    if (j.str('status') == 'SUCCESS' && j.strOrNull('classId') != null) {
      // Số buổi đã được tự ghi danh sau khi thanh toán.
      try {
        final plan = (await _api.get('/classes/${j.str('classId')}/course-plan')).json;
        enrolled = plan.objOrNull('registration')?.intOrNull('registeredSessions');
      } on AppFailure {
        enrolled = null;
      }
    }
    return PaymentJson.checkout(j, enrolledSessionCount: enrolled);
  }

  @override
  Future<Checkout> simulatePaid(String paymentId) async {
    // Chỉ chạy khi BE bật SEPAY_MOCK_MODE (dev); production BE trả 403 SEPAY_MOCK_DISABLED.
    await _api.post('/payments/sepay/mock-confirm', body: {'paymentId': paymentId});
    return checkout(paymentId);
  }

  @override
  Future<Uint8List> qrImage(Checkout checkout) => _api.getBytes(checkout.qrUrl);

  /// BE-6: giao dịch đã hoàn tất (thành công / đã hoàn tiền) của tôi.
  Future<List<Invoice>> _payments() async {
    final rows = await _api.getAll('/payments/my');
    return rows.where((p) => const {'SUCCESS', 'REFUNDED'}.contains(p.str('status'))).map(PaymentJson.invoice).toList();
  }

  @override
  Future<List<Invoice>> myInvoices() => _payments();

  @override
  Future<Invoice> invoice(String invoiceId) async {
    final found = (await _payments()).where((i) => i.id == invoiceId).firstOrNull;
    if (found == null) throw const AppFailure.notFound('Không tìm thấy giao dịch.');
    return found;
  }
}
