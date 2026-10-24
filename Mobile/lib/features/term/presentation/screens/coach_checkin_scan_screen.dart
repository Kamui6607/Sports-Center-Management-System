import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/config/env.dart';
import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/coach_term_mock_repository.dart';
import '../../data/coach_term_repository_provider.dart';

/// HLV quét QR check-in do Quản lý hiển thị ở quầy. Thành công ⇒ đóng màn và trả [CheckInResult] cho màn trước.
class CoachCheckInScanScreen extends ConsumerStatefulWidget {
  const CoachCheckInScanScreen({super.key});

  @override
  ConsumerState<CoachCheckInScanScreen> createState() => _CoachCheckInScanScreenState();
}

class _CoachCheckInScanScreenState extends ConsumerState<CoachCheckInScanScreen> {
  final _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  final _manual = TextEditingController();
  bool _processing = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    _manual.dispose();
    super.dispose();
  }

  Future<void> _submit(String raw) async {
    // Mã dán từ chat/email hay dính xuống dòng hoặc khoảng trắng giữa chuỗi.
    final token = raw.replaceAll(RegExp(r'\s+'), '');
    if (_processing || token.isEmpty) return;
    setState(() {
      _processing = true;
      _error = null;
    });
    await _controller.stop();
    try {
      final result = await ref.read(coachTermRepositoryProvider).checkIn(token);
      if (!mounted) return;
      context.pop(result);
    } on Object catch (e) {
      if (!mounted) return;
      final f = AppFailure.from(e);
      setState(() {
        _processing = false;
        _error = f.message;
      });
      await _controller.start();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: AppPalette.cameraOverlay,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: c.onPrimary,
        title: const Text('Quét QR check-in'),
        leading: IconButton(tooltip: 'Đóng', icon: const Icon(AppIcons.close), onPressed: () => context.pop()),
      ),
      extendBodyBehindAppBar: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              final value = capture.barcodes.firstOrNull?.rawValue;
              if (value != null) _submit(value);
            },
            errorBuilder: (context, error) => ColoredBox(
              color: c.surface,
              child: SafeArea(
                child: EmptyState(
                  icon: AppIcons.camera,
                  title: error.errorCode == MobileScannerErrorCode.permissionDenied
                      ? 'Chưa cấp quyền camera'
                      : 'Không mở được camera',
                  message: 'Cấp quyền camera trong cài đặt hoặc nhập mã bên dưới.',
                ),
              ),
            ),
          ),
          if (_processing) const Center(child: CircularProgressIndicator.adaptive()),
          Positioned(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            bottom: AppSpacing.xl,
            child: SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: AlertBanner.error(message: _error!),
                    ),
                  Text(
                    'Quét mã QR đang hiển thị ở quầy (trên màn hình của Quản lý). Mã đổi mỗi phút.',
                    textAlign: TextAlign.center,
                    style: context.text.small.copyWith(color: c.onPrimary),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  TextButton.icon(
                    icon: Icon(AppIcons.keyboard, color: c.onPrimary),
                    label: Text('Nhập mã thủ công', style: TextStyle(color: c.onPrimary)),
                    onPressed: _processing ? null : _askManual,
                  ),
                  if (Env.useMock)
                    AppButton.outline(
                      label: 'DEV: Check-in giả lập',
                      icon: AppIcons.zap,
                      expand: true,
                      onPressed: _processing ? null : () => _submit('${CoachTermMockRepository.qrPrefix}demo'),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _askManual() async {
    _manual.clear();
    final value = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.xs,
          AppSpacing.lg,
          MediaQuery.of(ctx).viewInsets.bottom + AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppTextField(
              label: 'Mã check-in',
              controller: _manual,
              hint: 'Dán mã do Quản lý cung cấp',
              keyboardType: TextInputType.visiblePassword,
              minLines: 2,
              maxLines: 4,
              autofocus: true,
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(label: 'Check-in', expand: true, onPressed: () => Navigator.of(ctx).pop(_manual.text)),
          ],
        ),
      ),
    );
    if (value != null && mounted) await _submit(value);
  }
}
