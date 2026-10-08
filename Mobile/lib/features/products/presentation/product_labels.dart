import 'package:flutter/widgets.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/product.dart';

extension OrderStatusLabel on OrderStatus {
  StatusLabel get status => switch (this) {
    OrderStatus.pending => const StatusLabel('Chờ thanh toán', StatusTone.warning),
    OrderStatus.success => const StatusLabel('Thành công', StatusTone.success),
    OrderStatus.cancelled => const StatusLabel('Đã hủy', StatusTone.danger),
  };
}

extension OrderCancelReasonLabel on OrderCancelReason {
  String get label => switch (this) {
    OrderCancelReason.byBuyer => 'Bạn đã hủy đơn — tồn kho đã được hoàn lại.',
    OrderCancelReason.expired => 'Quá hạn chờ thanh toán — đơn tự hủy, tồn kho đã được hoàn lại.',
  };
}

StatusLabel stockLabel(Product p) {
  if (!p.inStock) return const StatusLabel('Hết hàng', StatusTone.danger);
  if (p.lowStock) return StatusLabel('Chỉ còn ${p.stockQuantity}', StatusTone.warning);
  return StatusLabel('Còn ${p.stockQuantity}', StatusTone.success);
}

/// Icon placeholder theo loại sản phẩm (BE chưa có ảnh — TODO BE-6).
IconData productIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('nước') || n.contains('bình')) return AppIcons.zap;
  if (n.contains('whey') || n.contains('bcaa') || n.contains('thanh')) return AppIcons.sparkles;
  if (n.contains('găng') || n.contains('dây')) return AppIcons.training;
  if (n.contains('kính') || n.contains('mũ')) return AppIcons.target;
  return AppIcons.bag;
}
