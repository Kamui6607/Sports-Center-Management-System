import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/app/app.dart';
import 'package:sports_center_mobile/mock/mock_server.dart';
import 'package:sports_center_mobile/mock/seed/seed.dart';

import 'helpers/fonts.dart';

void main() {
  setUpAll(loadAppFonts);

  testWidgets('Khởi động ⇒ Chào mừng ⇒ đăng nhập tài khoản demo Học viên ⇒ Trang chủ', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final server = MockServer(seedDatabase(DateTime.now))..settings.noLatency = true;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [mockServerProvider.overrideWithValue(server)],
        retry: (_, _) => null,
        child: const SportsCenterApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Đăng nhập'), findsOneWidget);
    expect(find.text('Tạo tài khoản'), findsOneWidget);

    await tester.ensureVisible(find.text('Đăng nhập'));
    await tester.tap(find.text('Đăng nhập'));
    await tester.pumpAndSettle();
    expect(find.text('Chào mừng trở lại!'), findsOneWidget);

    await tester.ensureVisible(find.text('Học viên'));
    await tester.tap(find.text('Học viên'));
    await tester.pump(const Duration(milliseconds: 100));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    expect(find.textContaining('Xin chào, Anh'), findsOneWidget);
    expect(find.text('Trang chủ'), findsOneWidget);

    // Gỡ cây widget để hủy các Timer (đếm ngược) trước khi kết thúc test.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
  });
}
