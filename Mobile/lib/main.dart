import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import 'app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('vi');
  Intl.defaultLocale = 'vi';
  runApp(
    // Tắt tự retry của Riverpod 3: lỗi hiển thị ngay kèm nút "Thử lại".
    ProviderScope(retry: (_, _) => null, child: const SportsCenterApp()),
  );
}
