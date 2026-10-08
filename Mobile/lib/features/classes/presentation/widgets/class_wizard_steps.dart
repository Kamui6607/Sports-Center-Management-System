import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../coach/domain/entities/wallet.dart';
import '../../domain/entities/course.dart';
import '../class_labels.dart';
import '../providers/class_wizard_draft.dart';
import '../providers/course_providers.dart';

/// Cập nhật [WizardData] rồi vẽ lại màn wizard (truyền `setState` của màn).
typedef WizardUpdate = void Function(VoidCallback change);

/// Bước 1 — Thông tin khóa học.
class WizardInfoStep extends ConsumerWidget {
  const WizardInfoStep({
    super.key,
    required this.data,
    required this.update,
    required this.formKey,
    required this.nameController,
    required this.descriptionController,
    required this.capacityController,
    required this.priceController,
    this.fieldErrors = const {},
  });

  final WizardData data;
  final WizardUpdate update;
  final GlobalKey<FormState> formKey;
  final TextEditingController nameController;
  final TextEditingController descriptionController;
  final TextEditingController capacityController;
  final TextEditingController priceController;
  final Map<String, String> fieldErrors;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = data;
    final sports = ref.watch(sportsProvider).value ?? const <Sport>[];
    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            label: 'Tên khóa học',
            requiredField: true,
            controller: nameController,
            validator: Validators.minLength(2, 'Tên khóa'),
            errorText: fieldErrors['name'],
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Mô tả',
            controller: descriptionController,
            maxLines: 4,
            hint: 'Đối tượng phù hợp, nội dung, lưu ý (chống chỉ định)…',
          ),
          const SizedBox(height: AppSpacing.md),
          SelectField<String>(
            label: 'Bộ môn',
            requiredField: true,
            multiple: true,
            options: [for (final s in sports) SelectOption(s.id, s.name)],
            values: d.sportIds,
            onChanged: (v) => update(() => d.sportIds = v),
            errorText: fieldErrors['sportIds'],
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
          Text('Khu vực tập', style: context.text.label),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            children: [
              for (final a in AreaType.values)
                AppChip(
                  label: a.label,
                  selected: d.areaType == a,
                  onTap: () => update(() {
                    d.areaType = a;
                    d.roomId = null;
                  }),
                ),
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
                  errorText: fieldErrors['capacity'],
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

/// Bước 2 — Phòng, lịch lặp và danh sách buổi xem trước.
class WizardScheduleStep extends ConsumerWidget {
  const WizardScheduleStep({
    super.key,
    required this.data,
    required this.update,
    required this.countController,
    required this.onGenerate,
    this.error,
  });

  final WizardData data;
  final WizardUpdate update;
  final TextEditingController countController;
  final VoidCallback onGenerate;
  final String? error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = data;
    final rooms = ref.watch(roomsProvider(d.areaType)).value ?? const <Room>[];
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SelectField<String>(
          label: 'Phòng tập (${d.areaType.label})',
          requiredField: true,
          options: [
            for (final r in rooms)
              SelectOption(
                r.id,
                r.name,
                subtitle: '${r.location ?? ''} · ${r.capacity} chỗ',
                enabled: r.capacity >= d.capacity,
              ),
          ],
          values: [?d.roomId],
          onChanged: (v) => update(() => d.roomId = v.firstOrNull),
        ),
        const SizedBox(height: AppSpacing.md),
        DateTimeField(
          label: 'Ngày bắt đầu',
          requiredField: true,
          value: d.startDate,
          firstDate: DateTime.now(),
          onChanged: (v) => update(() => d.startDate = v),
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Các thứ trong tuần', style: context.text.label),
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
              child: AppTextField(label: 'Số buổi', controller: countController, keyboardType: TextInputType.number),
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
        AppButton.outline(
          label: 'Tạo danh sách buổi học',
          icon: AppIcons.calendar,
          expand: true,
          onPressed: onGenerate,
        ),
        if (error != null) ...[const SizedBox(height: AppSpacing.sm), AlertBanner.error(message: error!)],
        const SizedBox(height: AppSpacing.lg),
        SectionHeader(title: 'Xem trước (${d.sessions.length} buổi)'),
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
                      onPressed: () => update(() => d.sessions = [...d.sessions]..removeAt(i)),
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
    final rooms = ref.watch(roomsProvider(d.areaType)).value ?? const <Room>[];
    final sports = ref.watch(sportsProvider).value ?? const <Sport>[];
    final room = rooms.where((r) => r.id == d.roomId).firstOrNull;
    final share = (d.price * kCoachRevenueShare).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            children: [
              KeyValueRow(label: 'Tên khóa', value: d.name),
              KeyValueRow(
                label: 'Bộ môn',
                value: sports.where((s) => d.sportIds.contains(s.id)).map((s) => s.name).join(', '),
              ),
              KeyValueRow(label: 'Hạng / khu vực', value: '${d.classType.label} · ${d.areaType.label}'),
              KeyValueRow(label: 'Phòng', value: room?.name ?? '—'),
              KeyValueRow(label: 'Số buổi', value: '${d.sessions.length}'),
              if (d.sessions.isNotEmpty)
                KeyValueRow(
                  label: 'Thời gian',
                  value: '${VnTime.date(d.sessions.first.start)} – ${VnTime.date(d.sessions.last.start)}',
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
