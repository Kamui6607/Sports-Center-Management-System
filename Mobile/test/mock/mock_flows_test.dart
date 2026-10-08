import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/attendance/data/attendance_mock_repository.dart';
import 'package:sports_center_mobile/features/auth/data/auth_mock_repository.dart';
import 'package:sports_center_mobile/features/classes/data/course_mock_repository.dart';
import 'package:sports_center_mobile/features/classes/domain/entities/course.dart';
import 'package:sports_center_mobile/features/coach/data/coach_mock_repository.dart';
import 'package:sports_center_mobile/features/coach/domain/entities/wallet.dart';
import 'package:sports_center_mobile/features/manager/data/manager_mock_repository.dart';
import 'package:sports_center_mobile/features/payments/data/payment_mock_repository.dart';
import 'package:sports_center_mobile/features/payments/domain/entities/payment.dart';
import 'package:sports_center_mobile/features/products/data/product_mock_repository.dart';
import 'package:sports_center_mobile/features/products/domain/entities/product.dart';
import 'package:sports_center_mobile/features/refunds/data/refund_mock_repository.dart';
import 'package:sports_center_mobile/features/refunds/domain/entities/refund.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

/// Kiểm tra mock mô phỏng đúng luật nghiệp vụ của BE (mục 8 kế hoạch).
void main() {
  late MockServer server;
  late AuthMockRepository auth;

  setUp(() {
    server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    server.settings.autoConfirmPayments = false;
    auth = AuthMockRepository(server);
  });

  Future<void> login(String email) => auth.login(email, kDemoPassword);

  group('Đăng nhập', () {
    test('sai mật khẩu bị từ chối', () async {
      expect(() => auth.login('member@demo.vn', 'sai'), throwsA(isA<AppFailure>()));
    });

    test('Coach chưa duyệt có phiên giới hạn + trạng thái CV', () async {
      final s = await auth.login('coach.pending@demo.vn', kDemoPassword);
      expect(s.isPendingCoach, isTrue);
      expect(s.certification?.hasFile, isTrue);
    });
  });

  group('Mua khóa học (L2)', () {
    test('thanh toán thành công ⇒ ghi danh mọi buổi tương lai + 85% vào ví HLV', () async {
      await login('member@demo.vn');
      final payments = PaymentMockRepository(server);
      final courses = CourseMockRepository(server);
      final walletBefore = server.db.walletOf('cp-1').balance;

      final checkout = await payments.checkoutCourse('c2');
      expect(checkout.status, PaymentStatus.pending);
      expect((await courses.detail('c2')).purchase.status, PurchaseStatus.pendingPayment);

      final paid = await payments.simulatePaid(checkout.paymentId);
      expect(paid.status, PaymentStatus.success);
      expect(paid.enrolledSessionCount, 8);
      expect(server.db.walletOf('cp-1').balance - walletBefore, (2400000 * 0.85).round());
      expect((await courses.detail('c2')).purchase.status, PurchaseStatus.purchased);
    });

    test('khóa kín chỗ không cho mua', () async {
      await login('member@demo.vn');
      expect(() => PaymentMockRepository(server).checkoutCourse('c9'), throwsA(isA<AppFailure>()));
    });

    test('trùng lịch được báo trong lý do không mua được', () async {
      await login('member@demo.vn');
      final detail = await CourseMockRepository(server).detail('c10');
      expect(detail.purchase.blockers.map((b) => b.code), contains('SCHEDULE_CONFLICT'));
    });
  });

  group('Hủy khóa & hoàn tiền (L7)', () {
    test('còn ≥ 24h ⇒ tạo yêu cầu PENDING, ví HLV bị tạm giữ', () async {
      await login('member2@demo.vn');
      final refunds = RefundMockRepository(server);
      final holdBefore = server.db.refundHold(server.db.walletOf('cp-1').id);
      final r = await refunds.requestCancellation('c2', note: 'Bận');
      expect(r.status, RefundStatus.pending);
      expect(r.amount, 2400000);
      expect(server.db.refundHold(server.db.walletOf('cp-1').id) - holdBefore, (2400000 * 0.85).round());
    });

    test('khóa đã khai giảng ⇒ không được hủy', () async {
      await login('member@demo.vn');
      final e = await RefundMockRepository(server).eligibility('c1');
      expect(e.allowed, isFalse);
    });

    test('Manager duyệt ⇒ giao dịch REFUNDED, trừ ví HLV', () async {
      await login('manager@demo.vn');
      final refunds = RefundMockRepository(server);
      final balanceBefore = server.db.walletOf('cp-1').balance;
      await refunds.approve('rf-c2-mp-8', note: 'FT123');
      final p = server.db.payments.firstWhere((p) => p.id == 'pay-c2-mp-8');
      expect(p.status, PaymentStatus.refunded);
      expect(balanceBefore - server.db.walletOf('cp-1').balance, (2400000 * 0.85).round());
    });
  });

  group('Hủy / đổi buổi (Q3)', () {
    test('buổi đã bắt đầu không được hủy (có lý do)', () async {
      await login('member@demo.vn');
      final schedule = ScheduleMockRepository(server);
      final ongoing = await schedule.mySession('c1-s2-bu');
      expect(ongoing.canCancel, isFalse);
      expect(ongoing.cancelBlockReason, isNotNull);
    });

    test('đổi sang buổi khác cùng khóa', () async {
      await login('member@demo.vn');
      final schedule = ScheduleMockRepository(server);
      final future = (await schedule.mySessions(
        DateTime.now(),
        DateTime.now().add(const Duration(days: 60)),
      )).firstWhere((s) => s.session.classId == 'c1' && s.canTransfer);
      final options = await schedule.transferOptions(future.enrollmentId);
      final target = options.firstWhere((o) => o.blockReason == null);
      await schedule.transferEnrollment(future.enrollmentId, target.session.id);
      final moved = server.db.enrollments.firstWhere((e) => e.id == future.enrollmentId);
      expect(moved.sessionId, target.session.id);
    });
  });

  group('Điểm danh (L4)', () {
    test('HLV mở QR ⇒ học viên nhập mã dự phòng thành công, không điểm danh 2 lần', () async {
      await login('coach@demo.vn');
      final attendance = AttendanceMockRepository(server);
      final ticket = await attendance.generateQr('c1-s2-bu');
      await login('member@demo.vn');
      final result = await attendance.submitCode(ticket.manualCode);
      expect(result.className, 'Yoga Flow buổi sáng');
      expect(() => attendance.submitCode(ticket.manualCode), throwsA(isA<AppFailure>()));
    });
  });

  group('Hủy buổi có học viên (L5)', () {
    test('bắt buộc chọn phương án; dạy bù chuyển học viên sang buổi mới', () async {
      await login('coach@demo.vn');
      final schedule = ScheduleMockRepository(server);
      final next = server.db
          .sessionsOf('c1')
          .firstWhere(
            (s) => s.status == ScheduleStatus.scheduled && s.start.isAfter(DateTime.now()) && s.makeupForId == null,
          );
      expect(() => schedule.cancelSession(next.id, const CancelSessionInput(reason: 'Ốm')), throwsA(isA<AppFailure>()));
      final start = next.start.add(const Duration(days: 1, hours: 4));
      final result = await schedule.cancelSession(
        next.id,
        CancelSessionInput(
          mode: CancelResolutionMode.makeup,
          makeupStart: start,
          makeupEnd: start.add(const Duration(hours: 1)),
        ),
      );
      expect(result.makeupSession, isNotNull);
      expect(server.db.bookedCount(result.makeupSession!.id), result.affectedMembers);
    });
  });

  group('Ví & rút tiền (Q10 — theo BE)', () {
    test('còn khóa chưa kết thúc ⇒ không đủ điều kiện, lý do lấy từ dữ liệu', () async {
      await login('coach@demo.vn');
      final w = await CoachMockRepository(server).wallet();
      expect(w.canWithdraw, isFalse);
      expect(w.checks.firstWhere((c) => c.code == 'CLASS_NOT_COMPLETED').passed, isFalse);
    });

    test('HLV đủ điều kiện rút ⇒ tạo lệnh PENDING; Manager duyệt ⇒ trừ ví', () async {
      await login('coach.done@demo.vn');
      final coach = CoachMockRepository(server);
      final w = await coach.wallet();
      expect(w.canWithdraw, isTrue);
      final tx = await coach.withdraw(
        amount: 1000000,
        bank: const BankInfo(bankName: 'Vietcombank', accountNumber: '0011223344', accountName: 'TRINH BAO NGOC'),
      );
      await login('manager@demo.vn');
      final before = server.db.walletOf('cp-4').balance;
      await ManagerMockRepository(server).reviewWithdrawal(tx.id, approve: true);
      expect(before - server.db.walletOf('cp-4').balance, 1000000);
    });
  });

  group('Cửa hàng (L8)', () {
    test('đặt đơn giữ hàng, hủy đơn hoàn kho', () async {
      await login('member@demo.vn');
      final products = ProductMockRepository(server);
      final before = (await products.product('p-mat')).stockQuantity;
      final checkout = await products.createOrder('p-mat', 2);
      expect((await products.product('p-mat')).stockQuantity, before - 2);
      await products.cancelOrder(checkout.productOrderId!);
      expect((await products.product('p-mat')).stockQuantity, before);
      final order = (await products.myOrders()).firstWhere((o) => o.id == checkout.productOrderId);
      expect(order.status, OrderStatus.cancelled);
    });

    test('chỉ người mua thành công mới được đánh giá, 1 lần', () async {
      await login('member@demo.vn');
      final products = ProductMockRepository(server);
      expect(await products.canReview('p-bottle'), isTrue);
      await products.addReview('p-bottle', 5, 'Tốt');
      expect(await products.canReview('p-bottle'), isFalse);
      expect(() => products.addReview('p-whey', 5, null), throwsA(isA<AppFailure>()));
    });
  });

  group('Duyệt (Manager — Q1)', () {
    test('duyệt CV ⇒ Coach được kích hoạt', () async {
      await login('manager@demo.vn');
      await ManagerMockRepository(server).reviewCv('cp-6', approve: true);
      final s = await auth.login('coach.pending@demo.vn', kDemoPassword);
      expect(s.isPendingCoach, isFalse);
    });

    test('từ chối khóa học lưu lý do; Coach sửa & gửi lại ⇒ PENDING', () async {
      await login('manager@demo.vn');
      await ManagerMockRepository(server).reviewClass('c4', approve: false, reason: 'Thiếu mô tả');
      await login('coach@demo.vn');
      final courses = CourseMockRepository(server);
      final rejected = (await courses.coachClasses()).firstWhere((c) => c.id == 'c4');
      expect(rejected.status, ClassStatus.rejected);
      expect(rejected.rejectReason, 'Thiếu mô tả');
      final draft = await courses.draftOf('c4');
      final again = await courses.resubmitClass('c4', draft);
      expect(again.status, ClassStatus.pending);
    });
  });
}
