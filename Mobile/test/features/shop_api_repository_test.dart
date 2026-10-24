import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/auth/presentation/providers/session_provider.dart';
import 'package:sports_center_mobile/features/shop/data/shop_api_repository.dart';
import 'package:sports_center_mobile/features/shop/data/shop_repository_provider.dart';
import 'package:sports_center_mobile/features/shop/domain/entities/shop.dart';
import 'package:sports_center_mobile/features/shop/presentation/providers/shop_providers.dart';
import 'package:sports_center_mobile/features/shop/presentation/shop_labels.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

import '../helpers/fake_backend.dart';

final _now = DateTime.utc(2026, 10, 11, 3);

String _iso(Duration d) => _now.add(d).toIso8601String();

/// `Order` chi tiết đúng shape BE (`orderOwnerView`).
Map<String, Object?> _order({String status = 'READY_FOR_PICKUP'}) => {
  'id': 'o1',
  'code': 'DH261011-7KQ3XM',
  'status': status,
  'fulfillmentType': 'PICKUP',
  'subtotal': 300000,
  'shippingFee': 0,
  'total': 300000,
  'createdAt': _iso(const Duration(hours: -5)),
  'paymentExpiresAt': _iso(const Duration(hours: -4)),
  'recipientName': 'An',
  'recipientPhone': '0901234567',
  'items': [
    {
      'id': 'oi1',
      'productId': 'p1',
      'productName': 'Găng',
      'quantity': 2,
      'unitPrice': 150000,
      'totalAmount': 300000,
      'canReview': false,
      'review': null,
    },
  ],
  'history': [
    {
      'toStatus': 'PENDING_PAYMENT',
      'fromStatus': null,
      'createdAt': _iso(const Duration(hours: -5)),
      'byCustomer': true,
    },
    {
      'toStatus': 'PAID',
      'fromStatus': 'PENDING_PAYMENT',
      'createdAt': _iso(const Duration(hours: -4)),
      'bySystem': true,
    },
    {'toStatus': status, 'fromStatus': 'PAID', 'createdAt': _iso(const Duration(hours: -1))},
  ],
  'refunds': <Object>[],
  'payment': {'id': 'pay1', 'status': 'SUCCESS', 'requiresReview': false},
  'pickup': {
    'code': 'K7M2Q9XA',
    'qrPayload': 'SCMS-PICKUP:DH261011-7KQ3XM:K7M2Q9XA',
    'deadline': _iso(const Duration(days: 3)),
  },
  'actions': {'canPay': false, 'canCancel': false, 'canRequestRefund': false, 'canConfirmReceived': false},
};

