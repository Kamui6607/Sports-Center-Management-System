import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/data/paged.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';

final shopConfigProvider = FutureProvider<ShopConfig>((ref) => ref.watch(shopRepositoryProvider).config());

/// Giỏ hàng của người mua đang đăng nhập (Guest / Quản lý ⇒ giỏ rỗng). Badge = [Cart.count].
final cartProvider = AsyncNotifierProvider<CartNotifier, Cart>(CartNotifier.new);

class CartNotifier extends AsyncNotifier<Cart> {
  @override
  Future<Cart> build() async {
    ref.watch(dataRevisionProvider);
    final user = ref.watch(currentUserProvider);
    if (user == null || user.role == UserRole.manager) return Cart.empty;
    return ref.read(shopRepositoryProvider).cart();
  }

  /// Ghi giỏ ⇒ cập nhật state bằng giỏ server trả về; lỗi ném cho UI (snackbar).
  Future<Cart> _write(Future<Cart> Function() call) async {
    final cart = await call();
    state = AsyncData(cart);
    return cart;
  }

  Future<Cart> add(String productId, int quantity) =>
      _write(() => ref.read(shopRepositoryProvider).addToCart(productId, quantity));

  Future<Cart> setQuantity(String productId, int quantity) =>
      _write(() => ref.read(shopRepositoryProvider).updateCartItem(productId, quantity));

  Future<Cart> remove(String productId) => _write(() => ref.read(shopRepositoryProvider).removeCartItem(productId));

  Future<Cart> clear() => _write(() => ref.read(shopRepositoryProvider).clearCart());

  Future<Cart> acceptPrices() => _write(() => ref.read(shopRepositoryProvider).acceptCartPrices());
}

/// Số dòng trong giỏ (badge icon giỏ).
final cartCountProvider = Provider<int>((ref) => ref.watch(cartProvider).value?.count ?? 0);

final addressesProvider = FutureProvider.autoDispose<List<ShopAddress>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).addresses();
});

final myOrdersProvider = FutureProvider.autoDispose.family<OrderList, OrderGroup>((ref, group) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).myOrders(group);
});

final orderDetailProvider = FutureProvider.autoDispose.family<ShopOrder, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).myOrder(id);
});

// ── Manager ──────────────────────────────────────────────────────────────────

final shopSummaryProvider = FutureProvider.autoDispose<ShopSummary>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).managerSummary();
});

typedef ManagerOrderFilter = ({OrderGroup? group, FulfillmentType? type, String search});

final managerOrdersProvider = FutureProvider.autoDispose.family<Paged<ShopOrder>, ManagerOrderFilter>((ref, f) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).managerOrders(group: f.group, type: f.type, search: f.search);
});

final managerOrderProvider = FutureProvider.autoDispose.family<ShopOrder, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).managerOrder(id);
});

final inventoryProvider = FutureProvider.autoDispose.family<List<InventoryItem>, bool>((ref, lowStockOnly) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).inventory(lowStockOnly: lowStockOnly);
});

final inventoryTxProvider = FutureProvider.autoDispose.family<List<InventoryTx>, String>((ref, productId) {
  ref.watch(dataRevisionProvider);
  return ref.watch(shopRepositoryProvider).inventoryTransactions(productId);
});
