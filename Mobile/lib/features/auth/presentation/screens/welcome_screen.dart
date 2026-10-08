import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';

/// A02 — Chào mừng (thay landing page dài của web).
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Nền tối ⇒ icon thanh trạng thái màu sáng.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.primary,
        body: SafeArea(
          child: ContentWidth(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: EdgeInsets.all(context.screenPadding + AppSpacing.xs),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight - 2 * (context.screenPadding + AppSpacing.xs),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const BrandLogo(onDark: true),
                          const Spacer(),
                          if (Env.useMock)
                            IconButton(
                              tooltip: 'Công cụ phát triển',
                              onPressed: () => context.push(AppRoutes.devTools),
                              icon: Icon(AppIcons.settings, color: c.accent),
                            ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xxl),
                      Text(
                        'Tập luyện cùng\nhuấn luyện viên\nphù hợp với bạn',
                        style: context.text.display.copyWith(color: c.onPrimary),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        'Chọn khóa học do HLV mở, thanh toán VietQR, điểm danh bằng QR và theo dõi lộ trình tập luyện — tất cả trong một ứng dụng.',
                        style: context.text.body.copyWith(color: c.onPrimary.withValues(alpha: 0.85)),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      for (final (icon, text) in const [
                        (AppIcons.course, 'Khóa học Yoga, Bơi, Boxing, Gym… do HLV tự định giá'),
                        (AppIcons.qr, 'Thanh toán chuyển khoản tự động & điểm danh QR'),
                        (AppIcons.training, 'Lộ trình tập và nhận xét riêng từ HLV'),
                      ])
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: Row(
                            children: [
                              IconTile(icon, background: c.accent, foreground: c.onAccent),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Text(text, style: context.text.small.copyWith(color: c.onPrimary)),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(height: AppSpacing.xl),
                      AppButton.secondary(
                        label: 'Đăng nhập',
                        expand: true,
                        onPressed: () => context.push(AppRoutes.login),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      AppButton.outline(
                        label: 'Tạo tài khoản',
                        expand: true,
                        onPressed: () => context.push(AppRoutes.register),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      TextButton(
                        onPressed: () => context.push(AppRoutes.explore),
                        child: Text(
                          'Khám phá khóa học & cửa hàng',
                          style: context.text.label.copyWith(
                            color: c.accent,
                            decoration: TextDecoration.underline,
                            decorationColor: c.accent,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
