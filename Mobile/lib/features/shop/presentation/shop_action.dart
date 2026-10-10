import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../../../core/widgets/app_snackbar.dart';
import 'shop_labels.dart';

/// Chạy một thao tác ghi của cửa hàng: lỗi ⇒ snackbar thông điệp tiếng Việt theo mã ([ShopErrors]);
/// thành công ⇒ snackbar [success] + tải lại dữ liệu liên quan. Trả `null` khi lỗi.
Future<T?> runShopAction<T>(
  BuildContext context,
  WidgetRef ref,
  Future<T> Function() action, {
  String? success,
  bool refresh = true,
}) async {
  try {
    final result = await action();
    if (refresh) ref.read(dataRevisionProvider.notifier).bump();
    if (context.mounted && success != null) AppSnackbar.success(context, success);
    return result;
  } on Object catch (e) {
    if (context.mounted) AppSnackbar.error(context, ShopErrors.message(e));
    return null;
  }
}
