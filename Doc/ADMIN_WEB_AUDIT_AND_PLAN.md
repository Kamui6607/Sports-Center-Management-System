# Audit và lộ trình Web Admin

Ngày: 17/10/2026. Commit được khảo sát: `acf214d` (`Fixed schema for membership`).

## 1. Kết luận và giới hạn

Anh sẽ làm **FE web + phần BE cần bổ sung/sửa**, dùng chung BE và PostgreSQL với Mobile. Không cần dựng BE quản trị riêng. Repo đã có web React trong `FE/`; việc trước mắt là cập nhật web theo BE hiện tại, sau đó hoàn thiện các nghiệp vụ quản trị còn thiếu.

Đây là audit tĩnh: đã đọc cấu trúc, schema/migrations, route/middleware và các service trọng yếu, web entrypoint, Manager workspace/API client/snapshot, Mobile config/router/repositories, test inventory và cấu hình AI trong repo. Không phải chứng nhận mọi dòng code đã đúng hay mọi màn hình đã chạy.

Chưa chạy build, unit, browser hoặc E2E; checkout chưa có `BE/node_modules`, `FE/node_modules`, chưa cấu hình DB/env. Node quan sát được là 20.20.1, trong khi FE README yêu cầu Node 22+. Lệnh kiểm tra npm gặp lỗi quyền EPERM tại thư mục người dùng. Không cài dependency, không gọi mutation lên Render, không chạy migration/seed, không sửa nghiệp vụ trong đợt audit này.

## 2. Bản đồ dự án

```text
FE/     React 19 + Vite + TypeScript + React Router + TanStack Query
Mobile/ Flutter + Riverpod + Dio + go_router + secure storage + Socket.IO
                       │ REST /api/v1 + Socket.IO
                       ▼
BE/     Express 5 + TypeScript + Zod + Prisma 5
                       │
                       ▼
        PostgreSQL; tích hợp SePay, email, upload
```

- `BE/src/app.ts`: mount API hiện tại. Đây là chỗ kiểm tra endpoint có thực sự được expose hay không.
- `BE/prisma/schema.prisma`: model, quan hệ và enum hiện tại; đối chiếu migrations khi triển khai DB.
- `BE/src/modules/`: routes → controller → service; schema Zod kiểm request.
- `FE/src/main.tsx` → `FE/src/app/App.tsx` → auth Session/RoleRouter: luồng web thực tế. Có những cây `pages/`, `api/`, `context/` song song; cần truy từ entrypoint trước khi sửa để tránh sửa nhầm code không được dùng.
- `FE/src/features/manage/`: ManagerLayout, ResourcePage, Dashboard, ScheduleCalendar, ActivityPlanner, AttendancePenalties.
- `FE/src/shared/api.ts`, `operations.json`, `generated.ts`: client và hợp đồng API mà web đang sử dụng.
- `Mobile/lib/features/`: presentation/domain/data, có cả API và mock repositories.

Trong code hiện tại, admin tương ứng role **MANAGER**, không có tên role ADMIN. Ba role được seed và validate là MEMBER, COACH, MANAGER. Bảng `Role` không đồng nghĩa với hệ thống chỉnh permission động.

## 3. Những gì đã có

