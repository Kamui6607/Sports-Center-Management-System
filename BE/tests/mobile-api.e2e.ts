/**
 * E2E các API bổ sung cho Mobile (Doc/MOBILE_API_INTEGRATION.md mục 6): BE-1, 2, 3, 6, 8, 10–17, 20–22, L8, L9, L10.
 *
 * Chạy: npm run test:local -- mobile-api
 */
import { prisma } from "../src/config/prisma.js";
import { check, group, http, RUN, runSuite } from "./helpers/e2e.js";
import { cleanupRun, createClass, createRoom, createUser, login, purchase } from "./helpers/fixtures.js";

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function main() {
  const coach = await login(await createUser("COACH", { name: "HLV E2E" }));
  const member = await login(await createUser("MEMBER"));
  const member2 = await login(await createUser("MEMBER"));
  const stranger = await login(await createUser("MEMBER"));
  const manager = await login(await createUser("MANAGER"));
  const room = await createRoom("INDOOR", 30);

  const open = await createClass(coach, {
    price: 1_200_000,
    capacity: 5,
    fitness: `${RUN}-Yoga`,
    roomId: room.id,
    sessions: [{ startInHours: -24, status: "COMPLETED" }, { startInHours: 72 }, { startInHours: 96 }],
  });
  const hidden = await createClass(coach, { status: "PENDING", roomId: room.id, sessions: [] });
  await purchase(member, open.cls, open.schedules.slice(1).map((s) => s.id));

  group("BE-1 / BE-11 / BE-12: Guest xem khóa, danh mục bộ môn, tóm tắt");
  const guestList = await http("GET", `/classes?search=${RUN}&limit=50`);
  check("Guest GET /classes ⇒ 200 (không cần token)", guestList.status === 200, guestList.status);
  const ids = (guestList.body.data ?? []).map((c: any) => c.id);
  check("Guest chỉ thấy khóa APPROVED", ids.includes(open.cls.id) && !ids.includes(hidden.cls.id), ids);
  const guestStatus = await http("GET", `/classes?search=${RUN}&status=PENDING`);
  check("Guest truyền status=PENDING vẫn chỉ thấy APPROVED", !(guestStatus.body.data ?? []).some((c: any) => c.id === hidden.cls.id));
  const item = guestList.body.data.find((c: any) => c.id === open.cls.id);
  check("Guest không thấy email HLV", item && item.coach.user && item.coach.user.email === undefined, item?.coach?.user);
  check("summary: 3 buổi chính, 1 hoàn thành, 2 sắp tới", item?.summary?.mainSessionCount === 3 && item.summary.completedSessionCount === 1 && item.summary.upcomingSessionCount === 2, item?.summary);
  check("summary: 1 học viên, còn 4 chỗ", item?.summary?.studentCount === 1 && item.summary.minRemainingSlots === 4, item?.summary);
  check("coach kèm ratingAverage/ratingCount", item?.coach?.ratingCount === 0 && item.coach.ratingAverage === 0);
  const guestDetail = await http("GET", `/classes/${open.cls.id}`);
  check("Guest GET /classes/:id ⇒ 200", guestDetail.status === 200 && !!guestDetail.body.data.summary);
  const guestHidden = await http("GET", `/classes/${hidden.cls.id}`);
  check("Guest xem khóa chưa duyệt ⇒ 404", guestHidden.status === 404, guestHidden.status);
  const guestPlan = await http("GET", `/classes/${open.cls.id}/course-plan`);
  check("Guest course-plan ⇒ 200, registration null", guestPlan.status === 200 && guestPlan.body.data.registration === null, guestPlan.status);
  const badToken = await http("GET", "/classes", { token: "not-a-jwt" });
  check("token hỏng ⇒ 401 (không hạ xuống Guest)", badToken.status === 401);
  const fitness = await http("GET", "/classes/fitness");
  check("GET /classes/fitness công khai, có bộ môn của khóa đã duyệt", fitness.status === 200 && fitness.body.data.includes(`${RUN}-Yoga`), fitness.body);

  group("BE-13: trạng thái mua trong course-plan");
  const plan1 = await http("GET", `/classes/${open.cls.id}/course-plan`, { token: member.token });
  check("Member đã mua ⇒ purchase.status PURCHASED + amountPaid", plan1.body.data.registration?.purchase?.status === "PURCHASED" && plan1.body.data.registration.purchase.amountPaid === 1_200_000, plan1.body.data.registration?.purchase);
  const checkout = await http("POST", "/payments/sepay/checkout", { token: member2.token, body: { classId: open.cls.id } });
  check("Member 2 tạo giao dịch chờ ⇒ 201", checkout.status === 201, checkout.body);
  const plan2 = await http("GET", `/classes/${open.cls.id}/course-plan`, { token: member2.token });
  check("Member 2 ⇒ PENDING_PAYMENT + paymentId", plan2.body.data.registration?.purchase?.status === "PENDING_PAYMENT" && plan2.body.data.registration.purchase.paymentId === checkout.body.data?.paymentId, plan2.body.data.registration?.purchase);
  const plan3 = await http("GET", `/classes/${open.cls.id}/course-plan`, { token: stranger.token });
  check("chưa mua ⇒ NONE", plan3.body.data.registration?.purchase?.status === "NONE");

  group("BE-6 / BE-21: lịch sử thanh toán, đơn hàng");
  const confirm = await http("POST", "/payments/sepay/mock-confirm", { token: member2.token, body: { paymentId: checkout.body.data.paymentId } });
  check("mock-confirm ⇒ 200", confirm.status === 200, confirm.body);
  const myPays = await http("GET", "/payments/my?type=CLASS", { token: member2.token });
  const paid = myPays.body.data?.[0];
  check("GET /payments/my ⇒ giao dịch khóa SUCCESS kèm tên khóa", myPays.status === 200 && paid?.status === "SUCCESS" && paid.className && paid.type === "CLASS", paid);
  const product = await prisma.product.create({
    data: { name: `${RUN}-Nước`, description: "Nước suối e2e", price: 10_000, stockQuantity: 10, createdById: manager.id, imageUrl: "https://example.com/water.png" },
  });
  const productRes = await http("GET", `/products/${product.id}`);
  check("Product trả imageUrl", productRes.body.data?.imageUrl === "https://example.com/water.png");
  const order = await http("POST", "/products/orders", { token: member.token, body: { items: [{ productId: product.id, quantity: 2 }] } });
  check("đặt mua ⇒ 201", order.status === 201, order.body);
  const poll = await http("GET", `/payments/sepay/${order.body.data.paymentId}`, { token: member.token });
  check("sepay/:id của đơn kèm order.items có tên sản phẩm", poll.body.data?.order?.items?.[0]?.productName === `${RUN}-Nước`, poll.body.data?.order);
  const cancel = await http("POST", `/products/orders/${order.body.data.order.id}/cancel`, { token: member.token });
  check("hủy đơn ⇒ cancelReason BUYER", cancel.status === 200 && cancel.body.data.cancelReason === "BUYER", cancel.body.data?.cancelReason);
  const orderPays = await http("GET", "/payments/my?type=ORDER", { token: member.token });
  check("payments/my?type=ORDER có dòng sản phẩm", orderPays.body.data?.[0]?.items?.[0]?.quantity === 2, orderPays.body.data?.[0]);

  group("BE-10 / BE-2 / BE-3: tạo khóa kèm lịch, từ chối có lý do, gửi lại");
  const planBody = {
    class: { name: `${RUN}-Wizard`, fitness: "Pilates", capacity: 10, classType: "REGULAR", areaType: "INDOOR", price: 500_000 },
    roomId: room.id,
    schedules: [
      { startTime: inHours(200), endTime: inHours(201) },
      { startTime: inHours(224), endTime: inHours(225) },
    ],
  };
  const created = await http("POST", "/class-schedules/activity-plan", { token: coach.token, body: planBody });
  check("activity-plan ⇒ 201 + schedulesCreated = 2", created.status === 201 && created.body.data.schedulesCreated === 2, created.body);
  const newId = created.body.data?.class?.id;
  const clash = await http("POST", "/class-schedules/activity-plan", {
    token: coach.token,
    body: { ...planBody, class: { ...planBody.class, name: `${RUN}-Clash` } },
  });
  check("trùng giờ với khóa PENDING khác ⇒ 409", clash.status === 409, clash.body?.errors?.code);
  const reject = await http("PATCH", `/classes/${newId}/review`, { token: manager.token, body: { action: "REJECT", reason: "Giá chưa hợp lý" } });
  check("từ chối ⇒ rejectReason được lưu", reject.status === 200 && reject.body.data.rejectReason === "Giá chưa hợp lý", reject.body.data?.rejectReason);
  const clashAfterReject = await http("POST", "/class-schedules/activity-plan", {
    token: coach.token,
    body: { ...planBody, class: { ...planBody.class, name: `${RUN}-AfterReject` } },
  });
  check("khóa REJECTED không giữ phòng ⇒ tạo được khóa mới cùng giờ", clashAfterReject.status === 201, clashAfterReject.body);
  const other = await createUser("COACH");
  const otherLogin = await login(other);
  const notOwner = await http("PATCH", `/classes/${newId}/resubmit`, { token: otherLogin.token, body: planBody });
  check("HLV khác gửi lại ⇒ 403", notOwner.status === 403);
  const resubmit = await http("PATCH", `/classes/${newId}/resubmit`, {
    token: coach.token,
    body: { ...planBody, class: { ...planBody.class, price: 450_000 }, schedules: [{ startTime: inHours(300), endTime: inHours(301) }] },
  });
  check("gửi lại ⇒ PENDING, xóa lý do, thay lịch", resubmit.status === 200 && resubmit.body.data.class.status === "PENDING" && resubmit.body.data.class.rejectReason === null && resubmit.body.data.schedulesCreated === 1, resubmit.body);
  const approvedResubmit = await http("PATCH", `/classes/${open.cls.id}/resubmit`, { token: coach.token, body: planBody });
  check("khóa APPROVED không gửi lại được ⇒ 400 CLASS_NOT_EDITABLE", approvedResubmit.status === 400 && approvedResubmit.body.errors?.code === "CLASS_NOT_EDITABLE");

  group("BE-14 / BE-15 / BE-20: lịch của tôi, lý do hủy buổi");
  const from = inHours(-48);
  const to = inHours(80);
  const myEnr = await http("GET", `/enrollments/my?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token: member.token });
  check("enrollments/my?from&to chỉ trả buổi trong khoảng", myEnr.status === 200 && myEnr.body.data.length === 1 && myEnr.body.data[0].scheduleId === open.schedules[1].id, myEnr.body.data?.map((e: any) => e.scheduleId));
  check("kèm HLV của khóa", myEnr.body.data?.[0]?.schedule?.class?.coach?.user?.fullName === "HLV E2E");
  const mine = await http("GET", "/class-schedules?mine=true&limit=100", { token: coach.token });
  const mineIds = (mine.body.data ?? []).map((s: any) => s.classId);
  check("class-schedules?mine=true (COACH) chỉ buổi khóa của mình", mine.status === 200 && mineIds.length > 0 && mineIds.every((id: string) => [open.cls.id, newId, clashAfterReject.body.data?.class?.id].includes(id)), mineIds);
  const mineMember = await http("GET", "/class-schedules?mine=true", { token: member.token });
  check("class-schedules?mine=true (MEMBER) chỉ buổi đang giữ chỗ", (mineMember.body.data ?? []).length === 2, (mineMember.body.data ?? []).length);
  const cancelSession = await http("POST", `/class-schedules/${open.schedules[2].id}/cancel`, {
    token: coach.token,
    body: { reason: "HLV ốm", resolution: { mode: "REFUND" } },
  });
  check("hủy buổi REFUND ⇒ 200", cancelSession.status === 200, cancelSession.body);
  const cancelled = await prisma.classSchedule.findUniqueOrThrow({ where: { id: open.schedules[2].id } });
  check("lưu cancelReason + cancelResolution", cancelled.cancelReason === "HLV ốm" && cancelled.cancelResolution === "REFUND", cancelled);

  group("BE-16 / BE-17 / L8: hoàn tiền");
  const preview = await http("GET", `/refunds/course-cancellation/preview?classId=${open.cls.id}`, { token: member.token });
  check("preview ⇒ quá hạn (khóa đã khai giảng)", preview.status === 200 && preview.body.data.allowed === false && preview.body.data.blockReason === "COURSE_CANCEL_TOO_LATE", preview.body.data);
  const future = await createClass(coach, { price: 800_000, roomId: room.id, sessions: [{ startInHours: 400 }] });
  await purchase(member, future.cls, future.schedules.map((s) => s.id));
  const preview2 = await http("GET", `/refunds/course-cancellation/preview?classId=${future.cls.id}`, { token: member.token });
  check("preview ⇒ được hủy, hoàn 800.000", preview2.body.data?.allowed === true && preview2.body.data.refundableAmount === 800_000, preview2.body.data);
  const req = await http("POST", "/refunds/course-cancellation", { token: member.token, body: { classId: future.cls.id, note: "Bận việc" } });
  check("gửi hủy ⇒ memberNote", req.status === 201 && req.body.data.memberNote === "Bận việc", req.body.data);
  const byId = await http("GET", `/refunds/${req.body.data.id}`, { token: member.token });
  check("GET /refunds/:id (chủ) ⇒ 200 + tên HLV", byId.status === 200 && byId.body.data.class.coach.user.fullName === "HLV E2E", byId.body.data?.class);
  const byOther = await http("GET", `/refunds/${req.body.data.id}`, { token: stranger.token });
  check("Member khác ⇒ 403", byOther.status === 403);
  const approve = await http("PATCH", `/refunds/${req.body.data.id}/approve`, { token: manager.token, body: { note: "CK 123" } });
  check("duyệt ⇒ managerNote, memberNote giữ nguyên, note cũ = ghi chú Manager", approve.body.data?.managerNote === "CK 123" && approve.body.data.memberNote === "Bận việc" && approve.body.data.note === "CK 123", approve.body.data);
  const preview3 = await http("GET", `/refunds/course-cancellation/preview?classId=${future.cls.id}`, { token: member.token });
  check("sau khi đã hoàn ⇒ REFUND_ALREADY_REQUESTED", preview3.body.data?.blockReason === "REFUND_ALREADY_REQUESTED" || preview3.body.data?.blockReason === "PAID_PAYMENT_NOT_FOUND", preview3.body.data);

  group("BE-17 / L9: lộ trình");
  const tp = await http("POST", "/training-plans", {
    token: coach.token,
    body: { memberId: member.memberProfileId, coachId: coach.coachProfileId, name: "Giảm mỡ", startDate: inHours(-24), endDate: inHours(24 * 30) },
  });
  check("tạo lộ trình ⇒ 201", tp.status === 201, tp.body);
  const res1 = await http("POST", "/training-plans/results", {
    token: coach.token,
    body: { planId: tp.body.data.id, date: inHours(-1), metrics: [{ name: "Cân nặng", value: 58.5, unit: "kg", note: "Nhẹ hơn tuần trước" }], coachNote: "Tốt" },
  });
  check("ghi kết quả có ghi chú chỉ số ⇒ 201", res1.status === 201 && res1.body.data.metrics[0].note === "Nhẹ hơn tuần trước", res1.body);
  const getPlan = await http("GET", `/training-plans/${tp.body.data.id}`, { token: member.token });
  check("GET /training-plans/:id (Member chủ) ⇒ kèm học viên + kết quả", getPlan.status === 200 && getPlan.body.data.member.user.fullName && getPlan.body.data.results.length === 1, getPlan.body.data?.member);
  const listPlans = await http("GET", "/training-plans", { token: coach.token });
  check("danh sách lộ trình kèm member.user", listPlans.body.data?.some((p: any) => p.member?.user?.fullName));
  const otherPlan = await http("GET", `/training-plans/${tp.body.data.id}`, { token: stranger.token });
  check("Member khác ⇒ 403", otherPlan.status === 403);

  group("BE-22: đánh giá HLV");
  await http("POST", "/feedbacks", { token: member.token, body: { coachId: coach.coachProfileId, classId: open.cls.id, rating: 5 } });
  await http("POST", "/feedbacks", { token: member2.token, body: { coachId: coach.coachProfileId, classId: open.cls.id, rating: 3 } });
  const fb = await http("GET", `/feedbacks?coachId=${coach.coachProfileId}&classId=${open.cls.id}`, { token: member.token });
  check("summary.distribution + classSummary", fb.body.data?.summary?.distribution?.["5"] === 1 && fb.body.data.summary.distribution["3"] === 1 && fb.body.data.summary.classSummary?.averageRating === 4, fb.body.data?.summary);

  group("L10: danh bạ chat theo khóa chung");
  const memberContacts = await http("GET", "/chat/contacts", { token: member.token });
  const mc = (memberContacts.body.data ?? []).map((u: any) => u.id);
  check("Member thấy HLV khóa mình học, không thấy HLV khác", mc.includes(coach.id) && !mc.includes(other.id), mc);
  const strangerContacts = await http("GET", "/chat/contacts", { token: stranger.token });
  check("Member chưa học khóa nào ⇒ không có HLV của RUN", !(strangerContacts.body.data ?? []).some((u: any) => u.id === coach.id));
  const coachContacts = await http("GET", "/chat/contacts", { token: coach.token });
  const cc = (coachContacts.body.data ?? []).map((u: any) => u.id);
  check("HLV thấy học viên của mình + Manager, không thấy người lạ", cc.includes(member.id) && cc.includes(manager.id) && !cc.includes(stranger.id), cc.length);

  group("BE-8: tải file CV");
  const pending = await login(await createUser("COACH", { active: false, cert: null }));
  const form = new FormData();
  form.append("cv", new Blob([Buffer.from("%PDF-1.4\n%e2e-cv\n")], { type: "application/pdf" }), "cv.pdf");
  await http("POST", "/coaches/me/cv", { token: pending.token, form });
  const file = await fetch(`${(await import("./helpers/e2e.js")).serverUrl()}/api/v1/coaches/${pending.coachProfileId}/cv/file`, {
    headers: { Authorization: `Bearer ${manager.token}` },
  });
  const text = await file.text();
  check("Manager tải được CV (application/pdf)", file.status === 200 && file.headers.get("content-type")?.includes("application/pdf") === true && text.startsWith("%PDF"), file.status);
  const own = await http("GET", `/coaches/${pending.coachProfileId}/cv/file`, { token: pending.token });
  check("chính HLV (phiên giới hạn) tải được", own.status === 200);
  const deny = await http("GET", `/coaches/${pending.coachProfileId}/cv/file`, { token: member.token });
  check("người khác ⇒ 403", deny.status === 403);
  const cert = await prisma.certification.findUnique({ where: { coachId: pending.coachProfileId! } });
  if (cert?.fileUrl) await import("node:fs").then((fs) => fs.promises.unlink(cert.fileUrl!).catch(() => {}));
}

runSuite("mobile-api", main, cleanupRun);
