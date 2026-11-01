import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/entities/makeup.dart';
import 'providers/makeup_providers.dart';

extension MakeupStatusLabel on MakeupStatus {
  StatusLabel get status => switch (this) {
    MakeupStatus.pending => const StatusLabel('Chờ xếp buổi', StatusTone.warning),
    MakeupStatus.scheduled => const StatusLabel('Đã xếp học bù', StatusTone.success),
    MakeupStatus.rejected => const StatusLabel('Bị từ chối', StatusTone.danger),
    MakeupStatus.expired => const StatusLabel('Hết hạn', StatusTone.neutral),
    MakeupStatus.cancelled => const StatusLabel('Đã rút', StatusTone.neutral),
  };
}

/// "Thứ 2, 03/11 · 08:00–09:00 · Phòng A".
String makeupSessionLabel(MakeupSession s) => [VnTime.sessionLabel(s.startTime, s.endTime), ?s.roomName].join(' · ');

/// Một buổi có thể xếp học bù (radio).
class MakeupOptionTile extends StatelessWidget {
  const MakeupOptionTile({super.key, required this.option});

  final MakeupOption option;

  @override
  Widget build(BuildContext context) {
    final o = option;
    final c = context.colors;
    return RadioListTile<String>(
      value: o.session.id,
      enabled: o.canSelect,
      contentPadding: EdgeInsets.zero,
      title: Text(VnTime.sessionLabel(o.session.startTime, o.session.endTime), style: context.text.bodyStrong),
      subtitle: Text(
        [
          if (o.session.isMakeupSlot) 'Buổi bù mở' else if (!o.isSameClass) 'Khóa ${o.session.className}',
          o.blockReason ?? '${o.session.roomName ?? ''} · Còn ${o.remaining}/${o.capacity} chỗ',
        ].join(' · '),
        style: context.text.caption.copyWith(
          color: o.canSelect ? c.textMuted : context.tones.of(StatusTone.danger).foreground,
        ),
      ),
    );
  }
}

/// Sheet chọn buổi học bù ⇒ trả về id buổi được chọn.
class MakeupOptionsSheet extends ConsumerStatefulWidget {
  const MakeupOptionsSheet({
    super.key,
    required this.requestId,
    required this.emptyMessage,
    this.confirmLabel = 'Chọn buổi này',
  });

  final String requestId;
  final String emptyMessage;
  final String confirmLabel;

  @override
  ConsumerState<MakeupOptionsSheet> createState() => _MakeupOptionsSheetState();
}

class _MakeupOptionsSheetState extends ConsumerState<MakeupOptionsSheet> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(makeupOptionsProvider(widget.requestId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator.adaptive()),
      ),
      error: (e, _) =>
          ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(makeupOptionsProvider(widget.requestId))),
      data: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (d.options.isEmpty) EmptyState(compact: true, title: 'Chưa có buổi phù hợp', message: widget.emptyMessage),
          RadioGroup<String>(
            groupValue: _selected,
            onChanged: (id) => setState(() => _selected = id),
            child: Column(children: [for (final o in d.options) MakeupOptionTile(option: o)]),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: widget.confirmLabel,
            expand: true,
            onPressed: _selected == null ? null : () => Navigator.of(context).pop(_selected),
          ),
        ],
      ),
    );
  }
}
