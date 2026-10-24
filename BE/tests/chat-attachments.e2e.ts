/**
 * E2E THẬT (HTTP + PostgreSQL) cho D03 — bảo mật tệp đính kèm chat:
 * 1) Upload chỉ nhận allowlist theo MIME + MAGIC BYTES; tên file do server sinh.
 * 2) Không phục vụ tĩnh công khai: tải qua `GET /api/v1/chat/attachments/:id`
 *    (yêu cầu đăng nhập; chủ file/người nhận/MANAGER; phòng chung = mọi user đăng nhập).
 * 3) Request bị từ chối (sai chữ ký/sai loại/người nhận sai) KHÔNG để lại file rác trên disk.
 * 4) Avatar kiểm tra chữ ký THẬT (file text đổi tên .png bị từ chối).
 *
 * Chạy: cd BE && npm run test:e2e:chat
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import type { AddressInfo } from "node:net";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/bcrypt.js";
import { CHAT_UPLOAD_DIR } from "../src/middlewares/upload.js";
import { avatarStorageDriver } from "../src/config/storage.js";

const RUN = Date.now().toString(36);
const PASSWORD = "E2eChat!2026";
const AVATAR_DIR = path.join("uploads", "avatars");

let baseUrl = "";

type HttpResult = { status: number; body: any; text: string };

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: unknown; form?: FormData } = {}
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/api/v1${urlPath}`, {
    method,
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.form ? {} : opts.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

/** GET ngoài /api/v1 (kiểm tra static /uploads có phục vụ công khai hay không). */
async function rawGet(urlPath: string): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}${urlPath}`);
  const text = await res.text();
  return { status: res.status, body: text, text };
}

/** GET attachment kèm token, trả cả contentType + bytes để kiểm tra chữ ký. */
async function fetchAttachment(
  token: string | undefined,
  url: string
): Promise<{ status: number; contentType: string | null; buffer: Buffer }> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType: res.headers.get("content-type"), buffer };
}

function countFiles(dir: string): number {
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
}

// ─── Report helpers ───────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function safe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function check(name: string, condition: boolean, detail?: unknown): boolean {
  if (condition) {
    passed++;
    console.log(`  [OK]   ${name}`);
  } else {
    const msg = `${name}${detail === undefined ? "" : ` — ${safe(detail)}`}`;
    failures.push(msg);
    console.log(`  [FAIL] ${msg}`);
  }
  return condition;
}


// ─── Fixture ──────────────────────────────────────────────────────────────
const created = {
  userIds: [] as string[],
  storedFiles: [] as string[],
  avatarFiles: [] as string[],
};

type FixtureUser = { id: string; email: string; token: string };

async function createUser(
  role: "MEMBER" | "COACH" | "MANAGER",
  tag: string,
  hashedPassword: string
): Promise<FixtureUser> {
  const email = `e2e-chat-${RUN}-${tag.toLowerCase()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: `E2E Chat ${tag} ${RUN}`,
      role,
      ...(role === "MEMBER" ? { memberProfile: { create: {} } } : {}),
      ...(role === "COACH" ? { coachProfile: { create: {} } } : {}),
      ...(role === "MANAGER" ? { managerProfile: { create: {} } } : {}),
    },
  });
  created.userIds.push(user.id);
  const login = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  const token = login.body?.data?.accessToken as string | undefined;
  if (login.status !== 200 || !token) {
    throw new Error(`Login failed for fixture ${email}: ${safe(login.body)}`);
  }
  return { id: user.id, email, token };
}

/** PNG 1x1 hợp lệ (đúng chữ ký magic bytes). */
function realPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

/** Buffer giả: nội dung text nhưng client khai là image/png. */
function fakePng(): Buffer {
  return Buffer.from("this is not an image, just text pretending to be png");
}

/** Blob chuẩn từ Buffer — tránh lỗi type `ArrayBufferLike` khi truyền Buffer trực tiếp vào Blob. */
function blobOf(buf: Buffer, type: string): Blob {
  return new Blob([Uint8Array.from(buf)], { type });
}

