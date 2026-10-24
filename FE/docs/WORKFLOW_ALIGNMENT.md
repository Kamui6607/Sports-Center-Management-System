# Đối chiếu workflow và cập nhật web — 18/09/2026

## Nguồn và giới hạn xác minh

- Yêu cầu người dùng: rà soát `C:\Users\ontri\Downloads\PROJECT_WORKFLOW_REPORT.md`, đồng bộ nghiệp vụ và các tính năng có API cho tất cả role.
- Đã đọc báo cáo như tài liệu yêu cầu, không thực thi các lệnh hoặc quy trình trong tài liệu.
- Backend tham chiếu: `origin/feature/BE-core-flow-1-2-3`, commit **9d4af0efb8c3e910af233eb3e30b4e7b04dae238**. Đã fetch để đọc source; không checkout, merge, ghi đè backend local hoặc deploy.
- Đã tải Swagger đang chạy từ `/api/v1/docs/swagger-ui-init.js`; bản gốc JSON lưu tại `openapi-workflow-2026-09-18.json`. Swagger có 59 đường dẫn. Không đồng nhất sự tồn tại endpoint với chứng minh production đang chạy đúng commit trên.
- Các request body/query thiếu trong Swagger được đối chiếu trực tiếp Zod schema/controller/service ở commit trên. `workflow-contract-overrides.json` giữ các bổ sung; `generate-api.mjs` nạp chúng để không mất khi generate lại.
- Kiểm thử web dùng API mock theo contract. Chưa thực hiện ghi dữ liệu production, đăng nhập bằng tài khoản thật, kiểm thử DB đồng thời hay vận hành hoàn tiền thực.

## Chức năng đã bổ sung/cập nhật

| Vai trò | Luồng web | API/thao tác |
|---|---|---|
| Tất cả | Thông báo thật, lọc chưa đọc, phân trang, đọc từng mục/tất cả | GET /notifications, GET /notifications/unread-count, PATCH /notifications/{id}/read, PATCH /notifications/mark-all-read |
| Manager, Staff | Gửi nhắc lịch trong hệ thống cho các lớp sắp diễn ra | POST /notifications/trigger-upcoming-reminders |
| Tất cả | Chat phòng chung hoặc riêng, liên hệ theo role, cuộc trò chuyện, gửi nội dung/tệp ≤10 MB, đánh dấu đã đọc | GET /chat/contacts, GET /chat/conversations, GET/POST /chat/messages, PATCH /chat/messages/read |
| Manager | Đăng ký/gia hạn gói, xem hóa đơn, ghi nhận thanh toán, hỗ trợ đăng ký lớp | Tái sử dụng các màn hình vận hành trong /manager/membership, /manager/payments, /manager/bookings |
| Manager | Tạm dừng/tiếp tục/hủy gói, chuyển PENDING→SUCCESS/FAILED hoặc SUCCESS→REFUNDED | PATCH /subscriptions/{id}/status, PATCH /payments/{id}/status; xác nhận riêng và chính sách tác động |
| Manager | Sửa tài khoản/role, hồ sơ hội viên và gói bán | PATCH /users/{id}, /members/{id}, /membership-plans/{id}; dùng schema update đã kiểm chứng |
| Staff | Bộ môn/phòng/lớp, phân công coach, tạo/sửa/hủy lịch và hoàn tất lịch | /receptionist/sports, rooms, catalogue, schedules; tái sử dụng ResourcePage chỉ với tài nguyên được phép |
| Staff | Sửa thông tin hội viên | PATCH /members/{id}; không có trường role/isActive dành cho quản lý |
| Manager, Staff | Hoàn tất ca sau giờ kết thúc | PATCH /class-schedules/{id}/complete; không gửi status qua form PATCH lịch |
| Manager, Coach | Điểm danh học viên, cập nhật kết quả và ghi chú | POST /attendance, PATCH /attendance/{id}; Coach mở từ lịch lớp được phân công |
| Staff | Xem điểm danh từ chi tiết lịch | GET /attendance?scheduleId; không mở nút ghi vì route backend không cấp quyền STAFF |
| Coach | Kế hoạch/kết quả của học viên trong roster lớp mình | GET/POST /training-plans, POST /training-plans/results; khóa coachId theo hồ sơ đăng nhập, chỉ ghi kết quả kế hoạch mình phụ trách |
| Manager | Xem/tạo kế hoạch và ghi kết quả từ chi tiết hội viên | Như trên; chọn CoachProfile.id thật từ danh sách coach |
| Member | Kế hoạch và kết quả do coach ghi nhận | /member/training; GET /training-plans?memberId=ownProfileId; không có nút ghi |
| Member | Điểm danh thật | /member/attendance; lấy lịch đăng ký của mình, đọc điểm danh theo lịch và chỉ hiển thị bản ghi memberId của mình |
| Member | Hóa đơn của mình, chi tiết thanh toán, in/lưu PDF | /member/payments; GET /invoices/member/{memberId}, /invoices/{id}, /payments/{id} |
| Tất cả | Chính sách sử dụng | /{roleBase}/policies: quyền lợi gói, đặt/hủy lớp, điểm danh, thanh toán và tài khoản |

