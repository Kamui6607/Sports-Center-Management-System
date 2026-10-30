import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/auth_labels.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../catalog/presentation/goal_chips_field.dart';
import '../../../coach/domain/entities/wallet.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/class_wizard_draft.dart';
import '../providers/course_providers.dart';

/// Cập nhật [WizardData] rồi vẽ lại màn wizard (+ hẹn tự lưu nháp).
typedef WizardUpdate = void Function(VoidCallback change);

/// Bước 1 — Thông tin khóa học (phạm vi Gym: không chọn bộ môn/khu vực).
class WizardInfoStep extends ConsumerWidget {
  const WizardInfoStep({
    super.key,
    required this.data,
    required this.update,
    required this.formKey,
    required this.nameController,
    required this.descriptionController,
    required this.goalController,
    required this.capacityController,
    required this.priceController,
    this.fieldErrors = const {},
    this.goalError,
  });

  final WizardData data;
  final WizardUpdate update;
  final GlobalKey<FormState> formKey;
  final TextEditingController nameController;
  final TextEditingController descriptionController;
  final TextEditingController goalController;
  final TextEditingController capacityController;
  final TextEditingController priceController;
  final Map<String, String> fieldErrors;
  final String? goalError;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = data;
    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            label: 'Tên khóa học',
            requiredField: true,
            controller: nameController,
            maxLength: 120,
            hint: 'VD: Gym nền tảng 8 tuần cho người mới',
            validator: Validators.minLength(2, 'Tên khóa'),
            errorText: fieldErrors['class.name'] ?? fieldErrors['name'],
          ),
          const SizedBox(height: AppSpacing.md),
          GoalChipsField(
            label: 'Mục tiêu khóa học',
            requiredField: true,
            selected: d.goalTags,
            max: kMaxClassGoals,
            helper: 'Học viên dựa vào đây (so với mục tiêu trong hồ sơ) để biết khóa có phù hợp với mình không.',
            errorText: goalError ?? fieldErrors['class.goalTags'],
            onChanged: (v) => update(() => d.goalTags = v),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Mô tả mục tiêu cụ thể',
            controller: goalController,
            maxLines: 3,
            maxLength: 1000,
            hint: 'VD: Thành thạo 6 bài compound, giảm 2–3% mỡ sau 8 tuần…',
            errorText: fieldErrors['class.goal'],
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Trình độ phù hợp', style: context.text.label),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              AppChip(
                label: 'Mọi trình độ',
                selected: d.targetLevel == null,
                onTap: () => update(() => d.targetLevel = null),
              ),
              for (final l in TrainingLevel.values)
                AppChip(label: l.label, selected: d.targetLevel == l, onTap: () => update(() => d.targetLevel = l)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Giới thiệu khóa học',
            controller: descriptionController,
            maxLines: 4,
            maxLength: 2000,
            hint: 'Nội dung, cách theo dõi tiến độ, lưu ý sức khỏe (chống chỉ định)…',
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Hạng khóa', style: context.text.label),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            children: [
              for (final t in ClassType.values)
                AppChip(label: t.label, selected: d.classType == t, onTap: () => update(() => d.classType = t)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AppTextField(
                  label: 'Sức chứa / buổi',
                  requiredField: true,
                  controller: capacityController,
                  keyboardType: TextInputType.number,
                  validator: (v) {
                    final n = int.tryParse(v ?? '');
                    return n == null || n < 1 || n > 200 ? 'Từ 1 đến 200' : null;
                  },
                  errorText: fieldErrors['class.capacity'] ?? fieldErrors['capacity'],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: MoneyInput(
                  label: 'Giá trọn khóa',
                  requiredField: true,
                  controller: priceController,
                  validator: (v) => Money.parseInput(v ?? '') == null ? 'Nhập giá' : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Bước 2 — Phòng, lịch lặp; danh sách buổi + ngày kết thúc tự tính ngay khi đổi thông số.
class WizardScheduleStep extends ConsumerWidget {
  const WizardScheduleStep({
    super.key,
    required this.data,
    required this.update,
    required this.removeSession,
    required this.countController,
    required this.onCountChanged,
    this.error,
  });

  final WizardData data;

  /// Đổi thông số lịch ⇒ màn sinh lại danh sách buổi.
  final WizardUpdate update;
  final ValueChanged<int> removeSession;
  final TextEditingController countController;
  final VoidCallback onCountChanged;
  final String? error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = data;
    final rooms = ref.watch(roomsProvider(AreaType.indoor)).value ?? const <Room>[];
    final c = context.colors;
    final end = d.endDate;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SelectField<String>(
          label: 'Phòng tập',
          requiredField: true,
          options: [
            for (final r in rooms)
              SelectOption(
                r.id,
                r.name,
                subtitle: [if (r.placeLabel.isNotEmpty) r.placeLabel, '${r.capacity} chỗ'].join(' · '),
                enabled: r.capacity >= d.capacity,
              ),
          ],
          values: [?d.roomId],
          onChanged: (v) => update(() => d.roomId = v.firstOrNull),
        ),
        const SizedBox(height: AppSpacing.md),
        DateTimeField(
          label: 'Ngày khai giảng (bắt đầu tìm buổi đầu tiên)',
          requiredField: true,
          value: d.startDate,
          firstDate: DateTime.now(),
          onChanged: (v) => update(() => d.startDate = v),
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Các thứ dạy trong tuần', style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            for (var w = 1; w <= 7; w++)
              AppChip(
                label: VnTime.weekdayLabel(w, short: true),
                selected: d.weekdays.contains(w),
                onTap: () => update(() => d.weekdays.contains(w) ? d.weekdays.remove(w) : d.weekdays.add(w)),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: DateTimeField(
                label: 'Giờ bắt đầu',
                mode: DateTimeFieldMode.time,
                value: VnTime.fromWall(2026, 1, 1, d.startTime.hour, d.startTime.minute),
                onChanged: (v) =>
                    update(() => d.startTime = TimeOfDay(hour: VnTime.wall(v).hour, minute: VnTime.wall(v).minute)),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: AppTextField(
                label: 'Tổng số buổi',
                controller: countController,
                keyboardType: TextInputType.number,
                onChanged: (_) => onCountChanged(),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Thời lượng mỗi buổi', style: context.text.label),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          children: [
            for (final m in const [45, 60, 90, 120])
              AppChip(
                label: '$m phút',
                selected: d.durationMinutes == m,
                onTap: () => update(() => d.durationMinutes = m),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        if (error != null) ...[AlertBanner.error(message: error!), const SizedBox(height: AppSpacing.sm)],
        AppCard(
          color: c.surfaceMuted,
          child: Column(
            children: [
              KeyValueRow(
                label: 'Khai giảng',
                value: d.sessions.isEmpty ? '—' : VnTime.dateShort(d.sessions.first.start),
              ),
              KeyValueRow(
                label: 'Ngày kết thúc dự kiến',
                value: end == null ? 'Chọn ngày, thứ và số buổi' : VnTime.dateShort(end),
                emphasize: end != null,
              ),
              KeyValueRow(
                label: 'Số buổi · lịch',
                value: d.weekdays.isEmpty
                    ? '${d.sessions.length} buổi'
                    : '${d.sessions.length} buổi · ${(d.weekdays.toList()..sort()).map((w) => VnTime.weekdayLabel(w, short: true)).join(', ')}',
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        SectionHeader(title: 'Danh sách buổi (${d.sessions.length})'),
        if (d.sessions.isEmpty)
          Text('Chưa có buổi nào.', style: context.text.small.copyWith(color: c.textMuted))
        else
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Column(
              children: [
                for (var i = 0; i < d.sessions.length; i++)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: Text('${i + 1}', style: context.text.label.copyWith(color: c.textMuted)),
                    title: Text(VnTime.sessionLabel(d.sessions[i].start, d.sessions[i].end), style: context.text.small),
                    trailing: IconButton(
                      tooltip: 'Bỏ buổi này',
                      icon: const Icon(AppIcons.close, size: AppSizes.icon),
                      onPressed: () => removeSession(i),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Bước 3 — Xem lại trước khi gửi duyệt.
class WizardReviewStep extends ConsumerWidget {
  const WizardReviewStep({super.key, required this.data});

  final WizardData data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = data;
    final rooms = ref.watch(roomsProvider(AreaType.indoor)).value ?? const <Room>[];
    final room = rooms.where((r) => r.id == d.roomId).firstOrNull;
    final share = (d.price * kCoachRevenueShare).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            children: [
              KeyValueRow(label: 'Tên khóa', value: d.name),
              KeyValueRow(label: 'Mục tiêu', value: d.goalTags.map(goalLabel).join(', ')),
              KeyValueRow(label: 'Trình độ', value: d.targetLevel?.label ?? 'Mọi trình độ'),
              KeyValueRow(label: 'Hạng', value: d.classType.label),
              KeyValueRow(
                label: 'Phòng',
                value: room == null ? '—' : [room.name, if (room.placeLabel.isNotEmpty) room.placeLabel].join(' · '),
              ),
              KeyValueRow(label: 'Số buổi', value: '${d.sessions.length}'),
              if (d.sessions.isNotEmpty)
                KeyValueRow(
                  label: 'Khai giảng – kết thúc',
                  value: '${VnTime.date(d.sessions.first.start)} – ${VnTime.date(d.endDate!)}',
                ),
              KeyValueRow(label: 'Sức chứa', value: '${d.capacity} học viên/buổi'),
              const Divider(),
              KeyValueRow(label: 'Giá trọn khóa', value: Money.format(d.price), emphasize: true),
              KeyValueRow(
                label: 'Bạn nhận / học viên (85%)',
                value: Money.format(share),
                valueColor: context.colors.successText,
              ),
              KeyValueRow(label: 'Tối đa nếu kín chỗ', value: Money.format(share * d.capacity)),
            ],
          ),
        ),
        if (d.goal.trim().isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          AppCard(child: Text(d.goal.trim(), style: context.text.body)),
        ],
        const SizedBox(height: AppSpacing.md),
        const AlertBanner.info(
          message:
              'Khóa học được gửi ở trạng thái "Chờ duyệt". Quản lý kiểm tra lịch, phòng và giá trước khi mở bán. '
              'Bạn chỉ rút được tiền khi các khóa đã kết thúc.',
        ),
      ],
    );
  }
}
