import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/domain/entities/auth_models.dart';
import '../../auth/presentation/auth_labels.dart';
import '../../classes/domain/entities/course.dart';
import '../../classes/presentation/screens/coach_class_detail_screen.dart';
import '../../schedule/presentation/session_labels.dart';
import '../data/manager_repository_provider.dart';
import 'manager_providers.dart';
import 'review_action_bar.dart';

/// R02 — Duyệt hồ sơ CV HLV.
class CvReviewScreen extends ConsumerWidget {
  const CvReviewScreen({super.key, required this.coachProfileId});

  final String coachProfileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(cvProvider(coachProfileId));
    final cv = value.value;
    final repo = ref.read(managerRepositoryProvider);
    return AppScaffold(
      title: 'Hồ sơ HLV',
      bottomBar: cv == null || cv.certification.status != CoachApprovalStatus.pending
          ? null
          : ReviewActionBar(
              approveLabel: 'Duyệt hồ sơ',
              approveMessage: 'Tài khoản của ${cv.fullName} sẽ được kích hoạt và có thể mở khóa học.',
              onApprove: (_) =>
                  runReview(context, ref, () => repo.reviewCv(coachProfileId, approve: true), 'Đã duyệt hồ sơ.'),
              onReject: (reason) => runReview(
                context,
                ref,
                () => repo.reviewCv(coachProfileId, approve: false, reason: reason),
                'Đã từ chối hồ sơ.',
              ),
            ),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(cvProvider(coachProfileId)),
        data: (cv) => ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            AppCard(
              child: Column(
                children: [
                  AppAvatar(name: cv.fullName, size: AppSizes.avatarLg),
                  const SizedBox(height: AppSpacing.sm),
                  Text(cv.fullName, style: context.text.title),
                  cv.certification.status.status.tag(),
                  const SizedBox(height: AppSpacing.md),
                  InfoRow(icon: AppIcons.mail, text: cv.email),
                  if (cv.phone != null) InfoRow(icon: AppIcons.phone, text: cv.phone!),
                  if (cv.specialization != null) InfoRow(icon: AppIcons.award, text: cv.specialization!),
                  if (cv.experienceYears != null)
                    InfoRow(icon: AppIcons.time, text: '${cv.experienceYears} năm kinh nghiệm'),
                ],
              ),
            ),
            if (cv.bio != null) ...[
              const SizedBox(height: AppSpacing.md),
              const SectionHeader(title: 'Giới thiệu'),
              Text(cv.bio!, style: context.text.body),
            ],
            const SizedBox(height: AppSpacing.md),
            const SectionHeader(title: 'Tệp CV'),
            AppCard(
              child: Row(
                children: [
                  Icon(AppIcons.cv, color: context.colors.primary, size: AppSizes.iconXl),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(cv.certification.fileName ?? 'CV.pdf', style: context.text.bodyStrong),
                        Text(
                          'Nộp ${VnTime.dateTime(cv.certification.submittedAt)}',
                          style: context.text.caption.copyWith(color: context.colors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    // TODO BE-8: endpoint tải file CV có xác thực ⇒ mở trình xem PDF.
                    onPressed: () => AppSnackbar.info(context, 'Xem PDF sẽ khả dụng khi nối API (TODO BE-8).'),
                    child: const Text('Xem CV'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// R03 — Duyệt khóa học.
class ClassReviewScreen extends ConsumerWidget {
  const ClassReviewScreen({super.key, required this.classId});

  final String classId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(reviewClassProvider(classId));
    final d = value.value;
    final repo = ref.read(managerRepositoryProvider);
    return AppScaffold(
      title: 'Duyệt khóa học',
      bottomBar: d == null || d.course.status != ClassStatus.pending
          ? null
          : ReviewActionBar(
              approveLabel: 'Duyệt & mở bán',
              approveMessage: 'Khóa "${d.course.name}" sẽ hiển thị cho học viên và có thể mua ngay.',
              onApprove: (_) =>
                  runReview(context, ref, () => repo.reviewClass(classId, approve: true), 'Đã duyệt khóa học.'),
              onReject: (reason) => runReview(
                context,
                ref,
                () => repo.reviewClass(classId, approve: false, reason: reason),
                'Đã từ chối khóa học.',
              ),
            ),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(reviewClassProvider(classId)),
        data: (d) => ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            ClassOverview(detail: d, showRevenue: false),
            SectionHeader(title: 'Lịch học (${d.sessions.length} buổi)'),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
              child: Column(
                children: [
                  for (var i = 0; i < d.sessions.length; i++) ...[
                    if (i > 0) const Divider(),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${VnTime.sessionLabel(d.sessions[i].startTime, d.sessions[i].endTime)} · ${d.sessions[i].room.name}',
                              style: context.text.small,
                            ),
                          ),
                          sessionStatus(d.sessions[i], DateTime.now()).tag(dense: true),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}
