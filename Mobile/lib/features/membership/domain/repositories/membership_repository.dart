import '../entities/membership.dart';

/// Gói thành viên tập gym tự do — module `memberships`.
abstract interface class MembershipRepository {
  /// `GET /membership-plans` — gói đang bán (thứ tự Manager đặt, rồi giá tăng dần).
  Future<List<MembershipPlan>> listPlans();

  /// `POST /memberships/purchase { planId }` ⇒ `paymentId` của giao dịch VietQR (mở màn thanh toán).
  /// Còn giao dịch mua gói chưa hết hạn ⇒ trả lại giao dịch đó.
  Future<String> purchase(String planId);

  /// `GET /memberships/my` — gói đang dùng (hoặc gói xếp hàng đầu tiên), `null` nếu không có.
  Future<Membership?> myMembership();

  /// `GET /memberships/my` — tổng quan thẻ: gói đang dùng, gói xếp hàng, hạn cuối cùng.
  Future<MembershipOverview> overview();

  /// `GET /memberships/my/history` — mọi gói đã mua (mới → cũ).
  Future<List<Membership>> history();

  /// `GET /memberships/my/pass` — mã QR động (~60 giây) cho thẻ thành viên.
  Future<MemberPass> pass();

  /// `POST /memberships/pass/verify { token }` (HLV / Quản lý quét thẻ) — ghi nhật ký vào cửa.
  Future<MembershipVerifyResult> verifyPass(String token);
}
