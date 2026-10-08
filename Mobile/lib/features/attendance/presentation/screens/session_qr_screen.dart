import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../schedule/presentation/providers/schedule_providers.dart';
import '../../data/attendance_repository_provider.dart';
import '../../domain/entities/attendance.dart';
import '../../domain/repositories/attendance_repository.dart';

/// H04 — HLV chiếu QR điểm danh: tự đổi mã ~55s, mã dự phòng 6 ký tự, đếm số
/// học viên đã điểm danh. Dừng phát mã khi rời màn.
class SessionQrScreen extends ConsumerStatefulWidget {
  const SessionQrScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<SessionQrScreen> createState() => _SessionQrScreenState();
}

class _SessionQrScreenState extends ConsumerState<SessionQrScreen> {
  static const _countEvery = Duration(seconds: 4);
  QrTicket? _ticket;
  Object? _error;
  int _checkedIn = 0;
  DateTime? _nextRefresh;
  Timer? _refreshTimer;
  Timer? _countTimer;

  late final AttendanceRepository _repo;
  late final DataRevision _revision;

  @override
  void initState() {
    super.initState();
    _repo = ref.read(attendanceRepositoryProvider);
    _revision = ref.read(dataRevisionProvider.notifier);
    _generate();
    _countTimer = Timer.periodic(_countEvery, (_) => _count());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _countTimer?.cancel();
    _repo.stopQr(widget.sessionId);
    // Làm mới danh sách điểm danh sau khi đóng màn (ngoài chu kỳ dispose).
    Future.microtask(_revision.bump);
    super.dispose();
  }

  Future<void> _generate() async {
    try {
      final t = await _repo.generateQr(widget.sessionId);
      if (!mounted) return;
      setState(() {
        _ticket = t;
        _error = null;
        _nextRefresh = DateTime.now().add(QrTicket.refreshEvery);
      });
      _refreshTimer?.cancel();
      _refreshTimer = Timer(QrTicket.refreshEvery, _generate);
      await _count();
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _count() async {
    try {
      final n = await _repo.checkedInCount(widget.sessionId);
      if (mounted && n != _checkedIn) setState(() => _checkedIn = n);
    } on Object {
      // Bỏ qua lỗi đếm tạm thời; lần sau sẽ thử lại.
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(teachingSessionProvider(widget.sessionId)).value?.session;
    final c = context.colors;
    final t = _ticket;
    return AppScaffold(
      title: 'QR điểm danh',
      backgroundColor: c.primary,
      body: _error != null
          ? ColoredBox(
              color: c.background,
              child: ErrorState(error: AppFailure.from(_error!), onRetry: _generate),
            )
          : ListView(
              padding: EdgeInsets.all(context.screenPadding),
              children: [
                if (session != null) ...[
                  Text(
                    session.className,
                    textAlign: TextAlign.center,
                    style: context.text.title.copyWith(color: c.onPrimary),
                  ),
                  Text(
                    '${VnTime.timeRange(session.startTime, session.endTime)} · ${session.room.name}',
                    textAlign: TextAlign.center,
                    style: context.text.small.copyWith(color: c.onPrimary.withValues(alpha: 0.8)),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: const BoxDecoration(
                      color: AppPalette.white,
                      borderRadius: AppRadius.sheetAll,
                      boxShadow: AppShadows.raised,
                    ),
                    child: t == null
                        ? const SizedBox.square(
                            dimension: AppSpacing.xxl * 5,
                            child: Center(child: CircularProgressIndicator.adaptive()),
                          )
                        : Semantics(
                            label: 'Mã QR điểm danh buổi học',
                            image: true,
                            child: QrImageView(
                              data: t.qrToken,
                              size: AppSpacing.xxl * 5,
                              eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: c.primary),
                              dataModuleStyle: QrDataModuleStyle(
                                dataModuleShape: QrDataModuleShape.square,
                                color: c.primary,
                              ),
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                if (_nextRefresh != null)
                  Center(
                    child: CountdownText(
                      deadline: _nextRefresh!,
                      prefix: 'Mã tự đổi sau ',
                      style: context.text.label.copyWith(color: c.accent),
                    ),
                  ),
                const SizedBox(height: AppSpacing.lg),
                AppCard(
                  child: Column(
                    children: [
                      Text(
                        'Mã dự phòng (cho học viên không quét được)',
                        textAlign: TextAlign.center,
                        style: context.text.caption.copyWith(color: c.textMuted),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      SelectableText(
                        t?.manualCode.split('').join(' ') ?? '— — — — — —',
                        style: context.text.display.copyWith(letterSpacing: 4, fontFeatures: kTabularFigures),
                      ),
                      if (t != null)
                        Text(
                          'Hiệu lực đến ${VnTime.time(t.expiresAt)}',
                          style: context.text.caption.copyWith(color: c.textMuted),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  child: Row(
                    children: [
                      Icon(AppIcons.users, color: c.primary),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(child: Text('Đã điểm danh', style: context.text.bodyStrong)),
                      Text(
                        '$_checkedIn${session == null ? '' : '/${session.bookedCount}'}',
                        style: context.text.title.copyWith(fontFeatures: kTabularFigures),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton.secondary(label: 'Đổi mã ngay', icon: AppIcons.refresh, expand: true, onPressed: _generate),
              ],
            ),
    );
  }
}