| Phạm vi | BE hiện có | Web hiện có | Công việc cho admin |
|---|---|---|---|
| Tài khoản | List/detail/create/update/deactivate; auth/JWT/refresh; reset bằng email token hoặc OTP | Trang users, members, coaches; tìm kiếm, tạo, khóa; form sửa phụ thuộc snapshot | Đồng bộ PATCH, bỏ STAFF nếu không còn nghiệp vụ; thêm admin reset |
| Sản phẩm | CRUD sản phẩm, review, giữ kho; module shop riêng | Chưa có module tương ứng trong Manager navigation/resources hiện tại | Làm sản phẩm, tồn kho và lịch sử điều chỉnh |
| Đơn hàng | Cart/checkout, đơn, status history, pickup, inventory, moderation review | Chưa có workspace Manager tương ứng | Làm danh sách/chi tiết/chuyển trạng thái/giao nhận |
| Phòng | API quản lý Room | Trang phòng đã có | Kiểm contract, điều kiện ngừng hoạt động và lịch liên quan |
| Khóa học | Class, một coach phụ trách, fitness dạng chuỗi, giá, duyệt/từ chối/gửi lại | Trang lớp còn thiết kế theo hợp đồng cũ | Làm lại phần dữ liệu và duyệt khóa theo BE |
| Lịch | Xem lịch; Coach tạo/sửa/hủy/dạy bù/hoàn thành; kiểm xung đột | Lịch, calendar, tạo lịch nhanh đã có UI | Mở quyền Manager có chủ đích ở cả routes và services |
| HLV | Profile, CV approval/download; wallet và withdrawal review | Trang coach cơ bản | Thêm queue CV, xem PDF, duyệt/từ chối, yêu cầu rút tiền |
| Hoàn tiền | Refund list/detail/approve/reject/cancel; gắn lớp/buổi/đơn hàng | Chưa có màn Manager chuyên biệt tương ứng | Làm queue, chi tiết, lý do và kết quả chuyển tiền |
| Doanh thu | Revenue/member/enrollment/membership/attendance reports | Dashboard/report, lọc kỳ, xuất CSV | Kiểm lại phép tính và tách nguồn tiền/phần nền tảng/phần HLV |
| Điểm danh | QR, mã tay, bulk, penalties, analytics | Có shared attendance và màn chuyên cần | Chạy với API thật và kiểm quyền |
| Giao tiếp | Chat/attachment, notifications, outbox | Có shared communication | Chốt mức cần thiết cho admin, tránh mở rộng ngoài deadline |
| Audit/quyền động | Chưa thấy module audit log/permission management đầy đủ | Màn chưa khả dụng | Audit hành động nhạy cảm nên làm; permission động có thể để sau |

Các chức năng trên là **có mã nguồn**, chưa đồng nghĩa đã tích hợp E2E thành công.

Mobile đã vượt xa trạng thái khởi tạo: có auth, catalog/classes, coach, schedule, attendance, training, shop, payments, refunds, membership, chat, notifications và Manager screens. `Mobile/lib/core/config/env.dart` mặc định dùng API thật; có `USE_MOCK` và `MOCK_FEATURES`. Vì có mock, chạy được UI/test mock không chứng minh flow với BE đã hoàn tất. Flutter vẫn có thể làm màn admin; lựa chọn web là phù hợp với bảng dữ liệu, lịch và thao tác vận hành, không phải giới hạn kỹ thuật của Flutter.

## 4. Audit ưu tiên

### P0 — Contract FE và BE lệch đáng kể

1. **STAFF còn ở web, BE không nhận.** `FE/src/features/manage/config.ts`, `ManagerLayout.tsx`, `FE/src/app/roles.ts` còn STAFF/reception; `BE/src/modules/users/users.schema.ts` chỉ nhận ba role. Lọc/tạo STAFF có thể bị 400. Seed còn tài khoản đặt tên staff nhưng gán MANAGER: chỉ dùng dữ liệu demo local, không coi đây là phân quyền lễ tân thật.
2. **Danh mục sports đã bị bỏ ở BE.** Web còn `/sports`, `sportIds`, `sportsLabel`. `BE/src/app.ts` không mount `/sports`; Class dùng `fitness: String`; migration `20261008030000_drop_sport` tồn tại. Phải cập nhật UI và contract theo model mới.
3. **Một khóa một Coach.** Web vẫn gọi `POST /classes/{id}/coaches`, support coach và DELETE assignment. BE Class có một `coachId`; các route assignment cũ không thấy trong router hiện tại. Không tái tạo chức năng nhiều HLV nếu team không yêu cầu.
4. **Manager không tạo Class như UI cũ.** `POST /classes` và `/class-schedules/activity-plan` chỉ COACH. Mô hình hiện tại là Coach mở khóa → Manager review. Nếu admin phải tạo hộ, cần đặc tả riêng coach chịu trách nhiệm và doanh thu trước khi mở quyền.
5. **Manager chưa được quản lý lịch toàn quyền.** `BE/src/modules/class-schedules/class-schedules.routes.ts` giới hạn mutation cho COACH; `assertCanManageClassSchedule` trong service cũng chặn role khác. Chỉ thêm MANAGER vào middleware sẽ chưa đủ. Bảo toàn kiểm trùng phòng/HLV/học viên, enrollment và xử lý makeup/refund.
6. **Membership và hóa đơn cũ.** Web snapshot còn `/invoices` và contract gói cũ. BE không mount `/invoices`; MembershipPlan hiện là name/durationDays/price/description/isActive, bật/tắt qua `PATCH /membership-plans/{id}/toggle`. Không tiếp tục dùng tier/maxConcurrentClasses như contract gói hiện tại.
7. **Client khóa theo snapshot.** `FE/src/shared/api.ts` kiểm operation/query theo `operations.json`. Thêm nút gọi endpoint mới mà chưa cập nhật metadata sẽ bị chặn ngay phía client. Snapshot `openapi.json` hiện có 82 paths, `operations.json` có 114 operations; FE README còn ghi 66 — tài liệu cũng đã cũ. Generator còn merge `FE/docs/workflow-contract-overrides.json` bằng Object.assign sau khi đọc snapshot; các override được ghi là kiểm với commit cũ `9d4af0e`. Phải review/cập nhật override, nếu không regenerate vẫn có thể ghi đè contract mới bằng metadata cũ.

