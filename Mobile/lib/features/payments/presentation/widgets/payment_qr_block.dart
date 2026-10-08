import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/platform/media_service.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/payment.dart';
import '../providers/payment_providers.dart';

/// Ảnh QR + đếm ngược + Lưu ảnh / Chia sẻ (Q11).
class PaymentQrBlock extends ConsumerStatefulWidget {
  const PaymentQrBlock({super.key, required this.checkout});

  final Checkout checkout;

  @override
  ConsumerState<PaymentQrBlock> createState() => _PaymentQrBlockState();
}

class _PaymentQrBlockState extends ConsumerState<PaymentQrBlock> {
  bool _saving = false;

  Future<void> _save(Uint8List bytes) async {
    setState(() => _saving = true);
    await runAction(
      context,
      () => ref.read(mediaServiceProvider).saveImage(bytes, name: 'VietQR-${widget.checkout.orderCode}'),
      success: 'Đã lưu ảnh QR vào thư viện.',
    );
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.checkout;
    final image = ref.watch(qrImageProvider(c.paymentId));
    final col = context.colors;
    return AppCard(
      child: Column(
        children: [
          Row(
            children: [
              Icon(AppIcons.qr, size: AppSizes.icon, color: col.primary),
              const SizedBox(width: AppSpacing.xs),
              Expanded(child: Text('Quét mã bằng app ngân hàng', style: context.text.label)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: AppSizes.qrMax),
              child: AspectRatio(
                aspectRatio: 1,
                child: DecoratedBox(
                  position: DecorationPosition.foreground,
                  decoration: BoxDecoration(
                    borderRadius: AppRadius.cardAll,
                    border: Border.all(color: col.border),
                  ),
                  child: image.when(
                    loading: () => const Shimmer(
                      child: SkeletonBox(height: double.infinity, radius: AppRadius.card),
                    ),
                    error: (e, _) => ErrorState(
                      error: e,
                      compact: true,
                      onRetry: () => ref.invalidate(qrImageProvider(c.paymentId)),
                    ),
                    data: (bytes) => Semantics(
                      image: true,
                      label: 'Mã VietQR thanh toán ${Money.format(c.amount)}',
                      child: ClipRRect(
                        borderRadius: AppRadius.cardAll,
                        child: Image.memory(bytes, fit: BoxFit.contain, gaplessPlayback: true),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${c.bank.bankId} · ${c.bank.accountNumber}',
            textAlign: TextAlign.center,
            style: context.text.small.copyWith(color: col.textMuted, fontFeatures: kTabularFigures),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: AppButton.outline(
                  label: 'Lưu ảnh QR',
                  icon: AppIcons.download,
                  size: AppButtonSize.small,
                  loading: _saving,
                  onPressed: image.value == null ? null : () => _save(image.value!),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton.outline(
                  label: 'Chia sẻ',
                  icon: AppIcons.share,
                  size: AppButtonSize.small,
                  onPressed: image.value == null
                      ? null
                      : () => runAction(
                          context,
                          () => ref
                              .read(mediaServiceProvider)
                              .shareImage(
                                image.value!,
                                fileName: 'VietQR-${c.orderCode}.png',
                                text:
                                    'Chuyển ${Money.format(c.amount)} tới ${c.bank.accountNumber} (${c.bank.bankId}), nội dung: ${c.transferContent}',
                              ),
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
