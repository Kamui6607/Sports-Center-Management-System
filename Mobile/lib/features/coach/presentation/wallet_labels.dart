import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/wallet.dart';

extension WalletTxTypeLabel on WalletTxType {
  String get label => switch (this) {
    WalletTxType.deposit => 'Doanh thu khóa học',
    WalletTxType.withdrawal => 'Rút tiền',
    WalletTxType.refundDebit => 'Trừ hoàn tiền',
  };
}

extension WalletTxStatusLabel on WalletTxStatus {
  StatusLabel get status => switch (this) {
    WalletTxStatus.pending => const StatusLabel('Đang xử lý', StatusTone.warning),
    WalletTxStatus.completed => const StatusLabel('Hoàn tất', StatusTone.success),
    WalletTxStatus.rejected => const StatusLabel('Bị từ chối', StatusTone.danger),
    WalletTxStatus.failed => const StatusLabel('Thất bại', StatusTone.danger),
  };
}
