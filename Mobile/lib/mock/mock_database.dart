import '../features/catalog/domain/entities/catalog.dart';
import '../features/payments/domain/entities/payment.dart';
import '../features/refunds/domain/entities/refund.dart';
import '../features/schedule/domain/entities/session.dart';
import 'mock_tables.dart';

export 'mock_mappers.dart';
export 'mock_operations.dart';

/// Cơ sở dữ liệu trong bộ nhớ của BE giả lập + các thao tác nghiệp vụ dùng
/// chung giữa nhiều repository (mô phỏng service của BE).
///
/// Luật nghiệp vụ ở đây CHỈ để mô phỏng BE; UI không phụ thuộc vào chúng.
class MockDatabase {
  MockDatabase({required this.now});

  /// Nguồn thời gian (giờ thật) — dữ liệu seed sinh tương đối theo mốc này.
  final DateTime Function() now;

  final users = <UserRow>[];
  final memberProfiles = <MemberProfileRow>[];
  final coachProfiles = <CoachProfileRow>[];
  final certifications = <CertificationRow>[];
  final sports = <Sport>[];
  final rooms = <Room>[];
  final classes = <ClassRow>[];
  final sessions = <SessionRow>[];
  final enrollments = <EnrollmentRow>[];
  final payments = <PaymentRow>[];
  final invoices = <InvoiceRow>[];
  final attendance = <AttendanceRow>[];
  final qrTickets = <String, QrTicketRow>{};
  final penalties = <PenaltyRow>[];
  final trainingPlans = <TrainingPlanRow>[];
  final trainingResults = <TrainingResultRow>[];
  final feedbacks = <FeedbackRow>[];
  final notifications = <NotificationRow>[];
  final wallets = <WalletRow>[];
  final walletTxs = <WalletTxRow>[];
  final refunds = <RefundRow>[];
  final products = <ProductRow>[];
  final productReviews = <ProductReviewRow>[];
  final productOrders = <ProductOrderRow>[];
  final chatMessages = <ChatMessageRow>[];

  /// Tỷ lệ HLV nhận (85%).
  static const coachShare = 0.85;

  static const bank = BankAccount(
    bankId: 'MBBank',
    bankName: 'Ngân hàng TMCP Quân đội (MB)',
    accountNumber: '0123456789999',
    accountHolder: 'CONG TY PULSE SPORTS CENTER',
  );

  var _seq = 1000;

  String nextId(String prefix) => '$prefix-${++_seq}';

  // ── Tra cứu ────────────────────────────────────────────────────────────

  UserRow user(String id) => users.firstWhere((u) => u.id == id);

  MemberProfileRow? memberOfUser(String userId) => memberProfiles.where((m) => m.userId == userId).firstOrNull;

  CoachProfileRow? coachOfUser(String userId) => coachProfiles.where((c) => c.userId == userId).firstOrNull;

  MemberProfileRow memberProfile(String id) => memberProfiles.firstWhere((m) => m.id == id);

  CoachProfileRow coachProfile(String id) => coachProfiles.firstWhere((c) => c.id == id);

  UserRow userOfMember(String memberProfileId) => user(memberProfile(memberProfileId).userId);

  UserRow userOfCoach(String coachProfileId) => user(coachProfile(coachProfileId).userId);

  ClassRow classRow(String id) => classes.firstWhere((c) => c.id == id);

  SessionRow session(String id) => sessions.firstWhere((s) => s.id == id);

  Room room(String id) => rooms.firstWhere((r) => r.id == id);

  Sport sport(String id) => sports.firstWhere((s) => s.id == id);

  List<SessionRow> sessionsOf(String classId) =>
      sessions.where((s) => s.classId == classId).toList()..sort((a, b) => a.start.compareTo(b.start));

  /// Buổi chính (không tính buổi dạy bù).
  List<SessionRow> mainSessionsOf(String classId) => sessionsOf(classId).where((s) => s.makeupForId == null).toList();

  int bookedCount(String sessionId) =>
      enrollments.where((e) => e.sessionId == sessionId && e.status != EnrollmentStatus.cancelled).length;

  /// Giao dịch mua khóa SUCCESS của học viên (null nếu chưa mua).
  PaymentRow? coursePayment(String memberProfileId, String classId) => payments
      .where((p) => p.memberProfileId == memberProfileId && p.classId == classId && p.status == PaymentStatus.success)
      .firstOrNull;

  PaymentRow? pendingCoursePayment(String memberProfileId, String classId) {
    final t = now();
    return payments
        .where(
          (p) =>
              p.memberProfileId == memberProfileId &&
              p.classId == classId &&
              p.status == PaymentStatus.pending &&
              t.isBefore(p.expiresAt),
        )
        .firstOrNull;
  }

  /// Học viên đã mua (SUCCESS) khóa học.
  List<String> studentsOf(String classId) => payments
      .where((p) => p.classId == classId && p.status == PaymentStatus.success && p.memberProfileId != null)
      .map((p) => p.memberProfileId!)
      .toSet()
      .toList();

  WalletRow walletOf(String coachProfileId) {
    final existing = wallets.where((w) => w.coachProfileId == coachProfileId).firstOrNull;
    if (existing != null) return existing;
    final w = WalletRow(id: nextId('wallet'), coachProfileId: coachProfileId, balance: 0);
    wallets.add(w);
    return w;
  }

  /// Tiền đang giữ cho hoàn tiền chờ duyệt.
  int refundHold(String walletId) => refunds
      .where((r) => r.walletId == walletId && r.status == RefundStatus.pending)
      .fold(0, (sum, r) => sum + r.coachDebitAmount);

  ({double average, int count, Map<int, int> distribution}) coachRating(String coachProfileId) {
    final list = feedbacks.where((f) => f.coachProfileId == coachProfileId).toList();
    final dist = <int, int>{for (var i = 1; i <= 5; i++) i: 0};
    for (final f in list) {
      dist[f.rating] = dist[f.rating]! + 1;
    }
    final avg = list.isEmpty ? 0.0 : list.fold(0, (s, f) => s + f.rating) / list.length;
    return (average: avg, count: list.length, distribution: dist);
  }

  /// Mã đơn SePay giả lập (nội dung chuyển khoản).
  String newOrderCode() => 'PULSE${(now().millisecondsSinceEpoch % 100000000).toString().padLeft(8, '0')}${_seq % 10}';
}
