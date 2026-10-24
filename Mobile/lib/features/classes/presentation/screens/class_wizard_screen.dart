import 'dart:async';

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
import '../providers/class_wizard_draft.dart';
import '../widgets/class_wizard_steps.dart';

/// H09 — Tạo khóa học (wizard 3 bước) / 9.5 — sửa & gửi lại khóa bị từ chối.
///
/// Tạo mới: TỰ LƯU bản nháp lên server (trạng thái DRAFT) sau mỗi thay đổi (~1,5s), khi chuyển bước và khi app
/// chuyển nền — thoát giữa chừng/lỗi vẫn mở lại được từ danh sách "Khóa học của tôi" ([draftId]).
class ClassWizardScreen extends ConsumerStatefulWidget {
  const ClassWizardScreen({super.key, this.classId, this.draftId});

  /// Sửa & gửi lại khóa PENDING/REJECTED (không dùng bản nháp server).
  final String? classId;

  /// Tiếp tục bản nháp đã lưu.
  final String? draftId;

  @override
  ConsumerState<ClassWizardScreen> createState() => _ClassWizardScreenState();
}

enum _SaveState { idle, saving, saved, failed }

class _ClassWizardScreenState extends ConsumerState<ClassWizardScreen> with SubmittingState, WidgetsBindingObserver {
  static const _steps = ['Thông tin', 'Lịch học', 'Xem lại'];
  static const _autosaveDelay = Duration(milliseconds: 1500);

  final _infoForm = GlobalKey<FormState>();
  late final String _storeKey = widget.classId ?? widget.draftId ?? 'new';
  late final WizardData d = ref.read(classDraftStoreProvider).putIfAbsent(_storeKey, WizardData.new);
  late final _name = TextEditingController(text: d.name);
  late final _desc = TextEditingController(text: d.description);
  late final _goal = TextEditingController(text: d.goal);
  late final _capacity = TextEditingController(text: '${d.capacity}');
  late final _price = TextEditingController(text: Money.plain(d.price));
  late final _count = TextEditingController(text: '${d.sessionCount}');
  String? _scheduleError;
  String? _goalError;
  Timer? _debounce;
  _SaveState _saveState = _SaveState.idle;
  DateTime? _savedAt;
  bool _submitted = false;

