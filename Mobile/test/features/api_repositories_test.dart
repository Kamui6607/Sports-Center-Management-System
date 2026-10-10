import 'package:flutter_test/flutter_test.dart';
import 'package:sports_center_mobile/api/class_json.dart';
import 'package:sports_center_mobile/api/training_json.dart';
import 'package:sports_center_mobile/core/error/app_failure.dart';
import 'package:sports_center_mobile/features/attendance/data/attendance_api_repository.dart';
import 'package:sports_center_mobile/features/attendance/domain/entities/attendance.dart';
import 'package:sports_center_mobile/features/catalog/domain/entities/catalog.dart';
import 'package:sports_center_mobile/features/classes/data/course_api_repository.dart';
import 'package:sports_center_mobile/features/classes/domain/entities/coach_class.dart';
import 'package:sports_center_mobile/features/classes/domain/entities/course.dart';
import 'package:sports_center_mobile/features/coach/data/coach_api_repository.dart';
import 'package:sports_center_mobile/features/feedbacks/data/feedback_api_repository.dart';
import 'package:sports_center_mobile/features/manager/data/manager_api_repository.dart';
import 'package:sports_center_mobile/features/payments/data/payment_api_repository.dart';
import 'package:sports_center_mobile/features/payments/domain/entities/payment.dart';
import 'package:sports_center_mobile/features/products/data/product_api_repository.dart';
import 'package:sports_center_mobile/features/refunds/data/refund_api_repository.dart';
import 'package:sports_center_mobile/features/refunds/domain/entities/refund.dart';
import 'package:sports_center_mobile/features/schedule/data/schedule_api_repository.dart';
import 'package:sports_center_mobile/features/schedule/domain/entities/session.dart';
import 'package:sports_center_mobile/features/training/domain/entities/training.dart';

import '../helpers/fake_backend.dart';

final _now = DateTime.utc(2026, 10, 10, 3); // 10:00 giờ VN

String _iso(Duration offset) => _now.add(offset).toIso8601String();

const _paged = {'page': 1, 'limit': 100, 'total': 1, 'totalPages': 1};

/// `Class` đúng shape BE (kèm `summary` BE-12 + điểm HLV).
Map<String, Object?> _class({String status = 'APPROVED', String? rejectReason}) => {
  'id': 'c1',
  'name': 'Yoga sáng',
  'fitness': 'Yoga',
  'price': '1200000.00',
  'status': status,
  'rejectReason': rejectReason,
  'coachId': 'cp1',
  'capacity': 10,
  'classType': 'PREMIUM',
  'areaType': 'INDOOR',
  'createdAt': _iso(const Duration(days: -30)),
  'coach': {
    'id': 'cp1',
    'userId': 'u-coach',
    'specialization': 'Yoga',
    'ratingAverage': 4.5,
    'ratingCount': 8,
    'user': {'id': 'u-coach', 'fullName': 'Trần Thị Mai', 'avatarUrl': 'uploads/avatars/c.png'},
  },
  '_count': {'schedules': 3, 'enrollments': 6},
  'summary': {
    'mainSessionCount': 2,
    'completedSessionCount': 1,
    'upcomingSessionCount': 1,
    'firstSessionStart': _iso(const Duration(days: 2)),
    'nextSessionStart': _iso(const Duration(days: 2)),
    'lastSessionEnd': _iso(const Duration(days: 9)),
    'minRemainingSlots': 0,
    'studentCount': 7,
  },
};

