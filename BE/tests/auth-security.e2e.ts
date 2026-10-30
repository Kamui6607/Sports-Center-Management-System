/**
 * E2E bảo mật xác thực (mục A + BE-9):
 * 1) forgot-password: cùng một phản hồi dù email có tồn tại; không trả token/link; OTP lưu hash; chặn gửi lại 60s.
 * 2) reset-password bằng OTP: sai / hết hạn / quá 5 lần / email lạ ⇒ cùng thông điệp; thành công ⇒ thu hồi refresh token.
 *    Đường cũ `{ token, newPassword }` của Web vẫn chạy.
 * 3) login: kiểm tra mật khẩu TRƯỚC `isActive` (không lộ tài khoản bị khóa).
 * 4) Phiên giới hạn (BE-9): Coach chưa duyệt đăng nhập được, có refresh token, chỉ dùng hồ sơ/CV.
 *
 * Chạy: npm run test:local -- auth-security
 */
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { check, group, http, PASSWORD, RUN, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createUser, login } from "./helpers/fixtures.js";

/** Lấy OTP từ email mới nhất trong outbox (DB local — mail không gửi thật). */
async function latestOtp(userId: string): Promise<string | null> {
  const mail = await prisma.notificationOutbox.findFirst({
    where: { userId, type: "EMAIL_RESET_PASSWORD" },
    orderBy: { createdAt: "desc" },
  });
  return mail?.body.match(/letter-spacing:6px[^>]*>(\d{6})</)?.[1] ?? null;
}

async function mailCount(userId: string) {
  return prisma.notificationOutbox.count({ where: { userId, type: "EMAIL_RESET_PASSWORD" } });
}

