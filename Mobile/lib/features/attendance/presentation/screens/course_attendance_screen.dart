import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../classes/presentation/providers/course_providers.dart';
import '../../../schedule/domain/entities/session.dart';
import '../../../schedule/presentation/providers/schedule_providers.dart';
import '../../domain/entities/attendance.dart';
import '../providers/attendance_providers.dart';
import '../widgets/course_attendance_view.dart';

/// Chuyên cần RIÊNG của một khóa đã mua: buổi có mặt / vắng / sắp tới (không lẫn khóa khác).
class CourseAttendanceScreen extends ConsumerWidget {
  const CourseAttendanceScreen({super.key, required this.classId});

  final String classId;

  /// Buổi của hội viên trong khóa ⇒ bảng chuyên cần (đã qua: kết quả điểm danh; chưa qua: sắp tới).
  static CourseAttendance fromSessions(List<MySession> sessions, DateTime now) => CourseAttendance([
    for (final s in sessions)
      CourseAttendanceSession(
        scheduleId: s.session.id,
        startTime: s.session.startTime,
        endTime: s.session.endTime,
        roomName: s.session.room.name,
        isMakeup: s.session.isMakeup,
        mark: s.session.status == ScheduleStatus.cancelled
            ? CourseSessionMark.cancelled
            : !s.session.hasEnded(now)
            ? CourseSessionMark.upcoming
            : switch (s.attendance) {
                AttendanceStatus.present => CourseSessionMark.present,
                AttendanceStatus.late => CourseSessionMark.late,
                AttendanceStatus.absent => CourseSessionMark.absent,
                AttendanceStatus.excused => CourseSessionMark.excused,
                null => CourseSessionMark.notMarked,
              },
      ),
  ]);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(myAllSessionsProvider);
    final course = ref.watch(myCoursesProvider).value?.where((c) => c.course.id == classId).firstOrNull;
    return AppScaffold(
      title: 'Chuyên cần khóa học',
      body: AsyncValueView(
        value: sessions,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(myAllSessionsProvider),
        data: (all) {
          final mine = all.where((s) => s.session.classId == classId).toList();
          final attendance = fromSessions(mine, DateTime.now());
          return RefreshableScroll(
            onRefresh: () async {
              ref.invalidate(myPenaltiesProvider);
              ref.invalidate(myAllSessionsProvider);
              await ref.read(myAllSessionsProvider.future);
            },
            children: [
              if (course != null) ...[
                Text(course.course.name, style: context.text.headline),
                Text(
                  'HLV ${course.course.coach.fullName}',
                  style: context.text.caption.copyWith(color: context.colors.textMuted),
                ),
                const SizedBox(height: AppSpacing.md),
              ],

              if (mine.isEmpty)
                const EmptyState(
                  compact: true,
                  icon: AppIcons.attendance,
                  title: 'Chưa có buổi nào',
                  message: 'Khóa chưa có buổi bạn giữ chỗ.',
                )
              else
                CourseAttendanceView(
                  attendance: attendance,
                  onSessionTap: (s) => context.push(AppRoutes.mySession(s.scheduleId)),
                ),
              const SizedBox(height: AppSpacing.md),
              const AlertBanner.info(
                message:
                    'Có mặt hoặc đi trễ được tính là tham gia; vắng có phép không tính vào tỷ lệ. '
                    'Cảnh báo xét trên ${ClassAttendanceStat.sampleWindow} buổi đã qua gần nhất, từ ${ClassAttendanceStat.minSample} buổi trở lên: dưới 80% sẽ bị cảnh báo.',
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          );
        },
      ),
    );
  }
}
