# 🏋️‍♂️ Mô tả Dự án: Sports Center Management System (Hệ thống Quản lý Trung tâm Thể thao)

## 1. Giới thiệu tổng quan
**Sports Center Management System** là một hệ thống quản lý trung tâm thể thao hoạt động theo mô hình nền tảng kết nối (Platform). 
Thay vì trung tâm tự thuê huấn luyện viên và trả lương cứng, hệ thống cho phép **Huấn luyện viên (Coach)** tự tạo khóa học, tự định giá và bán cho **Học viên (Member)**. Hệ thống đóng vai trò trung gian quản lý phòng tập, thời khóa biểu, thanh toán, điểm danh, và chia sẻ doanh thu.

---

## 2. Các phân quyền (Roles) trong hệ thống
Hệ thống xoay quanh 3 Role chính (và Guest):

1. **GUEST (Khách vãng lai):**
   - Khám phá các khóa học, sản phẩm hiện có.
   - Đăng ký tài khoản để trở thành Member hoặc Coach.

2. **MEMBER (Học viên):**
   - Đăng ký tài khoản và đăng nhập trực tiếp.
   - Mua các khóa học do Coach mở (thanh toán chuyển khoản tự động).
   - Mua các sản phẩm phụ trợ (nước, thực phẩm bổ sung, dụng cụ) do Trung tâm bán.
   - Xem lịch tập, thực hiện điểm danh.
   - Xem lộ trình tập luyện (Training Plan) và nhận phản hồi (Feedback) từ Coach.
   - Đánh giá sản phẩm đã mua.
   - Yêu cầu hủy khóa học (trước khai giảng ít nhất 24 giờ) để được hoàn tiền và theo dõi trạng thái yêu cầu hoàn tiền của mình.

3. **COACH (Huấn luyện viên):**
   - Đăng ký tài khoản nhưng phải **nộp CV (PDF)** và đợi Manager xét duyệt.
   - Sau khi được duyệt, Coach có thể mở các khóa học (Class/Course) và tự định giá.
   - Có ví ảo (Virtual Wallet) để tích lũy doanh thu từ khóa học (nhận **85%** doanh thu, 15% nộp về nền tảng).
   - Quản lý học viên trong lớp, tạo lịch tập (Schedule).
   - Điểm danh học viên, tạo lộ trình tập luyện (Training Plan) và ghi chú kết quả.
   - Khi buổi học bị hủy, chọn phương án dạy bù (Makeup) hoặc hoàn tiền buổi học cho học viên đã đặt chỗ.
   - Rút tiền từ ví ảo khi khóa học kết thúc trọn vẹn.

4. **MANAGER (Quản lý Trung tâm):**
   - Có toàn quyền quản trị hệ thống.
   - Quản lý danh mục cơ sở vật chất: Phòng tập (Room), Môn thể thao (Sport).
   - Xét duyệt hồ sơ (CV) của Coach.
   - Quản lý cửa hàng sản phẩm (Products): Thêm, sửa, xóa, kiểm soát tồn kho.
   - Nhận 15% doanh thu từ các khóa học của Coach.
   - Xét duyệt các yêu cầu rút tiền từ ví của Coach.
   - Xử lý các yêu cầu hoàn tiền: chuyển khoản thủ công cho Member rồi duyệt (hoặc từ chối kèm lý do) trên hệ thống.

---

## 3. Các luồng hoạt động chính (Workflows)

### 3.1. Luồng Xét duyệt Huấn luyện viên (Coach Onboarding)
1. Guest chọn đăng ký với vai trò **COACH**.
2. Tài khoản được tạo nhưng ở trạng thái khóa (`isActive = false`).
3. Hệ thống chuyển hướng Coach đến trang nộp CV. Coach tải file PDF CV lên (`POST /coaches/me/cv`).
4. **Manager** nhận được thông báo, vào xem danh sách CV đang chờ duyệt.
5. Manager nhấn **APPROVE** (duyệt) ➔ Tài khoản Coach được kích hoạt (`isActive = true`), Coach có thể đăng nhập và tạo lớp. Hoặc nhấn **REJECT** (từ chối) kèm lý do.

