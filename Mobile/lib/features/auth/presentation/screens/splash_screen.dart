import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/app_failure.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../providers/session_provider.dart';

/// A01 — Khởi động: khôi phục phiên (router tự chuyển khi xong). Lỗi mạng ⇒ "Thử lại".
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final session = ref.watch(sessionProvider);
    final error = session.hasError && !session.isLoading ? AppFailure.from(session.error!) : null;
    // Nền tối ⇒ icon thanh trạng thái màu sáng.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.primary,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: EdgeInsets.all(context.screenPadding),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const BrandLogo(size: BrandLogoSize.large, onDark: true),
                  const SizedBox(height: AppSpacing.xl),
                  if (error == null) ...[
                    SizedBox.square(
                      dimension: AppSizes.iconLg,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: c.accent),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text('Đang kiểm tra phiên đăng nhập…', style: context.text.small.copyWith(color: c.onPrimary)),
                  ] else ...[
                    Text(
                      error.message,
                      textAlign: TextAlign.center,
                      style: context.text.small.copyWith(color: c.onPrimary),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppButton(
                      label: 'Thử lại',
                      variant: AppButtonVariant.secondary,
                      onPressed: () => ref.invalidate(sessionProvider),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
