import '../entities/coach_term.dart';

/// Kỳ học & quyền lợi của Coach — module `terms` (chỉ các endpoint của chính Coach).
abstract interface class CoachTermRepository {
  /// `GET /terms/me` — trạng thái của tôi trong kỳ hiện tại.
  Future<CoachTermStatus> myStatus();

  /// `GET /terms/me/pass` — mã thẻ ra vào (đổi liên tục, đưa Quản lý quét).
  Future<CoachPass> pass();

  /// `GET /terms/me/leaves` — đơn nghỉ của tôi (mới nhất trước).
  Future<List<CoachLeave>> myLeaves();

  /// `POST /terms/me/leaves` — xin nghỉ; [startDate]/[endDate] là NGÀY (giờ VN, bao gồm hai đầu).
  Future<CoachLeave> createLeave({
    required DateTime startDate,
    required DateTime endDate,
    required LeaveKind kind,
    required String reason,
  });

  /// `DELETE /terms/me/leaves/:id` — hủy đơn đang chờ duyệt (hoặc đã duyệt nhưng chưa bắt đầu).
  Future<CoachLeave> cancelLeave(String id);

  /// `POST /terms/check-in { token }` — quét QR check-in do Quản lý tạo ⇒ ghi MỘT ngày dùng phòng.
  /// Quét lại trong ngày ⇒ `alreadyCheckedIn`, không tính thêm.
  Future<CheckInResult> checkIn(String token);

  /// `GET /terms/me/check-ins` — mức dùng tháng này + các ngày gần đây.
  Future<MyCheckIns> myCheckIns();
}
