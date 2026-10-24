import 'package:flutter/widgets.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/product.dart';

StatusLabel stockLabel(Product p) {
  if (!p.isActive) return const StatusLabel('Ngừng bán', StatusTone.neutral);
  if (!p.inStock) return const StatusLabel('Hết hàng', StatusTone.danger);
  if (p.lowStock) return StatusLabel('Chỉ còn ${p.availableStock}', StatusTone.warning);
  return StatusLabel('Còn ${p.availableStock}', StatusTone.success);
}

/// Icon placeholder theo loại sản phẩm (khi sản phẩm chưa có ảnh).
IconData productIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('nước') || n.contains('bình')) return AppIcons.zap;
  if (n.contains('whey') || n.contains('bcaa') || n.contains('thanh')) return AppIcons.sparkles;
  if (n.contains('găng') || n.contains('dây')) return AppIcons.training;
  if (n.contains('kính') || n.contains('mũ')) return AppIcons.target;
  return AppIcons.bag;
}
