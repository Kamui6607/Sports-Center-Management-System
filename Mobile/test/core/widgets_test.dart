import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/core/theme/theme.dart';
import 'package:sports_center_mobile/core/widgets/widgets.dart';

Widget _wrap(Widget child) => MaterialApp(
  theme: AppTheme.light(),
  home: Scaffold(body: Center(child: child)),
);

void main() {
  testWidgets('AppButton: bấm được, disabled và loading không bấm được', (tester) async {
    var taps = 0;
    await tester.pumpWidget(_wrap(AppButton(label: 'Mua', onPressed: () => taps++)));
    await tester.tap(find.text('Mua'));
    expect(taps, 1);

    await tester.pumpWidget(_wrap(const AppButton(label: 'Mua', onPressed: null)));
    await tester.tap(find.text('Mua'), warnIfMissed: false);
    expect(taps, 1);

    await tester.pumpWidget(_wrap(AppButton(label: 'Mua', loading: true, onPressed: () => taps++)));
    await tester.tap(find.text('Mua'), warnIfMissed: false);
    expect(taps, 1);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('AppButton có vùng chạm ≥ 48dp', (tester) async {
    await tester.pumpWidget(_wrap(AppButton(label: 'OK', onPressed: () {})));
    final size = tester.getSize(find.byType(AppButton));
    expect(size.height, greaterThanOrEqualTo(AppSizes.touch));
  });

  testWidgets('StatusTag hiển thị nhãn', (tester) async {
    await tester.pumpWidget(_wrap(const StatusTag(label: 'Chờ duyệt', tone: StatusTone.warning)));
    expect(find.text('Chờ duyệt'), findsOneWidget);
  });

  testWidgets('AsyncValueView: lỗi có nút Thử lại, rỗng hiển thị EmptyState', (tester) async {
    var retried = false;
    await tester.pumpWidget(
      _wrap(
        AsyncValueView<List<int>>(
          value: const AsyncError(AppFailure.network(), StackTrace.empty),
          onRetry: () => retried = true,
          data: (_) => const Text('data'),
        ),
      ),
    );
    expect(find.text('Mất kết nối'), findsOneWidget);
    await tester.tap(find.text('Thử lại'));
    expect(retried, isTrue);

    await tester.pumpWidget(
      _wrap(
        AsyncValueView<List<int>>(
          value: const AsyncData([]),
          isEmpty: (l) => l.isEmpty,
          empty: const EmptyState(title: 'Trống'),
          data: (_) => const Text('data'),
        ),
      ),
    );
    expect(find.text('Trống'), findsOneWidget);
  });

  testWidgets('Text scale 200% không tràn layout KpiTile', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: MediaQuery(
          data: const MediaQueryData(size: Size(360, 800), textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: KpiGrid(
                children: [
                  for (var i = 0; i < 4; i++)
                    const KpiTile(icon: Icons.star, label: 'Số dư khả dụng', value: '8.720.000 đ'),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
