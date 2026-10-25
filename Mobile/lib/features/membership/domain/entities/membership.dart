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
    this.benefits = const [],
    this.isFeatured = false,
    int? pricePer30Days,
  }) : pricePer30Days = pricePer30Days ?? (durationDays > 0 ? price * 30 ~/ durationDays : price);

  final String id;
  final String name;
  final int durationDays;
  final int price;
  final String? description;

  /// Quyền lợi hiển thị trên thẻ gói.
  final List<String> benefits;

  /// Gói nổi bật ("Phổ biến").
  final bool isFeatured;

  /// Giá quy đổi 30 ngày — so sánh giữa các gói.
  final int pricePer30Days;
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
    this.isQueued = false,
    this.totalDays,
    this.paidAmount,
    this.cancelReason,
    this.paymentId,
  });

  final String id;
  final MembershipPlan plan;
  final DateTime startDate;

  /// Ngày hết hạn của chính gói này.
  final DateTime endDate;
  final MembershipStatus status;
  final int daysLeft;

  /// Gói mua trước, chưa tới lượt dùng (bắt đầu khi gói hiện tại hết hạn).
  final bool isQueued;
  final int? totalDays;

  /// Số tiền đã trả lúc mua (ảnh chụp).
  final int? paidAmount;
  final String? cancelReason;

  /// Giao dịch mua gói — mở "Chi tiết thanh toán" (hóa đơn).
  final String? paymentId;

  bool get isActive => status == MembershipStatus.active && daysLeft > 0;

  int get durationDays => totalDays ?? endDate.difference(startDate).inDays;
}

/// Tổng quan thẻ thành viên (`GET /memberships/my`): gói đang dùng + gói xếp hàng + hạn cuối cùng.
class MembershipOverview {
  const MembershipOverview({
    this.current,
    this.queued = const [],
    this.validUntil,
    this.totalDaysLeft = 0,
    this.recentExpired,
    this.canQueueMore = true,
  });

  static const empty = MembershipOverview();

  final Membership? current;
  final List<Membership> queued;

  /// Hạn dùng cuối cùng (gồm cả gói xếp hàng).
  final DateTime? validUntil;
  final int totalDaysLeft;
  final Membership? recentExpired;
  final bool canQueueMore;

  bool get isActive => current != null && current!.isActive;
}

/// Mã QR động trên thẻ (`GET /memberships/my/pass`) — sống ~60 giây.
class MemberPass {
  const MemberPass({required this.token, required this.expiresAt, required this.isActive});

  final String token;
  final DateTime expiresAt;
  final bool isActive;
}

/// Kết quả quét thẻ thành viên (`POST /memberships/pass/verify`).
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
    this.reason,
    this.entriesToday = 0,
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

  /// Lý do từ BE (VD "Gói đã hết hạn ngày …").
  final String? reason;

  /// Số lượt vào hợp lệ hôm nay (gồm lượt này).
  final int entriesToday;
}
