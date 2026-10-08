import 'dart:typed_data';

import '../entities/payment.dart';

/// Thanh toán VietQR & hóa đơn — module `payments`, `invoices`.
abstract interface class PaymentRepository {
  /// `POST /payments/sepay/checkout { classId }` (Member).
  Future<Checkout> checkoutCourse(String classId);

  /// `GET /payments/sepay/:id` — App polling để biết kết quả.
  Future<Checkout> checkout(String paymentId);

  /// DEV: giả lập SePay đã thu tiền (`POST /payments/sepay/mock-confirm`).
  Future<Checkout> simulatePaid(String paymentId);

  /// Ảnh QR (PNG) để hiển thị / lưu / chia sẻ (API: tải ảnh từ `qrUrl`).
  Future<Uint8List> qrImage(Checkout checkout);

  /// `GET /invoices/member/:memberId`.
  Future<List<Invoice>> myInvoices();

  /// `GET /invoices/:id`.
  Future<Invoice> invoice(String invoiceId);
}
