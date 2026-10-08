import 'package:flutter/material.dart';

import '../../../../core/utils/money.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/payment.dart';

/// Thông tin chuyển khoản thủ công. Chỉ những ô cần dán vào app ngân hàng mới có
/// nút "Chép"; nội dung chuyển khoản kèm nhắc ghi đúng để đối soát tự động.
class BankTransferCard extends StatelessWidget {
  const BankTransferCard({super.key, required this.checkout});

  final Checkout checkout;

  @override
  Widget build(BuildContext context) {
    final c = checkout;
    return AppCard(
      child: Column(
        children: [
          CopyableField(label: 'Ngân hàng', value: c.bank.bankName, copyable: false),
          const Divider(),
          CopyableField(label: 'Chủ tài khoản', value: c.bank.accountHolder, copyable: false),
          const Divider(),
          CopyableField(label: 'Số tài khoản', value: c.bank.accountNumber, emphasize: true),
          const Divider(),
          CopyableField(label: 'Số tiền', value: Money.format(c.amount), copyValue: '${c.amount}', emphasize: true),
          const Divider(),
          CopyableField(
            label: 'Nội dung chuyển khoản',
            value: c.transferContent,
            emphasize: true,
            note: 'Ghi đúng nội dung này để hệ thống tự xác nhận.',
          ),
        ],
      ),
    );
  }
}
