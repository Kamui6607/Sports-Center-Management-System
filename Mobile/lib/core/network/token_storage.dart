import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Lưu JWT trong `flutter_secure_storage` (Keychain / Keystore). Không log token.
class TokenStorage {
  TokenStorage([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'auth.accessToken';
  static const _refreshKey = 'auth.refreshToken';

  /// Bộ nhớ đệm trong phiên chạy (tránh đọc Keychain mỗi request).
  String? _access;
  String? _refresh;
  bool _loaded = false;

  Future<void> _load() async {
    if (_loaded) return;
    _access = await _storage.read(key: _accessKey);
    _refresh = await _storage.read(key: _refreshKey);
    _loaded = true;
  }

  Future<String?> get accessToken async {
    await _load();
    return _access;
  }

  Future<String?> get refreshToken async {
    await _load();
    return _refresh;
  }

  Future<bool> get hasSession async => (await accessToken) != null;

  /// `id` (userId) trong payload JWT của access token — chỉ đọc, không xác thực chữ ký
  /// (BE vẫn kiểm tra token ở mọi request). Dùng để nhận ra dữ liệu "của tôi".
  Future<String?> get userId async {
    final token = await accessToken;
    final parts = token?.split('.');
    if (parts == null || parts.length != 3) return null;
    try {
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      return payload is Map ? payload['id']?.toString() : null;
    } on FormatException {
      return null;
    }
  }

  /// Lưu cặp token. [refreshToken] null ⇒ giữ nguyên giá trị cũ (BE không xoay vòng refresh token).
  Future<void> save({required String accessToken, String? refreshToken}) async {
    _access = accessToken;
    await _storage.write(key: _accessKey, value: accessToken);
    if (refreshToken != null) {
      _refresh = refreshToken;
      await _storage.write(key: _refreshKey, value: refreshToken);
    }
    _loaded = true;
  }

  Future<void> clear() async {
    _access = null;
    _refresh = null;
    _loaded = true;
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());
