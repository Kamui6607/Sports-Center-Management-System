// Bảng người dùng: User, MemberProfile, CoachProfile, Certification.
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import '../../features/auth/domain/entities/app_user.dart';
import '../../features/auth/domain/entities/auth_models.dart';

class UserRow {
  UserRow({
    required this.id,
    required this.email,
    required this.password,
    required this.fullName,
    required this.role,
    this.phone,
    this.gender,
    this.dateOfBirth,
    this.avatarUrl,
    this.isActive = true,
  });

  final String id;
  final String email;
  String password;
  String fullName;
  final UserRole role;
  String? phone;
  Gender? gender;
  DateTime? dateOfBirth;
  String? avatarUrl;
  bool isActive;
  bool online = false;
}

class MemberProfileRow {
  MemberProfileRow({
    required this.id,
    required this.userId,
    this.fitnessGoal,
    this.trainingLevel,
    this.trainingPreference,
  });

  final String id;
  final String userId;
  String? fitnessGoal;
  TrainingLevel? trainingLevel;
  String? trainingPreference;
}

class CoachProfileRow {
  CoachProfileRow({required this.id, required this.userId, this.specialization, this.experienceYears, this.bio});

  final String id;
  final String userId;
  String? specialization;
  int? experienceYears;
  String? bio;
}

class CertificationRow {
  CertificationRow({
    required this.id,
    required this.coachProfileId,
    required this.status,
    required this.submittedAt,
    this.fileName,
    this.fileSizeBytes,
    this.rejectReason,
  });

  final String id;
  final String coachProfileId;
  CoachApprovalStatus status;
  DateTime submittedAt;
  String? fileName;
  int? fileSizeBytes;
  String? rejectReason;
}
