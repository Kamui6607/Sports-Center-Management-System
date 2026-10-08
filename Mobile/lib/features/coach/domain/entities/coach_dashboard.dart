import '../../../classes/domain/entities/coach_class.dart';
import '../../../schedule/domain/entities/session.dart';
import '../../../training/domain/entities/training.dart';

/// Loại việc cần làm của HLV.
enum CoachTodoKind { completeSession, classRejected, classPending, refundHold }

class CoachTodo {
  const CoachTodo({required this.kind, required this.title, required this.subtitle, required this.targetId});

  final CoachTodoKind kind;
  final String title;
  final String subtitle;

  /// ID buổi / khóa liên quan để điều hướng.
  final String targetId;
}

/// Tổng quan HLV.
class CoachDashboard {
  const CoachDashboard({
    required this.todaySessions,
    required this.weekSessionCount,
    required this.weekCompletedCount,
    required this.studentCount,
    required this.availableBalance,
    required this.ratingAverage,
    required this.ratingCount,
    required this.todos,
    this.nextSession,
  });

  final List<ClassSession> todaySessions;
  final ClassSession? nextSession;
  final int weekSessionCount;
  final int weekCompletedCount;
  final int studentCount;
  final int availableBalance;
  final double ratingAverage;
  final int ratingCount;
  final List<CoachTodo> todos;
}

/// Hồ sơ học viên ở góc nhìn HLV.
class StudentProfile {
  const StudentProfile({required this.student, required this.classes, required this.plans});

  final StudentSummary student;

  /// Các khóa của HLV mà học viên đang/đã học.
  final List<StudentClassStat> classes;
  final List<TrainingPlan> plans;
}

class StudentClassStat {
  const StudentClassStat({
    required this.classId,
    required this.className,
    required this.attended,
    required this.pastSessions,
  });

  final String classId;
  final String className;
  final int attended;
  final int pastSessions;
}
