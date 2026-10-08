import '../../../../core/data/picked_file.dart';
import '../entities/app_user.dart';
import '../entities/auth_models.dart';

/// Xác thực & hồ sơ — module `auth` (+ `coaches/me/cv`) của BE.
abstract interface class AuthRepository {
  /// Khôi phục phiên đã lưu (null nếu chưa đăng nhập).
  Future<AuthSession?> restoreSession();

  /// `POST /auth/login`.
  Future<AuthSession> login(String email, String password);

  /// `POST /auth/register`. Coach ⇒ trả phiên tạm (để nộp CV); Member ⇒ `null`
  /// (đăng nhập lại sau khi đăng ký).
  Future<AuthSession?> register(RegisterInput input);

  /// `POST /auth/logout`.
  Future<void> logout();

  /// `GET /auth/me` (+ trạng thái CV với Coach).
  Future<AuthSession> refreshMe();

  /// `POST /auth/forgot-password` — gửi OTP 6 số qua email (TODO BE-4).
  Future<void> requestPasswordReset(String email);

  /// `PATCH /auth/reset-password` với `{ email, otp, newPassword }` (TODO BE-4).
  Future<void> resetPassword({required String email, required String otp, required String newPassword});

  /// `PATCH /auth/me` (+ `PATCH /coaches/:id` cho hồ sơ chuyên môn).
  Future<AppUser> updateProfile(ProfileUpdate update);

  /// `PATCH /auth/me/change-password`.
  Future<void> changePassword({required String oldPassword, required String newPassword});

  /// `POST /auth/me/avatar` (field `avatar`, ảnh ≤ 5MB).
  Future<AppUser> updateAvatar(PickedFile file);

  /// `POST /coaches/me/cv` (field `cv`, PDF ≤ 10MB).
  Future<Certification> submitCv(PickedFile file);
}
