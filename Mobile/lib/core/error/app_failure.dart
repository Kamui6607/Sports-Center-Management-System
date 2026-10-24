/// Loại lỗi thống nhất (map từ HTTP status / lỗi mạng của BE).
enum FailureType { network, validation, unauthorized, forbidden, notFound, conflict, business, server, unknown }

/// Lỗi trả về từ tầng repository. UI chỉ đọc [message], [code], [fieldErrors].
///
/// Tương ứng body lỗi của BE: `{ success:false, message, errors:[{field,message}] }`
/// hoặc `errors: { code, ... }` cho lỗi nghiệp vụ (VD `CLASS_NOT_COMPLETED`).
class AppFailure implements Exception {
  const AppFailure(this.type, this.message, {this.code, this.fieldErrors = const {}, this.details});

  const AppFailure.network() : this(FailureType.network, 'Không có kết nối mạng. Vui lòng thử lại.');

  const AppFailure.server() : this(FailureType.server, 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.');

  const AppFailure.notFound([String message = 'Không tìm thấy dữ liệu.']) : this(FailureType.notFound, message);

  const AppFailure.forbidden([String message = 'Bạn không có quyền thực hiện thao tác này.'])
    : this(FailureType.forbidden, message);

  const AppFailure.unauthorized([String message = 'Phiên đăng nhập đã hết hạn.'])
    : this(FailureType.unauthorized, message);

  const AppFailure.business(String message, {String? code}) : this(FailureType.business, message, code: code);

  const AppFailure.conflict(String message, {String? code}) : this(FailureType.conflict, message, code: code);

  const AppFailure.validation(String message, {Map<String, String> fieldErrors = const {}})
    : this(FailureType.validation, message, fieldErrors: fieldErrors);

  /// Chức năng Backend chưa hỗ trợ (API thiếu/lệch — xem `Doc/MOBILE_API_INTEGRATION.md`).
  const AppFailure.unsupported([String message = 'Chức năng này chưa được máy chủ hỗ trợ.'])
    : this(FailureType.business, message, code: 'API_NOT_SUPPORTED');

  final FailureType type;
  final String message;

  /// Mã nghiệp vụ của BE (VD `CLASS_NOT_PURCHASED`).
  final String? code;

  /// Lỗi theo từng field của form.
  final Map<String, String> fieldErrors;

  /// Dữ liệu kèm lỗi nghiệp vụ của BE (`errors` dạng object), VD QR của giao dịch đang chờ.
  final Object? details;

  bool get isRetryable => type == FailureType.network || type == FailureType.server;

  /// Chuẩn hóa mọi lỗi về [AppFailure].
  static AppFailure from(Object error) =>
      error is AppFailure ? error : const AppFailure(FailureType.unknown, 'Đã có lỗi xảy ra. Vui lòng thử lại.');

  @override
  String toString() => 'AppFailure($type, $code, $message)';
}
