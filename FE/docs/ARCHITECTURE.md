# Kiến trúc Frontend và phạm vi Member03

## Tổ chức feature-based

```text
FE/src/
├── app/                    # App providers, điều hướng và guard theo role
├── features/
│   ├── auth/               # Đăng nhập, kiểm tra phiên, đăng xuất
│   ├── manage/             # Chức năng manager hiện có, giữ URL /manager
│   ├── reception/          # Chức năng Member03, URL /receptionist
│   │   ├── dashboard/
│   │   ├── members/
│   │   ├── membership/
│   │   ├── classes/
│   │   ├── payments/
│   │   ├── api.ts          # Query hooks có namespace reception
│   │   └── components.tsx  # MemberPicker, ActionForm, trạng thái danh sách
│   ├── coach/              # Layout và placeholder, chưa có nghiệp vụ
│   └── user/               # Layout và placeholder, chưa có nghiệp vụ
├── shared/                 # API client, schema, form, modal, table, profile, layout
├── main.tsx
└── styles.css
```

- `app` kết nối các feature; feature dùng `shared`, không import nghiệp vụ từ role khác.
- `manage` là tên folder; giữ `/manager/*` để các liên kết cũ tiếp tục hoạt động.
- STAFF → `/receptionist/dashboard`; COACH → `/coach/dashboard`; MEMBER → `/user/dashboard`; MANAGER → `/manager/dashboard`.
- Vai trò lấy từ `GET /auth/me`, tài khoản phải active. Mở URL role khác hiển thị từ chối truy cập, không mount feature và không tải dữ liệu của role đó. Backend vẫn quyết định quyền API.
- Giữ fetch client, CSS responsive và TanStack Query đang có; không thay nền tảng styling/HTTP chỉ để phù hợp danh sách công nghệ dự kiến trong tài liệu phân công.
- Không dùng manager ResourcePage cho lễ tân: trang này có các thao tác quản trị không thuộc Member03.

## Nghiệp vụ reception

| Route | Luồng |
| --- | --- |
| `/receptionist/dashboard` | Lối tắt công việc, danh sách hội viên từ API |
| `/receptionist/members` | Tìm kiếm, phân trang, chọn hội viên, xem chi tiết |
| `/receptionist/members/create` | Tạo hội viên qua POST /auth/register; không thay token của lễ tân |
| `/receptionist/membership` | Trạng thái, thời hạn, lịch sử gói, đăng ký, gia hạn |
| `/receptionist/classes` | Chọn buổi học, đăng ký cho hội viên, xem người đăng ký, xác nhận hủy |
| `/receptionist/payments` | Chọn hội viên, xem/lọc và ghi nhận thanh toán, xem chi tiết hóa đơn, in/lưu PDF |
| `/receptionist/profile` | Hồ sơ và đổi mật khẩu dùng chung |
| `/receptionist/checkin` | Trang chưa khả dụng, thiếu API |
| `/receptionist/support` | Trang chưa khả dụng, thiếu API |

Form chọn hội viên dùng MemberProfile.id từ GET /members; không thay bằng user.id. Gói, subscription và enrollment dùng ID bản ghi tương ứng. Mutation chỉ gửi thuộc tính được khai báo trong Swagger. Trạng thái, lỗi máy chủ và validation hiển thị tại form; dữ liệu reception được làm mới sau thành công. Không gửi mutation thử lên production.

## Hợp đồng và điểm chưa thể hoàn thiện

Đã đọc Swagger trực tiếp ngày 2026-09-15 tại https://sports-center-management-system.onrender.com/api/v1/docs/swagger-ui-init.js. Bản kiểm tra: `docs/openapi-live.json`. Các operation reception sử dụng khớp với metadata runtime trong `src/shared/operations.json` (snapshot `docs/openapi.json`). Giữ snapshot runtime cũ để không tự mở rộng chức năng manager trong phạm vi Member03. Swagger mới bổ sung requestBody cho một số PATCH manager/profile; có thể cập nhật riêng ở task tiếp theo.

1. **Điểm danh**: Swagger chưa có endpoint attendance/check-in, requestBody hay response. Cần BE cung cấp nghiệp vụ, quy tắc gói hết hạn/điểm danh trùng và API đọc/ghi trước khi tích hợp.
2. **Yêu cầu hỗ trợ**: Swagger chưa có endpoint support request. Cần API tạo/danh sách/chi tiết/cập nhật trạng thái, bộ lọc và quyền truy cập. Không lưu localStorage thay hệ thống thật.
3. **Phân trang**: payments, invoices, subscriptions, plans và enrollments có ví dụ pagination nhưng không khai báo page/limit. FE chỉ hiển thị trang server trả, có thông báo số trang; không tự chế query trang tiếp. Members và schedules có điều khiển phân trang đúng hợp đồng.
4. **Quyền STAFF**: Swagger chưa có ma trận quyền đầy đủ. Lỗi 403 hiển thị và không thử fallback vào API quản trị. Cần tài khoản STAFF thử trên môi trường tích hợp để xác nhận các API bảo vệ.
5. **Hóa đơn**: in HTML từ GET /invoices/{id}, chọn Save as PDF trong hộp thoại trình duyệt. Không có endpoint xuất PDF trong Swagger. Không phát hành hóa đơn giả tại FE.
6. **Thanh toán gói**: registration/renewal nhận paymentMethod; đối chiếu lịch sử trước khi thêm khoản thanh toán để tránh thu trùng. Tạo payment có SUCCESS được API mô tả tự tạo invoice.

## Kiểm thử

```sh
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

Playwright dùng response fixtures Swagger và kiểm tra request body; không chứng minh mutation đã chạy thành công trên production. Chưa có tài khoản STAFF được cung cấp để chạy end-to-end thật. Các file ngoài FE không được chỉnh sửa.
