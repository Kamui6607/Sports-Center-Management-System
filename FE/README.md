# Pulse — Web quản trị (Manager)

Web chỉ phục vụ **MANAGER** (Hội viên/HLV dùng ứng dụng Mobile; chung BE và tài khoản). Vite + React + TypeScript + React Router + TanStack Query. Giao diện quản trị "Pulse Control Room" nằm ở `src/features/manage/` (CSS scope `.cr` trong `admin.css`). Source landing/member/coach/reception cũ vẫn giữ nhưng không còn trong luồng điều hướng.

## Chạy ứng dụng

```powershell
cd FE
npm ci
npm run dev
```

Đặt `VITE_API_BASE_URL` trong `FE/.env` (VD BE local `http://localhost:8080/api/v1`). `/` và đường dẫn lạ → `/login`; deep link `/manager/...` khi chưa đăng nhập → đăng nhập xong quay lại đúng trang. `/reset-password` là trang công khai tối thiểu để người nhận email đặt lại mật khẩu (email + mã OTP). Hướng dẫn demo: `Doc/ADMIN_WEB_DEMO_GUIDE.md`.

## Các màn hình Manager

| Route | Chức năng (API thật) |
| --- | --- |
| `/manager/dashboard` | KPI thu tháng, CV/khóa chờ duyệt, sắp hết hàng, hội viên; lịch hôm nay |
| `/manager/users`, `/manager/users/:id` | Lọc/tìm/phân trang, tạo, sửa, hồ sơ hội viên, đổi vai trò, khóa/mở khóa (khóa mềm), cấp lại mật khẩu (email OTP + trạng thái), xóa vĩnh viễn (chỉ tài khoản chưa có dữ liệu) |
| `/manager/coaches`, `/manager/coaches/:id` | Danh sách HLV, hàng chờ CV, xem CV (tải có xác thực), duyệt/từ chối, sửa hồ sơ chuyên môn, khóa học & buổi dạy sắp tới |
| `/manager/rooms`, `/manager/rooms/:id` | CRUD phòng, ngừng/mở lại, lịch tuần của phòng, chuyển lịch (xem trước xung đột) |
| `/manager/classes`, `/manager/classes/:id` | Lọc khóa theo duyệt/HLV/môn/khu vực, duyệt/từ chối, sửa nội dung/giá/sức chứa, ngừng/mở bán, buổi học & học viên |
| `/manager/schedules` | Lịch tuần + bảng, lọc phòng/HLV/khóa/trạng thái/khoảng ngày, chi tiết buổi (dạy bù/hủy) & học viên |
| `/manager/products`, `/manager/products/:id` | CRUD sản phẩm (ảnh qua URL), ngừng bán, nhập/điều chỉnh kho + nhật ký, ẩn/hiện đánh giá |
| `/manager/revenue` | Báo cáo theo kỳ (giờ VN): tổng thu/hoàn/ròng theo API, biểu đồ, danh sách giao dịch phân trang, xuất CSV đủ dữ liệu |
| `/manager/profile` | Sửa thông tin, đổi mật khẩu |

Mỗi màn có loading/lỗi + thử lại/rỗng; bộ lọc + trang lưu trên URL; mutation chặn bấm lặp và làm mới cache liên quan; thao tác khóa/xóa/ngừng có hộp xác nhận nêu đối tượng và hậu quả.

## Landing page và đăng ký

- Landing page tiếng Việt gồm hero, nhóm người dùng, bộ môn, tính năng, bản xem trước tương tác, thống kê cấu trúc nền tảng, lợi ích, góc nhìn cộng đồng, CTA và footer. Theme charcoal/lime, ảnh thể thao từ Unsplash, font Barlow Condensed và Be Vietnam Pro từ Google Fonts; font hệ thống và nền tối dự phòng khi tài nguyên ngoài không tải được.
- Hiệu ứng reveal bằng IntersectionObserver, parallax bằng requestAnimationFrame, counter khi cuộn tới, hover; tôn trọng `prefers-reduced-motion`. CSS được giới hạn trong `.pulse-public` để giữ giao diện portal.
- Bản xem trước và lời trích dẫn tình huống được ghi rõ là minh họa, không phải dữ liệu hoặc đánh giá khách hàng thật. Không công bố số lượng khách hàng chưa xác minh.
- Form gọi `POST /auth/register` bằng API client hiện có. Contract đã đối chiếu với Swagger Render ngày 15/09/2026: `fullName`, `email`, `password` bắt buộc; `phone` tùy chọn; mật khẩu tối thiểu 6 ký tự. Không gửi mật khẩu xác nhận hay vai trò tự chọn. Thành công hiển thị xác nhận và link đăng nhập vì API đăng ký không trả token.
- Có kiểm tra mật khẩu xác nhận, chặn gửi lặp, trạng thái đang gửi, lỗi field, 409 email trùng và lỗi mạng. Kiểm thử mutation dùng Playwright interception, không tạo tài khoản thử trên production.
- `npx playwright test public.spec.ts` kiểm tra đăng ký, điều hướng, preview tabs, responsive và axe accessibility ở 375/768/1440px. Ảnh kiểm tra nằm trong `artifacts/landing-*.png` và `artifacts/register-*.png`.

