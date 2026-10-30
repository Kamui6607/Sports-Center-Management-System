# MISSING API / thiếu hợp đồng — Member01

Kiểm tra snapshot Swagger ngày 2026-09-12. Các tên endpoint trong mục **đề xuất** bên dưới chỉ dành cho backend thảo luận, chưa tồn tại và không được FE gọi.

## MISSING API: Role & Permission Management

- Feature: Xem ma trận quyền và chỉnh sửa quyền theo vai trò.
- Expected endpoint: Chưa có. Đề xuất backend xác nhận `GET /roles`, `GET /roles/{id}/permissions`, `PATCH /roles/{id}/permissions`.
- Required request: ID vai trò và danh sách permission ID hợp lệ; schema và quy tắc phân quyền do backend xác định.
- Required response: Danh sách vai trò, danh mục quyền và quyền hiện hành cho từng vai trò; lỗi xác thực, phân quyền và validation.
- Why frontend needs it: Không thể hiển thị hoặc lưu ma trận quyền thật nếu chỉ có enum MEMBER/COACH/STAFF/MANAGER. UI hiện chỉ liệt kê vai trò cố định; tạo user vẫn chọn role đúng enum.

## MISSING API: Audit Log

- Feature: Nhật ký thao tác của quản lý.
- Expected endpoint: Chưa có. Đề xuất backend xác nhận `GET /audit-logs` và tùy nhu cầu `GET /audit-logs/{id}`.
- Required request: Bộ lọc thời gian, actor, action/resource và page/limit — backend quyết định tên trường.
- Required response: ID sự kiện, người thao tác, hành động, đối tượng, thời điểm, mô tả thay đổi và pagination. Cần chính sách ẩn dữ liệu nhạy cảm từ backend.
- Why frontend needs it: Không thể dựng lịch sử thao tác đáng tin cậy từ các mutation phía client hoặc dữ liệu giả.

## MISSING API CONTRACT: Update User / Member / Membership Plan

- Feature: Sửa user, hồ sơ hội viên, gói tập; thay vai trò tài khoản hiện có.
- Expected endpoint: **Đã tồn tại** `PATCH /users/{id}`, `PATCH /members/{id}`, `PATCH /membership-plans/{id}`, nhưng Swagger không có requestBody.
- Required request: Backend bổ sung danh sách thuộc tính được phép sửa, required/optional, kiểu, enum, validation, hỗ trợ null và quyền đổi role. Không tự suy diễn request cập nhật từ POST hoặc response.
- Required response: Response hiện có là UserOk/MemberOk/PlanOk dựa trên example. Cần schema response rõ ràng và mã lỗi liên quan.
- Why frontend needs it: Để biểu mẫu sửa không gửi sai trường hoặc âm thầm làm mất dữ liệu. FE vẫn hỗ trợ danh sách, chi tiết, tạo, lọc và ngừng hoạt động theo hợp đồng đã có; sửa hồ sơ coach dùng PATCH /coaches/{id} có body rõ ràng.

## MISSING API CONTRACT: Pagination

- Feature: Đi tới các trang sau cho danh sách gói thành viên và người đăng ký lịch.
- Expected endpoint: **Đã tồn tại** `GET /membership-plans`, `GET /enrollments/schedule/{scheduleId}`; response examples có pagination nhưng query không khai báo page/limit. Tương tự một số API payments, invoices, subscriptions ngoài scope chính.
- Required request: Backend xác nhận và tài liệu hóa page/limit, hoặc xác nhận endpoint trả toàn bộ dữ liệu.
- Required response: Pagination nhất quán với request, hoặc collection không phân trang được mô tả rõ.
- Why frontend needs it: FE không thể gọi trang 2 bằng query tự chế. Hiện chỉ hiển thị dữ liệu server trả về, không tính số trang từ độ dài mảng và không gửi query chưa được khai báo.

## MISSING API CONTRACT: CoachProfile identifiers

- Feature: Phân công/gỡ huấn luyện viên cho lớp.
- Expected endpoint: **Đã tồn tại** `POST /classes/{id}/coaches`, `DELETE /classes/{id}/coaches/{coachId}`.
- Required request: `coachId` = CoachProfile ID; `isPrimary` boolean cho POST.
- Required response: GET /coaches cần tài liệu hóa `coachProfile.id`; GET /classes/{id} cần tài liệu hóa `coaches[].coach.id`. Các example hiện chỉ có tên/chuyên môn, không có profile ID.
- Why frontend needs it: User ID và CoachProfile ID khác nhau. UI chỉ dùng profile ID thực nếu response cung cấp, loại khỏi lựa chọn những record thiếu mã; không dùng User ID làm giá trị thay thế.

## Chất lượng OpenAPI cần cải thiện

- `components.schemas` không có; phần lớn response chỉ là object + example. Types response tạo từ example cần được thay bằng schema chính thức khi có.
- `/coaches` dùng `bearerAuth`, còn securitySchemes chỉ khai báo `BearerAuth`. FE gửi Authorization: Bearer, nhưng backend cần thống nhất casing trong docs.
- Quyền MANAGER/COACH/STAFF/MEMBER theo từng endpoint chưa có ma trận quyền đầy đủ trong OpenAPI. FE khóa toàn bộ workspace theo profile MANAGER; backend vẫn là nơi quyết định quyền thật.
- Không có API chuỗi doanh thu theo ngày trong snapshot. Dashboard hiển thị revenueByMethod đã được tài liệu hóa, không tạo đường tăng trưởng hoặc tỷ lệ tăng giả.
