import 'package:dio/dio.dart';

import '../config/env.dart';
import '../error/app_failure.dart';
import 'json.dart';
import 'token_storage.dart';

/// Gắn `Authorization: Bearer <accessToken>` và tự refresh khi gặp 401.
///
/// - Nhiều request cùng nhận 401 ⇒ chỉ gọi `POST /auth/refresh-token` **một lần**
///   (các request khác chờ chung kết quả rồi gửi lại).
/// - Refresh thất bại (token hết hạn/bị thu hồi, tài khoản bị khóa) ⇒ xóa token và
///   gọi [onSessionExpired] để app quay về màn Đăng nhập.
/// - Request đánh dấu `extra['auth'] = false` (login, register, refresh...) không gắn token.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.dio, required this.tokens, required this.onSessionExpired});

  /// Dio chính — dùng để gửi lại request sau khi refresh.
  final Dio dio;
  final TokenStorage tokens;
  final void Function() onSessionExpired;

  /// Dio riêng cho refresh (không qua interceptor ⇒ không lặp vô hạn).
  late final Dio _refreshDio = Dio(
    BaseOptions(baseUrl: dio.options.baseUrl, connectTimeout: Env.connectTimeout, receiveTimeout: Env.receiveTimeout),
  )..httpClientAdapter = dio.httpClientAdapter;

  Future<_RefreshResult>? _inflight;

  static const _authKey = 'auth';
  static const _retriedKey = 'retried';

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.extra[_authKey] != false) {
      final token = await tokens.accessToken;
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final unauthorized = err.response?.statusCode == 401;
    if (!unauthorized || options.extra[_authKey] == false || options.extra[_retriedKey] == true) {
      return handler.next(err);
    }

    // Token đã được làm mới bởi request khác trong lúc request này đang chạy ⇒ gửi lại luôn.
    final sentWith = options.headers['Authorization'];
    final current = await tokens.accessToken;
    final alreadyRefreshed = current != null && sentWith != 'Bearer $current';

    final result = alreadyRefreshed ? _RefreshResult.ok : await _refreshOnce();
    switch (result) {
      case _RefreshResult.ok:
        try {
          options.extra[_retriedKey] = true;
          options.headers['Authorization'] = 'Bearer ${await tokens.accessToken}';
          return handler.resolve(await dio.fetch<Object?>(options));
        } on DioException catch (e) {
          return handler.next(e);
        }
      case _RefreshResult.network:
        // Mất mạng khi refresh: giữ phiên, báo lỗi mạng để người dùng thử lại.
        return handler.next(err.copyWith(type: DioExceptionType.unknown, error: const AppFailure.network()));
      case _RefreshResult.invalid:
        await tokens.clear();
        onSessionExpired();
        return handler.next(err);
    }
  }

  Future<_RefreshResult> _refreshOnce() => _inflight ??= _refresh().whenComplete(() => _inflight = null);

  Future<_RefreshResult> _refresh() async {
    final refreshToken = await tokens.refreshToken;
    if (refreshToken == null) return _RefreshResult.invalid;
    try {
      final res = await _refreshDio.post<Object?>('/auth/refresh-token', data: {'refreshToken': refreshToken});
      final access = asJson(asJson(res.data)['data']).strOrNull('accessToken');
      if (access == null) return _RefreshResult.invalid;
      await tokens.save(accessToken: access);
      return _RefreshResult.ok;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == null || status >= 500) return _RefreshResult.network;
      return _RefreshResult.invalid;
    }
  }
}

enum _RefreshResult { ok, invalid, network }
