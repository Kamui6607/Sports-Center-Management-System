import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/data/data_revision.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../data/training_repository_provider.dart';
import '../domain/entities/training.dart';
import 'result_form.dart';

final myPlansProvider = FutureProvider.autoDispose<List<TrainingPlan>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(trainingRepositoryProvider).myPlans();
});

final planProvider = FutureProvider.autoDispose.family<TrainingPlan, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(trainingRepositoryProvider).plan(id);
});

/// M13 — Lộ trình tập luyện của Member (chỉ xem).
class TrainingPlansScreen extends ConsumerWidget {
  const TrainingPlansScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myPlansProvider);
    return AppScaffold(
      title: 'Lộ trình tập luyện',
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(myPlansProvider),
        isEmpty: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: AppIcons.training,
          title: 'Chưa có lộ trình',
          message: 'HLV sẽ lập lộ trình riêng cho bạn sau khi bạn tham gia khóa học.',
        ),
        data: (plans) => RefreshableList(
          onRefresh: () => ref.refresh(myPlansProvider.future),
          itemCount: plans.length,
          itemBuilder: (context, i) =>
              PlanCard(plan: plans[i], onTap: () => context.push(AppRoutes.trainingPlan(plans[i].id))),
        ),
      ),
    );
  }
}

/// Thẻ lộ trình.
class PlanCard extends StatelessWidget {
  const PlanCard({super.key, required this.plan, required this.onTap, this.showMember = false});

  final TrainingPlan plan;
  final VoidCallback onTap;
  final bool showMember;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final c = context.colors;
    final status = plan.isActive(now)
        ? const StatusLabel('Đang áp dụng', StatusTone.success)
        : (plan.hasEnded(now)
              ? const StatusLabel('Đã kết thúc', StatusTone.neutral)
              : const StatusLabel('Sắp bắt đầu', StatusTone.info));
    final latestNote = plan.results.where((r) => r.coachNote != null).firstOrNull;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(plan.name, style: context.text.bodyStrong)),
              status.tag(dense: true),
            ],
          ),
          Text(
            '${showMember ? plan.memberName : 'HLV ${plan.coachName}'} · ${VnTime.date(plan.startDate)} – ${VnTime.date(plan.endDate)}',
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
          if (latestNote != null) ...[
            const SizedBox(height: AppSpacing.xs),
            InfoRow(icon: AppIcons.chat, text: '“${latestNote.coachNote}”'),
          ],
          const SizedBox(height: AppSpacing.xxs),
          Text('${plan.results.length} lần ghi nhận kết quả', style: context.text.caption.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

/// Chi tiết lộ trình: mô tả + dòng thời gian kết quả & "Nhận xét của HLV" (Q6).
/// [coachMode] ⇒ HLV được ghi kết quả mới.
class TrainingPlanScreen extends ConsumerWidget {
  const TrainingPlanScreen({super.key, required this.planId, this.coachMode = false});

  final String planId;
  final bool coachMode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(planProvider(planId));
    final plan = value.value;
    final now = DateTime.now();
    final canRecord =
        coachMode &&
        plan != null &&
        !now.isBefore(plan.startDate) &&
        !plan.hasEnded(now.subtract(const Duration(days: 1)));
    return AppScaffold(
      title: 'Lộ trình tập luyện',
      bottomBar: canRecord
          ? StickyBottomBar(
              child: AppButton(
                label: 'Ghi kết quả buổi tập',
                icon: AppIcons.add,
                expand: true,
                onPressed: () => showAppBottomSheet<void>(
                  context: context,
                  title: 'Ghi kết quả',
                  builder: (_) => ResultForm(plan: plan),
                ),
              ),
            )
          : null,
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(planProvider(planId)),
        data: (p) => RefreshableScroll(
          onRefresh: () => ref.refresh(planProvider(planId).future),
          children: [
            Text(p.name, style: context.text.headline),
            Text(
              '${coachMode ? 'Học viên ${p.memberName}' : 'HLV ${p.coachName}'} · ${VnTime.date(p.startDate)} – ${VnTime.date(p.endDate)}',
              style: context.text.small.copyWith(color: context.colors.textMuted),
            ),
            const SizedBox(height: AppSpacing.md),
            if (p.description != null)
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Kế hoạch', style: context.text.label),
                    const SizedBox(height: AppSpacing.xs),
                    Text(p.description!, style: context.text.body),
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.lg),
            SectionHeader(title: 'Kết quả & nhận xét của HLV (${p.results.length})'),
            if (p.results.isEmpty)
              const EmptyState(compact: true, icon: AppIcons.trend, title: 'Chưa có kết quả nào được ghi nhận')
            else
              TimelineList(
                entries: [
                  for (final r in p.results)
                    TimelineEntry(
                      title: VnTime.dayLabel(r.date),
                      tone: StatusTone.brand,
                      body: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (r.metrics.isNotEmpty)
                            Wrap(
                              spacing: AppSpacing.xs,
                              runSpacing: AppSpacing.xs,
                              children: [
                                for (final m in r.metrics)
                                  StatusLabel(
                                    m.value != null && (m.note?.isNotEmpty ?? false)
                                        ? '${m.name}: ${m.display} — ${m.note}'
                                        : '${m.name}: ${m.display}',
                                    StatusTone.neutral,
                                  ).tag(),
                              ],
                            ),
                          if (r.coachNote != null) ...[
                            const SizedBox(height: AppSpacing.xs),
                            AppCard(
                              color: context.tones.of(StatusTone.brand).background,
                              borderColor: context.tones.of(StatusTone.brand).border,
                              padding: const EdgeInsets.all(AppSpacing.sm),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Nhận xét của HLV',
                                    style: context.text.caption.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                  Text(r.coachNote!, style: context.text.small),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}
