// Bảng gói thành viên: MembershipPlan, Membership.
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import '../../features/membership/domain/entities/membership.dart';

class MembershipPlanRow {
  MembershipPlanRow({
    required this.id,
    required this.name,
    required this.durationDays,
    required this.price,
    this.description,
    this.isActive = true,
  });

  final String id;
  final String name;
  final int durationDays;
  final int price;
  final String? description;
  bool isActive;
}

class MembershipRow {
  MembershipRow({
    required this.id,
    required this.memberProfileId,
    required this.planId,
    required this.startDate,
    required this.endDate,
    this.paymentId,
    this.status = MembershipStatus.active,
  });

  final String id;
  final String memberProfileId;
  final String planId;
  final String? paymentId;
  final DateTime startDate;
  final DateTime endDate;
  MembershipStatus status;
}
