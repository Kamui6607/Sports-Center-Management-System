import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/product_repository_provider.dart';
import '../../domain/entities/product.dart';

class ShopState {
  const ShopState({required this.items, required this.page, required this.hasMore});

  final List<Product> items;
  final int page;
  final bool hasMore;
}

final shopSearchProvider = NotifierProvider<ShopSearch, String>(ShopSearch.new);

class ShopSearch extends Notifier<String> {
  @override
  String build() => '';

  void set(String v) => state = v;
}

final shopProvider = AsyncNotifierProvider.autoDispose<ShopNotifier, ShopState>(ShopNotifier.new);

class ShopNotifier extends AsyncNotifier<ShopState> {
  bool _loading = false;

  @override
  Future<ShopState> build() async {
    ref.watch(dataRevisionProvider);
    final search = ref.watch(shopSearchProvider);
    final page = await ref.read(productRepositoryProvider).products(search: search);
    return ShopState(items: page.items, page: 1, hasMore: page.hasMore);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || _loading) return;
    _loading = true;
    try {
      final next = await ref
          .read(productRepositoryProvider)
          .products(search: ref.read(shopSearchProvider), page: current.page + 1);
      state = AsyncData(ShopState(items: [...current.items, ...next.items], page: next.page, hasMore: next.hasMore));
    } on Object {
      // Giữ danh sách hiện có.
    } finally {
      _loading = false;
    }
  }
}

final productProvider = FutureProvider.autoDispose.family<Product, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(productRepositoryProvider).product(id);
});

final productReviewsProvider = FutureProvider.autoDispose.family<List<ProductReview>, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(productRepositoryProvider).reviews(id);
});
