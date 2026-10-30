/// Kiểm chứng API repository của Mobile với BE THẬT đang chạy (PostgreSQL local + seed).
///
/// Bỏ qua mặc định. Chạy: BE `npm run dev:local`, rồi
/// `flutter test test/live --dart-define=LIVE_API_URL=http://localhost:8081`
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/network/api_client.dart';
import 'package:sports_center_mobile/core/network/realtime_client.dart';
import 'package:sports_center_mobile/core/network/token_storage.dart';
import 'package:sports_center_mobile/features/attendance/data/attendance_api_repository.dart';
import 'package:sports_center_mobile/features/auth/data/auth_api_repository.dart';
import 'package:sports_center_mobile/features/auth/domain/entities/app_user.dart';
import 'package:sports_center_mobile/features/catalog/data/catalog_api_repository.dart';
import 'package:sports_center_mobile/features/classes/data/course_api_repository.dart';
import 'package:sports_center_mobile/features/classes/domain/entities/course.dart';
import 'package:sports_center_mobile/features/coach/data/coach_api_repository.dart';
import 'package:sports_center_mobile/features/manager/data/manager_api_repository.dart';
import 'package:sports_center_mobile/features/notifications/data/notification_api_repository.dart';
import 'package:sports_center_mobile/features/payments/data/payment_api_repository.dart';
import 'package:sports_center_mobile/features/products/data/product_api_repository.dart';
import 'package:sports_center_mobile/features/refunds/data/refund_api_repository.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_api_repository.dart';
import 'package:sports_center_mobile/features/shop/data/shop_api_repository.dart';
import 'package:sports_center_mobile/features/shop/domain/entities/shop.dart';
import 'package:sports_center_mobile/features/training/data/training_api_repository.dart';

const _url = String.fromEnvironment('LIVE_API_URL');

(ApiClient, TokenStorage) _client() {
  FlutterSecureStorage.setMockInitialValues({});
  final tokens = TokenStorage();
  final dio = Dio(BaseOptions(baseUrl: '$_url/api/v1', contentType: Headers.jsonContentType));
  return (ApiClient(tokens: tokens, onSessionExpired: () {}, dio: dio), tokens);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // flutter_test chặn mọi HTTP thật (trả 400) ⇒ bỏ chặn cho bộ kiểm chứng với BE thật.
  HttpOverrides.global = null;
  final skip = _url.isEmpty ? 'Đặt --dart-define=LIVE_API_URL=... để chạy với BE thật' : null;

  test('Guest: khóa học, bộ môn, sản phẩm', () async {
    final (api, tokens) = _client();
    final page = await CourseApiRepository(api, tokens).browse(const ClassQuery());
    expect(page.items, isNotEmpty);
    expect(page.items.first.coach.fullName, isNotEmpty);
    expect(await CatalogApiRepository(api).sports(), isNotEmpty);
    expect((await ProductApiRepository(api, tokens).products()).items, isNotEmpty);
    final detail = await CourseApiRepository(api, tokens).detail(page.items.first.id);
    expect(detail.purchase.status, PurchaseStatus.none);
  }, skip: skip);

  test('Member: đăng nhập + các màn chính', () async {
    final (api, tokens) = _client();
    final session = await AuthApiRepository(api, tokens).login('member1@example.com', 'Member@123');
    expect(session.user.role, UserRole.member);
    final now = DateTime.now();
    await ScheduleApiRepository(api)
        .mySessions(now.subtract(const Duration(days: 7)), now.add(const Duration(days: 7)));
    await CourseApiRepository(api, tokens).myCourses();
    await AttendanceApiRepository(api).mySummary();
    await AttendanceApiRepository(api).myPenalties();
    await RefundApiRepository(api).myRefunds();
    await PaymentApiRepository(api).myInvoices();
    final shop = ShopApiRepository(api);
    await shop.cart();
    await shop.addresses();
    await shop.myOrders(OrderGroup.active);
    await TrainingApiRepository(api).myPlans();
    final notifications = NotificationApiRepository(api, RealtimeClient(tokens, api));
    await notifications.notifications();
    expect(await notifications.unreadCount(), greaterThanOrEqualTo(0));
  }, skip: skip);

  test('Member: giỏ → xem trước → đặt hàng (Idempotency-Key) → hủy (dọn dữ liệu)', () async {
    final (api, tokens) = _client();
    await AuthApiRepository(api, tokens).login('member2@example.com', 'Member@123');
    final shop = ShopApiRepository(api);
    final product = (await ProductApiRepository(api, tokens).products()).items.firstWhere((p) => p.inStock);
    final cart = await shop.addToCart(product.id, 1);
    expect(cart.lines.any((l) => l.productId == product.id), isTrue);
    final req = CheckoutRequest(
      mode: CheckoutMode.cart,
      fulfillmentType: FulfillmentType.pickup,
      productIds: [product.id],
      recipientPhone: '0901234567',
    );
    final preview = await shop.preview(req);
    expect(preview.total, product.price);
    final key = 'live-${DateTime.now().microsecondsSinceEpoch}';
    final placed = await shop.placeOrder(req, expectedTotal: preview.total, idempotencyKey: key);
    final replay = await shop.placeOrder(req, expectedTotal: preview.total, idempotencyKey: key);
    expect(replay.orderId, placed.orderId);
    expect(replay.replayed, isTrue);
    final order = await shop.myOrder(placed.orderId);
    expect(order.status, ShopOrderStatus.pendingPayment);
    expect((await shop.cancelOrder(placed.orderId)).status, ShopOrderStatus.cancelled);
  }, skip: skip);

  test('Coach: tổng quan, ví, khóa học', () async {
    final (api, tokens) = _client();
    await AuthApiRepository(api, tokens).login('coach1@sportscenter.com', 'Coach@123');
    final dashboard = await CoachApiRepository(api).dashboard();
    expect(dashboard.availableBalance, greaterThanOrEqualTo(0));
    final wallet = await CoachApiRepository(api).wallet();
    expect(wallet.checks, hasLength(3));
    final classes = await CourseApiRepository(api, tokens).coachClasses();
    expect(classes, isNotEmpty);
    await CourseApiRepository(api, tokens).coachClassDetail(classes.first.id);
  }, skip: skip);

  test('Manager: số việc chờ duyệt, lệnh rút, hoàn tiền', () async {
    final (api, tokens) = _client();
    await AuthApiRepository(api, tokens).login('manager@sportscenter.com', 'Manager@123');
    final counts = await ManagerApiRepository(api).counts();
    expect(counts.total, greaterThanOrEqualTo(0));
    await ManagerApiRepository(api).withdrawals();
    await RefundApiRepository(api).all();
    final shop = ShopApiRepository(api);
    expect((await shop.managerSummary()).needsAction, greaterThanOrEqualTo(0));
    expect(await shop.inventory(), isNotEmpty);
  }, skip: skip);
}
