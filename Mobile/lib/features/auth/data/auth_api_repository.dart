import '../../../api/auth_json.dart';
import '../../../core/data/picked_file.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../../../core/network/token_storage.dart';
import '../domain/entities/app_user.dart';
import '../domain/entities/auth_models.dart';
import '../domain/repositories/auth_repository.dart';

/// [AuthRepository] gọi BE thật — module `auth` + `coaches` (CV, hồ sơ chuyên môn).
class AuthApiRepository implements AuthRepository {
  AuthApiRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStorage _tokens;

  /// Phiên gần nhất (dùng cho đổi mật khẩu / Coach chưa duyệt).
  AuthSession? _last;

  Future<AuthSession> _me() async {
    final res = await _api.get('/auth/me');
    return _last = AuthJson.session(res.json);
  }

  @override
  Future<AuthSession?> restoreSession() async {
    if (!await _tokens.hasSession) return null;
    try {
      return await _me();
    } on AppFailure catch (f) {
      // Token hết hạn & refresh thất bại / tài khoản bị khóa ⇒ coi như chưa đăng nhập.
      if (f.type == FailureType.unauthorized || f.type == FailureType.forbidden) {
        await _tokens.clear();
        return null;
      }
      rethrow; // Lỗi mạng ⇒ màn Splash hiển thị "Thử lại".
    }
  }

  @override
  Future<AuthSession> login(String email, String password) async {
    final ApiResponse res;
    try {
      res = await _api.post(
        '/auth/login',
        body: {'email': email.trim().toLowerCase(), 'password': password},
        auth: false,
      );
    } on AppFailure catch (f) {
      // 403 = tài khoản bị khóa (Coach chưa duyệt CV vẫn đăng nhập được với `restricted:true` — BE-9).
      if (f.type == FailureType.forbidden) {
        throw const AppFailure(
          FailureType.forbidden,
          'Tài khoản đã bị khóa. Vui lòng liên hệ trung tâm.',
          code: 'ACCOUNT_INACTIVE',
        );
      }
      rethrow;
    }
    final data = res.json;
    await _tokens.save(accessToken: data.str('accessToken'), refreshToken: data.strOrNull('refreshToken'));
    try {
      return await _me();
    } on Object {
      await _tokens.clear();
      rethrow;
    }
  }

  @override
  Future<AuthSession?> register(RegisterInput input) async {
    final phone = input.phone?.trim();
    final ApiResponse res;
    try {
      res = await _api.post(
        '/auth/register',
        auth: false,
        body: {
          'email': input.email.trim().toLowerCase(),
          'password': input.password,
          'fullName': input.fullName.trim(),
          if (phone != null && phone.isNotEmpty) 'phone': phone,
          if (input.gender != null) 'gender': beName(input.gender!),
          if (input.dateOfBirth != null) 'dateOfBirth': AuthJson.dateOnly(input.dateOfBirth),
          'role': beName(input.role),
        },
      );
    } on AppFailure catch (f) {
      throw _duplicateField(f);
    }
    final data = res.json;
    final token = data.strOrNull('accessToken');
    if (input.role == UserRole.coach && token != null) {
      // Coach: phiên giới hạn (BE-9, có cả refresh token) để nộp CV ngay.
      await _tokens.save(accessToken: token, refreshToken: data.strOrNull('refreshToken'));
      return _last = AuthJson.session(data);
    }
    return null; // Member: đăng nhập lại sau khi đăng ký.
  }

  @override
  Future<void> logout() async {
    final refreshToken = await _tokens.refreshToken;
    try {
      if (refreshToken != null) await _api.post('/auth/logout', body: {'refreshToken': refreshToken});
    } on AppFailure {
      // Token đã hết hạn / bị thu hồi / mất mạng: vẫn đăng xuất cục bộ.
    } finally {
      _last = null;
      await _tokens.clear();
    }
  }

  @override
  Future<AuthSession> refreshMe() => _me();

  @override
  Future<void> requestPasswordReset(String email) async {
    // BE luôn trả 200 + cùng thông điệp (không lộ email có tồn tại); gửi OTP 6 số, hết hạn 15 phút.
    await _api.post('/auth/forgot-password', body: {'email': email.trim().toLowerCase()}, auth: false);
  }

