import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';

/// A01 — Khởi động: khôi phục phiên (router tự chuyển khi xong).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Nền tối ⇒ icon thanh trạng thái màu sáng.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.primary,
        body: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const BrandLogo(size: BrandLogoSize.large, onDark: true),
                const SizedBox(height: AppSpacing.xl),
                SizedBox.square(
                  dimension: AppSizes.iconLg,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: c.accent),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text('Đang kiểm tra phiên đăng nhập…', style: context.text.small.copyWith(color: c.onPrimary)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
