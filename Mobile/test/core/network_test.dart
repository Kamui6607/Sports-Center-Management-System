import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/core/network/api_error_mapper.dart';

import '../helpers/fake_backend.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ApiClient', () {
    test('gắn Bearer token và trả data + pagination', () async {
      final api = FakeApi(storedTokens: {'auth.accessToken': 'A1', 'auth.refreshToken': 'R1'});
      api.backend.on(
        'GET /classes',
        (_) async => FakeReply.ok(
          [
            {'id': 'c1'},
          ],
          pagination: {'page': 1, 'limit': 10, 'total': 11, 'totalPages': 2},
        ),
      );
      final res = await api.client.get('/classes', query: {'page': 1, 'search': ''});
      expect(api.backend.requests.single.bearer, 'A1');
      expect(api.backend.requests.single.query.containsKey('search'), isFalse); // bỏ tham số rỗng
      final paged = res.paged((j) => j['id']);
      expect(paged.items, ['c1']);
      expect(paged.hasMore, isTrue);
    });

    test('401 ⇒ refresh đúng 1 lần cho nhiều request song song rồi gửi lại', () async {
      final api = FakeApi(storedTokens: {'auth.accessToken': 'OLD', 'auth.refreshToken': 'R1'});
      api.backend
        ..on('GET /a', (r) async => r.bearer == 'NEW' ? FakeReply.ok('a') : FakeReply.error(401, 'Unauthorized'))
        ..on('GET /b', (r) async => r.bearer == 'NEW' ? FakeReply.ok('b') : FakeReply.error(401, 'Unauthorized'))
        ..on('POST /auth/refresh-token', (r) async {
          await Future<void>.delayed(const Duration(milliseconds: 20));
          return FakeReply.ok({'accessToken': 'NEW'});
        });
      final results = await Future.wait([api.client.get('/a'), api.client.get('/b')]);
      expect(results.map((r) => r.data), ['a', 'b']);
      expect(api.backend.count('POST /auth/refresh-token'), 1);
      expect(await api.tokens.accessToken, 'NEW');
      expect(await api.tokens.refreshToken, 'R1'); // BE không xoay vòng refresh token
      expect(api.expiredCount, 0);
    });

    test('refresh thất bại ⇒ xóa token + báo hết phiên', () async {
      final api = FakeApi(storedTokens: {'auth.accessToken': 'OLD', 'auth.refreshToken': 'R1'});
      api.backend
        ..on('GET /a', (_) async => FakeReply.error(401, 'Unauthorized: invalid or expired token'))
        ..on('POST /auth/refresh-token', (_) async => FakeReply.error(401, 'Refresh token has expired'));
      await expectLater(
        api.client.get('/a'),
        throwsA(isA<AppFailure>().having((f) => f.type, 'type', FailureType.unauthorized)),
      );
      expect(api.expiredCount, 1);
      expect(await api.tokens.accessToken, isNull);
    });

    test('request không cần token (login) không kích hoạt refresh khi 401', () async {
      final api = FakeApi();
      api.backend.on('POST /auth/login', (_) async => FakeReply.error(401, 'Invalid email or password'));
      await expectLater(
        api.client.post('/auth/login', body: {}, auth: false),
        throwsA(isA<AppFailure>().having((f) => f.message, 'message', 'Email hoặc mật khẩu không đúng.')),
      );
      expect(api.backend.count('POST /auth/refresh-token'), 0);
      expect(api.expiredCount, 0);
    });

    test('HTTP 200 kèm success:false ⇒ lỗi', () async {
      final api = FakeApi();
      api.backend.on('GET /x', (_) async => const FakeReply(200, {'success': false, 'message': 'Lỗi nghiệp vụ'}));
      await expectLater(api.client.get('/x'), throwsA(isA<AppFailure>()));
    });
  });

  group('ApiErrorMapper', () {
    test('lỗi Zod ⇒ lỗi theo field tiếng Việt', () {
      final f = ApiErrorMapper.fromResponse(400, {
        'success': false,
        'message': 'Validation failed',
        'errors': [
          {'field': 'email', 'message': 'Invalid email address'},
          {'field': 'password', 'message': 'Password must be at least 6 characters'},
          {'field': 'bankInfo.accountNumber', 'message': 'Required'},
        ],
      });
      expect(f.type, FailureType.validation);
      expect(f.fieldErrors['email'], 'Email không hợp lệ');
      expect(f.fieldErrors['password'], 'Tối thiểu 6 ký tự');
      expect(f.fieldErrors['accountNumber'], 'Bắt buộc nhập');
      expect(f.message, contains('Dữ liệu chưa hợp lệ'));
    });

    test('lỗi nghiệp vụ giữ code, thông điệp tiếng Việt của BE giữ nguyên', () {
      final f = ApiErrorMapper.fromResponse(409, {
        'success': false,
        'message': 'Còn khóa học chưa kết thúc.',
        'errors': {'code': 'CLASS_NOT_COMPLETED'},
      });
      expect(f.type, FailureType.conflict);
      expect(f.code, 'CLASS_NOT_COMPLETED');
      expect(f.message, 'Còn khóa học chưa kết thúc.');
    });

    test('5xx ⇒ thông điệp chung, không lộ chi tiết', () {
      final f = ApiErrorMapper.fromResponse(500, {'success': false, 'message': 'Internal server error'});
      expect(f.type, FailureType.server);
      expect(f.isRetryable, isTrue);
    });
  });
}
