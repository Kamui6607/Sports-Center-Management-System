import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/config/env.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../mock/dev_tools.dart';
import '../../../schedule/presentation/session_labels.dart';
import '../../data/attendance_repository_provider.dart';
import '../../domain/entities/attendance.dart';

/// M11 — Member quét QR điểm danh (camera) hoặc nhập mã dự phòng 6 ký tự.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen> {
  final _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool _processing = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handle(Future<CheckInResult> Function() action) async {
    if (_processing) return;
    setState(() => _processing = true);
    await _controller.stop();
    try {
      final result = await action();
      ref.read(dataRevisionProvider.notifier).bump();
      if (!mounted) return;
      await _showResult(result);
      if (mounted) context.pop();
    } on Object catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, AppFailure.from(e));
      setState(() => _processing = false);
      await _controller.start();
    }
  }

  void _onDetect(BarcodeCapture capture) {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null || value.isEmpty) return;
    _handle(() => ref.read(attendanceRepositoryProvider).scanQr(value));
  }

  Future<void> _enterCode() async {
    final code = await showAppBottomSheet<String>(
      context: context,
      title: 'Nhập mã dự phòng',
      subtitle: 'Mã 6 ký tự do HLV hiển thị cùng mã QR',
      builder: (_) => const _CodeForm(),
    );
    if (code != null) await _handle(() => ref.read(attendanceRepositoryProvider).submitCode(code));
  }

  Future<void> _showResult(CheckInResult r) => showAppBottomSheet<void>(
    context: context,
    title: 'Điểm danh thành công',
    builder: (ctx) {
      final success = ctx.tones.of(StatusTone.success);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(color: success.background, shape: BoxShape.circle),
              child: Icon(AppIcons.success, size: AppSpacing.xxl, color: success.foreground),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(r.className, textAlign: TextAlign.center, style: ctx.text.title),
          Text(
            '${VnTime.sessionLabel(r.startTime, r.endTime)} · ${r.roomName}',
            textAlign: TextAlign.center,
            style: ctx.text.small,
          ),
          const SizedBox(height: AppSpacing.sm),
          Center(child: r.status.status.tag()),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Hoàn tất', expand: true, onPressed: () => Navigator.of(ctx).pop()),
        ],
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: AppPalette.cameraOverlay,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: c.onPrimary,
        title: const Text('Quét QR điểm danh'),
        leading: IconButton(tooltip: 'Đóng', icon: const Icon(AppIcons.close), onPressed: () => context.pop()),
        actions: [
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) => IconButton(
              tooltip: state.torchState == TorchState.on ? 'Tắt đèn' : 'Bật đèn',
              icon: Icon(state.torchState == TorchState.on ? AppIcons.flashOff : AppIcons.flash),
              onPressed: state.torchState == TorchState.unavailable ? null : _controller.toggleTorch,
            ),
          ),
        ],
      ),
      extendBodyBehindAppBar: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) => _CameraError(error: error, onEnterCode: _enterCode),
          ),
          IgnorePointer(
            child: CustomPaint(
              painter: _FramePainter(color: c.accent, overlay: AppPalette.cameraOverlay),
            ),
          ),
          if (_processing) const Center(child: CircularProgressIndicator.adaptive()),
          Positioned(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            bottom: AppSpacing.xl,
            child: SafeArea(
              child: Column(
                children: [
                  Text(
                    'Hướng camera vào mã QR HLV đang chiếu. Mã tự đổi sau mỗi ~55 giây.',
                    textAlign: TextAlign.center,
                    style: context.text.small.copyWith(color: c.onPrimary),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppButton.secondary(
                    label: 'Nhập mã dự phòng',
                    icon: AppIcons.keyboard,
                    expand: true,
                    onPressed: _processing ? null : _enterCode,
                  ),
                  if (Env.useMock) ...[
                    const SizedBox(height: AppSpacing.xs),
                    AppButton.outline(
                      label: 'DEV: Giả lập quét QR buổi đang diễn ra',
                      icon: AppIcons.zap,
                      expand: true,
                      onPressed: _processing
                          ? null
                          : () => _handle(() async {
                              final token = ref.read(mockDevToolsProvider).demoQrTokenForCurrentMember();
                              return ref.read(attendanceRepositoryProvider).scanQr(token);
                            }),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.error, required this.onEnterCode});

  final MobileScannerException error;
  final VoidCallback onEnterCode;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return ColoredBox(
      color: context.colors.surface,
      child: SafeArea(
        child: EmptyState(
          icon: AppIcons.camera,
          title: denied ? 'Chưa cấp quyền camera' : 'Không mở được camera',
          message: denied
              ? 'Vào Cài đặt ⇒ Ứng dụng ⇒ Pulse ⇒ Quyền để bật Camera, hoặc dùng mã dự phòng.'
              : 'Camera đang bận hoặc không khả dụng. Bạn có thể nhập mã dự phòng.',
          actionLabel: 'Nhập mã dự phòng',
          onAction: onEnterCode,
        ),
      ),
    );
  }
}

class _CodeForm extends StatefulWidget {
  const _CodeForm();

  @override
  State<_CodeForm> createState() => _CodeFormState();
}

class _CodeFormState extends State<_CodeForm> {
  String _code = '';
  String? _error;

  void _submit() {
    final error = Validators.attendanceCode(_code);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.of(context).pop(_code.toUpperCase());
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      CodeInput(numeric: false, errorText: _error, onChanged: (v) => _code = v, onCompleted: (v) => _code = v),
      const SizedBox(height: AppSpacing.xs),
      Text(
        'Mã không dùng các ký tự 0, O, 1, I. Mã có hiệu lực khoảng 90 giây.',
        style: context.text.caption.copyWith(color: context.colors.textMuted),
      ),
      const SizedBox(height: AppSpacing.lg),
      AppButton(label: 'Điểm danh', expand: true, onPressed: _submit),
    ],
  );
}

/// Khung ngắm ở giữa màn camera.
class _FramePainter extends CustomPainter {
  _FramePainter({required this.color, required this.overlay});

  final Color color;
  final Color overlay;

  @override
  void paint(Canvas canvas, Size size) {
    final side = size.shortestSide * 0.68;
    final rect = Rect.fromCenter(center: size.center(Offset(0, -size.height * 0.06)), width: side, height: side);
    final hole = RRect.fromRectAndRadius(rect, const Radius.circular(AppRadius.sheet));
    canvas.drawPath(
      Path.combine(PathOperation.difference, Path()..addRect(Offset.zero & size), Path()..addRRect(hole)),
      Paint()..color = overlay,
    );
    canvas.drawRRect(
      hole,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(covariant _FramePainter old) => old.color != color;
}
