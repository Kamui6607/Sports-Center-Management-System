import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../attendance/domain/entities/attendance.dart';
import '../../data/schedule_repository_provider.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';
import '../session_labels.dart';

/// H05 — Điểm danh / sửa điểm danh thủ công cho cả danh sách.
class ManualAttendanceScreen extends ConsumerWidget {
  const ManualAttendanceScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(teachingSessionProvider(sessionId));
    return AsyncValueView(
      value: value,
      loading: const Scaffold(body: SkeletonList()),
      onRetry: () => ref.invalidate(teachingSessionProvider(sessionId)),
      data: (t) => _Form(detail: t),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.detail});

  final TeachingSession detail;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> with SubmittingState {
  late final Map<String, AttendanceStatus> _status = {
    for (final r in widget.detail.roster) r.memberProfileId: r.attendance ?? AttendanceStatus.present,
  };
  late final Map<String, TextEditingController> _notes = {
    for (final r in widget.detail.roster) r.memberProfileId: TextEditingController(text: r.note),
  };

  @override
  void dispose() {
    for (final c in _notes.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    var ok = false;
    await submit(() async {
      await ref.read(scheduleRepositoryProvider).saveAttendance(widget.detail.session.id, _status, {
        for (final e in _notes.entries) e.key: e.value.text,
      });
      ok = true;
    });
    if (!ok || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã lưu điểm danh.');
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final roster = widget.detail.roster;
    return AppScaffold(
      title: 'Điểm danh thủ công',
      bottomBar: StickyBottomBar(
        child: AppButton(
          label: 'Lưu điểm danh (${roster.length})',
          expand: true,
          loading: submitting,
          onPressed: _save,
        ),
      ),
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          Text(widget.detail.session.className, style: context.text.titleSmall),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Mặc định "Có mặt". Chạm để đổi trạng thái.',
                  style: context.text.caption.copyWith(color: context.colors.textMuted),
                ),
              ),
              TextButton(
                onPressed: () => setState(() => _status.updateAll((_, _) => AttendanceStatus.present)),
                child: const Text('Tất cả có mặt'),
              ),
            ],
          ),
          if (formError != null) ...[AlertBanner.error(message: formError!), const SizedBox(height: AppSpacing.sm)],
          for (final r in roster)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        AppAvatar(name: r.fullName, imageUrl: r.avatarUrl, size: AppSizes.avatarSm),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: Text(r.fullName, style: context.text.bodyStrong)),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.xs,
                      runSpacing: AppSpacing.xs,
                      children: [
                        for (final s in AttendanceStatus.values)
                          AppChip(
                            label: s.status.label,
                            selected: _status[r.memberProfileId] == s,
                            onTap: () => setState(() => _status[r.memberProfileId] = s),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    TextField(
                      controller: _notes[r.memberProfileId],
                      decoration: const InputDecoration(hintText: 'Ghi chú (không bắt buộc)', isDense: true),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
