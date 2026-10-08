import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/app/app.dart';
import 'package:sports_center_mobile/app/router/app_router.dart';
import 'package:sports_center_mobile/core/widgets/app_scaffold.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

import 'helpers/fonts.dart';

/// Mở lần lượt mọi màn hình của từng vai trò ở nhiều kích thước / cỡ chữ và
/// báo lỗi nếu có exception hoặc tràn layout (Phase 12 — responsive & a11y).
void main() {
  setUpAll(loadAppFonts);

  const routes = <String?, List<String>>{
    null: [
      '/welcome',
      '/explore',
      '/explore/classes',
      '/classes/c1',
      '/shop',
      '/products/p-whey',
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password?email=a@b.vn',
    ],
    'u-m1': [
      '/m/home',
      '/m/classes',
      '/m/schedule',
      '/m/shop',
      '/m/account',
      '/classes/c2',
      '/classes/c9',
      '/classes/c10',
      '/products/p-mat',
      '/products/p-gloves',
      '/member/courses',
      '/member/courses/c1',
      '/member/courses/c6',
      '/member/courses/c2/cancel',
      '/member/refunds',
      '/member/sessions/c1-s2-bu',
      '/member/sessions/c6-s2',
      '/member/attendance',
      '/member/training',
      '/member/training/tp-1',
      '/orders',
      '/invoices',
      '/invoices/inv-pay-c1-mp-1',
      '/notifications',
      '/chat',
      '/chat/u-c1',
      '/profile/edit',
      '/profile/password',
      '/payment/pay-o-3',
      '/dev',
    ],
    'u-m2': ['/member/courses/c2', '/member/courses/c2/cancel', '/m/home'],
    'u-c1': [
      '/c/home',
      '/c/schedule',
      '/c/classes',
      '/c/wallet',
      '/c/account',
      '/coach/sessions/c1-s2-bu',
      '/coach/sessions/c1-s2-bu/attendance',
      '/coach/sessions/c1-s2-bu/qr',
      '/coach/sessions/c2-s1',
      '/coach/sessions/c2-s1/cancel',
      '/coach/classes/new',
      '/coach/classes/c1',
      '/coach/classes/c5',
      '/coach/classes/c5/edit',
      '/coach/students/mp-1',
      '/coach/training/tp-1',
      '/coach/feedback',
      '/shop',
      '/orders',
    ],
    'u-c4': ['/c/wallet', '/coach/withdraw'],
    'u-c6': ['/onboarding/status'],
    'u-c7': ['/onboarding/status', '/onboarding/cv'],
    'u-c8': ['/onboarding/cv'],
    'u-mg': [
      '/r/home',
      '/r/approvals?tab=0',
      '/r/approvals?tab=1',
      '/r/approvals?tab=2',
      '/r/approvals?tab=3',
      '/r/account',
      '/manager/cv/cp-6',
      '/manager/classes/c4',
      '/manager/withdrawals/wtx-wd-cp-5--1',
      '/manager/refunds/rf-c2-mp-8',
    ],
  };

  const variants = <(String, Size, double)>[
    ('phone 360dp', Size(360, 780), 1),
    ('phone nhỏ 320dp, chữ 130%', Size(320, 640), 1.3),
    ('tablet 800dp', Size(800, 1280), 1),
  ];

  for (final (name, size, scale) in variants) {
    for (final entry in routes.entries) {
      testWidgets('[$name] ${entry.key ?? 'guest'}', (tester) async {
        tester.view.physicalSize = size * 2;
        tester.view.devicePixelRatio = 2;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.view.reset);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

        final server = MockServer(seedDatabase(DateTime.now))
          ..settings.noLatency = true
          ..settings.autoConfirmPayments = false
          ..currentUserId = entry.key;
        await tester.pumpWidget(
          ProviderScope(
            overrides: [mockServerProvider.overrideWithValue(server)],
            retry: (_, _) => null,
            child: const SportsCenterApp(),
          ),
        );
        await _settle(tester);
        final router = ProviderScope.containerOf(tester.element(find.byType(SportsCenterApp))).read(routerProvider);

        final failures = <String>[];
        for (final route in entry.value) {
          router.go(route);
          await _settle(tester);
          final error = tester.takeException();
          if (error != null) failures.add('$route ⇒ $error');
          // Thanh CTA dính đáy không được chiếm quá 40% màn hình.
          for (final bar in find.byType(StickyBottomBar).evaluate()) {
            final h = (bar.renderObject! as RenderBox).size.height;
            if (h > size.height * 0.4) failures.add('$route ⇒ StickyBottomBar cao bất thường (${h.round()}dp)');
          }
          final location = router.routerDelegate.currentConfiguration.uri.toString();
          if (location != route) failures.add('$route ⇒ bị chuyển hướng tới $location');
        }

        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(seconds: 2));
        expect(failures, isEmpty, reason: failures.join('\n'));
      });
    }
  }
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}
