import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/env.dart';
import '../data/paged.dart';
import '../data/picked_file.dart';
import 'api_error_mapper.dart';
import 'auth_interceptor.dart';
import 'json.dart';
import 'token_storage.dart';

/// Phản hồi thành công của BE: `{ success:true, message, data, pagination? }`.
class ApiResponse {
  const ApiResponse({required this.data, required this.message, this.pagination, this.raw = const {}});

  final Object? data;
  final String message;
  final Json? pagination;

  /// Toàn bộ body (field ngoài `data`, VD `counts` của `GET /shop/orders`).
  final Json raw;

  /// `data` là object.
  Json get json => asJson(data);

  /// `data` là mảng object.
  List<Json> get list => asJsonList(data);

  /// `data` là mảng + `pagination` ⇒ [Paged].
  Paged<T> paged<T>(T Function(Json) map, {int page = 1, int limit = 10}) {
    final p = pagination;
    final items = list.map(map).toList();
    return Paged(
      items: items,
      page: p?.intOrNull('page') ?? page,
      limit: p?.intOrNull('limit') ?? limit,
      total: p?.intOrNull('total') ?? items.length,
    );
  }
}

/// HTTP client dùng chung (Dio): base URL theo môi trường, timeout, gắn JWT,
/// tự refresh, chuẩn hóa lỗi về `AppFailure` (tiếng Việt).
///
/// Không log body/header ⇒ không lộ token, mật khẩu.
class ApiClient {
  ApiClient({required TokenStorage tokens, required void Function() onSessionExpired, Dio? dio})
    : dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: Env.apiUrl,
              connectTimeout: Env.connectTimeout,
              receiveTimeout: Env.receiveTimeout,
              sendTimeout: Env.receiveTimeout,
              contentType: Headers.jsonContentType,
              responseType: ResponseType.json,
            ),
          ) {
    this.dio.interceptors.add(AuthInterceptor(dio: this.dio, tokens: tokens, onSessionExpired: onSessionExpired));
    if (kDebugMode) this.dio.interceptors.add(_DebugLogInterceptor());
  }

  final Dio dio;

  Future<ApiResponse> get(String path, {Map<String, Object?>? query, bool auth = true}) =>
      _send(() => dio.get<Object?>(path, queryParameters: _clean(query), options: _opts(auth)));

  /// Tải mọi trang của endpoint phân trang (`limit` tối đa 100 theo BE), dừng ở [maxPages].
  Future<List<Json>> getAll(String path, {Map<String, Object?>? query, int maxPages = 20}) async {
    final all = <Json>[];
    for (var page = 1; page <= maxPages; page++) {
      final res = await get(path, query: {...?query, 'page': page, 'limit': 100});
      all.addAll(res.list);
      final totalPages = res.pagination?.intOrNull('totalPages') ?? 1;
      if (page >= totalPages || res.list.isEmpty) break;
    }
    return all;
  }

  /// Tải tệp nhị phân: URL tuyệt đối (VD ảnh VietQR — không gắn token) hoặc đường dẫn API có xác thực
  /// (VD `/coaches/:id/cv/file`, [auth] = true).
  Future<Uint8List> getBytes(String url, {bool auth = false}) async {
    try {
      final res = await dio.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes, extra: {'auth': auth}),
      );
      return Uint8List.fromList(res.data ?? const []);
    } on DioException catch (e) {
      throw ApiErrorMapper.fromDio(e);
    }
  }

  /// [headers]: header thêm (VD `Idempotency-Key` khi tạo đơn hàng).
  Future<ApiResponse> post(
    String path, {
    Object? body,
    Map<String, Object?>? query,
    bool auth = true,
    Map<String, String>? headers,
  }) => _send(
    () => dio.post<Object?>(
      path,
      data: body,
      queryParameters: _clean(query),
      options: _opts(auth).copyWith(headers: headers),
    ),
  );

  Future<ApiResponse> patch(String path, {Object? body, bool auth = true}) =>
      _send(() => dio.patch<Object?>(path, data: body, options: _opts(auth)));

  Future<ApiResponse> put(String path, {Object? body, bool auth = true}) =>
      _send(() => dio.put<Object?>(path, data: body, options: _opts(auth)));

  Future<ApiResponse> delete(String path, {Object? body, Map<String, Object?>? query, bool auth = true}) =>
      _send(() => dio.delete<Object?>(path, data: body, queryParameters: _clean(query), options: _opts(auth)));

  /// Upload multipart một tệp ở field [field] (+ các field chữ [fields]).
  Future<ApiResponse> upload(
    String path, {
    required String field,
    required PickedFile file,
    Map<String, Object?> fields = const {},
    void Function(int sent, int total)? onProgress,
  }) async {
    final filePath = file.path;
    if (filePath == null) throw ArgumentError('PickedFile.path is required for upload');
    // BE kiểm tra mimetype (CV phải `application/pdf`, avatar phải ảnh) ⇒ luôn gửi đúng loại.
    final mime = file.mimeType ?? _mimeByExtension[file.extension] ?? 'application/octet-stream';
    final form = FormData.fromMap({
      ...fields,
      field: await MultipartFile.fromFile(filePath, filename: file.name, contentType: DioMediaType.parse(mime)),
    });
    return _send(
      () => dio.post<Object?>(
        path,
        data: form,
        options: _opts(true).copyWith(contentType: Headers.multipartFormDataContentType),
        onSendProgress: onProgress,
      ),
    );
  }

  /// URL tuyệt đối cho đường dẫn file tương đối của BE (VD `uploads/cvs/x.pdf`).
  static String? absoluteUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '${Env.apiBaseUrl}/${path.startsWith('/') ? path.substring(1) : path}';
  }

  static const _mimeByExtension = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'heic': 'image/heic',
  };

  Options _opts(bool auth) => Options(extra: {'auth': auth});

  static Map<String, Object?>? _clean(Map<String, Object?>? query) {
    if (query == null) return null;
    return {
      for (final e in query.entries)
        if (e.value != null && e.value != '') e.key: e.value is Enum ? beName(e.value! as Enum) : e.value,
    };
  }

  Future<ApiResponse> _send(Future<Response<Object?>> Function() call) async {
    try {
      final res = await call();
      final body = asJson(res.data);
      // BE đôi khi trả HTTP 200 kèm `success:false`.
      if (body['success'] == false) throw ApiErrorMapper.fromResponse(res.statusCode ?? 400, body);
      return ApiResponse(
        data: body['data'],
        message: body.str('message'),
        pagination: body.objOrNull('pagination'),
        raw: body,
      );
    } on DioException catch (e) {
      throw ApiErrorMapper.fromDio(e);
    }
  }
}

/// Log gọn trong debug: `[API] GET /classes → 200` (không log header/body).
class _DebugLogInterceptor extends Interceptor {
  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    debugPrint('[API] ${response.requestOptions.method} ${response.requestOptions.path} → ${response.statusCode}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    debugPrint(
      '[API] ${err.requestOptions.method} ${err.requestOptions.path} ✗ ${err.response?.statusCode ?? err.type}',
    );
    handler.next(err);
  }
}

/// Tín hiệu "phiên hết hạn" (refresh thất bại / tài khoản bị khóa). Phiên đăng nhập
/// lắng nghe provider này để xóa phiên ⇒ router đưa về màn Đăng nhập.
final sessionExpiredProvider = NotifierProvider<SessionExpiredSignal, int>(SessionExpiredSignal.new);

class SessionExpiredSignal extends Notifier<int> {
  @override
  int build() => 0;

  void fire() => state++;
}

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    tokens: ref.watch(tokenStorageProvider),
    onSessionExpired: () => ref.read(sessionExpiredProvider.notifier).fire(),
  ),
);
