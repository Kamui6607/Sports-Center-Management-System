import 'dart:typed_data';

import '../../../core/error/app_failure.dart';
import '../../../core/utils/qr_image.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../../classes/domain/entities/course.dart';
import '../../schedule/domain/entities/session.dart';
import '../domain/entities/payment.dart';
import '../domain/repositories/payment_repository.dart';

/// Mock theo `BE/src/modules/payments` (SePay) + `invoices`.
class PaymentMockRepository implements PaymentRepository {
  PaymentMockRepository(this._server);

  final MockServer _server;

  /// Thời gian (giây) mock tự xác nhận thanh toán khi bật `autoConfirmPayments`.
  static const autoConfirmAfter = Duration(seconds: 20);

  @override
  Future<Checkout> checkoutCourse(String classId) => _server.run(() {
    final db = _server.db;
    final member = _server.requireMember();
    final c = db.classes.where((x) => x.id == classId).firstOrNull;
    if (c == null || c.status != ClassStatus.approved) {
      throw const AppFailure.business('Khóa học hiện không mở bán.', code: 'CLASS_NOT_AVAILABLE');
    }
    if (db.coursePayment(member.id, classId) != null) {
      throw const AppFailure.conflict('Bạn đã mua khóa học này.', code: 'ALREADY_PURCHASED');
    }
    final pending = db.pendingCoursePayment(member.id, classId);
    if (pending != null) return toCheckout(db, pending);
    final now = db.now();
    final upcoming = db
        .sessionsOf(classId)
        .where((s) => s.status == ScheduleStatus.scheduled && s.start.isAfter(now))
        .toList();
    if (upcoming.isEmpty) {
      throw const AppFailure.business('Khóa học không còn buổi sắp diễn ra.', code: 'NO_UPCOMING_SESSIONS');
    }
    if (upcoming.any((s) => db.bookedCount(s.id) >= c.capacity)) {
      throw const AppFailure.conflict('Khóa học đã kín chỗ.', code: 'CLASS_FULL');
    }
    final penalised = db.penalties.any(
      (p) =>
          p.memberProfileId == member.id &&
          p.classId == classId &&
          p.status == PenaltyStatus.applied &&
          (p.blockedUntil?.isAfter(now) ?? false),
    );
    if (penalised) {
      throw const AppFailure.business('Bạn đang bị phạt chuyên cần ở khóa này.', code: 'ATTENDANCE_PENALTY_ACTIVE');
    }
    final p = db.createPendingPayment(
      userId: member.userId,
      memberProfileId: member.id,
      amount: c.price,
      classId: classId,
    );
    return toCheckout(db, p);
  });

  @override
  Future<Checkout> checkout(String paymentId) => _server.run(() {
    final db = _server.db;
    final p = _owned(paymentId);
    if (_server.settings.autoConfirmPayments &&
        p.status == PaymentStatus.pending &&
        db.now().difference(p.createdAt) >= autoConfirmAfter &&
        db.now().isBefore(p.expiresAt)) {
      db.settlePayment(p.id);
    }
    return toCheckout(db, p);
  });

  @override
  Future<Checkout> simulatePaid(String paymentId) => _server.run(() {
    final p = _owned(paymentId);
    if (p.status != PaymentStatus.pending) throw const AppFailure.business('Giao dịch không còn chờ thanh toán.');
    _server.db.settlePayment(p.id);
    return toCheckout(_server.db, p);
  });

  @override
  Future<Uint8List> qrImage(Checkout checkout) =>
      // Mock: tự vẽ QR từ nội dung CK. API: tải ảnh `checkout.qrUrl` do BE sinh.
      QrImageRenderer.render(
        'VIETQR|${checkout.bank.bankId}|${checkout.bank.accountNumber}|${checkout.amount}|${checkout.transferContent}',
      );

  @override
  Future<List<Invoice>> myInvoices() => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    return db.invoices.where((i) => i.userId == u.id).map((i) => _toInvoice(db, i)).toList()
      ..sort((a, b) => b.issuedAt.compareTo(a.issuedAt));
  });

  @override
  Future<Invoice> invoice(String invoiceId) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final i = db.invoices.where((x) => x.id == invoiceId).firstOrNull;
    if (i == null || i.userId != u.id) throw const AppFailure.notFound('Không tìm thấy hóa đơn.');
    return _toInvoice(db, i);
  });

  PaymentRow _owned(String paymentId) {
    final u = _server.requireUser();
    final p = _server.db.payments.where((x) => x.id == paymentId).firstOrNull;
    if (p == null) throw const AppFailure.notFound('Không tìm thấy giao dịch.');
    if (p.userId != u.id) throw const AppFailure.forbidden();
    return p;
  }

  static Invoice _toInvoice(MockDatabase db, InvoiceRow i) {
    final p = db.payments.firstWhere((x) => x.id == i.paymentId);
    return Invoice(
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      status: i.status,
      issuedAt: i.issuedAt,
      purpose: i.purpose,
      itemName: i.itemName,
      subtotal: i.total,
      discount: 0,
      total: i.total,
      paymentMethod: p.method,
      memberName: i.memberName,
      quantity: i.quantity,
      transactionCode: p.orderCode,
      paidAt: p.paidAt,
    );
  }

  /// Ánh xạ giao dịch ⇒ màn VietQR (dùng chung với đơn sản phẩm).
  static Checkout toCheckout(MockDatabase db, PaymentRow p) {
    final classId = p.classId;
    final orderId = p.productOrderId;
    final order = orderId == null ? null : db.shopOrders.firstWhere((o) => o.id == orderId);
    final title = classId != null ? db.classRow(classId).name : order!.lines.map((l) => l.productName).join(', ');
    final enrolled = classId == null || p.status != PaymentStatus.success
        ? null
        : db.enrollments
              .where(
                (e) =>
                    e.memberProfileId == p.memberProfileId &&
                    e.status == EnrollmentStatus.booked &&
                    db.session(e.sessionId).classId == classId,
              )
              .length;
    const bank = MockDatabase.bank;
    return Checkout(
      paymentId: p.id,
      orderCode: p.orderCode,
      amount: p.amount,
      status: p.status,
      purpose: classId != null ? CheckoutPurpose.course : CheckoutPurpose.product,
      expiresAt: p.expiresAt,
      transferContent: p.orderCode,
      qrUrl:
          'https://img.vietqr.io/image/${bank.bankId}-${bank.accountNumber}-compact2.png?amount=${p.amount}&addInfo=${p.orderCode}',
      bank: bank,
      title: title,
      classId: classId,
      productOrderId: orderId,
      quantity: order?.itemCount,
      paidAt: p.paidAt,
      enrolledSessionCount: enrolled,
      invoiceId: db.invoices.where((i) => i.paymentId == p.id).firstOrNull?.id,
    );
  }
}