Base URL mặc định: `https://sports-center-management-system.onrender.com/api/v1` — đúng Production Server (Render) trong ảnh. Có thể sao chép `.env.example` thành `.env` để cấu hình `VITE_API_BASE_URL`. Không thêm `/api/v1` lần nữa vào endpoint.

## Hợp đồng API và giới hạn

- Nguồn: OpenAPI 3.0 nhúng trong `https://sports-center-management-system.onrender.com/api/v1/docs/swagger-ui-init.js`.
- Snapshot đầy đủ: `docs/openapi.json`, 66 operations.
- `docs/API_INVENTORY.md`: method/path, auth, path/query parameters, required fields, request schema, status codes, response examples, enum, pagination và lỗi của **toàn bộ 66 operations**.
- `src/shared/operations.json`: metadata cho service, bộ lọc, form và enum; không chứa response mẫu.
- `src/shared/generated.ts`: request types được tạo từ schema; response types được suy ra từ example vì backend không có `components.schemas`. Đây không phải lời khẳng định schema response đầy đủ.
- `src/shared/api.ts`: chỉ cho gọi operation và query parameter đã có trong snapshot; mã hóa path ID; Bearer token, refresh đồng thời chỉ một lần, timeout, lỗi field, logout.
- Token lưu trong `sessionStorage` của tab. Vai trò xác minh qua GET /auth/me, không lấy từ việc tự giải mã JWT; backend vẫn phải kiểm tra quyền trên mọi request.
- Giá gói/thanh toán trong response là chuỗi decimal; request giá là number theo Swagger.
- Pagination nằm cạnh `data`: `{page, limit, total, totalPages}`. Chỉ gửi page/limit khi operation thực sự khai báo chúng.
- `coachId` của phân công là **CoachProfile.id**, không phải User.id. Chỉ cho chọn nếu API trả đúng mã hồ sơ; không suy đoán mã từ user ID.
- Các trường cập nhật thiếu schema được giữ chưa khả dụng. Xem `docs/MISSING_API.md`.
- Portal dùng Be Vietnam Pro và fallback sans-serif; landing page bổ sung ảnh thể thao từ Unsplash. Bản xem trước nền tảng được dựng bằng HTML/CSS tương tác.

## Review UI/UX

Xem [báo cáo review và các thay đổi](docs/FRONTEND_REVIEW.md). Khung điều hướng dùng chung, font/control được chuẩn hóa, có kiểm thử responsive ở 8 độ rộng và axe accessibility.

## Kiểm thử

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

- TypeScript + Vite production build.
- Unit test: chặn endpoint/query chưa khai báo, path encoding, refresh đồng thời, hết phiên, 400 validation, 403 và nội dung không hợp lệ.
- Playwright: trang login desktop/mobile, hiện/ẩn password, 13 route quản lý, form tạo phòng đúng body, menu mobile, chặn MEMBER, error/retry. Test fixtures chỉ tồn tại trong `tests/`, dựa trên ví dụ Swagger; **không có fixture/mock trong runtime**.
- Kiểm tra Render chỉ đọc: GET /sports và GET /membership-plans trả 200; GET /users không token trả 401; CORS trả `Access-Control-Allow-Origin: *`.
- Chưa có tài khoản MANAGER để kiểm thử trực tiếp protected endpoints và mutation trên Render. Không khẳng định tích hợp end-to-end production đã hoàn tất.

## Cập nhật snapshot

Xuất contract từ BE đang checkout: `cd BE && npm run openapi:export` (ghi `FE/docs/openapi.json`), rồi `cd FE && npm run generate:api` và review diff. Không dùng `--live` (tải Swagger Render cũ) cho BE local chưa deploy. `docs/workflow-contract-overrides.json` hiện rỗng — chỉ thêm mục khi Swagger BE thật sự thiếu và đã đối chiếu router/Zod. Client chặn operation/query chưa khai báo trong `src/shared/operations.json`.

Kiểm thử trình duyệt với BE + DB test thật: `npx playwright test -c playwright.real.config.ts` (biến môi trường xem đầu file config và `Doc/ADMIN_WEB_DEMO_GUIDE.md`). Các spec trong `tests/browser` dùng intercept theo contract cũ, không phải bằng chứng tích hợp.

## Deploy

`npm run build` tạo `dist/`. Cấu hình static host rewrite các đường dẫn về `/index.html` để React Router hoạt động khi refresh/deep link. Chưa triển khai hay push lên remote trong yêu cầu này.
