// Luật BE giả khi học viên báo vắng (`POST/DELETE /enrollments/:id/absence`) — CHỈ dùng trong mock.

import '../../../core/error/app_failure.dart';
import '../../../core/utils/vn_time.dart';
import '../../../mock/mock_server.dart';
import '../../../mock/mock_tables.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../../makeup/data/makeup_mock_repository.dart';
import '../../notifications/domain/entities/app_notification.dart';
import '../domain/entities/session.dart';

/// BE `ATTENDANCE.MEMBER_ABSENCE_NOTE_PREFIX`.
const kMemberAbsenceNotePrefix = 'Học viên báo vắng: ';

/// Lý do nếu [a] là báo vắng do học viên tự tạo.
String? memberAbsenceReason(AttendanceRow? a) =>
    a != null && a.status == AttendanceStatus.excused && (a.note ?? '').startsWith(kMemberAbsenceNotePrefix)
    ? a.note!.substring(kMemberAbsenceNotePrefix.length)
    : null;

/// Số lần báo vắng còn hiệu lực của học viên trong một khóa.
int memberAbsencesUsed(MockDatabase db, String memberProfileId, String classId) => db.attendance
    .where(
      (a) =>
          a.memberProfileId == memberProfileId &&
          memberAbsenceReason(a) != null &&
          db.session(a.sessionId).classId == classId,
    )
    .length;

int memberAbsencesLeft(MockDatabase db, String memberProfileId, String classId) =>
    (kMaxAbsencesPerCourse - memberAbsencesUsed(db, memberProfileId, classId)).clamp(0, kMaxAbsencesPerCourse);

/// Báo vắng: trước giờ học, chưa có điểm danh, tối đa [kMaxAbsencesPerCourse] lần/khóa; HLV nhận thông báo.
void reportMemberAbsence(MockDatabase db, EnrollmentRow e, String reason, {bool requestMakeup = false}) {
  final s = db.session(e.sessionId);
  if (e.status != EnrollmentStatus.booked) throw const AppFailure.business('Chỉ báo vắng được buổi đang giữ chỗ.');
  if (s.status != ScheduleStatus.scheduled || !db.now().isBefore(s.start)) {
    throw const AppFailure.business('Chỉ báo vắng được trước giờ học.', code: 'ABSENCE_TOO_LATE');
  }
  final text = reason.trim();
  if (text.length < 5) throw const AppFailure.validation('Lý do báo vắng tối thiểu 5 ký tự.');
  final existing = db.attendance
      .where((a) => a.sessionId == s.id && a.memberProfileId == e.memberProfileId)
      .firstOrNull;
  if (existing != null) {
    throw memberAbsenceReason(existing) != null
        ? const AppFailure.conflict('Bạn đã báo vắng buổi này.', code: 'ABSENCE_ALREADY_REPORTED')
        : const AppFailure.conflict('Buổi này đã được điểm danh.', code: 'ATTENDANCE_ALREADY_RECORDED');
  }
  if (memberAbsencesUsed(db, e.memberProfileId, s.classId) >= kMaxAbsencesPerCourse) {
    throw const AppFailure.business('Bạn đã báo vắng $kMaxAbsencesPerCourse lần cho khóa này.', code: 'ABSENCE_LIMIT');
  }
  db.attendance.add(
    AttendanceRow(
      id: db.nextId('att'),
      sessionId: s.id,
      memberProfileId: e.memberProfileId,
      status: AttendanceStatus.excused,
      note: '$kMemberAbsenceNotePrefix$text',
    ),
  );
  if (requestMakeup) {
    createMockMakeupRequest(db, e, text);
    return;
  }
  final cls = db.classRow(s.classId);
  final member = db.user(db.memberProfile(e.memberProfileId).userId);
  db.notify(
    db.userOfCoach(cls.coachProfileId).id,
    NotificationType.memberAbsence,
    'Học viên báo vắng: ${cls.name}',
    '${member.fullName} báo vắng buổi ${VnTime.sessionLabel(s.start, s.end)}. Lý do: $text',
    metadata: {'kind': 'MEMBER_ABSENCE', 'scheduleId': s.id, 'classId': s.classId},
  );
}

/// Hủy báo vắng trước giờ học.
void cancelMemberAbsence(MockDatabase db, EnrollmentRow e) {
  final s = db.session(e.sessionId);
  if (!db.now().isBefore(s.start)) {
    throw const AppFailure.business('Buổi học đã bắt đầu — không hủy báo vắng được nữa.');
  }
  final before = db.attendance.length;
  releaseMockMakeup(db, e.memberProfileId, s.id);
  clearMemberAbsence(db, e.memberProfileId, s.id);
  if (db.attendance.length == before) throw const AppFailure.notFound('Bạn chưa báo vắng buổi này.');
}

/// Chỗ không còn ở buổi này (hủy / đổi buổi) ⇒ xóa báo vắng.
void clearMemberAbsence(MockDatabase db, String memberProfileId, String sessionId) => db.attendance.removeWhere(
  (a) => a.sessionId == sessionId && a.memberProfileId == memberProfileId && memberAbsenceReason(a) != null,
);

/// Như BE `transferEmptyReason`.
TransferEmptyReason? transferEmptyReasonOf(String? blockReason, List<TransferOption> targets) {
  if (blockReason != null) return TransferEmptyReason.notAvailable;
  if (targets.isEmpty) return TransferEmptyReason.noMakeupOrEquivalent;
  if (targets.any((t) => t.blockReason == null)) return null;
  if (targets.every((t) => t.blockReason == 'Hết chỗ')) return TransferEmptyReason.allFull;
  if (targets.every((t) => (t.blockReason ?? '').startsWith('Trùng giờ'))) return TransferEmptyReason.allConflict;
  return TransferEmptyReason.allUnavailable;
}
