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
import '../../../attendance/presentation/widgets/course_attendance_view.dart';
import '../../../auth/presentation/auth_labels.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../training/data/training_repository_provider.dart';
import '../../../training/domain/entities/training.dart';
import '../../../training/presentation/training_screens.dart';
import '../providers/coach_providers.dart';

/// H10 + H11 — Hồ sơ học viên (góc nhìn HLV) + chuyên cần & lộ trình RIÊNG từng khóa của HLV mà học viên học.
class StudentScreen extends ConsumerStatefulWidget {
  const StudentScreen({super.key, required this.memberProfileId});

  final String memberProfileId;

  @override
  ConsumerState<StudentScreen> createState() => _StudentScreenState();
}

class _StudentScreenState extends ConsumerState<StudentScreen> {
  String? _classId;

  @override
  Widget build(BuildContext context) {
    final memberProfileId = widget.memberProfileId;
    final value = ref.watch(studentProfileProvider(memberProfileId));
    final profile = value.value;
    final selected = profile == null || profile.classes.isEmpty
        ? null
        : profile.classes.where((c) => c.classId == _classId).firstOrNull ?? profile.classes.first;
    return AppScaffold(
      title: 'Hồ sơ học viên',
      floatingActionButton: profile == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => showAppBottomSheet<void>(
                context: context,
                title: 'Lập lộ trình cho ${profile.student.fullName}',
                builder: (_) => _PlanForm(
                  memberProfileId: memberProfileId,
                  classId: selected?.classId,
                  className: selected?.className,
                ),
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
          final st = selected;
          // Lộ trình của khóa đang chọn + lộ trình chung (dữ liệu cũ chưa gắn khóa).
          final plans = p.plans
              .where((plan) => st == null || plan.classId == st.classId || plan.classId == null)
              .toList();
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
                    if (s.fitnessGoals.isNotEmpty)
                      InfoRow(icon: AppIcons.target, text: 'Mục tiêu: ${s.fitnessGoals.map(goalLabel).join(', ')}'),
                    if (s.fitnessGoal != null) InfoRow(icon: AppIcons.info, text: 'Ghi chú mục tiêu: ${s.fitnessGoal}'),
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
              if (st != null) ...[
                SectionHeader(title: p.classes.length > 1 ? 'Chọn khóa học (${p.classes.length})' : 'Khóa học'),
                if (p.classes.length > 1) ...[
                  SegmentedTabs<String>(
                    padding: EdgeInsets.zero,
                    selected: st.classId,
                    onChanged: (id) => setState(() => _classId = id),
                    options: [for (final k in p.classes) SegmentOption(k.classId, k.className)],
                  ),
                  const SizedBox(height: AppSpacing.md),
                ] else
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: Text(st.className, style: context.text.titleSmall),
                  ),
                SectionHeader(title: 'Chuyên cần khóa ${st.className}'),
                CourseAttendanceView(key: ValueKey(st.classId), attendance: st.attendance),
                const SizedBox(height: AppSpacing.lg),
              ],
              SectionHeader(
                title: st == null
                    ? 'Lộ trình bạn đã lập (${plans.length})'
                    : 'Lộ trình khóa ${st.className} (${plans.length})',
              ),
              if (plans.isEmpty)
                Text(
                  'Chưa có lộ trình cho khóa này. Bấm "Lập lộ trình" để ghi nhận kết quả và nhận xét cho học viên.',
                  style: context.text.small.copyWith(color: c.textMuted),
                )
              else
                for (final plan in plans)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: PlanCard(
                      plan: plan,
                      showMember: true,
                      showCourse: plan.classId == null,
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
  const _PlanForm({required this.memberProfileId, this.classId, this.className});

  final String memberProfileId;

  /// Khóa của lộ trình (khóa đang chọn trên màn hồ sơ).
  final String? classId;
  final String? className;

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
              classId: widget.classId,
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
        if (widget.className != null) ...[
          InfoRow(icon: AppIcons.course, text: 'Thuộc khóa: ${widget.className}'),
          const SizedBox(height: AppSpacing.sm),
        ],
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