Không cần giao diện độc lập cho mỗi biến thể GET khi một màn hình đã phục vụ cùng nghiệp vụ. Ví dụ lịch sử hóa đơn theo hội viên sử dụng API member thay vì tải toàn bộ hóa đơn trung tâm. Chat dùng polling 15 giây khi màn hình mở; chưa triển khai Socket.IO. Không gọi endpoint hỗ trợ/audit/quản lý permission không tồn tại.

## Quy tắc FE đã áp dụng

1. Dynamic Auth: khi BE báo khóa tài khoản, mất user hoặc đổi role, xóa token/cache và yêu cầu đăng nhập lại; không refresh rồi tiếp tục giữ role cũ. Token hết hạn thông thường vẫn refresh như trước. Hồ sơ được kiểm tra lại khi quay về cửa sổ.
2. Quyền lợi gói phải ACTIVE, startDate ≤ hiện tại ≤ endDate. Chọn Premium nếu nhiều gói hợp lệ; không dùng gói tương lai chỉ vì status ACTIVE.
3. Chuyển trạng thái tài chính chỉ có ở Manager. FAILED/REFUNDED là trạng thái kết thúc, PENDING không được nhảy thẳng sang REFUNDED.
4. Không tiếp tục gói SUSPENDED thiếu remainingDays hoặc còn 0 ngày vì backend hiện sẽ đặt endDate về ngay hiện tại; xem phần thiếu bên dưới. Không phục hồi tùy ý EXPIRED/CANCELLED.
5. Lịch đã CANCELLED/COMPLETED không được sửa/hủy tiếp trên UI. Hoàn tất chỉ mở sau endTime và dùng endpoint chuyên biệt. Việc đổi/hủy lịch vẫn để BE kiểm tra xung đột mới nhất.
6. Điểm danh không suy từ Enrollment.COMPLETED. UI cho ghi khi ca đã bắt đầu, không bị hủy và actor là Manager/Coach. Staff chỉ xem. Thao tác tạo gửi memberId từ roster, scheduleId từ ca được mở.
7. Kế hoạch: ngày kết thúc phải sau ngày bắt đầu; kết quả phải nằm trong thời hạn kế hoạch, không ở tương lai, có nhận xét hoặc chỉ số; tên/chỉ số/ghi chú giới hạn độ dài. API chưa có sửa/xóa kế hoạch hoặc kết quả nên không dựng nút giả.
8. Form shared: trim, bắt trường bắt buộc sau trim, số hữu hạn, số nguyên/dương, sĩ số lớp ≤200, ngày giờ hợp lệ, ngày sinh không ở tương lai, điện thoại đúng tập ký tự BE. Select chỉ dùng mã từ dữ liệu thật. Lookup không cho chọn tài nguyên ngừng hoạt động mới.
9. Tải đầy đủ danh sách gói, lịch theo lớp, roster, lịch sử enrollment/subscription/invoice; phát hiện server trả lặp sai trang. Browse lớp có nút trang trước/sau. Dashboard chỉ hiện các buổi tương lai còn SCHEDULED, sắp theo thời gian. Không nuốt lỗi danh sách lịch để hiển thị dữ liệu rỗng/fallback cũ.
10. Mutation không tự retry; chặn submit lặp khi đang lưu; modal ghi dữ liệu chặn đóng khi đang xử lý. Sau thành công invalidation các query liên quan. Lỗi nghiệp vụ BE được dịch đúng nguyên nhân, không suy lỗi email từ HTTP409.
11. Hóa đơn ưu tiên memberName/planName/planTier snapshot. Dữ liệu cũ không có snapshot có ghi rõ đang dùng thông tin hồ sơ hiện tại. Không giả lập chuyển khoản/QR hoặc hoàn tiền ngân hàng.
12. Modal dùng layout/focus/scroll chung; thẻ, lời nhắn và bảng cho phép xuống dòng; thông báo dài thu gọn và mở đầy đủ. Loading/error/empty dùng component hiện có.

