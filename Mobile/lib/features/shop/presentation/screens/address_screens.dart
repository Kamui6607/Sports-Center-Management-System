import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_action.dart';

/// S07 — Sổ địa chỉ giao hàng: thêm / sửa / xóa / đặt mặc định.
class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  Future<void> _delete(BuildContext context, WidgetRef ref, ShopAddress a) async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Xóa địa chỉ?',
      message: a.fullAddress,
      confirmLabel: 'Xóa',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    await runShopAction(
      context,
      ref,
      () => ref.read(shopRepositoryProvider).deleteAddress(a.id),
      success: 'Đã xóa địa chỉ.',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(addressesProvider);
    return AppScaffold(
      title: 'Sổ địa chỉ',
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showAddressForm(context),
        icon: const Icon(AppIcons.add),
        label: const Text('Thêm địa chỉ'),
      ),
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(addressesProvider),
        isEmpty: (l) => l.isEmpty,
        empty: EmptyState(
          icon: AppIcons.location,
          title: 'Chưa có địa chỉ',
          message: 'Thêm địa chỉ để đặt giao hàng tận nơi.',
          actionLabel: 'Thêm địa chỉ',
          onAction: () => showAddressForm(context),
        ),
        data: (list) => RefreshableList(
          onRefresh: () => ref.refresh(addressesProvider.future),
          itemCount: list.length,
          itemBuilder: (context, i) => AddressCard(
            address: list[i],
            trailing: PopupMenuButton<String>(
              tooltip: 'Tùy chọn',
              icon: const Icon(AppIcons.more),
              onSelected: (v) => switch (v) {
                'edit' => showAddressForm(context, initial: list[i]),
                'default' => runShopAction(
                  context,
                  ref,
                  () => ref.read(shopRepositoryProvider).setDefaultAddress(list[i].id),
                  success: 'Đã đặt làm mặc định.',
                ),
                _ => _delete(context, ref, list[i]),
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('Sửa')),
                if (!list[i].isDefault) const PopupMenuItem(value: 'default', child: Text('Đặt làm mặc định')),
                const PopupMenuItem(value: 'delete', child: Text('Xóa')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Thẻ địa chỉ (dùng ở sổ địa chỉ và màn thanh toán).
class AddressCard extends StatelessWidget {
  const AddressCard({super.key, required this.address, this.trailing, this.onTap, this.selected = false});

  final ShopAddress address;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final a = address;
    final c = context.colors;
    return AppCard(
      onTap: onTap,
      borderColor: selected ? c.primary : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(selected ? AppIcons.success : AppIcons.location, color: selected ? c.primary : c.textMuted),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${a.recipientName} · ${a.phone}', style: context.text.bodyStrong),
                const SizedBox(height: AppSpacing.xxs),
                Text(a.fullAddress, style: context.text.small),
                const SizedBox(height: AppSpacing.xxs),
                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xxs,
                  children: [
                    if (a.isDefault) const StatusTag(label: 'Mặc định', tone: StatusTone.brand, dense: true),
                    if (!a.deliverable)
                      const StatusTag(label: 'Ngoài khu vực giao', tone: StatusTone.warning, dense: true),
                  ],
                ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Bottom sheet thêm / sửa địa chỉ. Trả địa chỉ đã lưu (null nếu đóng).
Future<ShopAddress?> showAddressForm(BuildContext context, {ShopAddress? initial}) => showAppBottomSheet<ShopAddress>(
  context: context,
  title: initial == null ? 'Thêm địa chỉ' : 'Sửa địa chỉ',
  builder: (_) => _AddressForm(initial: initial),
);

class _AddressForm extends ConsumerStatefulWidget {
  const _AddressForm({this.initial});

  final ShopAddress? initial;

  @override
  ConsumerState<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends ConsumerState<_AddressForm> with SubmittingState {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initial?.recipientName);
  late final _phone = TextEditingController(text: widget.initial?.phone);
  late final _province = TextEditingController(text: widget.initial?.province ?? 'Hồ Chí Minh');
  late final _district = TextEditingController(text: widget.initial?.district);
  late final _ward = TextEditingController(text: widget.initial?.ward);
  late final _street = TextEditingController(text: widget.initial?.street);
  late bool _isDefault = widget.initial?.isDefault ?? false;

  @override
  void initState() {
    super.initState();
    if (widget.initial == null) {
      final user = ref.read(currentUserProvider);
      _name.text = user?.fullName ?? '';
      _phone.text = user?.phone ?? '';
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _province, _district, _ward, _street]) {
      c.dispose();
    }
    super.dispose();
  }

  static String? _required(String? v, String label, [int min = 2]) =>
      (v ?? '').trim().length < min ? 'Nhập $label' : null;

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final input = AddressInput(
      recipientName: _name.text,
      phone: _phone.text.replaceAll(' ', ''),
      province: _province.text,
      district: _district.text,
      ward: _ward.text,
      street: _street.text,
      isDefault: _isDefault,
    );
    final repo = ref.read(shopRepositoryProvider);
    final saved = await submit(
      () => widget.initial == null ? repo.createAddress(input) : repo.updateAddress(widget.initial!.id, input),
    );
    if (saved == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    Navigator.of(context).pop(saved);
  }

  @override
  Widget build(BuildContext context) {
    final provinces = ref.watch(shopConfigProvider).value?.deliveryProvinces ?? const ['Hồ Chí Minh'];
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            label: 'Người nhận',
            controller: _name,
            requiredField: true,
            errorText: fieldErrors['recipientName'],
            validator: (v) => _required(v, 'tên người nhận'),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Số điện thoại',
            controller: _phone,
            requiredField: true,
            keyboardType: TextInputType.phone,
            errorText: fieldErrors['phone'],
            validator: (v) => RegExp(r'^(\+?84|0)\d{9,10}$').hasMatch((v ?? '').replaceAll(' ', ''))
                ? null
                : 'Số điện thoại không hợp lệ',
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Tỉnh / Thành phố',
            controller: _province,
            requiredField: true,
            helper: 'Hiện giao tại: ${provinces.join(', ')}',
            errorText: fieldErrors['province'],
            validator: (v) => _required(v, 'tỉnh/thành phố'),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Quận / Huyện',
            controller: _district,
            requiredField: true,
            errorText: fieldErrors['district'],
            validator: (v) => _required(v, 'quận/huyện'),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(label: 'Phường / Xã', controller: _ward, errorText: fieldErrors['ward']),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Số nhà, tên đường',
            controller: _street,
            requiredField: true,
            errorText: fieldErrors['street'],
            validator: (v) => _required(v, 'số nhà, tên đường', 3),
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _isDefault,
            onChanged: widget.initial?.isDefault == true ? null : (v) => setState(() => _isDefault = v),
            title: Text('Đặt làm địa chỉ mặc định', style: context.text.body),
          ),
          if (formError != null && fieldErrors.isEmpty) ...[
            AlertBanner.error(message: formError!),
            const SizedBox(height: AppSpacing.sm),
          ],
          AppButton(label: 'Lưu địa chỉ', expand: true, loading: submitting, onPressed: _save),
        ],
      ),
    );
  }
}