// ─── Cleanup ──────────────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  if (created.userIds.length > 0) {
    const rows = await prisma.chatAttachment.findMany({
      where: {
        OR: [{ ownerId: { in: created.userIds } }, { receiverId: { in: created.userIds } }],
      },
      select: { storedName: true },
    });
    for (const row of rows) created.storedFiles.push(row.storedName);

    await prisma.chatAttachment.deleteMany({
      where: {
        OR: [{ ownerId: { in: created.userIds } }, { receiverId: { in: created.userIds } }],
      },
    });
    await prisma.chatMessage.deleteMany({
      where: {
        OR: [{ senderId: { in: created.userIds } }, { receiverId: { in: created.userIds } }],
      },
    });
    await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  }

  for (const name of [...new Set(created.storedFiles)]) {
    try {
      fs.unlinkSync(path.join(CHAT_UPLOAD_DIR, path.basename(name)));
    } catch {
      /* file có thể đã bị xoá ở nhánh reject — bỏ qua */
    }
  }
  for (const name of [...new Set(created.avatarFiles)]) {
    try {
      fs.unlinkSync(path.join(AVATAR_DIR, path.basename(name)));
    } catch {
      /* bỏ qua */
    }
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────
async function scenarioPrivateAttachment(
  coach: FixtureUser,
  member1: FixtureUser,
  member2: FixtureUser
): Promise<void> {
  section("1) File chat riêng tư: KHÔNG còn public — chỉ owner/receiver tải được");
  const filesBefore = countFiles(CHAT_UPLOAD_DIR);

  const form = new FormData();
  form.set("receiverId", member1.id);
  form.set("content", `ảnh D03 ${RUN}`);
  form.set("file", blobOf(realPng(), "image/png"), "photo.png");
  const sent = await http("POST", "/chat/messages", { token: coach.token, form });
  check("Upload PNG hợp lệ coach → member → 201", sent.status === 201, sent.body);

  const fileUrl = String(sent.body?.data?.fileUrl ?? "");
  const messageId = String(sent.body?.data?.id ?? "");
  check(
    "fileUrl trỏ endpoint CÓ AUTH (/chat/attachments/…?name=…) thay vì /uploads/…",
    /\/api\/v1\/chat\/attachments\/[0-9a-f-]{36}\?name=/i.test(fileUrl),
    fileUrl
  );

  const attachment = await prisma.chatAttachment.findFirst({
    where: { messageId },
    select: { storedName: true, mimeType: true, ownerId: true, receiverId: true },
  });
  check(
    "DB: ChatAttachment gắn message + MIME thật image/png + đúng owner/receiver",
    Boolean(attachment) &&
      attachment!.mimeType === "image/png" &&
      attachment!.ownerId === coach.id &&
      attachment!.receiverId === member1.id,
    attachment
  );
  check(
    "Disk: file chat được ghi trong uploads/chat",
    countFiles(CHAT_UPLOAD_DIR) === filesBefore + 1,
    countFiles(CHAT_UPLOAD_DIR)
  );

  const publicTry = await rawGet(`/uploads/chat/${attachment!.storedName}`);
  check(
    "File chat KHÔNG còn phục vụ tĩnh công khai (404)",
    publicTry.status === 404,
    publicTry.status
  );

  const anonymous = await fetchAttachment(undefined, fileUrl);
  check("Tải không token → 401", anonymous.status === 401, anonymous.status);

  const outsider = await fetchAttachment(member2.token, fileUrl);
  check("User khác (không phải owner/receiver) → 403", outsider.status === 403, outsider.status);

  const receiver = await fetchAttachment(member1.token, fileUrl);
  check(
    "Receiver tải được → 200, đúng MIME + đúng chữ ký PNG",
    receiver.status === 200 &&
      String(receiver.contentType).includes("image/png") &&
      receiver.buffer.subarray(0, 8).equals(realPng().subarray(0, 8)),
    { status: receiver.status, contentType: receiver.contentType }
  );

  const owner = await fetchAttachment(coach.token, fileUrl);
  check("Owner (người gửi) tải được → 200", owner.status === 200, owner.status);
}

async function scenarioPublicRoomAttachment(coach: FixtureUser, member2: FixtureUser) {
  section("2) File trong PHÒNG CHUNG: mọi user đăng nhập tải được");
  const form = new FormData();
  form.set("content", `public ${RUN}`);
  form.set("file", blobOf(realPng(), "image/png"), "public.png");
  const sent = await http("POST", "/chat/messages", { token: coach.token, form });
  check("Upload vào phòng chung → 201", sent.status === 201, sent.body);
  const url = String(sent.body?.data?.fileUrl ?? "");
  const asOther = await fetchAttachment(member2.token, url);
  check("User khác tải file phòng chung → 200", asOther.status === 200, asOther.status);
}

async function scenarioRejectionsLeaveNoJunk(
  coach: FixtureUser,
  member1: FixtureUser
): Promise<void> {
  section("3) Upload bị từ chối → KHÔNG để lại file rác");
  const filesBefore = countFiles(CHAT_UPLOAD_DIR);
  const messagesBefore = await prisma.chatMessage.count({ where: { senderId: coach.id } });

  const fakeForm = new FormData();
  fakeForm.set("receiverId", member1.id);
  fakeForm.set("file", blobOf(fakePng(), "image/png"), "fake.png");
  const fake = await http("POST", "/chat/messages", { token: coach.token, form: fakeForm });
  check(
    "File giả PNG (text khai image/png) → 400 và dọn file vừa ghi",
    fake.status === 400 && countFiles(CHAT_UPLOAD_DIR) === filesBefore,
    { status: fake.status, files: countFiles(CHAT_UPLOAD_DIR) }
  );

  const textForm = new FormData();
  textForm.set("receiverId", member1.id);
  textForm.set("file", blobOf(Buffer.from("hello"), "text/plain"), "note.txt");
  const text = await http("POST", "/chat/messages", { token: coach.token, form: textForm });
  check(
    "Loại file ngoài allowlist (text/plain) → 400, không ghi file",
    text.status === 400 && countFiles(CHAT_UPLOAD_DIR) === filesBefore,
    { status: text.status, files: countFiles(CHAT_UPLOAD_DIR) }
  );

  const orphanForm = new FormData();
  orphanForm.set("receiverId", "00000000-0000-4000-8000-000000000000");
  orphanForm.set("file", blobOf(realPng(), "image/png"), "ok.png");
  const orphan = await http("POST", "/chat/messages", { token: coach.token, form: orphanForm });
  const messagesAfter = await prisma.chatMessage.count({ where: { senderId: coach.id } });
  check(
    "Người nhận không tồn tại → 404, dọn file, KHÔNG tạo message",
    orphan.status === 404 &&
      countFiles(CHAT_UPLOAD_DIR) === filesBefore &&
      messagesAfter === messagesBefore,
    { status: orphan.status, files: countFiles(CHAT_UPLOAD_DIR), messagesAfter }
  );
}

async function scenarioAvatarSignature(coach: FixtureUser) {
  section("4) Avatar: bắt buộc chữ ký ảnh THẬT");
  const avatarBefore = countFiles(AVATAR_DIR);

  const fakeForm = new FormData();
  fakeForm.set("avatar", blobOf(fakePng(), "image/png"), "avatar.png");
  const fake = await http("POST", "/auth/me/avatar", { token: coach.token, form: fakeForm });
  check(
    "Avatar giả PNG → 400, không ghi file",
    fake.status === 400 && countFiles(AVATAR_DIR) === avatarBefore,
    { status: fake.status, files: countFiles(AVATAR_DIR) }
  );

  const driver = avatarStorageDriver();
  if (driver === "cloudinary") {
    console.log(
      "  (info) Driver Cloudinary — bỏ qua upload avatar thật để không tạo asset ngoài môi trường test."
    );
    return;
  }

  const realForm = new FormData();
  realForm.set("avatar", blobOf(realPng(), "image/png"), "avatar.png");
  const real = await http("POST", "/auth/me/avatar", { token: coach.token, form: realForm });
  check("Avatar PNG thật → 200", real.status === 200, real.body);

  const user = await prisma.user.findUnique({
    where: { id: coach.id },
    select: { avatarUrl: true },
  });
  const url = String(user?.avatarUrl ?? "");
  check("avatarUrl trỏ /uploads/avatars/ (driver local)", url.includes("/uploads/avatars/"), url);
  if (url.includes("/uploads/avatars/")) {
    const name = url.split("/").pop()!.split("?")[0];
    created.avatarFiles.push(name);
    const publicAvatar = await rawGet(`/uploads/avatars/${name}`);
    check(
      "Avatar local vẫn là tài nguyên công khai (200)",
      publicAvatar.status === 200,
      publicAvatar.status
    );
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`E2E chat attachments (D03) — run=${RUN} | api=${baseUrl}/api/v1`);

  const hashed = await hashPassword(PASSWORD);
  try {
    const coach = await createUser("COACH", "coach", hashed);
    const member1 = await createUser("MEMBER", "member1", hashed);
    const member2 = await createUser("MEMBER", "member2", hashed);

    await scenarioPrivateAttachment(coach, member1, member2);
    await scenarioPublicRoomAttachment(coach, member2);
    await scenarioRejectionsLeaveNoJunk(coach, member1);
    await scenarioAvatarSignature(coach);
  } catch (err) {
    failures.push(`Lỗi không mong đợi: ${(err as Error).message}`);
    console.error("\nUNEXPECTED ERROR:", err);
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      await cleanup();
      console.log("  Đã dọn sạch fixture + file E2E.");
    } catch (err) {
      failures.push(`Cleanup thất bại: ${(err as Error).message}`);
      console.error("  Cleanup thất bại:", err);
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log("\n=== KẾT QUẢ ===");
  console.log(`PASS: ${passed} | FAIL: ${failures.length}`);
  if (failures.length > 0) {
    console.log("\nDanh sách FAIL:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
