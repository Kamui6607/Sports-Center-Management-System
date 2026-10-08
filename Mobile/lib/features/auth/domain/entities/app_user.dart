/// Vai trò người dùng — tương ứng bảng `Role` của BE (MEMBER, COACH, MANAGER).
enum UserRole { member, coach, manager }

enum Gender { male, female, other }

enum TrainingLevel { beginner, intermediate, advanced }

/// Hồ sơ học viên (`MemberProfile`).
class MemberProfile {
  const MemberProfile({required this.id, this.fitnessGoal, this.trainingLevel, this.trainingPreference});

  final String id;
  final String? fitnessGoal;
  final TrainingLevel? trainingLevel;
  final String? trainingPreference;

  MemberProfile copyWith({String? fitnessGoal, TrainingLevel? trainingLevel, String? trainingPreference}) =>
      MemberProfile(
        id: id,
        fitnessGoal: fitnessGoal ?? this.fitnessGoal,
        trainingLevel: trainingLevel ?? this.trainingLevel,
        trainingPreference: trainingPreference ?? this.trainingPreference,
      );
}

/// Hồ sơ huấn luyện viên (`CoachProfile`).
class CoachProfile {
  const CoachProfile({required this.id, this.specialization, this.experienceYears, this.bio});

  final String id;
  final String? specialization;
  final int? experienceYears;
  final String? bio;

  CoachProfile copyWith({String? specialization, int? experienceYears, String? bio}) => CoachProfile(
    id: id,
    specialization: specialization ?? this.specialization,
    experienceYears: experienceYears ?? this.experienceYears,
    bio: bio ?? this.bio,
  );
}

/// Người dùng hiện tại (`GET /auth/me`).
class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.isActive,
    this.phone,
    this.gender,
    this.dateOfBirth,
    this.avatarUrl,
    this.memberProfile,
    this.coachProfile,
  });

  final String id;
  final String email;
  final String fullName;
  final String? phone;
  final Gender? gender;
  final DateTime? dateOfBirth;
  final String? avatarUrl;
  final UserRole role;

  /// Coach chưa được duyệt CV ⇒ `false`.
  final bool isActive;
  final MemberProfile? memberProfile;
  final CoachProfile? coachProfile;

  String get firstName => fullName.trim().split(RegExp(r'\s+')).last;

  AppUser copyWith({
    String? fullName,
    String? phone,
    Gender? gender,
    DateTime? dateOfBirth,
    String? avatarUrl,
    bool? isActive,
    MemberProfile? memberProfile,
    CoachProfile? coachProfile,
  }) => AppUser(
    id: id,
    email: email,
    role: role,
    fullName: fullName ?? this.fullName,
    phone: phone ?? this.phone,
    gender: gender ?? this.gender,
    dateOfBirth: dateOfBirth ?? this.dateOfBirth,
    avatarUrl: avatarUrl ?? this.avatarUrl,
    isActive: isActive ?? this.isActive,
    memberProfile: memberProfile ?? this.memberProfile,
    coachProfile: coachProfile ?? this.coachProfile,
  );
}
