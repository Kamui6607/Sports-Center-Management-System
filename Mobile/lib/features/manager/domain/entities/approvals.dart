import '../../../auth/domain/entities/auth_models.dart';
import '../../../coach/domain/entities/wallet.dart';

/// Số việc chờ duyệt (Tổng quan Manager).
class ApprovalCounts {
  const ApprovalCounts({required this.cvs, required this.classes, required this.withdrawals, required this.refunds});

  final int cvs;
  final int classes;
  final int withdrawals;
  final int refunds;

  int get total => cvs + classes + withdrawals + refunds;
}

/// Hồ sơ HLV chờ duyệt (`GET /coaches/cv/pending`).
class CvApplication {
  const CvApplication({
    required this.coachProfileId,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.certification,
    this.phone,
    this.specialization,
    this.experienceYears,
    this.bio,
  });

  final String coachProfileId;
  final String userId;
  final String fullName;
  final String email;
  final String? phone;
  final String? specialization;
  final int? experienceYears;
  final String? bio;
  final Certification certification;
}

/// Lệnh rút tiền chờ duyệt (TODO BE-7: chưa có endpoint liệt kê).
class WithdrawalRequest {
  const WithdrawalRequest({
    required this.transaction,
    required this.coachProfileId,
    required this.coachName,
    required this.walletBalance,
    required this.pendingRefundHold,
  });

  final WalletTransaction transaction;
  final String coachProfileId;
  final String coachName;
  final int walletBalance;
  final int pendingRefundHold;
}
