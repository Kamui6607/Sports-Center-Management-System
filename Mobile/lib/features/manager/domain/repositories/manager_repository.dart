import 'dart:typed_data';

import '../../../classes/domain/entities/coach_class.dart';
import '../../../classes/domain/entities/course.dart';
import '../../../coach/domain/entities/wallet.dart';
import '../entities/approvals.dart';

/// Duyệt nghiệp vụ của Quản lý (bản rút gọn trên Mobile — Q1).
abstract interface class ManagerRepository {
  Future<ApprovalCounts> counts();

  /// `GET /coaches/cv/pending`.
  Future<List<CvApplication>> pendingCvs();

  Future<CvApplication> cv(String coachProfileId);

  /// BE-8: `GET /coaches/:profileId/cv/file` — nội dung PDF CV (có xác thực).
  Future<Uint8List> cvFile(String coachProfileId);

  /// `PATCH /coaches/:profileId/cv/review { action, reason }`.
  Future<void> reviewCv(String coachProfileId, {required bool approve, String? reason});

  /// `GET /classes?status=PENDING`.
  Future<List<CourseClass>> pendingClasses();

  Future<CoachClassDetail> classDetail(String classId);

  /// `PATCH /classes/:id/review { action, reason }`.
  Future<void> reviewClass(String classId, {required bool approve, String? reason});

  /// `GET /coaches/wallet/transactions?type=WITHDRAWAL&status=` (BE-7).
  Future<List<WithdrawalRequest>> withdrawals({WalletTxStatus? status});

  Future<WithdrawalRequest> withdrawal(String transactionId);

  /// `PATCH /coaches/wallet/transactions/:txId/review { action, reason }`.
  Future<void> reviewWithdrawal(String transactionId, {required bool approve, String? reason});
}
