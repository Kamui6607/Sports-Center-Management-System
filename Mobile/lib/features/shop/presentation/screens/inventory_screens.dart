import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../products/presentation/product_labels.dart';
import '../../data/shop_repository_provider.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_action.dart';
import '../shop_labels.dart';

/// R13 — Tồn kho (Manager): tồn thực tế / đang giữ / có thể bán, cảnh báo sắp hết, nhập & điều chỉnh có nhật ký.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  bool _lowOnly = false;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(inventoryProvider(_lowOnly));
    return AppScaffold(
      title: 'Tồn kho',
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<bool>(
            selected: _lowOnly,
            onChanged: (v) => setState(() => _lowOnly = v),
            options: [
              const SegmentOption(false, 'Tất cả'),
              SegmentOption(true, 'Sắp hết', count: ref.watch(shopSummaryProvider).value?.lowStockProducts ?? 0),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(inventoryProvider(_lowOnly)),
              isEmpty: (l) => l.isEmpty,
              empty: EmptyState(
                icon: AppIcons.inventory,
                title: _lowOnly ? 'Không có sản phẩm sắp hết' : 'Chưa có sản phẩm',
              ),
              data: (list) => RefreshableList(
                onRefresh: () => ref.refresh(inventoryProvider(_lowOnly).future),
                itemCount: list.length,
                itemBuilder: (context, i) => _InventoryCard(item: list[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryCard extends StatelessWidget {
  const _InventoryCard({required this.item});

  final InventoryItem item;

  @override
  Widget build(BuildContext context) {
    final i = item;
    return AppCard(
      onTap: () => context.push(AppRoutes.inventoryItem(i.id)),
      child: Row(
        children: [
          SizedBox.square(
            dimension: AppSpacing.xxl,
            child: AppNetworkImage(
              url: i.imageUrl,
              seed: i.id,
              placeholderIcon: productIcon(i.name),
              iconSize: AppSizes.icon,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(i.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyStrong),
                Text(
                  'Tồn ${i.stockQuantity} · Đang giữ ${i.reservedStock} · Bán được ${i.availableStock}',
                  style: context.text.caption.copyWith(color: context.colors.textMuted),
                ),
              ],
            ),
          ),
          if (!i.isActive)
            const StatusTag(label: 'Ngừng bán', tone: StatusTone.neutral, dense: true)
          else if (i.lowStock)
            StatusTag(label: i.availableStock == 0 ? 'Hết hàng' : 'Sắp hết', tone: StatusTone.warning, dense: true),
        ],
      ),
    );
  }
}

/// Chi tiết tồn kho một sản phẩm: nhập / điều chỉnh + nhật ký kho.
class InventoryItemScreen extends ConsumerWidget {
  const InventoryItemScreen({super.key, required this.productId});

  final String productId;

  Future<void> _change(BuildContext context, WidgetRef ref, InventoryItem item, {required bool inbound}) async {
    final input = await showAppBottomSheet<({int quantity, String note})>(
      context: context,
      title: inbound ? 'Nhập hàng' : 'Điều chỉnh tồn kho',
      subtitle: item.name,
      builder: (_) => _ChangeForm(inbound: inbound, item: item),
    );
    if (input == null || !context.mounted) return;
    await runShopAction(
      context,
      ref,
      () => ref
          .read(shopRepositoryProvider)
          .changeInventory(item.id, inbound: inbound, quantity: input.quantity, note: input.note),
      success: inbound ? 'Đã nhập ${input.quantity} sản phẩm.' : 'Đã điều chỉnh tồn kho.',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(inventoryProvider(false));
    final item = all.value?.where((i) => i.id == productId).firstOrNull;
    final txs = ref.watch(inventoryTxProvider(productId));
    return AppScaffold(
      title: 'Tồn kho sản phẩm',
      bottomBar: item == null
          ? null
          : StickyBottomBar(
              child: Row(
                children: [
                  Expanded(
                    child: AppButton.outline(
                      label: 'Điều chỉnh',
                      icon: AppIcons.edit,
                      onPressed: () => _change(context, ref, item, inbound: false),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppButton(
                      label: 'Nhập hàng',
                      icon: AppIcons.add,
                      onPressed: () => _change(context, ref, item, inbound: true),
                    ),
                  ),
                ],
              ),
            ),
      body: AsyncValueView(
        value: all,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(inventoryProvider(false)),
        data: (_) => item == null
            ? const EmptyState(icon: AppIcons.inventory, title: 'Không tìm thấy sản phẩm')
            : RefreshableScroll(
                onRefresh: () async {
                  ref
                    ..invalidate(inventoryProvider(false))
                    ..invalidate(inventoryTxProvider(productId));
                },
                children: [
                  Text(item.name, style: context.text.title),
                  const SizedBox(height: AppSpacing.sm),
                  KpiGrid(
                    children: [
                      KpiTile(icon: AppIcons.inventory, label: 'Tồn thực tế', value: '${item.stockQuantity}'),
                      KpiTile(icon: AppIcons.pending, label: 'Đang giữ cho đơn', value: '${item.reservedStock}'),
                      KpiTile(
                        icon: AppIcons.bag,
                        label: 'Có thể bán',
                        value: '${item.availableStock}',
                        highlight: item.lowStock,
                      ),
                      KpiTile(icon: AppIcons.warning, label: 'Ngưỡng cảnh báo', value: '≤ ${item.lowStockThreshold}'),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Giới hạn: tối đa ${item.maxPerOrder}/đơn, ${item.maxPerDay}/người/ngày.',
                    style: context.text.caption.copyWith(color: context.colors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const SectionHeader(title: 'Nhật ký kho'),
                  txs.when(
                    skipLoadingOnReload: true,
                    loading: () => const Shimmer(child: SkeletonBox(height: AppSpacing.xxl * 2)),
                    error: (e, _) => ErrorState(
                      error: e,
                      compact: true,
                      onRetry: () => ref.invalidate(inventoryTxProvider(productId)),
                    ),
                    data: (list) => list.isEmpty
                        ? const EmptyState(icon: AppIcons.empty, title: 'Chưa có giao dịch kho', compact: true)
                        : AppCard(
                            child: Column(
                              children: [
                                for (final (i, t) in list.indexed) ...[
                                  if (i > 0) const Divider(height: AppSpacing.md),
                                  _TxRow(tx: t),
                                ],
                              ],
                            ),
                          ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                ],
              ),
      ),
    );
  }
}

class _TxRow extends StatelessWidget {
  const _TxRow({required this.tx});

  final InventoryTx tx;

  @override
  Widget build(BuildContext context) {
    final t = tx;
    final sign = switch (t.type) {
      InventoryTxType.inbound || InventoryTxType.returned => '+${t.quantity}',
      InventoryTxType.sale => '−${t.quantity}',
      InventoryTxType.adjust => t.quantity > 0 ? '+${t.quantity}' : '−${-t.quantity}',
      InventoryTxType.reserve => 'giữ ${t.quantity}',
      InventoryTxType.release => 'nhả ${t.quantity}',
    };
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.type.label, style: context.text.label),
              Text(
                [VnTime.dateTime(t.createdAt), if (t.orderCode != null) t.orderCode!].join(' · '),
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
              if (t.note != null) Text(t.note!, style: context.text.caption),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(sign, style: context.text.bodyStrong),
            Text('Tồn ${t.stockAfter} · giữ ${t.reservedAfter}', style: context.text.caption),
          ],
        ),
      ],
    );
  }
}

class _ChangeForm extends StatefulWidget {
  const _ChangeForm({required this.inbound, required this.item});

  final bool inbound;
  final InventoryItem item;

  @override
  State<_ChangeForm> createState() => _ChangeFormState();
}

class _ChangeFormState extends State<_ChangeForm> {
  final _qty = TextEditingController();
  final _note = TextEditingController();
  bool _decrease = true;
  String? _qtyError;
  String? _noteError;

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final n = int.tryParse(_qty.text.trim()) ?? 0;
    setState(() {
      _qtyError = n <= 0 ? 'Nhập số lượng lớn hơn 0' : null;
      _noteError = _note.text.trim().length < 3 ? 'Nhập ghi chú (tối thiểu 3 ký tự)' : null;
    });
    if (_qtyError != null || _noteError != null) return;
    final signed = widget.inbound || !_decrease ? n : -n;
    Navigator.of(context).pop((quantity: signed, note: _note.text.trim()));
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (!widget.inbound) ...[
        SegmentedTabs<bool>(
          selected: _decrease,
          onChanged: (v) => setState(() => _decrease = v),
          options: const [SegmentOption(true, 'Giảm (hư hỏng, thất thoát)'), SegmentOption(false, 'Tăng (kiểm kê)')],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Không thể giảm xuống dưới ${widget.item.reservedStock} (đang giữ cho đơn chờ thanh toán).',
          style: context.text.caption.copyWith(color: context.colors.textMuted),
        ),
        const SizedBox(height: AppSpacing.sm),
      ],
      AppTextField(
        label: 'Số lượng',
        controller: _qty,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        errorText: _qtyError,
        requiredField: true,
      ),
      const SizedBox(height: AppSpacing.sm),
      AppTextField(
        label: 'Ghi chú',
        controller: _note,
        hint: widget.inbound ? 'VD Nhập lô tháng 10' : 'VD Kiểm kê cuối tháng',
        errorText: _noteError,
        requiredField: true,
        maxLength: 500,
      ),
      const SizedBox(height: AppSpacing.md),
      AppButton(label: widget.inbound ? 'Nhập hàng' : 'Lưu điều chỉnh', expand: true, onPressed: _submit),
    ],
  );
}
