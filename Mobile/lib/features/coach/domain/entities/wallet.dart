/// Tỷ lệ doanh thu HLV nhận (85%) — chỉ dùng để HIỂN THỊ ước tính; số tiền
/// chính thức do BE tính.
const kCoachRevenueShare = 0.85;

/// Loại giao dịch ví (`TransactionType`).
enum WalletTxType { deposit, withdrawal, refundDebit }

/// Trạng thái giao dịch ví (`TransactionStatus`).
enum WalletTxStatus { pending, completed, rejected, failed }

/// Thông tin ngân hàng nhận tiền khi rút.
class BankInfo {
  const BankInfo({required this.bankName, required this.accountNumber, required this.accountName});

  final String bankName;
  final String accountNumber;
  final String accountName;
}

/// Giao dịch ví HLV (`WalletTransaction`).
class WalletTransaction {
  const WalletTransaction({
    required this.id,
    required this.amount,
    required this.type,
    required this.status,
    required this.createdAt,
    this.className,
    this.note,
    this.bankInfo,
    this.rejectReason,
    this.coachName,
  });

  final String id;

  /// Luôn dương; dấu suy từ [type].
  final int amount;
  final WalletTxType type;
  final WalletTxStatus status;
  final DateTime createdAt;
  final String? className;
  final String? note;
  final BankInfo? bankInfo;
  final String? rejectReason;
  final String? coachName;

  int get signedAmount => type == WalletTxType.deposit ? amount : -amount;
}

/// Một điều kiện rút tiền (Q10). Danh sách điều kiện do repository trả về,
/// UI chỉ hiển thị — không tự suy luật.
class WithdrawCheck {
  const WithdrawCheck({required this.code, required this.label, required this.passed, this.detail});

  final String code;
  final String label;
  final bool passed;
  final String? detail;
}

/// Ví HLV (`GET /coaches/me/wallet`).
class CoachWallet {
  const CoachWallet({
    required this.balance,
    required this.pendingRefundHold,
    required this.checks,
    this.pendingWithdrawal,
  });

  final int balance;

  /// Tiền đang giữ cho các yêu cầu hoàn tiền chờ duyệt.
  final int pendingRefundHold;
  final List<WithdrawCheck> checks;
  final WalletTransaction? pendingWithdrawal;

  /// Số dư khả dụng = số dư − tiền đang giữ.
  int get available => (balance - pendingRefundHold).clamp(0, balance);

  bool get canWithdraw => checks.every((c) => c.passed);
}
