import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../classes/presentation/providers/course_providers.dart';
import '../../data/schedule_repository_provider.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';

/// H06b — HLV dời buổi sang ngày/giờ khác (Doc/GYM_SCOPE_CHANGES.md §12):
/// buổi còn ≥ 24h, giờ mới cách hiện tại ≥ 24h, tối đa 2 lần/buổi, bắt buộc lý do; học viên được thông báo
/// và có thể hủy buổi (hoàn 100%) hoặc đổi buổi nếu không đi được.
class RescheduleSessionScreen extends ConsumerWidget {
  const RescheduleSessionScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(teachingSessionProvider(sessionId));
    return AppScaffold(
      title: 'Dời lịch buổi học',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(teachingSessionProvider(sessionId)),
        data: (t) => _Form(detail: t),
      ),
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
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();
  DateTime? _start;
  String? _roomId;

  ClassSession get s => widget.detail.session;
  Duration get _duration => s.endTime.difference(s.startTime);

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  /// Lý do không dời được (null ⇒ được dời) — cùng luật BE.
  String? _blockReason(DateTime now) {
    if (s.status != ScheduleStatus.scheduled) return 'Chỉ dời được buổi đang lên lịch.';
    if (s.startTime.difference(now).inMinutes < kRescheduleMinNoticeHours * 60) {
      return 'Buổi học bắt đầu trong vòng $kRescheduleMinNoticeHours giờ tới — không thể dời. Hãy dùng "Hủy buổi" kèm dạy bù hoặc hoàn tiền.';
    }
    if (s.rescheduleCount >= kMaxReschedules) {
      return 'Buổi này đã được dời $kMaxReschedules lần (tối đa). Hãy dùng "Hủy buổi" kèm dạy bù hoặc hoàn tiền.';
    }
    return null;
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final start = _start;
    if (start == null) {
      AppSnackbar.info(context, 'Chọn ngày giờ mới cho buổi học.');
      return;
    }
    final ok = await showConfirmSheet(
      context: context,
      title: 'Dời buổi học?',
      message:
          'Từ ${VnTime.sessionLabel(s.startTime, s.endTime)} sang ${VnTime.sessionLabel(start, start.add(_duration))}.',
      warning:
          '${widget.detail.roster.length} học viên sẽ nhận thông báo kèm lý do. Học viên không đi được có thể hủy buổi '
          'để được hoàn 100% tiền buổi (trừ vào ví của bạn) hoặc đổi sang buổi khác.',
      confirmLabel: 'Dời lịch',
    );
    if (!ok || !mounted) return;
    final result = await submit(
      () => ref
          .read(scheduleRepositoryProvider)
          .rescheduleSession(
            s.id,
            RescheduleInput(start: start, end: start.add(_duration), reason: _reason.text, roomId: _roomId),
          ),
    );
    if (result == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(
      context,
      'Đã dời buổi học và thông báo ${result.affectedMembers} học viên.'
      '${result.conflictedMembers.isEmpty ? '' : ' ${result.conflictedMembers.length} học viên bị trùng lịch đã được cảnh báo.'}',
    );
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final block = _blockReason(now);
    final rooms = ref.watch(roomsProvider(s.room.areaType)).value ?? const [];
    final earliest = now.add(const Duration(hours: kRescheduleMinNoticeHours));
    return Form(
      key: _form,
      child: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          AppCard(
            color: context.colors.surfaceMuted,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.className, style: context.text.bodyStrong),
                Text('${VnTime.sessionLabel(s.startTime, s.endTime)} · ${s.room.name}', style: context.text.small),
                Text(
                  '${widget.detail.roster.length} học viên giữ chỗ · đã dời ${s.rescheduleCount}/$kMaxReschedules lần',
                  style: context.text.caption.copyWith(color: context.colors.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (block != null)
            AlertBanner.warning(message: block)
          else ...[
            const AlertBanner.info(
              message:
                  'Giờ mới phải cách hiện tại ít nhất $kRescheduleMinNoticeHours giờ. Hệ thống kiểm tra trùng phòng và trùng lịch dạy của bạn; '
                  'học viên được thông báo ngay sau khi dời.',
            ),
            const SizedBox(height: AppSpacing.md),
            DateTimeField(
              label: 'Ngày giờ bắt đầu mới',
              mode: DateTimeFieldMode.dateTime,
              requiredField: true,
              value: _start,
              firstDate: earliest,
              onChanged: (v) => setState(() => _start = v),
              errorText: _start != null && _start!.isBefore(earliest)
                  ? 'Chọn thời điểm sau ${VnTime.date(earliest)} ${VnTime.time(earliest)}'
                  : null,
            ),
            if (_start != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(
                  'Kết thúc lúc ${VnTime.time(_start!.add(_duration))} (giữ thời lượng ${_duration.inMinutes} phút)',
                  style: context.text.caption.copyWith(color: context.colors.textMuted),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            SelectField<String>(
              label: 'Phòng tập',
              options: [
                for (final r in rooms)
                  SelectOption(
                    r.id,
                    r.name,
                    subtitle: [if (r.placeLabel.isNotEmpty) r.placeLabel, '${r.capacity} chỗ'].join(' · '),
                    enabled: r.capacity >= s.capacity,
                  ),
              ],
              values: [_roomId ?? s.room.id],
              onChanged: (v) => setState(() => _roomId = v.firstOrNull),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Lý do dời lịch',
              requiredField: true,
              controller: _reason,
              maxLines: 3,
              maxLength: 500,
              hint: 'VD: HLV có lịch thi chứng chỉ, phòng tập bảo trì…',
              validator: (v) => (v ?? '').trim().length < 3 ? 'Nhập lý do (tối thiểu 3 ký tự)' : null,
            ),
            if (formError != null) ...[const SizedBox(height: AppSpacing.sm), AlertBanner.error(message: formError!)],
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: 'Dời lịch & thông báo học viên',
              icon: AppIcons.reschedule,
              expand: true,
              loading: submitting,
              onPressed: _submit,
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
