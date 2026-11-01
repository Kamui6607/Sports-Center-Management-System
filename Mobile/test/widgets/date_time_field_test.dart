import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/theme/theme.dart';
import 'package:sports_center_mobile/core/widgets/date_time_field.dart';

/// `firstDate` ở tương lai (VD dời lịch: giờ mới phải ≥ 24h) mà chưa chọn giá trị ⇒ picker vẫn phải mở.
void main() {
  testWidgets('firstDate = ngày mai, chưa có giá trị ⇒ mở được lịch chọn ngày', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('vi'),
        supportedLocales: const [Locale('vi')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Scaffold(
          body: DateTimeField(
            label: 'Ngày giờ bắt đầu mới',
            mode: DateTimeFieldMode.dateTime,
            value: null,
            firstDate: DateTime.now().add(const Duration(hours: 24)),
            onChanged: (_) {},
          ),
        ),
      ),
    );
    await tester.tap(find.text('Chọn ngày'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });
}
