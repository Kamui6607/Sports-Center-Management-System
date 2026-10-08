import '../../features/auth/domain/entities/app_user.dart';
import '../../features/auth/domain/entities/auth_models.dart';
import 'app_routes.dart';

/// Quy tắc điều hướng theo phiên + vai trò (tách riêng để test được).
abstract final class RouteGuard {
  /// Màn công khai cho Guest (Q2: Guest xem khóa học & sản phẩm).
  static const _publicExact = {
    AppRoutes.welcome,
    AppRoutes.login,
    AppRoutes.register,
    AppRoutes.forgotPassword,
    AppRoutes.resetPassword,
    AppRoutes.explore,
    AppRoutes.exploreClasses,
    AppRoutes.shop,
    AppRoutes.devTools,
  };
  static const _publicPrefixes = ['/classes/', '/products/'];

  /// Màn chỉ dành cho người chưa đăng nhập.
  static const _guestOnly = {
    AppRoutes.welcome,
    AppRoutes.login,
    AppRoutes.register,
    AppRoutes.splash,
    AppRoutes.explore,
    AppRoutes.exploreClasses,
  };

  static const _rolePrefixes = {
    UserRole.member: ['/m/', '/member/'],
    UserRole.coach: ['/c/', '/coach/'],
    UserRole.manager: ['/r/', '/manager/'],
  };

  static String homeOf(UserRole role) => switch (role) {
    UserRole.member => AppRoutes.memberHome,
    UserRole.coach => AppRoutes.coachHome,
    UserRole.manager => AppRoutes.managerHome,
  };

  static bool isPublic(String location) => _publicExact.contains(location) || _publicPrefixes.any(location.startsWith);

  /// Trả path cần chuyển tới, hoặc `null` nếu được ở lại.
  /// [loading] = đang khôi phục phiên lần đầu.
  /// [from] = màn người dùng định vào trước khi bị yêu cầu đăng nhập.
  static String? redirect({
    required bool loading,
    required AuthSession? session,
    required String location,
    String? from,
  }) {
    if (loading) return location == AppRoutes.splash ? null : AppRoutes.splash;

    if (session == null) {
      if (location == AppRoutes.splash) return AppRoutes.welcome;
      if (isPublic(location)) return null;
      return '${AppRoutes.login}?from=${Uri.encodeComponent(location)}';
    }

    // Coach chưa được duyệt: chỉ được nộp CV / xem trạng thái hồ sơ.
    if (session.isPendingCoach) {
      if (location.startsWith('/onboarding/') || location == AppRoutes.devTools) return null;
      return session.certification?.hasFile == true ? AppRoutes.onboardingStatus : AppRoutes.onboardingCv;
    }

    final role = session.user.role;
    final home = homeOf(role);
    if (_guestOnly.contains(location) || location.startsWith('/onboarding/')) {
      // Quay lại đúng màn trước khi đăng nhập (nếu vai trò được phép).
      if (from != null && from.startsWith('/') && redirect(loading: false, session: session, location: from) == null) {
        return from;
      }
      return home;
    }

    for (final entry in _rolePrefixes.entries) {
      if (entry.key != role && entry.value.any(location.startsWith)) return home;
    }
    // Manager không mua hàng / khóa học trên Mobile.
    if (role == UserRole.manager &&
        (location.startsWith('/payment/') || location == AppRoutes.orders || location == AppRoutes.shop)) {
      return home;
    }
    return null;
  }
}
