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

3. **COACH (Huấn luyện viên):**
   - Đăng ký tài khoản nhưng phải **nộp CV (PDF)** và đợi Manager xét duyệt.
   - Sau khi được duyệt, Coach có thể mở các khóa học (Class/Course) và tự định giá.
   - Có ví ảo (Virtual Wallet) để tích lũy doanh thu từ khóa học (nhận **85%** doanh thu, 15% nộp về nền tảng).
   - Quản lý học viên trong lớp, tạo lịch tập (Schedule).
   - Điểm danh học viên, tạo lộ trình tập luyện (Training Plan) và ghi chú kết quả.
   - Rút tiền từ ví ảo khi khóa học kết thúc trọn vẹn.

4. **MANAGER (Quản lý Trung tâm):**
   - Có toàn quyền quản trị hệ thống.
   - Quản lý danh mục cơ sở vật chất: Phòng tập (Room), Môn thể thao (Sport).
   - Xét duyệt hồ sơ (CV) của Coach.
   - Quản lý cửa hàng sản phẩm (Products): Thêm, sửa, xóa, kiểm soát tồn kho.
   - Nhận 15% doanh thu từ các khóa học của Coach.
   - Xét duyệt các yêu cầu rút tiền từ ví của Coach.

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
   - Hệ thống **tự động Enroll** Member vào *tất cả* các buổi tập (Schedule) đang ở trạng thái SCHEDULED của khóa học đó.
   - Notification được gửi cho cả Member và Coach.

### 3.3. Luồng Quản lý Ví ảo & Rút tiền (Coach Wallet)
1. Khi có Member mua khóa, tiền (85%) sẽ chạy vào ví của Coach.
2. Tuy nhiên, Coach **chưa thể rút tiền ngay**. Hệ thống ràng buộc: Coach chỉ được tạo lệnh rút tiền cho khóa học đó khi **TẤT CẢ** các buổi tập (Schedules) của khóa học đó đã chuyển sang trạng thái **COMPLETED** (Đã hoàn thành).
3. Khi đủ điều kiện, Coach tạo lệnh rút tiền (điền số tiền, thông tin ngân hàng).
4. Manager xem lệnh rút tiền, tiến hành chuyển khoản thực tế, sau đó lên hệ thống nhấn **APPROVE** lệnh rút. Tiền trong ví ảo của Coach bị trừ.

### 3.4. Luồng Bán Sản phẩm (E-Commerce)
1. **Manager** đăng các sản phẩm phụ trợ lên hệ thống (Tên, mô tả, giá, số lượng tồn kho).
2. **Member** hoặc **Coach** đều có thể mua sản phẩm.
3. Khi mua thành công, số lượng tồn kho (`stockQuantity`) tự động bị trừ đi.
4. Chỉ những user đã mua thành công mới có quyền **Đánh giá (Review)** sản phẩm (Rate 1-5 sao + Comment). Rate trung bình của sản phẩm sẽ tự động được tính toán lại.

### 3.5. Luồng Điểm danh & Tập luyện (Attendance & Training)
- **Điểm danh (Attendance):** Coach hoặc Manager có thể điểm danh Member cho từng buổi học (hỗ trợ nhập mã Code thủ công hoặc check-in). Có cơ chế phạt (Penalty) nếu Member vắng mặt quá quy định.
- **Lộ trình tập (Training Plan):** Coach lên lịch trình bài tập cụ thể cho từng Member trong lớp, ghi nhận kết quả (Training Result).
- **Đánh giá (Feedback):** Coach có thể gửi đánh giá tiến độ cho Member sau các mốc thời gian.

### 3.6. Hệ thống Giao tiếp
- **Chat:** Hệ thống hỗ trợ Chat Real-time (Socket.io) giúp Member và Coach có thể trao đổi trực tiếp, gửi tin nhắn, hình ảnh/file.
- **Notification:** Mọi sự kiện quan trọng (đăng ký, thanh toán, duyệt CV, duyệt rút tiền, sắp đến giờ học...) đều được đẩy thông báo thời gian thực về cho user.

---

## 4. Công nghệ sử dụng (Backend)
- **Framework:** Node.js (Express), TypeScript.
- **Database:** PostgreSQL quản lý qua **Prisma ORM**.
- **Real-time:** Socket.io cho Chat và Notification.
- **Payment Gateway:** Sepay Webhook để đối soát giao dịch ngân hàng tự động.
- **File Storage:** Multer lưu file cục bộ (hoặc tích hợp Cloudinary cho Avatar/Image).
- **Architecture:** Tổ chức theo module-based (Mỗi domain như auth, coaches, products... có router, controller, service, schema riêng biệt). Validate dữ liệu chặt chẽ bằng Zod.
