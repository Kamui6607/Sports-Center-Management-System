/// Cấu hình môi trường đọc từ `--dart-define`.
abstract final class Env {
  /// `true` ⇒ dùng repository mock (giai đoạn UI). Đổi `false` khi nối API.
  static const bool useMock = bool.fromEnvironment('USE_MOCK', defaultValue: true);

  /// Origin của BE (không kèm `/api/v1`). Dùng khi nối API.
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Thời gian sống của giao dịch SePay (phút) — mock theo cấu hình BE.
  static const int sepayTtlMinutes = 15;
}