async function main() {
  const member = await createUser("MEMBER");
  const OTP_INVALID = "OTP_INVALID";

  group("1. forgot-password không lộ email, không trả token");
  const unknown = await http("POST", "/auth/forgot-password", { body: { email: `${RUN}-nobody@example.test` } });
  const known = await http("POST", "/auth/forgot-password", { body: { email: member.email } });
  check("email lạ ⇒ 200 success:true", unknown.status === 200 && unknown.body.success === true, unknown);
  check("email có thật ⇒ 200 success:true", known.status === 200 && known.body.success === true, known);
  check("cùng thông điệp", unknown.body.message === known.body.message);
  check("cùng tập field data", JSON.stringify(unknown.body.data) === JSON.stringify(known.body.data), [unknown.body.data, known.body.data]);
  check("không có token / resetLink trong response", !/token|resetLink/i.test(JSON.stringify(known.body)));
  const otp1 = await latestOtp(member.id);
  check("email chứa OTP 6 số + liên kết Web", !!otp1, otp1);
  const stored = await prisma.passwordResetOtp.findUnique({ where: { userId: member.id } });
  check("OTP chỉ lưu dạng hash", !!stored && stored.otpHash !== otp1 && stored.otpHash.startsWith("$2"));
  check("hết hạn sau 15 phút", !!stored && Math.abs(stored.expiresAt.getTime() - Date.now() - 15 * 60_000) < 30_000);

  const before = await mailCount(member.id);
  const again = await http("POST", "/auth/forgot-password", { body: { email: member.email } });
  check("gửi lại trong 60s ⇒ vẫn 200 nhưng không sinh mã/email mới", again.status === 200 && (await mailCount(member.id)) === before);

  group("2. reset-password bằng OTP");
  await login(member);
  const wrong = otp1 === "000000" ? "111111" : "000000";
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await http("PATCH", "/auth/reset-password", { body: { email: member.email, otp: wrong, newPassword: "NewPass#1" } }));
  }
  check("5 lần sai ⇒ 400 OTP_INVALID", results.every((r) => r.status === 400 && r.body.errors?.code === OTP_INVALID), results.map((r) => r.status));
  const locked = await http("PATCH", "/auth/reset-password", { body: { email: member.email, otp: otp1, newPassword: "NewPass#1" } });
  check("sau 5 lần sai, mã đúng cũng bị từ chối", locked.status === 400 && locked.body.errors?.code === OTP_INVALID, locked);
  const unknownReset = await http("PATCH", "/auth/reset-password", { body: { email: `${RUN}-nobody@example.test`, otp: "123456", newPassword: "NewPass#1" } });
  check("email lạ ⇒ cùng thông điệp", unknownReset.status === 400 && unknownReset.body.message === locked.body.message);
  const badShape = await http("PATCH", "/auth/reset-password", { body: { email: member.email, otp: "12ab", newPassword: "NewPass#1" } });
  check("OTP sai định dạng ⇒ 400 lỗi field otp", badShape.status === 400 && badShape.body.errors?.some?.((e: any) => e.field === "otp"), badShape);

  // Mã mới sau thời gian chờ gửi lại.
  await prisma.passwordResetOtp.update({ where: { userId: member.id }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
  await http("POST", "/auth/forgot-password", { body: { email: member.email } });
  const otp2 = await latestOtp(member.id);
  check("sau 60s gửi lại được mã mới", !!otp2 && (await mailCount(member.id)) === before + 1);

  // Hết hạn.
  await prisma.passwordResetOtp.update({ where: { userId: member.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await http("PATCH", "/auth/reset-password", { body: { email: member.email, otp: otp2, newPassword: "NewPass#1" } });
  check("mã hết hạn ⇒ 400 OTP_INVALID", expired.status === 400 && expired.body.errors?.code === OTP_INVALID, expired);

  await prisma.passwordResetOtp.update({
    where: { userId: member.id },
    data: { expiresAt: new Date(Date.now() + 600_000), lastSentAt: new Date(Date.now() - 61_000) },
  });
  await http("POST", "/auth/forgot-password", { body: { email: member.email } });
  const otp3 = await latestOtp(member.id);
  const ok = await http("PATCH", "/auth/reset-password", { body: { email: member.email, otp: otp3, newPassword: "NewPass#1" } });
  check("OTP đúng ⇒ 200", ok.status === 200 && ok.body.success === true, ok);
  const refreshAfter = await http("POST", "/auth/refresh-token", { body: { refreshToken: member.refreshToken } });
  check("refresh token cũ bị thu hồi", refreshAfter.status === 401, refreshAfter.status);
  const reuse = await http("PATCH", "/auth/reset-password", { body: { email: member.email, otp: otp3, newPassword: "Again#123" } });
  check("OTP đã dùng không dùng lại được", reuse.status === 400);
  const newLogin = await http("POST", "/auth/login", { body: { email: member.email, password: "NewPass#1" } });
  check("đăng nhập bằng mật khẩu mới", newLogin.status === 200, newLogin.status);

  group("2b. Web: reset bằng token trong liên kết (giữ nguyên)");
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
  const webToken = jwt.sign({ email: fresh.email, id: fresh.id }, env.JWT_ACCESS_SECRET + fresh.password, { expiresIn: "15m" });
  const web = await http("PATCH", "/auth/reset-password", { body: { token: webToken, newPassword: PASSWORD } });
  check("{ token, newPassword } ⇒ 200", web.status === 200, web);

  group("3. login: mật khẩu trước, isActive sau");
  const locked2 = await createUser("MEMBER", { active: false });
  const noUser = await http("POST", "/auth/login", { body: { email: `${RUN}-ghost@example.test`, password: PASSWORD } });
  const wrongPwLocked = await http("POST", "/auth/login", { body: { email: locked2.email, password: "wrong-pass" } });
  check("email lạ ⇒ 401", noUser.status === 401);
  check("tài khoản khóa + sai mật khẩu ⇒ 401 (không lộ là bị khóa)", wrongPwLocked.status === 401 && wrongPwLocked.body.message === noUser.body.message, wrongPwLocked);
  const rightPwLocked = await http("POST", "/auth/login", { body: { email: locked2.email, password: PASSWORD } });
  check("tài khoản khóa + đúng mật khẩu ⇒ 403", rightPwLocked.status === 403, rightPwLocked);
  const approvedButLocked = await createUser("COACH", { active: false, cert: "APPROVED" });
  const abl = await http("POST", "/auth/login", { body: { email: approvedButLocked.email, password: PASSWORD } });
  check("Coach đã duyệt nhưng bị khóa ⇒ 403 (không phải phiên giới hạn)", abl.status === 403, abl);

  group("4. Phiên giới hạn cho Coach chưa duyệt (BE-9)");
  for (const cert of [null, "PENDING", "REJECTED"] as const) {
    const coach = await createUser("COACH", { active: false, cert });
    const res = await http("POST", "/auth/login", { body: { email: coach.email, password: PASSWORD } });
    check(`cert=${cert ?? "chưa nộp"} ⇒ 200 restricted:true + refresh token`, res.status === 200 && res.body.data.restricted === true && !!res.body.data.refreshToken, res);
    if (res.status !== 200) continue;
    const token = res.body.data.accessToken;
    const me = await http("GET", "/auth/me", { token });
    check("GET /auth/me được phép, restricted:true", me.status === 200 && me.body.data.restricted === true, me.status);
    const patch = await http("PATCH", "/auth/me", { token, body: { fullName: "HLV Chờ Duyệt" } });
    check("PATCH /auth/me được phép", patch.status === 200, patch.status);
    const classes = await http("GET", "/classes?createdByMe=true", { token });
    check("API khác vẫn bị chặn (401)", classes.status === 401, classes.status);
    const refreshed = await http("POST", "/auth/refresh-token", { body: { refreshToken: res.body.data.refreshToken } });
    check("refresh token dùng được", refreshed.status === 200, refreshed.status);
    const logout = await http("POST", "/auth/logout", { token, body: { refreshToken: res.body.data.refreshToken } });
    check("đăng xuất được", logout.status === 200, logout.status);
  }
  const pending = await createUser("COACH", { active: false, cert: null });
  await login(pending);
  const form = new FormData();
  form.append("cv", new Blob([Buffer.from("%PDF-1.4\n%e2e\n")], { type: "application/pdf" }), "cv.pdf");
  const cv = await http("POST", "/coaches/me/cv", { token: pending.token, form });
  check("nộp CV bằng phiên giới hạn", cv.status === 201, cv);
  const activeMember = await createUser("MEMBER");
  const memberLogin = await http("POST", "/auth/login", { body: { email: activeMember.email, password: PASSWORD } });
  check("tài khoản thường ⇒ restricted:false", memberLogin.body.data?.restricted === false);

  const reg = await http("POST", "/auth/register", {
    body: { email: `${RUN}-newcoach@example.test`, password: PASSWORD, fullName: "HLV Mới", role: "COACH" },
  });
  check("đăng ký Coach ⇒ có cả access + refresh token, restricted:true", reg.status === 201 && !!reg.body.data.refreshToken && reg.body.data.restricted === true, reg.body.data && Object.keys(reg.body.data));
  const regMember = await http("POST", "/auth/register", {
    body: { email: `${RUN}-newmember@example.test`, password: PASSWORD, fullName: "Học Viên Mới" },
  });
  check("đăng ký Member không cấp token (giữ nguyên)", regMember.status === 201 && !regMember.body.data.accessToken);
}

runSuite("auth-security", main, cleanupRun);
