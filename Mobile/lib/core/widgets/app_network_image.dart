import 'package:flutter/material.dart';

import '../theme/app_palette.dart';
import '../theme/theme.dart';

/// Ảnh sản phẩm/khóa học (Q12). Thiếu URL hoặc tải lỗi ⇒ placeholder có icon,
/// nền màu chọn ổn định theo [seed] để các thẻ không giống hệt nhau.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    required this.placeholderIcon,
    required this.seed,
    this.borderRadius = AppRadius.cardAll,
    this.iconSize = AppSizes.iconXl,
    this.semanticLabel,
  });

  final String? url;
  final IconData placeholderIcon;
  final String seed;
  final BorderRadius borderRadius;
  final double iconSize;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    const tints = AppPalette.placeholderTints;
    final tint = tints[seed.hashCode.abs() % tints.length];
    final placeholder = Container(
      color: tint,
      alignment: Alignment.center,
      child: Icon(placeholderIcon, size: iconSize, color: context.colors.primary),
    );
    final u = url;
    return Semantics(
      image: true,
      label: semanticLabel,
      child: ClipRRect(
        borderRadius: borderRadius,
        child: u == null || u.isEmpty
            ? placeholder
            : Image.network(
                u,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => placeholder,
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : Container(color: context.colors.skeletonBase),
              ),
      ),
    );
  }
}
