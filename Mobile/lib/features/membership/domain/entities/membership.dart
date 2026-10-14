/// Trạng thái gói thành viên (`MembershipStatus`).
enum MembershipStatus { active, expired, cancelled }

/// Gói thành viên tập gym tự do (`MembershipPlan`).
class MembershipPlan {
  const MembershipPlan({
    required this.id,
    required this.name,
    required this.durationDays,
    required this.price,
    this.description,
  });

  final String id;
  final String name;
  final int durationDays;
  final int price;
  final String? description;
}

/// Gói thành viên của hội viên (`Membership`).
class Membership {
  const Membership({
    required this.id,
    required this.plan,
    required this.startDate,
    required this.endDate,
    required this.status,
    required this.daysLeft,
  });

  final String id;
  final MembershipPlan plan;
  final DateTime startDate;

  /// Ngày hết hạn — đã gồm các gói mua cộng dồn.
  final DateTime endDate;
  final MembershipStatus status;
  final int daysLeft;

  bool get isActive => status == MembershipStatus.active && daysLeft > 0;
}

/// Kết quả quét QR thẻ thành viên (`GET /memberships/verify/:userId`).
class MembershipVerifyResult {
  const MembershipVerifyResult({
    required this.userId,
    required this.fullName,
    required this.isActive,
    this.avatarUrl,
    this.status,
    this.planName,
    this.endDate,
    this.daysLeft = 0,
  });

  final String userId;
  final String fullName;
  final String? avatarUrl;
  final bool isActive;

  /// `null` ⇒ người này chưa từng có gói (hoặc không phải hội viên).
  final MembershipStatus? status;
  final String? planName;
  final DateTime? endDate;
  final int daysLeft;
}