## Báo cáo không khớp mã BE ở đâu

| Trong báo cáo | Mã thực tế tại commit tham chiếu |
|---|---|
| GET /users?search=phone cho lễ tân | Tra cứu /members?search=…; /users thuộc quản lý, service user search không bao gồm phone |
| /enrollments/my-enrollments | GET /enrollments/my |
| GET /enrollments?scheduleId | GET /enrollments/schedule/{scheduleId} |
| /attendances | /attendance, số ít |
| Coach lọc schedule bằng coachId | Lọc classes theo CoachProfile.id, sau đó schedules theo classId/startAfter/startBefore |
| Schedules dùng startDate | Dùng date/startAfter/startBefore theo schema |
| Staff ghi điểm danh | attendance.routes.ts chỉ authorize COACH,MANAGER; helper service có STAFF không làm route mở quyền |
| Mua gói xong mới chờ QR/payment | Create/renew đã tạo payment SUCCESS + invoice ISSUED trong transaction; chưa có gateway xác nhận bất đồng bộ |
| COMPLETED là đã tham dự | completeSchedule chuyển mọi enrollment BOOKED thành COMPLETED; attendance độc lập |
| Training chỉ coach ghi | Route cũng cho MANAGER; STAFF không được ghi |

## Các vấn đề backend còn phải sửa — FE không bảo vệ được API trực tiếp

### P0: phân quyền đọc và dữ liệu nhạy cảm

- `attendance/attendance.routes.ts`, controller/service: GET chỉ authenticate, không kiểm tra ownership/assignment; scheduleId optional có thể trả toàn bộ; include member.user:true trả cả trường bí mật của user. Cần bắt buộc scope server: member chỉ mình; coach chỉ ca được phân công; manager/staff theo quyền. Chỉ select trường cần thiết, không password/refresh token.
- `training-plans/training-plans.service.ts`: getPlans chỉ lọc query memberId tùy chọn, không nhận actor; không có kiểm tra chủ sở hữu, include coach.user:true. Cần actor-aware scope và safe select. Việc FE lọc memberId không ngăn gọi API trực tiếp.
- Một số response updateSubscriptionStatus/cancelEnrollment cũng include user:true. Rà tất cả nested include và DTO trước khi đưa production. Generic Details của FE không render password/token nhưng dữ liệu vẫn có mặt trên mạng nếu BE gửi.

### P1: chuyển trạng thái và quyền lợi

