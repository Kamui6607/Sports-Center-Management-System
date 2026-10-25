/**
 * Kiểm thử luồng gói thành viên (Doc/MEMBERSHIP_FLOW.md) — chạy trên BE LOCAL đang chạy:
 *   npm run dev:local                    # cửa sổ 1
 *   npm run test:membership:local        # cửa sổ 2
 * Chỉ dùng DB local. Tự dọn dữ liệu đã tạo.
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
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function login(email: string, password: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.body)}`);
  return r.body.data.accessToken as string;
}

const DAY = 24 * 3_600_000;
const RUN = Date.now().toString(36);

async function main() {
  console.log(`[membership] ${BASE}`);
  const manager = await login("manager@sportscenter.com", "Manager@123");
  const coach = await login("coach1@sportscenter.com", "Coach@123");
  const member = await login("member3@example.com", "Member@123");
  const mp = await prisma.memberProfile.findFirstOrThrow({ where: { user: { email: "member3@example.com" } } });
  const planIds: string[] = [];
  const before = new Date();

  try {
    console.log("• Manager CRUD gói");
    const c = await call("POST", "/membership-plans", manager, {
      name: `Gói thử ${RUN}`,
      durationDays: 30,
      price: 500_000,
      description: "Tập tự do",
      benefits: ["Tập không giới hạn", "Tủ đồ miễn phí"],
      isFeatured: true,
      sortOrder: 1,
    });
    check("tạo gói có quyền lợi + nổi bật", c.status === 201 && c.body.data.benefits.length === 2 && c.body.data.isFeatured === true, c.body);
    const planId = c.body.data?.id as string;
    planIds.push(planId);
    const dup = await call("POST", "/membership-plans", manager, { name: `gói THỬ ${RUN}`, durationDays: 30, price: 500_000 });
    check("trùng tên ⇒ 409 PLAN_NAME_TAKEN", dup.status === 409 && dup.body.errors?.code === "PLAN_NAME_TAKEN", dup.body);
    const memberCreate = await call("POST", "/membership-plans", member, { name: "x", durationDays: 30, price: 500_000 });
    check("Member không tạo được gói", memberCreate.status === 403);
    const spare = await call("POST", "/membership-plans", manager, { name: `Gói nháp ${RUN}`, durationDays: 7, price: 100_000 });
    planIds.push(spare.body.data?.id);
    const del = await call("DELETE", `/membership-plans/${spare.body.data?.id}`, manager);
    check("xóa gói chưa bán ⇒ 200", del.status === 200, del.body);

    console.log("• Mua gói + đổi gói trong lúc chờ chuyển khoản");
    const buy = await call("POST", "/memberships/purchase", member, { planId });
    check("tạo QR mua gói", buy.status === 201 && buy.body.data.amount === 500_000, buy.body);
    const upd = await call("PATCH", `/membership-plans/${planId}`, manager, { durationDays: 10, price: 900_000, name: `Gói thử ${RUN} (mới)` });
    check("Manager sửa gói ⇒ 200", upd.status === 200 && upd.body.data.durationDays === 10, upd.body);
    const conf = await call("POST", "/payments/sepay/mock-confirm", member, { paymentId: buy.body.data.paymentId });
    check("tiền về ⇒ 200", conf.status === 200, conf.body);
    const ms = await prisma.membership.findFirst({ where: { paymentId: buy.body.data.paymentId } });
    const days = ms ? Math.round((ms.endDate.getTime() - ms.startDate.getTime()) / DAY) : 0;
    check("cấp đúng 30 ngày theo ảnh chụp lúc mua (không phải 10 ngày mới sửa)", days === 30, days);
    const delUsed = await call("DELETE", `/membership-plans/${planId}`, manager);
    check("xóa gói đã bán ⇒ 409 PLAN_IN_USE", delUsed.status === 409 && delUsed.body.errors?.code === "PLAN_IN_USE", delUsed.body);

    console.log("• Thẻ của tôi + gói xếp hàng");
    const buy2 = await call("POST", "/memberships/purchase", member, { planId });
    await call("POST", "/payments/sepay/mock-confirm", member, { paymentId: buy2.body.data.paymentId });
    const my = await call("GET", "/memberships/my", member);
    check("có gói đang dùng + 1 gói xếp hàng (10 ngày, theo giá mới)", !!my.body.data?.current && my.body.data.queued.length === 1 && my.body.data.queued[0].totalDays === 10, my.body.data);
    check("validUntil = hạn của gói xếp hàng", my.body.data?.validUntil === my.body.data?.queued?.[0]?.endDate, my.body.data);
    const hist = await call("GET", "/memberships/my/history", member);
    check("lịch sử giữ tên lúc mua", hist.body.data?.some((h: any) => h.plan.name === `Gói thử ${RUN}` && h.paidAmount === 500_000), hist.body.data);
    const manage = await call("GET", "/membership-plans/manage", manager);
    const row = manage.body.data?.find((p: any) => p.id === planId);
    check("số liệu gói: 2 lượt bán, doanh thu 1.400.000đ", row?.stats?.soldCount === 2 && row.stats.revenue === 1_400_000, row?.stats);

    console.log("• QR động + quét thẻ");
    const pass = await call("GET", "/memberships/my/pass", member);
    check("cấp mã QR động 60s", pass.status === 200 && pass.body.data.expiresIn === 60 && pass.body.data.isActive === true, pass.body);
    const scan = await call("POST", "/memberships/pass/verify", manager, { token: pass.body.data.token });
    check("Manager quét ⇒ hợp lệ + ghi nhật ký", scan.status === 200 && scan.body.data.valid === true && scan.body.data.entriesToday >= 1, scan.body);
    const scanCoach = await call("POST", "/memberships/pass/verify", coach, { token: pass.body.data.token });
    check("HLV quét được", scanCoach.status === 200 && scanCoach.body.data.valid === true, scanCoach.body);
    const bad = await call("POST", "/memberships/pass/verify", manager, { token: "abc.def.ghijklmnop" });
    check("mã rác ⇒ 400 PASS_INVALID", bad.status === 400 && bad.body.errors?.code === "PASS_INVALID", bad.body);
    const memberScan = await call("POST", "/memberships/pass/verify", member, { token: pass.body.data.token });
    check("Member không tự quét được", memberScan.status === 403);
    const scans = await call("GET", "/memberships/pass/scans?limit=5", manager);
    check("nhật ký vào cửa", scans.status === 200 && scans.body.data.length >= 2, scans.body);

    console.log("• Manager hủy gói + hoàn tiền, gói xếp hàng dời lên");
    const current = my.body.data.current;
    const tooMuch = await call("POST", `/memberships/${current.id}/cancel`, manager, { reason: "Chuyển nhượng", refundAmount: 99_000_000 });
    check("hoàn quá giá trị còn lại ⇒ 400", tooMuch.status === 400 && tooMuch.body.errors?.code === "REFUND_EXCEEDS_REMAINING", tooMuch.body);
    const queuedBefore = my.body.data.queued[0];
    const cancel = await call("POST", `/memberships/${current.id}/cancel`, manager, { reason: "Chuyển nhượng", refundAmount: 200_000 });
    check("hủy gói + tạo yêu cầu hoàn 200.000đ", cancel.status === 200 && cancel.body.data.refund?.amount === 200_000 && cancel.body.data.shiftedQueued === 1, cancel.body);
    const queuedAfter = await prisma.membership.findUnique({ where: { id: queuedBefore.id } });
    check("gói xếp hàng bắt đầu ngay", !!queuedAfter && queuedAfter.startDate.getTime() <= Date.now() + 60_000, queuedAfter);
    const refund = await prisma.refund.findUnique({ where: { id: cancel.body.data.refund.id } });
    check("refund MEMBERSHIP_CANCELLED PENDING", refund?.reason === "MEMBERSHIP_CANCELLED" && refund.status === "PENDING", refund);
    const ok = await call("PATCH", `/refunds/${refund!.id}/approve`, manager, { transactionRef: "FT-MEM" });
    check("Manager duyệt hoàn", ok.status === 200, ok.body);

    console.log("• Nhắc gia hạn");
    await prisma.membership.update({ where: { id: queuedBefore.id }, data: { endDate: new Date(Date.now() + 3 * DAY) } });
    const job = await call("POST", "/memberships/maintenance", manager);
    check("còn 3 ngày ⇒ nhắc bậc 7 ngày", job.status === 200 && job.body.data.remindedDays7 >= 1, job.body);
    const job2 = await call("POST", "/memberships/maintenance", manager);
    const again = await prisma.membership.findUnique({ where: { id: queuedBefore.id } });
    check("job idempotent", again?.reminderStage === 1 && job2.body.data.remindedDays7 === 0, [again?.reminderStage, job2.body.data]);
    await prisma.membership.update({ where: { id: queuedBefore.id }, data: { endDate: new Date(Date.now() - 1000) } });
    const job3 = await call("POST", "/memberships/maintenance", manager);
    const exp = await prisma.membership.findUnique({ where: { id: queuedBefore.id } });
    check("quá hạn ⇒ EXPIRED + thông báo", exp?.status === "EXPIRED" && job3.body.data.expired >= 1, [exp?.status, job3.body.data]);
    const pass2 = await call("GET", "/memberships/my/pass", member);
    const scan2 = await call("POST", "/memberships/pass/verify", manager, { token: pass2.body.data.token });
    check("quét thẻ hết hạn ⇒ valid=false", scan2.status === 200 && scan2.body.data.valid === false, scan2.body);
    const notes = await prisma.notification.count({
      where: { userId: mp.userId, createdAt: { gte: before }, title: { contains: "Gói thành viên" } },
    });
    check("hội viên nhận thông báo (hủy / sắp hết / hết hạn)", notes >= 3, notes);
  } finally {
    const ms = await prisma.membership.findMany({ where: { planId: { in: planIds } }, select: { id: true, paymentId: true } });
    const payIds = ms.map((m) => m.paymentId).filter(Boolean) as string[];
    const extra = await prisma.payment.findMany({ where: { note: { in: planIds.map((id) => `MEMBERSHIP_PLAN:${id}`) } }, select: { id: true } });
    const allPay = [...new Set([...payIds, ...extra.map((p) => p.id)])];
    await prisma.memberPassScan.deleteMany({ where: { memberId: mp.id, createdAt: { gte: before } } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: allPay } } });
    await prisma.membership.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.sepayBankTransaction.updateMany({ where: { paymentId: { in: allPay } }, data: { paymentId: null } });
    await prisma.sepayWebhookEvent.updateMany({ where: { paymentId: { in: allPay } }, data: { paymentId: null } });
    await prisma.payment.deleteMany({ where: { id: { in: allPay } } });
    await prisma.membershipPlan.deleteMany({ where: { id: { in: planIds.filter(Boolean) } } });
  }
  console.log(`\n[membership] ${passed} pass / ${failed} fail`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
