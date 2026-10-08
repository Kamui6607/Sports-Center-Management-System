import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/presentation/providers/session_provider.dart';
import '../../classes/presentation/providers/course_providers.dart';
import 'feedback_widgets.dart';

/// H14 — Đánh giá HLV nhận được, lọc theo khóa.
class CoachFeedbackScreen extends ConsumerStatefulWidget {
  const CoachFeedbackScreen({super.key});

  @override
  ConsumerState<CoachFeedbackScreen> createState() => _CoachFeedbackScreenState();
}

class _CoachFeedbackScreenState extends ConsumerState<CoachFeedbackScreen> {
  String? _classId;

  @override
  Widget build(BuildContext context) {
    final coachId = ref.watch(currentUserProvider)?.coachProfile?.id ?? '';
    final classes = ref.watch(coachClassesProvider).value ?? const [];
    final value = ref.watch(coachFeedbackProvider((coachProfileId: coachId, classId: _classId)));
    return AppScaffold(
      title: 'Đánh giá nhận được',
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          ChipBar(
            children: [
              AppChip(label: 'Tất cả khóa', selected: _classId == null, onTap: () => setState(() => _classId = null)),
              for (final c in classes)
                AppChip(label: c.name, selected: _classId == c.id, onTap: () => setState(() => _classId = c.id)),
            ],
          ),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(coachFeedbackProvider),
              data: (page) => RefreshableScroll(
                onRefresh: () =>
                    ref.refresh(coachFeedbackProvider((coachProfileId: coachId, classId: _classId)).future),
                children: [
                  AppCard(
                    child: page.summary.count == 0
                        ? const EmptyState(compact: true, icon: AppIcons.star, title: 'Chưa có đánh giá')
                        : RatingSummary(
                            average: page.summary.average,
                            count: page.summary.count,
                            distribution: page.summary.distribution,
                          ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  if (page.items.isNotEmpty)
                    AppCard(
                      child: Column(
                        children: [
                          for (var i = 0; i < page.items.length; i++) ...[
                            if (i > 0) const Divider(height: AppSpacing.lg),
                            FeedbackTile(item: page.items[i]),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
