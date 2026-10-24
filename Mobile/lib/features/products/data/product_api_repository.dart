import '../../../core/data/paged.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/network/token_storage.dart';
import '../domain/entities/product.dart';
import '../domain/repositories/product_repository.dart';

/// [ProductRepository] gọi BE thật — module `products`.
class ProductApiRepository implements ProductRepository {
  ProductApiRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStorage _tokens;

  static const _pageSize = 10;

  static Product _product(Json j) => Product(
    id: j.str('id'),
    name: j.str('name'),
    description: j.str('description'),
    price: j.money('price'),
    stockQuantity: j.integer('stockQuantity'),
    // BE trả `availableStock` = tồn − đang giữ (dữ liệu cũ: chỉ có stockQuantity).
    availableStock: j.intOrNull('availableStock'),
    maxPerOrder: j.integer('maxPerOrder', 10),
    maxPerDay: j.integer('maxPerDay', 20),
    rating: j.dbl('rating'),
    reviewCount: j.integer('reviewCount'),
    isActive: j.boolean('isActive', true),
    // BE-6: ảnh sản phẩm.
    imageUrl: ApiClient.absoluteUrl(j.strOrNull('imageUrl')),
  );

  @override
  Future<Paged<Product>> products({String search = '', int page = 1}) async {
    final res = await _api.get(
      '/products',
      query: {'search': search.trim(), 'page': page, 'limit': _pageSize},
      auth: false,
    );
    return res.paged(_product, page: page, limit: _pageSize);
  }

  /// Gửi token nếu đã đăng nhập (Quản lý thấy cả đánh giá đã ẩn).
  Future<Json> _detail(String id) async {
    final loggedIn = await _tokens.userId != null;
    return (await _api.get('/products/$id', auth: loggedIn)).json;
  }

  @override
  Future<Product> product(String id) async => _product(await _detail(id));

  @override
  Future<List<ProductReview>> reviews(String productId) async {
    final results = await Future.wait([_detail(productId), _tokens.userId]);
    final me = results[1] as String?;
    return [
      for (final r in (results[0] as Json).objList('reviews'))
        ProductReview(
          id: r.str('id'),
          userName: r.obj('user').str('fullName', 'Người dùng'),
          avatarUrl: ApiClient.absoluteUrl(r.obj('user').strOrNull('avatarUrl')),
          rating: r.integer('rating'),
          comment: r.strOrNull('comment'),
          createdAt: r.date('createdAt'),
          isMine: me != null && r.str('userId') == me,
          isHidden: r.boolean('isHidden'),
        ),
    ];
  }
}