  @override
  Future<void> resetPassword({required String email, required String otp, required String newPassword}) async {
    try {
      await _api.patch(
        '/auth/reset-password',
        body: {'email': email.trim().toLowerCase(), 'otp': otp.trim(), 'newPassword': newPassword},
        auth: false,
      );
    } on AppFailure catch (f) {
      // Sai / hết hạn / quá 5 lần ⇒ BE trả `OTP_INVALID` (cùng thông điệp) ⇒ hiện ngay ô nhập mã.
      if (f.code == 'OTP_INVALID') {
        throw AppFailure.validation(f.message, fieldErrors: {'otp': 'Mã không đúng hoặc đã hết hạn'});
      }
      rethrow;
    }
    // BE đã thu hồi mọi phiên đăng nhập của tài khoản ⇒ xóa token cục bộ (nếu có).
    await _tokens.clear();
  }

  @override
  Future<AppUser> updateProfile(ProfileUpdate update) async {
    final phone = update.phone?.trim();
    final role = _last?.user.role;
    try {
      await _api.patch(
        '/auth/me',
        body: {
          'fullName': update.fullName.trim(),
          if (phone != null && phone.isNotEmpty) 'phone': phone,
          if (update.gender != null) 'gender': beName(update.gender!),
          if (update.dateOfBirth != null) 'dateOfBirth': AuthJson.dateOnly(update.dateOfBirth),
          if (role == UserRole.member) ...{
            'fitnessGoal': ?update.fitnessGoal,
            if (update.trainingLevel != null) 'trainingLevel': beName(update.trainingLevel!),
            'trainingPreference': ?update.trainingPreference,
          },
        },
      );
      if (role == UserRole.coach) {
        final specialization = update.specialization?.trim();
        await _api.patch(
          '/coaches/${_last!.user.id}',
          body: {
            if (specialization != null && specialization.isNotEmpty) 'specialization': specialization,
            'experienceYears': ?update.experienceYears,
            'bio': ?update.bio,
          },
        );
      }
    } on AppFailure catch (f) {
      throw _duplicateField(f);
    }
    return (await _me()).user;
  }

  @override
  Future<void> changePassword({required String oldPassword, required String newPassword}) async {
    try {
      await _api.patch('/auth/me/change-password', body: {'currentPassword': oldPassword, 'newPassword': newPassword});
    } on AppFailure catch (f) {
      if (f.code == null && f.type == FailureType.business) {
        throw AppFailure.validation(f.message, fieldErrors: {'oldPassword': f.message});
      }
      final current = f.fieldErrors['currentPassword'];
      if (current != null) {
        throw AppFailure.validation(f.message, fieldErrors: {...f.fieldErrors, 'oldPassword': current});
      }
      rethrow;
    }
    // BE thu hồi mọi refresh token sau khi đổi mật khẩu ⇒ đăng nhập lại ngầm để giữ phiên.
    final email = _last?.user.email;
    if (email != null) {
      try {
        await login(email, newPassword);
      } on AppFailure {
        // Không lấy lại được token: phiên sẽ hết khi access token hết hạn ⇒ về màn Đăng nhập.
      }
    }
  }

  @override
  Future<AppUser> updateAvatar(PickedFile file) async {
    final res = await _api.upload('/auth/me/avatar', field: 'avatar', file: file);
    _last = AuthJson.session(res.json);
    return _last!.user;
  }

  @override
  Future<Certification> submitCv(PickedFile file) async {
    final res = await _api.upload('/coaches/me/cv', field: 'cv', file: file);
    // BE trả kèm hồ sơ vừa lưu (PENDING, ghi đè hồ sơ cũ); giữ tên/dung lượng tệp người dùng chọn.
    final saved = AuthJson.certificationOf(res.json.obj('certification'));
    final cert = Certification(
      id: saved.id,
      status: saved.status,
      submittedAt: saved.submittedAt,
      fileUrl: saved.fileUrl,
      fileName: file.name,
      fileSizeBytes: file.sizeBytes,
    );
    if (_last != null) _last = _last!.copyWith(certification: cert);
    return cert;
  }

  /// 409 email trùng / P2002 phone trùng ⇒ lỗi theo field của form.
  AppFailure _duplicateField(AppFailure f) {
    if (f.type != FailureType.conflict) return f;
    final msg = f.message.toLowerCase();
    if (msg.contains('email')) {
      return const AppFailure(
        FailureType.conflict,
        'Email đã được sử dụng.',
        code: 'EMAIL_TAKEN',
        fieldErrors: {'email': 'Email đã được sử dụng'},
      );
    }
    if (msg.contains('điện thoại')) {
      return const AppFailure.validation(
        'Số điện thoại đã được sử dụng.',
        fieldErrors: {'phone': 'Số điện thoại đã được sử dụng'},
      );
    }
    return f;
  }
}
