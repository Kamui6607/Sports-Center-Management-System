import '../core/network/api_client.dart';
import '../core/network/json.dart';
import '../features/auth/domain/entities/app_user.dart';
import '../features/auth/domain/entities/auth_models.dart';

/// Ánh xạ JSON user của BE (`GET /auth/me`, `POST /auth/register`...) ⇒ entity.
abstract final class AuthJson {
  static AppUser user(Json j) {
    final member = j.objOrNull('memberProfile');
    final coach = j.objOrNull('coachProfile');
    return AppUser(
      id: j.str('id'),
      email: j.str('email'),
      fullName: j.str('fullName'),
      role: j.enumOr('role', UserRole.values, UserRole.member),
      isActive: j.boolean('isActive', true),
      phone: j.strOrNull('phone'),
      gender: j.enumOrNull('gender', Gender.values),
      dateOfBirth: j.dateOrNull('dateOfBirth'),
      avatarUrl: ApiClient.absoluteUrl(j.strOrNull('avatarUrl')),
      memberProfile: member == null
          ? null
          : MemberProfile(
              id: member.str('id'),
              fitnessGoal: member.strOrNull('fitnessGoal'),
              trainingLevel: member.enumOrNull('trainingLevel', TrainingLevel.values),
              trainingPreference: member.strOrNull('trainingPreference'),
            ),
      coachProfile: coach == null
          ? null
          : CoachProfile(
              id: coach.str('id'),
              specialization: coach.strOrNull('specialization'),
              experienceYears: coach.intOrNull('experienceYears'),
              bio: coach.strOrNull('bio'),
            ),
    );
  }

  /// Hồ sơ CV nằm ở `coachProfile.certification` (null = chưa nộp).
  static Certification? certification(Json user) {
    final cert = user.objOrNull('coachProfile')?.objOrNull('certification');
    if (cert == null) return null;
    return certificationOf(cert);
  }

  static Certification certificationOf(Json cert) {
    final fileUrl = cert.strOrNull('fileUrl');
    return Certification(
      id: cert.str('id'),
      status: cert.enumOr('status', CoachApprovalStatus.values, CoachApprovalStatus.pending),
      submittedAt: cert.date('submittedAt'),
      fileUrl: ApiClient.absoluteUrl(fileUrl),
      fileName: fileUrl?.split('/').last,
      rejectReason: cert.strOrNull('rejectReason'),
    );
  }

  static AuthSession session(Json user) => AuthSession(user: AuthJson.user(user), certification: certification(user));

  /// Ngày (không giờ) gửi lên BE: `yyyy-MM-dd`.
  static String? dateOnly(DateTime? d) => d == null
      ? null
      : '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
