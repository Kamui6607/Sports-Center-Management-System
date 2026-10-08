import '../../../core/data/picked_file.dart';
import '../../../core/error/app_failure.dart';
import '../../../mock/demo_accounts.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../domain/entities/app_user.dart';
import '../domain/entities/auth_models.dart';
import '../domain/repositories/auth_repository.dart';

/// Mock theo `BE/src/modules/auth` + `coaches` (nộp CV).
class AuthMockRepository implements AuthRepository {
  AuthMockRepository(this._server);

  final MockServer _server;

  AuthSession _session(UserRow u) {
    final db = _server.db;
    final coach = db.coachOfUser(u.id);
    return AuthSession(user: db.toUser(u), certification: coach == null ? null : db.toCertification(coach.id));
  }

  @override
  Future<AuthSession?> restoreSession() => _server.run(() {
    final u = _server.currentUser;
    return u == null ? null : _session(u);
  });

  @override
  Future<AuthSession> login(String email, String password) => _server.run(() {
    final u = _server.db.users.where((x) => x.email == email.trim().toLowerCase()).firstOrNull;
    if (u == null || u.password != password) {
      throw const AppFailure(FailureType.unauthorized, 'Email hoặc mật khẩu không đúng.');
    }
    // TODO BE-9: BE chặn đăng nhập tài khoản inactive ⇒ cần trả phiên giới hạn
    // + trạng thái CV cho Coach chưa duyệt. Mock cho phép để vào màn onboarding.
    _server.currentUserId = u.id;
    return _session(u);
  });

  @override
  Future<AuthSession?> register(RegisterInput input) => _server.run(() {
    final db = _server.db;
    final email = input.email.trim().toLowerCase();
    if (db.users.any((u) => u.email == email)) {
      throw const AppFailure(
        FailureType.conflict,
        'Email đã được sử dụng.',
        code: 'EMAIL_TAKEN',
        fieldErrors: {'email': 'Email đã được sử dụng'},
      );
    }
    final phone = input.phone?.trim();
    if (phone != null && phone.isNotEmpty && db.users.any((u) => u.phone == phone)) {
      throw const AppFailure.validation(
        'Số điện thoại đã được sử dụng.',
        fieldErrors: {'phone': 'Số điện thoại đã được sử dụng'},
      );
    }
    final id = db.nextId('u');
    final row = UserRow(
      id: id,
      email: email,
      password: input.password,
      fullName: input.fullName.trim(),
      role: input.role,
      phone: phone == null || phone.isEmpty ? null : phone,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      isActive: input.role != UserRole.coach,
    );
    db.users.add(row);
    if (input.role == UserRole.coach) {
      db.coachProfiles.add(CoachProfileRow(id: db.nextId('cp'), userId: id));
      _server.currentUserId = id; // token tạm để nộp CV
      return _session(row);
    }
    db.memberProfiles.add(MemberProfileRow(id: db.nextId('mp'), userId: id));
    db.notify(
      id,
      NotificationType.memberRegistered,
      'Chào mừng đến với Pulse!',
      'Khám phá các khóa học và bắt đầu tập luyện ngay hôm nay.',
    );
    return null;
  });

  @override
  Future<void> logout() => _server.run(() => _server.currentUserId = null);

  @override
  Future<AuthSession> refreshMe() => _server.run(() => _session(_server.requireUser()));

  @override
  Future<void> requestPasswordReset(String email) => _server.run(() {
    // BE luôn trả thành công để không tiết lộ email có tồn tại hay không.
  });

  @override
  Future<void> resetPassword({required String email, required String otp, required String newPassword}) =>
      _server.run(() {
        if (otp != kDemoOtp) {
          throw const AppFailure.validation(
            'Mã xác nhận không đúng hoặc đã hết hạn.',
            fieldErrors: {'otp': 'Mã không đúng hoặc đã hết hạn'},
          );
        }
        final u = _server.db.users.where((x) => x.email == email.trim().toLowerCase()).firstOrNull;
        if (u != null) u.password = newPassword;
      });

  @override
  Future<AppUser> updateProfile(ProfileUpdate update) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final phone = update.phone?.trim();
    if (phone != null && phone.isNotEmpty && db.users.any((x) => x.phone == phone && x.id != u.id)) {
      throw const AppFailure.validation(
        'Số điện thoại đã được sử dụng.',
        fieldErrors: {'phone': 'Số điện thoại đã được sử dụng'},
      );
    }
    u
      ..fullName = update.fullName.trim()
      ..phone = phone == null || phone.isEmpty ? null : phone
      ..gender = update.gender
      ..dateOfBirth = update.dateOfBirth;
    final m = db.memberOfUser(u.id);
    if (m != null) {
      m
        ..fitnessGoal = update.fitnessGoal
        ..trainingLevel = update.trainingLevel
        ..trainingPreference = update.trainingPreference;
    }
    final c = db.coachOfUser(u.id);
    if (c != null) {
      c
        ..specialization = update.specialization
        ..experienceYears = update.experienceYears
        ..bio = update.bio;
    }
    return db.toUser(u);
  });

  @override
  Future<void> changePassword({required String oldPassword, required String newPassword}) => _server.run(() {
    final u = _server.requireUser();
    if (u.password != oldPassword) {
      throw const AppFailure.validation(
        'Mật khẩu hiện tại không đúng.',
        fieldErrors: {'oldPassword': 'Mật khẩu hiện tại không đúng'},
      );
    }
    u.password = newPassword;
  });

  @override
  Future<AppUser> updateAvatar(PickedFile file) => _server.run(() {
    if (!file.isImage) throw const AppFailure.validation('Chỉ chấp nhận tệp ảnh.');
    if (file.sizeBytes > 5 * 1024 * 1024) throw const AppFailure.validation('Ảnh tối đa 5MB.');
    final u = _server.requireUser();
    // Mock: không tải lên thật; dùng đường dẫn cục bộ để hiển thị.
    u.avatarUrl = file.path;
    return _server.db.toUser(u);
  });

  @override
  Future<Certification> submitCv(PickedFile file) => _server.run(() {
    final db = _server.db;
    final u = _server.requireUser();
    final coach = db.coachOfUser(u.id);
    if (coach == null) throw const AppFailure.forbidden();
    if (file.extension != 'pdf') throw const AppFailure.validation('CV phải là tệp PDF.');
    if (file.sizeBytes > 10 * 1024 * 1024) throw const AppFailure.validation('CV tối đa 10MB.');
    final existing = db.certifications.where((c) => c.coachProfileId == coach.id).firstOrNull;
    if (existing != null && existing.status == CoachApprovalStatus.approved) {
      throw const AppFailure.business('Hồ sơ đã được duyệt.');
    }
    // Nộp lại ⇒ ghi đè file, về PENDING, xóa lý do từ chối cũ.
    final row =
        existing ??
        CertificationRow(
          id: db.nextId('cert'),
          coachProfileId: coach.id,
          status: CoachApprovalStatus.pending,
          submittedAt: db.now(),
        );
    row
      ..status = CoachApprovalStatus.pending
      ..submittedAt = db.now()
      ..fileName = file.name
      ..fileSizeBytes = file.sizeBytes
      ..rejectReason = null;
    if (existing == null) db.certifications.add(row);
    db.notifyManagers('Hồ sơ HLV mới', '${u.fullName} vừa nộp CV chờ duyệt.', metadata: {'coachProfileId': coach.id});
    return db.toCertification(coach.id)!;
  });
}
