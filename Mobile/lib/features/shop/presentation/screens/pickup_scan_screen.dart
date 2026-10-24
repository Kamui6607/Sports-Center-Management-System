import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';
import '../shop_labels.dart';

/// R12 — Quét mã nhận hàng (Manager): quét QR của khách hoặc nhập tay ⇒ đối chiếu đơn ⇒ nhập 4 số cuối SĐT
/// người nhận ⇒ giao hàng (đơn hoàn tất, mã dùng một lần). Sai nhiều lần ⇒ BE tạm khóa xác nhận đơn.
class PickupScanScreen extends ConsumerStatefulWidget {
  const PickupScanScreen({super.key});

  @override
  ConsumerState<PickupScanScreen> createState() => _PickupScanScreenState();
}

class _PickupScanScreenState extends ConsumerState<PickupScanScreen> {
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

  Future<void> _lookup(String raw) async {
    if (_processing || raw.trim().isEmpty) return;
    setState(() => _processing = true);
    await _controller.stop();
    try {
      final found = await ref.read(shopRepositoryProvider).verifyPickup(raw);
      if (!mounted) return;
      final done = await showAppBottomSheet<bool>(
        context: context,
        title: 'Đối chiếu đơn ${found.order.code}',
        builder: (_) => _ConfirmPickup(lookup: found, code: raw),
      );
      if (done == true && mounted) {
        ref.read(dataRevisionProvider.notifier).bump();
        context.pushReplacement(AppRoutes.managerOrder(found.order.id));
        return;
      }
    } on Object catch (e) {
      if (mounted) AppSnackbar.error(context, ShopErrors.message(e));
    }
    if (!mounted) return;
    setState(() => _processing = false);
    await _controller.start();
  }

  Future<void> _enterCode() async {
    final code = await showAppBottomSheet<String>(
      context: context,
      title: 'Nhập mã nhận hàng',
      subtitle: 'Mã 8 ký tự trong màn Chi tiết đơn của khách',
      builder: (_) => const _ManualCodeForm(),
    );
    if (code != null) await _lookup(code);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: AppPalette.cameraOverlay,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: c.onPrimary,
        title: const Text('Quét mã nhận hàng'),
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
              if (value != null) _lookup(value);
            },
            errorBuilder: (context, error) => ColoredBox(
              color: c.surface,
              child: SafeArea(
                child: EmptyState(
                  icon: AppIcons.camera,
                  title: error.errorCode == MobileScannerErrorCode.permissionDenied
                      ? 'Chưa cấp quyền camera'
                      : 'Không mở được camera',
                  message: 'Bạn có thể nhập mã nhận hàng do khách cung cấp.',
                  actionLabel: 'Nhập mã',
                  onAction: _enterCode,
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
                children: [
                  Text(
                    'Quét QR trong màn "Chi tiết đơn hàng" của khách.',
                    textAlign: TextAlign.center,
                    style: context.text.small.copyWith(color: c.onPrimary),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppButton.secondary(
                    label: 'Nhập mã thủ công',
                    icon: AppIcons.keyboard,
                    expand: true,
                    onPressed: _processing ? null : _enterCode,
                  ),
                  if (Env.useMock) ...[
                    const SizedBox(height: AppSpacing.xs),
                    AppButton.outline(
                      label: 'DEV: Nhập mã mẫu K7M2Q9XA',
                      icon: AppIcons.zap,
                      expand: true,
                      onPressed: _processing ? null : () => _lookup('K7M2Q9XA'),
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

class _ManualCodeForm extends StatefulWidget {
  const _ManualCodeForm();

  @override
  State<_ManualCodeForm> createState() => _ManualCodeFormState();
}

class _ManualCodeFormState extends State<_ManualCodeForm> {
  final _code = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _submit() {
    final v = _code.text.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
    if (v.length != 8) {
      setState(() => _error = 'Mã gồm 8 ký tự');
      return;
    }
    Navigator.of(context).pop(v);
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AppTextField(
        label: 'Mã nhận hàng',
        controller: _code,
        autofocus: true,
        errorText: _error,
        textCapitalization: TextCapitalization.characters,
        inputFormatters: [LengthLimitingTextInputFormatter(12)],
        onSubmitted: (_) => _submit(),
      ),
      const SizedBox(height: AppSpacing.xs),
      Text(
        'Mã không dùng các ký tự 0, O, 1, I.',
        style: context.text.caption.copyWith(color: context.colors.textMuted),
      ),
      const SizedBox(height: AppSpacing.md),
      AppButton(label: 'Tra cứu đơn', expand: true, onPressed: _submit),
    ],
  );
}

class _ConfirmPickup extends ConsumerStatefulWidget {
  const _ConfirmPickup({required this.lookup, required this.code});

  final PickupLookup lookup;
  final String code;

  @override
  ConsumerState<_ConfirmPickup> createState() => _ConfirmPickupState();
}

class _ConfirmPickupState extends ConsumerState<_ConfirmPickup> {
  final _last4 = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _last4.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    if (!RegExp(r'^\d{4}$').hasMatch(_last4.text.trim())) {
      setState(() => _error = 'Nhập đúng 4 chữ số');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(shopRepositoryProvider).confirmPickup(widget.lookup.order.id, widget.code, _last4.text.trim());
      if (!mounted) return;
      AppSnackbar.success(context, 'Đã giao đơn ${widget.lookup.order.code}.');
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) setState(() => _error = ShopErrors.message(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.lookup.order;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          color: context.colors.surfaceMuted,
          child: Column(
            children: [
              KeyValueRow(label: 'Người nhận', value: o.recipientName ?? '—'),
              KeyValueRow(label: 'SĐT', value: o.recipientPhoneMasked ?? '—'),
              for (final l in o.lines)
                KeyValueRow(label: '${l.productName} × ${l.quantity}', value: Money.format(l.total)),
              KeyValueRow(label: 'Tổng đã thanh toán', value: Money.format(o.total), emphasize: true),
              if (o.pickupDeadline != null) KeyValueRow(label: 'Hạn nhận', value: VnTime.dateTime(o.pickupDeadline!)),
            ],
          ),
        ),
        if (widget.lookup.lockedUntil != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AlertBanner.error(message: 'Đơn đang tạm khóa xác nhận tới ${VnTime.time(widget.lookup.lockedUntil!)}.'),
        ],
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: '4 số cuối SĐT người nhận (hỏi khách)',
          controller: _last4,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
          errorText: _error,
          requiredField: true,
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: 'Giao hàng & hoàn tất',
          icon: AppIcons.check,
          expand: true,
          loading: _sending,
          onPressed: _confirm,
        ),
        const SizedBox(height: AppSpacing.xs),
        AppButton.ghost(label: 'Quét đơn khác', expand: true, onPressed: () => Navigator.of(context).pop(false)),
      ],
    );
  }
}
