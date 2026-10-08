import '../../features/notifications/domain/entities/app_notification.dart';
import '../mock_tables.dart';
import 'seed_helpers.dart';

/// Lộ trình tập, đánh giá HLV, thông báo, tin nhắn.
void seedSocial(Seeder s) {
  final db = s.db;

  // ── Lộ trình tập luyện ───────────────────────────────────────────────
  db.trainingPlans.addAll([
    TrainingPlanRow(
      id: 'tp-1',
      memberProfileId: 'mp-1',
      coachProfileId: 'cp-1',
      name: 'Lộ trình Yoga 8 tuần tăng linh hoạt',
      description:
          'Tuần 1–2: làm quen chuỗi chào mặt trời, giữ tư thế 5 nhịp thở.\n'
          'Tuần 3–5: tăng thời gian giữ tư thế, thêm tư thế mở hông.\n'
          'Tuần 6–8: chuỗi Vinyasa đầy đủ 45 phút, tập trung đầu gối trái (tránh khóa khớp).',
      startDate: s.at(-15, 0),
      endDate: s.at(41, 0),
    ),
    TrainingPlanRow(
      id: 'tp-2',
      memberProfileId: 'mp-1',
      coachProfileId: 'cp-3',
      name: 'HIIT giảm mỡ 4 tuần',
      description: '3 buổi/tuần, mỗi buổi 30 phút: 40 giây tập – 20 giây nghỉ. Ăn đủ đạm, ngủ 7 tiếng.',
      startDate: s.at(-45, 0),
      endDate: s.at(-17, 0),
    ),
    TrainingPlanRow(
      id: 'tp-3',
      memberProfileId: 'mp-3',
      coachProfileId: 'cp-1',
      name: 'Yoga phục hồi lưng',
      description: 'Tư thế mèo – bò, em bé, rắn hổ mang nhẹ. Tránh gập người sâu.',
      startDate: s.at(-10, 0),
      endDate: s.at(20, 0),
    ),
  ]);
  void result(String plan, int day, Map<String, String> metrics, String? note) => db.trainingResults.add(
    TrainingResultRow(id: 'tr-$plan-$day', planId: plan, date: s.at(day, 7, 45), metrics: metrics, coachNote: note),
  );
  result('tp-1', -14, {
    'Cân nặng': '58 kg',
    'Gập người chạm sàn': 'Cách 12 cm',
  }, 'Hơi thở còn ngắn, cần thở bụng sâu hơn.');
  result('tp-1', -9, {'Cân nặng': '57.6 kg', 'Gập người chạm sàn': 'Cách 8 cm'}, 'Tiến bộ tốt ở tư thế chiến binh 2.');
  result('tp-1', -5, {'Cân nặng': '57.2 kg', 'Giữ plank': '60 giây'}, 'Đầu gối trái ổn định, có thể tăng độ khó.');
  result('tp-1', -2, {'Gập người chạm sàn': 'Cách 4 cm', 'Giữ plank': '75 giây'}, 'Rất tốt! Tuần sau thử tư thế quạ.');
  result('tp-2', -40, {'Cân nặng': '60 kg', '% mỡ': '27%'}, 'Buổi đầu, sức bền trung bình.');
  result('tp-2', -30, {'Cân nặng': '59 kg', '% mỡ': '26%'}, 'Cần đi tập đều hơn.');
  result('tp-2', -18, {
    'Cân nặng': '58.4 kg',
    '% mỡ': '25.2%',
    'Nhịp tim nghỉ': '68 bpm',
  }, 'Hoàn thành lộ trình, duy trì 2 buổi/tuần.');
  result('tp-3', -8, {'Mức đau lưng (1–10)': '6'}, 'Giảm biên độ khi gập.');

  // ── Đánh giá HLV ─────────────────────────────────────────────────────
  void fb(
    String id,
    String coach,
    String member,
    int rating,
    int day, {
    String? cls,
    String? comment,
    bool anon = false,
  }) => db.feedbacks.add(
    FeedbackRow(
      id: id,
      coachProfileId: coach,
      memberProfileId: member,
      rating: rating,
      createdAt: s.at(day, 21),
      classId: cls,
      comment: comment,
      isAnonymous: anon,
    ),
  );
  fb('fb-1', 'cp-1', 'mp-3', 5, -30, cls: 'c3', comment: 'Thầy hướng dẫn kỹ từng tư thế, rất kiên nhẫn.');
  fb('fb-2', 'cp-1', 'mp-4', 4, -29, cls: 'c3', comment: 'Bài tập hay, mong có thêm khung giờ tối.', anon: true);
  fb('fb-3', 'cp-1', 'mp-5', 5, -28, cls: 'c3');
  fb('fb-4', 'cp-1', 'mp-9', 3, -27, cls: 'c3', comment: 'Lớp hơi đông nên thầy không sửa tư thế kịp cho mọi người.');
  fb('fb-5', 'cp-1', 'mp-7', 5, -3, cls: 'c1', comment: 'Buổi sáng tập xong rất tỉnh táo!');
  fb('fb-6', 'cp-2', 'mp-1', 4, -4, cls: 'c6', comment: 'Cô dạy dễ hiểu, hồ hơi đông vào cuối tuần.');
  fb('fb-7', 'cp-2', 'mp-6', 5, -4, cls: 'c6');
  fb('fb-8', 'cp-3', 'mp-2', 5, -2, cls: 'c7', comment: 'Cường độ cao nhưng rất đáng!');
  fb('fb-9', 'cp-4', 'mp-2', 4, -35, cls: 'c13');

  // ── Thông báo ────────────────────────────────────────────────────────
  void noti(
    String user,
    NotificationType type,
    String title,
    String body,
    DateTime at, {
    Map<String, String> meta = const {},
    bool read = false,
    String? reason,
  }) => db.notifications.add(
    NotificationRow(
      id: 'n-${db.notifications.length + 1}',
      userId: user,
      type: type,
      title: title,
      body: body,
      createdAt: at,
      metadata: meta,
      isRead: read,
      reason: reason,
    ),
  );
  final makeup = db.sessions.firstWhere((x) => x.id == 'c1-s2-bu');
  noti(
    'u-m1',
    NotificationType.scheduleCancelled,
    'Buổi Yoga Flow được dạy bù',
    'Buổi học bị hủy do HLV ốm đã được dời sang buổi dạy bù. Chỗ của bạn đã được chuyển tự động.',
    s.now.subtract(const Duration(hours: 2)),
    meta: {'scheduleId': makeup.id, 'classId': 'c1'},
    reason: 'HLV bị ốm đột xuất',
  );
  noti(
    'u-m1',
    NotificationType.chatMessage,
    'Tin nhắn mới từ Lê Hoàng Nam',
    'Chị nhớ mang thảm riêng nhé, buổi bù ở Phòng Yoga A.',
    s.now.subtract(const Duration(minutes: 40)),
    meta: {'senderId': 'u-c1'},
  );
  noti(
    'u-m1',
    NotificationType.attendancePenalty,
    'Phạt chuyên cần khóa HIIT',
    'Tỷ lệ chuyên cần của bạn ở khóa "HIIT đốt mỡ 30 phút" dưới 80%. Các buổi sắp tới đã bị thu hồi chỗ.',
    s.at(-1, 8),
    meta: {'classId': 'c8', 'penaltyId': 'pen-1'},
  );
  noti(
    'u-m1',
    NotificationType.attendanceWarning,
    'Cảnh báo chuyên cần',
    'Bạn đã vắng 2 buổi gần đây ở khóa "Bơi sải cơ bản".',
    s.at(-2, 9),
    meta: {'classId': 'c6'},
  );
  noti(
    'u-m1',
    NotificationType.trainingPlanAssigned,
    'Lộ trình mới',
    'HLV Lê Hoàng Nam đã giao "Lộ trình Yoga 8 tuần tăng linh hoạt".',
    s.at(-15, 10),
    meta: {'planId': 'tp-1'},
    read: true,
  );
  noti(
    'u-m1',
    NotificationType.paymentRefunded,
    'Đã hoàn tiền',
    'Yêu cầu hủy khóa "Cầu lông cơ bản" đã được hoàn 1.000.000 đ.',
    s.at(-9, 15),
    meta: {'refundId': 'rf-c12-mp-1'},
    read: true,
  );
  noti(
    'u-m1',
    NotificationType.scheduleCancelled,
    'Buổi bơi bị hủy',
    'Buổi học bị hủy, bạn sẽ được hoàn tiền 1 buổi sau khi Quản lý duyệt.',
    s.at(-8, 7),
    meta: {'classId': 'c6', 'refundId': 'rf-c6-mp-1'},
    read: true,
    reason: 'Hồ bơi bảo trì hệ thống lọc nước',
  );
  noti(
    'u-m1',
    NotificationType.newClass,
    'Khóa học mới',
    'Khóa "Pilates Core nâng cao" vừa mở bán.',
    s.at(-9, 9),
    meta: {'classId': 'c2'},
    read: true,
  );

  noti(
    'u-c1',
    NotificationType.enrollmentConfirmed,
    'Học viên mới',
    'Võ Thành Đạt vừa mua khóa "Pilates Core nâng cao".',
    s.at(-2, 10),
    meta: {'classId': 'c2'},
  );
  noti(
    'u-c1',
    NotificationType.classRejected,
    'Khóa học bị từ chối',
    'Khóa "Yoga trị liệu cột sống" bị từ chối. Xem lý do và gửi lại.',
    s.at(-3, 16),
    meta: {'classId': 'c5'},
  );
  noti(
    'u-c1',
    NotificationType.paymentRefunded,
    'Yêu cầu hoàn tiền mới',
    'Võ Thành Đạt yêu cầu hủy khóa "Pilates Core nâng cao". Tiền đang được tạm giữ.',
    s.at(-1, 11),
    meta: {'classId': 'c2'},
  );
  noti(
    'u-c1',
    NotificationType.withdrawalApproved,
    'Rút tiền thành công',
    'Lệnh rút 2.500.000 đ đã được duyệt.',
    s.at(-24, 9),
    read: true,
  );
  noti(
    'u-c4',
    NotificationType.withdrawalApproved,
    'Rút tiền thành công',
    'Lệnh rút 3.000.000 đ đã được duyệt.',
    s.at(-19, 9),
    read: true,
  );
  noti('u-c6', NotificationType.general, 'Đã nhận hồ sơ', 'Hồ sơ CV của bạn đang chờ Quản lý xét duyệt.', s.at(-2, 15));
  noti('u-c7', NotificationType.general, 'Hồ sơ bị từ chối', 'Vui lòng xem lý do và nộp lại CV.', s.at(-5, 10));
  noti(
    'u-mg',
    NotificationType.general,
    'Yêu cầu rút tiền mới',
    'Coach Ngô Thanh Tùng yêu cầu rút 2.000.000 đ từ ví.',
    s.at(-1, 16),
  );
  noti('u-mg', NotificationType.general, 'Hồ sơ HLV mới', 'Lý Minh Khoa vừa nộp CV chờ duyệt.', s.at(-1, 14));

  // ── Tin nhắn ─────────────────────────────────────────────────────────
  var i = 0;
  void msg(
    String from,
    String to,
    String text,
    DateTime at, {
    bool read = true,
    String? file,
    int? size,
    bool image = false,
  }) => db.chatMessages.add(
    ChatMessageRow(
      id: 'msg-${++i}',
      senderId: from,
      receiverId: to,
      createdAt: at,
      content: text.isEmpty ? null : text,
      attachmentName: file,
      attachmentSize: size,
      attachmentIsImage: image,
      isRead: read,
    ),
  );
  msg('u-m1', 'u-c1', 'Em chào thầy, buổi học hôm thứ 4 em đi trễ được không ạ?', s.at(-3, 20, 5));
  msg('u-c1', 'u-m1', 'Được em, nhớ khởi động trước 5 phút nhé.', s.at(-3, 20, 12));
  msg('u-m1', 'u-c1', 'Dạ em cảm ơn thầy!', s.at(-3, 20, 13));
  msg('u-c1', 'u-m1', '', s.at(-1, 18), file: 'Bai-tap-gian-co-tai-nha.pdf', size: 524288);
  msg(
    'u-c1',
    'u-m1',
    'Chị nhớ mang thảm riêng nhé, buổi bù ở Phòng Yoga A.',
    s.now.subtract(const Duration(minutes: 40)),
    read: false,
  );
  msg('u-c2', 'u-m1', 'Tuần này hồ bơi bảo trì 1 buổi, chị để ý thông báo nhé.', s.at(-8, 6, 30));
  msg('u-m1', 'u-c2', 'Vâng em đã thấy ạ.', s.at(-8, 7));
  msg('u-m2', 'u-c1', 'Thầy ơi lớp Pilates có cần chuẩn bị gì không ạ?', s.at(-1, 21), read: false);
  msg('u-m3', 'u-c1', 'Lưng em đỡ đau nhiều rồi, cảm ơn thầy!', s.at(-4, 19));
  msg('u-c1', 'u-m3', 'Tốt quá! Duy trì bài tập ở nhà nhé.', s.at(-4, 19, 20));

  db.users.firstWhere((u) => u.id == 'u-c1').online = true;
  db.users.firstWhere((u) => u.id == 'u-m3').online = true;
}