Map<String, Object?> _schedule(
  String id,
  Duration start, {
  String status = 'SCHEDULED',
  int booked = 2,
  String? makeupFor,
  String? cancelReason,
  String? cancelResolution,
}) => {
  'id': id,
  'classId': 'c1',
  'roomId': 'r1',
  'startTime': _iso(start),
  'endTime': _iso(start + const Duration(hours: 1)),
  'status': status,
  'makeupForId': makeupFor,
  'cancelReason': cancelReason,
  'cancelResolution': cancelResolution,
  'room': {'id': 'r1', 'name': 'Phòng Yoga A', 'capacity': 20, 'areaType': 'INDOOR'},
  'class': _class(),
  '_count': {'enrollments': booked},
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final authed = {'auth.accessToken': 'h.eyJpZCI6InUxIn0.s', 'auth.refreshToken': 'R'};

  group('CourseApiRepository', () {
    test('Guest xem danh sách (BE-1) — không token, số liệu từ summary (BE-12), không N+1', () async {
      final api = FakeApi();
      api.backend.on('GET /classes', (r) async => FakeReply.ok([_class()], pagination: _paged));
      final page = await CourseApiRepository(api.client, api.tokens).browse(const ClassQuery());
      final c = page.items.single;
      expect(api.backend.requests.single.bearer, isNull);
      expect(api.backend.requests, hasLength(1)); // không tải lịch từng khóa
      expect(c.mainSessionCount, 2);
      expect(c.studentCount, 7);
      expect(c.isFull, isTrue);
      expect(c.coach.ratingAverage, 4.5);
      expect(c.coach.avatarUrl, endsWith('/uploads/avatars/c.png'));
    });

    test('chi tiết: PENDING_PAYMENT (BE-13) ⇒ tiếp tục thanh toán', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend
        ..on('GET /classes/c1', (_) async => FakeReply.ok(_class()))
        ..on(
          'GET /classes/c1/course-plan',
          (_) async => FakeReply.ok({
            'course': {'slots': <Object>[]},
            'sessions': <Object>[],
            'registration': {
              'blockers': <Object>[],
              'purchase': {'status': 'PENDING_PAYMENT', 'paymentId': 'p9'},
            },
          }),
        )
        ..on('GET /class-schedules', (_) async => FakeReply.ok(<Object>[], pagination: _paged));
      final d = await CourseApiRepository(api.client, api.tokens, clock: () => _now).detail('c1');
      expect(d.purchase.status, PurchaseStatus.pendingPayment);
      expect(d.purchase.pendingPaymentId, 'p9');
    });

    test('chi tiết: PURCHASED ⇒ hạn hủy = khai giảng − 24h', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend
        ..on('GET /classes/c1', (_) async => FakeReply.ok(_class()))
        ..on(
          'GET /classes/c1/course-plan',
          (_) async => FakeReply.ok({
            'sessions': <Object>[],
            'registration': {
              'purchase': {'status': 'PURCHASED', 'hasPendingRefund': true},
            },
          }),
        )
        ..on('GET /class-schedules', (_) async => FakeReply.ok(<Object>[], pagination: _paged));
      final d = await CourseApiRepository(api.client, api.tokens).detail('c1');
      expect(d.purchase.status, PurchaseStatus.purchased);
      expect(d.purchase.hasPendingRefund, isTrue);
      expect(d.purchase.cancelDeadline, _now.add(const Duration(days: 1)).toLocal());
    });

    test('gửi lại khóa bị từ chối (BE-3) + lý do từ chối (BE-2)', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'PATCH /classes/c1/resubmit',
        (r) async => FakeReply.ok({'class': _class(status: 'PENDING'), 'schedulesCreated': 1}),
      );
      final c = await CourseApiRepository(api.client, api.tokens).resubmitClass(
        'c1',
        ClassDraft(
          name: 'Yoga',
          sportIds: const ['Pilates'],
          capacity: 10,
          classType: ClassType.regular,
          areaType: AreaType.indoor,
          price: 500000,
          roomId: 'r1',
          sessions: [DraftSession(_now.add(const Duration(days: 3)), _now.add(const Duration(days: 3, hours: 1)))],
        ),
      );
      final body = api.backend.requests.single.body! as Map;
      expect((body['class'] as Map)['fitness'], 'Pilates');
      expect((body['schedules'] as List), hasLength(1));
      expect(c.status, ClassStatus.pending);
      expect(
        ClassJson.course(_class(status: 'REJECTED', rejectReason: 'Giá chưa hợp lý')).rejectReason,
        'Giá chưa hợp lý',
      );
    });
  });

  group('PaymentApiRepository', () {
    test('409 SEPAY_PAYMENT_PENDING ⇒ mở lại QR của giao dịch đang chờ', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'POST /payments/sepay/checkout',
        (_) async => FakeReply.error(
          409,
          'Bạn đang có giao dịch chuyển khoản chờ thanh toán...',
          errors: {
            'code': 'SEPAY_PAYMENT_PENDING',
            'paymentId': 'p1',
            'orderCode': 'SEVQR123',
            'amount': 1200000,
            'status': 'PENDING',
            'expiresAt': _iso(const Duration(minutes: 10)),
            'qrUrl': 'https://img.vietqr.io/x.png',
            'bank': {'id': 'MBBank', 'accountNumber': '0123', 'accountHolder': 'PULSE'},
            'classInfo': {'id': 'c1', 'name': 'Yoga sáng'},
          },
        ),
      );
      final c = await PaymentApiRepository(api.client).checkoutCourse('c1');
      expect(c.paymentId, 'p1');
      expect(c.title, 'Yoga sáng');
      expect(c.status, PaymentStatus.pending);
    });

    test('polling đơn hàng dùng order.items (BE-21); thành công ⇒ có "Chi tiết thanh toán"', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'GET /payments/sepay/p2',
        (_) async => FakeReply.ok({
          'paymentId': 'p2',
          'status': 'SUCCESS',
          'amount': 20000,
          'orderId': 'o1',
          'bank': {'id': 'MBBank'},
          'order': {
            'id': 'o1',
            'items': [
              {'productName': 'Nước suối', 'quantity': 2},
            ],
          },
        }),
      );
      final c = await PaymentApiRepository(api.client).checkout('p2');
      expect(api.backend.requests, hasLength(1));
      expect(c.title, 'Nước suối');
      expect(c.quantity, 2);
      expect(c.invoiceId, 'p2');
    });

    test('Lịch sử thanh toán (BE-6 / L6): đơn nhiều dòng, hoàn tiền một phần', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'GET /payments/my',
        (_) async => FakeReply.ok([
          {
            'id': 'p1',
            'type': 'ORDER',
            'amount': '70000.00',
            'status': 'SUCCESS',
            'method': 'SEPAY',
            'transactionCode': 'SEVQR1',
            'paidAt': _iso(const Duration(days: -1)),
            'items': [
              {'productName': 'Nước', 'quantity': 1, 'unitPrice': '10000.00', 'totalAmount': '10000.00'},
              {'productName': 'Khăn', 'quantity': 1, 'unitPrice': '60000.00', 'totalAmount': '60000.00'},
            ],
          },
          {
            'id': 'p2',
            'type': 'CLASS',
            'amount': 800000,
            'status': 'SUCCESS',
            'className': 'Yoga',
            'refundedAmount': 100000,
          },
          {'id': 'p3', 'type': 'CLASS', 'amount': 800000, 'status': 'FAILED'},
        ], pagination: _paged),
      );
      final list = await PaymentApiRepository(api.client).myInvoices();
      expect(list, hasLength(2)); // bỏ giao dịch thất bại
      expect(list.first.lines, hasLength(2));
      expect(list.first.invoiceNumber, 'SEVQR1');
      expect(list.last.refundedAmount, 100000);
      expect(list.last.purpose, CheckoutPurpose.course);
    });
  });

  test('ProductApiRepository: tồn có thể bán, giới hạn mỗi đơn, ảnh (BE-6), đánh giá ẩn', () async {
    final api = FakeApi(storedTokens: authed);
    api.backend.on(
      'GET /products/p9',
      (_) async => FakeReply.ok({
        'id': 'p9',
        'name': 'Thảm',
        'price': '250000.00',
        'stockQuantity': 10,
        'reservedStock': 3,
        'availableStock': 7,
        'maxPerOrder': 2,
        'imageUrl': 'https://cdn.x/p9.png',
        'reviews': [
          {
            'id': 'r1',
            'userId': 'u1',
            'rating': 5,
            'isHidden': true,
            'createdAt': _iso(Duration.zero),
            'user': {'fullName': 'A'},
          },
        ],
      }),
    );
    final repo = ProductApiRepository(api.client, api.tokens);
    final p = await repo.product('p9');
    expect(p.imageUrl, 'https://cdn.x/p9.png');
    expect(p.availableStock, 7);
    expect(p.maxSelectable, 2);
    expect((await repo.reviews('p9')).single.isHidden, isTrue);
  });

  group('ScheduleApiRepository', () {
    test('lịch Member lọc theo ngày ở BE (BE-14), lý do hủy (BE-20)', () async {
      final api = FakeApi(storedTokens: authed);
      Map<String, Object?> enrollment(String id, String status, Map<String, Object?> s) => {
        'id': id,
        'status': status,
        'bookedAt': _iso(const Duration(days: -10)),
        'schedule': s,
      };
      api.backend
        ..on(
          'GET /enrollments/my',
          (_) async => FakeReply.ok([
            enrollment('e1', 'CANCELLED', _schedule('s1', const Duration(days: 1), status: 'CANCELLED')),
            enrollment('e2', 'BOOKED', _schedule('s2', const Duration(days: 2), makeupFor: 's1')),
            enrollment(
              'e3',
              'CANCELLED',
              _schedule(
                's3',
                const Duration(days: 3),
                status: 'CANCELLED',
                cancelReason: 'HLV ốm',
                cancelResolution: 'REFUND',
              ),
            ),
          ], pagination: _paged),
        )
        ..on('GET /attendance/my', (_) async => FakeReply.ok(<Object>[], pagination: _paged));
      final repo = ScheduleApiRepository(api.client, clock: () => _now);
      final list = await repo.mySessions(_now, _now.add(const Duration(days: 7)));
      final q = api.backend.requests.first.query;
      expect(q['from'], isNotNull);
      expect(q['to'], isNotNull);
      expect(list.map((s) => s.session.id), ['s2', 's3']);
      expect(list.first.session.coachName, 'Trần Thị Mai');
      expect(list.last.session.cancelReason, 'HLV ốm');
      expect(list.last.session.cancelResolution, CancelResolutionMode.refund);
      expect(api.backend.requests.where((r) => r.path.startsWith('/classes')), isEmpty);
    });

    test('điểm danh thủ công ⇒ MỘT request hàng loạt (BE-18), gồm EXCUSED (L5)', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on('PUT /attendance/schedule/s1', (_) async => FakeReply.ok(<Object>[]));
      await ScheduleApiRepository(api.client)
          .saveAttendance('s1', {'m1': AttendanceStatus.present, 'm2': AttendanceStatus.excused}, {'m2': 'Ốm'});
      expect(api.backend.requests, hasLength(1));
      expect(api.backend.requests.single.body, {
        'items': [
          {'memberId': 'm1', 'status': 'PRESENT'},
          {'memberId': 'm2', 'status': 'EXCUSED', 'note': 'Ốm'},
        ],
      });
    });
  });

  test('AttendanceApiRepository: phạt PENDING hiển thị (L13), dừng QR ⇒ thu hồi mã (BE-18)', () async {
    final api = FakeApi(storedTokens: authed);
    api.backend
      ..on(
        'GET /attendance/my/summary',
        (_) async => FakeReply.ok({
          'buckets': <Object>[],
          'penalties': [
            {
              'id': 'pen1',
              'status': 'APPLIED',
              'attendanceRate': 43,
              'appealDeadline': _iso(const Duration(hours: 71)),
            },
            {'id': 'pen2', 'status': 'PENDING', 'attendanceRate': 60},
          ],
        }),
      )
      ..on('DELETE /attendance/qr/s1', (_) async => FakeReply.ok({'revokedManualCodes': 1}));
    final repo = AttendanceApiRepository(api.client, clock: () => _now);
    final penalties = await repo.myPenalties();
    expect(penalties.map((p) => p.status), [PenaltyStatus.applied, PenaltyStatus.pending]);
    expect(penalties.last.canAppeal(_now), isFalse);
    await repo.stopQr('s1');
    expect(api.backend.count('DELETE /attendance/qr/s1'), 1);
  });

  group('RefundApiRepository', () {
    test('điều kiện hủy khóa do BE tính (BE-16)', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'GET /refunds/course-cancellation/preview',
        (_) async => FakeReply.ok({
          'allowed': false,
          'deadline': _iso(const Duration(hours: -1)),
          'paidAmount': 1200000,
          'refundableAmount': 1200000,
          'blockReason': 'COURSE_CANCEL_TOO_LATE',
          'blockMessage': 'Đã quá hạn hủy khóa.',
        }),
      );
      final e = await RefundApiRepository(api.client).eligibility('c1');
      expect(api.backend.requests.single.query['classId'], 'c1');
      expect(e.allowed, isFalse);
      expect(e.blockReason, 'Đã quá hạn hủy khóa.');
      expect(e.paidAmount, 1200000);
    });

    test('ghi chú Member / Manager tách riêng (L8) + GET /refunds/:id (BE-17)', () async {
      final api = FakeApi(storedTokens: authed);
      api.backend.on(
        'GET /refunds/rf1',
        (_) async => FakeReply.ok({
          'id': 'rf1',
          'status': 'COMPLETED',
          'reason': 'MEMBER_CANCEL_COURSE',
          'amount': '1200000.00',
          'note': 'CK 123',
          'memberNote': 'Bận việc',
          'managerNote': 'CK 123',
          'class': {
            'id': 'c1',
            'name': 'Yoga',
            'coach': {
              'user': {'fullName': 'Trần Thị Mai'},
            },
          },
        }),
      );
      final r = await RefundApiRepository(api.client).refund('rf1');
      expect(r.status, RefundStatus.completed);
      expect(r.note, 'Bận việc');
      expect(r.processedNote, 'CK 123');
      expect(r.coachName, 'Trần Thị Mai');
    });
  });

  test('CoachApiRepository: ví theo từng khóa (BE-5 / L4)', () async {
    final api = FakeApi(storedTokens: authed);
    api.backend
      ..on(
        'GET /coaches/me/wallet',
        (_) async => FakeReply.ok({
          'wallet': {'balance': '4250000.00'},
          'pendingRefundDebit': 85000,
          'available': 765000,
          'withdrawEligibility': {
            'eligible': true,
            'blockers': <Object>[],
            'classes': [
              {'className': 'A', 'withdrawable': true, 'reason': null},
              {'className': 'B', 'withdrawable': false, 'reason': 'Khóa chưa kết thúc (còn 1 buổi).'},
            ],
          },
        }),
      )
      ..on('GET /coaches/me/wallet/transactions', (_) async => FakeReply.ok(<Object>[], pagination: _paged));
    final w = await CoachApiRepository(api.client).wallet();
    expect(w.balance, 4250000);
    expect(w.pendingRefundHold, 85000);
    expect(w.available, 765000);
    expect(w.canWithdraw, isTrue);
    expect(w.checks.first.detail, contains('B: Khóa chưa kết thúc'));
  });

  test('ManagerApiRepository: lệnh rút tiền (BE-7)', () async {
    final api = FakeApi(storedTokens: authed);
    api.backend.on(
      'GET /coaches/wallet/transactions',
      (r) async => FakeReply.ok([
        {
          'id': 'tx1',
          'amount': '500000.00',
          'status': 'PENDING',
          'createdAt': _iso(Duration.zero),
          'bankInfo': {'bankName': 'MB', 'accountNumber': '1', 'accountName': 'A'},
          'coach': {'id': 'cp1', 'fullName': 'Trần Thị Mai'},
          'wallet': {'balance': '850000.00', 'pendingRefundDebit': 0, 'available': 350000},
        },
      ], pagination: _paged),
    );
    final list = await ManagerApiRepository(api.client).withdrawals();
    expect(api.backend.requests.single.query['type'], 'WITHDRAWAL');
    expect(list.single.coachName, 'Trần Thị Mai');
    expect(list.single.walletBalance, 850000);
    expect(list.single.transaction.bankInfo?.bankName, 'MB');
  });

  test('FeedbackApiRepository: phân bố sao theo khóa do BE tính (BE-22)', () async {
    final api = FakeApi(storedTokens: authed);
    api.backend.on(
      'GET /feedbacks',
      (_) async => FakeReply.ok(
        {
          'feedbacks': <Object>[],
          'summary': {
            'averageRating': 4.2,
            'totalFeedbacks': 20,
            'distribution': {'5': 10, '4': 6, '3': 4, '2': 0, '1': 0},
            'classSummary': {
              'averageRating': 4,
              'totalFeedbacks': 2,
              'distribution': {'5': 1, '3': 1},
            },
          },
        },
        pagination: {'totalPages': 1},
      ),
    );
    final repo = FeedbackApiRepository(api.client);
    final all = await repo.forCoach('cp1');
    expect(all.summary.count, 20);
    expect(all.summary.distribution[5], 10);
    final byClass = await repo.forCoach('cp1', classId: 'c1');
    expect(byClass.summary.average, 4);
    expect(byClass.summary.distribution[3], 1);
  });

  test('TrainingJson: chỉ số số + đơn vị + ghi chú (L9)', () {
    const m = TrainingMetric(name: 'Cân nặng', value: 58.5, unit: 'kg', note: 'Nhẹ hơn');
    expect(TrainingJson.metric(m), {'name': 'Cân nặng', 'value': 58.5, 'unit': 'kg', 'note': 'Nhẹ hơn'});
    final r = TrainingJson.result({
      'id': 'r1',
      'date': _iso(Duration.zero),
      'metrics': [
        {'name': 'Squat', 'value': 80, 'unit': 'kg'},
        {'name': 'Plank', 'value': 90.5, 'note': 'Ổn định'},
      ],
    });
    expect(r.metrics.map((m) => m.display), ['80 kg', '90.5']);
    expect(r.metrics.last.note, 'Ổn định');
  });

  test('lỗi BE có mã nghiệp vụ giữ nguyên code', () async {
    final api = FakeApi(storedTokens: authed);
    api.backend.on(
      'PATCH /classes/c1/resubmit',
      (_) async => FakeReply.error(
        400,
        'Chỉ sửa & gửi lại được khóa đang chờ duyệt hoặc bị từ chối.',
        errors: {'code': 'CLASS_NOT_EDITABLE'},
      ),
    );
    await expectLater(
      CourseApiRepository(api.client, api.tokens).resubmitClass(
        'c1',
        const ClassDraft(
          name: 'X',
          sportIds: ['Yoga'],
          capacity: 1,
          classType: ClassType.regular,
          areaType: AreaType.indoor,
          price: 0,
          roomId: 'r1',
          sessions: [],
        ),
      ),
      throwsA(isA<AppFailure>().having((f) => f.code, 'code', 'CLASS_NOT_EDITABLE')),
    );
  });
}
