import '../entities/makeup.dart';

/// Học bù — module `makeup-requests` (Doc/MAKEUP_ABSENCE_PLAN.md §3.3–3.4).
abstract interface class MakeupRepository {
  /// Học viên: yêu cầu của tôi (`GET /makeup-requests/my`).
  Future<List<MakeupRequest>> myRequests();

  /// Học viên xin học bù cho buổi đã báo vắng (`POST /enrollments/:id/makeup-request`).
  Future<MakeupRequest> requestForAbsence(String enrollmentId);

  /// Học viên rút yêu cầu đang chờ (`DELETE /makeup-requests/:id`).
  Future<void> cancel(String requestId);

  /// HLV: yêu cầu của các khóa mình dạy (`GET /makeup-requests`).
  Future<List<MakeupRequest>> coachRequests({MakeupStatus? status});

  /// Buổi có thể xếp (học viên: buổi bù mở của khóa; HLV: mọi buổi hợp lệ).
  Future<({MakeupRequest request, List<MakeupOption> options})> options(String requestId);

  /// HLV xếp / học viên tự chọn buổi bù (`POST /makeup-requests/:id/assign`).
  Future<void> assign(String requestId, String sessionId);

  /// HLV từ chối (`POST /makeup-requests/:id/reject`).
  Future<void> reject(String requestId, String reason);

  /// HLV mở buổi bù (`POST /makeup-requests/slots`).
  Future<OpenMakeupSlotResult> openSlot(OpenMakeupSlotInput input);
}
