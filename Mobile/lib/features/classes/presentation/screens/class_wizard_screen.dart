import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/course_repository_provider.dart';
import '../../domain/entities/coach_class.dart';
import '../providers/class_wizard_draft.dart';
import '../widgets/class_wizard_steps.dart';

/// H09 — Tạo khóa học (wizard 3 bước) / 9.5 — sửa & gửi lại khóa bị từ chối.
class ClassWizardScreen extends ConsumerStatefulWidget {
  const ClassWizardScreen({super.key, this.classId});

  /// `null` = tạo mới; có giá trị = sửa & gửi lại.
  final String? classId;

  @override
  ConsumerState<ClassWizardScreen> createState() => _ClassWizardScreenState();
}

class _ClassWizardScreenState extends ConsumerState<ClassWizardScreen> with SubmittingState {
  static const _steps = ['Thông tin', 'Lịch học', 'Xem lại'];
  final _infoForm = GlobalKey<FormState>();
  late final WizardData d = ref.read(classDraftStoreProvider).putIfAbsent(widget.classId ?? 'new', WizardData.new);
  late final _name = TextEditingController(text: d.name);
  late final _desc = TextEditingController(text: d.description);
  late final _capacity = TextEditingController(text: '${d.capacity}');
  late final _price = TextEditingController(text: Money.plain(d.price));
  late final _count = TextEditingController(text: '${d.sessionCount}');
  int _step = 0;
  String? _scheduleError;

  @override
  void initState() {
    super.initState();
    if (widget.classId != null && !d.loaded) _loadExisting();
  }

  Future<void> _loadExisting() async {
    final draft = await runAction(context, () => ref.read(courseRepositoryProvider).draftOf(widget.classId!));
    if (draft == null || !mounted) return;
    setState(() {
      d
        ..name = draft.name
        ..description = draft.description ?? ''
        ..sportIds = draft.sportIds
        ..classType = draft.classType
        ..areaType = draft.areaType
        ..capacity = draft.capacity
        ..price = draft.price
        ..roomId = draft.roomId
        ..sessions = draft.sessions.where((s) => s.start.isAfter(DateTime.now())).toList()
        ..loaded = true;
      _name.text = d.name;
      _desc.text = d.description;
      _capacity.text = '${d.capacity}';
      _price.text = Money.plain(d.price);
    });
  }

  @override
  void dispose() {
    d
      ..name = _name.text
      ..description = _desc.text;
    for (final c in [_name, _desc, _capacity, _price, _count]) {
      c.dispose();
    }
    super.dispose();
  }

  void _generate() {
    final start = d.startDate;
    final count = int.tryParse(_count.text) ?? 0;
    if (start == null || d.weekdays.isEmpty || count < 1) {
      setState(() => _scheduleError = 'Chọn ngày bắt đầu, ít nhất 1 thứ trong tuần và số buổi ≥ 1.');
      return;
    }
    final out = <DraftSession>[];
    var day = VnTime.startOfDay(start);
    while (out.length < count && out.length < 500) {
      if (d.weekdays.contains(VnTime.wall(day).weekday)) {
        final w = VnTime.wall(day);
        final s = VnTime.fromWall(w.year, w.month, w.day, d.startTime.hour, d.startTime.minute);
        out.add(DraftSession(s, s.add(Duration(minutes: d.durationMinutes))));
      }
      day = day.add(const Duration(days: 1));
    }
    setState(() {
      d
        ..sessionCount = count
        ..sessions = out;
      _scheduleError = null;
    });
  }

  bool _validateStep() {
    switch (_step) {
      case 0:
        final ok = _infoForm.currentState!.validate();
        if (d.sportIds.isEmpty) {
          AppSnackbar.error(context, 'Chọn ít nhất 1 bộ môn.');
          return false;
        }
        if (!ok) return false;
        d
          ..name = _name.text.trim()
          ..description = _desc.text
          ..capacity = int.parse(_capacity.text)
          ..price = Money.parseInput(_price.text) ?? 0;
        return true;
      case 1:
        if (d.roomId == null) {
          setState(() => _scheduleError = 'Chọn phòng tập.');
          return false;
        }
        if (d.sessions.isEmpty) {
          setState(() => _scheduleError = 'Tạo danh sách buổi học trước khi tiếp tục.');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  Future<void> _submit() async {
    final repo = ref.read(courseRepositoryProvider);
    final course = await submit(
      () => widget.classId == null ? repo.createClass(d.toDraft()) : repo.resubmitClass(widget.classId!, d.toDraft()),
    );
    if (course == null || !mounted) return;
    ref.read(classDraftStoreProvider).remove(widget.classId ?? 'new');
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã gửi khóa "${course.name}". Vui lòng chờ Quản lý duyệt.');
    context.pushReplacement(AppRoutes.coachClass(course.id));
  }

  @override
  Widget build(BuildContext context) {
    final last = _step == _steps.length - 1;
    return AppScaffold(
      title: widget.classId == null ? 'Tạo khóa học' : 'Sửa & gửi lại khóa học',
      bottomBar: WizardNavBar(
        showBack: _step > 0,
        onBack: submitting ? null : () => setState(() => _step--),
        primary: last
            ? AppButton(label: 'Gửi duyệt', icon: AppIcons.send, loading: submitting, onPressed: _submit)
            : AppButton(
                label: 'Tiếp tục',
                onPressed: () {
                  if (_validateStep()) setState(() => _step++);
                },
              ),
      ),
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          StepIndicator(steps: _steps, current: _step),
          const SizedBox(height: AppSpacing.lg),
          switch (_step) {
            0 => WizardInfoStep(
              data: d,
              update: setState,
              formKey: _infoForm,
              nameController: _name,
              descriptionController: _desc,
              capacityController: _capacity,
              priceController: _price,
              fieldErrors: fieldErrors,
            ),
            1 => WizardScheduleStep(
              data: d,
              update: setState,
              countController: _count,
              onGenerate: _generate,
              error: _scheduleError,
            ),
            _ => WizardReviewStep(data: d),
          },
          if (formError != null) ...[const SizedBox(height: AppSpacing.md), AlertBanner.error(message: formError!)],
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
