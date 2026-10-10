/// Đường dẫn điều hướng của app. Dùng các hàm dựng path thay vì chuỗi rời.
abstract final class AppRoutes {
  // Chung / công khai
  static const splash = '/splash';
  static const welcome = '/welcome';
  static const login = '/login';
  static const register = '/register';
  static const forgotPassword = '/forgot-password';
  static const resetPassword = '/reset-password';
  static const explore = '/explore';
  static const exploreClasses = '/explore/classes';
  static const shop = '/shop';
  static String classDetail(String id) => '/classes/$id';
  static String productDetail(String id) => '/products/$id';
  static String payment(String paymentId) => '/payment/$paymentId';
  static const notifications = '/notifications';
  static const chat = '/chat';
  static String chatRoom(String peerId) => '/chat/$peerId';
  static const profileEdit = '/profile/edit';
  static const changePassword = '/profile/password';
  static const orders = '/orders';
  static String order(String id) => '/orders/$id';
  static const cart = '/cart';

  /// Thanh toán: từ giỏ (`?ids=a,b`) hoặc mua ngay (`?buy=<productId>&qty=<n>`).
  static const checkout = '/checkout';
  static String checkoutCart(Iterable<String> productIds) => '/checkout?ids=${productIds.join(',')}';
  static String checkoutBuyNow(String productId, int quantity) => '/checkout?buy=$productId&qty=$quantity';
  static const addresses = '/addresses';
  static const invoices = '/invoices';
  static String invoice(String id) => '/invoices/$id';
  static const devTools = '/dev';

  // Coach onboarding
  static const onboardingCv = '/onboarding/cv';
  static const onboardingStatus = '/onboarding/status';

  // Member — tab
  static const memberHome = '/m/home';
  static const memberClasses = '/m/classes';
  static const memberSchedule = '/m/schedule';
  static const memberShop = '/m/shop';
  static const memberAccount = '/m/account';

  // Member — màn con
  static const myCourses = '/member/courses';
  static String myCourse(String classId) => '/member/courses/$classId';
  static String cancelCourse(String classId) => '/member/courses/$classId/cancel';
  static const refunds = '/member/refunds';
  static String mySession(String sessionId) => '/member/sessions/$sessionId';
  static const scan = '/member/scan';
  static const attendance = '/member/attendance';
  static const training = '/member/training';
  static String trainingPlan(String planId) => '/member/training/$planId';

  // Coach — tab
  static const coachHome = '/c/home';
  static const coachSchedule = '/c/schedule';
  static const coachClasses = '/c/classes';
  static const coachWallet = '/c/wallet';
  static const coachAccount = '/c/account';

  // Coach — màn con
  static String teachingSession(String id) => '/coach/sessions/$id';
  static String sessionQr(String id) => '/coach/sessions/$id/qr';
  static String sessionAttendance(String id) => '/coach/sessions/$id/attendance';
  static String sessionCancel(String id) => '/coach/sessions/$id/cancel';
  static const createClass = '/coach/classes/new';
  static String coachClass(String id) => '/coach/classes/$id';
  static String editClass(String id) => '/coach/classes/$id/edit';
  static String student(String memberId) => '/coach/students/$memberId';
  static String coachPlan(String planId) => '/coach/training/$planId';
  static const withdraw = '/coach/withdraw';
  static const coachFeedback = '/coach/feedback';

  // Manager — tab
  static const managerHome = '/r/home';
  static const managerApprovals = '/r/approvals';
  static const managerAccount = '/r/account';

  // Manager — màn con
  static String reviewCv(String coachProfileId) => '/manager/cv/$coachProfileId';
  static String reviewClass(String classId) => '/manager/classes/$classId';
  static String reviewWithdrawal(String txId) => '/manager/withdrawals/$txId';
  static String reviewRefund(String refundId) => '/manager/refunds/$refundId';
  static const managerOrders = '/manager/orders';
  static String managerOrder(String id) => '/manager/orders/$id';
  static const pickupScan = '/manager/pickup-scan';
  static const inventory = '/manager/inventory';
  static String inventoryItem(String productId) => '/manager/inventory/$productId';
}
