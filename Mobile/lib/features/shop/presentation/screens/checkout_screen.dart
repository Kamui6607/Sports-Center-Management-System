import 'dart:async';
import 'dart:math';

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
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_labels.dart';
import 'address_screens.dart';

/// S06 — Thanh toán: nhận tại trung tâm / giao hàng, sổ địa chỉ, người nhận, ghi chú, phí ship, tổng tiền.
/// Server tính lại mọi khoản; app gửi tổng đã xem (`expectedTotal`) + `Idempotency-Key` ⇒ chuyển màn VietQR.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, this.cartProductIds = const [], this.buyNowProductId, this.buyNowQuantity = 1});

  /// Đặt từ giỏ (rỗng = cả giỏ).
  final List<String> cartProductIds;

  /// Mua ngay một sản phẩm (không đụng giỏ).
  final String? buyNowProductId;
  final int buyNowQuantity;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  late CheckoutRequest _request;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _note = TextEditingController();
  AsyncValue<CheckoutPreview> _preview = const AsyncLoading();
  bool _placing = false;
  bool _priceChanged = false;
  String? _error;
  Timer? _debounce;
  int _seq = 0;

  /// Khóa chống đặt trùng: giữ nguyên khi bấm lại (mạng chập chờn), đổi khi nội dung đơn đổi.
  String _idempotencyKey = _newKey();

  static String _newKey() {
    final r = Random.secure();
    return List.generate(4, (_) => r.nextInt(1 << 32).toRadixString(36)).join('-');
  }

  @override
  void initState() {
    super.initState();
    final user = ref.read(currentUserProvider);
    _name.text = user?.fullName ?? '';
    _phone.text = user?.phone ?? '';
    _request = widget.buyNowProductId != null
        ? CheckoutRequest(
            mode: CheckoutMode.buyNow,
            fulfillmentType: FulfillmentType.pickup,
            items: {widget.buyNowProductId!: widget.buyNowQuantity},
          )
        : CheckoutRequest(
            mode: CheckoutMode.cart,
            fulfillmentType: FulfillmentType.pickup,
            productIds: widget.cartProductIds,
          );
    _pickDefaultAddress();
    _refresh();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_name, _phone, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDefaultAddress() async {
    try {
      final list = await ref.read(shopRepositoryProvider).addresses();
      final def = list.where((a) => a.isDefault).firstOrNull ?? list.firstOrNull;
      if (def != null && _request.addressId == null && mounted) {
        _request = _request.copyWith(addressId: def.id);
        if (_request.fulfillmentType == FulfillmentType.delivery) unawaited(_refresh());
      }
    } on Object {
      // Sổ địa chỉ là phụ — người dùng vẫn chọn/thêm được ở dưới.
    }
  }

  CheckoutRequest get _effective =>
      _request.copyWith(recipientName: _name.text, recipientPhone: _phone.text.replaceAll(' ', ''), note: _note.text);

  Future<void> _refresh() async {
    final seq = ++_seq;
    _idempotencyKey = _newKey();
    setState(() => _preview = _preview.hasValue ? AsyncData(_preview.value!) : const AsyncLoading());
    try {
      final p = await ref.read(shopRepositoryProvider).preview(_effective);
      if (mounted && seq == _seq) setState(() => _preview = AsyncData(p));
    } on Object catch (e, st) {
      if (mounted && seq == _seq) setState(() => _preview = AsyncError(e, st));
    }
  }

  void _refreshLater() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), _refresh);
  }

  void _setFulfillment(FulfillmentType t) {
    if (t == _request.fulfillmentType) return;
    setState(() => _request = _request.copyWith(fulfillmentType: t));
    unawaited(_refresh());
  }

  Future<void> _chooseAddress() async {
    final chosen = await showAppBottomSheet<ShopAddress>(
      context: context,
      title: 'Chọn địa chỉ giao hàng',
      builder: (_) => _AddressPicker(selectedId: _request.addressId),
    );
    if (chosen == null || !mounted) return;
    setState(() => _request = _request.copyWith(addressId: chosen.id));
    unawaited(_refresh());
  }

  Future<void> _place(CheckoutPreview p) async {
    setState(() {
      _placing = true;
      _error = null;
      _priceChanged = false;
    });
    try {
      final placed = await ref
          .read(shopRepositoryProvider)
          .placeOrder(_effective, expectedTotal: p.total, idempotencyKey: _idempotencyKey);
      ref.read(dataRevisionProvider.notifier).bump();
      if (!mounted) return;
      context.pushReplacement(AppRoutes.payment(placed.paymentId));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _placing = false;
        _priceChanged = ShopErrors.isPriceChanged(e);
        _error = _priceChanged ? null : ShopErrors.message(e);
      });
      // Giá/tồn kho đổi ⇒ tải lại để khách xem lại trước khi bấm lần nữa.
      await _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _preview.value;
    final config = ref.watch(shopConfigProvider).value ?? const ShopConfig();
    final delivery = _request.fulfillmentType == FulfillmentType.delivery;
    return AppScaffold(
      title: 'Thanh toán',
      bottomBar: p == null
          ? null
          : StickyBottomBar(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Tổng thanh toán', style: context.text.caption),
                        MoneyText(p.total, style: context.text.titleSmall.copyWith(color: context.colors.primary)),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppButton(
                    label: 'Đặt hàng',
                    icon: AppIcons.qr,
                    loading: _placing,
                    onPressed: p.canCheckout && !_preview.isLoading ? () => _place(p) : null,
                  ),
                ],
              ),
            ),
      body: switch (_preview) {
        AsyncError(:final error) when p == null => ErrorState(error: error, onRetry: _refresh),
        _ when p == null => const SkeletonDetail(),
        _ => ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            if (_priceChanged) ...[
              const AlertBanner.warning(
                title: 'Giá đã thay đổi',
                message: 'Tổng tiền vừa được cập nhật theo giá hiện tại. Vui lòng kiểm tra lại rồi bấm "Đặt hàng".',
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            if (_error != null) ...[AlertBanner.error(message: _error!), const SizedBox(height: AppSpacing.sm)],
            for (final w in p.warnings) ...[
              AlertBanner.error(message: _warningText(w, p)),
              const SizedBox(height: AppSpacing.sm),
            ],
            const SectionHeader(title: 'Sản phẩm'),
            AppCard(
              child: Column(
                children: [
                  for (final (i, l) in p.lines.indexed) ...[
                    if (i > 0) const Divider(height: AppSpacing.md),
                    KeyValueRow(label: '${l.productName} × ${l.quantity}', value: Money.format(l.lineTotal)),
                    for (final w in l.warnings)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          w.message,
                          style: context.text.caption.copyWith(
                            color: w.isPriceChange ? context.colors.textMuted : context.colors.errorText,
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            const SectionHeader(title: 'Hình thức nhận hàng'),
            ChoiceCard(
              icon: FulfillmentType.pickup.icon,
              title: FulfillmentType.pickup.label,
              description:
                  'Miễn phí. Trung tâm báo khi hàng sẵn sàng; mang mã nhận hàng tới quầy trong ${config.pickupDays} ngày.',
              selected: !delivery,
              onTap: () => _setFulfillment(FulfillmentType.pickup),
            ),
            const SizedBox(height: AppSpacing.xs),
            ChoiceCard(
              icon: FulfillmentType.delivery.icon,
              title: FulfillmentType.delivery.label,
              description:
                  'Phí ${Money.format(config.shippingFee)}'
                  '${config.freeShippingThreshold > 0 ? ', miễn phí từ ${Money.format(config.freeShippingThreshold)}' : ''}. '
                  'Khu vực: ${config.deliveryProvinces.join(', ')}.',
              selected: delivery,
              onTap: () => _setFulfillment(FulfillmentType.delivery),
            ),
            const SizedBox(height: AppSpacing.md),
            if (delivery) ...[
              SectionHeader(
                title: 'Địa chỉ giao hàng',
                actionLabel: _request.addressId == null ? null : 'Đổi',
                onAction: _request.addressId == null ? null : _chooseAddress,
              ),
              _SelectedAddress(addressId: _request.addressId, onChoose: _chooseAddress),
            ] else ...[
              const SectionHeader(title: 'Người nhận hàng'),
              AppTextField(label: 'Họ tên', controller: _name, onChanged: (_) => _refreshLater()),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                label: 'Số điện thoại',
                controller: _phone,
                keyboardType: TextInputType.phone,
                requiredField: true,
                helper: 'Nhân viên đối chiếu 4 số cuối khi giao hàng tại quầy.',
                onChanged: (_) => _refreshLater(),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            AppTextField(label: 'Ghi chú (không bắt buộc)', controller: _note, maxLines: 2, maxLength: 500),
            const SizedBox(height: AppSpacing.sm),
            AppCard(
              child: Column(
                children: [
                  KeyValueRow(label: 'Tạm tính', value: Money.format(p.subtotal)),
                  KeyValueRow(
                    label: 'Phí giao hàng',
                    value: p.shippingFee == 0 ? (delivery ? 'Miễn phí' : '0đ') : Money.format(p.shippingFee),
                  ),
                  const Divider(),
                  KeyValueRow(label: 'Tổng thanh toán', value: Money.format(p.total), emphasize: true),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            AlertBanner.info(
              message:
                  'Thanh toán trước bằng chuyển khoản VietQR. Hàng được giữ ${p.holdMinutes} phút sau khi đặt — quá hạn đơn tự hủy. '
                  'Để nhiều đơn hết hạn có thể bị tạm khóa đặt hàng.',
            ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      },
    );
  }

  String _warningText(ShopWarning w, CheckoutPreview p) => switch (w.code) {
    'CHECKOUT_LOCKED' when p.lockedUntil != null =>
      'Bạn đã để nhiều đơn hết hạn thanh toán. Tạm khóa đặt hàng tới ${VnTime.dateTime(p.lockedUntil!)}.',
    'PENDING_ORDER_LIMIT' =>
      'Bạn đang có ${p.pendingOrders}/${p.maxPendingOrders} đơn chờ thanh toán. Hãy thanh toán hoặc hủy bớt trong "Đơn hàng của tôi".',
    _ => w.message,
  };
}

class _SelectedAddress extends ConsumerWidget {
  const _SelectedAddress({required this.addressId, required this.onChoose});

  final String? addressId;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(addressesProvider).value ?? const <ShopAddress>[];
    final a = list.where((x) => x.id == addressId).firstOrNull;
    if (a == null) {
      return AppButton.outline(
        label: list.isEmpty ? 'Thêm địa chỉ giao hàng' : 'Chọn địa chỉ giao hàng',
        icon: AppIcons.location,
        expand: true,
        onPressed: onChoose,
      );
    }
    return AddressCard(address: a, selected: true, onTap: onChoose);
  }
}

class _AddressPicker extends ConsumerWidget {
  const _AddressPicker({this.selectedId});

  final String? selectedId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(addressesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        value.when(
          skipLoadingOnReload: true,
          loading: () => const Shimmer(child: SkeletonBox(height: AppSpacing.xxl * 2)),
          error: (e, _) => ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(addressesProvider)),
          data: (list) => Column(
            children: [
              for (final a in list) ...[
                AddressCard(address: a, selected: a.id == selectedId, onTap: () => Navigator.of(context).pop(a)),
                const SizedBox(height: AppSpacing.xs),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton.outline(
          label: 'Thêm địa chỉ mới',
          icon: AppIcons.add,
          expand: true,
          onPressed: () async {
            final created = await showAddressForm(context);
            if (created != null && context.mounted) Navigator.of(context).pop(created);
          },
        ),
      ],
    );
  }
}