  /// Tạo mới (không phải sửa & gửi lại) ⇒ có tự lưu nháp.
  bool get _usesDraft => widget.classId == null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.draftId != null) d.draftId ??= widget.draftId;
    if (widget.classId != null && !d.loaded) _loadExisting();
    if (widget.draftId != null && !d.loaded) _loadDraft();
    for (final c in [_name, _desc, _goal, _capacity, _price, _count]) {
      c.addListener(_onTextChanged);
    }
  }

  Future<void> _loadExisting() async {
    final draft = await runAction(context, () => ref.read(courseRepositoryProvider).draftOf(widget.classId!));
    if (draft == null || !mounted) return;
    setState(() {
      d
        ..name = draft.name
        ..description = draft.description ?? ''
        ..goal = draft.goal ?? ''
        ..goalTags = [...draft.goalTags]
        ..targetLevel = draft.targetLevel
        ..classType = draft.classType
        ..capacity = draft.capacity
        ..price = draft.price
        ..roomId = draft.roomId
        ..sessions = draft.sessions.where((s) => s.start.isAfter(DateTime.now())).toList()
        ..loaded = true;
      _syncControllers();
    });
  }

  Future<void> _loadDraft() async {
    final repo = ref.read(courseRepositoryProvider);
    final result = await runAction(context, () async {
      final state = await repo.loadDraftState(widget.draftId!);
      if (state == null) return null;
      final course = (await repo.coachClasses()).where((c) => c.id == widget.draftId).firstOrNull;
      return (state: state, course: course);
    });
    if (!mounted) return;
    if (result == null || result.course == null) {
      AppSnackbar.info(context, 'Bản nháp không còn tồn tại hoặc đã được gửi duyệt.');
      context.pop();
      return;
    }
    setState(() {
      d.restore(result.course!, result.state);
      _syncControllers();
    });
  }

  void _syncControllers() {
    _name.text = d.name;
    _desc.text = d.description;
    _goal.text = d.goal;
    _capacity.text = '${d.capacity}';
    _price.text = Money.plain(d.price);
    _count.text = '${d.sessionCount}';
  }

  /// Chép giá trị ô nhập vào [d] (không validate — bản nháp được phép thiếu).
  void _readControllers() {
    d
      ..name = _name.text
      ..description = _desc.text
      ..goal = _goal.text
      ..capacity = int.tryParse(_capacity.text) ?? d.capacity
      ..price = Money.parseInput(_price.text) ?? d.price;
  }

  void _onTextChanged() => _scheduleAutosave();

  /// Mọi thay đổi trong wizard (chip, ngày, phòng…) đi qua đây để vẽ lại + hẹn tự lưu.
  void _update(VoidCallback change) {
    setState(change);
    _scheduleAutosave();
  }

  void _scheduleAutosave() {
    if (!_usesDraft || _submitted) return;
    _debounce?.cancel();
    _debounce = Timer(_autosaveDelay, _autosave);
  }

  Future<void> _autosave() async {
    _debounce?.cancel();
    if (!_usesDraft || _submitted) return;
    _readControllers();
    // Chưa nhập gì ⇒ chưa tạo bản nháp trên server.
    if (d.draftId == null && d.name.trim().isEmpty && d.goalTags.isEmpty && d.sessions.isEmpty) return;
    if (mounted) setState(() => _saveState = _SaveState.saving);
    try {
      final id = await ref.read(courseRepositoryProvider).saveDraft(d.draftId, d.toDraft(), d.toState());
      d.draftId = id;
      if (mounted) {
        setState(() {
          _saveState = _SaveState.saved;
          _savedAt = DateTime.now();
        });
      }
    } on Object {
      if (mounted) setState(() => _saveState = _SaveState.failed);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // App chuyển nền / sắp bị đóng ⇒ lưu ngay.
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) unawaited(_autosave());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _readControllers();
    // Thoát màn khi còn thay đổi chưa lưu ⇒ lưu lần cuối (không chờ).
    if (_debounce?.isActive ?? false) unawaited(_autosave());
    _debounce?.cancel();
    for (final c in [_name, _desc, _goal, _capacity, _price, _count]) {
      c
        ..removeListener(_onTextChanged)
        ..dispose();
    }
    super.dispose();
  }

  /// Sinh lại danh sách buổi khi đổi ngày bắt đầu / thứ / giờ / thời lượng / số buổi.
  void _regenerate() {
    d.sessionCount = int.tryParse(_count.text) ?? d.sessionCount;
    final ok = d.generateSessions();
    _scheduleError = ok || d.startDate == null ? null : 'Chọn ít nhất 1 thứ trong tuần và số buổi ≥ 1.';
  }

  bool _validateStep() {
    switch (d.step) {
      case 0:
        final ok = _infoForm.currentState!.validate();
        setState(() => _goalError = d.goalTags.isEmpty ? 'Chọn ít nhất 1 mục tiêu cho khóa học.' : null);
        if (!ok || d.goalTags.isEmpty) return false;
        d
          ..name = _name.text.trim()
          ..description = _desc.text
          ..goal = _goal.text
          ..capacity = int.parse(_capacity.text)
          ..price = Money.parseInput(_price.text) ?? 0;
        return true;
      case 1:
        if (d.roomId == null) {
          setState(() => _scheduleError = 'Chọn phòng tập.');
          return false;
        }
        if (d.sessions.isEmpty) {
          setState(() => _scheduleError = 'Chọn ngày bắt đầu, các thứ trong tuần và số buổi để tạo lịch.');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  void _goTo(int step) {
    _update(() => d.step = step);
    unawaited(_autosave());
  }

  Future<void> _submit() async {
    final repo = ref.read(courseRepositoryProvider);
    _debounce?.cancel();
    final draft = d.toDraft();
    final course = await submit(() async {
      if (widget.classId != null) return repo.resubmitClass(widget.classId!, draft);
      // Có bản nháp ⇒ gửi duyệt chính bản nháp (giữ nguyên id); chưa có ⇒ tạo thẳng.
      if (d.draftId == null) await _autosave();
      final id = d.draftId;
      return id == null ? repo.createClass(draft) : repo.submitDraft(id, draft);
    });
    if (course == null || !mounted) return;
    _submitted = true;
    ref.read(classDraftStoreProvider).remove(_storeKey);
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã gửi khóa "${course.name}". Vui lòng chờ Quản lý duyệt.');
    context.pushReplacement(AppRoutes.coachClass(course.id));
  }

  Widget _saveIndicator(BuildContext context) {
    final c = context.colors;
    final (icon, text, color) = switch (_saveState) {
      _SaveState.idle => (AppIcons.draft, 'Bản nháp được tự lưu khi bạn nhập', c.textMuted),
      _SaveState.saving => (AppIcons.upload, 'Đang lưu nháp…', c.textMuted),
      _SaveState.saved => (AppIcons.success, 'Đã lưu nháp lúc ${VnTime.time(_savedAt!)}', c.successText),
      _SaveState.failed => (
        AppIcons.offline,
        'Chưa lưu được nháp — sẽ thử lại khi bạn tiếp tục',
        context.tones.of(StatusTone.warning).foreground,
      ),
    };
    return Row(
      children: [
        Icon(icon, size: AppSizes.iconSm, color: color),
        const SizedBox(width: AppSpacing.xxs),
        Expanded(
          child: Text(text, style: context.text.caption.copyWith(color: color)),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final step = d.step;
    final last = step == _steps.length - 1;
    return AppScaffold(
      title: widget.classId == null
          ? (widget.draftId == null ? 'Tạo khóa học' : 'Tiếp tục bản nháp')
          : 'Sửa & gửi lại khóa học',
      bottomBar: WizardNavBar(
        showBack: step > 0,
        onBack: submitting ? null : () => _goTo(step - 1),
        primary: last
            ? AppButton(label: 'Gửi duyệt', icon: AppIcons.send, loading: submitting, onPressed: _submit)
            : AppButton(
                label: 'Tiếp tục',
                onPressed: () {
                  if (_validateStep()) _goTo(step + 1);
                },
              ),
      ),
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          StepIndicator(steps: _steps, current: step),
          if (_usesDraft) ...[const SizedBox(height: AppSpacing.xs), _saveIndicator(context)],
          const SizedBox(height: AppSpacing.lg),
          switch (step) {
            0 => WizardInfoStep(
              data: d,
              update: _update,
              formKey: _infoForm,
              nameController: _name,
              descriptionController: _desc,
              goalController: _goal,
              capacityController: _capacity,
              priceController: _price,
              fieldErrors: fieldErrors,
              goalError: _goalError,
            ),
            1 => WizardScheduleStep(
              data: d,
              update: (change) => _update(() {
                change();
                _regenerate();
              }),
              removeSession: (i) => _update(() => d.sessions = [...d.sessions]..removeAt(i)),
              countController: _count,
              onCountChanged: () => _update(_regenerate),
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
