import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'skeleton.dart';
import 'state_views.dart';

/// Hiển thị [AsyncValue] theo quy ước chung: skeleton khi tải lần đầu, lỗi có
/// "Thử lại", trạng thái rỗng (khi [isEmpty] trả true) và dữ liệu.
/// Khi tải lại (refresh / dữ liệu đổi) vẫn giữ dữ liệu cũ, không nháy skeleton.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    super.key,
    required this.value,
    required this.data,
    this.loading,
    this.onRetry,
    this.isEmpty,
    this.empty,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget? loading;
  final VoidCallback? onRetry;
  final bool Function(T data)? isEmpty;
  final Widget? empty;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnReload: true,
    skipLoadingOnRefresh: true,
    loading: () => loading ?? const SkeletonList(),
    error: (e, _) => ErrorState(error: e, onRetry: onRetry),
    data: (d) {
      if (isEmpty != null && empty != null && isEmpty!(d)) return empty!;
      return data(d);
    },
  );
}
