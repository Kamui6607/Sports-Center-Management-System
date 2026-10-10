import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/attendance/presentation/screens/attendance_screen.dart';
import '../../features/attendance/presentation/screens/scan_screen.dart';
import '../../features/attendance/presentation/screens/session_qr_screen.dart';
import '../../features/auth/presentation/providers/session_provider.dart';
import '../../features/auth/presentation/screens/coach_onboarding_screens.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/password_reset_screens.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/auth/presentation/screens/welcome_screen.dart';
import '../../features/chat/presentation/chat_room_screen.dart';
import '../../features/chat/presentation/conversations_screen.dart';
import '../../features/classes/presentation/screens/browse_classes_screen.dart';
import '../../features/classes/presentation/screens/class_detail_screen.dart';
import '../../features/classes/presentation/screens/class_wizard_screen.dart';
import '../../features/classes/presentation/screens/coach_class_detail_screen.dart';
import '../../features/classes/presentation/screens/coach_classes_screen.dart';
import '../../features/classes/presentation/screens/my_course_detail_screen.dart';
import '../../features/classes/presentation/screens/my_courses_screen.dart';
import '../../features/coach/presentation/screens/coach_home_screen.dart';
import '../../features/coach/presentation/screens/student_screen.dart';
import '../../features/coach/presentation/screens/wallet_screen.dart';
import '../../features/coach/presentation/screens/withdraw_screen.dart';
import '../../features/dev/dev_tools_screen.dart';
import '../../features/feedbacks/presentation/coach_feedback_screen.dart';
import '../../features/home/presentation/explore_screen.dart';
import '../../features/home/presentation/member_home_screen.dart';
import '../../features/manager/presentation/approvals_screen.dart';
import '../../features/manager/presentation/manager_home_screen.dart';
import '../../features/manager/presentation/money_review_screens.dart';
import '../../features/manager/presentation/review_screens.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/payments/presentation/screens/invoice_screens.dart';
import '../../features/payments/presentation/screens/payment_screen.dart';
import '../../features/products/presentation/screens/product_detail_screen.dart';
import '../../features/products/presentation/screens/shop_screen.dart';
import '../../features/profile/presentation/account_screen.dart';
import '../../features/profile/presentation/profile_screens.dart';
import '../../features/refunds/presentation/screens/refund_screens.dart';
import '../../features/schedule/presentation/screens/cancel_session_screen.dart';
import '../../features/schedule/presentation/screens/coach_schedule_screen.dart';
import '../../features/schedule/presentation/screens/manual_attendance_screen.dart';
import '../../features/schedule/presentation/screens/member_schedule_screen.dart';
import '../../features/schedule/presentation/screens/my_session_screen.dart';
import '../../features/schedule/presentation/screens/teaching_session_screen.dart';
import '../../features/shop/presentation/screens/address_screens.dart';
import '../../features/shop/presentation/screens/cart_screen.dart';
import '../../features/shop/presentation/screens/checkout_screen.dart';
import '../../features/shop/presentation/screens/inventory_screens.dart';
import '../../features/shop/presentation/screens/manager_order_screens.dart';
import '../../features/shop/presentation/screens/order_detail_screen.dart';
import '../../features/shop/presentation/screens/orders_screen.dart';
import '../../features/shop/presentation/screens/pickup_scan_screen.dart';
import '../../features/training/presentation/training_screens.dart';
import '../shell/role_shell.dart';
import 'app_routes.dart';
import 'route_guard.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Router của app. Tự điều hướng lại mỗi khi phiên đăng nhập thay đổi.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(sessionProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  GoRoute page(String path, Widget Function(GoRouterState s) builder) =>
      GoRoute(path: path, parentNavigatorKey: _rootKey, builder: (_, s) => builder(s));

  StatefulShellBranch branch(String path, Widget child) => StatefulShellBranch(
    routes: [GoRoute(path: path, builder: (_, _) => child)],
  );

  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      return RouteGuard.redirect(
        // Lỗi mạng khi khôi phục phiên ⇒ ở lại Splash (hiển thị "Thử lại").
        loading: (session.isLoading || session.hasError) && !session.hasValue,
        session: session.value,
        location: state.matchedLocation,
        from: state.uri.queryParameters['from'],
      );
    },
    routes: [
      // ── Chung / công khai ────────────────────────────────────────────
      page(AppRoutes.splash, (_) => const SplashScreen()),
      page(AppRoutes.welcome, (_) => const WelcomeScreen()),
      page(
        AppRoutes.login,
        (s) => LoginScreen(initialEmail: s.uri.queryParameters['email'], from: s.uri.queryParameters['from']),
      ),
      page(AppRoutes.register, (_) => const RegisterScreen()),
      page(AppRoutes.forgotPassword, (_) => const ForgotPasswordScreen()),
      page(AppRoutes.resetPassword, (s) => ResetPasswordScreen(email: s.uri.queryParameters['email'] ?? '')),
      page(AppRoutes.explore, (_) => const ExploreScreen()),
      page(AppRoutes.exploreClasses, (_) => const BrowseClassesScreen(asTab: false)),
      page(AppRoutes.shop, (_) => const ShopScreen(asTab: false)),
      page('/classes/:id', (s) => ClassDetailScreen(classId: s.pathParameters['id']!)),
      page('/products/:id', (s) => ProductDetailScreen(productId: s.pathParameters['id']!)),
      page('/payment/:id', (s) => PaymentScreen(paymentId: s.pathParameters['id']!)),
      page(AppRoutes.notifications, (_) => const NotificationsScreen()),
      page(AppRoutes.chat, (_) => const ConversationsScreen()),
      page('/chat/:peerId', (s) => ChatRoomScreen(peerId: s.pathParameters['peerId']!)),
      page(AppRoutes.profileEdit, (_) => const EditProfileScreen()),
      page(AppRoutes.changePassword, (_) => const ChangePasswordScreen()),
      page(AppRoutes.orders, (_) => const OrdersScreen()),
      page('/orders/:id', (s) => OrderDetailScreen(orderId: s.pathParameters['id']!)),
      page(AppRoutes.cart, (_) => const CartScreen()),
      page(AppRoutes.checkout, (s) {
        final q = s.uri.queryParameters;
        return CheckoutScreen(
          cartProductIds: (q['ids'] ?? '').split(',').where((e) => e.isNotEmpty).toList(),
          buyNowProductId: q['buy'],
          buyNowQuantity: int.tryParse(q['qty'] ?? '') ?? 1,
        );
      }),
      page(AppRoutes.addresses, (_) => const AddressesScreen()),
      page(AppRoutes.invoices, (_) => const InvoicesScreen()),
      page('/invoices/:id', (s) => InvoiceDetailScreen(invoiceId: s.pathParameters['id']!)),
      page(AppRoutes.devTools, (_) => const DevToolsScreen()),

      // ── Coach onboarding ─────────────────────────────────────────────
      page(AppRoutes.onboardingCv, (_) => const CvUploadScreen()),
      page(AppRoutes.onboardingStatus, (_) => const CvStatusScreen()),

      // ── Member ───────────────────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => RoleShell(navigationShell: shell, destinations: RoleShell.member),
        branches: [
          branch(AppRoutes.memberHome, const MemberHomeScreen()),
          branch(AppRoutes.memberClasses, const BrowseClassesScreen()),
          branch(AppRoutes.memberSchedule, const MemberScheduleScreen()),
          branch(AppRoutes.memberShop, const ShopScreen()),
          branch(AppRoutes.memberAccount, const AccountScreen()),
        ],
      ),
      page(AppRoutes.myCourses, (_) => const MyCoursesScreen()),
      page('/member/courses/:id', (s) => MyCourseDetailScreen(classId: s.pathParameters['id']!)),
      page('/member/courses/:id/cancel', (s) => CancelCourseScreen(classId: s.pathParameters['id']!)),
      page(AppRoutes.refunds, (_) => const RefundsScreen()),
      page('/member/sessions/:id', (s) => MySessionScreen(sessionId: s.pathParameters['id']!)),
      page(AppRoutes.scan, (_) => const ScanScreen()),
      page(AppRoutes.attendance, (_) => const AttendanceScreen()),
      page(AppRoutes.training, (_) => const TrainingPlansScreen()),
      page('/member/training/:id', (s) => TrainingPlanScreen(planId: s.pathParameters['id']!)),

      // ── Coach ────────────────────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => RoleShell(navigationShell: shell, destinations: RoleShell.coach),
        branches: [
          branch(AppRoutes.coachHome, const CoachHomeScreen()),
          branch(AppRoutes.coachSchedule, const CoachScheduleScreen()),
          branch(AppRoutes.coachClasses, const CoachClassesScreen()),
          branch(AppRoutes.coachWallet, const WalletScreen()),
          branch(AppRoutes.coachAccount, const AccountScreen()),
        ],
      ),
      page('/coach/sessions/:id', (s) => TeachingSessionScreen(sessionId: s.pathParameters['id']!)),
      page('/coach/sessions/:id/qr', (s) => SessionQrScreen(sessionId: s.pathParameters['id']!)),
      page('/coach/sessions/:id/attendance', (s) => ManualAttendanceScreen(sessionId: s.pathParameters['id']!)),
      page('/coach/sessions/:id/cancel', (s) => CancelSessionScreen(sessionId: s.pathParameters['id']!)),
      page(AppRoutes.createClass, (_) => const ClassWizardScreen()),
      page('/coach/classes/:id', (s) => CoachClassDetailScreen(classId: s.pathParameters['id']!)),
      page('/coach/classes/:id/edit', (s) => ClassWizardScreen(classId: s.pathParameters['id'])),
      page('/coach/students/:id', (s) => StudentScreen(memberProfileId: s.pathParameters['id']!)),
      page('/coach/training/:id', (s) => TrainingPlanScreen(planId: s.pathParameters['id']!, coachMode: true)),
      page(AppRoutes.withdraw, (_) => const WithdrawScreen()),
      page(AppRoutes.coachFeedback, (_) => const CoachFeedbackScreen()),

      // ── Manager (bản rút gọn) ────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => RoleShell(navigationShell: shell, destinations: RoleShell.manager),
        branches: [
          branch(AppRoutes.managerHome, const ManagerHomeScreen()),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.managerApprovals,
                builder: (_, s) => ApprovalsScreen(initialTab: int.tryParse(s.uri.queryParameters['tab'] ?? '') ?? 0),
              ),
            ],
          ),
          branch(AppRoutes.managerAccount, const AccountScreen()),
        ],
      ),
      page('/manager/cv/:id', (s) => CvReviewScreen(coachProfileId: s.pathParameters['id']!)),
      page('/manager/classes/:id', (s) => ClassReviewScreen(classId: s.pathParameters['id']!)),
      page('/manager/withdrawals/:id', (s) => WithdrawalReviewScreen(transactionId: s.pathParameters['id']!)),
      page('/manager/refunds/:id', (s) => RefundReviewScreen(refundId: s.pathParameters['id']!)),
      page(AppRoutes.managerOrders, (_) => const ManagerOrdersScreen()),
      page('/manager/orders/:id', (s) => ManagerOrderDetailScreen(orderId: s.pathParameters['id']!)),
      page(AppRoutes.pickupScan, (_) => const PickupScanScreen()),
      page(AppRoutes.inventory, (_) => const InventoryScreen()),
      page('/manager/inventory/:id', (s) => InventoryItemScreen(productId: s.pathParameters['id']!)),
    ],
    errorBuilder: (context, state) => const _NotFoundScreen(),
  );
  ref.onDispose(router.dispose);
  return router;
});

class _NotFoundScreen extends StatelessWidget {
  const _NotFoundScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: const Center(child: Text('Không tìm thấy trang.')),
  );
}
