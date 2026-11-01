/**
 * E2E: Báo vắng · Học bù · Đổi buổi cho học viên (Doc/MAKEUP_ABSENCE_PLAN.md).
 *
 * Chạy: npm run test:local -- makeup-absence
 */
import { prisma } from "../src/config/prisma.js";
import { check, group, http, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createUser, login, purchase } from "./helpers/fixtures.js";

const REASON = "Bị ốm, bác sĩ cho nghỉ";

async function enrollmentOf(memberProfileId: string, scheduleId: string) {
  return prisma.enrollment.findUniqueOrThrow({ where: { memberId_scheduleId: { memberId: memberProfileId, scheduleId } } });
}

async function main() {
  const coach = await login(await createUser("COACH"));
  const member = await login(await createUser("MEMBER"));
  const other = await login(await createUser("MEMBER"));

  const course = await createClass(coach, {
    sessions: [{ startInHours: 48 }, { startInHours: 72 }, { startInHours: 96 }, { startInHours: -0.25, hours: 1 }],
  });
  const [s1, s2, s3, started] = course.schedules;
  await purchase(member, course.cls, course.schedules.map((s) => s.id));
  const e1 = await enrollmentOf(member.memberProfileId!, s1.id);
  const e2 = await enrollmentOf(member.memberProfileId!, s2.id);
  const e3 = await enrollmentOf(member.memberProfileId!, s3.id);
  const eStarted = await enrollmentOf(member.memberProfileId!, started.id);

  const report = (id: string, by = member, reason = REASON) =>
    http("POST", `/enrollments/${id}/absence`, { token: by.token, body: { reason } });

  group("1. Báo vắng (GĐ1)");
  const r1 = await report(e1.id);
  check("báo vắng ⇒ 201 + EXCUSED + còn 1/2 lượt", r1.status === 201 && r1.body.data.attendance.status === "EXCUSED" && r1.body.data.absence.left === 1, r1.body);
  check("bản ghi đánh dấu học viên tự báo + lý do", r1.body.data?.attendance?.reportedByMember === true && r1.body.data.attendance.absenceReason === REASON, r1.body.data?.attendance);
  const stillBooked = await prisma.enrollment.findUniqueOrThrow({ where: { id: e1.id } });
  check("chỗ vẫn giữ (BOOKED), không hoàn tiền", stillBooked.status === "BOOKED" && (await prisma.refund.count({ where: { scheduleId: s1.id } })) === 0, stillBooked.status);
  await new Promise((r) => setTimeout(r, 300));
  const notice = await prisma.notification.findFirst({ where: { userId: coach.id, type: "MEMBER_ABSENCE" }, orderBy: { createdAt: "desc" } });
  check("HLV nhận thông báo báo vắng (kèm lý do)", !!notice && notice.body.includes(REASON), notice);

  const dup = await report(e1.id);
  check("báo lại ⇒ 409 ABSENCE_ALREADY_REPORTED", dup.status === 409 && dup.body.errors?.code === "ABSENCE_ALREADY_REPORTED", dup.body);
  const short = await report(e2.id, member, "ốm");
  check("lý do < 5 ký tự ⇒ 400", short.status === 400, short.body);
  const foreign = await report(e2.id, other);
  check("báo vắng chỗ của người khác ⇒ 403", foreign.status === 403, foreign.status);
  const byCoach = await report(e2.id, coach);
  check("HLV không gọi được ⇒ 403", byCoach.status === 403, byCoach.status);
  const late = await report(eStarted.id);
  check("buổi đã bắt đầu ⇒ 400 ABSENCE_TOO_LATE", late.status === 400 && late.body.errors?.code === "ABSENCE_TOO_LATE", late.body);

  const r2 = await report(e2.id);
  check("lần 2 ⇒ còn 0 lượt", r2.status === 201 && r2.body.data.absence.left === 0, r2.body);
  const r3 = await report(e3.id);
  check("lần 3 ⇒ 400 ABSENCE_LIMIT", r3.status === 400 && r3.body.errors?.code === "ABSENCE_LIMIT", r3.body);
  const undo = await http("DELETE", `/enrollments/${e2.id}/absence`, { token: member.token });
  check("hủy báo vắng ⇒ trả lại lượt", undo.status === 200 && undo.body.data.absence.left === 1, undo.body);
  const undoAgain = await http("DELETE", `/enrollments/${e2.id}/absence`, { token: member.token });
  check("hủy lần nữa ⇒ 404 ABSENCE_NOT_FOUND", undoAgain.status === 404 && undoAgain.body.errors?.code === "ABSENCE_NOT_FOUND", undoAgain.body);
  const r3b = await report(e3.id);
  check("sau khi hủy, báo vắng buổi khác được", r3b.status === 201, r3b.body);

  group("2. Hiển thị cho HLV / học viên");
  const roster = await http("GET", `/attendance?scheduleId=${s1.id}`, { token: coach.token });
  const row = roster.body.data?.find((a: any) => a.memberId === member.memberProfileId);
  check("roster HLV: reportedByMember + absenceReason", row?.reportedByMember === true && row.absenceReason === REASON, row);
  const mine = await http("GET", "/attendance/my", { token: member.token });
  check("lịch sử của học viên có cờ báo vắng", mine.body.data?.some((a: any) => a.scheduleId === s1.id && a.reportedByMember === true), mine.body.data);

  group("3. Đổi buổi khi không có buổi đích (emptyReason)");
  const opts = await http("GET", `/enrollments/${e1.id}/transfer-options`, { token: member.token });
  check("khóa chưa có buổi bù / khóa tương đương ⇒ NO_MAKEUP_OR_EQUIVALENT", opts.status === 200 && opts.body.data.emptyReason === "NO_MAKEUP_OR_EQUIVALENT", opts.body.data);
  check("kèm lượt báo vắng của khóa", opts.body.data?.absence?.used === 2 && opts.body.data.absence.max === 2, opts.body.data?.absence);
  const optsLate = await http("GET", `/enrollments/${eStarted.id}/transfer-options`, { token: member.token });
  check("buổi đã bắt đầu ⇒ NOT_AVAILABLE", optsLate.body.data?.emptyReason === "NOT_AVAILABLE", optsLate.body.data);

  group("4. Hủy chỗ xóa báo vắng; vẫn đến lớp thì tự điểm danh được");
  const cancel = await http("DELETE", `/enrollments/${e3.id}`, { token: member.token });
  const leftover = await prisma.attendance.count({ where: { scheduleId: s3.id, memberId: member.memberProfileId } });
  check("hủy buổi đã báo vắng ⇒ bản ghi báo vắng bị xóa", cancel.status === 200 && leftover === 0, { status: cancel.status, leftover });

  const soonCourse = await createClass(coach, { sessions: [{ startInHours: 0.25 }] });
  const soon = soonCourse.schedules[0];
  await purchase(member, soonCourse.cls, [soon.id]);
  const eSoon = await enrollmentOf(member.memberProfileId!, soon.id);
  const rSoon = await report(eSoon.id);
  const qr = await http("POST", "/attendance/generate-qr", { token: coach.token, body: { scheduleId: soon.id } });
  const self = await http("POST", "/attendance/scan-qr", { token: member.token, body: { qrToken: qr.body.data?.qrToken } });
  check("báo vắng rồi vẫn đến ⇒ tự quét QR ghi đè thành PRESENT", rSoon.status === 201 && self.status === 200 && self.body.data.status === "PRESENT", self.body);

  await phase2();
}

