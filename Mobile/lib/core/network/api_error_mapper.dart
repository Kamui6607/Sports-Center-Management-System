import 'package:dio/dio.dart';

import '../error/app_failure.dart';
import 'json.dart';

/// Chuyển lỗi Dio / body lỗi BE `{ success:false, message, errors }` thành [AppFailure]
/// với thông điệp tiếng Việt thân thiện.
///
/// - `errors` dạng mảng `[{ field, message }]` (Zod) ⇒ [AppFailure.fieldErrors].
/// - `errors` dạng object `{ code, ... }` ⇒ [AppFailure.code] (lỗi nghiệp vụ).
abstract final class ApiErrorMapper {
  static AppFailure fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const AppFailure(FailureType.network, 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
      case DioExceptionType.connectionError:
        return const AppFailure.network();
      case DioExceptionType.cancel:
        return const AppFailure(FailureType.unknown, 'Yêu cầu đã bị hủy.');
      case DioExceptionType.badCertificate:
        return const AppFailure(FailureType.network, 'Kết nối không an toàn tới máy chủ.');
      case DioExceptionType.badResponse:
        final res = e.response;
        return fromResponse(res?.statusCode ?? 500, res?.data);
      case DioExceptionType.unknown:
        final inner = e.error;
        if (inner is AppFailure) return inner;
        // SocketException, HandshakeException... ⇒ coi như mất mạng.
        return const AppFailure.network();
    }
  }

  /// Body lỗi của BE (kể cả HTTP 2xx có `success:false`).
  static AppFailure fromResponse(int status, Object? body) {
    final json = asJson(body);
    final rawMessage = json.strOrNull('message');
    final errors = json['errors'];

    final fieldErrors = <String, String>{};
    String? code;
    Object? details;
    if (errors is List) {
      for (final e in asJsonList(errors)) {
        final field = e.str('field');
        if (field.isEmpty) continue;
        // Chỉ giữ lỗi đầu tiên của mỗi field; field lồng `bankInfo.accountNumber` ⇒ cả 2 khóa.
        fieldErrors.putIfAbsent(field, () => translateField(e.str('message')));
        final leaf = field.split('.').last;
        fieldErrors.putIfAbsent(leaf, () => translateField(e.str('message')));
      }
    } else if (errors is Map) {
      code = asJson(errors).strOrNull('code');
      details = errors;
    }

    final message = _message(status, rawMessage, fieldErrors);
    final type = switch (status) {
      400 || 422 => fieldErrors.isNotEmpty ? FailureType.validation : FailureType.business,
      401 => FailureType.unauthorized,
      403 => FailureType.forbidden,
      404 => FailureType.notFound,
      409 => FailureType.conflict,
      429 => FailureType.business,
      >= 500 => FailureType.server,
      _ => FailureType.business,
    };
    return AppFailure(type, message, code: code, fieldErrors: fieldErrors, details: details);
  }

  static String _message(int status, String? raw, Map<String, String> fieldErrors) {
    if (status >= 500) return const AppFailure.server().message;
    if (fieldErrors.isNotEmpty && (raw == null || raw == 'Validation failed')) {
      return 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu.';
    }
    if (raw != null && raw.isNotEmpty) {
      if (_isVietnamese(raw)) return raw;
      final known = _known[raw] ?? _knownPrefix(raw);
      if (known != null) return known;
    }
    return switch (status) {
      400 || 422 => 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại.',
      401 => 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      403 => 'Bạn không có quyền thực hiện thao tác này.',
      404 => 'Không tìm thấy dữ liệu.',
      409 => 'Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng tải lại.',
      429 => 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
      _ => 'Đã có lỗi xảy ra. Vui lòng thử lại.',
    };
  }

  static final _vietnamese = RegExp(
    '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]',
    caseSensitive: false,
  );

  static bool _isVietnamese(String s) => _vietnamese.hasMatch(s);

  /// Thông điệp tiếng Anh thường gặp của BE ⇒ tiếng Việt.
  static const _known = {
    'Invalid email or password': 'Email hoặc mật khẩu không đúng.',
    'Your account has been deactivated': 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.',
    'Email is already in use': 'Email đã được sử dụng.',
    'Current password is incorrect': 'Mật khẩu hiện tại không đúng.',
    'Invalid or expired token': 'Mã/liên kết đặt lại mật khẩu không đúng hoặc đã hết hạn.',
    'Invalid or expired refresh token': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    'CV must be a PDF file.': 'CV phải là tệp PDF.',
    'CV must be at most 10MB.': 'CV tối đa 10MB.',
    'Avatar must be an image (jpeg, png, webp or gif)': 'Ảnh đại diện phải là ảnh JPEG, PNG, WEBP hoặc GIF.',
    'Avatar image content is invalid (jpeg, png, webp or gif)': 'Nội dung ảnh không hợp lệ.',
    'Avatar image must be at most 5MB': 'Ảnh đại diện tối đa 5MB.',
    'Class not found': 'Không tìm thấy khóa học.',
    'Class not found or inactive': 'Khóa học không tồn tại hoặc đã ngừng.',
    'Class is not yet approved': 'Khóa học chưa được duyệt.',
    'Class is inactive': 'Khóa học đã ngừng hoạt động.',
    'This class is full': 'Khóa học đã hết chỗ.',
    'This class has no upcoming sessions to enroll': 'Khóa học không còn buổi nào sắp diễn ra để ghi danh.',
    'You are already enrolled in this class': 'Bạn đã ghi danh khóa học này.',
    'Schedule not found': 'Không tìm thấy buổi học.',
    'Schedule is already cancelled': 'Buổi học đã bị hủy.',
    'Schedule is already completed': 'Buổi học đã hoàn thành.',
    'Cannot complete a schedule that has not ended yet': 'Chỉ hoàn tất được buổi học sau giờ kết thúc.',
    'Cannot complete a cancelled schedule': 'Không thể hoàn tất buổi học đã hủy.',
    'Cannot cancel a completed schedule': 'Không thể hủy buổi học đã hoàn thành.',
    'Only BOOKED enrollments can be cancelled': 'Chỉ hủy được buổi đang giữ chỗ.',
    'Only BOOKED enrollments can be transferred': 'Chỉ đổi được buổi đang giữ chỗ.',
    'Cannot cancel enrollment for a past or ongoing class': 'Không thể hủy buổi đã hoặc đang diễn ra.',
    'Cannot transfer enrollment for a past or ongoing class': 'Không thể đổi buổi đã hoặc đang diễn ra.',
    'Cannot transfer to a past class': 'Không thể đổi sang buổi đã diễn ra.',
    'Target schedule is not available for booking': 'Buổi đích không còn nhận đặt chỗ.',
    'Target schedule is the same as the current schedule': 'Buổi đích trùng với buổi hiện tại.',
    'Enrollment not found': 'Không tìm thấy chỗ đã giữ.',
    'Product not found': 'Không tìm thấy sản phẩm.',
    'Order not found': 'Không tìm thấy đơn hàng.',
    'Only PENDING orders can be cancelled': 'Chỉ hủy được đơn đang chờ thanh toán.',
    'You can only review products that you have successfully purchased.':
        'Bạn chỉ đánh giá được sản phẩm đã mua thành công.',
    'You have already reviewed this product. Please update your existing review.': 'Bạn đã đánh giá sản phẩm này.',
    'Payment not found': 'Không tìm thấy giao dịch.',
    'SePay payment not found': 'Không tìm thấy giao dịch thanh toán.',
    'Refund not found': 'Không tìm thấy yêu cầu hoàn tiền.',
    'Wallet not found': 'Không tìm thấy ví.',
    'Coach wallet not found': 'Không tìm thấy ví HLV.',
    'Coach wallet not found. Please create a class first.': 'Ví HLV chưa được tạo. Hãy mở khóa học trước.',
    'Training plan not found': 'Không tìm thấy lộ trình tập luyện.',
    'Training result not found': 'Không tìm thấy kết quả buổi tập.',
    'Feedback not found': 'Không tìm thấy đánh giá.',
    'Notification not found': 'Không tìm thấy thông báo.',
    'Member not found': 'Không tìm thấy học viên.',
    'Coach not found': 'Không tìm thấy huấn luyện viên.',
    'User not found': 'Không tìm thấy người dùng.',
    'Room not found': 'Không tìm thấy phòng tập.',
    'Attendance not found': 'Không tìm thấy dữ liệu điểm danh.',
    'Message content or file is required': 'Vui lòng nhập nội dung hoặc đính kèm tệp.',
    'Message content is too long': 'Tin nhắn quá dài.',
    'You cannot message this user': 'Bạn không thể nhắn tin với người dùng này.',
    'Only members can scan attendance QR codes': 'Chỉ học viên mới quét được QR điểm danh.',
    'Member is not actively enrolled in this schedule': 'Bạn không có chỗ trong buổi học này.',
    'Record not found': 'Không tìm thấy dữ liệu.',
    'Invalid JSON request body': 'Yêu cầu không hợp lệ.',
    'Forbidden': 'Bạn không có quyền thực hiện thao tác này.',
    'Forbidden: insufficient permissions': 'Bạn không có quyền thực hiện thao tác này.',
    'Unauthorized: account is locked': 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.',
  };

  static String? _knownPrefix(String raw) {
    if (raw.startsWith('Forbidden')) return 'Bạn không có quyền thực hiện thao tác này.';
    if (raw.startsWith('Unauthorized')) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (raw.startsWith('Refresh token')) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (raw.startsWith('Duplicate value for')) {
      if (raw.contains('phone')) return 'Số điện thoại đã được sử dụng.';
      if (raw.contains('email')) return 'Email đã được sử dụng.';
      return 'Dữ liệu bị trùng.';
    }
    if (raw.startsWith('Cannot') || raw.startsWith('Only')) return 'Thao tác không được phép ở trạng thái hiện tại.';
    if (raw.endsWith('not found')) return 'Không tìm thấy dữ liệu.';
    return null;
  }

  /// Thông điệp lỗi field của Zod (tiếng Anh) ⇒ tiếng Việt ngắn gọn.
  static String translateField(String raw) {
    if (raw.isEmpty) return 'Giá trị không hợp lệ';
    if (_isVietnamese(raw)) return raw;
    final lower = raw.toLowerCase();
    final atLeast = RegExp(r'at least (\d+) character').firstMatch(lower);
    if (atLeast != null) return 'Tối thiểu ${atLeast.group(1)} ký tự';
    final atMost = RegExp(r'at most (\d+) character').firstMatch(lower);
    if (atMost != null) return 'Tối đa ${atMost.group(1)} ký tự';
    if (lower.contains('email')) return 'Email không hợp lệ';
    if (lower.contains('phone')) return 'Số điện thoại gồm 9–15 chữ số';
    if (lower.contains('date of birth')) return 'Ngày sinh không hợp lệ';
    if (lower == 'required' || lower.contains('is required')) return 'Bắt buộc nhập';
    if (lower.contains('greater than or equal to') || lower.contains('too small')) return 'Giá trị quá nhỏ';
    if (lower.contains('less than or equal to') || lower.contains('too big')) return 'Giá trị quá lớn';
    if (lower.contains('positive')) return 'Phải lớn hơn 0';
    if (lower.contains('invalid enum') || lower.contains('expected')) return 'Giá trị không hợp lệ';
    return 'Giá trị không hợp lệ';
  }
}
