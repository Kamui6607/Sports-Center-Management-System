import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/makeup_repository_provider.dart';
import '../../domain/entities/makeup.dart';
import '../providers/makeup_providers.dart';

/// HLV — Mở buổi bù cho khóa [classId] (không bán, chỉ dành cho học viên xin học bù) + xếp luôn các yêu cầu chọn.
class OpenMakeupSlotScreen extends ConsumerStatefulWidget {
  const OpenMakeupSlotScreen({super.key, required this.classId, this.requestId});

  final String classId;

  /// Yêu cầu mở màn này (được chọn sẵn).
  final String? requestId;

  @override
  ConsumerState<OpenMakeupSlotScreen> createState() => _OpenMakeupSlotScreenState();
}

class _OpenMakeupSlotScreenState extends ConsumerState<OpenMakeupSlotScreen> {
  static const _durations = [60, 90, 120];

  DateTime? _start;
  int _minutes = 60;
  int _capacity = 5;
  late final Set<String> _assign = {?widget.requestId};
  bool _saving = false;

  Future<void> _submit() async {
    final start = _start;
    if (start == null) return;
    setState(() => _saving = true);
    final result = await runAction(
      context,
      () => ref
          .read(makeupRepositoryProvider)
          .openSlot(
            OpenMakeupSlotInput(
              classId: widget.classId,
              start: start,
              end: start.add(Duration(minutes: _minutes)),
              capacity: _capacity,
              assignRequestIds: _assign.toList(),
            ),
          ),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (result == null) return;
    AppSnackbar.success(
      context,
      'Đã mở buổi bù ${VnTime.sessionLabel(result.slot.startTime, result.slot.endTime)} · '
      'xếp ${result.assignedCount} học viên${result.failedCount > 0 ? ' (${result.failedCount} chưa xếp được)' : ''}.',
    );
    ref.read(dataRevisionProvider.notifier).bump();
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(coachMakeupRequestsProvider(MakeupStatus.pending));
    final muted = context.text.small.copyWith(color: context.colors.textMuted);
    return AppScaffold(
      title: 'Mở buổi bù',
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          Text(
            'Buổi bù không bán và không tính vào số buổi của khóa. Chỉ học viên đã xin học bù mới thấy và chọn được.',
            style: muted,
          ),
          const SizedBox(height: AppSpacing.md),
          DateTimeField(
            label: 'Bắt đầu',
            requiredField: true,
            mode: DateTimeFieldMode.dateTime,
            firstDate: DateTime.now(),
            value: _start,
            onChanged: (v) => setState(() => _start = v),
            hint: 'Cách hiện tại ít nhất 2 giờ',
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Thời lượng', style: context.text.label),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            children: [
              for (final m in _durations)
                AppChip(label: '$m phút', selected: _minutes == m, onTap: () => setState(() => _minutes = m)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(child: Text('Số chỗ', style: context.text.label)),
              QuantityStepper(value: _capacity, max: 30, onChanged: (v) => setState(() => _capacity = v)),
            ],
          ),
          const SectionHeader(title: 'Xếp luôn học viên đang chờ'),
          AsyncValueView(
            value: pending,
            onRetry: () => ref.invalidate(coachMakeupRequestsProvider(MakeupStatus.pending)),
            data: (rows) {
              final mine = rows.where((r) => r.paidClassId == widget.classId).toList();
              if (mine.isEmpty) return Text('Khóa này chưa có học viên chờ học bù.', style: muted);
              return Column(
                children: [
                  for (final r in mine)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _assign.contains(r.id),
                      onChanged: (v) => setState(() => v == true ? _assign.add(r.id) : _assign.remove(r.id)),
                      title: Text(r.memberName),
                      subtitle: Text('Vắng ${VnTime.sessionLabel(r.missed.startTime, r.missed.endTime)}'),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Mở buổi bù', expand: true, loading: _saving, onPressed: _start == null ? null : _submit),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
