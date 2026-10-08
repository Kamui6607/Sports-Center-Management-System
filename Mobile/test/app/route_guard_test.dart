import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/app/router/app_routes.dart';
import 'package:sports_center_mobile/app/router/route_guard.dart';
import 'package:sports_center_mobile/features/auth/domain/entities/app_user.dart';
import 'package:sports_center_mobile/features/auth/domain/entities/auth_models.dart';

AuthSession _session(UserRole role, {bool active = true, Certification? cert}) => AuthSession(
  user: AppUser(id: 'u', email: 'a@b.vn', fullName: 'A', role: role, isActive: active),
  certification: cert,
);

void main() {
  String? go(String location, AuthSession? s, {String? from}) =>
      RouteGuard.redirect(loading: false, session: s, location: location, from: from);

  test('đang khôi phục phiên ⇒ splash', () {
    expect(RouteGuard.redirect(loading: true, session: null, location: AppRoutes.memberHome), AppRoutes.splash);
  });

  test('Guest được xem khóa học, sản phẩm; màn riêng tư ⇒ đăng nhập', () {
    expect(go(AppRoutes.classDetail('c1'), null), isNull);
    expect(go(AppRoutes.productDetail('p1'), null), isNull);
    expect(go(AppRoutes.explore, null), isNull);
    expect(go(AppRoutes.memberHome, null), startsWith(AppRoutes.login));
  });

  test('đúng vai trò về đúng trang chủ, sai vai trò bị chặn', () {
    expect(go(AppRoutes.login, _session(UserRole.member)), AppRoutes.memberHome);
    expect(go(AppRoutes.coachHome, _session(UserRole.member)), AppRoutes.memberHome);
    expect(go(AppRoutes.memberHome, _session(UserRole.coach)), AppRoutes.coachHome);
    expect(go(AppRoutes.coachWallet, _session(UserRole.coach)), isNull);
    expect(go(AppRoutes.managerApprovals, _session(UserRole.manager)), isNull);
    expect(go(AppRoutes.payment('x'), _session(UserRole.manager)), AppRoutes.managerHome);
  });

  test('đăng nhập xong quay lại màn trước đó nếu được phép', () {
    expect(
      go(AppRoutes.login, _session(UserRole.member), from: AppRoutes.classDetail('c2')),
      AppRoutes.classDetail('c2'),
    );
    expect(go(AppRoutes.login, _session(UserRole.member), from: AppRoutes.coachWallet), AppRoutes.memberHome);
  });

  test('Coach chưa duyệt chỉ vào onboarding', () {
    final noCv = _session(UserRole.coach, active: false);
    final pending = _session(
      UserRole.coach,
      active: false,
      cert: Certification(
        id: 'c',
        status: CoachApprovalStatus.pending,
        submittedAt: DateTime(2026),
        fileName: 'cv.pdf',
      ),
    );
    expect(go(AppRoutes.coachHome, noCv), AppRoutes.onboardingCv);
    expect(go(AppRoutes.coachHome, pending), AppRoutes.onboardingStatus);
    expect(go(AppRoutes.onboardingCv, pending), isNull);
  });
}
