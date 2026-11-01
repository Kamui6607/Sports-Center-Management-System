import '../core/network/api_client.dart';
import '../core/network/json.dart';
import '../features/membership/domain/entities/membership.dart';

/// Ánh xạ kết quả quét thẻ thành viên — `POST /memberships/pass/verify`, `pass` của `POST /attendance/coach-scan`.
abstract final class MembershipJson {
  static MembershipVerifyResult verify(Json j) {
    final member = j.obj('member');
    final m = j.objOrNull('membership');
    final valid = j.boolean('valid');
    return MembershipVerifyResult(
      userId: member.str('userId'),
      fullName: member.str('fullName'),
      avatarUrl: ApiClient.absoluteUrl(member.strOrNull('avatarUrl')),
      isActive: valid,
      status: valid ? MembershipStatus.active : (m == null ? null : MembershipStatus.expired),
      planName: m?.strOrNull('planName'),
      endDate: j.dateOrNull('validUntil') ?? m?.dateOrNull('endDate'),
      daysLeft: j.integer('totalDaysLeft'),
      reason: j.strOrNull('reason'),
      entriesToday: j.integer('entriesToday'),
      isMyStudent: j['isMyStudent'] is bool ? j['isMyStudent'] as bool : null,
    );
  }
}
