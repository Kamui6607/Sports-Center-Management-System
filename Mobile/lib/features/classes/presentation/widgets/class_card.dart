import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';

/// Thẻ khóa học (danh sách khám phá) — thay bảng/lưới của web.
class ClassCard extends StatelessWidget {
  const ClassCard({super.key, required this.course, required this.onTap, this.showStatus = false, this.trailing});

  final CourseClass course;
  final VoidCallback onTap;
  final bool showStatus;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final remaining = course.minRemainingSlots;
    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      semanticLabel: 'Khóa ${course.name}, ${course.sportNames}, giá ${course.price} đồng',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: AppSpacing.xxl * 2 + AppSpacing.md,
            child: Stack(
              fit: StackFit.expand,
              children: [
                AppNetworkImage(
                  url: null,
                  seed: course.id,
                  placeholderIcon: sportIcon(course.sports),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.card)),
                ),
                Positioned(
                  left: AppSpacing.sm,
                  top: AppSpacing.sm,
                  child: Wrap(
                    spacing: AppSpacing.xxs,
                    children: [course.classType.tag.tag(), if (showStatus) course.status.status.tag()],
                  ),
                ),
                if (remaining != null && remaining <= 3)
                  Positioned(
                    right: AppSpacing.sm,
                    top: AppSpacing.sm,
                    child:
                        (remaining == 0
                                ? const StatusLabel('Hết chỗ', StatusTone.danger)
                                : StatusLabel('Còn $remaining chỗ', StatusTone.warning))
                            .tag(),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  course.sportNames.toUpperCase(),
                  style: context.text.caption.copyWith(color: c.accentStrong, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(course.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: [
                    AppAvatar(
                      name: course.coach.fullName,
                      imageUrl: course.coach.avatarUrl,
                      size: AppSizes.avatarSm - AppSpacing.xs,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        course.coach.fullName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.small,
                      ),
                    ),
                    if (course.coach.ratingCount > 0)
                      RatingStars(rating: course.coach.ratingAverage, size: AppSizes.iconSm - 4),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                InfoRow(
                  icon: AppIcons.calendar,
                  text: course.nextSessionStart == null
                      ? '${course.mainSessionCount} buổi · Không còn buổi sắp tới'
                      : '${course.mainSessionCount} buổi · Buổi tới ${VnTime.dayLabel(course.nextSessionStart!)}',
                ),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: [
                    Expanded(
                      child: MoneyText(course.price, style: context.text.titleSmall.copyWith(color: c.primary)),
                    ),
                    ?trailing,
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ HLV phụ trách.
class CoachMiniCard extends StatelessWidget {
  const CoachMiniCard({super.key, required this.coach, this.onChat});

  final CoachSummary coach;
  final VoidCallback? onChat;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Row(
      children: [
        AppAvatar(name: coach.fullName, imageUrl: coach.avatarUrl, size: AppSizes.avatar + AppSpacing.xs),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(coach.fullName, style: context.text.bodyStrong),
              Text(
                [
                  coach.specialization,
                  if (coach.experienceYears != null) '${coach.experienceYears} năm kinh nghiệm',
                ].whereType<String>().join(' · '),
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
              const SizedBox(height: AppSpacing.xxs),
              if (coach.ratingCount > 0)
                RatingStars(rating: coach.ratingAverage, count: coach.ratingCount)
              else
                Text('Chưa có đánh giá', style: context.text.caption.copyWith(color: context.colors.textMuted)),
            ],
          ),
        ),
        if (onChat != null)
          AppIconButton(icon: AppIcons.chat, tooltip: 'Nhắn tin cho HLV', onPressed: onChat, filled: true),
      ],
    ),
  );
}
