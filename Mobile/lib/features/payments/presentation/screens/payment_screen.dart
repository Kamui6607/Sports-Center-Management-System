import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/payment_repository_provider.dart';
import '../../domain/entities/payment.dart';
import '../providers/payment_providers.dart';
import '../widgets/bank_transfer_card.dart';
import '../widgets/payment_qr_block.dart';
import '../widgets/payment_success_view.dart';
import '../widgets/payment_summary_card.dart';

/// P01 — Thanh toán VietQR (dùng chung khóa học & đơn sản phẩm).
/// App polling `GET /payments/sepay/:id` mỗi 4 giây tới khi có kết quả.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key, required this.paymentId});

  final String paymentId;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  static const _pollEvery = Duration(seconds: 4);
  Timer? _poll;
  PaymentStatus? _lastStatus;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(_pollEvery, (_) {
      final c = ref.read(checkoutProvider(widget.paymentId)).value;
      if (c == null || (c.status == PaymentStatus.pending && !c.isExpired(DateTime.now()))) {
        ref.invalidate(checkoutProvider(widget.paymentId));
      }
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _onStatus(Checkout c) {
    if (_lastStatus == c.status) return;
    final wasPending = _lastStatus == PaymentStatus.pending;
    _lastStatus = c.status;
    if (wasPending && c.status != PaymentStatus.pending) {
      // Kết quả mới ⇒ làm mới dữ liệu toàn app (lịch, khóa của tôi, đơn hàng…).
      ref.read(dataRevisionProvider.notifier).bump();
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(checkoutProvider(widget.paymentId));
    ref.listen(checkoutProvider(widget.paymentId), (_, next) {
      final c = next.value;
      if (c != null) _onStatus(c);
    });
    final checkout = value.value;
    final pending = checkout != null && checkout.status == PaymentStatus.pending && !checkout.isExpired(DateTime.now());
    return PopScope(
      canPop: !pending,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final leave = await showConfirmSheet(
          context: context,
          title: 'Rời màn thanh toán?',
          message:
              'Giao dịch vẫn được giữ đến ${VnTime.time(checkout!.expiresAt)}. Nếu đã chuyển khoản, đừng chuyển lại — hệ thống sẽ tự xác nhận.',
          confirmLabel: 'Rời màn hình',
          cancelLabel: 'Ở lại thanh toán',
        );
        if (leave && context.mounted) context.pop();
      },
      child: AppScaffold(
        title: 'Thanh toán VietQR',
        body: AsyncValueView(
          value: value,
          loading: const SkeletonDetail(),
          onRetry: () => ref.invalidate(checkoutProvider(widget.paymentId)),
          data: (c) => c.status == PaymentStatus.success ? PaymentSuccessView(checkout: c) : _PendingView(checkout: c),
        ),
      ),
    );
  }
}

class _PendingView extends ConsumerStatefulWidget {
  const _PendingView({required this.checkout});

  final Checkout checkout;

  @override
  ConsumerState<_PendingView> createState() => _PendingViewState();
}

class _PendingViewState extends ConsumerState<_PendingView> {
  bool _checking = false;
  bool _simulating = false;
  bool _renewing = false;

  Checkout get c => widget.checkout;

  Future<void> _checkNow() async {
    setState(() => _checking = true);
    final fresh = await runAction(context, () => ref.refresh(checkoutProvider(c.paymentId).future));
    if (!mounted) return;
    setState(() => _checking = false);
    if (fresh?.status == PaymentStatus.pending) {
      AppSnackbar.info(context, 'Đơn ${c.orderCode} vẫn đang chờ ngân hàng xác nhận.');
    }
  }

  Future<void> _simulate() async {
    setState(() => _simulating = true);
    await runAction(context, () => ref.read(paymentRepositoryProvider).simulatePaid(c.paymentId));
    if (!mounted) return;
    setState(() => _simulating = false);
    ref.invalidate(checkoutProvider(c.paymentId));
  }

  Future<void> _renew() async {
    final classId = c.classId;
    if (classId == null) {
      // Đơn hàng: xem chi tiết đơn (trạng thái hết hạn/hủy, đặt lại từ cửa hàng).
      final orderId = c.productOrderId;
      if (orderId != null) {
        context.pushReplacement(AppRoutes.order(orderId));
      } else {
        context.pop();
      }
      return;
    }
    setState(() => _renewing = true);
    final next = await runAction(context, () => ref.read(paymentRepositoryProvider).checkoutCourse(classId));
    if (!mounted) return;
    setState(() => _renewing = false);
    if (next != null) context.pushReplacement(AppRoutes.payment(next.paymentId));
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final expired = c.isExpired(now);
    final failed = c.status == PaymentStatus.failed || c.status == PaymentStatus.refunded;
    final open = !expired && !failed;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.all(context.screenPadding),
            children: [
              PaymentSummaryCard(checkout: c, now: now, onExpired: () => ref.invalidate(checkoutProvider(c.paymentId))),
              const SizedBox(height: AppSpacing.md),
              if (failed)
                const AlertBanner.error(
                  title: 'Thanh toán thất bại',
                  message: 'Giao dịch không thành công hoặc đã bị hủy. Vui lòng tạo đơn mới.',
                )
              else if (expired)
                const AlertBanner.warning(
                  title: 'Mã thanh toán đã hết hạn',
                  message: 'Nếu bạn ĐÃ chuyển khoản, đừng chuyển lại — giữ biên lai và liên hệ trung tâm để đối soát. Nếu chưa, hãy tạo đơn mới.',
                )
              else ...[
                // Hai cách trả tiền đứng liền nhau: quét QR, hoặc tự nhập thông tin.
                PaymentQrBlock(checkout: c),
                const SizedBox(height: AppSpacing.lg),
                const SectionHeader(title: 'Hoặc chuyển khoản thủ công'),
                BankTransferCard(checkout: c),
                const SizedBox(height: AppSpacing.md),
                const AlertBanner.info(
                  title: 'Đang chờ ngân hàng xác nhận',
                  message: 'Mở app ngân hàng, quét mã QR hoặc chuyển khoản đúng số tiền và nội dung. Trạng thái tự cập nhật sau khi nhận tiền. Nếu đã chuyển, KHÔNG chuyển lại.',
                ),
                // API thật (dev): BE hỗ trợ `POST /payments/sepay/mock-confirm` khi SEPAY_MOCK_MODE=true.
                if (Env.useMock || Env.environment == AppEnvironment.dev) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppButton.ghost(
                    label: 'DEV: Giả lập SePay đã thu tiền',
                    icon: AppIcons.zap,
                    expand: true,
                    loading: _simulating,
                    onPressed: _simulate,
                  ),
                ],
              ],
            ],
          ),
        ),
        StickyBottomBar(
          child: open
              ? AppButton(
                  label: 'Kiểm tra lại',
                  icon: AppIcons.refresh,
                  expand: true,
                  loading: _checking,
                  onPressed: _checkNow,
                )
              : AppButton(
                  label: c.classId != null ? 'Tạo đơn mới' : 'Xem đơn hàng',
                  icon: AppIcons.refresh,
                  expand: true,
                  loading: _renewing,
                  onPressed: _renew,
                ),
        ),
      ],
    );
  }
}
