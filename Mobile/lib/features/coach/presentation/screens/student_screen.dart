import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/presentation/auth_labels.dart';
import '../../../training/data/training_repository_provider.dart';
import '../../../training/domain/entities/training.dart';
import '../../../training/presentation/training_screens.dart';
import '../providers/coach_providers.dart';

/// H10 + H11 — Hồ sơ học viên (góc nhìn HLV) + lộ trình tập do HLV lập.
class StudentScreen extends ConsumerWidget {
  const StudentScreen({super.key, required this.memberProfileId});

  final String memberProfileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(studentProfileProvider(memberProfileId));
    return AppScaffold(
      title: 'Hồ sơ học viên',
      floatingActionButton: value.value == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => showAppBottomSheet<void>(
                context: context,
                title: 'Lập lộ trình cho ${value.value!.student.fullName}',
                builder: (_) => _PlanForm(memberProfileId: memberProfileId),
              ),
              backgroundColor: context.colors.primary,
              foregroundColor: context.colors.accent,
              icon: const Icon(AppIcons.add),
              label: const Text('Lập lộ trình'),
            ),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(studentProfileProvider(memberProfileId)),
        data: (p) {
          final s = p.student;
          final c = context.colors;
          return RefreshableScroll(
            onRefresh: () => ref.refresh(studentProfileProvider(memberProfileId).future),
            children: [
              AppCard(
                child: Column(
                  children: [
                    AppAvatar(name: s.fullName, imageUrl: s.avatarUrl, size: AppSizes.avatarLg),
                    const SizedBox(height: AppSpacing.sm),
                    Text(s.fullName, style: context.text.title),
                    if (s.trainingLevel != null)
                      StatusLabel('Trình độ: ${s.trainingLevel!.label}', StatusTone.brand).tag(),
                    const SizedBox(height: AppSpacing.md),
                    if (s.fitnessGoal != null) InfoRow(icon: AppIcons.target, text: 'Mục tiêu: ${s.fitnessGoal}'),
                    if (s.trainingPreference != null) InfoRow(icon: AppIcons.info, text: s.trainingPreference!),
                    if (s.phone != null) InfoRow(icon: AppIcons.phone, text: s.phone!),
                    const SizedBox(height: AppSpacing.sm),
                    AppButton.outline(
                      label: 'Nhắn tin',
                      icon: AppIcons.chat,
                      expand: true,
                      onPressed: () => context.push(AppRoutes.chatRoom(s.userId)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const SectionHeader(title: 'Chuyên cần trong khóa của bạn'),
              for (final st in p.classes)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AppCard(
                    child: Row(
                      children: [
                        ProgressRing(ratio: st.pastSessions == 0 ? 1 : st.attended / st.pastSessions),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(st.className, style: context.text.bodyStrong),
                              Text(
                                'Tham gia ${st.attended}/${st.pastSessions} buổi đã qua',
                                style: context.text.caption.copyWith(color: c.textMuted),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              SectionHeader(title: 'Lộ trình bạn đã lập (${p.plans.length})'),
              if (p.plans.isEmpty)
                Text(
                  'Chưa có lộ trình. Lập lộ trình để ghi nhận kết quả và nhận xét cho học viên.',
                  style: context.text.small.copyWith(color: c.textMuted),
                )
              else
                for (final plan in p.plans)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: PlanCard(
                      plan: plan,
                      showMember: true,
                      onTap: () => context.push(AppRoutes.coachPlan(plan.id)),
                    ),
                  ),
              const SizedBox(height: AppSpacing.xxl * 2),
            ],
          );
        },
      ),
    );
  }
}

class _PlanForm extends ConsumerStatefulWidget {
  const _PlanForm({required this.memberProfileId});

  final String memberProfileId;

  @override
  ConsumerState<_PlanForm> createState() => _PlanFormState();
}

class _PlanFormState extends ConsumerState<_PlanForm> with SubmittingState {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _desc = TextEditingController();
  DateTime _start = VnTime.startOfDay(DateTime.now());
  DateTime _end = VnTime.startOfDay(DateTime.now()).add(const Duration(days: 28));

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final plan = await submit(
      () => ref
          .read(trainingRepositoryProvider)
          .createPlan(
            PlanDraft(
              memberProfileId: widget.memberProfileId,
              name: _name.text,
              description: _desc.text,
              startDate: _start,
              endDate: _end,
            ),
          ),
    );
    if (plan == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    Navigator.of(context).pop();
    AppSnackbar.success(context, 'Đã giao lộ trình "${plan.name}". Học viên sẽ nhận thông báo.');
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          label: 'Tên lộ trình',
          requiredField: true,
          controller: _name,
          validator: Validators.minLength(2, 'Tên lộ trình'),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(label: 'Nội dung / bài tập', controller: _desc, maxLines: 5, hint: 'Tuần 1–2: …\nTuần 3–4: …'),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: DateTimeField(label: 'Bắt đầu', value: _start, onChanged: (v) => setState(() => _start = v)),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: DateTimeField(
                label: 'Kết thúc',
                value: _end,
                errorText: _end.isAfter(_start) ? null : 'Phải sau ngày bắt đầu',
                onChanged: (v) => setState(() => _end = v),
              ),
            ),
          ],
        ),
        if (formError != null) ...[const SizedBox(height: AppSpacing.sm), AlertBanner.error(message: formError!)],
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: 'Giao lộ trình',
          expand: true,
          loading: submitting,
          onPressed: _end.isAfter(_start) ? _save : null,
        ),
      ],
    ),
  );
}
