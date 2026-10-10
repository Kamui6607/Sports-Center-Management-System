import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_action.dart';
import '../shop_labels.dart';
import '../widgets/order_sections.dart';

/// S08 — Chi tiết đơn của tôi: timeline, QR + mã nhận hàng, mã vận đơn, hủy / yêu cầu hoàn tiền / đã nhận hàng,
/// đánh giá từng sản phẩm sau khi hoàn tất.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  Future<void> _cancel(BuildContext context, WidgetRef ref, ShopOrder o) async {
    final reason = await _askReason(
      context,
      title: 'Hủy đơn ${o.code}?',
      message: 'Hàng đang giữ cho bạn sẽ được nhả. Nếu bạn ĐÃ chuyển khoản, đừng hủy — hãy chờ hệ thống xác nhận.',
      confirm: 'Hủy đơn',
      required: false,
    );
    if (reason == null || !context.mounted) return;
    await runShopAction(
      context,
      ref,
      () => ref.read(shopRepositoryProvider).cancelOrder(o.id, reason: reason),
      success: 'Đã hủy đơn hàng.',
    );
  }

  Future<void> _requestRefund(BuildContext context, WidgetRef ref, ShopOrder o) async {
    final reason = await _askReason(
      context,
      title: 'Yêu cầu hủy & hoàn tiền',
      message:
          'Trung tâm chưa xử lý đơn nên bạn có thể yêu cầu hủy. Quản lý sẽ chuyển khoản hoàn tiền rồi xác nhận; '
          'nếu hàng đã được chuẩn bị, yêu cầu có thể bị từ chối.',
      confirm: 'Gửi yêu cầu',
      required: true,
    );
    if (reason == null || !context.mounted) return;
    await runShopAction(
      context,
      ref,
      () => ref.read(shopRepositoryProvider).requestRefund(o.id, reason),
      success: 'Đã gửi yêu cầu hoàn tiền.',
    );
  }

  Future<void> _confirmReceived(BuildContext context, WidgetRef ref, ShopOrder o) async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Bạn đã nhận được hàng?',
      message: 'Xác nhận để hoàn tất đơn ${o.code}. Sau đó bạn có thể đánh giá sản phẩm.',
      confirmLabel: 'Đã nhận hàng',
    );
    if (!ok || !context.mounted) return;
    await runShopAction(
      context,
      ref,
      () => ref.read(shopRepositoryProvider).confirmReceived(o.id),
      success: 'Đơn hàng đã hoàn tất. Cảm ơn bạn!',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(orderDetailProvider(orderId));
    final o = value.value;
    return AppScaffold(
      title: 'Chi tiết đơn hàng',
      bottomBar: o == null ? null : _actions(context, ref, o),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        data: (o) => RefreshableScroll(
          onRefresh: () => ref.refresh(orderDetailProvider(orderId).future),
          children: [
            OrderHeaderCard(order: o),
            const SizedBox(height: AppSpacing.md),
            ..._statusBlock(context, ref, o),
            const SectionHeader(title: 'Sản phẩm'),
            OrderItemsCard(
              order: o,
              lineTrailing: (l) => l.canReview
                  ? AppButton.secondary(
                      label: 'Đánh giá',
                      icon: AppIcons.star,
                      size: AppButtonSize.small,
                      onPressed: () => showOrderItemReviewSheet(context, line: l),
                    )
                  : null,
            ),
            const SizedBox(height: AppSpacing.md),
            SectionHeader(title: o.isPickup ? 'Người nhận' : 'Giao tới'),
            OrderRecipientCard(order: o),
            if (o.refunds.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              const SectionHeader(title: 'Hoàn tiền'),
              OrderRefundsCard(order: o),
            ],
            const SizedBox(height: AppSpacing.md),
            const SectionHeader(title: 'Lịch sử đơn hàng'),
            OrderTimeline(order: o),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }

  List<Widget> _statusBlock(BuildContext context, WidgetRef ref, ShopOrder o) {
    final c = context.colors;
    final block = switch (o.status) {
      ShopOrderStatus.pendingPayment when o.canPay => AlertBanner.warning(
        title: 'Chờ thanh toán',
        message: 'Chuyển khoản VietQR trước khi hết hạn giữ hàng.',
        action: CountdownText(
          deadline: o.paymentExpiresAt!,
          prefix: 'Còn ',
          style: context.text.label.copyWith(color: c.warningText),
          onExpired: () => ref.read(dataRevisionProvider.notifier).bump(),
        ),
      ),
      ShopOrderStatus.readyForPickup when o.pickup?.code != null => _PickupCard(order: o),
      ShopOrderStatus.paid => AlertBanner.info(
        message: o.isPickup
            ? 'Đã thanh toán. Trung tâm sẽ báo khi hàng sẵn sàng nhận tại quầy.'
            : 'Đã thanh toán. Trung tâm đang chuẩn bị giao hàng.',
      ),
      ShopOrderStatus.processing => const AlertBanner.info(message: 'Trung tâm đang đóng gói đơn hàng của bạn.'),
      ShopOrderStatus.shipping => AlertBanner.info(
        title: 'Đang giao hàng',
        message: o.trackingCode == null ? 'Đơn đang trên đường giao.' : 'Tra cứu với mã vận đơn ${o.trackingCode}.',
      ),
      ShopOrderStatus.delivered => const AlertBanner.success(
        message: 'Đơn đã được giao. Bấm "Đã nhận hàng" để hoàn tất (tự hoàn tất sau 3 ngày).',
      ),
      ShopOrderStatus.expired => const AlertBanner.warning(
        message: 'Đơn đã hết hạn thanh toán, hàng giữ đã được nhả. Nếu bạn ĐÃ chuyển khoản, trung tâm sẽ hoàn tiền.',
      ),
      ShopOrderStatus.cancelled => AlertBanner.error(
        message: o.cancelNote == null ? 'Đơn đã bị hủy.' : 'Đơn đã bị hủy: ${o.cancelNote}',
      ),
      ShopOrderStatus.notPickedUp => const AlertBanner.warning(
        message: 'Đơn quá hạn nhận tại quầy. Trung tâm sẽ hoàn tiền theo chính sách.',
      ),
      ShopOrderStatus.refundRequested => const AlertBanner.info(message: 'Yêu cầu hoàn tiền đang chờ Quản lý duyệt.'),
      ShopOrderStatus.refunded => const AlertBanner.success(message: 'Đơn đã được hoàn tiền.'),
      ShopOrderStatus.completed => const AlertBanner.success(
        message: 'Đơn đã hoàn tất. Hãy đánh giá sản phẩm bạn đã mua.',
      ),
      _ => null,
    };
    return [
      if (block != null) ...[block, const SizedBox(height: AppSpacing.md)],
    ];
  }

  Widget? _actions(BuildContext context, WidgetRef ref, ShopOrder o) {
    final buttons = <Widget>[
      if (o.canCancel) AppButton.outline(label: 'Hủy đơn', onPressed: () => _cancel(context, ref, o)),
      if (o.canPay && o.paymentId != null)
        AppButton(
          label: 'Thanh toán',
          icon: AppIcons.qr,
          onPressed: () => context.push(AppRoutes.payment(o.paymentId!)),
        ),
      if (o.canRequestRefund)
        AppButton.outline(
          label: 'Yêu cầu hủy & hoàn tiền',
          icon: AppIcons.refund,
          onPressed: () => _requestRefund(context, ref, o),
        ),
      if (o.canConfirmReceived)
        AppButton(label: 'Đã nhận hàng', icon: AppIcons.check, onPressed: () => _confirmReceived(context, ref, o)),
    ];
    if (buttons.isEmpty) return null;
    return StickyBottomBar(
      child: Row(
        children: [
          for (final (i, b) in buttons.indexed) ...[
            if (i > 0) const SizedBox(width: AppSpacing.sm),
            Expanded(child: b),
          ],
        ],
      ),
    );
  }
}

/// QR + mã nhận hàng (chủ đơn đưa cho nhân viên quét / đọc mã).
class _PickupCard extends StatelessWidget {
  const _PickupCard({required this.order});

  final ShopOrder order;

  @override
  Widget build(BuildContext context) {
    final p = order.pickup!;
    final c = context.colors;
    return AppCard(
      borderColor: c.primary,
      child: Column(
        children: [
          Text('Mã nhận hàng', style: context.text.titleSmall),
          const SizedBox(height: AppSpacing.sm),
          Container(
            decoration: const BoxDecoration(color: AppPalette.white, borderRadius: AppRadius.sheetAll),
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: QrImageView(
              data: p.qrPayload ?? p.code!,
              size: AppSpacing.xxl * 4,
              semanticsLabel: 'Mã QR nhận hàng',
              eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: c.primary),
              dataModuleStyle: QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: c.primary),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          CopyableField(label: 'Mã nhập tay', value: p.code!, emphasize: true),
          if (p.deadline != null)
            Text(
              'Nhận tại quầy trước ${VnTime.dateTime(p.deadline!)}. Nhân viên sẽ hỏi 4 số cuối SĐT người nhận.',
              textAlign: TextAlign.center,
              style: context.text.caption.copyWith(color: c.textMuted),
            ),
        ],
      ),
    );
  }
}

Future<String?> _askReason(
  BuildContext context, {
  required String title,
  required String message,
  required String confirm,
  required bool required,
}) => showAppBottomSheet<String>(
  context: context,
  title: title,
  builder: (_) => _ReasonForm(message: message, confirm: confirm, required: required),
);

class _ReasonForm extends StatefulWidget {
  const _ReasonForm({required this.message, required this.confirm, required this.required});

  final String message;
  final String confirm;
  final bool required;

  @override
  State<_ReasonForm> createState() => _ReasonFormState();
}

class _ReasonFormState extends State<_ReasonForm> {
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final v = _reason.text.trim();
    if (widget.required && v.length < 3) {
      setState(() => _error = 'Nhập lý do (tối thiểu 3 ký tự)');
      return;
    }
    Navigator.of(context).pop(v);
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(widget.message, style: context.text.body),
      const SizedBox(height: AppSpacing.md),
      AppTextField(
        label: widget.required ? 'Lý do' : 'Lý do (không bắt buộc)',
        controller: _reason,
        maxLines: 3,
        maxLength: 500,
        errorText: _error,
        requiredField: widget.required,
      ),
      const SizedBox(height: AppSpacing.md),
      AppButton(label: widget.confirm, expand: true, variant: AppButtonVariant.danger, onPressed: _submit),
      const SizedBox(height: AppSpacing.xs),
      AppButton.ghost(label: 'Quay lại', expand: true, onPressed: () => Navigator.of(context).pop()),
    ],
  );
}

