/**
 * E2E quản trị Web Manager (6 nhóm: người dùng, sản phẩm, phòng, khóa/lịch, HLV, đọc báo cáo doanh thu).
 * HTTP + PostgreSQL THẬT, chỉ chạy trên DB local (helper dừng nếu DATABASE_URL không phải localhost).
 * Không kiểm/sửa logic tiền — báo cáo chỉ kiểm quyền + phản hồi đọc được.
 *
 * Chạy: npm run test:local -- admin-web
 */
import { prisma } from "../src/config/prisma.js";
import { check, group, http, PASSWORD, RUN, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createRoom, createUser, login, purchase } from "./helpers/fixtures.js";

/** Đọc mã OTP từ email nằm trong OUTBOX của DB test (không gửi thư thật, không in mã ra log). */
async function otpFromOutbox(userId: string): Promise<string | null> {
  const row = await prisma.notificationOutbox.findFirst({
    where: { userId, channel: "EMAIL", type: "EMAIL_ADMIN_RESET_PASSWORD" },
    orderBy: { createdAt: "desc" },
  });
  return row?.body.match(/letter-spacing:6px[^>]*>(\d{6})</)?.[1] ?? null;
}

async function main() {
  const manager = await login(await createUser("MANAGER"));
  const manager2 = await login(await createUser("MANAGER"));
  const member = await login(await createUser("MEMBER"));
  const coach = await login(await createUser("COACH"));

  group("1. Phân quyền API quản trị (401 guest, 403 MEMBER/COACH)");
  const adminOps: [string, string, unknown?][] = [
    ["GET", "/users"],
    ["POST", "/users", { email: "x@y.z", password: "123456", fullName: "XX", role: "MEMBER" }],
    ["DELETE", `/users/${member.id}/permanent`],
    ["POST", `/users/${member.id}/password-reset`],
    ["GET", "/coaches/cv/pending"],
    ["POST", "/rooms", { name: "X", capacity: 1, areaType: "INDOOR" }],
    ["PATCH", "/classes/x/review", { action: "APPROVE" }],
    ["POST", "/products", { name: "XX", description: "xxxxx", price: 1, stockQuantity: 0 }],
    ["POST", "/shop/manage/inventory/x", { type: "IN", quantity: 1, note: "abc" }],
    ["GET", "/reports/revenue?startDate=2026-10-01&endDate=2026-10-31"],
    ["GET", "/payments"],
  ];
  for (const [m, p, body] of adminOps) {
    const g = await http(m, p, { body });
    const mb = await http(m, p, { token: member.token, body });
    const co = await http(m, p, { token: coach.token, body });
    check(`${m} ${p}: guest 401 / MEMBER 403 / COACH 403`, g.status === 401 && mb.status === 403 && co.status === 403, [g.status, mb.status, co.status]);
  }
  const cvParam = await http("GET", "/coaches/cv/pending?status=WHATEVER", { token: manager.token });
  check("cv/pending status lạ ⇒ 400 (trước đây 500)", cvParam.status === 400, cvParam.status);

  group("2. Người dùng: CRUD, validation, đọc lại");
  const email = `${RUN}-created@example.test`;
  const bad = await http("POST", "/users", { token: manager.token, body: { email: "not-mail", password: "1", fullName: "A", role: "STAFF" } });
  check("tạo sai dữ liệu ⇒ 400 + errors theo field", bad.status === 400 && Array.isArray(bad.body.errors) && bad.body.errors.some((e: any) => e.field === "email"), bad.body);
  const created = await http("POST", "/users", { token: manager.token, body: { email, password: PASSWORD, fullName: "Hội viên tạo mới", role: "MEMBER", trainingLevel: "BEGINNER" } });
  check("tạo MEMBER ⇒ 201 + memberProfile", created.status === 201 && !!created.body.data.memberProfile, created.status);
  const createdId = created.body.data?.id;
  const dup = await http("POST", "/users", { token: manager.token, body: { email, password: PASSWORD, fullName: "Trùng", role: "MEMBER" } });
  check("trùng email ⇒ 409", dup.status === 409, dup.status);
  const list = await http("GET", `/users?search=${encodeURIComponent(RUN)}&role=MEMBER&limit=100`, { token: manager.token });
  check("list lọc search+role thấy user vừa tạo", list.status === 200 && list.body.data.some((u: any) => u.id === createdId) && list.body.data.every((u: any) => u.role === "MEMBER"), list.status);
  const patched = await http("PATCH", `/users/${createdId}`, { token: manager.token, body: { fullName: "Tên đã sửa", gender: "FEMALE" } });
  const reread = await http("GET", `/users/${createdId}`, { token: manager.token });
  check("sửa thông tin ⇒ đọc lại đúng", patched.status === 200 && reread.body.data.fullName === "Tên đã sửa" && reread.body.data.gender === "FEMALE", reread.body.data);
  check("response không lộ password", !("password" in reread.body.data), Object.keys(reread.body.data));
  const createdCoach = await http("POST", "/users", { token: manager.token, body: { email: `${RUN}-coachnew@example.test`, password: PASSWORD, fullName: "HLV tạo bởi QL", role: "COACH" } });
  check("tạo COACH bởi Manager ⇒ hoạt động + hồ sơ APPROVED", createdCoach.status === 201 && createdCoach.body.data.isActive === true && createdCoach.body.data.coachProfile.approvalStatus === "APPROVED", createdCoach.body.data?.coachProfile);
  const createdManager = await http("POST", "/users", { token: manager.token, body: { email: `${RUN}-mgrnew@example.test`, password: PASSWORD, fullName: "QL mới", role: "MANAGER" } });
  check("không tạo được tài khoản MANAGER ⇒ 400", createdManager.status === 400, createdManager.status);

  group("3. Khóa / mở khóa / tự bảo vệ / Manager cuối");
  const selfLock = await http("DELETE", `/users/${manager.id}`, { token: manager.token });
  check("tự khóa ⇒ 400", selfLock.status === 400, selfLock.status);
  const selfDemote = await http("PATCH", `/users/${manager.id}`, { token: manager.token, body: { role: "MEMBER" } });
  check("tự hạ quyền ⇒ 400", selfDemote.status === 400, selfDemote.status);
  const lock = await http("DELETE", `/users/${createdId}`, { token: manager.token });
  const lockedLogin = await http("POST", "/auth/login", { body: { email, password: PASSWORD } });
  check("khóa mềm ⇒ isActive=false, đăng nhập bị chặn", lock.status === 200 && lock.body.data.isActive === false && lockedLogin.status === 403, [lock.status, lockedLogin.status]);
  check("khóa mềm KHÔNG xóa dữ liệu", !!(await prisma.user.findUnique({ where: { id: createdId } })));
  const unlock = await http("PATCH", `/users/${createdId}`, { token: manager.token, body: { isActive: true } });
  check("mở khóa ⇒ 200", unlock.status === 200 && unlock.body.data.isActive === true, unlock.status);

  // Manager cuối: đặt mọi Manager khác (ngoài manager & manager2) tạm thời inactive để kiểm tra rồi khôi phục.
  const others = await prisma.user.findMany({ where: { role: { name: "MANAGER" }, isActive: true, id: { notIn: [manager.id, manager2.id] } }, select: { id: true } });
  await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: false } });
  try {
    const [a, b] = await Promise.all([
      http("DELETE", `/users/${manager2.id}`, { token: manager.token }),
      http("DELETE", `/users/${manager.id}`, { token: manager2.token }),
    ]);
    const active = await prisma.user.count({ where: { role: { name: "MANAGER" }, isActive: true, id: { in: [manager.id, manager2.id] } } });
    check("2 Manager khóa nhau đồng thời ⇒ còn ≥1 Manager hoạt động", active >= 1 && [a.status, b.status].filter((s) => s === 200).length <= 1, [a.status, b.status, active]);
    await prisma.user.updateMany({ where: { id: { in: [manager.id, manager2.id] } }, data: { isActive: true } });
  } finally {
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: true } });
  }

  group("4. Không bypass duyệt CV bằng mở khóa");
  const pendingCoach = await createUser("COACH", { active: false, cert: "PENDING" });
  const bypass = await http("PATCH", `/users/${pendingCoach.id}`, { token: manager.token, body: { isActive: true } });
  check("mở khóa HLV CV PENDING ⇒ 409 COACH_CV_NOT_APPROVED", bypass.status === 409 && bypass.body.errors?.code === "COACH_CV_NOT_APPROVED", bypass.body);
  const noCv = await createUser("COACH", { active: false, cert: null });
  const bypass2 = await http("PATCH", `/users/${noCv.id}`, { token: manager.token, body: { isActive: true } });
  check("mở khóa HLV chưa nộp CV ⇒ 409", bypass2.status === 409, bypass2.status);

  group("5. Đổi vai trò bị chặn khi còn nghĩa vụ");
  const busyCoach = await login(await createUser("COACH"));
  await createClass(busyCoach, { sessions: [{ startInHours: 48 }] });
  const demoteCoach = await http("PATCH", `/users/${busyCoach.id}`, { token: manager.token, body: { role: "MEMBER" } });
  check("HLV còn lịch/khóa ⇒ 400 ROLE_CHANGE_BLOCKED", demoteCoach.status === 400 && demoteCoach.body.errors?.code === "ROLE_CHANGE_BLOCKED", demoteCoach.body);
  const freeMember = await createUser("MEMBER");
  const promote = await http("PATCH", `/users/${freeMember.id}`, { token: manager.token, body: { role: "COACH" } });
  check("MEMBER không nghĩa vụ ⇒ đổi sang COACH được, hồ sơ APPROVED", promote.status === 200 && promote.body.data.role === "COACH" && promote.body.data.coachProfile?.approvalStatus === "APPROVED", promote.body.data?.coachProfile);

  group("6. Cấp lại mật khẩu (Manager khởi tạo → người dùng tự đặt)");
  const target = await login(await createUser("MEMBER"));
  const oldAccess = target.token!;
  const rs = await http("POST", `/users/${target.id}/password-reset`, { token: manager.token });
  check("202 queued, không lộ mã/mật khẩu", rs.status === 202 && rs.body.data.queued === true && !JSON.stringify(rs.body).match(/\b\d{6}\b(?!\d)/) && !("otp" in rs.body.data), rs.body);
  const again = await http("POST", `/users/${target.id}/password-reset`, { token: manager.token });
  check("gửi lại < 60s ⇒ 429 RESET_COOLDOWN", again.status === 429 && again.body.errors?.code === "RESET_COOLDOWN", again.status);
  const status1 = await http("GET", `/users/${target.id}/password-reset`, { token: manager.token });
  check("trạng thái: mã ACTIVE, email trong hàng đợi (không gửi thật)", status1.body.data?.request?.state === "ACTIVE" && ["PENDING", "FAILED", "SENDING"].includes(status1.body.data?.email?.status), status1.body.data);
  check("đăng nhập mật khẩu cũ vẫn được trước khi người dùng đặt lại", (await http("POST", "/auth/login", { body: { email: target.email, password: PASSWORD } })).status === 200);
  const otp = await otpFromOutbox(target.id);
  check("email chứa mã OTP + liên kết /reset-password (không chứa mật khẩu)", !!otp);
  const outboxRow = await prisma.notificationOutbox.findFirst({ where: { userId: target.id, type: "EMAIL_ADMIN_RESET_PASSWORD" } });
  check("email có liên kết trang đặt lại", /\/reset-password\?email=/.test(outboxRow?.body ?? ""));
  const wrong = await http("PATCH", "/auth/reset-password", { body: { email: target.email, otp: otp === "000000" ? "111111" : "000000", newPassword: "NewPass#2026" } });
  check("sai mã ⇒ 400 OTP_INVALID", wrong.status === 400, wrong.status);
  const done = await http("PATCH", "/auth/reset-password", { body: { email: target.email, otp, newPassword: "NewPass#2026" } });
  check("đúng mã ⇒ 200", done.status === 200, done.body);
  const reuse = await http("PATCH", "/auth/reset-password", { body: { email: target.email, otp, newPassword: "Another#2026" } });
  check("dùng lại mã ⇒ 400", reuse.status === 400, reuse.status);
  const oldTok = await http("GET", "/auth/me", { token: oldAccess });
  check("access token cũ bị thu hồi ngay ⇒ 401", oldTok.status === 401, oldTok.status);
  const oldRefresh = await http("POST", "/auth/refresh-token", { body: { refreshToken: target.refreshToken } });
  check("refresh token cũ ⇒ 401", oldRefresh.status === 401, oldRefresh.status);
  check("mật khẩu cũ ⇒ 401", (await http("POST", "/auth/login", { body: { email: target.email, password: PASSWORD } })).status === 401);
  const newLogin = await http("POST", "/auth/login", { body: { email: target.email, password: "NewPass#2026" } });
  check("đăng nhập mật khẩu mới ⇒ 200", newLogin.status === 200, newLogin.status);
  const status2 = await http("GET", `/users/${target.id}/password-reset`, { token: manager.token });
  check("trạng thái sau khi đặt: USED", status2.body.data?.request?.state === "USED", status2.body.data?.request);
  const lockedReset = await http("POST", `/users/${createdId}/password-reset`, { token: manager.token });
  check("reset tài khoản hoạt động khác ⇒ 202", lockedReset.status === 202, lockedReset.status);

  group("7. Xóa vĩnh viễn chỉ khi chưa có dữ liệu nghiệp vụ");
  const buyer = await createUser("MEMBER");
  const cls = await createClass(coach, { sessions: [{ startInHours: 72 }] });
  await purchase(buyer, cls.cls, cls.schedules.map((s) => s.id));
  const hist = await http("GET", `/users/${buyer.id}/history`, { token: manager.token });
  check("history: có enrollments + payments ⇒ canDeletePermanently=false", hist.body.data?.canDeletePermanently === false && hist.body.data.history.enrollments >= 1, hist.body.data);
  const delBlocked = await http("DELETE", `/users/${buyer.id}/permanent`, { token: manager.token });
  check("xóa tài khoản có lịch sử ⇒ 409 USER_HAS_HISTORY", delBlocked.status === 409 && delBlocked.body.errors?.code === "USER_HAS_HISTORY", delBlocked.body);
  const blank = await createUser("MEMBER");
  const del = await http("DELETE", `/users/${blank.id}/permanent`, { token: manager.token });
  check("xóa tài khoản trống ⇒ 200 và biến mất khỏi DB", del.status === 200 && !(await prisma.user.findUnique({ where: { id: blank.id } })), del.status);
  check("tự xóa ⇒ 400", (await http("DELETE", `/users/${manager.id}/permanent`, { token: manager.token })).status === 400);

  group("8. HLV: CV duyệt/từ chối, chống duyệt lặp, xem CV có quyền");
  const applicant = await createUser("COACH", { active: false, cert: "PENDING" });
  const queue = await http("GET", "/coaches/cv/pending?status=PENDING&limit=100", { token: manager.token });
  check("hàng chờ có hồ sơ PENDING", queue.body.data.some((p: any) => p.id === applicant.coachProfileId), queue.status);
  const cvOther = await http("GET", `/coaches/${applicant.coachProfileId}/cv/file`, { token: member.token });
  check("MEMBER tải CV người khác ⇒ 403", cvOther.status === 403, cvOther.status);
  const [r1, r2] = await Promise.all([
    http("PATCH", `/coaches/${applicant.coachProfileId}/cv/review`, { token: manager.token, body: { action: "APPROVE" } }),
    http("PATCH", `/coaches/${applicant.coachProfileId}/cv/review`, { token: manager2.token, body: { action: "APPROVE" } }),
  ]);
  check("duyệt đồng thời ⇒ đúng 1 thành công", [r1.status, r2.status].filter((s) => s === 200).length === 1, [r1.status, r2.status]);
  check("duyệt ⇒ tài khoản HLV hoạt động", (await prisma.user.findUnique({ where: { id: applicant.id } }))?.isActive === true);
  const rejectee = await createUser("COACH", { active: false, cert: "PENDING" });
  const rej = await http("PATCH", `/coaches/${rejectee.coachProfileId}/cv/review`, { token: manager.token, body: { action: "REJECT", reason: "Thiếu chứng chỉ" } });
  const rejRow = await prisma.certification.findUnique({ where: { coachId: rejectee.coachProfileId! } });
  check("từ chối lưu lý do", rej.status === 200 && rejRow?.status === "REJECTED" && rejRow.rejectReason === "Thiếu chứng chỉ", rejRow);
  const editCoach = await http("PATCH", `/coaches/${coach.id}`, { token: manager.token, body: { specialization: "Bơi", experienceYears: 5, bio: "HLV bơi" } });
  const coachRead = await http("GET", `/coaches/${coach.id}`, { token: manager.token });
  check("Manager sửa hồ sơ HLV ⇒ đọc lại đúng", editCoach.status === 200 && coachRead.body.data.coachProfile.specialization === "Bơi" && coachRead.body.data.coachProfile.experienceYears === 5, coachRead.body.data?.coachProfile);

  group("9. Phòng tập");
  const roomName = `${RUN}-Phòng A`;
  const room = await http("POST", "/rooms", { token: manager.token, body: { name: roomName, capacity: 20, areaType: "INDOOR", location: "Tầng 1" } });
  check("tạo phòng ⇒ 201", room.status === 201, room.body);
  const roomDup = await http("POST", "/rooms", { token: manager.token, body: { name: roomName, capacity: 5, areaType: "INDOOR" } });
  check("trùng tên ⇒ 409", roomDup.status === 409, roomDup.status);
  const roomBad = await http("POST", "/rooms", { token: manager.token, body: { name: "X", capacity: 0, areaType: "GYM" } });
  check("sai capacity/areaType ⇒ 400", roomBad.status === 400, roomBad.status);
  const busyRoom = await createRoom("INDOOR", 30);
  await createClass(coach, { roomId: busyRoom.id, capacity: 10, sessions: [{ startInHours: 30 }] });
  const shrink = await http("PATCH", `/rooms/${busyRoom.id}`, { token: manager.token, body: { capacity: 5 } });
  check("giảm sức chứa dưới sức chứa lớp đang xếp ⇒ 400", shrink.status === 400, shrink.body);
  const area = await http("PATCH", `/rooms/${busyRoom.id}`, { token: manager.token, body: { areaType: "POOL" } });
  check("đổi khu vực làm lịch sắp tới lệch ⇒ 400", area.status === 400, area.status);
  const off = await http("DELETE", `/rooms/${busyRoom.id}`, { token: manager.token });
  check("ngừng phòng còn lịch ⇒ 400", off.status === 400, off.status);
  const target2 = await http("POST", "/rooms", { token: manager.token, body: { name: `${RUN}-Phòng B`, capacity: 30, areaType: "INDOOR" } });
  const preview = await http("POST", `/rooms/${busyRoom.id}/transfer-schedules/preview`, { token: manager.token, body: { targetRoomId: target2.body.data.id } });
  check("xem trước chuyển lịch ⇒ canTransfer", preview.status === 200 && preview.body.data.canTransfer === true && preview.body.data.totalSchedules >= 1, preview.body.data);
  const transfer = await http("POST", `/rooms/${busyRoom.id}/transfer-schedules`, { token: manager.token, body: { targetRoomId: target2.body.data.id, reason: "Bảo trì" } });
  const leftover = await prisma.classSchedule.count({ where: { roomId: busyRoom.id, status: "SCHEDULED", startTime: { gt: new Date() } } });
  check("chuyển lịch ⇒ phòng cũ hết lịch tương lai", transfer.status === 200 && leftover === 0, [transfer.status, leftover]);
  const offOk = await http("DELETE", `/rooms/${busyRoom.id}`, { token: manager.token });
  const onOk = await http("PATCH", `/rooms/${busyRoom.id}`, { token: manager.token, body: { isActive: true } });
  check("ngừng rồi mở lại phòng ⇒ 200/200", offOk.status === 200 && offOk.body.data.isActive === false && onOk.body.data.isActive === true, [offOk.status, onOk.status]);

  group("10. Khóa học & lịch học");
  const pendingCls = await createClass(coach, { status: "PENDING", sessions: [{ startInHours: 96 }] });
  const [c1, c2] = await Promise.all([
    http("PATCH", `/classes/${pendingCls.cls.id}/review`, { token: manager.token, body: { action: "APPROVE" } }),
    http("PATCH", `/classes/${pendingCls.cls.id}/review`, { token: manager2.token, body: { action: "REJECT", reason: "trùng" } }),
  ]);
  check("duyệt/từ chối khóa đồng thời ⇒ đúng 1 thành công", [c1.status, c2.status].filter((s) => s === 200).length === 1, [c1.status, c2.status]);
  const filterPending = await http("GET", `/classes?status=PENDING&coachId=${coach.coachProfileId}&limit=100`, { token: manager.token });
  check("lọc khóa theo status + HLV", filterPending.status === 200 && filterPending.body.data.every((c: any) => c.status === "PENDING" && c.coachId === coach.coachProfileId), filterPending.status);
  const editCls = await http("PATCH", `/classes/${cls.cls.id}`, { token: manager.token, body: { name: `${RUN}-Khóa đã sửa`, price: 1_500_000 } });
  const payAfter = await prisma.payment.findFirst({ where: { classId: cls.cls.id } });
  check("sửa giá khóa không đổi số tiền giao dịch cũ", editCls.status === 200 && Number(editCls.body.data.price) === 1_500_000 && Number(payAfter?.amount) === 1_000_000, [editCls.status, payAfter?.amount]);
  const capLow = await http("PATCH", `/classes/${cls.cls.id}`, { token: manager.token, body: { capacity: 0 } });
  check("sức chứa 0 ⇒ 400", capLow.status === 400, capLow.status);
  const offCls = await http("DELETE", `/classes/${cls.cls.id}`, { token: manager.token });
  check("ngừng khóa còn buổi tương lai ⇒ 400", offCls.status === 400, offCls.status);
  const createByMgr = await http("POST", "/classes", { token: manager.token, body: { name: "X", fitness: "Yoga", capacity: 5, areaType: "INDOOR" } });
  const schedByMgr = await http("POST", "/class-schedules", { token: manager.token, body: { classId: cls.cls.id, roomId: cls.roomId, startTime: new Date().toISOString(), endTime: new Date().toISOString() } });
  check("Manager tạo khóa / tạo buổi ⇒ 403 (giữ quyền HLV)", createByMgr.status === 403 && schedByMgr.status === 403, [createByMgr.status, schedByMgr.status]);
  const byCoach = await http("GET", `/class-schedules?coachId=${coach.coachProfileId}&limit=100`, { token: manager.token });
  check("lọc lịch theo HLV + kèm tên HLV", byCoach.status === 200 && byCoach.body.data.length > 0 && byCoach.body.data.every((s: any) => s.class.coachId === coach.coachProfileId && s.class.coach?.user?.fullName), byCoach.body.data?.[0]?.class);
  const detail = await http("GET", `/class-schedules/${cls.schedules[0].id}`, { token: manager.token });
  check("chi tiết buổi có makeupFor/makeup", detail.status === 200 && "makeupFor" in detail.body.data && "makeup" in detail.body.data, detail.status);
  const roster = await http("GET", `/enrollments/schedule/${cls.schedules[0].id}?limit=100`, { token: manager.token });
  check("học viên của buổi", roster.status === 200 && roster.body.data.some((e: any) => e.memberId === buyer.memberProfileId), roster.status);
  const students = await http("GET", `/classes/${cls.cls.id}/students`, { token: manager.token });
  check("học viên của khóa", students.status === 200 && students.body.data.students.length >= 1, students.status);

  group("11. Sản phẩm & kho");
  const pname = `${RUN}-Nước suối`;
  const prod = await http("POST", "/products", { token: manager.token, body: { name: pname, description: "Chai 500ml", price: 10000, stockQuantity: 12, imageUrl: "https://example.com/a.png", lowStockThreshold: 3 } });
  check("tạo sản phẩm ⇒ 201, tồn 12", prod.status === 201 && prod.body.data.stockQuantity === 12, prod.body);
  const pid = prod.body.data.id;
  const ledger0 = await prisma.inventoryTransaction.findMany({ where: { productId: pid } });
  check("tồn đầu ghi đúng 1 dòng IN", ledger0.length === 1 && ledger0[0].type === "IN" && ledger0[0].quantity === 12, ledger0.map((l) => l.type));
  const badUrl = await http("POST", "/products", { token: manager.token, body: { name: `${RUN}-x`, description: "xxxxxx", price: -1, stockQuantity: 0, imageUrl: "abc" } });
  check("giá âm / URL ảnh sai ⇒ 400", badUrl.status === 400, badUrl.status);

  // Upload file ảnh sản phẩm (multipart/form-data)
  const pngBuf = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const fileForm = new FormData();
  fileForm.append("name", `${RUN}-Áo thun`);
  fileForm.append("description", "Áo thun tập luyện thoáng khí");
  fileForm.append("price", "250000");
  fileForm.append("stockQuantity", "15");
  fileForm.append("imageUrl", new Blob([pngBuf], { type: "image/png" }), "tshirt.png");
  const prodWithFile = await http("POST", "/products", { token: manager.token, form: fileForm });
  check("tạo sản phẩm với file ảnh (imageUrl) ⇒ 201, có URL ảnh", prodWithFile.status === 201 && typeof prodWithFile.body.data.imageUrl === "string" && prodWithFile.body.data.imageUrl.includes("/uploads/products/"), prodWithFile.body);

  const imgForm = new FormData();
  imgForm.append("imageUrl", new Blob([pngBuf], { type: "image/png" }), "upload_test.png");
  const uploadedImg = await http("POST", "/products/upload-image", { token: manager.token, form: imgForm });
  check("POST /products/upload-image ⇒ 200, trả imageUrl", uploadedImg.status === 200 && typeof uploadedImg.body.data.imageUrl === "string" && uploadedImg.body.data.imageUrl.includes("/uploads/products/"), uploadedImg.body);

  if (prodWithFile.body?.data?.id) {
    const patchForm = new FormData();
    patchForm.append("imageUrl", new Blob([pngBuf], { type: "image/png" }), "tshirt_updated.png");
    const patchWithFile = await http("PATCH", `/products/${prodWithFile.body.data.id}`, { token: manager.token, form: patchForm });
    check("PATCH sản phẩm với file ảnh (imageUrl) ⇒ 200, cập nhật URL", patchWithFile.status === 200 && typeof patchWithFile.body.data.imageUrl === "string", patchWithFile.body);
    await prisma.product.delete({ where: { id: prodWithFile.body.data.id } });
  }
  const adj = await http("POST", `/shop/manage/inventory/${pid}`, { token: manager.token, body: { type: "ADJUST", quantity: -2, note: "Hư hỏng" } });
  check("điều chỉnh kho ⇒ tồn 10 + dòng ADJUST", adj.status === 200 && adj.body.data.stockQuantity === 10, adj.body);
  const below = await http("POST", `/shop/manage/inventory/${pid}`, { token: manager.token, body: { type: "ADJUST", quantity: -50, note: "Sai" } });
  check("điều chỉnh âm quá tồn ⇒ 409", below.status === 409, below.status);
  const history = await http("GET", `/shop/manage/inventory/${pid}/transactions?page=1&limit=10`, { token: manager.token });
  check("nhật ký kho 2 dòng, phân trang", history.status === 200 && history.body.data.length === 2 && history.body.pagination.total === 2, history.body.pagination);
  const upd = await http("PATCH", `/products/${pid}`, { token: manager.token, body: { price: 12000, isActive: false } });
  const listOff = await http("GET", `/products?isActive=false&search=${encodeURIComponent(RUN)}`, { token: manager.token });
  check("sửa giá + ngừng bán ⇒ xuất hiện ở lọc 'ngừng bán'", upd.status === 200 && listOff.body.data.some((p: any) => p.id === pid && Number(p.price) === 12000), listOff.status);
  const publicList = await http("GET", `/products?search=${encodeURIComponent(RUN)}`);
  check("ngừng bán ⇒ ẩn khỏi danh sách công khai", !publicList.body.data.some((p: any) => p.id === pid));
  const orderItemHolder = await prisma.product.create({ data: { name: `${RUN}-Đã bán`, description: "đã có đơn", price: 5000, createdById: manager.id } });
  const ord = await prisma.order.create({ data: { code: `${RUN}-DH`, userId: member.id, subtotal: 5000, totalPrice: 5000, status: "COMPLETED", items: { create: { productId: orderItemHolder.id, quantity: 1, unitPrice: 5000, totalAmount: 5000 } } } });
  const delSold = await http("DELETE", `/products/${orderItemHolder.id}`, { token: manager.token });
  check("xóa sản phẩm đã có đơn ⇒ 409 PRODUCT_HAS_HISTORY", delSold.status === 409 && delSold.body.errors?.code === "PRODUCT_HAS_HISTORY", delSold.body);
  await prisma.orderItem.deleteMany({ where: { orderId: ord.id } });
  await prisma.order.delete({ where: { id: ord.id } });
  const delOk = await http("DELETE", `/products/${pid}`, { token: manager.token });
  check("xóa sản phẩm chưa bán ⇒ 2xx", [200, 204].includes(delOk.status) &&!(await prisma.product.findUnique({ where: { id: pid } })), delOk.status);

  group("12. Doanh thu (chỉ đọc API hiện có)");
  const today = new Date().toISOString().slice(0, 10);
  const rev = await http("GET", `/reports/revenue?startDate=${today.slice(0, 8)}01&endDate=${today}`, { token: manager.token });
  check("GET /reports/revenue ⇒ 200, có totalRevenue/refundedAmount/netRevenue/revenueByMethod", rev.status === 200 && ["totalRevenue", "refundedAmount", "netRevenue", "revenueByMethod", "recentPayments"].every((k) => k in rev.body.data), rev.status);
  const revBad = await http("GET", "/reports/revenue?startDate=2026-10-10&endDate=2026-10-01", { token: manager.token });
  check("kỳ ngược ⇒ 400", revBad.status === 400, revBad.status);
  const pays = await http("GET", `/payments?startDate=${today.slice(0, 8)}01T00:00:00Z&page=1&limit=5`, { token: manager.token });
  check("GET /payments phân trang + kèm người mua", pays.status === 200 && !!pays.body.pagination, pays.status);
}

runSuite("admin-web", main, cleanupRun);
