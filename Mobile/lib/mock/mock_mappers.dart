import '../features/auth/domain/entities/app_user.dart';
import '../features/auth/domain/entities/auth_models.dart';
import '../features/classes/domain/entities/course.dart';
import '../features/payments/domain/entities/payment.dart';
import '../features/schedule/domain/entities/session.dart';
import '../features/training/domain/entities/training.dart';
import 'mock_database.dart';
import 'mock_tables.dart';

/// Ánh xạ bản ghi mock ⇒ entity của domain (vai trò serializer của BE giả).
extension MockEntityMappers on MockDatabase {
  AppUser toUser(UserRow u) {
    final m = memberOfUser(u.id);
    final c = coachOfUser(u.id);
    return AppUser(
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      gender: u.gender,
      dateOfBirth: u.dateOfBirth,
      avatarUrl: u.avatarUrl,
      role: u.role,
      isActive: u.isActive,
      memberProfile: m == null
          ? null
          : MemberProfile(
              id: m.id,
              fitnessGoal: m.fitnessGoal,
              trainingLevel: m.trainingLevel,
              trainingPreference: m.trainingPreference,
            ),
      coachProfile: c == null
          ? null
          : CoachProfile(id: c.id, specialization: c.specialization, experienceYears: c.experienceYears, bio: c.bio),
    );
  }

  Certification? toCertification(String coachProfileId) {
    final r = certifications.where((c) => c.coachProfileId == coachProfileId).firstOrNull;
    if (r == null) return null;
    return Certification(
      id: r.id,
      status: r.status,
      submittedAt: r.submittedAt,
      fileName: r.fileName,
      fileSizeBytes: r.fileSizeBytes,
      fileUrl: r.fileName == null ? null : '/uploads/cv/${r.fileName}',
      rejectReason: r.rejectReason,
    );
  }

  CoachSummary toCoachSummary(String coachProfileId) {
    final cp = coachProfile(coachProfileId);
    final u = user(cp.userId);
    final rating = coachRating(coachProfileId);
    return CoachSummary(
      coachProfileId: cp.id,
      userId: u.id,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      specialization: cp.specialization,
      experienceYears: cp.experienceYears,
      ratingAverage: rating.average,
      ratingCount: rating.count,
    );
  }

  CourseClass toCourse(ClassRow c) {
    final t = now();
    final all = sessionsOf(c.id);
    final main = all.where((s) => s.makeupForId == null).toList();
    final upcoming = all.where((s) => s.status == ScheduleStatus.scheduled && s.start.isAfter(t)).toList();
    final active = all.where((s) => s.status != ScheduleStatus.cancelled).toList();
    final students = studentsOf(c.id);
    final gross = payments
        .where((p) => p.classId == c.id && p.status == PaymentStatus.success)
        .fold(0, (s, p) => s + p.amount);
    return CourseClass(
      id: c.id,
      name: c.name,
      description: c.description,
      sports: [for (final id in c.sportIds) sport(id)],
      price: c.price,
      status: c.status,
      classType: c.classType,
      areaType: c.areaType,
      capacity: c.capacity,
      coach: toCoachSummary(c.coachProfileId),
      mainSessionCount: main.length,
      completedSessionCount: all.where((s) => s.status == ScheduleStatus.completed).length,
      upcomingSessionCount: upcoming.length,
      createdAt: c.createdAt,
      firstSessionStart: active.isEmpty ? null : active.first.start,
      lastSessionEnd: active.isEmpty ? null : active.last.end,
      nextSessionStart: upcoming.isEmpty ? null : upcoming.first.start,
      studentCount: students.length,
      minRemainingSlots: upcoming.isEmpty
          ? null
          : upcoming.map((s) => c.capacity - bookedCount(s.id)).reduce((a, b) => a < b ? a : b).clamp(0, c.capacity),
      rejectReason: c.rejectReason,
      coachRevenue: (gross * MockDatabase.coachShare).round(),
    );
  }

  ClassSession toSession(SessionRow s) {
    final c = classRow(s.classId);
    final coachUser = userOfCoach(c.coachProfileId);
    final makeup = sessions.where((x) => x.makeupForId == s.id).firstOrNull;
    return ClassSession(
      id: s.id,
      classId: c.id,
      className: c.name,
      coachName: coachUser.fullName,
      coachUserId: coachUser.id,
      room: room(s.roomId),
      startTime: s.start,
      endTime: s.end,
      status: s.status,
      bookedCount: bookedCount(s.id),
      capacity: c.capacity,
      makeupForId: s.makeupForId,
      makeupSessionId: makeup?.id,
      cancelReason: s.cancelReason,
      cancelResolution: s.resolution,
    );
  }

  /// Lộ trình tập + kết quả (mới nhất trước).
  TrainingPlan toTrainingPlan(TrainingPlanRow p) => TrainingPlan(
    id: p.id,
    name: p.name,
    description: p.description,
    startDate: p.startDate,
    endDate: p.endDate,
    coachProfileId: p.coachProfileId,
    coachName: userOfCoach(p.coachProfileId).fullName,
    memberProfileId: p.memberProfileId,
    memberName: userOfMember(p.memberProfileId).fullName,
    results:
        trainingResults
            .where((r) => r.planId == p.id)
            .map((r) => TrainingResult(id: r.id, date: r.date, metrics: r.metrics, coachNote: r.coachNote))
            .toList()
          ..sort((a, b) => b.date.compareTo(a.date)),
  );
}