/// Đánh giá một sản phẩm trong đơn đã hoàn tất (mỗi dòng đơn 1 lần).
Future<void> showOrderItemReviewSheet(BuildContext context, {required ShopOrderLine line}) => showAppBottomSheet<void>(
  context: context,
  title: 'Đánh giá ${line.productName}',
  builder: (_) => _ReviewForm(line: line),
);

class _ReviewForm extends ConsumerStatefulWidget {
  const _ReviewForm({required this.line});

  final ShopOrderLine line;

  @override
  ConsumerState<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<_ReviewForm> {
  int _rating = 0;
  bool _sending = false;
  String? _error;
  final _comment = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(shopRepositoryProvider).reviewItem(widget.line.id, _rating, _comment.text);
      ref.read(dataRevisionProvider.notifier).bump();
      if (!mounted) return;
      Navigator.of(context).pop();
      AppSnackbar.success(context, 'Cảm ơn bạn đã đánh giá!');
    } on Object catch (e) {
      if (mounted) setState(() => _error = ShopErrors.message(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      RatingInput(value: _rating, onChanged: (v) => setState(() => _rating = v)),
      const SizedBox(height: AppSpacing.md),
      AppTextField(label: 'Nhận xét (không bắt buộc)', controller: _comment, maxLines: 3, maxLength: 500),
      if (_error != null) ...[const SizedBox(height: AppSpacing.xs), AlertBanner.error(message: _error!)],
      const SizedBox(height: AppSpacing.md),
      AppButton(label: 'Gửi đánh giá', expand: true, loading: _sending, onPressed: _rating == 0 ? null : _submit),
    ],
  );
}