/** GĐ2: yêu cầu học bù, buổi bù mở, chỗ khách, từ chối + hoàn, hết hạn. */
async function phase2() {
  const coach = await login(await createUser("COACH"));
  const otherCoach = await login(await createUser("COACH"));
  const [a, b, c, d] = await Promise.all([1, 2, 3, 4].map(async () => login(await createUser("MEMBER"))));
  const course = await createClass(coach, {
    price: 4_000_000,
    sessions: [{ startInHours: 48 }, { startInHours: 72 }, { startInHours: 96 }, { startInHours: 120 }],
  });
  const [p1, p2, p3] = course.schedules;
  const twin = await createClass(coach, { capacity: 10, sessions: [{ startInHours: 60 }] }); // khóa tương đương, chỗ khách = 1
  const q1 = twin.schedules[0];
  for (const m of [a, b, c, d]) await purchase(m, course.cls, course.schedules.map((s) => s.id));
  const enr = (m: typeof a, s: { id: string }) => enrollmentOf(m.memberProfileId!, s.id);
  const absent = (m: typeof a, enrollmentId: string, requestMakeup = true) =>
    http("POST", `/enrollments/${enrollmentId}/absence`, { token: m.token, body: { reason: REASON, requestMakeup } });

  group("5. Xin học bù khi báo vắng (GĐ2)");
  const ea1 = await enr(a, p1);
  const ra = await absent(a, ea1.id);
  const reqA = ra.body.data?.makeupRequestId as string;
  const rowA = reqA ? await prisma.makeupRequest.findUnique({ where: { id: reqA } }) : null;
  check("báo vắng + xin học bù ⇒ yêu cầu PENDING, đủ điều kiện hoàn (≥ 24h)", ra.status === 201 && rowA?.status === "PENDING" && rowA.refundEligible === true, ra.body);
  await new Promise((r) => setTimeout(r, 300));
  check("HLV nhận MAKEUP_REQUESTED", (await prisma.notification.count({ where: { userId: coach.id, type: "MAKEUP_REQUESTED" } })) === 1);
  const list = await http("GET", "/makeup-requests?status=PENDING", { token: coach.token });
  check("HLV thấy yêu cầu trong danh sách", list.status === 200 && list.body.data.some((x: any) => x.id === reqA && x.missedSession?.id === p1.id), list.body);
  const foreign = await http("GET", `/makeup-requests/${reqA}/options`, { token: otherCoach.token });
  check("HLV khóa khác không xử lý được ⇒ 403", foreign.status === 403, foreign.status);
  const optsMember = await http("GET", `/makeup-requests/${reqA}/options`, { token: a.token });
  check("học viên: chưa có buổi bù mở ⇒ danh sách trống", optsMember.status === 200 && optsMember.body.data.options.length === 0, optsMember.body.data);
  const optsCoach = await http("GET", `/makeup-requests/${reqA}/options`, { token: coach.token });
  const qOpt = optsCoach.body.data?.options?.find((o: any) => o.scheduleId === q1.id);
  check("HLV: thấy buổi khóa tương đương (khác khóa, chọn được)", qOpt?.isSameClass === false && qOpt.canSelect === true, optsCoach.body.data);

  group("6. HLV mở buổi bù + xếp luôn");
  const start = new Date(Date.now() + 100 * 3_600_000);
  const slotRes = await http("POST", "/makeup-requests/slots", {
    token: coach.token,
    body: {
      classId: course.cls.id,
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 3_600_000).toISOString(),
      roomId: course.roomId,
      capacity: 2,
      assignRequestIds: [reqA],
    },
  });
  const slotId = slotRes.body.data?.slot?.id as string;
  check("mở buổi bù ⇒ 201 + xếp được yêu cầu", slotRes.status === 201 && slotRes.body.data.assigned.includes(reqA), slotRes.body);
  const slotRow = slotId ? await prisma.classSchedule.findUnique({ where: { id: slotId } }) : null;
  check("buổi bù mở: isMakeupSlot + sức chứa riêng", slotRow?.isMakeupSlot === true && slotRow.slotCapacity === 2, slotRow);
  const aSlot = slotId ? await enr(a, { id: slotId }) : null;
  check("học viên A có chỗ ở buổi bù (makeupRequestId), chỗ buổi vắng vẫn giữ", aSlot?.makeupRequestId === reqA && (await prisma.enrollment.findUniqueOrThrow({ where: { id: ea1.id } })).status === "BOOKED", aSlot);
  const detail = await http("GET", `/classes/${course.cls.id}`, { token: coach.token });
  check("buổi bù không tính vào số buổi của khóa", detail.body.data?._count?.schedules === 4, detail.body.data?._count);
  const tooSoon = await http("POST", "/makeup-requests/slots", {
    token: coach.token,
    body: { classId: course.cls.id, startTime: new Date(Date.now() + 30 * 60_000).toISOString(), endTime: new Date(Date.now() + 90 * 60_000).toISOString(), roomId: course.roomId },
  });
  check("mở buổi bù sát giờ (< 2h) ⇒ 400 SLOT_TOO_SOON", tooSoon.status === 400 && tooSoon.body.errors?.code === "SLOT_TOO_SOON", tooSoon.body);
  const bookSlot = await http("POST", "/enrollments", { token: b.token, body: { scheduleId: slotId } });
  check("đặt thẳng buổi bù ⇒ 400 MAKEUP_SLOT_NOT_BOOKABLE", bookSlot.status === 400 && bookSlot.body.errors?.code === "MAKEUP_SLOT_NOT_BOOKABLE", bookSlot.body);

  group("7. Học viên tự chọn buổi bù; buổi đầy; chỗ khách");
  const rb = await absent(b, (await enr(b, p2)).id);
  const reqB = rb.body.data?.makeupRequestId as string;
  const optsB = await http("GET", `/makeup-requests/${reqB}/options`, { token: b.token });
  check("học viên thấy buổi bù mở của khóa", optsB.body.data?.options?.some((o: any) => o.scheduleId === slotId && o.canSelect), optsB.body.data);
  const chooseB = await http("POST", `/makeup-requests/${reqB}/assign`, { token: b.token, body: { scheduleId: slotId } });
  check("tự chọn buổi bù ⇒ SCHEDULED", chooseB.status === 200 && chooseB.body.data.status === "SCHEDULED", chooseB.body);
  const chooseOther = await http("POST", `/makeup-requests/${reqB}/assign`, { token: b.token, body: { scheduleId: q1.id } });
  check("yêu cầu đã xếp ⇒ 409 MAKEUP_NOT_PENDING", chooseOther.status === 409, chooseOther.body);

  const rc = await absent(c, (await enr(c, p2)).id);
  const reqC = rc.body.data?.makeupRequestId as string;
  const optsC = await http("GET", `/makeup-requests/${reqC}/options`, { token: c.token });
  const slotForC = optsC.body.data?.options?.find((o: any) => o.scheduleId === slotId);
  check("buổi bù đủ 2 chỗ ⇒ không chọn được", slotForC?.isFull === true && slotForC.canSelect === false, slotForC);
  const memberToQ = await http("POST", `/makeup-requests/${reqC}/assign`, { token: c.token, body: { scheduleId: q1.id } });
  check("học viên không tự chọn buổi khóa khác ⇒ 400", memberToQ.status === 400 && memberToQ.body.errors?.code === "MAKEUP_TARGET_NOT_ELIGIBLE", memberToQ.body);
  const coachToQ = await http("POST", `/makeup-requests/${reqC}/assign`, { token: coach.token, body: { scheduleId: q1.id } });
  const cQ = await enr(c, q1);
  check("HLV xếp sang khóa tương đương ⇒ chỗ mới ghi khóa đã trả tiền", coachToQ.status === 200 && cQ.sourceClassId === course.cls.id, { status: coachToQ.status, cQ });

  const rd = await absent(d, (await enr(d, p2)).id);
  const reqD = rd.body.data?.makeupRequestId as string;
  const dToQ = await http("POST", `/makeup-requests/${reqD}/assign`, { token: coach.token, body: { scheduleId: q1.id } });
  check("chỗ khách của buổi chính đã đủ (1/10) ⇒ 409 GUEST_SEATS_FULL", dToQ.status === 409 && dToQ.body.errors?.code === "GUEST_SEATS_FULL", dToQ.body);

  group("8. Từ chối / hết hạn ⇒ hoàn 80%; rút yêu cầu");
  const rej = await http("POST", `/makeup-requests/${reqD}/reject`, { token: coach.token, body: { reason: "Không còn buổi phù hợp" } });
  const refundD = await prisma.refund.findFirst({ where: { memberId: d.memberProfileId, scheduleId: p2.id } });
  check("từ chối ⇒ REJECTED + tạo hoàn MEMBER_CANCEL_SESSION", rej.status === 200 && rej.body.data.request.status === "REJECTED" && refundD?.reason === "MEMBER_CANCEL_SESSION" && rej.body.data.refund?.id === refundD.id, { body: rej.body, refundD });
  check("số tiền hoàn = 80% tiền 1 buổi (4.000.000 ÷ 4)", Number(refundD?.amount) === 800_000, refundD?.amount);

  const ra3 = await absent(a, (await enr(a, p3)).id);
  const reqA3 = ra3.body.data?.makeupRequestId as string;
  await prisma.makeupRequest.update({ where: { id: reqA3 }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await http("GET", "/makeup-requests/my", { token: a.token });
  const expired = await prisma.makeupRequest.findUniqueOrThrow({ where: { id: reqA3 } });
  check("quá hạn ⇒ EXPIRED + hoàn", expired.status === "EXPIRED" && !!expired.refundId, expired);

  const eb3 = await enr(b, p3);
  const noAbsence = await http("POST", `/enrollments/${eb3.id}/makeup-request`, { token: b.token });
  check("xin học bù khi chưa báo vắng ⇒ 400 ABSENCE_REQUIRED", noAbsence.status === 400 && noAbsence.body.errors?.code === "ABSENCE_REQUIRED", noAbsence.body);
  await absent(b, eb3.id, false);
  const later = await http("POST", `/enrollments/${eb3.id}/makeup-request`, { token: b.token });
  const dupReq = await http("POST", `/enrollments/${eb3.id}/makeup-request`, { token: b.token });
  check("báo vắng rồi xin học bù sau ⇒ 201; xin lại ⇒ 409", later.status === 201 && dupReq.status === 409 && dupReq.body.errors?.code === "MAKEUP_ALREADY_REQUESTED", { later: later.body, dup: dupReq.body });
  const withdraw = await http("DELETE", `/makeup-requests/${later.body.data?.id}`, { token: b.token });
  check("rút yêu cầu đang chờ ⇒ CANCELLED", withdraw.status === 200 && withdraw.body.data.status === "CANCELLED", withdraw.body);

  group("9. Chỗ học bù với hủy / đổi buổi");
  const undoA = await http("DELETE", `/enrollments/${ea1.id}/absence`, { token: a.token });
  check("đã xếp học bù ⇒ không hủy báo vắng được (409)", undoA.status === 409 && undoA.body.errors?.code === "MAKEUP_ALREADY_SCHEDULED", undoA.body);
  const bSlot = await enr(b, { id: slotId });
  const moveB = await http("POST", `/enrollments/${bSlot.id}/transfer`, { token: b.token, body: { targetScheduleId: q1.id } });
  check("chỗ học bù không đổi buổi được", moveB.status === 400 && moveB.body.errors?.code === "MAKEUP_ENROLLMENT_NOT_TRANSFERABLE", moveB.body);
  const tOpts = await http("GET", `/enrollments/${(await enr(a, p2)).id}/transfer-options`, { token: a.token });
  check("đổi buổi thường không thấy buổi bù mở", !tOpts.body.data?.options?.some((o: any) => o.scheduleId === slotId), tOpts.body.data?.options);
  const dropA = await http("DELETE", `/enrollments/${aSlot!.id}`, { token: a.token });
  const reqAAfter = await prisma.makeupRequest.findUniqueOrThrow({ where: { id: reqA } });
  check("hủy chỗ học bù ⇒ yêu cầu CANCELLED", dropA.status === 200 && reqAAfter.status === "CANCELLED", { status: dropA.status, req: reqAAfter.status });
  const undoA2 = await http("DELETE", `/enrollments/${ea1.id}/absence`, { token: a.token });
  check("sau đó hủy báo vắng được", undoA2.status === 200, undoA2.body);
}

void runSuite("makeup-absence", main, cleanupRun);
