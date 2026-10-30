/**
 * Smoke test đợt "thu hẹp phạm vi Gym" (Doc/GYM_SCOPE_CHANGES.md) — chạy trên BE LOCAL đang chạy:
 *   npm run dev:local            # cửa sổ 1
 *   npm run test:gym:local       # cửa sổ 2
 * Chỉ dùng DB local (wrapper with-local-env từ chối DB không phải localhost).
 */
import { prisma } from "../src/config/prisma.js";

const BASE = process.env.SMOKE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8081}/api/v1`;
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  }
}

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, body: json };
}

async function login(email: string, password: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.body)}`);
  return r.body.data.accessToken as string;
}

const iso = (d: Date) => d.toISOString();
const addDays = (n: number, h = 18) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(h - 7, 0, 0, 0); // giờ VN
  return d;
};

async function main() {
  console.log(`[gym-scope] ${BASE}`);
  const coach = await login("coach1@sportscenter.com", "Coach@123");
  const member = await login("member1@example.com", "Member@123");
  const manager = await login("manager@sportscenter.com", "Manager@123");

  console.log("• Tiếng Việt");
  const bad = await call("POST", "/auth/login", undefined, { email: "khong-ton-tai@example.com", password: "sai" });
  check("lỗi đăng nhập trả tiếng Việt", /Email hoặc mật khẩu/.test(bad.body.message), bad.body);
  const v = await call("PATCH", "/auth/me", member, { fullName: "A" });
  check("lỗi validate field tiếng Việt", v.status === 400 && /Tối thiểu|ký tự/.test(v.body.errors?.[0]?.message ?? ""), v.body);
  const nfd = "Giảm mỡ".normalize("NFD");
  const n = await call("PATCH", "/auth/me", member, { fitnessGoal: nfd });
  check("chuẩn hoá NFC khi lưu", n.body.data?.memberProfile?.fitnessGoal === "Giảm mỡ".normalize("NFC"), n.body);

  console.log("• Thông tin trung tâm & mục tiêu");
  const center = await call("GET", "/center");
  check("GET /center công khai", center.status === 200 && !!center.body.data?.mapLink, center.body);
  const upd = await call("PUT", "/center", manager, { ...center.body.data, mapUrl: "", email: "" });
  check("PUT /center (Manager)", upd.status === 200, upd.body);
  const goals = await call("GET", "/classes/goal-options");
  check("GET /classes/goal-options", goals.status === 200 && goals.body.data.length >= 10, goals.body);
  const me = await call("PATCH", "/auth/me", member, { fitnessGoals: ["WEIGHT_LOSS", "GYM_FOUNDATION"], trainingLevel: "BEGINNER" });
  check("Member lưu mục tiêu gợi ý", me.body.data?.memberProfile?.fitnessGoals?.length === 2, me.body);

  console.log("• Bản nháp → gửi duyệt (ngày kết thúc tự tính)");
  const draft = await call("POST", "/classes/drafts", coach, { name: "Nháp smoke", draftData: { step: 1 } });
  check("tạo bản nháp", draft.status === 201 && draft.body.data.status === "DRAFT", draft.body);
  const draftId = draft.body.data?.id;
  const asMember = await call("GET", `/classes/${draftId}`, member);
  check("Member không thấy bản nháp", asMember.status === 404, asMember.body);
  const mgrList = await call("GET", "/classes?limit=100", manager);
  check("Manager không thấy bản nháp", !mgrList.body.data.some((c: any) => c.id === draftId), mgrList.body.data?.length);
  const saved = await call("PATCH", `/classes/drafts/${draftId}`, coach, { goalTags: ["WEIGHT_LOSS"], draftData: { step: 2 } });
  check("tự lưu bản nháp", saved.status === 200 && saved.body.data.draftData?.step === 2, saved.body);
  const room = (await prisma.room.findFirst({ where: { isActive: true, areaType: "INDOOR", capacity: { gte: 10 } } }))!;
  const noGoal = await call("POST", `/classes/drafts/${draftId}/submit`, coach, {
    class: { name: "Smoke Gym", capacity: 10, price: 800000 },
    roomId: room.id,
    recurrence: { startDate: addDays(40).toISOString().slice(0, 10), weekdays: [2, 4, 6], startTime: "05:00", endTime: "06:00", totalSessions: 6 },
  });
  check("gửi duyệt thiếu mục tiêu ⇒ 400", noGoal.status === 400 && noGoal.body.errors?.code === "CLASS_GOALS_REQUIRED", noGoal.body);
  const submit = await call("POST", `/classes/drafts/${draftId}/submit`, coach, {
    class: { name: "Smoke Gym", capacity: 10, price: 800000, goalTags: ["WEIGHT_LOSS", "ENDURANCE"], targetLevel: "BEGINNER", goal: "Giảm 3kg" },
    roomId: room.id,
    recurrence: { startDate: addDays(40).toISOString().slice(0, 10), weekdays: [2, 4, 6], startTime: "05:00", endTime: "06:00", totalSessions: 6 },
  });
  check("gửi duyệt bản nháp ⇒ PENDING", submit.status === 200 && submit.body.data.status === "PENDING", submit.body);
  const cls = await prisma.class.findUnique({ where: { id: draftId } });
  check("lưu startDate/endDate", !!cls?.startDate && !!cls?.endDate && cls.endDate > cls.startDate, cls);
  check("xóa draftData sau khi gửi", cls?.draftData === null, cls?.draftData);
  await call("PATCH", `/classes/${draftId}/review`, manager, { action: "APPROVE" });

  console.log("• Độ phù hợp mục tiêu");
  const detail = await call("GET", `/classes/${draftId}`, member);
  check("goalMatch HIGH", detail.body.data?.goalMatch?.level === "HIGH", detail.body.data?.goalMatch);
  const matched = await call("GET", "/classes?matchMyGoals=true&limit=50", member);
  check("lọc phù hợp với tôi", matched.status === 200 && matched.body.data.every((c: any) => (c.goalMatch?.score ?? 0) > 0), matched.body);
  const plan = await call("GET", `/classes/${draftId}/course-plan`, member);
  check("course-plan có goalTags + vị trí phòng", plan.body.data?.course?.goalTags?.length === 2 && "floor" in (plan.body.data?.sessions?.[0]?.room ?? {}), plan.body.data?.course);
  const search = await call("GET", "/classes?search=smoke%20gym", member);
  check("tìm không phân biệt hoa thường", search.body.data?.some((c: any) => c.id === draftId), search.body.data?.length);

  console.log("• Hồ sơ công khai HLV");
  const coachProfileId = cls!.coachId;
  const profile = await call("GET", `/coaches/${coachProfileId}/profile`);
  check("GET /coaches/:id/profile", profile.status === 200 && !("email" in profile.body.data) && profile.body.data.courses.length > 0, profile.body);

  console.log("• Dời lịch buổi học");
  const sessions = await prisma.classSchedule.findMany({ where: { classId: draftId }, orderBy: { startTime: "asc" } });
  const first = sessions[0];
  const newStart = new Date(first.startTime.getTime() + 2 * 3_600_000);
  const tooSoon = await call("POST", `/class-schedules/${first.id}/reschedule`, coach, {
    startTime: iso(new Date(Date.now() + 3_600_000)),
    endTime: iso(new Date(Date.now() + 2 * 3_600_000)),
    reason: "Bận",
  });
  check("giờ mới < 24h ⇒ 400", tooSoon.status === 400 && tooSoon.body.errors?.code === "RESCHEDULE_NEW_TIME_TOO_SOON", tooSoon.body);
  const moved = await call("POST", `/class-schedules/${first.id}/reschedule`, coach, {
    startTime: iso(newStart),
    endTime: iso(new Date(newStart.getTime() + 3_600_000)),
    reason: "HLV có lịch thi chứng chỉ",
  });
  check("dời lịch thành công", moved.status === 200 && moved.body.data.rescheduleCount === 1, moved.body);
  const after = await prisma.classSchedule.findUnique({ where: { id: first.id } });
  check("lưu giờ gốc + lý do", after?.originalStartTime?.getTime() === first.startTime.getTime() && !!after?.rescheduleReason, after);

  console.log("• Đánh giá: chỉ khi học xong");
  const fb = await call("POST", "/feedbacks", member, { coachId: coachProfileId, classId: draftId, rating: 5 });
  check("chưa học xong ⇒ 403", fb.status === 403 && fb.body.errors?.code === "COURSE_NOT_COMPLETED", fb.body);
  const noClass = await call("POST", "/feedbacks", member, { coachId: coachProfileId, rating: 5 });
  check("thiếu classId ⇒ 400", noClass.status === 400, noClass.body);

  console.log("• Hủy khóa: xem trước có hoàn ngoại lệ");
  const preview = await call("GET", `/refunds/course-cancellation/preview?classId=${draftId}`, member);
  check("preview trả về", preview.status === 200, preview.body);

  // ── Các luồng có thanh toán (SePay mock) ──────────────────────────────────
  const member2 = await login("member2@example.com", "Member@123");
  const ptRoom = (await prisma.room.findFirst({ where: { isActive: true, areaType: "INDOOR", capacity: { gte: 8 } }, orderBy: { capacity: "asc" } }))!;
  const createdClassIds: string[] = [draftId];

  async function openClass(name: string, plan: Record<string, unknown>, price = 800000, classType = "REGULAR") {
    const d = await call("POST", "/classes/drafts", coach, { name });
    const id = d.body.data.id as string;
    createdClassIds.push(id);
    const r = await call("POST", `/classes/drafts/${id}/submit`, coach, {
      class: { name, capacity: 8, price, classType, goalTags: ["STRENGTH"] },
      roomId: ptRoom.id,
      ...plan,
    });
    if (r.status !== 200) throw new Error(`submit ${name}: ${JSON.stringify(r.body)}`);
    await call("PATCH", `/classes/${id}/review`, manager, { action: "APPROVE" });
    return id;
  }
  async function buy(token: string, classId: string) {
    const c = await call("POST", "/payments/sepay/checkout", token, { classId });
    const paymentId = c.body.data?.paymentId ?? c.body.data?.id ?? c.body.errors?.paymentId;
    const m = await call("POST", "/payments/sepay/mock-confirm", token, { paymentId });
    if (m.status !== 200) throw new Error(`buy ${classId}: ${JSON.stringify(c.body)} ${JSON.stringify(m.body)}`);
    return paymentId as string;
  }

  console.log("• Snapshot giao dịch: đổi giá/tên khóa không ảnh hưởng lịch sử");
  const classA = await openClass("Smoke A", {
    recurrence: { startDate: addDays(20).toISOString().slice(0, 10), weekdays: [1, 3, 5], startTime: "05:00", endTime: "06:00", totalSessions: 4 },
  });
  const classB = await openClass("Smoke B (tương đương)", {
    recurrence: { startDate: addDays(21).toISOString().slice(0, 10), weekdays: [2, 4], startTime: "05:00", endTime: "06:00", totalSessions: 4 },
  });
  const payA = await buy(member2, classA);
  await call("PATCH", `/classes/${classA}`, manager, { price: 999000, name: "Smoke A (đổi tên)" });
  const hist = await call("GET", "/enrollments/my/courses?limit=50", member2);
  const rowA = hist.body.data?.find((r: any) => r.classId === classA);
  check("lịch sử giữ giá & tên lúc mua", rowA?.class?.price === 800000 && rowA?.class?.name === "Smoke A", rowA?.class);
  const payRow = await prisma.payment.findUnique({ where: { id: payA } });
  check("Payment.purchaseSnapshot đã lưu", (payRow?.purchaseSnapshot as any)?.name === "Smoke A", payRow?.purchaseSnapshot);

  console.log("• Đổi buổi sang khóa tương đương");
  const enrA = await prisma.enrollment.findFirst({
    where: { member: { user: { email: "member2@example.com" } }, status: "BOOKED", schedule: { classId: classA } },
    orderBy: { schedule: { startTime: "asc" } },
  });
  const opts = await call("GET", `/enrollments/${enrA!.id}/transfer-options`, member2);
  const sister = opts.body.data?.options?.find((o: any) => o.classId === classB && o.canSelect);
  check("transfer-options có buổi khóa tương đương", !!sister && opts.body.data.transfersLeft === 2, opts.body.data);
  const tr = await call("POST", `/enrollments/${enrA!.id}/transfer`, member2, { targetScheduleId: sister?.scheduleId });
  check("đổi buổi thành công", tr.status === 200 || tr.status === 201, tr.body);
  const moved2 = await prisma.enrollment.findFirst({ where: { scheduleId: sister?.scheduleId, member: { user: { email: "member2@example.com" } } } });
  check("ghi sourceClassId + transferredFromId", moved2?.sourceClassId === classA && moved2?.transferredFromId === enrA!.id, moved2);

  console.log("• HLV dời buổi ⇒ hội viên hủy được hoàn 100%");
  const enrA2 = await prisma.enrollment.findFirst({
    where: { member: { user: { email: "member2@example.com" } }, status: "BOOKED", schedule: { classId: classA } },
    include: { schedule: true },
    orderBy: { schedule: { startTime: "asc" } },
  });
  const ns = new Date(enrA2!.schedule.startTime.getTime() + 3 * 3_600_000);
  const rs = await call("POST", `/class-schedules/${enrA2!.scheduleId}/reschedule`, coach, {
    startTime: iso(ns), endTime: iso(new Date(ns.getTime() + 3_600_000)), reason: "Đổi giờ theo lịch HLV",
  });
  check("dời buổi có học viên", rs.status === 200 && rs.body.data.affectedMembers >= 1, rs.body);
  const cancel = await call("DELETE", `/enrollments/${enrA2!.id}`, member2);
  const perSession = Math.round(800000 / 4);
  check("hoàn 100% buổi bị dời (SESSION_RESCHEDULED)", cancel.body.data?.refund?.reason === "SESSION_RESCHEDULED" && Number(cancel.body.data.refund.amount) === perSession, cancel.body.data?.refund);

  console.log("• Hủy khóa < 3 ngày: yêu cầu hoàn ngoại lệ + Manager duyệt kèm phí");
  const soon = new Date(Date.now() + 30 * 3_600_000);
  soon.setUTCMinutes(23, 0, 0);
  const classC = await openClass(
    "Smoke C (sắp khai giảng)",
    {
      schedules: [0, 2, 4, 6].map((k) => {
        const st = new Date(soon.getTime() + k * 24 * 3_600_000);
        return { startTime: iso(st), endTime: iso(new Date(st.getTime() + 3_600_000)) };
      }),
    },
    1_000_000
  );
  await buy(member2, classC);
  const pv = await call("GET", `/refunds/course-cancellation/preview?classId=${classC}`, member2);
  check("preview: hủy muộn có lateRefund", pv.body.data?.refundPercent === 0 && pv.body.data?.lateRefund?.available === true, pv.body.data);
  const late = await call("POST", "/refunds/course-cancellation", member2, { classId: classC, lateRefund: true, note: "Chuyển công tác" });
  check("gửi yêu cầu hoàn ngoại lệ", late.status === 201 && late.body.data?.mode === "LATE_REFUND_REQUESTED", late.body);
  const refundId = late.body.data?.refund?.id;
  const ok = await call("PATCH", `/refunds/${refundId}/approve`, manager, { feePercent: 20, transactionRef: "FT-SMOKE" });
  check("Manager duyệt, phí 20% ⇒ hoàn 800.000đ", ok.status === 200 && Number(ok.body.data?.amount) === 800000 && ok.body.data?.feePercent === 20, ok.body.data);

  console.log("• Đánh giá: 1 lần + sửa đúng 1 lần");
  // Giả lập khóa A đã kết thúc (đưa mọi buổi về quá khứ) để kiểm luật đánh giá.
  const past = await prisma.classSchedule.findMany({ where: { classId: classA }, orderBy: { startTime: "asc" } });
  for (const [i, sc] of past.entries()) {
    const st = new Date(Date.now() - (30 - i) * 24 * 3_600_000);
    await prisma.classSchedule.update({ where: { id: sc.id }, data: { startTime: st, endTime: new Date(st.getTime() + 3_600_000), status: sc.status === "CANCELLED" ? "CANCELLED" : "COMPLETED" } });
  }
  const f1 = await call("POST", "/feedbacks", member2, { coachId: coachProfileId, classId: classA, rating: 4, comment: "Tốt" });
  check("đánh giá lần đầu", f1.status === 201 || f1.status === 200, f1.body);
  const f2 = await call("POST", "/feedbacks", member2, { coachId: coachProfileId, classId: classA, rating: 5, comment: "Rất tốt" });
  check("sửa lần 1", (f2.status === 201 || f2.status === 200) && f2.body.data?.editCount === 1, f2.body);
  const f3 = await call("POST", "/feedbacks", member2, { coachId: coachProfileId, classId: classA, rating: 3 });
  check("sửa lần 2 ⇒ 409", f3.status === 409 && f3.body.errors?.code === "FEEDBACK_EDIT_LIMIT", f3.body);
  const del = await call("DELETE", `/feedbacks/${f1.body.data?.id}`, member2);
  check("member không tự xóa được", del.status === 403, del.body);

  // Dọn dữ liệu smoke (theo thứ tự khóa ngoại).
  await prisma.coachFeedback.deleteMany({ where: { classId: { in: createdClassIds } } });
  await prisma.refund.deleteMany({ where: { classId: { in: createdClassIds } } });
  await prisma.walletTransaction.deleteMany({ where: { classId: { in: createdClassIds } } });
  await prisma.attendance.deleteMany({ where: { schedule: { classId: { in: createdClassIds } } } });
  await prisma.enrollment.deleteMany({ where: { schedule: { classId: { in: createdClassIds } } } });
  const pays = await prisma.payment.findMany({ where: { classId: { in: createdClassIds } }, select: { id: true } });
  await prisma.sepayBankTransaction.updateMany({ where: { paymentId: { in: pays.map((p) => p.id) } }, data: { paymentId: null } });
  await prisma.sepayWebhookEvent.updateMany({ where: { paymentId: { in: pays.map((p) => p.id) } }, data: { paymentId: null } });
  await prisma.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
  await prisma.classSchedule.updateMany({ where: { classId: { in: createdClassIds } }, data: { makeupForId: null } });
  await prisma.classSchedule.deleteMany({ where: { classId: { in: createdClassIds } } });
  await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } });

  console.log(`\n[gym-scope] ${passed} pass / ${failed} fail`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
