import 'package:flutter/services.dart';
import 'package:sports_center_mobile/core/theme/app_typography.dart';

/// Nạp font Be Vietnam Pro thật cho widget test để đo layout sát thực tế
/// (font mặc định của test vẽ mỗi ký tự là ô vuông, rộng hơn nhiều).
Future<void> loadAppFonts() async {
  final loader = FontLoader(kFontFamily);
  for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
    loader.addFont(rootBundle.load('assets/fonts/BeVietnamPro-$w.ttf'));
  }
  await loader.load();
}