### P1 — Thiếu nghiệp vụ và tính đúng đắn

8. **Chưa có admin reset mật khẩu.** Users router không có action tương ứng; UpdateUserSchema không nhận password. Luồng forgot/reset hiện là tự phục vụ. Đề xuất action MANAGER gửi link/OTP reset tới user, có rate limit và audit; không gửi mật khẩu rõ qua log/email. Nếu cần mật khẩu tạm, cần thêm trạng thái bắt buộc đổi mật khẩu.
9. **Xóa tài khoản đang là khóa mềm.** DELETE users đặt `isActive=false`, có chặn tự khóa và manager cuối. Đây là hành vi hiện có, không phải hard delete. Cần ghi đúng nhãn UI/nghiệm thu; không xóa mất lịch sử thanh toán/lớp/đơn hàng.
10. **Báo cáo hoàn tiền có vấn đề từ logic tĩnh.** `getRevenueReport` trong `reports.service.ts` lấy SUCCESS theo paidAt; full refund lấy payment REFUNDED cũng theo paidAt, còn partial refund lấy processedAt. Ví dụ thu tháng 9, hoàn toàn phần tháng 10: khoản hoàn bị xếp theo tháng thu. Payment đã REFUNDED cũng bị loại khỏi tập gross SUCCESS. `Math.max(0, ...)` che kỳ có dòng tiền thuần âm. Cần test dữ liệu xác định và chốt lại định nghĩa báo cáo trước khi nghiệm thu.
11. **Chưa tách rõ doanh thu nền tảng và tiền thu hộ HLV.** Báo cáo tổng payment không đủ đại diện khoản trung tâm được hưởng. Cần phân biệt tiền thu khóa, phần nền tảng 15%, phần HLV 85%, sản phẩm, membership, hoàn tiền và tiền đã chi cho HLV; lấy tỷ lệ/số tiền đã ghi nhận thực tế, không tính lại toàn bộ lịch sử bằng một tỷ lệ hard-code ở FE.
12. **Reset chưa chứng minh thu hồi access token lập tức.** `finishPasswordReset` xóa refresh token và ngắt socket; access JWT chỉ chứa id/role, authenticate kiểm role/isActive nhưng chưa kiểm passwordChangedAt/sessionVersion. Token access cũ có thể còn hợp lệ đến hạn. Nếu yêu cầu reset thu hồi mọi phiên ngay, cần cơ chế phiên/version ở BE và test tương ứng.
13. **Swagger vẫn cần bổ sung.** Một số router có review action không kèm mô tả đầy đủ tại route (ví dụ review withdrawal/CV); security scheme có chỗ `bearerAuth` trong khi cấu hình là `BearerAuth`. Chỉ regenerate từ Swagger mà không đối chiếu router/Zod/service có thể vẫn bỏ sót hoặc hiểu sai.

