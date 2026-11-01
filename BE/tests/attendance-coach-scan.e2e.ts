/**
 * E2E: HLV quét thẻ thành viên của học viên ⇒ kiểm có trong buổi đang dạy + điểm danh (`POST /attendance/coach-scan`).
 *
 * Chạy: npm run test:local -- attendance-coach-scan
 */
import { prisma } from "../src/config/prisma.js";
import { ATTENDANCE } from "../src/config/attendance.js";
import { check, group, http, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createUser, login, purchase, type TestUser } from "./helpers/fixtures.js";

async function passOf(member: TestUser): Promise<string> {
  const res = await http("GET", "/memberships/my/pass", { token: member.token });
  if (res.status !== 200) throw new Error(`pass ${member.email} => ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

async function scan(by: TestUser, member: TestUser, scheduleId?: string) {
  return http("POST", "/attendance/coach-scan", {
    token: by.token,
    body: { token: await passOf(member), ...(scheduleId ? { scheduleId } : {}) },
  });
}

async function main() {
  const coach = await login(await createUser("COACH"));
  const otherCoach = await login(await createUser("COACH"));
  const manager = await login(await createUser("MANAGER"));
  const early = await login(await createUser("MEMBER")); // giữ chỗ buổi sắp bắt đầu
  const late = await login(await createUser("MEMBER")); // giữ chỗ buổi đã bắt đầu 1 giờ
  const wasAbsent = await login(await createUser("MEMBER")); // đã bị ghi ABSENT trước khi đến
  const stranger = await login(await createUser("MEMBER")); // không giữ chỗ buổi nào
  const alumni = await login(await createUser("MEMBER")); // chỉ học khóa đã kết thúc của HLV

  const soon = await createClass(coach, { sessions: [{ startInHours: 0.25 }] }); // 15 phút nữa ⇒ trong cửa sổ, chưa muộn
  const ongoing = await createClass(coach, { sessions: [{ startInHours: -1, hours: 3 }, { startInHours: 48 }] });
  const finished = await createClass(coach, { status: "COMPLETED", sessions: [{ startInHours: -72, status: "COMPLETED" }] });
  const s1 = soon.schedules[0];
  const s2 = ongoing.schedules[0];
  const future = ongoing.schedules[1];
  await purchase(early, soon.cls, [s1.id]);
  await purchase(late, ongoing.cls, ongoing.schedules.map((s) => s.id));
  await purchase(wasAbsent, ongoing.cls, ongoing.schedules.map((s) => s.id));
  await purchase(alumni, finished.cls, finished.schedules.map((s) => s.id));
  await prisma.attendance.create({ data: { scheduleId: s2.id, memberId: wasAbsent.memberProfileId!, status: "ABSENT" } });

  group("1. Tự tìm buổi đang dạy của HLV");
  const a = await scan(coach, early);
  check("buổi sắp bắt đầu ⇒ CHECKED_IN + PRESENT", a.status === 200 && a.body.data.state === "CHECKED_IN" && a.body.data.attendance?.status === "PRESENT", a.body);
  check("chọn đúng buổi học viên giữ chỗ (HLV có 2 buổi trong cửa sổ)", a.body.data?.session?.id === s1.id, a.body.data?.session);
  check("ghi chú nguồn = HLV quét thẻ", a.body.data?.attendance?.note === ATTENDANCE.COACH_SCAN_NOTE, a.body.data?.attendance);
  check("chưa có gói gym vẫn điểm danh được lớp; `pass` báo không hợp lệ", a.body.data?.pass?.valid === false && a.body.data?.pass?.member?.id === early.memberProfileId, a.body.data?.pass);
  const again = await scan(coach, early);
  check("quét lại ⇒ ALREADY_CHECKED_IN, không đổi trạng thái", again.body.data?.state === "ALREADY_CHECKED_IN" && again.body.data.attendance?.status === "PRESENT", again.body);
  const rows = await prisma.attendance.count({ where: { scheduleId: s1.id, memberId: early.memberProfileId } });
  check("chỉ 1 bản ghi điểm danh", rows === 1, rows);
  const logs = await prisma.memberPassScan.count({ where: { memberId: early.memberProfileId } });
  check("mỗi lượt quét vẫn ghi nhật ký vào cửa", logs === 2, logs);

  const b = await scan(coach, late);
  check("quét sau giờ bắt đầu > 10 phút ⇒ LATE", b.body.data?.state === "CHECKED_IN" && b.body.data.attendance?.status === "LATE" && b.body.data.session?.id === s2.id, b.body);
  await new Promise((r) => setTimeout(r, 300));
  const lateNotice = await prisma.notification.count({ where: { userId: late.id, type: "ATTENDANCE_WARNING" } });
  check("đi muộn ⇒ gửi thông báo cho học viên", lateNotice === 1, lateNotice);

  const c = await scan(coach, wasAbsent);
  check("đang ABSENT ⇒ HLV quét ghi đè thành có mặt (LATE)", c.body.data?.state === "CHECKED_IN" && c.body.data.attendance?.status === "LATE", c.body);

  const d = await scan(coach, stranger);
  check("không giữ chỗ buổi nào ⇒ NOT_IN_CLASS, không ghi điểm danh", d.status === 200 && d.body.data.state === "NOT_IN_CLASS" && d.body.data.attendance === null, d.body);
  check("HLV có 2 buổi ⇒ không đoán buổi (session = null)", d.body.data?.session === null, d.body.data?.session);
  const strangerRows = await prisma.attendance.count({ where: { memberId: stranger.memberProfileId } });
  check("không tạo bản ghi cho người ngoài lớp", strangerRows === 0, strangerRows);

  const e = await scan(otherCoach, early);
  check("HLV không có buổi đang dạy ⇒ NO_ACTIVE_SESSION", e.body.data?.state === "NO_ACTIVE_SESSION" && e.body.data.session === null, e.body);

  group("2. Quét từ màn buổi dạy (scheduleId)");
  const f = await scan(coach, early, s2.id);
  check("học viên không có trong buổi đang mở ⇒ NOT_IN_CLASS + trả buổi đó", f.body.data?.state === "NOT_IN_CLASS" && f.body.data.session?.id === s2.id, f.body);
  const g = await scan(otherCoach, early, s1.id);
  check("buổi không thuộc HLV ⇒ 403", g.status === 403, g.body);
  const h = await scan(coach, late, future.id);
  check("buổi ngoài cửa sổ điểm danh ⇒ 409", h.status === 409, h.body);

  group("3. Quản lý, phân quyền, mã sai");
  const m = await scan(manager, early);
  check("Quản lý quét ⇒ tìm buổi toàn trung tâm, đã điểm danh", m.status === 200 && m.body.data.state === "ALREADY_CHECKED_IN" && m.body.data.session?.id === s1.id, m.body);
  const self = await scan(early, early);
  check("Member không gọi được", self.status === 403, self.status);
  const bad = await http("POST", "/attendance/coach-scan", { token: coach.token, body: { token: "abc.def.ghijklmnop" } });
  check("mã rác ⇒ 400 PASS_INVALID", bad.status === 400 && bad.body.errors?.code === "PASS_INVALID", bad.body);
  const extra = await http("POST", "/attendance/coach-scan", { token: coach.token, body: { token: await passOf(early), memberId: "x" } });
  check("key lạ ⇒ 400 (schema strict)", extra.status === 400, extra.body);

  const qr = await http("POST", "/attendance/generate-qr", { token: coach.token, body: { scheduleId: s1.id } });
  const self2 = await http("POST", "/attendance/scan-qr", { token: early.token, body: { qrToken: qr.body.data?.qrToken } });
  check(
    "member tự quét QR sau khi HLV đã quét thẻ ⇒ vẫn PRESENT, kết quả kèm buổi học",
    self2.status === 200 && self2.body.data.status === "PRESENT" && self2.body.data.schedule?.class?.name === soon.cls.name && !!self2.body.data.schedule?.room?.name,
    self2.body
  );

  group("4. /memberships/pass/verify: \"học viên của bạn\" chỉ tính buổi chưa kết thúc");
  const v1 = await http("POST", "/memberships/pass/verify", { token: coach.token, body: { token: await passOf(late) } });
  check("đang giữ chỗ buổi chưa kết thúc ⇒ true", v1.body.data?.isMyStudent === true, v1.body.data?.isMyStudent);
  const v2 = await http("POST", "/memberships/pass/verify", { token: coach.token, body: { token: await passOf(alumni) } });
  check("chỉ học khóa đã kết thúc ⇒ false", v2.body.data?.isMyStudent === false, v2.body.data?.isMyStudent);
}

void runSuite("attendance-coach-scan", main, cleanupRun);
