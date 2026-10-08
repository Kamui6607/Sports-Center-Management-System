# Sports Center Management System - Backend

REST API (Express 5 + TypeScript + Prisma/PostgreSQL) cho hệ thống quản lý trung tâm thể thao: người dùng, lớp học & lịch, đặt chỗ, điểm danh, thanh toán (SePay VietQR), hóa đơn, báo cáo, chat, thông báo.

> **Dành cho AI agent / dev mới:** đọc mục [Quy ước code (BẮT BUỘC đọc trước khi sửa)](#-quy-ước-code-bắt-buộc-đọc-trước-khi-sửa) và [Nguồn sự thật & những thứ KHÔNG được giả định](#-nguồn-sự-thật--những-thứ-không-được-giả-định) TRƯỚC khi viết code. Các quy ước được rút ra từ code thật; nếu thấy code lệch README thì **code thắng** — hãy sửa README luôn trong cùng thay đổi.

## 🚀 Technologies

- **Runtime:** Node.js (ESM, `module: NodeNext`)
- **Framework:** Express.js v5
- **Language:** TypeScript (`strict: true`)
- **Database / ORM:** PostgreSQL + Prisma 5 (`@prisma/client` ^5.22)
- **Validation:** Zod 3
- **Auth:** JWT Access + Refresh token (`jsonwebtoken`), mật khẩu `bcryptjs`
- **Realtime:** Socket.IO (chat)
- **Upload:** Multer (+ Cloudinary tùy chọn cho avatar)
- **Docs:** swagger-jsdoc + Swagger UI
- **Tooling:** `tsx` chạy dev, `helmet`, `cors`, `morgan`

## 📦 Cấu trúc thư mục

```
.
├── prisma/
│   ├── schema.prisma         # Nguồn sự thật của DB
│   ├── migrations/           # Migration (timestamp_snake_case)
│   └── seed.ts
├── src/
│   ├── config/               # env, prisma singleton, swagger, sepay, storage, attendance
│   ├── middlewares/          # authenticate, authorize, validate, errorHandler, upload
│   ├── modules/<tên>/        # Mỗi tính năng một thư mục (xem quy ước bên dưới)
│   ├── types/                # express.d.ts (req.user), base-entity.ts (BaseEntity)
│   ├── utils/                # response, pagination, jwt, bcrypt, hashToken, dbLocks, mail, fileSignature, storage, roles
│   ├── app.ts                # Khởi tạo Express, mount routes
│   └── server.ts             # Entry: connect DB, Socket.IO, worker outbox
├── tests/                    # Script e2e chạy bằng tsx (cần DB thật)
└── uploads/                  # File upload local (avatars công khai; chat/cvs riêng tư)
```

Các module đang được mount trong `src/app.ts` (prefix `/api/v1`): `auth`, `users`, `members`, `coaches`, `sports`, `rooms`, `classes`, `class-schedules`, `enrollments`, `payments`, `invoices`, `reports`, `products`, `chat`, `attendance`, `training-plans`, `notifications`, `feedbacks`.
Logic ví HLV nằm ở `coaches/coach-wallet.*`.

---

## 📐 Quy ước code (BẮT BUỘC đọc trước khi sửa)

### 0. Nguyên tắc chung

1. **Bắt chước module sẵn có.** Trước khi thêm tính năng, mở một module tương tự (mẫu gọn nhất: `modules/sports/`; mẫu có transaction/lock/outbox: `modules/enrollments/enrollments.service.ts`) và làm đúng cùng khuôn.
2. **Đọc trước, sửa sau.** Không đoán tên hàm/field/route. `grep` code hoặc đọc `prisma/schema.prisma` để xác nhận trước khi dùng. Không bịa model, enum, endpoint, biến môi trường.
3. **Sửa tối thiểu, đúng chỗ.** Chỉ đụng file liên quan tới yêu cầu. Không refactor/format lại hàng loạt file khác.
4. **Sửa trực tiếp file nguồn.** KHÔNG tạo script vá kiểu `fix_*.js`, `modify*.py`, regex find-and-replace chạy lên `src/` (xem [Nguồn sự thật](#-nguồn-sự-thật--những-thứ-không-được-giả-định)). Muốn đổi gì thì dùng công cụ sửa file/đọc diff.
5. **Kiểm tra trước khi báo xong:** chạy `npx tsc --noEmit` (kết quả phải không có lỗi MỚI do thay đổi của bạn) và, nếu đụng luồng nghiệp vụ đã có e2e, chạy script e2e tương ứng (xem mục 10).
6. **File mới luôn lưu UTF-8.**

### 1. Cấu trúc một module

Mỗi tính năng nằm ở `src/modules/<tên-kebab-case>/` với các file (tên file dạng `<tên>.<vai-trò>.ts`):

| File | Vai trò |
|---|---|
| `<tên>.routes.ts` | Khai báo route + middleware + **Swagger JSDoc**. `export default router`. |
| `<tên>.controller.ts` | Mỏng: nhận `req`, gọi service, trả response chuẩn. |
| `<tên>.service.ts` | Toàn bộ nghiệp vụ + truy cập Prisma. |
| `<tên>.schema.ts` | Zod schema + `export type ...Input = z.infer<...>`. |

Module phức tạp được tách thêm service theo chủ đề (VD `attendance-penalties.service.ts`, `enrollment-quota.service.ts`, `sepay-payments.service.ts`, `sepay-api.client.ts`, `chat.socket.ts`) — vẫn giữ quy tắc đặt tên `<chủ-đề>.<vai-trò>.ts`.

Thêm module mới ⇒ (a) tạo 4 file trên, (b) `import` + `app.use("/api/v1/<tên>", <tên>Routes)` (theo kiểu hiện có trong `app.ts`, biến `v1`) trong `src/app.ts`, (c) thêm `tags` (và response `$ref` dùng chung nếu cần) trong `src/config/swagger.ts`.

### 2. Import

- Dự án chạy ESM `NodeNext` ⇒ **mọi import tương đối phải có đuôi `.js`** dù file nguồn là `.ts`:
  `import { prisma } from "../../config/prisma.js";`
- Import kiểu thuần: `import type { ... }`.
- Dùng namespace import cho service trong controller: `import * as sportsService from "./sports.service.js";`
- Chỉ dùng **một** Prisma client: `import { prisma } from "<…>/config/prisma.js"`. **Không** `new PrismaClient()` ở nơi khác.

### 3. Routes (`*.routes.ts`)

Thứ tự middleware cố định: `authenticate` → `authorize(...roles)` → `validate(Schema[, "body"|"query"|"params"])` → controller.

```ts
router.post(
  "/",
  authenticate,
  authorize("MANAGER"),
  validate(CreateSportSchema),
  sportsController.createSport
);
router.get("/", validate(SportQuerySchema, "query"), sportsController.listSports); // route công khai
```

- Role hợp lệ (bảng `Role`, `User.roleId`; tên role dùng chung ở `src/utils/roles.ts`): `MEMBER`, `COACH`, `MANAGER`. Mặc định mọi route cần Bearer token; route công khai khai báo `security: []` trong Swagger **và** không gắn `authenticate`.
- `authenticate` kiểm tra lại DB mỗi request (user tồn tại, `isActive`, role không đổi) rồi gán `req.user = { id, role }`. `authenticateIncludingInactive` chỉ dành cho luồng Coach nộp CV (tài khoản chưa duyệt) — đừng dùng bừa.
- Phân quyền theo **dữ liệu** (VD "member chỉ hủy được đặt chỗ của chính mình") phải kiểm tra trong service bằng `req.user.id` truyền xuống — `authorize` chỉ lo role.
- Mỗi route **phải có comment `@swagger`** ngay phía trên (tag, summary, parameters/requestBody, responses). Response lỗi/ok dùng `$ref: "#/components/responses/<Tên>"` đã định nghĩa trong `src/config/swagger.ts`; thiếu thì thêm vào đó. Swagger quét `./src/modules/**/*.routes.ts`. Path trong Swagger **không** có prefix `/api/v1` (đã nằm trong `servers`).
- Route tĩnh (`/me`, `/generate-qr`…) phải khai báo **trước** route động `/:id`.

### 4. Controllers (`*.controller.ts`)

Mẫu duy nhất đang dùng — mỗi handler `async`, bọc `try/catch`, lỗi chuyển `next(err)`, không chứa nghiệp vụ:

```ts
export async function getSportById(req: Request, res: Response, next: NextFunction) {
  try {
    const sport = await sportsService.getSportById(req.params.id as string); // Express 5: params là string | string[]
    sendSuccess(res, sport, "Sport retrieved successfully");
  } catch (err) { next(err); }
}
```

- Trả response **chỉ** qua `sendSuccess` / `sendCreated` / `sendError` (`src/utils/response.ts`). Không `res.json({...})` thủ công (ngoại lệ duy nhất hiện có: health check và 404 trong `app.ts`).
- Danh sách có phân trang: `sendSuccess(res, items, msg, 200, pagination)`.
- Tạo mới trả `201` qua `sendCreated`. Xóa mềm trả `200` kèm bản ghi đã cập nhật.
- Lấy user hiện tại từ `req.user!.id` / `req.user!.role` (kiểu khai báo ở `src/types/express.d.ts`).

### 5. Validation (Zod)

- Mọi input từ client (`body`, `query`, `params`) đi qua `validate()`; schema đặt trong `<tên>.schema.ts`.
- Query string luôn là chuỗi ⇒ khai báo `z.string().optional()` rồi parse trong service (`page`, `limit`, `isActive: "true"|"false"`). Enum thì dùng `z.enum([...])`.
- Lỗi validate trả `400` dạng `{ success:false, message:"Validation failed", errors:[{field, message}] }`. `validate` ghi đè `req.body/params/query` bằng dữ liệu đã parse (key lạ bị loại) và gán `req.validated`.
- Export type bằng `z.infer` và dùng cho tham số service (xem `members.schema.ts` + `members.service.ts`) — **ưu tiên cách này, tránh `data: any`**. (Một số service cũ như `sports.service.ts` đang dùng `any`; đừng nhân rộng.)
- Muốn Zod giữ chặt dữ liệu vào DB thì thêm ràng buộc thực sự (min/max/regex) — ví dụ `phone` trong `members.schema.ts`.

### 6. Services & Prisma

- **Lỗi nghiệp vụ**: `throw new AppError(message, statusCode, errors?)` (từ `middlewares/errorHandler.js`). Không `res.status(...)` trong service. Mã thường dùng trong code: `400` input/nghiệp vụ sai, `401`, `403`, `404` không thấy, `409` trùng/xung đột trạng thái.
- `errorHandler` đã tự map: Prisma `P2002`→409, `P2025`→404, `P2003`→400, `P2014`→400, JSON hỏng→400, còn lại→500 `"Internal server error"`. Đừng bắt lại những lỗi này nếu không cần thông điệp riêng.
- **Phân trang**: chuẩn hiện có — `page` mặc định 1, `limit` mặc định 10, kẹp trong `[1, 100]`, chạy song song `Promise.all([count, findMany])`, trả `buildPaginationMeta(total, page, limit)` từ `utils/pagination.js`.
  ```ts
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  ```
- **Xóa mềm** là mặc định cho thực thể có `isActive` (VD `deleteSport` đặt `isActive=false` và chặn nếu còn Class active). Không `delete` cứng bản ghi có liên kết nghiệp vụ.
- Cập nhật **nhiều bảng phải atomic** ⇒ `prisma.$transaction(async (tx) => { ... })` và truyền `tx` xuống các hàm con (helper nhận `db: typeof prisma | Prisma.TransactionClient`).
- Dùng `select`/`include` có chủ đích; **không bao giờ trả `password`** hoặc token hash ra response (xem `memberInclude` trong `members.service.ts` — chỉ select các cột an toàn của `user`).
- Tiền dùng `Decimal(12,2)` trong schema; ID là `String @default(uuid())`.
- Thời gian lưu UTC (`DateTime`); khi format cho người dùng VN dùng `toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })` như code hiện có.

### 7. Đồng thời (concurrency) — luồng đặt chỗ / thanh toán

Đây là phần dễ làm hỏng nhất; đọc `src/utils/dbLocks.ts` trước khi sửa:

- Mọi luồng đặt chỗ / đổi chỗ / hình phạt chuyên cần phải lock theo **thứ tự cố định**: `lockMemberQuota` → `lockMemberClass` → `lockSchedule` (nhiều buổi: `lockSchedules`, đã tự sort). **Không bao giờ đảo thứ tự** (deadlock).
- Lock là advisory lock theo transaction (`pg_advisory_xact_lock`) ⇒ **chỉ hợp lệ bên trong `$transaction`**, tự nhả khi commit/rollback.
- **Đọc lại dữ liệu SAU khi lock** (xem comment A12 trong `bookClass`): đừng dùng object đã đọc trước transaction để quyết định.
- Webhook thanh toán dùng `lockPaymentWebhook(paymentId)` — lock riêng, KHÔNG nằm trong chuỗi lock enrollment.
- Thêm kiểu lock mới ⇒ ghi thứ tự vào comment đầu `dbLocks.ts`.

### 8. Thông báo (Notification) — dùng Outbox khi gắn với transaction

- Thông báo phải đi cùng một thay đổi dữ liệu trong transaction ⇒ `enqueueNotification(tx, {...})` **bên trong** transaction, rồi `await flushNotificationOutbox().catch(() => {})` **sau khi commit** (xem `bookClass`). Worker trong `server.ts` flush định kỳ làm lưới an toàn.
- Thông báo không quan trọng/không liên quan transaction: `createNotification(...).catch(() => {})` (fire-and-forget, không `await` để khỏi chặn response; luôn `.catch`).
- Loại thông báo mới ⇒ thêm vào **cả** `enum NotificationType` (schema.prisma, cần migration) **và** union `NotificationTypeEnum` trong `notifications.service.ts`.

### 9. Prisma schema & migration

- **BaseEntity**: MỌI model phải có đủ 3 field, đúng định nghĩa:
  `id String @id @default(uuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @default(now()) @updatedAt`.
  Prisma không có kế thừa model nên tự khai báo trong từng model; thêm model mới thì thêm luôn vào `BaseEntityModels` trong `src/types/base-entity.ts` — thiếu là `npx tsc --noEmit` báo lỗi. SQL thô (`$executeRaw`) cập nhật bảng thì tự set `"updatedAt" = NOW()` (Prisma chỉ tự cập nhật khi đi qua client).
- **Vai trò (Role)**: vai trò nằm ở bảng `Role` (`User.roleId` → `Role.id`), KHÔNG có enum/cột `role` dạng chuỗi trên `User`. Dùng helper trong `src/utils/roles.ts`: lọc `where: { role: { name: "COACH" } }`, lấy tên `select: { role: ROLE_NAME_SELECT }` ⇒ `user.role.name`, gán `role: connectRole("MEMBER")`, trả cho FE `flattenRole(user)` (API vẫn trả `role: "COACH"`). `req.user.role` (từ JWT) đã là chuỗi `RoleName`.
- **Hồ sơ chứng nhận Coach (CV)**: nằm ở bảng `Certification` (1–1 với `CoachProfile`), KHÔNG còn `cvUrl`/`approvalStatus` trên CoachProfile. Nộp lại CV ⇒ ghi đè `fileUrl`, status về PENDING. Response vẫn trả `coachProfile.cvUrl` + `approvalStatus` qua helper `src/utils/certification.ts` (`withCvFields` / `withUserCvFields`).
- Sửa `prisma/schema.prisma` rồi tạo migration bằng `npm run db:migrate` (tức `prisma migrate dev`); tên migration `snake_case` mô tả thay đổi, thư mục tự có timestamp. Commit cả `migration.sql`.
- **Không sửa migration đã tồn tại/đã áp dụng**; muốn đổi thì tạo migration mới. Đổi cột `NOT NULL` trên bảng có dữ liệu: làm 2 bước (thêm nullable → backfill → ép bắt buộc), như cặp migration `add_area_type_nullable` / `enforce_area_type_required`.
- Thêm `@@index` cho cột dùng để lọc/join thường xuyên; đặt `@@unique` để chặn trùng ở tầng DB thay vì chỉ kiểm tra trong code (bài học từ `SepayWebhookEvent.sepayId`, `Enrollment[memberId, scheduleId]`).
- Sau khi đổi schema: `npm run db:generate`, rồi `npx tsc --noEmit` để bắt chỗ code còn dùng model/enum đã đổi.
- `prisma.config.ts` đọc `DATABASE_URL` từ `.env`; không hard-code connection string.

### 10. Test

- Hiện **không có** unit test framework. Test là các script e2e thật (HTTP + PostgreSQL) trong `tests/*.e2e.ts`, chạy bằng `tsx` qua `npm run test:e2e*` (xem `package.json`). Chúng import `app` từ `src/app.js`, dùng `prisma` thật ⇒ **cần DB dev**, tuyệt đối không chạy trên DB production.
- Viết test mới: copy cấu trúc một file e2e (VD helper `http()`, `check()`, hậu tố `RUN = Date.now().toString(36)` để dữ liệu không đụng nhau), thêm script vào `package.json` và vào `test:e2e:all`.
- Đổi hành vi luồng thanh toán SePay / đặt chỗ / quota / điểm danh / chat đính kèm ⇒ chạy e2e tương ứng (`test:e2e:sepay`, `test:e2e`, `test:e2e:course`, `test:e2e:attendance`, `test:e2e:chat`).

### 11. Biến môi trường & cấu hình

- Biến bắt buộc đọc qua `src/config/env.ts` (`required("KEY")` ném lỗi khi thiếu). Biến lõi: `PORT`, `DATABASE_URL`, `JWT_*`, `BREVO_*` (SMTP_* là dự phòng), `FRONTEND_URL`. Thêm biến lõi ⇒ thêm vào `env.ts` **và** README mục Environment Variables.
- Cấu hình theo tính năng nằm file riêng trong `src/config/` (`sepay.ts`, `storage.ts`, `attendance.ts`…), có giá trị mặc định tại đó. Không rải `process.env.X` khắp service.
- **Không commit `.env`** (đã trong `.gitignore`), không in secret ra log, không hard-code secret/API key vào code hay README.
- `SEPAY_MOCK_MODE=true` chỉ cho dev/demo/e2e; `server.ts` sẽ thoát (fail-fast) nếu bật ở `NODE_ENV=production`. Đừng gỡ chốt này.

### 12. Upload file & bảo mật

- Dùng các wrapper trong `middlewares/upload.ts` (`avatarUpload`, `chatUploadSingle`, `cvUpload`); chúng dịch lỗi Multer thành `AppError 400` để response vẫn thống nhất. Không dùng `multer` trực tiếp trong route.
- Tên file lưu trên disk do **server sinh** (UUID + đuôi theo MIME), không dùng tên client. Avatar còn kiểm **chữ ký thật** của ảnh (`utils/fileSignature.ts`) chứ không tin `mimetype`.
- Chỉ `uploads/avatars` được serve tĩnh công khai (`app.ts`). File chat/CV là riêng tư: phải tải qua API có xác thực + phân quyền, **không** thêm `express.static` cho các thư mục đó.
- Giới hạn kích thước: avatar 5MB; chat/CV 10MB.
- Mọi API dưới `/api/v1` gửi `Cache-Control: no-store`; giữ nguyên.

### 13. Thanh toán SePay — đừng đụng nếu chưa đọc

- Idempotent theo thiết kế: `SepayWebhookEvent.sepayId` UNIQUE, `SepayBankTransaction` là ledger chống cấp quyền 2 lần, `Payment.activationStatus` tách khỏi `Payment.status` (tiền ≠ quyền).
- `app.ts` giữ `req.rawBody` (qua `express.json({ verify })`) để verify chữ ký HMAC trên **raw body**. Đừng đổi thứ tự/cấu hình `express.json` hay re-serialize body.
- Tiền về mà không kích hoạt được (lệch tiền, về muộn, trùng) ⇒ **ghi vết để đối soát tay, cố ý KHÔNG activate lần hai** (xem phần Troubleshooting bên dưới). Giữ nguyên hành vi này.
- Đọc `config/sepay.ts` và `tests/sepay-payment.e2e.ts` trước khi sửa `payments/sepay-*`.

### 14. Phong cách code

- TypeScript `strict`: không thêm `any`/`as any` mới nếu có thể suy kiểu hoặc dùng `z.infer`/Prisma types. Nếu buộc phải dùng, ghi comment lý do.
- Tên: file `kebab-case` (+ hậu tố vai trò), hàm/biến `camelCase`, type/schema `PascalCase` (schema Zod kết thúc bằng `Schema`, type suy ra kết thúc bằng `Input`), enum DB `PascalCase` với giá trị `UPPER_SNAKE_CASE`, hằng số `UPPER_SNAKE_CASE`.
- Dấu ngoặc kép `"..."`, có dấu chấm phẩy, thụt lề 2 space (đúng với code hiện có). Chưa có ESLint/Prettier trong repo ⇒ tự giữ đồng nhất với file đang sửa.
- Comment giải thích **vì sao** (ràng buộc nghiệp vụ, race condition, mã BR/A/F/D trong code). Comment/thông báo hiện **trộn tiếng Việt và tiếng Anh**: theo ngôn ngữ của khu vực code đang sửa; message trả cho người dùng cuối trong một endpoint nên nhất quán với các message cạnh nó.
- Không `console.log` dữ liệu nhạy cảm. Log lỗi dùng `console.error/warn` có tiền tố như code hiện có (`[ERROR]`, `[OUTBOX]`).
- Dùng lại helper trong `src/utils/` (`response`, `pagination`, `jwt`, `bcrypt`, `hashToken`, `mail`, `dbLocks`, `fileSignature`, `storage`) thay vì viết lại.

### 15. Checklist trước khi kết thúc một thay đổi

- [ ] Import tương đối có đuôi `.js`; dùng đúng `prisma` singleton.
- [ ] Route: đúng thứ tự `authenticate → authorize → validate → controller`, có `@swagger`.
- [ ] Input đi qua Zod; service nhận type suy ra, không để `any` mới.
- [ ] Lỗi nghiệp vụ dùng `AppError`; response dùng `sendSuccess/sendCreated/sendError`.
- [ ] Nhiều bước ghi DB ⇒ `$transaction`; luồng đặt chỗ ⇒ đúng thứ tự lock; notification ⇒ outbox nếu cùng transaction.
- [ ] Không rò `password`/token/secret; không commit `.env`.
- [ ] Đổi `schema.prisma` ⇒ có migration mới + `db:generate`.
- [ ] `npx tsc --noEmit` không phát sinh lỗi mới; e2e liên quan (nếu có) pass.
- [ ] README/Swagger được cập nhật nếu đổi API, biến môi trường hoặc quy ước.

---

## 🧭 Nguồn sự thật & những thứ KHÔNG được giả định

- **`prisma/schema.prisma` là nguồn sự thật về dữ liệu.** Chỉ dùng model/enum/field có trong đó. Hệ thống hiện tính tiền theo lớp (`Class` / `Enrollment` / `Payment`); **không có** `MembershipPlan`, `MembershipSubscription`, `MemberTier` — đừng viết code dùng chúng và đừng tự tạo lại. Nếu đoạn code/Swagger/seed cũ nào còn nhắc tới chúng thì coi là lỗi thời, không bắt chước.
- **Chỉ module được `app.use(...)` trong `src/app.ts` mới là API đang chạy.** Thư mục trong `src/modules/` chưa được mount (VD `wallets/`) không phải khuôn mẫu.
- **Không viết script vá/thay thế hàng loạt** (`fix_*.js`, `modify*.py`, regex chạy lên `src/`) và không để file tạm/backup (`.bak`, `*_errors.txt`) trong repo. Sửa trực tiếp file nguồn.
- **Không thêm `(prisma as any)`, `as any` để "lách" lỗi biên dịch.** Lỗi kiểu do schema/model không khớp thì sửa đúng nguồn (schema, import, kiểu), không ép kiểu cho qua.
- Hãy xác minh bằng `grep`/đọc file trước khi dựa vào bất kỳ tên hàm, route, biến môi trường nào; không có thì không bịa.

---

## 🧩 Nghiệp vụ cốt lõi: vai trò & lớp học

Nền tảng là nơi **Coach** và **Member** tương tác với nhau; **Manager** chỉ quản lý nền tảng.

- **Manager — quản lý nền tảng, KHÔNG tạo/đứng lớp:** duyệt CV Coach, duyệt/từ chối lớp (`PATCH /classes/{id}/review`), quản lý phòng, môn tập, sản phẩm, duyệt hoàn tiền và rút tiền ví Coach, xem báo cáo.
- **Chỉ Coach tạo lớp** (`POST /classes`, `POST /class-schedules/activity-plan`). Lớp mới ở trạng thái `PENDING`, Manager duyệt xong (`APPROVED`) thì Member mới mua được. Manager gọi API tạo lớp ⇒ 403.
- **Mỗi lớp đúng 1 Coach:** `Class.coachId` (bắt buộc) là Coach đã tạo và phụ trách lớp, nhận 85% doanh thu vào `CoachWallet`. **Không có** bảng `ClassMember`, không có HLV phụ/đổi HLV — đừng tạo lại.
- **Buổi học (`ClassSchedule`)** thuộc 1 lớp qua `ClassSchedule.classId`. **Chỉ Coach phụ trách lớp** được tạo/sửa/xóa/hủy/hoàn tất buổi (tạo buổi: lớp phải `APPROVED`); Manager gọi các API này ⇒ 403.
- **Đặt chỗ (`Enrollment`) theo TỪNG BUỔI:** chỉ lưu `memberId` + `scheduleId`. Lớp của một enrollment lấy qua `enrollment.schedule.classId` — **không có** `Enrollment.classId`. Lọc theo lớp thì dùng `where: { schedule: { classId } }`; Prisma `groupBy` không group theo quan hệ nên muốn đếm theo lớp thì `select: { schedule: { select: { classId: true } } }` rồi cộng dồn.
- **Kiểm tra quyền Coach trên lớp:** so `class.coachId === coachProfile.id` (hoặc `where: { coach: { userId } }`).

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database

### Installation

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add the following variables (adjust according to your setup):
   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:password@localhost:5432/sport_center?schema=public"
   JWT_ACCESS_SECRET="your_access_secret"
   JWT_REFRESH_SECRET="your_refresh_secret"
   JWT_ACCESS_EXPIRES_IN="15m"
   JWT_REFRESH_EXPIRES_IN="7d"

   # ── Email (Brevo Transactional API, gửi qua outbox có retry) ──
   # Ưu tiên Brevo; không có Brevo thì dùng SMTP dự phòng (bên dưới); không có cả hai: dev chỉ log cảnh báo, production báo lỗi để outbox retry.
   BREVO_API_KEY=""                    # Brevo → SMTP & API → API Keys
   BREVO_SENDER_EMAIL=""               # Phải là sender đã verify trên Brevo
   BREVO_SENDER_NAME="Gym Center"
   # Fallback SMTP (dev local, vd. Gmail App Password) — chỉ dùng khi KHÔNG có Brevo
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_SECURE="false"
   SMTP_USER=""
   SMTP_PASS=""
   SMTP_FROM=""                        # tuỳ chọn, mặc định = SMTP_USER
   FRONTEND_URL="http://localhost:3000"   # Base URL FE để dựng link reset password

   # ── Avatar upload storage (local | Cloudinary) ──
   # Bỏ trống cả 3 biến CLOUDINARY_* => avatar lưu local trong uploads/avatars (dev không cần cloud).
   # Điền đủ 3 biến => avatar tự động đẩy lên Cloudinary (resize 512x512, nén q_auto/f_auto, 1 asset/user).
   # Ghi đè tường minh bằng AVATAR_STORAGE="local" | "cloudinary".
   # Lấy cả 3 giá trị tại Cloudinary Console (console.cloudinary.com) → Settings (bánh răng) → API Keys
   CLOUDINARY_CLOUD_NAME=""            # "Cloud name" — chuỗi chữ thường/số, KHÁC display name trên Console
   CLOUDINARY_API_KEY=""
   CLOUDINARY_API_SECRET=""
   CLOUDINARY_FOLDER="sports-center/avatars"   # thư mục chứa avatar trên Cloudinary
   # Cách nhanh (thay cho 3 biến rời): dán nguyên dòng "API environment variable" trên Console:
   # CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
   # Ưu tiên: biến rời nào được set thì thắng phần tương ứng trong CLOUDINARY_URL (để trống/không khai báo thì lấy từ URL).

   # ── SePay online payment (chuyển khoản VietQR + webhook) ──
   # Hội viên tự mua gói: BE tạo đơn PENDING + mã thanh toán + ảnh VietQR;
   # SePay gọi webhook khi phát hiện giao dịch ⇒ BE kích hoạt gói + tạo hóa đơn + thông báo.
   SEPAY_WEBHOOK_API_KEY=""            # Phương thức API Key ở bước "Bảo mật" khi tạo webhook trên my.sepay.vn
   SEPAY_WEBHOOK_SECRET=""             # Phương thức HMAC-SHA256 (khuyến nghị) — Secret key ở cùng bước đó
   SEPAY_QR_BASE_URL="https://qr.sepay.vn/img"
   SEPAY_QR_TEMPLATE="compact"         # compact | qronly | standee | (trống = QR chuẩn VietQR)
   SEPAY_CODE_PREFIX="SEVQR"           # khớp "Cấu trúc mã thanh toán" trên my.sepay.vn (tiền tố 2-5 ký tự)
   SEPAY_CODE_SUFFIX_LENGTH="8"        # hậu tố số, SePay khuyến nghị 6-8
   VIETQR_BANK_ID="Sacombank"          # short_name/alias/code/BIN trong banks.json của SePay
   VIETQR_ACCOUNT_NO="123456789"       # số tài khoản (hoặc VA) nhận tiền
   VIETQR_ACCOUNT_NAME="NGUYEN VAN A"
   VIETQR_PAYMENT_TTL_MINUTES="15"
   SEPAY_MOCK_MODE="true"              # BẮT BUỘC false ở production
   # Đối soát chủ động qua SePay API v2 (tùy chọn — dùng khi webhook không tới được BE)
   SEPAY_API_TOKEN=""                  # my.sepay.vn → Cấu hình Công ty → API Access (Test mode có token riêng)
   SEPAY_API_BASE_URL="https://userapi.sepay.vn/v2"   # Test mode: https://userapi-sandbox.sepay.vn/v2
   SEPAY_RECONCILE_MIN_SECONDS="5"     # Khoảng cách tối thiểu giữa 2 lần đối soát cho cùng một đơn
   ```

   *SePay chi tiết:* https://developer.sepay.vn — cấu hình tại my.sepay.vn:
   1. **Cấu hình Công ty → Cấu trúc mã thanh toán**: tiền tố `SEVQR`, hậu tố 6-8 ký tự, Loại ký tự **Số nguyên**
      (khớp `SEPAY_CODE_PREFIX` / `SEPAY_CODE_SUFFIX_LENGTH`). Mã đơn BE sinh có dạng `SEVQR12345678`.
   2. **Webhook**: URL `http://<server>/api/v1/payments/sepay/webhook`, chọn xác thực ở bước Bảo mật:
       **HMAC-SHA256** (khuyến nghị): dán Secret key vào `SEPAY_WEBHOOK_SECRET` — SePay gửi header
       `X-SePay-Signature` + `X-SePay-Timestamp`, BE verify chữ ký trên raw body; hoặc **API Key**:
       dán key vào `SEPAY_WEBHOOK_API_KEY` (SePay gửi `Authorization: Apikey <key>`).
       Bật "Chỉ gửi khi có mã thanh toán: Tiền vào".
   Chạy localhost thì SePay **không gọi được** webhook ⇒ expose BE bằng ngrok, hoặc để `SEPAY_MOCK_MODE=true`
   và xác nhận giao dịch bằng `POST /payments/sepay/mock-confirm` (dev/demo/e2e).
   Giá trị mặc định của từng biến nằm trong `src/config/sepay.ts`.

   **Troubleshooting: đã chuyển khoản mà đơn vẫn `PENDING` (FE cứ "đang chờ ngân hàng xác nhận")**
   `Payment.status` CHỈ đổi khi BE nhận được webhook từ SePay (hoặc `mock-confirm`) — BE không tự dò
   biến động số dư. Chạy BE ở `localhost` thì SePay không gọi được vào máy bạn, nên đơn đứng nguyên
   `PENDING` (log BE chỉ có `GET /payments/sepay/{id}` lặp lại, KHÔNG có `POST /payments/sepay/webhook`).
   Checklist:

   1. Mở tunnel tới cổng BE rồi copy URL HTTPS:
      ```bash
      ngrok http 8080        # hoặc: cloudflared tunnel --url http://localhost:8080
      ```
   2. my.sepay.vn → Webhooks → sửa webhook → URL = `https://<tunnel>/api/v1/payments/sepay/webhook`
      → kiểm tra công tắc **Trạng thái = Bật** (lưu webhook không tự bật lại) → bật "Tự động gửi lại khi server trả lỗi".
   3. Bấm `⋯ → Gửi thử`: kết quả phải là **Thành công** (endpoint trả HTTP 200/201 + `{"success":true}`).
      Báo `Connection Refused` / `DNS Error` / `Timeout` ⇒ tunnel hoặc URL sai (SePay không đi tới localhost được).
   4. Kiểm tra `Webhooks → Lịch sử gửi` (HTTP status, `error_code`, response body) và `Sự cố`.
      SePay chỉ retry **7 lần trong ~33 phút**, sau đó đánh dấu Failed ⇒ nếu webhook đã bị mất, chạy lại
      tunnel rồi vào **Sự cố → Gửi lại** (hoặc `Lịch sử gửi → Phát lại`) để bắn lại đúng giao dịch đó.
   5. Không muốn dùng tiền thật: bật **Test mode** trên my.sepay.vn → tạo tài khoản ngân hàng Test mode với
      **đúng số tài khoản** trong `VIETQR_ACCOUNT_NO` → tạo webhook trỏ về URL tunnel → `Giao dịch → Mô phỏng`
      (số tiền phải khớp CHÍNH XÁC giá gói, nội dung chứa mã đơn `SEVQR…`). Test mode bỏ xác thực SSL nhưng
      vẫn cần URL public.
   6. Không dựng tunnel: `SEPAY_MOCK_MODE=true` (BE) + `VITE_SEPAY_MOCK_MODE=true` (FE) ⇒ trong modal hiện nút
      **"DEV: giả lập SePay đã thu tiền"** (gọi `/payments/sepay/mock-confirm`).
   7. **Không dựng tunnel vẫn muốn tiền thật tự chốt (khuyến nghị cho dev):** đặt `SEPAY_API_TOKEN`
      (my.sepay.vn → Cấu hình Công ty → API Access) ⇒ trong lúc FE polling `GET /payments/sepay/{id}`, BE gọi
      SePay API v2 tìm giao dịch khớp mã đơn ⇒ đơn tự chuyển `SUCCESS` sau ≤ 4 giây, **không cần webhook/ngrok**.
      Test mode dùng token riêng + `SEPAY_API_BASE_URL="https://userapi-sandbox.sepay.vn/v2"`.
      BE chỉ chốt khi khớp CHẶT mã đơn + số tiền + tài khoản nhận, có throttle `SEPAY_RECONCILE_MIN_SECONDS`
      (SePay giới hạn 3 request/giây) và chống chốt trùng bằng advisory lock.

   Khi tiền về nhưng KHÔNG kích hoạt được gói, BE ghi vết để đối soát thủ công và cố ý KHÔNG activate lần hai:
   lệch số tiền / tiền về sau khi đơn đã đóng ⇒ `Payment.note` + notification + `SepayWebhookEvent`
   (`MISMATCH` / `LATE`); đơn đã `SUCCESS` (VD đã chốt bằng mock/đối soát API) mà lại có thêm giao dịch khớp
   tiền ⇒ `SepayWebhookEvent` với `DUPLICATE / PAYMENT_ALREADY_PAID` (cần hoàn tiền nếu là lần chuyển thứ 2).
   Muốn đối soát tay, xem docs SePay → Đối soát giao dịch (`GET https://userapi.sepay.vn/v2/transactions`).

   *Avatar cloud (tùy chọn):* tạo tài khoản tại https://cloudinary.com (free 25GB) → mở Cloudinary Console
   (console.cloudinary.com) → **Settings (bánh răng) → API Keys** → copy `Cloud name`, `API Key`, `API Secret`
   → điền vào `.env` (hoặc Environment trên Render). Kiểm tra nhanh bằng `npm run test:cloudinary:check`.
   Khi đã có đủ credentials, `POST /api/v1/auth/me/avatar` tự động lưu ảnh lên Cloudinary (không cần đổi code);
   để trống thì ảnh vẫn lưu local trong `uploads/avatars/`. Xem `src/config/storage.ts`.

3. **Database Setup:**
   Run Prisma migrations to set up your PostgreSQL database schema:
   ```bash
   npm run db:migrate
   ```
   *(Optional)* Seed the database with initial data:
   ```bash
   npm run db:seed
   ```

### Running the Application

- **Development Mode:**
  ```bash
  npm run dev
  ```
  The server will start with hot-reloading using `tsx`.

- **Production Build:**
  ```bash
  npm run build
  npm start
  ```

## 📚 API Documentation

Once the server is running, you can view the interactive Swagger API documentation by navigating to:
👉 `http://localhost:<PORT>/api/v1/docs`

## 🗄️ Useful Prisma Scripts

- `npm run db:migrate` - Apply migrations to the database.
- `npm run db:generate` - Generate Prisma Client.
- `npm run db:studio` - Open Prisma Studio to view and edit data visually via browser.
- `npm run db:reset` - Reset the database and re-apply all migrations.

## 🤝 Project Flows

Các luồng đang có code trong repo: quản lý người dùng/hồ sơ (member, coach, manager), catalog (sports, rooms), lớp học & lịch, đặt chỗ/hủy/đổi chỗ kèm quota lớp song song, điểm danh (QR + mã dự phòng) và hình phạt chuyên cần, thanh toán SePay (VietQR + webhook + đối soát API) kèm hóa đơn, báo cáo, chat (REST + Socket.IO, file đính kèm riêng tư), thông báo (outbox), kế hoạch tập luyện, phản hồi HLV, sản phẩm.

*(AI Workouts / AI Assistant là kế hoạch tương lai.)*