### P2 — Tài liệu và vận hành

- Mobile README còn nói mới có main mẫu, không khớp source. Các danh sách API/TODO trong README có thể cũ.
- Chưa thấy pipeline `.github/` trong checkout. Có test source nhưng chưa có bằng chứng lần audit này đã chạy pass.
- BE có script `test:e2e:all` và nhóm `test:local` khác nhau; phải xem suite nào bao phủ thay đổi, không mặc định một lệnh đã chạy mọi test.
- Chưa có BE `.env.example` trong checkout; tài liệu nói `.env.local` đã có nhưng file này không được track. Dev mới cần tự tạo theo `src/config/env.ts` và module config liên quan.
- FE mặc định gọi Render; phải đổi sang local trước khi thử mutation. `FRONTEND_URL` BE mặc định cổng 3000 trong khi Vite thường 5173; cấu hình lại để link email về đúng web.

## 5. Chốt phạm vi với team

Đề xuất mặc định: một trung tâm, MANAGER là admin, dùng ba role hiện có; Coach sở hữu khóa và giá; Manager duyệt/vận hành. Trong schema đang khảo sát chưa có tenant/centerId để kết luận hệ thống hỗ trợ nhiều trung tâm độc lập.

Những quyết định cần ghi lại trước khi code:

1. Admin có tạo khóa hộ Coach hay chỉ duyệt/sửa/ngừng hoạt động?
2. Admin được can thiệp lịch đến đâu? Thông báo ai và xử lý học viên/tiền khi đổi lịch ra sao?
3. Khóa tài khoản được tính là đáp ứng yêu cầu xóa hay cần quy trình khác?
4. Cấp lại mật khẩu bằng reset link/OTP hay bắt buộc password tạm?
5. Doanh thu cần gross, tiền thuần theo kỳ, phần nền tảng, lợi nhuận hay tất cả? Lợi nhuận còn cần dữ liệu chi phí, chưa thể suy ra từ tiền thu.
6. Web cũ do ai phụ trách, có phải phần được phép kế thừa cho bài của anh? Tài liệu còn nhắc Member01/Member03.

Không cần đợi mọi quyết định để đọc/chạy local và lập ma trận contract; chỉ phần phụ thuộc quyết định mới phải đợi chốt.

## 6. Thứ tự triển khai

### Bước 1 — Chạy baseline an toàn

- Tạo branch riêng, ghi commit xuất phát. Dùng Node theo yêu cầu repo, PostgreSQL local riêng.
- Tạo `BE/.env.local`: DATABASE_URL local, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PORT (ví dụ 8081), FRONTEND_URL=`http://127.0.0.1:5173`. Giá trị lấy từ cấu hình source; key tích hợp thật không đưa vào FE.
- Tạo `FE/.env`: `VITE_API_BASE_URL=http://127.0.0.1:8081/api/v1`.
- Sau khi DB local đã sẵn sàng, chạy lần lượt:

```powershell
# Terminal BE, tại BE/
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev:local

# Terminal FE, tại FE/
npm ci
npm run dev
```

`with-local-env.mjs` chặn DATABASE_URL không phải localhost; dùng các script local đã có. Seed chỉ trên DB dev riêng vì tạo tài khoản demo. Không dùng `db:reset` cho onboarding. Nếu cần mock thanh toán cho dev, cấu hình cả BE/FE theo `.env.example` và config SePay, chỉ trong local.

### Bước 2 — Đồng bộ contract trước khi thêm màn hình

- Lập bảng method/path/role/request/response/action cho từng màn admin, đối chiếu app.ts + router + Zod + service.
- Hoàn thiện Swagger thiếu/sai, lấy snapshot từ BE local đúng commit, review/cập nhật `workflow-contract-overrides.json`, rồi chạy `npm run generate:api` tại FE và review diff. Không dùng cờ `--live` khi mục tiêu là contract BE local: cờ này đang tải Render cố định.
- Sửa STAFF, sports, multi-coach, invoices, membership cũ và nút tạo khóa/lịch sai quyền. Không chỉ sửa types bằng ép kiểu để build qua.
- Giữ React/Vite/Query và shell hiện tại; không chuyển framework hay tạo FE thứ hai chỉ để làm admin.

