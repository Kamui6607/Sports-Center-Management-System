import 'app_user.dart';

/// Trạng thái xét duyệt hồ sơ HLV (`CoachApprovalStatus`).
enum CoachApprovalStatus { pending, approved, rejected }

/// Hồ sơ chứng nhận / CV của HLV (`Certification`).
class Certification {
  const Certification({
    required this.id,
    required this.status,
    required this.submittedAt,
    this.fileName,
    this.fileSizeBytes,
    this.fileUrl,
    this.rejectReason,
  });

  final String id;
  final CoachApprovalStatus status;
  final DateTime submittedAt;
  final String? fileName;
  final int? fileSizeBytes;
  final String? fileUrl;
  final String? rejectReason;

  bool get hasFile => fileName != null || fileUrl != null;
}

/// Phiên đăng nhập. Với Coach chưa duyệt, [certification] quyết định màn
/// onboarding (nộp CV / chờ duyệt / bị từ chối).
class AuthSession {
  const AuthSession({required this.user, this.certification});

  final AppUser user;
  final Certification? certification;

  bool get isPendingCoach => user.role == UserRole.coach && !user.isActive;

  AuthSession copyWith({AppUser? user, Certification? certification}) =>
      AuthSession(user: user ?? this.user, certification: certification ?? this.certification);
}

class RegisterInput {
  const RegisterInput({
    required this.fullName,
    required this.email,
    required this.password,
    required this.role,
    this.phone,
    this.gender,
    this.dateOfBirth,
  });

  final String fullName;
  final String email;
  final String password;
  final UserRole role;
  final String? phone;
  final Gender? gender;
  final DateTime? dateOfBirth;
}

/// Dữ liệu sửa hồ sơ (`PATCH /auth/me`, `PATCH /coaches/:id`).
class ProfileUpdate {
  const ProfileUpdate({
    required this.fullName,
    this.phone,
    this.gender,
    this.dateOfBirth,
    this.fitnessGoal,
    this.trainingLevel,
    this.trainingPreference,
    this.specialization,
    this.experienceYears,
    this.bio,
  });

  final String fullName;
  final String? phone;
  final Gender? gender;
  final DateTime? dateOfBirth;
  final String? fitnessGoal;
  final TrainingLevel? trainingLevel;
  final String? trainingPreference;
  final String? specialization;
  final int? experienceYears;
  final String? bio;
}
