import '../../core/utils/vn_time.dart';
import '../../features/attendance/domain/entities/attendance.dart';
import '../../features/coach/domain/entities/wallet.dart';
import '../../features/payments/domain/entities/payment.dart';
import '../../features/schedule/domain/entities/session.dart';
import '../mock_database.dart';
import '../mock_tables.dart';

/// Mật khẩu chung của mọi tài khoản demo (CHỈ tồn tại ở chế độ mock).
const kDemoPassword = 'demo123';

/// Tiện ích dựng dữ liệu tương đối theo "hôm nay" (giờ Việt Nam).
class Seeder {
  Seeder(this.db) : today = VnTime.startOfDay(db.now());

  final MockDatabase db;

  /// 00:00 hôm nay giờ VN.
  final DateTime today;

  DateTime get now => db.now();

  /// Thời điểm cách hôm nay [day] ngày, lúc [hour]:[minute] giờ VN.
  DateTime at(int day, [int hour = 9, int minute = 0]) => today.add(Duration(days: day, hours: hour, minutes: minute));

  /// Sinh [count] buổi theo các thứ [weekdays] (ISO 1=T2..7=CN) bắt đầu từ ngày
  /// [startDay]. Buổi đã kết thúc ⇒ `completed` (trừ khi [keepLastPastOpen]).
  List<SessionRow> sessions(
    String classId,
    String roomId, {
    required int startDay,
    required List<int> weekdays,
    required int hour,
    int minute = 0,
    required int durationMinutes,
    required int count,
    bool keepLastPastOpen = false,
  }) {
    final out = <SessionRow>[];
    var day = startDay;
    while (out.length < count) {
      final start = at(day, hour, minute);
      if (weekdays.contains(VnTime.wall(start).weekday)) {
        out.add(
          SessionRow(
            id: '$classId-s${out.length + 1}',
            classId: classId,
            roomId: roomId,
            start: start,
            end: start.add(Duration(minutes: durationMinutes)),
            status: start.add(Duration(minutes: durationMinutes)).isBefore(now)
                ? ScheduleStatus.completed
                : ScheduleStatus.scheduled,
          ),
        );
      }
      day++;
    }
    if (keepLastPastOpen) {
      final past = out.where((s) => s.status == ScheduleStatus.completed).toList();
      if (past.isNotEmpty) past.last.status = ScheduleStatus.scheduled;
    }
    db.sessions.addAll(out);
    return out;
  }

  /// Hủy buổi [s] với phương án dạy bù tại [makeupStart].
  SessionRow cancelWithMakeup(SessionRow s, DateTime makeupStart, String reason) {
    s
      ..status = ScheduleStatus.cancelled
      ..cancelReason = reason
      ..resolution = CancelResolutionMode.makeup;
    final duration = s.end.difference(s.start);
    final makeup = SessionRow(
      id: '${s.id}-bu',
      classId: s.classId,
      roomId: s.roomId,
      start: makeupStart,
      end: makeupStart.add(duration),
      status: makeupStart.add(duration).isBefore(now) ? ScheduleStatus.completed : ScheduleStatus.scheduled,
      makeupForId: s.id,
    );
    db.sessions.add(makeup);
    return makeup;
  }

  void cancelWithRefund(SessionRow s, String reason) {
    s
      ..status = ScheduleStatus.cancelled
      ..cancelReason = reason
      ..resolution = CancelResolutionMode.refund;
  }

  /// Học viên mua khóa tại ngày [day]: payment SUCCESS + hóa đơn + 85% vào ví HLV
  /// + giữ chỗ mọi buổi (buổi hủy có dạy bù ⇒ chỗ chuyển sang buổi bù).
  PaymentRow purchase(String memberProfileId, String classId, int day) {
    final c = db.classRow(classId);
    final paidAt = at(day, 10, 15);
    final buyer = db.userOfMember(memberProfileId);
    final p = PaymentRow(
      id: 'pay-$classId-$memberProfileId',
      userId: buyer.id,
      memberProfileId: memberProfileId,
      amount: c.price,
      status: PaymentStatus.success,
      orderCode: 'PULSE${classId.hashCode.abs() % 100000}${memberProfileId.hashCode.abs() % 1000}',
      createdAt: paidAt.subtract(const Duration(minutes: 3)),
      expiresAt: paidAt.add(const Duration(minutes: 12)),
      classId: classId,
      paidAt: paidAt,
    );
    db.payments.add(p);
    invoice(p, c.name, CheckoutPurpose.course);
    final wallet = db.walletOf(c.coachProfileId);
    final share = (c.price * MockDatabase.coachShare).round();
    wallet.balance += share;
    db.walletTxs.add(
      WalletTxRow(
        id: 'wtx-${p.id}',
        walletId: wallet.id,
        amount: share,
        type: WalletTxType.deposit,
        status: WalletTxStatus.completed,
        createdAt: paidAt,
        classId: classId,
        paymentId: p.id,
        note: 'Doanh thu 85% từ ${buyer.fullName}',
      ),
    );
    for (final s in db.sessionsOf(classId)) {
      final movedToMakeup = s.status == ScheduleStatus.cancelled && s.resolution == CancelResolutionMode.makeup;
      if (movedToMakeup) continue;
      db.enrollments.add(
        EnrollmentRow(
          id: 'enr-${s.id}-$memberProfileId',
          memberProfileId: memberProfileId,
          sessionId: s.id,
          bookedAt: paidAt,
          status: switch (s.status) {
            ScheduleStatus.completed => EnrollmentStatus.completed,
            ScheduleStatus.cancelled => EnrollmentStatus.cancelled,
            ScheduleStatus.scheduled => EnrollmentStatus.booked,
          },
        ),
      );
    }
    return p;
  }

  void invoice(PaymentRow p, String itemName, CheckoutPurpose purpose, {int? quantity}) {
    db.invoices.add(
      InvoiceRow(
        id: 'inv-${p.id}',
        invoiceNumber: 'HD${VnTime.wall(p.paidAt!).year}-${(db.invoices.length + 1).toString().padLeft(5, '0')}',
        paymentId: p.id,
        userId: p.userId,
        total: p.amount,
        issuedAt: p.paidAt!,
        itemName: itemName,
        purpose: purpose,
        memberName: db.user(p.userId).fullName,
        quantity: quantity,
      ),
    );
  }

  /// Ghi điểm danh cho các buổi đã hoàn thành của khóa theo [pattern] (lặp lại
  /// nếu ngắn hơn số buổi). Ký tự: P có mặt, L trễ, A vắng, E có phép.
  void attendance(String classId, String memberProfileId, String pattern) {
    final done = db.sessionsOf(classId).where((s) => s.status == ScheduleStatus.completed).toList();
    for (var i = 0; i < done.length; i++) {
      final ch = pattern[i % pattern.length];
      db.attendance.add(
        AttendanceRow(
          id: 'att-${done[i].id}-$memberProfileId',
          sessionId: done[i].id,
          memberProfileId: memberProfileId,
          status: switch (ch) {
            'L' => AttendanceStatus.late,
            'A' => AttendanceStatus.absent,
            'E' => AttendanceStatus.excused,
            _ => AttendanceStatus.present,
          },
          note: ch == 'L' ? 'Đến muộn 10 phút' : (ch == 'E' ? 'Báo nghỉ ốm trước buổi học' : null),
        ),
      );
    }
  }
}