### Bước 3 — Users và phòng

- Hoàn thiện list/detail/create/update/khóa/mở khóa; bảo vệ self/last manager; hiển thị lỗi có ý nghĩa.
- Thêm admin reset ở BE rồi nối UI. Endpoint đặt tên cụ thể sau khi team chốt; mọi endpoint đề xuất trong tài liệu chưa phải API đã tồn tại.
- Hoàn thiện Room CRUD theo ràng buộc lịch. Feature xong phải chạy được với API thật local trước khi sang module mới.

### Bước 4 — Duyệt HLV, khóa và quản lý lịch

- CV pending → xem PDF có auth → approve/reject kèm lý do.
- Class pending → xem nội dung/giá/lịch/HLV → approve/reject; Coach gửi lại sau sửa.
- Nếu chốt Manager toàn quyền lịch: sửa middleware + service guards + test quyền và hậu quả nghiệp vụ, sau đó nối calendar/form.

### Bước 5 — Shop, tiền và báo cáo

- Product CRUD → inventory adjustment/history → order list/detail/status/pickup. Dùng `/shop/manage/*` hiện có, không tự cập nhật kho trực tiếp từ FE.
- Refund review và withdrawal review: hiển thị người nhận, số tiền, lý do, trạng thái, kết quả chuyển tiền ngoài hệ thống; BE kiểm transition/idempotency.
- Sửa và test report hoàn tiền; bổ sung KPI còn thiếu; CSV từ dữ liệu thực.
- Thêm audit cho hành động đổi role/khóa/reset/duyệt/tiền/tồn kho ở phía BE. Audit phải ghi actor, action, entity, thời điểm và thay đổi an toàn; không log password/token/CV nguyên bản.

### Bước 6 — Nghiệm thu tích hợp

- FE: `npm run typecheck`, `npm run build`, `npm test`; browser tests hiện có cần cập nhật fixtures theo contract mới trước khi tin kết quả.
- BE: `npm run build`; các E2E phù hợp, `npm run test:local` cho nhóm local và kiểm tra riêng nhóm enrollment/payment đang nằm ở script khác.
- Chạy trên DB test riêng: manager CRUD/khóa; member/coach bị 403 ở API quản trị; token/role change; trùng email/phone; chồng lịch; hoàn/rút hai lần; tồn kho; refund qua hai kỳ; refresh/deep link web.
- Chạy luồng liên ứng dụng: Coach tạo khóa trên Mobile → Manager duyệt trên web → Member mua → điểm danh → hoàn tiền hoặc kết thúc → HLV rút → Manager xử lý.
- Static host cần rewrite SPA; BE dùng migration deploy và env đúng môi trường. Kiểm local/staging trước khi publish.

Ước lượng lập kế hoạch, không phải cam kết: nếu một người có nền React/TS, dành khoảng 1–2 ngày onboarding/contract, 3–5 ngày module người dùng/phòng, 3–5 ngày khóa/lịch/duyệt, 3–5 ngày shop/tiền/report, 2–3 ngày tích hợp. Thay đổi nghiệp vụ và lỗi baseline có thể làm dài hơn; chưa nên chốt deadline chỉ từ audit tĩnh.

## 7. Claude Code: cấu hình vừa đủ

Repo đã có `.claude/skills/` với frontend-design, ui-ux-pro-max, impeccable, system-design, skill-creator, skill-development, agent-development, plugin-structure, memory-management, claude-api và hai skill Flutter. Có `.claude/agents/impeccable-*.md`. Đợt audit này chỉ kiểm kê, chưa đánh giá đầy đủ tính an toàn/chất lượng/tính chạy được của từng skill. `skills-lock.json` chỉ ghi hai skill Flutter, không phải danh mục đầy đủ của `.claude/skills/`.

Chưa thấy CLAUDE.md/rules/settings project. `.ai/mcp/mcp.json` có file nhưng rỗng; sự hiện diện không chứng minh Claude đã nối MCP. MCP có thể được cấu hình ở user scope ngoài repo, chưa kiểm tra.

