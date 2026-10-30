import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/attendance.dart';

extension CourseSessionMarkLabel on CourseSessionMark {
  StatusLabel get status => switch (this) {
    CourseSessionMark.present => const StatusLabel('Có mặt', StatusTone.success),
    CourseSessionMark.late => const StatusLabel('Đi trễ', StatusTone.warning),
    CourseSessionMark.absent => const StatusLabel('Vắng mặt', StatusTone.danger),
    CourseSessionMark.excused => const StatusLabel('Vắng có phép', StatusTone.info),
    CourseSessionMark.notMarked => const StatusLabel('Chưa điểm danh', StatusTone.neutral),
    CourseSessionMark.upcoming => const StatusLabel('Sắp tới', StatusTone.brand),
    CourseSessionMark.cancelled => const StatusLabel('Buổi bị hủy', StatusTone.neutral),
  };
}

enum _Filter { all, attended, absent, upcoming }

/// Chuyên cần RIÊNG của một khóa: tỷ lệ, số buổi có mặt / vắng / sắp tới và danh sách từng buổi (lọc được).
/// Dùng chung cho Member (khóa của tôi) và HLV (hồ sơ học viên).
class CourseAttendanceView extends StatefulWidget {
  const CourseAttendanceView({super.key, required this.attendance, this.onSessionTap});

  final CourseAttendance attendance;
  final ValueChanged<CourseAttendanceSession>? onSessionTap;

  @override
  State<CourseAttendanceView> createState() => _CourseAttendanceViewState();
}

class _CourseAttendanceViewState extends State<CourseAttendanceView> {
  _Filter _filter = _Filter.all;

  bool _match(CourseAttendanceSession s) => switch (_filter) {
    _Filter.all => true,
    _Filter.attended => s.mark == CourseSessionMark.present || s.mark == CourseSessionMark.late,
    _Filter.absent =>
      s.mark == CourseSessionMark.absent ||
          s.mark == CourseSessionMark.excused ||
          s.mark == CourseSessionMark.notMarked,
    _Filter.upcoming => s.mark == CourseSessionMark.upcoming,
  };

  @override
  Widget build(BuildContext context) {
    final a = widget.attendance;
    final c = context.colors;
    final warn = a.isWarning;
    final ringTone = context.tones.of(warn ? StatusTone.danger : StatusTone.success);
    // Buổi đã qua: mới nhất trước; buổi sắp tới: gần nhất trước.
    final list = a.sessions.where(_match).toList()
      ..sort((x, y) {
        final xu = x.mark == CourseSessionMark.upcoming;
        final yu = y.mark == CourseSessionMark.upcoming;
        if (xu != yu) return xu ? 1 : -1;
        return xu ? x.startTime.compareTo(y.startTime) : y.startTime.compareTo(x.startTime);
      });
    Widget count(String label, int v, StatusTone t) => Expanded(
      child: Column(
        children: [
          Text('$v', style: context.text.titleSmall.copyWith(color: context.tones.of(t).foreground)),
          Text(
            label,
            textAlign: TextAlign.center,
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          borderColor: warn ? context.tones.of(StatusTone.danger).border : null,
          child: Column(
            children: [
              Row(
                children: [
                  ProgressRing(ratio: a.rate, color: ringTone.foreground),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Tham gia ${a.attended}/${a.counted} buổi đã qua', style: context.text.bodyStrong),
                        Text(
                          '${a.sessions.length} buổi của khóa · ${a.upcoming} buổi sắp tới',
                          style: context.text.caption.copyWith(color: c.textMuted),
                        ),
                        if (warn) ...[
                          const SizedBox(height: AppSpacing.xxs),
                          const StatusLabel('Dưới 80% — cảnh báo', StatusTone.danger).tag(dense: true),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const Divider(height: AppSpacing.lg),
              Row(
                children: [
                  count('Có mặt', a.present, StatusTone.success),
                  count('Đi trễ', a.late, StatusTone.warning),
                  count('Vắng', a.absent + a.notMarked, StatusTone.danger),
                  count('Có phép', a.excused, StatusTone.info),
                  count('Sắp tới', a.upcoming, StatusTone.brand),
                ],
              ),
              if (a.notMarked > 0) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Trong đó ${a.notMarked} buổi đã qua chưa được điểm danh (tính là vắng).',
                  style: context.text.caption.copyWith(color: c.textMuted),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        SegmentedTabs<_Filter>(
          padding: EdgeInsets.zero,
          selected: _filter,
          onChanged: (f) => setState(() => _filter = f),
          options: [
            SegmentOption(_Filter.all, 'Tất cả', count: a.sessions.length),
            SegmentOption(_Filter.attended, 'Có mặt', count: a.attended),
            SegmentOption(_Filter.absent, 'Nghỉ', count: a.absent + a.notMarked + a.excused),
            SegmentOption(_Filter.upcoming, 'Sắp tới', count: a.upcoming),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        if (list.isEmpty)
          const EmptyState(compact: true, icon: AppIcons.attendance, title: 'Không có buổi nào')
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
            child: Column(
              children: [
                for (final (i, s) in list.indexed) ...[
                  if (i > 0) const Divider(),
                  InkWell(
                    onTap: widget.onSessionTap == null ? null : () => widget.onSessionTap!(s),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(VnTime.sessionLabel(s.startTime, s.endTime), style: context.text.small),
                                if (s.roomName != null || s.isMakeup || s.note != null)
                                  Text(
                                    [
                                      if (s.roomName != null) s.roomName!,
                                      if (s.isMakeup) 'Buổi dạy bù',
                                      ?s.note,
                                    ].join(' · '),
                                    style: context.text.caption.copyWith(color: c.textMuted),
                                  ),
                              ],
                            ),
                          ),
                          s.mark.status.tag(dense: true),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}
