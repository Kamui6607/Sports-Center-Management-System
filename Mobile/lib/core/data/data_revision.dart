import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Số phiên bản dữ liệu. Provider đọc dữ liệu `watch` provider này; sau mỗi
/// thao tác ghi (mua khóa, hủy đơn, duyệt...) gọi [DataRevision.bump] để mọi
/// màn hình liên quan tự tải lại — kể cả khác feature.
final dataRevisionProvider = NotifierProvider<DataRevision, int>(DataRevision.new);

class DataRevision extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

/// Nguồn thời gian hiện tại (thay được trong test).
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);