| Thành phần | Mục đích | Đề xuất |
|---|---|---|
| CLAUDE.md | Kiến thức ổn định và nguyên tắc chung | Stack, role, nguồn sự thật, commands, phạm vi |
| `.claude/rules/*.md` | Quy tắc theo chủ đề/đường dẫn | BE, FE, bảo vệ contract Mobile |
| Skill | Quy trình dùng khi có task phù hợp | Một workflow thực hiện feature admin |
| Plugin | Gói skill/agent/hook/MCP | Chỉ thêm khi có nhu cầu cụ thể |
| MCP | Công cụ kết nối browser/service/dữ liệu | Browser automation khi cần, DB dev khi thật sự cần |

Ưu tiên custom context + workflow theo repo; bộ skill UI đã có đủ để bắt đầu. Không cần cài lại skill frontend-design trùng tên. `claude-api` chỉ hữu ích khi tích hợp API Claude, không giúp thay thế hiểu nghiệp vụ gym. Hai skill Flutter dành cho sửa Mobile, không phải lựa chọn chính cho React admin. Chọn một hướng dẫn UI chủ đạo để tránh chỉ dẫn thiết kế xung đột.

### Mẫu CLAUDE.md để anh tự tạo ở root

```markdown
# Sports Center Management System
- Trả lời bằng tiếng Việt. Phạm vi công việc chính: FE web Manager và BE liên quan.
- Đọc BE/README.md trước khi sửa BE; đọc source hiện tại khi tài liệu mâu thuẫn.
- BE: Express 5, TS NodeNext, Prisma/PostgreSQL. FE: React/Vite/Query.
- Roles hiện tại: MEMBER, COACH, MANAGER; admin là MANAGER.
- Nguồn sự thật: schema + mounted routes + Zod + services; Swagger phải được đồng bộ.
- Không đoán endpoint, không dùng contract FE cũ làm bằng chứng BE còn hỗ trợ.
- Bảo toàn contract Mobile; thay đổi response cần mô tả tác động và kiểm hồi quy.
- Phân quyền, tiền, kho và trạng thái được kiểm ở BE.
- Không đọc/in secrets. Không migration/seed/reset trên DB dùng chung khi chưa được giao.
- Không tự commit/push/deploy. Không format/refactor ngoài phạm vi.
- Trước khi báo xong: nêu file đổi, hành vi, kiểm tra đã chạy và giới hạn.
- Kiểm FE: typecheck, build, test. Kiểm BE: build và E2E liên quan trên DB local test.
```

CLAUDE.md là hướng dẫn cho mô hình, không phải cơ chế cưỡng chế quyền. Quyền tool thực tế cấu hình trong settings/permissions. Không bật bypass permissions như cấu hình mặc định.

### Mẫu rule riêng cho BE

Tạo `.claude/rules/backend.md`:

```markdown
---
paths:
  - "BE/**/*.ts"
  - "BE/prisma/**"
---
- Dùng khuôn routes/controller/service/schema sẵn có; import tương đối có .js.
- Dùng Prisma singleton; request qua Zod; response qua helper chuẩn.
- Kiểm role ở route và ownership/state trong service.
- Khi đổi nhiều bảng, dùng transaction; giữ thứ tự lock trong utils/dbLocks.ts.
- Không hard-delete dữ liệu có lịch sử nghiệp vụ.
- Cập nhật Swagger và test quyền/nghiệp vụ khi đổi API.
```

Rule FE tương tự với paths `FE/src/**`: dùng Query cho server state, API client hiện có, cập nhật metadata/types cùng contract, đủ loading/error/empty/pending; không tính tiền/quyền thật ở client. Không cần đưa cả audit dài vào CLAUDE.md.

### Tự thêm một skill

Vị trí project: `.claude/skills/<ten-skill>/SKILL.md`. Vị trí cá nhân trên Windows: `%USERPROFILE%\.claude\skills\<ten-skill>\SKILL.md`. Skill project có thể commit cho team; skill cá nhân áp dụng cho nhiều repo. Thư mục `.agents/skills` không nên được mặc định xem là bản skill Claude đã nạp; repo này đã có bản trong `.claude/skills`.

