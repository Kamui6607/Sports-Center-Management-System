import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/token_storage.dart';
import '../../../mock/mock_server.dart';
import '../domain/repositories/course_repository.dart';
import 'course_api_repository.dart';
import 'course_mock_repository.dart';

/// Nguồn dữ liệu của feature: mock (`USE_MOCK` / `MOCK_FEATURES`) hoặc API thật.
/// UI chỉ phụ thuộc interface [CourseRepository].
final courseRepositoryProvider = Provider<CourseRepository>((ref) {
  if (Env.mock('classes')) return CourseMockRepository(ref.watch(mockServerProvider));
  return CourseApiRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider));
});
