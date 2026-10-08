import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/product_repository.dart';
import 'product_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (giai đoạn UI) hoặc API (TODO khi nối BE).
/// UI chỉ phụ thuộc interface [ProductRepository].
final productRepositoryProvider = Provider<ProductRepository>((ref) {
  if (Env.useMock) return ProductMockRepository(ref.watch(mockServerProvider));
  throw UnimplementedError('TODO API: ProductRepository qua Dio — xem Mobile/README.md mục "Điểm cần nối API".');
});