Ví dụ tạo `.claude/skills/scms-admin-feature/SKILL.md` với nội dung:

```markdown
---
name: scms-admin-feature
description: Implement or repair a Sports Center Manager feature across the React web and shared Express backend.
---
1. Read CLAUDE.md and the existing module closest to the requested feature.
2. Inspect Prisma, mounted routes, authorization, Zod and services; list real contracts.
3. Identify missing backend behavior and Mobile compatibility impact.
4. Implement the smallest complete feature, including Swagger and FE contract updates.
5. Verify permissions, invalid states and repeated actions where relevant.
6. Run available checks; report evidence and remaining limitations honestly.

Task: $ARGUMENTS
```

Trong phiên Claude mở từ root repo, gọi `/scms-admin-feature Hoàn thiện quản lý người dùng theo BE hiện tại`. Kiểm tra skill xuất hiện trong danh sách lệnh; nếu chưa, khởi động phiên mới từ đúng root. Mô tả trigger nên cụ thể, tránh tự kích hoạt trên mọi task. Đây là mẫu trong tài liệu, chưa cài thành skill thực tế ở checkout.

### Lấy skill/plugin ở đâu và cài thế nào

- Skill từ [anthropics/skills](https://github.com/anthropics/skills): đọc nội dung, copy cả thư mục skill cùng references/scripts cần thiết vào `.claude/skills/`. Không chỉ copy SKILL.md nếu nó phụ thuộc file khác. Đọc license; ghi repo/commit nguồn khi đưa vào team.
- Plugin từ [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official). Trong Claude Code chạy `/plugin`, xem Discover và chọn nhu cầu thực tế. Ví dụ tìm plugin hỗ trợ review hoặc browser automation khi cần kiểm UI; xác minh tên/nguồn trên catalog thay vì copy tên từ bài viết cũ.
- Nếu marketplace chính thức chưa có, trong Claude Code chạy `/plugin marketplace add anthropics/claude-plugins-official`, rồi cài qua Discover hoặc `/plugin install <ten-plugin>@claude-plugins-official` với tên thật từ catalog.
- Plugin project ghi cấu hình chia sẻ; credential và settings cá nhân không commit. Không xem việc chép thư mục plugin vào skills là cài đủ plugin.
- Kiểm `/mcp` để biết kết nối nào thực sự hoạt động; file cấu hình rỗng trong repo không cung cấp công cụ.

Nguồn chính thức đã đối chiếu ngày audit: [Skills](https://code.claude.com/docs/en/skills), [CLAUDE.md và rules](https://code.claude.com/docs/en/memory), [Plugin installation](https://code.claude.com/docs/en/discover-plugins). Giao diện/tính năng có thể khác theo phiên bản Claude Code; kiểm bản cài thực tế trước khi dùng tính năng mới.

## 8. Cách giao việc cho Claude và review

Mỗi task chọn một feature hoàn chỉnh thay vì yêu cầu “làm toàn bộ admin”. Mẫu prompt:

```text
Đọc CLAUDE.md và Doc/ADMIN_WEB_AUDIT_AND_PLAN.md.
Task: hoàn thiện quản lý người dùng cho MANAGER.
Đối chiếu BE users routes/Zod/service với FE hiện tại trước khi sửa.
Tiêu chí: list/detail/create/update/khóa/mở khóa hoạt động với BE local;
không có STAFF nếu BE không hỗ trợ; self/last manager được bảo vệ;
MEMBER/COACH gọi API quản trị bị từ chối; lỗi validation hiện rõ trên form.
Giữ kiến trúc hiện tại và contract Mobile, không sửa module không liên quan.
Kiểm tra có sẵn, báo rõ kết quả. Không deploy hoặc tác động DB dùng chung.
```

Sau mỗi feature: đọc diff → chạy local → thử quyền sai và trạng thái lỗi → chạy check liên quan → commit nhỏ theo quy ước team. Chỉ chuyển feature khi đã có bằng chứng chạy với API thật local; test UI mock là một lớp kiểm tra riêng.
