import 'dart:async';

import 'package:sports_center_mobile/core/config/env.dart';

/// Chạy trước mọi test: test widget/luồng dùng dữ liệu giả lập (mặc định app gọi API thật).
/// Test của API repository dựng repository trực tiếp với BE giả (`helpers/fake_backend.dart`).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  Env.debugUseMockOverride = true;
  await testMain();
}
