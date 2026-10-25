/**
 * Kiểm thử đợt siết chặt nghiệp vụ (Doc/BUSINESS_HARDENING_PLAN.md) — chạy trên BE LOCAL đang chạy:
 *   npm run dev:local                    # cửa sổ 1
 *   npm run test:hardening:local         # cửa sổ 2
 * Chỉ dùng DB local (wrapper with-local-env từ chối DB không phải localhost). Tự dọn dữ liệu đã tạo.
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
    console.log(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 500));
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

const DAY = 24 * 3_600_000;
const iso = (d: Date) => d.toISOString();

async function main() {
  console.log(`[hardening] ${BASE}`);
  const coach = await login("coach1@sportscenter.com", "Coach@123");
  const manager = await login("manager@sportscenter.com", "Manager@123");
  const m1 = await login("member1@example.com", "Member@123");
  const m2 = await login("member2@example.com", "Member@123");
  const m3 = await login("member3@example.com", "Member@123");
  const memberId = async (email: string) =>
    (await prisma.memberProfile.findFirstOrThrow({ where: { user: { email } }, select: { id: true } })).id;
  const mp1 = await memberId("member1@example.com");
  const mp2 = await memberId("member2@example.com");

  const room = (await prisma.room.findFirst({ where: { isActive: true, areaType: "INDOOR", capacity: { gte: 8 } }, orderBy: { capacity: "asc" } }))!;
  const created: string[] = [];
  // Giờ khác nhau cho từng khóa để không trùng phòng/HLV/lịch hội viên.
  let slot = 0;

  /** Tạo khóa n buổi (mỗi 2 ngày, bắt đầu sau `startInDays`), duyệt; trả id. */
  async function openClass(name: string, n: number, price: number, capacity = 8, opts: { approve?: boolean; startInDays?: number } = {}) {
    const hour = 30 + slot++ * 3; // giờ UTC lệch nhau
    const base = new Date(Date.now() + (opts.startInDays ?? 10) * DAY);
    const dayShift = opts.startInDays === undefined ? Math.floor(hour / 24) : 0;
    if (opts.startInDays === undefined) base.setUTCHours(hour % 24, 0, 0, 0);
    else base.setUTCSeconds(0, 0);
    const d = await call("POST", "/classes/drafts", coach, { name });
    const id = d.body.data.id as string;
    created.push(id);
    // Trùng lịch có sẵn của HLV/phòng (dữ liệu seed, phụ thuộc giờ chạy) ⇒ dời 2 giờ rồi thử lại.
    let r: Awaited<ReturnType<typeof call>> = { status: 0, body: {} };
    for (let attempt = 0; attempt < 8; attempt++) {
      const shift = attempt * 2 * 3_600_000;
      r = await call("POST", `/classes/drafts/${id}/submit`, coach, {
        class: { name, capacity, price, classType: "REGULAR", goalTags: ["STRENGTH"] },
        roomId: room.id,
        schedules: Array.from({ length: n }, (_, k) => {
          const st = new Date(base.getTime() + shift + (k * 2 + dayShift) * DAY);
          return { startTime: iso(st), endTime: iso(new Date(st.getTime() + 3_600_000)) };
        }),
      });
      if (!["COACH_CONFLICT", "ROOM_CONFLICT"].includes(r.body?.errors?.code)) break;
    }
    if (r.status !== 200) throw new Error(`submit ${name}: ${JSON.stringify(r.body)}`);
    if (opts.approve !== false) {
      const a = await call("PATCH", `/classes/${id}/review`, manager, { action: "APPROVE" });
      if (a.status !== 200) throw new Error(`approve ${name}: ${JSON.stringify(a.body)}`);
    }
    return id;
  }
  /** Đưa `count` buổi đầu của khóa về quá khứ (giả lập khóa đã diễn ra). */
  async function passSessions(classId: string, count: number) {
    const ss = await prisma.classSchedule.findMany({ where: { classId }, orderBy: { startTime: "asc" } });
    for (const [i, s] of ss.slice(0, count).entries()) {
      const st = new Date(Date.now() - (count - i) * DAY);
      await prisma.classSchedule.update({ where: { id: s.id }, data: { startTime: st, endTime: new Date(st.getTime() + 3_600_000) } });
    }
  }
  async function checkout(token: string, classId: string) {
    return call("POST", "/payments/sepay/checkout", token, { classId });
  }
  async function confirm(token: string, paymentId: string) {
    return call("POST", "/payments/sepay/mock-confirm", token, { paymentId });
  }

  try {
    console.log("• Đăng ký muộn: tính tiền theo số buổi còn lại");
    const late = await openClass("HD đăng ký muộn", 6, 600_000);
    await passSessions(late, 2);
    const plan = await call("GET", `/classes/${late}/course-plan`, m1);
    check("course-plan: ON_SALE + báo giá 4/6 buổi = 400.000đ", plan.body.data?.sale?.state === "ON_SALE" && plan.body.data.sale.quote.amount === 400_000 && plan.body.data.sale.quote.sessionsPurchased === 4, plan.body.data?.sale);
    const co = await checkout(m1, late);
    check("checkout: số tiền QR = 400.000đ", co.status === 201 && co.body.data.amount === 400_000, co.body);
    const pay = await prisma.payment.findUnique({ where: { id: co.body.data?.paymentId } });
    const pricing = (pay?.purchaseSnapshot as any)?.pricing;
    check("snapshot lưu bảng tính + người bán/người mua", pricing?.listPrice === 600_000 && pricing?.discount === 200_000 && !!(pay?.purchaseSnapshot as any)?.seller && (pay?.purchaseSnapshot as any)?.buyer?.email === "member1@example.com", pay?.purchaseSnapshot);
    const cf = await confirm(m1, co.body.data.paymentId);
    check("tiền về ⇒ ghi danh 4 buổi", cf.status === 200 && (await prisma.enrollment.count({ where: { memberId: mp1, status: "BOOKED", schedule: { classId: late } } })) === 4, cf.body);
    const again = await checkout(m1, late);
    check("mua lại khi đang sở hữu ⇒ 409 COURSE_ALREADY_PURCHASED", again.status === 409 && again.body.errors?.code === "COURSE_ALREADY_PURCHASED", again.body);
    const inv = await call("GET", `/payments/my/${co.body.data.paymentId}/invoice`, m1);
    const iv = inv.body.data;
    check("hóa đơn: tạm tính 600k − giảm 200k = 400k", inv.status === 200 && iv.subtotal === 600_000 && iv.discount === 200_000 && iv.total === 400_000 && iv.lines.length === 1 && !!iv.discountLabel, iv);
    check("hóa đơn: người khác không xem được", (await call("GET", `/payments/my/${co.body.data.paymentId}/invoice`, m2)).status === 403);
    check("hóa đơn: Manager xem được", (await call("GET", `/payments/${co.body.data.paymentId}/invoice`, manager)).status === 200);
    const enr = await prisma.enrollment.findFirst({ where: { memberId: mp1, status: "BOOKED", schedule: { classId: late } }, orderBy: { schedule: { startTime: "desc" } } });
    const cancelOne = await call("DELETE", `/enrollments/${enr!.id}`, m1);
    check("hủy 1 buổi: hoàn 80% × (400k ÷ 4) = 80.000đ", Number(cancelOne.body.data?.refund?.amount) === 80_000, cancelOne.body.data?.refund);
    const pv = await call("GET", `/refunds/course-cancellation/preview?classId=${late}`, m1);
    check("hủy khóa: mốc 3 ngày theo buổi đầu CỦA HỘI VIÊN (còn ≥ 3 ngày ⇒ hoàn 100%)", pv.body.data?.refundPercent === 100, pv.body.data);

    console.log("• Hạn mở bán");
    const closed = await openClass("HD qua hạn bán", 6, 600_000);
    await passSessions(closed, 3);
    const c2 = await checkout(m2, closed);
    check("đã qua 50% số buổi ⇒ 409 COURSE_SALE_CLOSED", c2.status === 409 && c2.body.errors?.code === "COURSE_SALE_CLOSED", c2.body);
    const list = await call("GET", "/classes?limit=100", m2);
    check("Member không thấy khóa ngừng bán", !list.body.data.some((c: any) => c.id === closed) && list.body.data.some((c: any) => c.id === late), list.body.data?.length);
    const guest = await call("GET", "/classes?limit=100");
    check("Guest không thấy khóa ngừng bán", !guest.body.data.some((c: any) => c.id === closed));
    const mgr = await call("GET", "/classes?limit=200", manager);
    const mgrRow = mgr.body.data.find((c: any) => c.id === closed);
    check("Manager vẫn thấy + nhãn SALE_CLOSED", mgrRow?.summary?.saleState === "SALE_CLOSED", mgrRow?.summary);

    console.log("• Giữ chỗ khi chờ chuyển khoản / hết chỗ khi tiền về");
    const tiny = await openClass("HD 1 chỗ", 4, 400_000, 1);
    const h1 = await checkout(m2, tiny);
    check("người 1 tạo QR", h1.status === 201, h1.body);
    const h2 = await checkout(m3, tiny);
    check("người 2 bị chặn vì chỗ đang được giữ", h2.status === 409 && ["COURSE_FULL", "COURSE_ENROLLMENT_FAILED"].includes(h2.body.errors?.code), h2.body);
    // Giả lập: chỗ bị lấp trước khi tiền của người 1 về (VD Manager ghi danh tay).
    const sess = await prisma.classSchedule.findMany({ where: { classId: tiny } });
    const mp3 = await memberId("member3@example.com");
    await prisma.enrollment.createMany({ data: sess.map((s) => ({ memberId: mp3, scheduleId: s.id, status: "BOOKED" as const })) });
    const hc = await confirm(m2, h1.body.data.paymentId);
    const hp = await prisma.payment.findUnique({ where: { id: h1.body.data.paymentId }, include: { refunds: true } });
    check("tiền về khi hết chỗ ⇒ SUCCESS + REQUIRES_REVIEW + yêu cầu hoàn 100%", hc.status === 200 && hp?.status === "SUCCESS" && hp.activationStatus === "REQUIRES_REVIEW" && hp.refunds.some((r) => r.reason === "COURSE_NOT_FULFILLED" && Number(r.amount) === 400_000), hp);
    const ref = hp!.refunds.find((r) => r.reason === "COURSE_NOT_FULFILLED")!;
    const ap = await call("PATCH", `/refunds/${ref.id}/approve`, manager, { transactionRef: "FT-HD" });
    check("Manager duyệt hoàn ⇒ giao dịch REFUNDED", ap.status === 200 && (await prisma.payment.findUnique({ where: { id: hp!.id } }))?.status === "REFUNDED", ap.body);

    console.log("• Không ghi danh trọn khóa khi chưa trả tiền");
    const free = await call("POST", "/enrollments/bulk", m3, { classId: late });
    check("POST /enrollments/bulk khóa có phí chưa mua ⇒ 403 CLASS_NOT_PURCHASED", free.status === 403 && free.body.errors?.code === "CLASS_NOT_PURCHASED", free.body);

    console.log("• Duyệt muộn & job bảo trì khóa học");
    const pend = await openClass("HD chờ duyệt quá hạn", 4, 400_000, 8, { approve: false });
    await passSessions(pend, 1);
    const tooLate = await call("PATCH", `/classes/${pend}/review`, manager, { action: "APPROVE" });
    check("duyệt khóa đã quá giờ khai giảng ⇒ 409 CLASS_REVIEW_TOO_LATE", tooLate.status === 409 && tooLate.body.errors?.code === "CLASS_REVIEW_TOO_LATE", tooLate.body);
    const empty = await openClass("HD không học viên", 6, 600_000);
    await passSessions(empty, 3);
    const soon = await openClass("HD sắp khai giảng", 4, 400_000, 8, { startInDays: 0.5 });
    const run = await call("POST", "/classes/maintenance", manager);
    check("chạy job bảo trì", run.status === 200, run.body);
    const pendRow = await prisma.class.findUnique({ where: { id: pend } });
    check("PENDING quá hạn ⇒ REJECTED (REVIEW_EXPIRED)", pendRow?.status === "REJECTED" && pendRow.closedReason === "REVIEW_EXPIRED", pendRow);
    const emptyRow = await prisma.class.findUnique({ where: { id: empty }, include: { schedules: true } });
    check("qua hạn bán + 0 học viên ⇒ COMPLETED (NO_ENROLLMENT), buổi còn lại bị hủy mã NO_ENROLLMENT",
      emptyRow?.status === "COMPLETED" && emptyRow.closedReason === "NO_ENROLLMENT" &&
        emptyRow.schedules.filter((s) => s.status === "CANCELLED").every((s) => s.cancelCode === "NO_ENROLLMENT") &&
        emptyRow.schedules.every((s) => s.status === "CANCELLED"),
      emptyRow?.schedules.map((s) => [s.status, s.cancelCode]));
    const soonRow = await prisma.class.findUnique({ where: { id: soon } });
    check("khóa < 24h tới khai giảng chưa có học viên ⇒ báo HLV (alertStage 1)", soonRow?.alertStage === 1, soonRow?.alertStage);
    const run2 = await call("POST", "/classes/maintenance", manager);
    check("job idempotent (lần 2 không gửi lại)", run2.body.data?.alertedPreStart === 0 && run2.body.data?.closedNoEnrollment === 0, run2.body.data);

    console.log("• Doanh thu: gộp − đã hoàn = thực nhận");
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const rev = await call("GET", `/reports/revenue?startDate=${today}&endDate=${today}`, manager);
    const start = new Date(`${today}T00:00:00+07:00`);
    const end = new Date(`${today}T23:59:59.999+07:00`);
    const gross = await prisma.payment.aggregate({ where: { paidAt: { gte: start, lte: end }, status: { in: ["SUCCESS", "REFUNDED"] } }, _sum: { amount: true } });
    const refunded = await prisma.refund.aggregate({ where: { status: "COMPLETED", processedAt: { gte: start, lte: end } }, _sum: { amount: true } });
    check("totalRevenue gồm cả giao dịch đã hoàn", rev.body.data?.totalRevenue === Number(gross._sum.amount ?? 0), [rev.body.data?.totalRevenue, gross._sum.amount]);
    check("refundedAmount = Σ khoản hoàn đã trả", rev.body.data?.refundedAmount === Number(refunded._sum.amount ?? 0), [rev.body.data?.refundedAmount, refunded._sum.amount]);
    check("netRevenue = gộp − đã hoàn", rev.body.data?.netRevenue === Math.max(0, rev.body.data.totalRevenue - rev.body.data.refundedAmount));

    void mp2;
  } finally {
    // Dọn dữ liệu (theo thứ tự khóa ngoại).
    await prisma.refund.deleteMany({ where: { classId: { in: created } } });
    await prisma.walletTransaction.deleteMany({ where: { classId: { in: created } } });
    await prisma.attendance.deleteMany({ where: { schedule: { classId: { in: created } } } });
    await prisma.enrollment.deleteMany({ where: { schedule: { classId: { in: created } } } });
    const pays = await prisma.payment.findMany({ where: { classId: { in: created } }, select: { id: true } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
    await prisma.sepayBankTransaction.updateMany({ where: { paymentId: { in: pays.map((p) => p.id) } }, data: { paymentId: null } });
    await prisma.sepayWebhookEvent.updateMany({ where: { paymentId: { in: pays.map((p) => p.id) } }, data: { paymentId: null } });
    await prisma.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
    await prisma.classSchedule.updateMany({ where: { classId: { in: created } }, data: { makeupForId: null } });
    await prisma.classSchedule.deleteMany({ where: { classId: { in: created } } });
    await prisma.class.deleteMany({ where: { id: { in: created } } });
  }

  console.log(`\n[hardening] ${passed} pass / ${failed} fail`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
