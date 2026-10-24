import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_action.dart';
import '../shop_labels.dart';
import '../widgets/order_sections.dart';
import 'orders_screen.dart';

/// R10 — Đơn hàng (Manager): lọc nhóm trạng thái / hình thức nhận, tìm mã đơn / tên / SĐT / vận đơn.
class ManagerOrdersScreen extends ConsumerStatefulWidget {
  const ManagerOrdersScreen({super.key});

  @override
  ConsumerState<ManagerOrdersScreen> createState() => _ManagerOrdersScreenState();
}

class _ManagerOrdersScreenState extends ConsumerState<ManagerOrdersScreen> {
  OrderGroup? _group = OrderGroup.active;
  FulfillmentType? _type;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final filter = (group: _group, type: _type, search: _search);
    final value = ref.watch(managerOrdersProvider(filter));
    return AppScaffold(
      title: 'Đơn hàng',
      actions: [
        AppIconButton(
          icon: AppIcons.scan,
          tooltip: 'Quét mã nhận hàng',
          onPressed: () => context.push(AppRoutes.pickupScan),
        ),
        AppIconButton(icon: AppIcons.inventory, tooltip: 'Tồn kho', onPressed: () => context.push(AppRoutes.inventory)),
      ],
      body: Column(
        children: [
          Container(
            color: context.colors.surface,
            padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.xs, context.screenPadding, AppSpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SearchField(
                  hint: 'Mã đơn, tên, SĐT, mã vận đơn…',
                  initial: _search,
                  onChanged: (v) => setState(() => _search = v),
                ),
                const SizedBox(height: AppSpacing.xs),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final g in [null, ...OrderGroup.values]) ...[
                        AppChip(
                          label: g?.label ?? 'Tất cả',
                          selected: _group == g,
                          onTap: () => setState(() => _group = g),
                        ),
                        const SizedBox(width: AppSpacing.xs),
                      ],
                      Container(width: 1, height: AppSpacing.lg, color: context.colors.border),
                      const SizedBox(width: AppSpacing.xs),
                      for (final t in FulfillmentType.values) ...[
                        AppChip(
                          label: t == FulfillmentType.pickup ? 'Tại quầy' : 'Giao hàng',
                          icon: t.icon,
                          selected: _type == t,
                          onTap: () => setState(() => _type = _type == t ? null : t),
                        ),
                        const SizedBox(width: AppSpacing.xs),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(managerOrdersProvider(filter)),
              isEmpty: (p) => p.items.isEmpty,
              empty: const EmptyState(icon: AppIcons.order, title: 'Không có đơn phù hợp'),
              data: (page) => RefreshableList(
                onRefresh: () => ref.refresh(managerOrdersProvider(filter).future),
                itemCount: page.items.length,
                itemBuilder: (context, i) => OrderCard(
                  order: page.items[i],
                  showBuyer: true,
                  onTap: () => context.push(AppRoutes.managerOrder(page.items[i].id)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// R11 — Chi tiết đơn (Manager): người mua, chuyển trạng thái theo máy trạng thái, nhập mã vận đơn,
/// mở màn quét mã khi đơn chờ nhận tại quầy. Không hiển thị mã nhận hàng.
class ManagerOrderDetailScreen extends ConsumerWidget {
  const ManagerOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  Future<void> _transition(BuildContext context, WidgetRef ref, ShopOrder o, ShopOrderStatus to) async {
    final input = await showAppBottomSheet<({String? reason, String? tracking, String? carrier})>(
      context: context,
      title: to.actionLabel,
      builder: (_) => _TransitionForm(order: o, to: to),
    );
    if (input == null || !context.mounted) return;
    await runShopAction(
      context,
      ref,
      () => ref
          .read(shopRepositoryProvider)
          .transition(o.id, to, reason: input.reason, trackingCode: input.tracking, carrier: input.carrier),
      success: 'Đã cập nhật đơn ${o.code}.',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(managerOrderProvider(orderId));
    final o = value.value;
    return AppScaffold(
      title: 'Xử lý đơn hàng',
      bottomBar: o == null ? null : _actions(context, ref, o),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(managerOrderProvider(orderId)),
        data: (o) => RefreshableScroll(
          onRefresh: () => ref.refresh(managerOrderProvider(orderId).future),
          children: [
            OrderHeaderCard(order: o),
            const SizedBox(height: AppSpacing.md),
            if (o.status == ShopOrderStatus.readyForPickup && o.pickup != null) ...[
              AlertBanner(
                tone: o.pickup!.lockedUntil == null ? StatusTone.info : StatusTone.danger,
                title: 'Chờ khách nhận tại quầy',
                message: [
                  if (o.pickup!.deadline != null) 'Hạn nhận: ${VnTime.dateTime(o.pickup!.deadline!)}.',
                  if (o.pickup!.failedAttempts > 0) 'Đã nhập sai ${o.pickup!.failedAttempts} lần.',
                  if (o.pickup!.lockedUntil != null) 'Tạm khóa xác nhận tới ${VnTime.time(o.pickup!.lockedUntil!)}.',
                ].join(' '),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            const SectionHeader(title: 'Người mua'),
            AppCard(
              child: Column(
                children: [
                  if (o.buyerName != null) InfoRow(icon: AppIcons.user, text: o.buyerName!),
                  if (o.buyerPhone != null) InfoRow(icon: AppIcons.phone, text: o.buyerPhone!),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            SectionHeader(title: o.isPickup ? 'Người nhận' : 'Giao tới'),
            OrderRecipientCard(order: o, showFullPhone: !o.isPickup),
            const SizedBox(height: AppSpacing.md),
            const SectionHeader(title: 'Sản phẩm'),
            OrderItemsCard(order: o),
            if (o.refunds.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              const SectionHeader(title: 'Hoàn tiền'),
              OrderRefundsCard(order: o),
              const SizedBox(height: AppSpacing.xs),
              AppButton.outline(
                label: 'Mở yêu cầu hoàn tiền',
                icon: AppIcons.refund,
                expand: true,
                onPressed: () => context.push(AppRoutes.reviewRefund(o.refunds.first.id)),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            const SectionHeader(title: 'Lịch sử'),
            OrderTimeline(order: o),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }

  Widget? _actions(BuildContext context, WidgetRef ref, ShopOrder o) {
    final positive = o.allowedTransitions.where((s) => !s.isNegative).toList();
    final negative = o.allowedTransitions.where((s) => s.isNegative).toList();
    final pickupPending = o.status == ShopOrderStatus.readyForPickup;
    if (positive.isEmpty && negative.isEmpty && !pickupPending) return null;
    return StickyBottomBar(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (pickupPending)
            AppButton(
              label: 'Quét mã nhận hàng',
              icon: AppIcons.scan,
              expand: true,
              onPressed: () => context.push(AppRoutes.pickupScan),
            ),
          for (final s in positive) ...[
            AppButton(label: s.actionLabel, expand: true, onPressed: () => _transition(context, ref, o, s)),
          ],
          if (negative.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xxs),
            Row(
              children: [
                for (final (i, s) in negative.indexed) ...[
                  if (i > 0) const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: AppButton.ghost(
                      label: s.actionLabel,
                      size: AppButtonSize.small,
                      onPressed: () => _transition(context, ref, o, s),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TransitionForm extends StatefulWidget {
  const _TransitionForm({required this.order, required this.to});

  final ShopOrder order;
  final ShopOrderStatus to;

  @override
  State<_TransitionForm> createState() => _TransitionFormState();
}

class _TransitionFormState extends State<_TransitionForm> {
  final _reason = TextEditingController();
  final _tracking = TextEditingController();
  final _carrier = TextEditingController();
  String? _error;

  bool get _needsTracking => widget.to == ShopOrderStatus.shipping;

  @override
  void dispose() {
    for (final c in [_reason, _tracking, _carrier]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (_needsTracking && _tracking.text.trim().length < 3) {
      setState(() => _error = 'Nhập mã vận đơn');
      return;
    }
    if (widget.to.isNegative && _reason.text.trim().length < 3) {
      setState(() => _error = 'Nhập lý do (tối thiểu 3 ký tự)');
      return;
    }
    Navigator.of(context).pop((
      reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
      tracking: _needsTracking ? _tracking.text.trim() : null,
      carrier: _needsTracking && _carrier.text.trim().isNotEmpty ? _carrier.text.trim() : null,
    ));
  }

  String get _explain => switch (widget.to) {
    ShopOrderStatus.readyForPickup =>
      'Hệ thống tạo mã nhận hàng mới và báo khách. Quá hạn nhận (mặc định 3 ngày) đơn tự chuyển "Quá hạn nhận".',
    ShopOrderStatus.processing => 'Bắt đầu đóng gói đơn giao hàng. Khách không tự hủy được nữa.',
    ShopOrderStatus.shipping => 'Nhập mã vận đơn để khách tra cứu. Từ bước này đơn không thể hủy.',
    ShopOrderStatus.delivered => 'Xác nhận đơn vị vận chuyển đã giao. Khách xác nhận hoặc tự hoàn tất sau 3 ngày.',
    ShopOrderStatus.completed => 'Hoàn tất đơn giao hàng.',
    ShopOrderStatus.cancelled => 'Hủy đơn chưa thanh toán và nhả hàng đang giữ.',
    ShopOrderStatus.refundRequested =>
      'Hủy đơn đã thanh toán: tạo yêu cầu hoàn toàn bộ tiền. Chuyển khoản cho khách rồi duyệt ở mục Hoàn tiền.',
    ShopOrderStatus.notPickedUp => 'Khách không đến lấy: hàng trả lại kệ và tạo yêu cầu hoàn tiền theo chính sách.',
    _ => 'Chuyển trạng thái đơn.',
  };

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(_explain, style: context.text.body),
      const SizedBox(height: AppSpacing.md),
      if (_needsTracking) ...[
        AppTextField(label: 'Mã vận đơn', controller: _tracking, requiredField: true, errorText: _error),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(label: 'Đơn vị vận chuyển (không bắt buộc)', controller: _carrier, hint: 'VD GHN, GHTK'),
        const SizedBox(height: AppSpacing.sm),
      ],
      AppTextField(
        label: widget.to.isNegative ? 'Lý do' : 'Ghi chú (không bắt buộc)',
        controller: _reason,
        maxLines: 2,
        maxLength: 500,
        requiredField: widget.to.isNegative,
        errorText: _needsTracking ? null : _error,
      ),
      const SizedBox(height: AppSpacing.md),
      AppButton(
        label: widget.to.actionLabel,
        expand: true,
        variant: widget.to.isNegative ? AppButtonVariant.danger : AppButtonVariant.primary,
        onPressed: _submit,
      ),
    ],
  );
}
