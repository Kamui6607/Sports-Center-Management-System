import 'package:flutter/foundation.dart';

/// Môi trường chạy (`--dart-define=APP_ENV=dev|staging|prod`).
enum AppEnvironment { dev, staging, prod }

/// Cấu hình môi trường đọc từ `--dart-define`.
///
/// Mặc định chạy với API thật (`dev` trỏ `http://10.0.2.2:8080` trên Android emulator — localhost của
/// máy dev). Chạy bằng dữ liệu giả lập: `flutter run --dart-define=USE_MOCK=true`.
abstract final class Env {
  /// Mặc định gọi API thật. `--dart-define=USE_MOCK=true` ⇒ chạy toàn bộ bằng dữ liệu giả lập.
  static const bool _useMockDefine = bool.fromEnvironment('USE_MOCK');

  /// Test widget dùng mock mà không cần `--dart-define` (đặt trong `test/flutter_test_config.dart`).
  @visibleForTesting
  static bool? debugUseMockOverride;

  /// `true` ⇒ dùng repository mock.
  static bool get useMock => debugUseMockOverride ?? _useMockDefine;

  /// Ép một số chức năng chạy mock khi `USE_MOCK=false` (danh sách cách nhau dấu phẩy),
  /// VD `--dart-define=MOCK_FEATURES=chat,training`. Tên chức năng = tên thư mục
  /// trong `lib/features/` (auth, catalog, classes, schedule, payments, attendance,
  /// refunds, products, coach, training, feedbacks, chat, notifications, manager).
  static const String _mockFeatures = String.fromEnvironment('MOCK_FEATURES');

  /// Chức năng [feature] dùng mock? (`USE_MOCK=true` ⇒ mọi chức năng).
  ///
  /// Lưu ý: các chức năng dùng chung id (khóa học, buổi học, thanh toán...) nên
  /// cùng chạy mock hoặc cùng chạy API để dữ liệu khớp nhau.
  static bool mock(String feature) => useMock || _mockFeatures.split(',').map((e) => e.trim()).contains(feature);

  static const String _appEnv = String.fromEnvironment('APP_ENV', defaultValue: 'dev');

  static AppEnvironment get environment => switch (_appEnv) {
    'prod' || 'production' => AppEnvironment.prod,
    'staging' => AppEnvironment.staging,
    _ => AppEnvironment.dev,
  };

  /// Origin của BE (không kèm `/api/v1`), ghi đè bằng `--dart-define=API_BASE_URL=...`.
  static const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

  /// URL staging / prod — truyền qua `--dart-define` khi BE được triển khai.
  static const String _stagingBaseUrl = String.fromEnvironment('API_BASE_URL_STAGING');
  static const String _prodBaseUrl = String.fromEnvironment('API_BASE_URL_PROD');

  /// Origin BE theo môi trường. Dev: Android emulator dùng `10.0.2.2` (localhost
  /// của máy dev), iOS simulator / desktop dùng `localhost`. Thiết bị thật: truyền
  /// `API_BASE_URL=http://<IP-LAN-máy-dev>:8080`.
  static String get apiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) return _trimSlash(_apiBaseUrlOverride);
    switch (environment) {
      case AppEnvironment.staging:
        return _trimSlash(_stagingBaseUrl);
      case AppEnvironment.prod:
        return _trimSlash(_prodBaseUrl);
      case AppEnvironment.dev:
        final isAndroid = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
        return isAndroid ? 'http://10.0.2.2:8080' : 'http://localhost:8080';
    }
  }

  /// Tiền tố REST của BE.
  static String get apiUrl => '$apiBaseUrl/api/v1';

  /// Timeout kết nối / chờ phản hồi của HTTP client.
  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);

  /// Thời gian sống của giao dịch SePay (phút) — mock theo cấu hình BE.
  static const int sepayTtlMinutes = 15;

  static String _trimSlash(String url) => url.endsWith('/') ? url.substring(0, url.length - 1) : url;
}
