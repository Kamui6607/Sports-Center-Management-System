import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sports_center_mobile/core/network/api_client.dart';
import 'package:sports_center_mobile/core/network/token_storage.dart';

/// Một request đã nhận (để assert).
class FakeRequest {
  FakeRequest(this.method, this.path, this.headers, this.body, this.query);

  final String method;
  final String path;
  final Map<String, dynamic> headers;
  final Object? body;
  final Map<String, dynamic> query;

  String? get bearer => (headers['Authorization'] as String?)?.replaceFirst('Bearer ', '');
}

/// Phản hồi giả: status + body JSON.
class FakeReply {
  const FakeReply(this.status, this.body);

  FakeReply.ok(Object? data, {Map<String, Object?>? pagination})
    : this(200, {'success': true, 'message': 'OK', 'data': data, 'pagination': ?pagination});

  FakeReply.error(int status, String message, {Object? errors})
    : this(status, {'success': false, 'message': message, 'errors': ?errors});

  final int status;
  final Object? body;
}

typedef FakeHandler = Future<FakeReply> Function(FakeRequest req);

/// BE giả cho Dio: định tuyến theo `"METHOD /path"`; thiếu route ⇒ 404.
class FakeBackend implements HttpClientAdapter {
  final routes = <String, FakeHandler>{};
  final requests = <FakeRequest>[];

  void on(String route, FakeHandler handler) => routes[route] = handler;

  int count(String route) => requests.where((r) => '${r.method} ${r.path}' == route).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    Object? body = options.data;
    if (body is String) body = jsonDecode(body);
    final req = FakeRequest(options.method, options.path, options.headers, body, options.queryParameters);
    requests.add(req);
    final handler = routes['${options.method} ${options.path}'];
    final reply = handler == null ? FakeReply.error(404, 'Route not found') : await handler(req);
    return ResponseBody.fromString(
      jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// ApiClient + TokenStorage nối với [FakeBackend] (secure storage giả lập trong bộ nhớ).
class FakeApi {
  FakeApi({Map<String, String> storedTokens = const {}}) {
    FlutterSecureStorage.setMockInitialValues({...storedTokens});
    tokens = TokenStorage();
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1', contentType: Headers.jsonContentType))
      ..httpClientAdapter = backend;
    client = ApiClient(tokens: tokens, onSessionExpired: () => expiredCount++, dio: dio);
  }

  final backend = FakeBackend();
  late final TokenStorage tokens;
  late final ApiClient client;
  int expiredCount = 0;
}
