import '../entities/membership.dart';

/// Gói thành viên tập gym tự do — module `memberships`.
abstract interface class MembershipRepository {
  /// `GET /membership-plans` — gói đang bán, giá tăng dần.
  Future<List<MembershipPlan>> listPlans();

  /// `POST /memberships/purchase { planId }` ⇒ `paymentId` của giao dịch VietQR (mở màn thanh toán).
  /// Còn giao dịch mua gói chưa hết hạn ⇒ trả lại giao dịch đó.
  Future<String> purchase(String planId);

  /// `GET /memberships/my` — gói đang hiệu lực, `null` nếu không có.
  Future<Membership?> myMembership();

  /// `GET /memberships/verify/:userId` (HLV / Quản lý quét QR của hội viên).
  Future<MembershipVerifyResult> verify(String userId);
}
