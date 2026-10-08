import '../entities/coach_dashboard.dart';
import '../entities/wallet.dart';

/// Nghiệp vụ riêng của HLV — module `coaches` (gồm `coach-wallet`).
abstract interface class CoachRepository {
  Future<CoachDashboard> dashboard();

  /// `GET /coaches/me/wallet`.
  Future<CoachWallet> wallet();

  /// `GET /coaches/me/wallet/transactions`.
  Future<List<WalletTransaction>> transactions();

  /// `POST /coaches/me/wallet/withdraw`.
  Future<WalletTransaction> withdraw({required int amount, required BankInfo bank, String? note});

  /// Hồ sơ học viên (`GET /members/:id`) + chuyên cần trong các khóa của tôi.
  Future<StudentProfile> student(String memberProfileId);
}
