import 'package:flutter/widgets.dart';

import '../error/app_failure.dart';
import 'app_snackbar.dart';

/// Chạy một thao tác ghi: lỗi ⇒ snackbar (trả `null`); thành công ⇒ snackbar
/// [success] (nếu có) và trả kết quả.
Future<T?> runAction<T>(BuildContext context, Future<T> Function() action, {String? success}) async {
  try {
    final result = await action();
    if (context.mounted && success != null) AppSnackbar.success(context, success);
    return result;
  } on Object catch (e) {
    if (context.mounted) AppSnackbar.error(context, AppFailure.from(e));
    return null;
  }
}

/// Mixin cho State của form: cờ đang gửi + lỗi field từ BE.
mixin SubmittingState<T extends StatefulWidget> on State<T> {
  bool submitting = false;
  Map<String, String> fieldErrors = const {};
  String? formError;

  /// Chạy [action] với cờ [submitting]; lỗi validation ⇒ gán [fieldErrors].
  Future<R?> submit<R>(Future<R> Function() action) async {
    if (submitting) return null;
    setState(() {
      submitting = true;
      fieldErrors = const {};
      formError = null;
    });
    try {
      return await action();
    } on Object catch (e) {
      final f = AppFailure.from(e);
      if (mounted) {
        setState(() {
          fieldErrors = f.fieldErrors;
          formError = f.message;
        });
      }
      return null;
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }
}