### 3.2. Luồng Mua Khóa học & Auto-Enrollment
1. Coach tạo khóa học (Class), chọn phòng, môn học, tạo các buổi tập (Schedule) và đặt giá cho khóa học.
2. Member xem khóa học và bấm "Mua".
3. Member thanh toán qua chuyển khoản ngân hàng (tích hợp **Sepay** tự động nhận diện giao dịch).
4. Khi giao dịch thành công:
   - Hệ thống tự động chuyển **85% tiền** vào Ví ảo (Wallet) của Coach.
   - Hệ thống **tự động Enroll** Member vào *tất cả* các buổi tập (Schedule) đang ở trạng thái SCHEDULED và **chưa diễn ra** của khóa học đó.
   - Notification được gửi cho cả Member và Coach.

### 3.3. Luồng Quản lý Ví ảo & Rút tiền (Coach Wallet)
1. Khi có Member mua khóa, tiền (85%) sẽ chạy vào ví của Coach.
2. Tuy nhiên, Coach **chưa thể rút tiền ngay**. Hệ thống ràng buộc: Coach chỉ được tạo lệnh rút tiền cho khóa học đó khi **TẤT CẢ** các buổi tập (Schedules) của khóa học đó đã chuyển sang trạng thái **COMPLETED** (Đã hoàn thành).
3. Khi đủ điều kiện, Coach tạo lệnh rút tiền (điền số tiền, thông tin ngân hàng).
4. Manager xem lệnh rút tiền, tiến hành chuyển khoản thực tế, sau đó lên hệ thống nhấn **APPROVE** lệnh rút. Tiền trong ví ảo của Coach bị trừ.

### 3.4. Luồng Bán Sản phẩm (E-Commerce)
1. **Manager** đăng các sản phẩm phụ trợ lên hệ thống (Tên, mô tả, giá, số lượng tồn kho).
2. **Member** hoặc **Coach** tạo đơn mua sản phẩm (Product Order): hệ thống **giữ hàng ngay** (trừ `stockQuantity`) và trả về thông tin QR chuyển khoản (VietQR/Sepay); đơn ở trạng thái **PENDING**.
3. Khi Sepay xác nhận đã thu tiền ➔ đơn chuyển **SUCCESS**, hệ thống xuất hóa đơn và gửi thông báo. Nếu người mua hủy đơn hoặc quá hạn chờ thanh toán ➔ đơn chuyển **CANCELLED** và tồn kho được **hoàn lại tự động**.
4. Chỉ những user đã mua thành công mới có quyền **Đánh giá (Review)** sản phẩm (Rate 1-5 sao + Comment). Rate trung bình của sản phẩm sẽ tự động được tính toán lại.

### 3.5. Luồng Điểm danh & Tập luyện (Attendance & Training)
- **Điểm danh (Attendance):** Coach hoặc Manager có thể điểm danh Member cho từng buổi học (hỗ trợ nhập mã Code thủ công hoặc check-in). Có cơ chế phạt (Penalty) nếu Member vắng mặt quá quy định.
- **Lộ trình tập (Training Plan):** Coach lên lịch trình bài tập cụ thể cho từng Member trong lớp, ghi nhận kết quả (Training Result).
- **Đánh giá (Feedback):** Coach có thể gửi đánh giá tiến độ cho Member sau các mốc thời gian.

### 3.6. Hệ thống Giao tiếp
- **Chat:** Hệ thống hỗ trợ Chat Real-time (Socket.io) giúp Member và Coach có thể trao đổi trực tiếp, gửi tin nhắn, hình ảnh/file.
- **Notification:** Mọi sự kiện quan trọng (đăng ký, thanh toán, duyệt CV, duyệt rút tiền, sắp đến giờ học...) đều được đẩy thông báo thời gian thực về cho user.

### 3.7. Luồng Hủy khóa học & Hoàn tiền (Course Cancellation & Refund)
1. **Member** gửi yêu cầu hủy khóa học khi còn **≥ 24 giờ** trước buổi khai giảng (buổi chính đầu tiên); quá hạn ➔ hệ thống từ chối.
2. Hệ thống tạo yêu cầu hoàn tiền (Refund) ở trạng thái **PENDING** với số tiền hoàn = phần còn lại của giao dịch đã thanh toán (trừ các khoản đã hoàn trước đó của cùng giao dịch).
3. **Manager** xem danh sách yêu cầu hoàn tiền, chuyển khoản thủ công cho Member rồi nhấn **APPROVE** (hoặc **REJECT** kèm lý do). Sepay không có API hoàn tiền nên bước chuyển khoản do Manager thực hiện ngoài hệ thống.
4. Khi duyệt: ví ảo của Coach bị trừ đúng tỷ lệ Coach đã nhận từ giao dịch gốc (ví dụ hoàn 100.000đ của lớp 1.000.000đ ➔ trừ ví 85.000đ); giao dịch chuyển **REFUNDED**, hóa đơn bị hủy, các chỗ đang giữ của Member trong khóa học được giải phóng. Member và Coach nhận thông báo.
   - Trong lúc chờ Manager duyệt, khoản tiền hoàn dự kiến bị tạm giữ trong ví Coach — Coach không thể rút phần này (số dư khả dụng = số dư ví − tổng tiền hoàn đang chờ).

