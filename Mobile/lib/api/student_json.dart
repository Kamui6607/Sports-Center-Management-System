import '../core/network/api_client.dart';
import '../core/network/json.dart';
import '../features/auth/domain/entities/app_user.dart';
import '../features/classes/domain/entities/coach_class.dart';

/// Ánh xạ học viên (góc nhìn HLV) — `GET /classes/:id/students`, `GET /coaches/me/students/:id`.
abstract final class StudentJson {
  /// [m]: MemberProfile kèm `user` (+ `attendedCount`, `pastSessionCount` nếu có).
  static StudentSummary student(Json m, {int? attendedCount, int? pastSessionCount}) {
    final user = m.obj('user');
    return StudentSummary(
      memberProfileId: m.str('id'),
      userId: m.str('userId', user.str('id')),
      fullName: user.str('fullName', 'Học viên'),
      avatarUrl: ApiClient.absoluteUrl(user.strOrNull('avatarUrl')),
      email: user.strOrNull('email'),
      phone: user.strOrNull('phone'),
      trainingLevel: m.enumOrNull('trainingLevel', TrainingLevel.values),
      fitnessGoal: m.strOrNull('fitnessGoal'),
      trainingPreference: m.strOrNull('trainingPreference'),
      attendedCount: attendedCount ?? m.integer('attendedCount'),
      pastSessionCount: pastSessionCount ?? m.integer('pastSessionCount'),
    );
  }
}