void main() {
  final authed = {'auth.accessToken': 'h.eyJpZCI6InUxIn0.s', 'auth.refreshToken': 'R'};

  group('ShopApiRepository', () {
    test('giỏ hàng: dòng + cảnh báo theo mã (giá đổi không chặn, hết hàng chặn)', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'GET /shop/cart',
        (_) async => FakeReply.ok({
          'count': 2,
          'items': [
            {
              'productId': 'p1',
              'productName': 'Nước',
              'unitPrice': 12000,
              'quantity': 3,
              'availableStock': 50,
              'maxPerOrder': 10,
              'purchasable': true,
              'warnings': [
                {'code': 'PRICE_CHANGED', 'message': 'Giá đã đổi', 'oldPrice': 10000, 'newPrice': 12000},
              ],
            },
            {
              'productId': 'p2',
              'productName': 'Găng',
              'unitPrice': 550000,
              'quantity': 1,
              'availableStock': 0,
              'maxPerOrder': 10,
              'purchasable': false,
              'warnings': [
                {'code': 'OUT_OF_STOCK', 'message': 'Sản phẩm đã hết hàng.', 'available': 0},
              ],
            },
          ],
        }),
      );
      final cart = await ShopApiRepository(api.client).cart();
      expect(cart.count, 2);
      expect(cart.hasPriceChange, isTrue);
      expect(cart.lines.first.priceChange?.oldPrice, 10000);
      expect(cart.subtotalOf({'p1', 'p2'}), 36000, reason: 'dòng hết hàng không tính');
    });

    test('đặt hàng: gửi Idempotency-Key + expectedTotal, đúng body DELIVERY, không gửi giá', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'POST /shop/checkout',
        (_) async => const FakeReply(201, {
          'success': true,
          'message': 'Created',
          'data': {
            'order': {'id': 'o9', 'code': 'DH261011-AAAAAA'},
            'checkout': {'paymentId': 'pay9'},
            'replayed': false,
          },
        }),
      );
      const req = CheckoutRequest(
        mode: CheckoutMode.cart,
        fulfillmentType: FulfillmentType.delivery,
        productIds: ['p1', 'p2'],
        addressId: 'a1',
        note: ' gọi trước ',
      );
      final placed = await ShopApiRepository(api.client)
          .placeOrder(req, expectedTotal: 140000, idempotencyKey: 'key-123');
      expect(placed.paymentId, 'pay9');
      final sent = api.backend.requests.single;
      expect(sent.headers['Idempotency-Key'], 'key-123');
      final body = sent.body! as Map;
      expect(body['mode'], 'CART');
      expect(body['fulfillmentType'], 'DELIVERY');
      expect(body['productIds'], ['p1', 'p2']);
      expect(body['addressId'], 'a1');
      expect(body['expectedTotal'], 140000);
      expect(body['note'], 'gọi trước');
      expect(body.containsKey('price'), isFalse);
    });

    test('lỗi PRICE_CHANGED / CHECKOUT_LOCKED ⇒ mã + thông điệp tiếng Việt', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'POST /shop/checkout',
        (_) async => FakeReply.error(
          403,
          'Bạn đã để quá nhiều đơn hết hạn thanh toán.',
          errors: {'code': 'CHECKOUT_LOCKED', 'lockedUntil': '2026-10-12T03:00:00.000Z'},
        ),
      );
      const req = CheckoutRequest(mode: CheckoutMode.buyNow, fulfillmentType: FulfillmentType.pickup, items: {'p1': 1});
      try {
        await ShopApiRepository(api.client).placeOrder(req, expectedTotal: 1, idempotencyKey: 'k');
        fail('phải lỗi');
      } on AppFailure catch (f) {
        expect(f.code, 'CHECKOUT_LOCKED');
        expect(ShopErrors.message(f), contains('Mở lại lúc'));
      }
      expect(ShopErrors.message(const AppFailure.conflict('Giá đã đổi', code: 'PRICE_CHANGED')), 'Giá đã đổi');
      expect(ShopErrors.isPriceChanged(const AppFailure.conflict('x', code: 'PRICE_CHANGED')), isTrue);
    });

    test('đơn của tôi: lọc nhóm + đếm từng tab (counts ngoài data)', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on('GET /shop/orders', (req) async {
        expect(req.query['status'], 'ACTIVE');
        return FakeReply(200, {
          'success': true,
          'message': 'OK',
          'data': [_order()],
          'counts': {'PENDING': 1, 'ACTIVE': 1, 'COMPLETED': 4, 'CLOSED': 2},
          'pagination': {'page': 1, 'limit': 50, 'total': 1, 'totalPages': 1},
        });
      });
      final list = await ShopApiRepository(api.client).myOrders(OrderGroup.active);
      expect(list.orders.single.status, ShopOrderStatus.readyForPickup);
      expect(list.counts.completed, 4);
      expect(list.counts.of(OrderGroup.pending), 1);
    });

    test('chi tiết đơn: mã nhận hàng, lịch sử, người tạo/hệ thống', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on('GET /shop/orders/o1', (_) async => FakeReply.ok(_order()));
      final o = await ShopApiRepository(api.client).myOrder('o1');
      expect(o.pickup?.code, 'K7M2Q9XA');
      expect(o.pickup?.qrPayload, startsWith('SCMS-PICKUP:'));
      expect(o.history, hasLength(3));
      expect(o.history[1].bySystem, isTrue);
      expect(o.itemCount, 2);
      expect(o.paymentId, 'pay1');
    });

    test('Manager: chuyển SHIPPING kèm vận đơn; xác nhận nhận hàng kèm 4 số SĐT', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend
        ..on('POST /shop/manage/orders/o1/status', (req) async {
          final b = req.body! as Map;
          expect(b['status'], 'SHIPPING');
          expect(b['trackingCode'], 'GHN1');
          return FakeReply.ok(_order(status: 'SHIPPING'));
        })
        ..on('POST /shop/manage/orders/o1/pickup', (req) async {
          final b = req.body! as Map;
          expect(b['phoneLast4'], '4567');
          return FakeReply.ok(_order(status: 'COMPLETED'));
        })
        ..on(
          'POST /shop/manage/pickup/verify',
          (_) async => FakeReply.ok({..._order(), 'recipientPhoneMasked': '******4567', 'pickup': null}),
        );
      final repo = ShopApiRepository(api.client);
      expect(
        (await repo.transition('o1', ShopOrderStatus.shipping, trackingCode: 'GHN1')).status,
        ShopOrderStatus.shipping,
      );
      final found = await repo.verifyPickup('SCMS-PICKUP:DH261011-7KQ3XM:K7M2Q9XA');
      expect(found.order.recipientPhoneMasked, '******4567');
      expect((await repo.confirmPickup('o1', 'K7M2Q9XA', '4567')).status, ShopOrderStatus.completed);
    });
  });

  group('cartProvider (mock)', () {
    test('Guest ⇒ giỏ rỗng; Member ⇒ thêm/sửa/xóa cập nhật badge', () async {
      final server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
      final container = ProviderContainer(overrides: [mockServerProvider.overrideWithValue(server)]);
      addTearDown(container.dispose);

      expect(await container.read(cartProvider.future), Cart.empty);

      await container.read(sessionProvider.future);
      await container.read(sessionProvider.notifier).login('member@demo.vn', kDemoPassword);
      final seeded = await container.read(cartProvider.future);
      expect(seeded.count, 2, reason: 'seed: 2 dòng trong giỏ của member');
      final notifier = container.read(cartProvider.notifier);
      await notifier.add('p-mat', 1);
      expect(container.read(cartCountProvider), 3);
      await notifier.setQuantity('p-mat', 2);
      expect(container.read(cartProvider).value!.lines.firstWhere((l) => l.productId == 'p-mat').quantity, 2);
      await expectLater(notifier.add('p-whey', 5), throwsA(isA<AppFailure>()));
      await notifier.remove('p-mat');
      expect(container.read(cartCountProvider), 2);
      expect(container.read(shopRepositoryProvider), isNotNull);
    });
  });
}
