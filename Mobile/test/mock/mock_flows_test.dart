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
import 'package:sports_center_mobile/features/refunds/data/refund_mock_repository.dart';
import 'package:sports_center_mobile/features/refunds/domain/entities/refund.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_mock_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/features/shop/data/shop_mock_repository.dart';
import 'package:sports_center_mobile/features/shop/domain/entities/shop.dart';
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

  group('Cửa hàng (Doc/SHOP_FLOW_DESIGN.md)', () {
    const pickupReq = CheckoutRequest(mode: CheckoutMode.cart, fulfillmentType: FulfillmentType.pickup);

    /// Đẩy hạn thanh toán về quá khứ ⇒ job cửa hàng (chạy đầu mỗi request mock) chuyển EXPIRED + nhả hàng.
    void expire(String orderId) {
      server.db.shopOrders.firstWhere((o) => o.id == orderId).paymentExpiresAt = server.db.now().subtract(
        const Duration(seconds: 1),
      );
      server.db.runShopJobs();
    }

    test('giỏ → checkout giữ hàng → thanh toán (SALE) → sẵn sàng → mã nhận hàng → hoàn tất → đánh giá', () async {
      await login('member@demo.vn');
      final shop = ShopMockRepository(server);
      await shop.clearCart();
      await shop.addToCart('p-mat', 2);
      final mat = server.db.products.firstWhere((p) => p.id == 'p-mat');
      final stock = mat.stockQuantity;
      final preview = await shop.preview(pickupReq);
      expect(preview.total, 840000);
      expect(preview.canCheckout, isTrue);
      final placed = await shop.placeOrder(pickupReq, expectedTotal: preview.total, idempotencyKey: 'k-1');
      expect(mat.reservedStock, 2, reason: 'giữ hàng khi tạo đơn');
      expect((await shop.cart()).isEmpty, isTrue, reason: 'đặt từ giỏ ⇒ xóa dòng đã đặt');
      final replay = await shop.placeOrder(pickupReq, expectedTotal: preview.total, idempotencyKey: 'k-1');
      expect(replay.orderId, placed.orderId, reason: 'cùng Idempotency-Key ⇒ cùng đơn');

      await PaymentMockRepository(server).simulatePaid(placed.paymentId);
      expect((await shop.myOrder(placed.orderId)).status, ShopOrderStatus.paid);
      expect(mat.stockQuantity, stock - 2);
      expect(mat.reservedStock, 0);

      await login('manager@demo.vn');
      await expectLater(
        shop.transition(placed.orderId, ShopOrderStatus.shipping, trackingCode: 'X1'),
        throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'ORDER_INVALID_TRANSITION')),
      );
      await shop.transition(placed.orderId, ShopOrderStatus.readyForPickup);
      await login('member@demo.vn');
      final mine = await shop.myOrder(placed.orderId);
      final code = mine.pickup!.code!;
      expect(mine.pickup!.qrPayload, 'SCMS-PICKUP:${mine.code}:$code');

      await login('manager@demo.vn');
      final found = await shop.verifyPickup(mine.pickup!.qrPayload!);
      expect(found.order.pickup?.code, isNull, reason: 'Manager không thấy mã');
      await expectLater(
        shop.confirmPickup(placed.orderId, code, '0000'),
        throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'PHONE_MISMATCH')),
      );
      final done = await shop.confirmPickup(placed.orderId, code, '4567');
      expect(done.status, ShopOrderStatus.completed);
      await expectLater(
        shop.confirmPickup(placed.orderId, code, '4567'),
        throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'PICKUP_CODE_USED')),
      );

      await login('member@demo.vn');
      final line = (await shop.myOrder(placed.orderId)).lines.single;
      expect(line.canReview, isTrue);
      await shop.reviewItem(line.id, 5, 'Tốt');
      await expectLater(shop.reviewItem(line.id, 4, null), throwsA(isA<AppFailure>()));
    });

    test('hết hạn ⇒ nhả hàng; 3 lần/24h ⇒ khóa đặt hàng', () async {
      await login('member@demo.vn');
      final shop = ShopMockRepository(server);
      const req = CheckoutRequest(
        mode: CheckoutMode.buyNow,
        fulfillmentType: FulfillmentType.pickup,
        items: {'p-water': 1},
      );
      final water = server.db.products.firstWhere((p) => p.id == 'p-water');
      // Seed có 1 đơn chờ (o-3) ⇒ hủy để không chạm giới hạn 2 đơn chờ.
      await shop.cancelOrder('o-3');
      for (var i = 0; i < 3; i++) {
        final p = await shop.preview(req);
        final placed = await shop.placeOrder(req, expectedTotal: p.total, idempotencyKey: 'exp-$i');
        expect(water.reservedStock, 1);
        expire(placed.orderId);
        expect(server.db.shopOrders.firstWhere((o) => o.id == placed.orderId).status, ShopOrderStatus.expired);
        expect(water.reservedStock, 0);
      }
      final preview = await shop.preview(req);
      expect(preview.canCheckout, isFalse);
      expect(preview.lockedUntil, isNotNull);
      await expectLater(
        shop.placeOrder(req, expectedTotal: preview.total, idempotencyKey: 'exp-x'),
        throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'CHECKOUT_LOCKED')),
      );
    });

    test('giới hạn mỗi đơn, đơn chờ thanh toán, giá đổi', () async {
      await login('member@demo.vn');
      final shop = ShopMockRepository(server);
      await expectLater(
        shop.addToCart('p-whey', 3),
        throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'MAX_PER_ORDER_EXCEEDED')),
      );
      const req = CheckoutRequest(
        mode: CheckoutMode.buyNow,
        fulfillmentType: FulfillmentType.pickup,
        items: {'p-cap': 1},
      );
      final p = await shop.preview(req);
      await expectLater(
        shop.placeOrder(req, expectedTotal: p.total - 1000, idempotencyKey: 'pc'),
        throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'PRICE_CHANGED')),
      );
      await shop.placeOrder(req, expectedTotal: p.total, idempotencyKey: 'p1'); // + o-3 seed = 2 đơn chờ
      final blocked = await shop.preview(req);
      expect(blocked.warnings.map((w) => w.code), contains('PENDING_ORDER_LIMIT'));
      final cart = await shop.cart();
      expect(cart.lines.firstWhere((l) => l.productId == 'p-bar').priceChange, isNotNull);
    });

    test('yêu cầu hoàn tiền đơn đã thanh toán ⇒ Manager duyệt ⇒ REFUNDED + trả kho', () async {
      await login('member@demo.vn');
      final shop = ShopMockRepository(server);
      final o8 = await shop.requestRefund('o-8', 'Đặt nhầm');
      expect(o8.status, ShopOrderStatus.refundRequested);
      final electro = server.db.products.firstWhere((p) => p.id == 'p-electro');
      final stock = electro.stockQuantity;
      await login('manager@demo.vn');
      final refund = server.db.refunds.firstWhere((r) => r.orderId == 'o-8');
      final view = await RefundMockRepository(server).refund(refund.id);
      expect(view.isOrder, isTrue);
      await RefundMockRepository(server).approve(refund.id);
      expect(server.db.shopOrders.firstWhere((o) => o.id == 'o-8').status, ShopOrderStatus.refunded);
      expect(electro.stockQuantity, stock + 3);
    });

    test('IDOR: không xem/hủy được đơn của người khác', () async {
      await login('coach@demo.vn');
      final shop = ShopMockRepository(server);
      await expectLater(shop.myOrder('o-1'), throwsA(isA<AppFailure>()));
      await expectLater(shop.cancelOrder('o-3'), throwsA(isA<AppFailure>()));
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
