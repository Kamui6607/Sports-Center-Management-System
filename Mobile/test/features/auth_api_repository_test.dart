import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/auth/data/auth_api_repository.dart';
import 'package:sports_center_mobile/features/auth/domain/entities/app_user.dart';
import 'package:sports_center_mobile/features/auth/domain/entities/auth_models.dart';

import '../helpers/fake_backend.dart';

/// User JSON đúng shape `GET /auth/me` của BE.
Map<String, Object?> _user({String role = 'MEMBER', bool active = true, Map<String, Object?>? cert}) => {
  'id': 'u1',
  'email': 'member1@example.com',
  'fullName': 'Phạm Văn An',
  'phone': null,
  'gender': 'MALE',
  'dateOfBirth': '2000-05-01T00:00:00.000Z',
  'avatarUrl': 'uploads/avatars/u1.png',
  'role': role,
  'isActive': active,
  'memberProfile': role == 'MEMBER' ? {'id': 'mp1', 'fitnessGoal': 'Giảm cân', 'trainingLevel': 'BEGINNER'} : null,
  'coachProfile': role == 'COACH'
      ? {
          'id': 'cp1',
          'specialization': 'Yoga',
          'experienceYears': 3,
          'certification': cert,
          'approvalStatus': 'PENDING',
        }
      : null,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('đăng nhập ⇒ lưu token, tải /auth/me, parse user', () async {
    final api = FakeApi();
    api.backend
      ..on('POST /auth/login', (_) async => FakeReply.ok({'accessToken': 'A', 'refreshToken': 'R'}))
      ..on('GET /auth/me', (r) async => r.bearer == 'A' ? FakeReply.ok(_user()) : FakeReply.error(401, 'x'));
    final repo = AuthApiRepository(api.client, api.tokens);
    final s = await repo.login(' Member1@Example.com ', 'Member@123');
    expect(api.backend.requests.first.body, {'email': 'member1@example.com', 'password': 'Member@123'});
    expect(api.backend.requests.first.bearer, isNull);
    expect(s.user.role, UserRole.member);
    expect(s.user.gender, Gender.male);
    expect(s.user.memberProfile?.trainingLevel, TrainingLevel.beginner);
    expect(s.user.avatarUrl, endsWith('/uploads/avatars/u1.png'));
    expect(await api.tokens.refreshToken, 'R');
  });

  test('đăng nhập tài khoản chưa kích hoạt (403) ⇒ thông báo rõ ràng', () async {
    final api = FakeApi();
    api.backend.on('POST /auth/login', (_) async => FakeReply.error(403, 'Your account has been deactivated'));
    final repo = AuthApiRepository(api.client, api.tokens);
    await expectLater(
      repo.login('coach@x.com', '123456'),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'ACCOUNT_INACTIVE')),
    );
  });

  test('đăng ký Coach ⇒ phiên giới hạn có cả refresh token (BE-9), tải lại hồ sơ được', () async {
    final api = FakeApi();
    api.backend
      ..on(
        'POST /auth/register',
        (_) async => FakeReply(201, {
          'success': true,
          'message': 'Registration successful',
          'data': {
            ..._user(role: 'COACH', active: false),
            'accessToken': 'TMP',
            'refreshToken': 'RT',
            'restricted': true,
            'requireCvUpload': true,
          },
        }),
      )
      ..on('GET /auth/me', (_) async => FakeReply.ok({..._user(role: 'COACH', active: false), 'restricted': true}));
    final repo = AuthApiRepository(api.client, api.tokens);
    final s = await repo.register(
      const RegisterInput(fullName: 'HLV A', email: 'a@x.com', password: '123456', role: UserRole.coach, phone: ''),
    );
    final body = api.backend.requests.single.body! as Map;
    expect(body['role'], 'COACH');
    expect(body.containsKey('phone'), isFalse);
    expect(s!.isPendingCoach, isTrue);
    expect(s.certification, isNull);
    expect(await api.tokens.accessToken, 'TMP');
    expect(await api.tokens.refreshToken, 'RT');
    final again = await repo.refreshMe();
    expect(again.isPendingCoach, isTrue);
  });

  test('quên mật khẩu ⇒ OTP; mã sai ⇒ lỗi ở ô mã; đúng ⇒ xóa token cục bộ', () async {
    final api = FakeApi(storedTokens: {'auth.accessToken': 'A', 'auth.refreshToken': 'R'});
    api.backend
      ..on(
        'POST /auth/forgot-password',
        (_) async => FakeReply.ok({'message': 'Nếu email đã được đăng ký...', 'resendAfterSeconds': 60}),
      )
      ..on(
        'PATCH /auth/reset-password',
        (r) async => (r.body! as Map)['otp'] == '123456'
            ? FakeReply.ok({'message': 'ok'})
            : FakeReply.error(400, 'Mã xác nhận không đúng hoặc đã hết hạn.', errors: {'code': 'OTP_INVALID'}),
      );
    final repo = AuthApiRepository(api.client, api.tokens);
    await repo.requestPasswordReset(' A@X.com ');
    expect(api.backend.requests.first.body, {'email': 'a@x.com'});
    await expectLater(
      repo.resetPassword(email: 'a@x.com', otp: '000000', newPassword: 'abcdef'),
      throwsA(isA<AppFailure>().having((f) => f.fieldErrors['otp'], 'otp', isNotNull)),
    );
    await repo.resetPassword(email: 'a@x.com', otp: '123456', newPassword: 'abcdef');
    expect(api.backend.requests.last.body, {'email': 'a@x.com', 'otp': '123456', 'newPassword': 'abcdef'});
    expect(await api.tokens.accessToken, isNull);
  });

  test('email trùng khi đăng ký ⇒ lỗi tại ô email', () async {
    final api = FakeApi();
    api.backend.on('POST /auth/register', (_) async => FakeReply.error(409, 'Email is already in use'));
    final repo = AuthApiRepository(api.client, api.tokens);
    await expectLater(
      repo.register(const RegisterInput(fullName: 'A B', email: 'a@x.com', password: '123456', role: UserRole.member)),
      throwsA(isA<AppFailure>().having((f) => f.fieldErrors['email'], 'email', isNotNull)),
    );
  });

  test('khôi phục phiên: token hỏng ⇒ null và xóa token', () async {
    final api = FakeApi(storedTokens: {'auth.accessToken': 'A', 'auth.refreshToken': 'R'});
    api.backend
      ..on('GET /auth/me', (_) async => FakeReply.error(401, 'Unauthorized: invalid or expired token'))
      ..on('POST /auth/refresh-token', (_) async => FakeReply.error(401, 'Refresh token has been revoked'));
    final repo = AuthApiRepository(api.client, api.tokens);
    expect(await repo.restoreSession(), isNull);
    expect(await api.tokens.accessToken, isNull);
  });

  test('khôi phục phiên Coach bị từ chối CV ⇒ đọc lý do', () async {
    final api = FakeApi(storedTokens: {'auth.accessToken': 'A', 'auth.refreshToken': 'R'});
    api.backend.on(
      'GET /auth/me',
      (_) async => FakeReply.ok(
        _user(
          role: 'COACH',
          cert: {
            'id': 'cert1',
            'fileUrl': 'uploads/cvs/x.pdf',
            'status': 'REJECTED',
            'submittedAt': '2026-10-01T02:00:00.000Z',
            'rejectReason': 'Thiếu chứng chỉ',
          },
        ),
      ),
    );
    final s = (await AuthApiRepository(api.client, api.tokens).restoreSession())!;
    expect(s.certification?.status, CoachApprovalStatus.rejected);
    expect(s.certification?.rejectReason, 'Thiếu chứng chỉ');
    expect(s.certification?.hasFile, isTrue);
  });

  test('đăng xuất ⇒ gọi /auth/logout kèm refresh token và xóa token kể cả khi lỗi', () async {
    final api = FakeApi(storedTokens: {'auth.accessToken': 'A', 'auth.refreshToken': 'R'});
    api.backend.on('POST /auth/logout', (_) async => FakeReply.error(404, 'Refresh token not found'));
    await AuthApiRepository(api.client, api.tokens).logout();
    expect(api.backend.requests.single.body, {'refreshToken': 'R'});
    expect(await api.tokens.accessToken, isNull);
  });

  test('đổi mật khẩu sai ⇒ lỗi ở ô mật khẩu cũ; đúng ⇒ đăng nhập lại để lấy token mới', () async {
    final api = FakeApi(storedTokens: {'auth.accessToken': 'A', 'auth.refreshToken': 'R'});
    var ok = false;
    api.backend
      ..on('GET /auth/me', (_) async => FakeReply.ok(_user()))
      ..on(
        'PATCH /auth/me/change-password',
        (_) async => ok ? FakeReply.ok(null) : FakeReply.error(400, 'Current password is incorrect'),
      )
      ..on('POST /auth/login', (_) async => FakeReply.ok({'accessToken': 'A2', 'refreshToken': 'R2'}));
    final repo = AuthApiRepository(api.client, api.tokens);
    await repo.restoreSession();
    await expectLater(
      repo.changePassword(oldPassword: 'x', newPassword: '1234567'),
      throwsA(isA<AppFailure>().having((f) => f.fieldErrors['oldPassword'], 'old', 'Mật khẩu hiện tại không đúng.')),
    );
    ok = true;
    await repo.changePassword(oldPassword: 'Member@123', newPassword: '1234567');
    expect(api.backend.requests.where((r) => r.path == '/auth/me/change-password').last.body, {
      'currentPassword': 'Member@123',
      'newPassword': '1234567',
    });
    expect(await api.tokens.refreshToken, 'R2');
  });
}
