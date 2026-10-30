/**
 * E2E: ví HLV & rút tiền theo TỪNG KHÓA (L4 / BE-5 / BE-7), điểm danh (L5 / BE-18), hồ sơ học viên (BE-19).
 *
 * Chạy: npm run test:local -- wallet-attendance
 */
import { prisma } from "../src/config/prisma.js";
import { check, group, http, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createUser, login, purchase } from "./helpers/fixtures.js";

const BANK = { bankName: "MB", accountNumber: "0123456789", accountName: "E2E COACH" };

async function main() {
  const coach = await login(await createUser("COACH"));
  const otherCoach = await login(await createUser("COACH"));
  const member = await login(await createUser("MEMBER"));
  const member2 = await login(await createUser("MEMBER"));
  const manager = await login(await createUser("MANAGER"));

  // Khóa A: đã kết thúc (mọi buổi COMPLETED). Khóa B: đang dạy (còn buổi SCHEDULED). Khóa C: chờ duyệt.
  const a = await createClass(coach, {
    price: 1_000_000,
    sessions: [
      { startInHours: -72, status: "COMPLETED" },
      { startInHours: -48, status: "COMPLETED" },
    ],
  });
  const b = await createClass(coach, {
    price: 2_000_000,
    sessions: [
      { startInHours: -2, hours: 3 }, // đang diễn ra — dùng để điểm danh
      { startInHours: 48 },
    ],
  });
  await createClass(coach, { status: "PENDING", sessions: [{ startInHours: 96 }] });
  await purchase(member, a.cls, a.schedules.map((s) => s.id));
  await purchase(member, b.cls, b.schedules.map((s) => s.id));
  await purchase(member2, b.cls, b.schedules.map((s) => s.id));

  group("1. Ví: tiền theo từng khóa (L4 / BE-5)");
  let wallet = await http("GET", "/coaches/me/wallet", { token: coach.token });
  const w = wallet.body.data;
  check("GET /coaches/me/wallet 200 + field cũ `wallet` vẫn còn", wallet.status === 200 && !!w.wallet, wallet.status);
  check("số dư = 85% của 3 giao dịch", Number(w.wallet.balance) === 850_000 + 1_700_000 * 2, w.wallet.balance);
  check("available = chỉ tiền khóa A đã kết thúc (850.000)", w.available === 850_000, w.available);
  const stateA = w.withdrawEligibility.classes.find((c: any) => c.classId === a.cls.id);
  const stateB = w.withdrawEligibility.classes.find((c: any) => c.classId === b.cls.id);
  check("khóa A: withdrawable", stateA?.withdrawable === true, stateA);
  check("khóa B đang dạy: bị khóa kèm lý do", stateB?.withdrawable === false && /chưa kết thúc/.test(stateB.reason), stateB);
  check("khóa chờ duyệt KHÔNG chặn rút tiền khóa A", w.withdrawEligibility.eligible === true, w.withdrawEligibility);

  const tooMuch = await http("POST", "/coaches/me/wallet/withdraw", {
    token: coach.token,
    body: { amount: 900_000, bankInfo: BANK },
  });
  check("rút quá phần khả dụng ⇒ 400 AMOUNT_EXCEEDS_AVAILABLE", tooMuch.status === 400 && tooMuch.body.errors?.code === "AMOUNT_EXCEEDS_AVAILABLE", tooMuch.body);

  // Hoàn tiền chờ duyệt trên khóa A ⇒ tạm giữ, khóa A bị khóa rút.
  const payA = await prisma.payment.findFirstOrThrow({ where: { classId: a.cls.id, memberId: member.memberProfileId } });
  const walletRow = await prisma.coachWallet.findUniqueOrThrow({ where: { coachId: coach.coachProfileId! } });
  const hold = await prisma.refund.create({
    data: {
      paymentId: payA.id,
      memberId: member.memberProfileId!,
      classId: a.cls.id,
      reason: "MEMBER_CANCEL_COURSE",
      amount: 100_000,
      coachDebitAmount: 85_000,
      coachWalletId: walletRow.id,
    },
  });
  wallet = await http("GET", "/coaches/me/wallet", { token: coach.token });
  check("pendingRefundDebit = 85.000", wallet.body.data.pendingRefundDebit === 85_000, wallet.body.data.pendingRefundDebit);
  check("khóa A có hoàn tiền chờ ⇒ available 0 + blocker BALANCE_HELD_FOR_REFUND",
    wallet.body.data.available === 0 && wallet.body.data.withdrawEligibility.blockers.some((x: any) => x.code === "BALANCE_HELD_FOR_REFUND"),
    wallet.body.data);
  await prisma.refund.delete({ where: { id: hold.id } });

  const ok = await http("POST", "/coaches/me/wallet/withdraw", {
    token: coach.token,
    body: { amount: 500_000, bankInfo: BANK, note: "E2E" },
  });
  check("rút 500.000 từ khóa đã kết thúc ⇒ 201", ok.status === 201, ok.body);
  const second = await http("POST", "/coaches/me/wallet/withdraw", { token: coach.token, body: { amount: 100_000, bankInfo: BANK } });
  check("lệnh thứ 2 khi đang chờ ⇒ 409 WITHDRAWAL_PENDING", second.status === 409 && second.body.errors?.code === "WITHDRAWAL_PENDING", second.body);
  wallet = await http("GET", "/coaches/me/wallet", { token: coach.token });
  check("available trừ lệnh đang chờ (350.000)", wallet.body.data.available === 350_000, wallet.body.data.available);

  group("2. Manager xem & duyệt lệnh rút (BE-7)");
  const list = await http("GET", "/coaches/wallet/transactions?status=PENDING", { token: manager.token });
  const mine = list.body.data?.find((t: any) => t.id === ok.body.data.id);
  check("GET /coaches/wallet/transactions 200 + có lệnh vừa tạo", list.status === 200 && !!mine, list.status);
  check("kèm coach + wallet.balance + available", mine?.coach?.fullName && mine?.wallet?.balance !== undefined && mine?.wallet?.available !== undefined, mine);
  const detail = await http("GET", `/coaches/wallet/transactions/${ok.body.data.id}`, { token: manager.token });
  check("GET chi tiết 200", detail.status === 200 && detail.body.data.id === ok.body.data.id);
  const forbidden = await http("GET", "/coaches/wallet/transactions", { token: coach.token });
  check("COACH gọi danh sách Manager ⇒ 403", forbidden.status === 403);
  const review = await http("PATCH", `/coaches/wallet/transactions/${ok.body.data.id}/review`, { token: manager.token, body: { action: "APPROVE" } });
  check("Manager duyệt ⇒ 200", review.status === 200, review.body);
  wallet = await http("GET", "/coaches/me/wallet", { token: coach.token });
  check("sau duyệt: số dư giảm 500.000, available 350.000", Number(wallet.body.data.wallet.balance) === 4_250_000 - 500_000 && wallet.body.data.available === 350_000, wallet.body.data);

  group("3. Điểm danh: EXCUSED cho HLV phụ trách (L5) + hàng loạt (BE-18)");
  const ongoing = b.schedules[0];
  const excused = await http("POST", "/attendance", {
    token: coach.token,
    body: { scheduleId: ongoing.id, memberId: member.memberProfileId, status: "EXCUSED", note: "Ốm" },
  });
  check("HLV phụ trách ghi EXCUSED ⇒ 201/200", excused.status === 200 || excused.status === 201, excused.body);
  const otherExcused = await http("POST", "/attendance", {
    token: otherCoach.token,
    body: { scheduleId: ongoing.id, memberId: member2.memberProfileId, status: "EXCUSED" },
  });
  check("HLV KHÔNG phụ trách ghi EXCUSED ⇒ 403", otherExcused.status === 403, otherExcused.status);
  const memberWrite = await http("POST", "/attendance", {
    token: member.token,
    body: { scheduleId: ongoing.id, memberId: member.memberProfileId, status: "EXCUSED" },
  });
  check("MEMBER ghi điểm danh ⇒ 403", memberWrite.status === 403);

  const bulk = await http("PUT", `/attendance/schedule/${ongoing.id}`, {
    token: coach.token,
    body: {
      items: [
        { memberId: member.memberProfileId, status: "PRESENT" },
        { memberId: member2.memberProfileId, status: "LATE", note: "Trễ 10 phút" },
      ],
    },
  });
  check("PUT /attendance/schedule/:id ⇒ 200 + roster 2 dòng", bulk.status === 200 && bulk.body.data.length === 2, bulk.body);
  const updatedRows = await prisma.attendance.findMany({ where: { scheduleId: ongoing.id }, orderBy: { status: "asc" } });
  check("ghi đè EXCUSED ⇒ PRESENT, thêm LATE", updatedRows.map((r) => r.status).sort().join(",") === "LATE,PRESENT", updatedRows.map((r) => r.status));
  const outsider = await createUser("MEMBER");
  const badBulk = await http("PUT", `/attendance/schedule/${ongoing.id}`, {
    token: coach.token,
    body: { items: [{ memberId: member.memberProfileId, status: "ABSENT" }, { memberId: outsider.memberProfileId, status: "PRESENT" }] },
  });
  check("có học viên không giữ chỗ ⇒ 400 MEMBER_NOT_ENROLLED, không ghi dòng nào",
    badBulk.status === 400 && badBulk.body.errors?.code === "MEMBER_NOT_ENROLLED" &&
      (await prisma.attendance.findFirstOrThrow({ where: { scheduleId: ongoing.id, memberId: member.memberProfileId } })).status === "PRESENT",
    badBulk.body);

  const qr = await http("POST", "/attendance/generate-qr", { token: coach.token, body: { scheduleId: ongoing.id } });
  check("mở QR ⇒ có mã dự phòng", qr.status === 200 && !!qr.body.data.manualCode, qr.body);
  const revoke = await http("DELETE", `/attendance/qr/${ongoing.id}`, { token: coach.token });
  check("DELETE /attendance/qr/:id thu hồi mã dự phòng", revoke.status === 200 && revoke.body.data.revokedManualCodes === 1, revoke.body);
  const scanRevoked = await http("POST", "/attendance/scan-qr", { token: member.token, body: { code: qr.body.data.manualCode } });
  check("mã đã thu hồi không dùng được", scanRevoked.status >= 400, scanRevoked.status);

  group("4. EXCUSED không tính vào chuyên cần");
  await prisma.attendance.createMany({
    data: a.schedules.map((s, i) => ({ scheduleId: s.id, memberId: member.memberProfileId!, status: i === 0 ? "PRESENT" : "EXCUSED" })),
  });
  const summary = await http("GET", "/attendance/my/summary", { token: member.token });
  const bucketA = summary.body.data.buckets.find((x: any) => x.classId === a.cls.id);
  check("khóa A: 1 có mặt + 1 có phép ⇒ tỷ lệ 100%, mẫu 1 buổi", bucketA?.attendanceRate === 100 && bucketA?.sampleSize === 1, bucketA);

  group("5. Hồ sơ học viên của HLV (BE-19)");
  const student = await http("GET", `/coaches/me/students/${member.memberProfileId}`, { token: coach.token });
  check("200 + 2 khóa", student.status === 200 && student.body.data.classes.length === 2, student.body);
  const studentA = student.body.data.classes?.find((c: any) => c.classId === a.cls.id);
  check("khóa A: EXCUSED không tính vào số buổi đã qua", studentA?.attended === 1 && studentA?.pastSessions === 1 && studentA?.excused === 1, studentA);
  const notMine = await http("GET", `/coaches/me/students/${member.memberProfileId}`, { token: otherCoach.token });
  check("HLV khác ⇒ 403", notMine.status === 403);

  group("6. Học viên của khóa + doanh thu thật (L12)");
  const roster = await http("GET", `/classes/${b.cls.id}/students`, { token: coach.token });
  check("200 + 2 học viên", roster.status === 200 && roster.body.data.students.length === 2, roster.body);
  check("doanh thu gộp = 2 × 2.000.000, HLV nhận 85%", roster.body.data?.grossRevenue === 4_000_000 && roster.body.data.coachRevenue === 3_400_000, roster.body.data);
  const rosterOther = await http("GET", `/classes/${b.cls.id}/students`, { token: otherCoach.token });
  check("HLV khác ⇒ 403", rosterOther.status === 403);
  const rosterManager = await http("GET", `/classes/${b.cls.id}/students`, { token: manager.token });
  check("Manager xem được", rosterManager.status === 200);
}

runSuite("wallet-attendance", main, cleanupRun);
