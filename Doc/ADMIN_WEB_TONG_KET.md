# Web quản trị (Manager): tổng kết toàn bộ task

Cập nhật: 19/10/2026 · Nhánh `develop` · Commit gốc lúc bắt đầu: `acf214d` (`Fixed schema for membership`).

Tài liệu ghi lại toàn bộ task Web quản trị, từ lúc khảo sát tới lần chỉnh UI cuối:
- Đã làm gì, theo từng giai đoạn.
- File nào được tạo, file nào được sửa.
- FE và BE thay đổi ra sao.
- Đã kiểm thử những gì.
- Còn thiếu gì và nên làm gì tiếp.

> **Lưu ý về nguồn:** các giai đoạn 1–5 được dựng lại từ tài liệu trong `Doc/`, `git diff` so với `acf214d` và mã nguồn hiện tại. Giai đoạn 6 là các thay đổi trong phiên ngày 19/10. **Toàn bộ thay đổi chưa được commit.**

---

## Mục lục

1. [Mục tiêu và phạm vi](#1-mục-tiêu-và-phạm-vi)
2. [Dòng thời gian](#2-dòng-thời-gian)
3. [Giai đoạn 1: Khảo sát và lập kế hoạch](#3-giai-đoạn-1-khảo-sát-và-lập-kế-hoạch-17102026)
4. [Giai đoạn 2: Chốt lại phạm vi](#4-giai-đoạn-2-chốt-lại-phạm-vi-17102026)
5. [Giai đoạn 3: Xây dựng chức năng (FE + BE)](#5-giai-đoạn-3-xây-dựng-chức-năng-fe--be)
6. [Giai đoạn 4: Thiết kế lại giao diện](#6-giai-đoạn-4-thiết-kế-lại-giao-diện-blue-saas-18102026)
7. [Giai đoạn 5: Tài liệu nghiệm thu và demo](#7-giai-đoạn-5-tài-liệu-nghiệm-thu-và-demo-1819102026)
8. [Giai đoạn 6: Hoàn thiện UX/UI](#8-giai-đoạn-6-hoàn-thiện-uxui-19102026)
9. [Thay đổi Backend chi tiết](#9-thay-đổi-backend-chi-tiết)
10. [Thay đổi Frontend chi tiết](#10-thay-đổi-frontend-chi-tiết)
11. [Danh sách file đầy đủ](#11-danh-sách-file-đầy-đủ)
12. [Kiểm thử](#12-kiểm-thử)
13. [Còn thiếu và rủi ro](#13-còn-thiếu-và-rủi-ro)
14. [Đề xuất cải tiến tiếp theo](#14-đề-xuất-cải-tiến-tiếp-theo)

---

## 1. Mục tiêu và phạm vi

**Mục tiêu:** hoàn thiện Web quản trị cho vai trò **MANAGER** với 6 nhóm chức năng:

| # | Nhóm | Nội dung |
|---|---|---|
| 1 | Người dùng | Đủ CRUD, khóa/mở khóa, xóa, cấp lại mật khẩu |
| 2 | Sản phẩm | Sản phẩm bán tại trung tâm, kho, đánh giá |
| 3 | Phòng tập, lớp | Phòng, sức chứa, lịch sử dụng phòng, chuyển lịch |
| 4 | Khóa học, lịch học | Duyệt/sửa/ngừng khóa; xem lịch, buổi, học viên |
| 5 | Huấn luyện viên | Hồ sơ, CV (xem/duyệt/từ chối), khóa và buổi phụ trách |
| 6 | Doanh thu | Đọc API báo cáo hiện có: KPI, biểu đồ, danh sách, CSV |

**Nguyên tắc đã chốt:**
- Web chỉ phục vụ **MANAGER**. Hội viên và HLV dùng app Mobile. Hai bên dùng chung BE, DB và tài khoản.
- Giữ React/Vite hiện có, không dựng FE mới. Không thêm vai trò ADMIN hay STAFF. Không có permission động.
- `Class` là khóa/lớp, `ClassSchedule` là buổi học. Mỗi khóa có **một HLV phụ trách**. HLV tạo khóa và định giá, Quản lý duyệt.
- **Không sửa logic tài chính ở BE** (thanh toán, SePay, hoàn tiền, ví HLV, báo cáo doanh thu). Phần này có thành viên khác phụ trách. Web chỉ **đọc** để hiển thị.
- Nối API thật, không dùng dữ liệu giả hay KPI cứng.

**Ngoài phạm vi (không đưa lên Web):**
- Quản lý tạo khóa hộ, nhiều HLV cho một khóa.
- Quản lý tạo/dời/hủy buổi học (đây là việc của HLV, quyết định D2).
- Ghi danh hộ hội viên (sẽ bỏ qua bước thanh toán).
- Duyệt hoàn tiền/rút tiền, đối soát.
- Gói thành viên, màn đơn hàng, chat, audit log, các danh mục cũ (sports, invoices, tier).

---

## 2. Dòng thời gian

| Ngày | Giai đoạn | Kết quả chính |
|---|---|---|
| 17/10 | 1. Khảo sát | `ADMIN_WEB_AUDIT_AND_PLAN.md`, `ADMIN_WEB_IMPLEMENTATION_BRIEF.md`, `ADMIN_WEB_CONTRACT_MATRIX.md`, `ADMIN_WEB_FLOW_MAP.md` |
| 17/10 | 2. Chốt lại phạm vi | Phiên trước đi quá rộng (sang phần tài chính) nên bị dừng. Viết `CLAUDE_MANAGER_WEB_PROMPT.md` thu hẹp phạm vi |
| 17–18/10 | 3. Xây dựng | Luồng đăng nhập chỉ cho Manager, 14 màn quản trị, các API quản trị bổ sung ở BE, contract FE sinh từ BE local, e2e BE và Playwright với dữ liệu thật |
| 18/10 | 4. Thiết kế | Giao diện Blue SaaS (`DESIGN_DNA.md`): Dashboard mới, tìm kiếm toàn cục, sáng/tối, kiểm tra axe |
| 18–19/10 | 5. Nghiệm thu | `MANAGER_ADMIN_MANUAL_UAT.md`, `DEMO_REAL_DATA.md` |
| 19/10 | 6. Hoàn thiện UX/UI | Video tập tạ ở màn đăng nhập, bỏ chữ hướng dẫn kiểu AI, giới hạn vai trò khi tạo tài khoản, sửa lỗi UI desktop |

---

## 3. Giai đoạn 1: Khảo sát và lập kế hoạch (17/10/2026)

Khảo sát tĩnh toàn repo: cấu trúc, schema/migration Prisma, route/middleware, service, client API của FE và repository của Mobile.

**Các vấn đề chính phát hiện:**

| Mức | Vấn đề |
|---|---|
| P0 | FE còn vai trò **STAFF** và menu lễ tân, nhưng BE chỉ nhận MEMBER/COACH/MANAGER |
| P0 | FE còn danh mục **sports**, nhưng BE đã bỏ (migration `drop_sport`, chuyển sang `Class.fitness`) |
| P0 | FE gọi API nhiều HLV/khóa, nhưng BE chỉ có **một HLV mỗi khóa** |
| P0 | UI cũ cho Quản lý tạo khóa và tạo lịch, nhưng BE chỉ cho **COACH** làm việc này |
| P0 | FE còn `/invoices` và gói theo tier, nhưng BE không mount các API này |
| P0 | Client FE chặn mọi API chưa khai báo trong `operations.json`, mà snapshot thì đã cũ |
| P1 | Chưa có chức năng Quản lý cấp lại mật khẩu |
| P1 | Đổi/đặt lại mật khẩu không thu hồi được access token cũ ngay lập tức |
| P1 | Báo cáo doanh thu có nghi vấn: hoàn tiền bị tính sang kỳ khác, số âm bị ép về 0. **Chỉ ghi lại để bàn giao, không sửa** |

**Tài liệu tạo ra:**
- `Doc/ADMIN_WEB_AUDIT_AND_PLAN.md`: audit và lộ trình 6 bước.
- `Doc/ADMIN_WEB_IMPLEMENTATION_BRIEF.md`: đặc tả theo module U/P/R/C/S/H/F/A và tiêu chí hoàn thành.
- `Doc/ADMIN_WEB_CONTRACT_MATRIX.md`: ma trận contract FE ↔ BE, mỗi dòng có ID (AUTH-xx, U-xx, H-xx…).
- `Doc/ADMIN_WEB_FLOW_MAP.md`: luồng nghiệp vụ (CV, duyệt khóa, mua khóa, lịch, hoàn tiền, ví, cửa hàng, báo cáo, reset mật khẩu).

---

## 4. Giai đoạn 2: Chốt lại phạm vi (17/10/2026)

Phiên làm việc trước đã lan sang sửa logic tài chính (ví HLV, duyệt rút tiền), nên bị dừng. `Doc/CLAUDE_MANAGER_WEB_PROMPT.md` được viết để thu hẹp lại:
- Chỉ làm 6 nhóm quản trị.
- **Ranh giới cứng:** không sửa payments, SePay, refunds, reports, coach-wallet hay các helper tài chính.
- Phần tài chính đã sửa dở thì giữ nguyên để bàn giao, không sửa tiếp và không tự rollback (xem [§9.4](#94-thay-đổi-tài-chính-còn-lại-từ-phiên-trước-cần-bàn-giao)).
- Ma trận contract được cập nhật: F-02/03/05/07, M-01…05, P-07…09, S-03/05/07 chuyển ra ngoài phạm vi.

---

## 5. Giai đoạn 3: Xây dựng chức năng (FE + BE)

### 5.1. Luồng đăng nhập và định tuyến
- `/` và đường dẫn lạ → `/login`. Landing, Register, Member, Coach, Reception vẫn giữ trong source nhưng không còn nằm trong luồng điều hướng.
- Vai trò lấy từ `GET /auth/me` của BE, không tự giải mã JWT. Tài khoản không phải Manager, bị khóa hoặc ở chế độ `restricted` sẽ thấy màn **"Không có quyền"** kèm nút đăng xuất.
- **Deep link:** mở `/manager/...` khi chưa đăng nhập → `/login?from=...` → đăng nhập xong quay lại đúng trang. F5 vẫn giữ phiên.
- `/reset-password`: trang công khai tối thiểu để người nhận email tự đặt mật khẩu mới (email + mã OTP).
- `ManagerLayout` được lazy-load.

### 5.2. Các màn quản trị (14 trang)

| Route | Chức năng |
|---|---|
| `/manager/dashboard` | KPI, dòng tiền 7 ngày, lịch tháng, buổi học hôm nay, việc cần xử lý |
| `/manager/users` | Lọc vai trò/trạng thái, tìm kiếm, phân trang, tạo tài khoản |
| `/manager/users/:id` | Sửa thông tin, hồ sơ hội viên, đổi vai trò, khóa/mở khóa, cấp lại mật khẩu (kèm trạng thái mã), xóa vĩnh viễn (chỉ khi chưa có dữ liệu) |
| `/manager/coaches` | Danh sách HLV, tab hồ sơ CV theo trạng thái, tạo tài khoản HLV |
| `/manager/coaches/:id` | Hồ sơ chuyên môn, CV (tải có xác thực), duyệt/từ chối có lý do, khóa phụ trách, buổi dạy sắp tới |
| `/manager/rooms` | CRUD phòng, ngừng/mở lại |
| `/manager/rooms/:id` | Lịch tuần của phòng, chuyển lịch sang phòng khác (có xem trước xung đột) |
| `/manager/classes` | Lọc theo duyệt/HLV/môn/khu vực/mở bán |
| `/manager/classes/:id` | Duyệt/từ chối, sửa nội dung/giá/sức chứa, ngừng/mở bán, buổi học, học viên |
| `/manager/schedules` | Lịch tuần + dạng bảng, lọc phòng/HLV/khóa/trạng thái, chi tiết buổi (dạy bù/hủy), danh sách học viên |
| `/manager/products` | CRUD sản phẩm (ảnh qua URL), ngừng bán |
| `/manager/products/:id` | Nhập/điều chỉnh kho, nhật ký kho, ẩn/hiện đánh giá, xóa (chỉ khi chưa có lịch sử) |
| `/manager/revenue` | Báo cáo theo kỳ (giờ Việt Nam), biểu đồ, danh sách giao dịch phân trang, xuất CSV đủ dữ liệu |
| `/manager/profile` | Sửa thông tin, đổi mật khẩu, chọn giao diện sáng/tối |

**Chuẩn chung của mọi màn:**
- Có trạng thái loading, lỗi (kèm nút thử lại) và rỗng.
- Bộ lọc và số trang lưu trên URL.
- Thao tác ghi dữ liệu chặn bấm lặp và làm mới cache liên quan.
- Khóa/xóa/ngừng đều có hộp xác nhận, nêu đối tượng và hậu quả.

### 5.3. API quản trị bổ sung ở BE
Chi tiết ở [§9](#9-thay-đổi-backend-chi-tiết). Tóm tắt:
- **Người dùng:** cấp lại mật khẩu (`POST/GET /users/:id/password-reset`), lịch sử nghiệp vụ (`GET /users/:id/history`), xóa vĩnh viễn (`DELETE /users/:id/permanent`), các chặn khi khóa/đổi vai trò/mở khóa.
- **Bảo mật phiên:** đổi hoặc đặt lại mật khẩu thì mọi access token cũ hết hiệu lực ngay (`pv` trong JWT).
- **Lịch học:** lọc `coachId`, trả kèm tên HLV, buổi bù và buổi được thay thế.
- **Khóa học:** duyệt khóa chống bấm song song (CAS).
- **HLV:** kiểm tra query `status` của hàng chờ CV (trước đây giá trị lạ gây lỗi 500).
- **Sản phẩm:** xóa vĩnh viễn chỉ khi chưa có đơn/đánh giá. Đã có thì trả 409, phải dùng ngừng bán.
- **Contract:** script export OpenAPI từ BE local, sửa Swagger (`BearerAuth`, thêm tham số còn thiếu).

### 5.4. Đồng bộ contract FE ↔ BE
- Thêm `BE/scripts/export-openapi.ts` và lệnh `npm run openapi:export`: xuất `FE/docs/openapi.json` từ đúng BE đang checkout, không lấy Swagger cũ trên Render.
- Sửa `FE/scripts/generate-api.mjs`: ghi nguồn đúng, không còn ghi đè contract mới bằng override cũ. `workflow-contract-overrides.json` để rỗng.
- Sinh lại `FE/src/shared/operations.json` và `generated.ts`, cập nhật `FE/docs/API_INVENTORY.md` và `FE/tests/api.test.ts`.

---

## 6. Giai đoạn 4: Thiết kế lại giao diện (Blue SaaS, 18/10/2026)

Tài liệu: `Doc/DESIGN_DNA.md`.
- **Design system** trong `admin.css`, CSS gói trong `.cr` nên không ảnh hưởng trang public:
  - Token màu semantic có bản sáng và tối.
  - Font Inter. Mọi số liệu dùng `tabular-nums`.
  - Bảng kiểu dải hàng bo góc, không kẻ lưới.
- **Khung ứng dụng:**
  - Sidebar 252px, thu gọn được và nhớ trạng thái. Menu chia nhóm: Tổng quan · Con người · Đào tạo · Kinh doanh. Có thẻ "Hôm nay".
  - Topbar có tìm kiếm toàn cục, nút sáng/tối, chuông thông báo, menu tài khoản.
- **Tìm kiếm toàn cục** (`GlobalSearch.tsx`): mở bằng Ctrl/⌘ K, điều khiển được bằng bàn phím. Gọi song song các API có tìm kiếm thật: users, classes, rooms, products.
- **Dashboard** viết lại: mỗi widget trả lời một câu hỏi vận hành.
  - KPI tiền thu, hội viên hoạt động, buổi hôm nay, HLV.
  - Biểu đồ cột đôi 7 ngày, xem được dạng bảng.
  - Lịch tháng, buổi học trong ngày, việc cần xử lý.
- **Theme** Sáng / Tối / Theo hệ điều hành. `index.html` gán theme trước khi render nên không bị nháy màu.
- **Component dùng chung** (`kit.tsx`): `PageHead`, `Panel`, `DataTable`, `Pager`, `SearchBox`, `Select`, `Pill`, `Ring`, `Dialog`, `ConfirmDialog`, `Field`, `Dl`, `Skeleton`, `ErrorBox`, `EmptyState`…

---

## 7. Giai đoạn 5: Tài liệu nghiệm thu và demo (18–19/10/2026)

- `Doc/MANAGER_ADMIN_MANUAL_UAT.md`: checklist test tay theo từng nhóm, kèm cách xác nhận FE gọi BE thật (tab Network, chế độ Offline, F5 đọc lại dữ liệu).
- `Doc/DEMO_REAL_DATA.md`: chạy BE 8080 + Web + Mobile trên cùng DB, kịch bản demo hai chiều Mobile ↔ Web, tài khoản demo.
- `Doc/BE_API_CHANGES.md`: sửa mô tả `.env.local` (file này không được track).
- `FE/README.md` viết lại cho Web quản trị: route, cách sinh contract, cách chạy Playwright với BE thật.

---

## 8. Giai đoạn 6: Hoàn thiện UX/UI (19/10/2026)

### 8.1. Màn đăng nhập: video tập tạ và hiệu ứng 3D
- Cột trái từng là nền xanh đặc, nay là **video người tập tạ** (tự phát, tắt tiếng, lặp lại). Video chưa tải xong thì hiện ảnh phòng gym. Video và ảnh lấy từ Mixkit và Unsplash, cùng nguồn trang Landing đang dùng, giấy phép ghi trong `FE/docs/PUBLIC_MEDIA.md`.
- Lớp phủ xanh nhiều tầng giữ tông Pulse.
- **Hiệu ứng 3D:** video nghiêng theo chuột, lớp chữ dịch ngược chiều, video tự phóng to chậm.
- Máy bật *giảm chuyển động* hoặc *tiết kiệm dữ liệu* thì chỉ hiện ảnh tĩnh.

### 8.2. Bỏ các dòng hướng dẫn kiểu AI
Bỏ mọi chữ lộ chi tiết kỹ thuật và câu giải thích dài:

| Trang | Đã bỏ / rút gọn |
|---|---|
| Doanh thu | Khung **"Cách API tính"** và đoạn "Lưu ý bàn giao… source BE…", các chữ "theo API" / "API báo cáo", "(theo ngày thanh toán)". "Nguồn thu riêng có trong API" đổi thành "Gói thành viên" |
| Dashboard | Ghi chú "SUCCESS… từ API báo cáo", dòng "xử lý trên ứng dụng Manager" |
| Chi tiết khóa học | "Đã thu (theo API khóa)" đổi thành "Đã thu". Bỏ câu "Mỗi khóa có đúng một HLV phụ trách…" |
| Chi tiết HLV | Nhãn tệp CV đổi thành "Không có tệp". Bỏ dòng hướng dẫn khóa tài khoản. Nút đổi thành "Quản lý tài khoản" |
| Các trang danh sách và chi tiết khác | Bỏ mô tả quy trình dưới tiêu đề trang và trong các khung |

Vẫn giữ: nội dung trong hộp xác nhận khi xóa/khóa/đặt lại mật khẩu, và các gợi ý nhập liệu ngắn.

### 8.3. Tạo tài khoản: chỉ Hội viên và HLV
- **FE:** ô *Vai trò* chỉ có Hội viên và Huấn luyện viên (`CREATABLE_ROLES`). Trang HLV có nút "Tạo tài khoản HLV".
- **BE:** `CreateUserSchema.role` chỉ còn `MEMBER` và `COACH`. Gửi `MANAGER` nhận **400**. Bỏ nhánh tạo `managerProfile`.
- Quá trình: có lúc nút bị gỡ hẳn do hiểu sai yêu cầu. Nút đã được dựng lại từ bản build `FE/dist`, vì các file trang chưa được commit.

### 8.4. Sửa lỗi UI desktop

Soát bằng Playwright 15 trang × 1440/1280px với dữ liệu thật, sau đó xem trực tiếp từng ảnh chụp.

| Lỗi | Cách sửa |
|---|---|
| Danh sách trống vẫn hiện "0–0 trong 0 · Trang 1/1" | `Pager` ẩn khi `total = 0` |
| Bộ lọc "Mở bán" ở trang Khóa học rớt xuống dòng riêng | Thu nhỏ `flex-basis` của `.cr-filters` |
| Email HLV bị ngắt giữa chữ | Hiển thị dưới tên HLV |
| Thời gian buổi "09:00 19/10/26–09:45" | Đổi thành "19/10/2026 · 09:00–09:45" |
| Mô tả sản phẩm không có nhãn, dễ nhầm với trạng thái | Thêm khối "Mô tả" (`.cr-desc`) |
| "★ 0.00 trung bình" khi chưa có đánh giá | Ghi "chưa có đánh giá"; có đánh giá thì làm tròn 1 chữ số |
| Khoảng ngày lệch so với ô chọn kỳ (Doanh thu) | Căn cùng hàng |
| **Icon kính lúp và chữ trong ô tìm kiếm không nằm giữa** | `src/styles.css` (CSS trang public) có `label > input { margin-top: 8px }` và `input { min-height: 44px }` lọt vào khu quản trị. Đã bỏ riêng cho `.cr-search input` và `.cr-gsearch-box input` |

Quyết định: chỉ soát và sửa giao diện **desktop**. Không sửa giao diện mobile của web.

---

## 9. Thay đổi Backend chi tiết

### 9.1. Xác thực và phiên đăng nhập

| File | Thay đổi |
|---|---|
| `src/utils/jwt.ts` | Thêm `pv` (password version) vào access token. Giá trị là SHA-256 của hash mật khẩu, cắt 16 ký tự, không lộ thông tin mật khẩu. Thêm `passwordVersion()` và `isAccessTokenCurrent()` |
| `src/modules/auth/auth.service.ts` | `issueSession` và `refreshAccessToken` gắn `pv`. `generateOtp` được export để module users dùng lại |
| `src/middlewares/authenticate.ts`, `authenticateIncludingInactive.ts`, `authenticateRestricted.ts` | So `pv` với mật khẩu hiện tại. Lệch thì trả 401, nên đổi/đặt lại mật khẩu sẽ làm **mọi access token cũ hết hiệu lực ngay**, không cần migration |
| `src/modules/chat/chat.socket.ts` | Socket cũng kiểm tra `pv` |
| `src/modules/auth/auth.routes.ts` | Swagger `PATCH /auth/reset-password` mô tả cả 2 cách: `{token,newPassword}` và `{email,otp,newPassword}` |

> Hệ quả: token cấp trước khi có cơ chế này (không có `pv`) bị coi là hết hạn. Người dùng phải đăng nhập lại một lần sau khi triển khai.

### 9.2. Module Người dùng (`src/modules/users/`)

| Thay đổi | Chi tiết |
|---|---|
| `POST /users/:id/password-reset` (mới) | Quản lý gửi email chứa **mã OTP 6 số** và liên kết tới `/reset-password`. Mã hiệu lực 15 phút, dùng 1 lần. Có cooldown (`RESET_COOLDOWN`). Tài khoản đang khóa thì trả 409 `USER_LOCKED`. Email đi qua outbox. **Không trả về mật khẩu, mã hay token** |
| `GET /users/:id/password-reset` (mới) | Trạng thái yêu cầu gần nhất (còn hạn/đã dùng, email đã gửi chưa), không lộ mã |
| `GET /users/:id/history` (mới) | Thống kê dữ liệu nghiệp vụ của tài khoản, dùng để quyết định xóa vĩnh viễn hay chỉ khóa |
| `DELETE /users/:id/permanent` (mới) | Chỉ xóa được tài khoản **chưa phát sinh dữ liệu** (ví dụ tạo nhầm). Có dữ liệu thì 409 `USER_HAS_HISTORY`. Không cho tự xóa chính mình |
| `DELETE /users/:id` | Giữ nguyên là **khóa mềm** (`isActive=false`), Swagger ghi rõ |
| Khóa / hạ quyền | Chặn tự khóa và tự đổi vai trò. Chặn khóa/hạ quyền **Manager hoạt động cuối cùng**, chống race bằng advisory lock `lockManagerRoster` (`LAST_ACTIVE_MANAGER`) |
| Đổi vai trò | Bị chặn khi còn nghĩa vụ ở vai trò cũ (`ROLE_CHANGE_BLOCKED`): hội viên còn lịch đã đặt, hoàn tiền chờ, gói còn hạn; HLV còn khóa đang mở, rút tiền chờ, ví còn số dư, lịch sắp tới |
| Mở khóa HLV | HLV có CV chưa APPROVED thì 409 `COACH_CV_NOT_APPROVED`. Không bypass duyệt CV |
| `POST /users` (19/10) | `role` chỉ nhận `MEMBER`/`COACH`. Bỏ nhánh `managerProfile` |
| `src/utils/mail.ts` | `buildAdminResetPasswordEmail()`: email tiếng Việt có mã và liên kết; liên kết không chứa mã |
| `src/modules/notifications/outbox.service.ts` | Email outbox có thêm trường `metadata` (vết người khởi tạo, không chứa bí mật) |
| `src/utils/dbLocks.ts` | Thêm `lockManagerRoster` và `lockCoachWallet` |

### 9.3. Các module khác (không đụng logic tiền)

| File | Thay đổi |
|---|---|
| `class-schedules.routes/schema/service.ts` | Query `coachId` (lọc theo HLV, quy về danh sách classId). Trả kèm `class.coach` (tên HLV), `makeupFor` và `makeup`. **Chỉ thêm field**, không đổi field cũ |
| `classes.service.ts`, `classes.routes.ts` | `reviewClass` dùng CAS `status=PENDING`, bấm song song thì người sau nhận 409 `CLASS_ALREADY_REVIEWED`. Swagger thêm `status` và mô tả `price` |
| `coaches.schema.ts`, `coaches.routes.ts` | `CvQuerySchema` kiểm `status ∈ PENDING/APPROVED/REJECTED`, trước đây giá trị lạ gây 500 |
| `products.service.ts`, `products.routes.ts` | `DELETE /products/:id` chỉ xóa khi chưa có đơn/đánh giá/hàng đang giữ, không thì 409 `PRODUCT_HAS_HISTORY`. Swagger đủ field |
| `enrollments`, `payments`, `refunds`, `shop` routes | **Chỉ sửa Swagger**: `bearerAuth` → `BearerAuth`, thêm tham số `page/limit/status/orderId/productId/hidden` |
| `scripts/export-openapi.ts` (mới), `package.json` | Lệnh `openapi:export` |
| `tests/admin-web.e2e.ts` (mới), `scripts/run-e2e.mjs` | Bộ e2e quản trị, 12 nhóm (xem [§12](#12-kiểm-thử)), được thêm vào danh sách suite |
| `README.md` | Cập nhật hướng dẫn |

### 9.4. Thay đổi tài chính còn lại từ phiên trước (cần bàn giao)

Các thay đổi này được làm **trước khi** phạm vi bị chốt lại. Theo `CLAUDE_MANAGER_WEB_PROMPT.md`, chúng **được giữ nguyên để bàn giao** cho người phụ trách thanh toán, không sửa tiếp và không rollback:

| File | Thay đổi |
|---|---|
| `src/modules/coaches/coach-wallet.service.ts` | `reviewWithdrawal` có thêm 4 thay đổi (liệt kê ngay dưới bảng) |
| `src/modules/coaches/coach-wallet.controller.ts` | Truyền thêm `transactionRef` |

Bốn thay đổi trong `reviewWithdrawal`:
- Khóa ví bằng `lockCoachWallet` và đọc lại trạng thái sau khi khóa. Lệnh đã xử lý thì 409 `WITHDRAWAL_ALREADY_PROCESSED`.
- Chặn duyệt khi (số dư − tiền tạm giữ cho hoàn tiền chờ) < số tiền rút (`BALANCE_HELD_FOR_REFUND`).
- Lưu `transactionRef` vào ghi chú.
- Chỉ gửi thông báo cho HLV sau khi commit.

> Người phụ trách thanh toán cần review, rồi quyết định giữ hay bỏ.

---

## 10. Thay đổi Frontend chi tiết

### 10.1. Code mới (`FE/src/features/manage/`)

| File | Vai trò |
|---|---|
| `AuthScreens.tsx` | `AdminLogin` (video 3D), `NotManager`, `ResetPasswordScreen` |
| `admin.css` | Toàn bộ design system Blue SaaS (scope `.cr`), sáng/tối, responsive, màn đăng nhập |
| `kit.tsx` | Component dùng chung, nhãn, định dạng (`vnd`, `dateTime`, `dateOnly`, `clock`…), `useUrlState`, `allPages` |
| `GlobalSearch.tsx` | Tìm kiếm toàn cục Ctrl/⌘ K |
| `opsQueries.ts` | Query dùng chung giữa Dashboard và thẻ "Hôm nay" |
| `theme.tsx` | `ThemeToggle`, lưu `pulse.theme` |
| `pages/*.tsx` (15 file) | `Dashboard`, `Users`, `UserDetail`, `Coaches`, `CoachDetail`, `Rooms`, `RoomDetail`, `Classes`, `ClassDetail`, `Schedules`, `scheduleKit`, `Products`, `ProductDetail`, `Revenue`, `Profile` |

### 10.2. File đã có được sửa

| File | Thay đổi |
|---|---|
| `src/features/auth/Session.tsx` | Luồng chỉ cho Manager, deep link `?from=`, `/reset-password`, lazy `ManagerLayout`, màn không có quyền |
| `src/features/manage/ManagerLayout.tsx` | Viết lại shell: sidebar theo nhóm, topbar, router 14 trang + 404. Gỡ menu STAFF, sports, invoices, gói cũ, tạo lịch nhanh và các placeholder |
| `src/features/manage/Dashboard.tsx`, `ResourcePage.tsx`, `AttendancePenalties.tsx` | Màn cũ, chỉ sửa nhỏ (không còn trong menu chính) |
| `src/shared/operations.json`, `generated.ts` | Sinh lại từ OpenAPI của BE local |
| `scripts/generate-api.mjs` | Nguồn là `docs/openapi.json`; override không còn ghi đè ngầm |
| `docs/openapi.json`, `docs/API_INVENTORY.md`, `docs/workflow-contract-overrides.json` | Contract mới, override rỗng |
| `index.html` | Gán theme trước khi render, `theme-color` cho sáng/tối |
| `tests/api.test.ts` | Cập nhật theo contract mới |
| `README.md` | Viết lại cho Web quản trị |

### 10.3. Kiểm thử FE mới

| File | Nội dung |
|---|---|
| `playwright.real.config.ts` | Cấu hình Playwright chạy với BE + DB test thật |
| `tests/real/admin-real.spec.ts` | 9 kịch bản (xem §12) |
| `tests/real/zz-shots.spec.ts` | Chụp ảnh màn hình để duyệt giao diện |

---

## 11. Danh sách file đầy đủ

### Tạo mới

```text
BE/scripts/export-openapi.ts
BE/tests/admin-web.e2e.ts
FE/playwright.real.config.ts
FE/src/features/manage/AuthScreens.tsx
FE/src/features/manage/GlobalSearch.tsx
FE/src/features/manage/admin.css
FE/src/features/manage/kit.tsx
FE/src/features/manage/opsQueries.ts
FE/src/features/manage/theme.tsx
FE/src/features/manage/pages/            (15 file)
FE/tests/real/admin-real.spec.ts
FE/tests/real/zz-shots.spec.ts
Doc/ADMIN_WEB_AUDIT_AND_PLAN.md
Doc/ADMIN_WEB_IMPLEMENTATION_BRIEF.md
Doc/ADMIN_WEB_CONTRACT_MATRIX.md
Doc/ADMIN_WEB_FLOW_MAP.md
Doc/CLAUDE_MANAGER_WEB_PROMPT.md
Doc/DESIGN_DNA.md
Doc/MANAGER_ADMIN_MANUAL_UAT.md
Doc/DEMO_REAL_DATA.md
Doc/ADMIN_WEB_TONG_KET.md                (tài liệu này)
```

### Sửa (so với `acf214d`)

```text
BE/README.md, BE/package.json, BE/scripts/run-e2e.mjs
BE/src/middlewares/authenticate.ts
BE/src/middlewares/authenticateIncludingInactive.ts
BE/src/middlewares/authenticateRestricted.ts
BE/src/modules/auth/auth.routes.ts, auth.service.ts
BE/src/modules/chat/chat.socket.ts
BE/src/modules/class-schedules/class-schedules.routes.ts, .schema.ts, .service.ts
BE/src/modules/classes/classes.routes.ts, classes.service.ts
BE/src/modules/coaches/coaches.routes.ts, coaches.schema.ts
BE/src/modules/coaches/coach-wallet.controller.ts, coach-wallet.service.ts   (tài chính, bàn giao)
BE/src/modules/enrollments/enrollments.routes.ts                              (Swagger)
BE/src/modules/notifications/outbox.service.ts
BE/src/modules/payments/payments.routes.ts                                    (Swagger)
BE/src/modules/products/products.routes.ts, products.service.ts
BE/src/modules/refunds/refunds.routes.ts                                      (Swagger)
BE/src/modules/shop/shop.routes.ts                                            (Swagger)
BE/src/modules/users/users.controller.ts, users.routes.ts, users.schema.ts, users.service.ts
BE/src/utils/dbLocks.ts, jwt.ts, mail.ts
FE/README.md, FE/index.html, FE/scripts/generate-api.mjs
FE/docs/API_INVENTORY.md, openapi.json, workflow-contract-overrides.json
FE/src/features/auth/Session.tsx
FE/src/features/manage/ManagerLayout.tsx, Dashboard.tsx, ResourcePage.tsx, AttendancePenalties.tsx
FE/src/shared/generated.ts, operations.json
FE/tests/api.test.ts
Doc/BE_API_CHANGES.md
```

---

## 12. Kiểm thử

### 12.1. Đã chạy

| Kiểm thử | Kết quả | Thời điểm |
|---|---|---|
| FE `npm run typecheck`, `npm test` (43/43), `npm run build` | Qua | 18/10 |
| Playwright `admin-real` với BE + DB test riêng (`sports_center_admin_test`, BE :8091) | 13/13 qua, gồm kiểm tra không tràn ngang ở 1440/1024/768/375 | 18/10 |
| axe WCAG 2 A/AA: Tổng quan, Người dùng, Sản phẩm, Doanh thu, Lịch học × sáng/tối | 0 vi phạm | 18/10 |
| `tsc --noEmit` FE và BE | Qua | 19/10 (sau mọi chỉnh sửa) |
| Playwright soát UI: 15 trang × 1440/1280px, dữ liệu thật BE :8080 | Không tràn ngang, không lỗi console, không `undefined`/`NaN` | 19/10 |
| Video màn đăng nhập, căn giữa ô tìm kiếm (đo bằng trình duyệt) | Đạt | 19/10 |

### 12.2. Nội dung các bộ test

**BE `tests/admin-web.e2e.ts`** (12 nhóm):
1. Phân quyền (401 guest, 403 MEMBER/COACH)
2. CRUD người dùng
3. Khóa/mở khóa, Manager cuối
4. Không bypass CV
5. Chặn đổi vai trò
6. Cấp lại mật khẩu
7. Xóa vĩnh viễn
8. CV HLV
9. Phòng
10. Khóa học và lịch
11. Sản phẩm và kho
12. Doanh thu (chỉ đọc)

Ngày 19/10 thêm ca: tạo `MANAGER` phải nhận 400.

**FE `tests/real/admin-real.spec.ts`:**
- Deep link → đăng nhập → quay lại đúng trang.
- Người dùng: tạo → sửa → khóa/mở → cấp lại mật khẩu → xóa (kèm kiểm tra ô vai trò chỉ có 2 lựa chọn).
- Lọc và phân trang giữ trên URL.
- Phòng.
- Duyệt khóa (khóa tạo bằng API của Coach thật).
- Lịch học.
- Sản phẩm và kho.
- Doanh thu: KPI khớp response API.
- Tài khoản không phải Manager bị chặn.

### 12.3. Chưa chạy lại

- `BE/tests/admin-web.e2e.ts` và `FE/tests/real/admin-real.spec.ts` **sau các thay đổi ngày 19/10**. Cần BE và DB test riêng.
- Gửi email reset thật qua SMTP: chưa kiểm với hộp thư thật, chỉ kiểm qua outbox.
- Mobile (Flutter) chạy thật cùng DB: chưa chạy vì máy không có Flutter.

---

## 13. Còn thiếu và rủi ro

| # | Vấn đề | Mức |
|---|---|---|
| 1 | **Toàn bộ thay đổi chưa commit.** `FE/src/features/manage/pages/` và các file mới chưa có trong git. Ngày 19/10 đã phải dựng lại một hộp thoại từ bản build | Cao |
| 2 | **Vẫn nâng được tài khoản lên Quản lý qua "Đổi vai trò".** `UpdateUserSchema.role` còn nhận `MANAGER`, ô vai trò ở trang chi tiết còn "Quản lý". Chưa đồng nhất với quy định "không tạo Quản lý trên web" | Cao |
| 3 | **Contract FE chưa sinh lại sau thay đổi ngày 19/10.** `openapi.json`, `operations.json`, `generated.ts` vẫn có `MANAGER` trong enum của `POST /users` | Trung bình |
| 4 | Thay đổi tài chính ở `coach-wallet.*` (§9.4) đang chờ người phụ trách thanh toán review | Trung bình |
| 5 | Báo cáo doanh thu (logic BE, ngoài phạm vi): hoàn toàn bộ được tính vào kỳ của lần thu gốc; "Thực nhận" bị ép ≥ 0; chưa tách doanh thu khóa/cửa hàng/gói, phần nền tảng và phần HLV | Bàn giao |
| 6 | Không có API doanh thu theo ngày, nên biểu đồ 7 ngày gọi báo cáo 14 lần (cache 5 phút) | Thấp |
| 7 | `Doc/ADMIN_WEB_PROGRESS.md` và `Doc/ADMIN_WEB_DEMO_GUIDE.md` được nhắc trong ma trận contract, `DESIGN_DNA.md` và `FE/README.md` nhưng **không có trong repo** | Thấp |
| 8 | CSS chung `src/styles.css` vẫn áp lên khu quản trị. Lỗi ô tìm kiếm mới được vá cục bộ | Thấp |
| 9 | Video đăng nhập lấy từ CDN ngoài. Mất mạng thì chỉ còn nền xanh | Thấp |
| 10 | Ảnh sản phẩm chỉ nhập qua URL, BE chưa có upload | Thấp |
| 11 | Web chưa có màn đơn hàng; duyệt hoàn tiền/rút tiền vẫn làm trên app Mobile của Manager | Theo phạm vi |
| 12 | Giao diện mobile của web không được soát lại trong đợt 19/10 (theo yêu cầu chỉ làm desktop) | Theo phạm vi |

---

## 14. Đề xuất cải tiến tiếp theo

**Ưu tiên cao: làm ngay**
1. **Commit** theo hạng mục, tách riêng phần BE quản trị, phần BE tài chính (bàn giao), FE, tài liệu.
2. Chặn đổi vai trò sang `MANAGER` ở `UpdateUserSchema` và ô vai trò ở trang chi tiết. Thêm ca e2e.
3. Sinh lại contract: `cd BE && npm run openapi:export`, rồi `cd FE && npm run generate:api`, review diff, chạy `npm test`.
4. Chạy lại `admin-web.e2e.ts` và `admin-real.spec.ts` trên DB test.
5. Bàn giao `coach-wallet.*` và các vấn đề báo cáo doanh thu cho người phụ trách thanh toán.

**Ưu tiên trung bình**
1. Tạo `ADMIN_WEB_PROGRESS.md` và `ADMIN_WEB_DEMO_GUIDE.md`, hoặc sửa các liên kết đang trỏ tới chúng.
2. Tách CSS: giới hạn `src/styles.css` chỉ cho trang public, hoặc reset `margin`/`min-height` cho mọi input trong `.cr`.
3. Đưa video và ảnh đăng nhập vào `FE/public/media/` (WebM ≤ 2–3 MB).
4. Thêm API `GET /reports/revenue/daily` (người phụ trách báo cáo) để biểu đồ chỉ cần 1 request.
5. Thống nhất hành động cuối dòng bảng: hiện có trang dùng mũi tên `›`, có trang dùng nút chữ ("Hồ sơ", "Chi tiết").
6. Màn đơn hàng trên Web (P-07…P-09) nếu muốn Quản lý xử lý đơn trên máy tính.
7. Upload ảnh sản phẩm thay cho dán URL.

**Ưu tiên thấp**
1. Avatar chữ cái đầu trong danh sách HLV, giống trang Người dùng.
2. Tooltip cho thẻ buổi học bị cắt chữ trong lịch tuần.
3. Ô ngày sinh cố định định dạng `dd/mm/yyyy`.
4. Đưa script soát UI (tràn ngang, lỗi console) vào `FE/tests/` để chạy lại mỗi khi đổi giao diện.
5. Dọn code cũ không còn trong luồng: Landing, Member, Coach, Reception, `Dashboard.tsx`, `ResourcePage.tsx`, nếu nhóm xác nhận không dùng nữa.
