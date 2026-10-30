# Coach web — bàn giao 18/09/2026

## Phạm vi đã triển khai

- `/coach/dashboard`: lớp được phân công, số buổi và số buổi hoàn thành trong tuần, lịch tuần có thể mở roster.
- `/coach/schedule`: tuần trước/sau/hiện tại, chọn ngày, lọc lớp và trạng thái, chế độ tuần/danh sách; giờ Asia/Ho_Chi_Minh. Mobile chuyển thành từng ngày xếp dọc, các ca cùng ngày xếp riêng tránh đè nhau.
- `/coach/classes`: tìm tên lớp/bộ môn, trạng thái, sức chứa, chi tiết lớp, mở lịch đã chọn lớp.
- Modal buổi học: thông tin thời gian/phòng/trạng thái, tải đủ trang enrollment, tìm học viên, mở hồ sơ và mục tiêu/sở thích/cấp độ tập luyện. Không lấy danh sách hội viên toàn trung tâm.
- `/coach/profile`: thông tin HLV, sửa tên/điện thoại/ngày sinh/giới tính qua API của chính mình, đổi mật khẩu có xác nhận; chuyên môn/kinh nghiệm chỉ đọc. Email chỉ đọc vì API không hỗ trợ sửa email.
- Dùng PortalLayout, font Be Vietnam Pro, màu và component modal/skeleton/error có sẵn. Modal có cuộn nội dung, Escape, backdrop, khôi phục focus mà không giật vị trí cuộn; nội dung dài xuống dòng, thẻ lịch giới hạn dòng và mở chi tiết để đọc đầy đủ.

## Đối chiếu tài liệu và API

Nguồn yêu cầu: `Sports_Center_Management_System_Task_Assignment.md` do người dùng cung cấp, phần Coach Web/Flow 2. Nguồn API: [Swagger đang triển khai](https://sports-center-management-system.onrender.com/api/v1/docs/), lấy từ `swagger-ui-init.js` ngày 18/09/2026. Snapshot: [openapi-coach-2026-09-18.json](openapi-coach-2026-09-18.json). Snapshot mới có thêm nhiều endpoint so với backend trong checkout; không suy rằng backend local giống production.

| Chức năng | API / contract |
|---|---|
| Danh tính, CoachProfile.id | GET /auth/me, dùng phiên đăng nhập chung |
| Lớp được phân công | GET /classes?coachId=CoachProfile.id&page&limit |
| Lịch tuần | GET /class-schedules?classId&startAfter&startBefore&page&limit, chỉ gọi theo các lớp đã lấy ở trên |
| Danh sách học viên | GET /enrollments/schedule/{scheduleId}, lọc bỏ CANCELLED trên UI |
| Hồ sơ/mục tiêu | GET /members/{id}, ID hồ sơ từ roster |
| Sửa hồ sơ của mình | PATCH /auth/me |
| Đổi mật khẩu | PATCH /auth/me/change-password |

Trang chi tiết lớp dùng thông tin class đã trả về từ danh sách, không suy thêm các trường chưa có trong response. Các query đều dùng shared API client với refresh-token và xử lý lỗi thống nhất.

**Phân trang roster:** Swagger production chưa khai báo query page/limit cho endpoint này; local `BE/src/modules/enrollments/enrollments.schema.ts` và service đã có page/limit, giới hạn100. Bổ sung hai tham số vào FE operations và `docs/openapi.json` (nguồn generate) dựa trên source đó để tải hết roster. Snapshot mới giữ nguyên dữ liệu Swagger tải về. Cần BE cập nhật Swagger và xác nhận đồng nhất với bản deploy. Không suy số trang bằng độ dài mảng; nếu server bỏ qua page, UI báo lỗi thay vì lặp bản ghi. Nếu thiếu metadata pagination, UI chỉ có thể dùng lượng dữ liệu response trả về; chưa thể khẳng định production cung cấp đủ lịch sử chỉ từ Swagger.

**Phân quyền:** lớp lọc bằng CoachProfile.id, không nhầm User.id. FE chỉ mở roster từ ca của lớp được phân công. Backend vẫn phải enforce ownership, FE không thay thế kiểm tra quyền trên server. User thiếu CoachProfile có thông báo liên hệ quản lý; không bỏ bộ lọc để lấy mọi lớp.

## Validation

- Tên trim, 2–100 ký tự; điện thoại optional, tổng 9–15 ký tự, chỉ chữ số và dấu + ở đầu nếu có; khớp giới hạn chiều dài Swagger.
- Ngày sinh có định dạng và ngày thực tồn tại, phải trước ngày hiện tại tại Việt Nam.
- Đổi mật khẩu cần mật khẩu cũ, mật khẩu mới ≥6 ký tự, khác mật khẩu cũ, xác nhận khớp. Không gửi confirmPassword lên BE.
- Trường optional để trống không gửi lên API, giữ thông tin đang lưu; chưa hỗ trợ xóa về null khi contract chưa nêu.
- Search có giới hạn100 ký tự; ngày lịch hợp lệ; select chỉ nhận trạng thái hợp lệ.
- Disable form khi đang lưu; lỗi giữ nguyên nội dung đã nhập, thành công đổi mật khẩu xóa các ô mật khẩu. Validation BE và lỗi403/409 vẫn hiển thị khi server từ chối.

## Tạm hoãn theo phản hồi người dùng

Người dùng yêu cầu **tạm bỏ qua** các chức năng mới thiếu mô tả response: điểm danh, kế hoạch tập luyện, ghi kết quả và chat. Không tạo nút lưu giả, dữ liệu giả hay lời gọi các endpoint này trong Coach UI. Thông báo mới cũng chưa đưa vào scope tích hợp khi chưa có response contract.

Các phần yêu cầu trong file phân công nhưng chưa hoàn thiện ở lần này: workout/attendance history, tạo/sửa kế hoạch, assign exercise, nhận xét/đánh giá tiến độ, gửi bài tập và AI. Ngoài nhóm tạm hoãn, Swagger chưa có API sửa kế hoạch/assign exercise/AI. Endpoint complete schedule đã xuất hiện nhưng không được đưa thành thao tác Coach trước khi xác nhận quyền và quy trình điểm danh liên quan.

## Kiểm chứng

Các test dùng mock API có cùng envelope và cấu trúc đã xác minh ở source/snapshot. Không dùng tài khoản production và không gửi mutation tới production.

- `npm run typecheck` / `npm run build`: kiểm tra TypeScript và bundle.
- `npm test`: kiểm tra API/error hiện có, ranh giới ngày Việt Nam, tuần qua tháng, ngày sinh không tồn tại và response danh sách sai dạng.
- `npx playwright test coach.spec.ts`: 12 case, gồm scope profile ID, tải trang2 roster, drill-down/Escape, đổi tuần/filter, lớp→lịch, validation, password payload, empty/error/loading, axe serious/critical, long text ở375/768/1440px.
- `npx playwright test`: hồi quy các role và component dùng chung, đặc biệt modal/focus.

Ảnh QA được ghi vào `FE/artifacts/coach-*.png` (artifact local, không dùng làm dữ liệu ứng dụng). Kết quả chạy cuối được báo trong phản hồi bàn giao; danh sách lệnh trên không tự hàm ý tất cả đều pass.

Kết quả 18/09/2026: typecheck và production build đạt; 27/27 unit tests đạt; toàn bộ 67/67 browser tests đạt. Sau chỉnh sửa cuối về validation/phân trang và trình bày chi tiết, chạy lại 12/12 Coach browser tests đều đạt. Chưa có xác nhận end-to-end bằng tài khoản Coach thật trên backend Render.
