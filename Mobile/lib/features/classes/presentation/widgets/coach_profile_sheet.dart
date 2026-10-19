import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../data/course_repository_provider.dart';
import '../../domain/entities/course.dart';

/// Hồ sơ công khai HLV (`GET /coaches/:id/profile`).
final coachProfileProvider = FutureProvider.autoDispose.family<CoachPublicProfile, String>(
  (ref, coachProfileId) => ref.watch(courseRepositoryProvider).coachProfile(coachProfileId),
);

/// Mở bảng thông tin đầy đủ của HLV (bấm vào HLV ở chi tiết khóa học).
Future<void> showCoachProfileSheet(
  BuildContext context, {
  required String coachProfileId,
  required String coachName,
  String? currentClassId,
}) => showAppBottomSheet<void>(
  context: context,
  title: 'Huấn luyện viên',
  subtitle: coachName,
  expand: true,
  builder: (_) => _CoachProfileBody(coachProfileId: coachProfileId, currentClassId: currentClassId),
);

class _CoachProfileBody extends ConsumerWidget {
  const _CoachProfileBody({required this.coachProfileId, this.currentClassId});

  final String coachProfileId;
  final String? currentClassId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(coachProfileProvider(coachProfileId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator.adaptive()),
      ),
      error: (e, _) =>
          ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(coachProfileProvider(coachProfileId))),
      data: (p) => _Content(profile: p, currentClassId: currentClassId),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.profile, this.currentClassId});

  final CoachPublicProfile profile;
  final String? currentClassId;

  @override
  Widget build(BuildContext context) {
    final p = profile;
    final c = context.colors;
    final others = p.courses.where((x) => x.id != currentClassId).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            AppAvatar(name: p.fullName, imageUrl: p.avatarUrl, size: AppSizes.avatarLg + AppSpacing.md),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.fullName, style: context.text.title),
                  if (p.specialization != null)
                    Text(p.specialization!, style: context.text.small.copyWith(color: c.textMuted)),
                  const SizedBox(height: AppSpacing.xxs),
                  if (p.ratingCount > 0)
                    RatingStars(rating: p.ratingAverage ?? 0, count: p.ratingCount)
                  else
                    Text('Chưa có đánh giá', style: context.text.caption.copyWith(color: c.textMuted)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        KpiGrid(
          children: [
            KpiTile(
              icon: AppIcons.award,
              label: 'Kinh nghiệm',
              value: p.experienceYears == null ? '—' : '${p.experienceYears} năm',
            ),
            KpiTile(icon: AppIcons.users, label: 'Học viên đã dạy', value: '${p.totalStudents}'),
            KpiTile(icon: AppIcons.course, label: 'Khóa đang mở', value: '${p.openCourses}'),
            KpiTile(icon: AppIcons.attendance, label: 'Buổi đã dạy', value: '${p.completedSessions}'),
          ],
        ),
        if (p.bio?.trim().isNotEmpty ?? false) ...[
          const SizedBox(height: AppSpacing.md),
          const SectionHeader(title: 'Giới thiệu'),
          Text(p.bio!, style: context.text.body),
        ],
        if (p.joinedAt != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Tham gia nền tảng từ ${VnTime.date(p.joinedAt!)}',
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
        ],
        if (p.ratingCount > 0) ...[
          const SizedBox(height: AppSpacing.md),
          const SectionHeader(title: 'Đánh giá'),
          RatingSummary(average: p.ratingAverage ?? 0, count: p.ratingCount, distribution: p.distribution),
          for (final r in p.reviews) ...[
            const SizedBox(height: AppSpacing.sm),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(r.authorName ?? 'Học viên ẩn danh', style: context.text.label)),
                      RatingStars(rating: r.rating.toDouble()),
                    ],
                  ),
                  if (r.className != null)
                    Text('Khóa: ${r.className}', style: context.text.caption.copyWith(color: c.textMuted)),
                  if (r.comment?.trim().isNotEmpty ?? false) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(r.comment!, style: context.text.small),
                  ],
                ],
              ),
            ),
          ],
        ],
        if (others.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          const SectionHeader(title: 'Khóa học khác đang mở'),
          for (final course in others)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: AppCard(
                onTap: () {
                  Navigator.of(context).pop();
                  context.push(AppRoutes.classDetail(course.id));
                },
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(course.name, style: context.text.bodyStrong),
                          Text(
                            [
                              if (course.goalTags.isNotEmpty) course.goalTags.map(goalLabel).join(', '),
                              if (course.startDate != null) 'Khai giảng ${VnTime.dateShort(course.startDate!)}',
                            ].join(' · '),
                            style: context.text.caption.copyWith(color: c.textMuted),
                          ),
                        ],
                      ),
                    ),
                    MoneyText(course.price, style: context.text.label.copyWith(color: c.primary)),
                  ],
                ),
              ),
            ),
        ],
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}
