import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/coach_term_repository_provider.dart';
import '../../domain/entities/coach_term.dart';
import '../term_labels.dart';

/// Xin nghỉ phép / ốm: chọn khoảng ngày + lý do. Nghỉ được duyệt gia hạn hạn tạo khóa của kỳ.
class CoachLeaveFormScreen extends ConsumerStatefulWidget {
  const CoachLeaveFormScreen({super.key});

  @override
  ConsumerState<CoachLeaveFormScreen> createState() => _CoachLeaveFormScreenState();
}

class _CoachLeaveFormScreenState extends ConsumerState<CoachLeaveFormScreen> with SubmittingState {
  final _reason = TextEditingController();
  late DateTime _start;
  late DateTime _end;
  LeaveKind _kind = LeaveKind.sick;
  String? _error;

  @override
  void initState() {
    super.initState();
    final today = VnTime.startOfDay(DateTime.now());
    _start = today;
    _end = today;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  int get _days => _end.difference(_start).inDays + 1;

  String? _validate() {
    if (_end.isBefore(_start)) return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.';
    if (_days > 120) return 'Đơn nghỉ tối đa 120 ngày.';
    if (_reason.text.trim().length < 3) return 'Hãy nhập lý do (tối thiểu 3 ký tự).';
    return null;
  }

  Future<void> _submit() async {
    final problem = _validate();
    setState(() => _error = problem);
    if (problem != null) return;
    final leave = await submit(
      () => ref
          .read(coachTermRepositoryProvider)
          .createLeave(startDate: _start, endDate: _end, kind: _kind, reason: _reason.text),
    );
    if (!mounted) return;
    if (leave == null) {
      AppSnackbar.error(context, formError ?? 'Không gửi được đơn nghỉ. Vui lòng thử lại.');
      return;
    }
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã gửi đơn nghỉ — chờ Quản lý duyệt.');
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final today = VnTime.startOfDay(DateTime.now());
    return AppScaffold(
      title: 'Xin nghỉ phép',
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          const AlertBanner.info(
            message:
                'Nghỉ được duyệt: hạn tạo khóa của kỳ được cộng thêm đúng số ngày nghỉ, buổi hủy trong thời gian nghỉ không bị tính. '
                'Nghỉ từ nửa kỳ trở lên sẽ được miễn cả kỳ.',
          ),
          const SizedBox(height: AppSpacing.md),
          DateTimeField(
            label: 'Từ ngày',
            requiredField: true,
            value: _start,
            firstDate: today.subtract(const Duration(days: 14)),
            lastDate: today.add(const Duration(days: 400)),
            onChanged: (d) => setState(() {
              _start = VnTime.startOfDay(d);
              if (_end.isBefore(_start)) _end = _start;
            }),
            errorText: fieldErrors['startDate'],
          ),
          const SizedBox(height: AppSpacing.sm),
          DateTimeField(
            label: 'Đến ngày',
            requiredField: true,
            value: _end,
            firstDate: _start,
            lastDate: today.add(const Duration(days: 520)),
            onChanged: (d) => setState(() => _end = VnTime.startOfDay(d)),
            errorText: fieldErrors['endDate'],
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            _end.isBefore(_start) ? '' : 'Tổng cộng $_days ngày (${VnTime.date(_start)} – ${VnTime.date(_end)})',
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Loại', style: context.text.label),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            children: [
              for (final k in LeaveKind.values)
                ChoiceChip(
                  label: Text(leaveKindLabel(k)),
                  selected: _kind == k,
                  onSelected: (_) => setState(() => _kind = k),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Lý do',
            controller: _reason,
            requiredField: true,
            minLines: 3,
            maxLines: 5,
            maxLength: 500,
            hint: 'VD: Ốm sốt xuất huyết, có giấy bác sĩ',
            errorText: fieldErrors['reason'],
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(_error!, style: context.text.small.copyWith(color: c.errorText)),
            ),
          if (formError != null && fieldErrors.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: AlertBanner.error(message: formError!),
            ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Gửi đơn nghỉ', expand: true, loading: submitting, onPressed: submitting ? null : _submit),
        ],
      ),
    );
  }
}
