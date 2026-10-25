import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/widgets/app_snackbar.dart';
import '../domain/entities/banking_app.dart';
import '../domain/entities/payment.dart';

/// Dịch vụ mở ứng dụng ngân hàng qua App-to-App Deep Link (VietQR).
abstract final class BankLauncherService {
  /// Kiểm tra xem ứng dụng ngân hàng đã được cài đặt trên máy hay chưa.
  static Future<bool> isAppInstalled(BankingApp app) async {
    try {
      final uri = Uri.parse(app.scheme);
      return await canLaunchUrl(uri);
    } on Object {
      return false;
    }
  }

  /// Lọc danh sách các ứng dụng ngân hàng đã cài trên thiết bị.
  static Future<List<BankingApp>> getInstalledApps() async {
    final installed = <BankingApp>[];
    for (final app in BankingApp.supportedApps) {
      if (await isAppInstalled(app)) {
        installed.add(app);
      }
    }
    return installed;
  }

  /// Mở ứng dụng ngân hàng đã chọn với thông tin chuyển khoản điền sẵn.
  static Future<bool> launchApp({
    required BuildContext context,
    required BankingApp app,
    required Checkout checkout,
  }) async {
    // 1. Luôn tự động sao chép số tài khoản trước (tiện dụng tối đa cho người dùng).
    await Clipboard.setData(ClipboardData(text: checkout.bank.accountNumber));
    if (context.mounted) {
      AppSnackbar.success(context, 'Đã chép STK ${checkout.bank.accountNumber}. Đang mở ${app.shortName}...');
    }

    // 2. Gọi App-to-App Deeplink chuẩn VietQR:
    // https://dl.vietqr.io/pay?app=<appId>&ba=<accNo>@<bankId>&am=<amount>&tn=<content>
    final deepLink = Uri.parse(
      'https://dl.vietqr.io/pay?app=${app.appId}'
      '&ba=${checkout.bank.accountNumber}@${checkout.bank.bankId}'
      '&am=${checkout.amount}'
      '&tn=${Uri.encodeComponent(checkout.transferContent)}',
    );

    try {
      final launched = await launchUrl(deepLink, mode: LaunchMode.externalApplication);
      if (launched) return true;
    } on Object {
      // Tiếp tục thử fallback bên dưới
    }

    // 3. Fallback: Nếu deep link qua gateway không mở được, thử mở trực tiếp bằng custom scheme
    try {
      final directUri = Uri.parse(app.scheme);
      if (await canLaunchUrl(directUri)) {
        final directLaunched = await launchUrl(directUri, mode: LaunchMode.externalApplication);
        if (directLaunched) return true;
      }
    } on Object {
      // Tiếp tục xử lý thất bại
    }

    // 4. Nếu máy chưa cài hoặc không thể mở
    if (context.mounted) {
      AppSnackbar.info(context, 'Không thể mở ${app.name}. Hãy mở app thủ công và dán số tài khoản đã chép.');
    }
    return false;
  }

  /// Sao chép toàn bộ thông tin thanh toán vào bộ nhớ tạm.
  static Future<void> copyAllInfo(BuildContext context, Checkout checkout) async {
    final fullText =
        'Ngân hàng: ${checkout.bank.bankName}\n'
        'STK: ${checkout.bank.accountNumber}\n'
        'Chủ TK: ${checkout.bank.accountHolder}\n'
        'Số tiền: ${checkout.amount}đ\n'
        'Nội dung: ${checkout.transferContent}';
    await Clipboard.setData(ClipboardData(text: fullText));
    if (context.mounted) {
      AppSnackbar.success(context, 'Đã sao chép đầy đủ thông tin chuyển khoản.');
    }
  }
}