- `class-schedules`: PATCH chung vẫn nhận status COMPLETED/CANCELLED/SCHEDULED và có thể bỏ qua guard ở `/complete`; update/delete chưa bảo vệ đầy đủ trạng thái đã đóng ở server. Cần tập trung state machine trong service, chặn sửa/hủy ca kết thúc và chặn hoàn tất trước endTime ở mọi entry point.
- `attendance`: create kiểm tra enrollment nhưng chưa chặn ca tương lai/đã hủy; update chưa kiểm tra lifecycle ca. Cần guard tương đương phía BE và upsert/409 rõ cho duplicate (unique memberId+scheduleId).
- `subscriptions`: create tự suspend gói ACTIVE nhưng không lưu remainingDays như đường update status; resume dùng remainingDays??0 làm mất quyền lợi. Gói bắt đầu tương lai vẫn đình chỉ gói hiện tại ngay. Cần thống nhất freeze/resume, khôi phục dữ liệu cũ và chính sách thời điểm chuyển gói.
- `subscriptions`: status schema cho chuyển tùy ý giữa mọi enum, không có state machine đầy đủ; renew lặp trên subscription cũ có thể tạo kỳ chồng nhau. Cần tính ngày theo kỳ cuối đúng chính sách, chống gửi lặp/idempotency và xác thực gói đang bán.
- `payments`: dù SUCCESS chỉ được REFUNDED, PENDING vẫn có thể gửi REFUNDED qua API; FE đã chặn. Refund/cancel gói chưa đồng bộ quyền lợi, lượt đặt lớp và giao dịch ngân hàng. Phải thống nhất chính sách hoàn tiền trước khi thêm tự động hóa; không tự suy rằng refund = cancel subscription.
- `chat`: danh sách contacts lọc role nhưng createMessage không xác thực người nhận còn hoạt động/role có được liên lạc; upload chỉ có giới hạn10MB, chưa whitelist loại tệp. Cần kiểm tra server receiverId, content/file, MIME/signature, lưu trữ/tải tệp có quyền; không dựa vào select người nhận của FE.
- `training-plans`: BE chưa validate endDate>startDate, ngày result trong plan, và quan hệ coach-member khi tạo. Cần bổ sung để request tự tạo ngoài UI không vượt luồng.

### P1/P2: tính đồng thời và vận hành

- Enrollment count/check/create đã nằm trong `$transaction`, nhưng không thấy isolation Serializable hoặc khóa ca/hội viên ở service. Chưa đủ bằng chứng ngăn hai người cùng lấy chỗ cuối hay đặt lịch trùng từ hai request. Cần concurrency tests/locking/constraint/retry phù hợp DB.
- Tương tự kiểm tra xung đột lịch, phân công coach, giữ quản lý cuối cùng, mua/gia hạn không có khóa/idempotency được chứng minh. Không đánh đồng transaction với chống mọi race condition.
- Notification fire-and-forget có catch bỏ lỗi; một số gọi nằm trong transaction nhưng qua prisma ngoài transaction. Cần outbox sau commit hoặc chiến lược đảm bảo gửi lại; không đảm bảo mọi thay đổi đều sinh thông báo.
- Thông báo thay đổi lịch chưa bao phủ mọi đường PATCH. Reminders dedupe bằng query không phải unique atomic; chưa thấy scheduler định kỳ trong flow này.
- Snapshot invoice có ở create/renew subscription; đường createPayment invoice cần bổ sung snapshot tương tự. Dữ liệu cũ cần chiến lược backfill và đánh dấu nguồn lịch sử.
- List chat, attendance, training plans chưa có phân trang theo source. FE không bịa page/limit cho các API đó; cần BE mở contract trước khi tối ưu dữ liệu lớn.

## Chưa có API hoặc chưa đủ để triển khai đầy đủ

- Ticket hỗ trợ, audit logs, chỉnh permission chi tiết theo role, gateway thanh toán/QR xác nhận thật, sửa/xóa kế hoạch và kết quả.
- Chưa có giải pháp FE có thể thay thế các guard backend nêu trên. Không thể kết luận hệ thống đã an toàn tuyệt đối hoặc mọi business rule đã được thực thi trên server.

## Kiểm thử

Theo dõi kết quả kiểm thử cuối cùng tại phần bàn giao. Bộ mới kiểm tra boundaries gói/thanh toán/lịch, Dynamic Auth không refresh khi bị thu hồi quyền, multipart chat, phân trang đầy đủ/lặp trang, hiển thị attendance riêng với COMPLETED, member không có nút sửa training và scope hiển thị, chuyển trạng thái manager/staff, thông báo dài ở mobile/desktop. Các suite regression hiện có kiểm tra login mọi role, form/modal, skeleton, responsive và accessibility.
