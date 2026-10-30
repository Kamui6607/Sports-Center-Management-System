import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/theme.dart';
import 'router/app_router.dart';

/// Ứng dụng gốc: theme (Light — Q9), tiếng Việt, router theo vai trò.
class SportsCenterApp extends ConsumerWidget {
  const SportsCenterApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'pulse. Sports Center',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      themeMode: ThemeMode.light,
      routerConfig: router,
      locale: const Locale('vi'),
      supportedLocales: const [Locale('vi'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) {
        // Phone: khóa dọc; tablet: cho xoay (mục 3.3 / Phase 12).
        final isPhone = MediaQuery.sizeOf(context).shortestSide < AppSizes.tabletBreakpoint;
        SystemChrome.setPreferredOrientations(
          isPhone ? const [DeviceOrientation.portraitUp] : DeviceOrientation.values,
        );
        return child ?? const SizedBox.shrink();
      },
    );
  }
}