### 3.8. Luồng Hủy buổi học & Dạy bù (Session Cancellation & Makeup)
1. Buổi học **chưa có ai đặt chỗ** ➔ Coach của lớp hoặc Manager hủy trực tiếp.
2. Buổi học **đã có học viên đặt chỗ** ➔ bắt buộc chọn phương án xử lý (`resolution`): **MAKEUP** (dạy bù) hoặc **REFUND** (hoàn tiền).
3. **MAKEUP:** hệ thống tạo buổi dạy bù mới (gắn `makeupForId` tới buổi bị hủy, có kiểm tra trùng phòng/HLV/lịch của học viên), tự động chuyển toàn bộ học viên đã đặt ở buổi cũ sang buổi bù và gửi thông báo lịch mới.
4. **REFUND:** hệ thống tự tạo yêu cầu hoàn tiền cho từng học viên đã thanh toán — số tiền hoàn 1 buổi = tiền đã trả ÷ số buổi **chính** của khóa (không tính buổi dạy bù), tối đa bằng phần còn được hoàn; giao dịch gốc vẫn giữ trạng thái SUCCESS (chỉ ghi nhận khoản hoàn riêng). Manager duyệt chuyển khoản theo quy trình ở mục 3.7.

---

## 4. Công nghệ sử dụng (Backend)
- **Framework:** Node.js (Express), TypeScript.
- **Database:** PostgreSQL quản lý qua **Prisma ORM** (bảng bộ môn đặt tên `Fitness` dưới DB — model Prisma/API vẫn giữ tên `Sport`/`sports` để tương thích).
- **Real-time:** Socket.io cho Chat (tin nhắn, đang gõ, trạng thái online, đã đọc); Notification hiện lưu DB và đọc qua REST API (`TODO`: phát sự kiện Socket.io).
- **Payment Gateway:** Sepay Webhook (chuyển khoản VietQR) đối soát giao dịch ngân hàng tự động cho cả giao dịch mua khóa học lẫn đơn sản phẩm.
- **File Storage:** Multer lưu file cục bộ (hoặc tích hợp Cloudinary cho Avatar/Image).
- **Architecture:** Tổ chức theo module-based (Mỗi domain như auth, coaches, products... có router, controller, service, schema riêng biệt). Validate dữ liệu chặt chẽ bằng Zod.

---

## 5. Công nghệ sử dụng (Mobile Frontend)
App Mobile là một client gọi cùng Backend với Web (REST API + Socket.io), dành chủ yếu cho Member và Coach. Chi tiết: [`Mobile/README.md`](../Mobile/README.md).

- **Framework:** Flutter (Dart), build Android & iOS từ một codebase.
- **Architecture:** Feature-first + Clean Architecture (`presentation` / `domain` / `data`), tương ứng module-based ở Backend (mỗi feature ứng với một module).
- **State Management:** Riverpod (kiêm Dependency Injection).
- **Networking:** Dio gọi REST API (HTTP/JSON); Interceptor gắn JWT, refresh token và xử lý lỗi tập trung.
- **Data Model:** `freezed` + `json_serializable` (sinh code bằng `build_runner`).
- **Real-time:** `socket_io_client` kết nối Socket.io (v4) của Backend cho Chat; Notification hiện tải qua REST API, chuyển sang Socket.io khi Backend phát sự kiện (`TODO`).
- **Payment:** Hiển thị VietQR (Sepay) do Backend sinh; webhook Sepay gọi thẳng Backend, App polling `GET /payments/sepay/{id}` để nhận kết quả (`TODO`: chuyển sang Socket.io khi Backend bổ sung sự kiện).
- **File Upload:** `image_picker` + multipart qua Dio tới endpoint Multer; `cached_network_image` hiển thị ảnh.
- **Local Storage:** `flutter_secure_storage` (token), `shared_preferences`/Hive (cache).
- **Navigation:** `go_router`.
- **Cấu hình môi trường:** `--dart-define` (VD `API_BASE_URL`).
- **Push Notification (FCM):** Tùy chọn (`TODO`) — Backend chưa tích hợp.
