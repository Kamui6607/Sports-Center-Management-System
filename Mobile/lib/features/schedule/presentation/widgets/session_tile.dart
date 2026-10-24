import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/session.dart';
import '../session_labels.dart';

/// Thẻ một buổi học trong danh sách lịch (Member & Coach).
class SessionTile extends StatelessWidget {
  const SessionTile({
    super.key,
    required this.session,
    required this.onTap,
    this.subtitle,
    this.trailingTag,
    this.showDate = false,
    this.showRoster = false,
  });

  final ClassSession session;
  final VoidCallback onTap;
  final String? subtitle;

  /// Tag bổ sung (VD trạng thái điểm danh của tôi).
  final StatusLabel? trailingTag;
  final bool showDate;
  final bool showRoster;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final now = DateTime.now();
    final status = sessionStatus(session, now);
    final cancelled = session.status == ScheduleStatus.cancelled;
    final accent = context.tones.of(status.tone).foreground;
    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      semanticLabel:
          '${session.className}, ${VnTime.sessionLabel(session.startTime, session.endTime)}, ${status.label}',
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: AppSpacing.xxs, color: accent),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: SizedBox(
                width: AppSpacing.xxl + AppSpacing.xs,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      VnTime.time(session.startTime),
                      style: context.text.bodyStrong.copyWith(
                        fontFeatures: kTabularFigures,
                        decoration: cancelled ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    Text(
                      VnTime.time(session.endTime),
                      style: context.text.caption.copyWith(color: c.textMuted, fontFeatures: kTabularFigures),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (showDate)
                      Text(
                        VnTime.dayLabel(session.startTime),
                        style: context.text.caption.copyWith(color: c.textMuted),
                      ),
                    Text(
                      session.className,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodyStrong,
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    InfoRow(
                      icon: showRoster ? AppIcons.users : AppIcons.location,
                      text: showRoster
                          ? '${session.bookedCount}/${session.capacity} học viên · ${session.room.name}'
                          : (subtitle ?? '${session.room.name} · HLV ${session.coachName}'),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Wrap(
                      spacing: AppSpacing.xxs,
                      runSpacing: AppSpacing.xxs,
                      children: [
                        status.tag(dense: true),
                        if (session.isMakeup) const StatusLabel('Buổi dạy bù', StatusTone.brand).tag(dense: true),
                        ?trailingTag?.tag(dense: true),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
