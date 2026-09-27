const fs = require('fs');

let content = fs.readFileSync('src/modules/payments/sepay-payments.service.ts', 'utf8');

// Line 2
content = content.replace('MembershipPlan, ', '');

// Line 21
content = content.replace('import { enrollWholeCourseFromPayment } from "../enrollments/course-enrollment.service.js";', '');

// buildSepayCheckoutView
content = content.replace(/plan\?: \{ id: string; name: string; tier: string; durationDays: number \};/g, 'classInfo?: { id: string; name: string; };');
content = content.replace(/function buildSepayCheckoutView\(payment: Payment, plan: MembershipPlan \| null\): SepayCheckoutView \{([\s\S]*?)return \{/g, `function buildSepayCheckoutView(payment: Payment, cls: any): SepayCheckoutView {
  const cfg = sepayConfig();
  const orderCode = payment.transactionCode ?? "";
  const amount = money(payment.amount);
  const classView = payment.classNameSnapshot
    ? {
        id: payment.classId ?? "",
        name: payment.classNameSnapshot,
      }
    : cls
      ? { id: cls.id, name: cls.name }
      : null;
  return {`);

content = content.replace(/\.\.\.\(planView \? \{ plan: planView \} : \{\}\),/g, '...(classView ? { classInfo: classView } : {}),');

// createSepayCheckout
content = content.replace(/await inspectPlanPurchase\(prisma, memberProfile\.id, plan\);/g, '');
content = content.replace(/const amount = planAmount\(plan\);/g, 'const amount = money(cls.price);');
content = content.replace(/buildSepayCheckoutView\(pending, plan\)/g, 'buildSepayCheckoutView(pending, cls)');
content = content.replace(/planTierSnapshot: plan.tier,/g, '');
content = content.replace(/durationDaysSnapshot: plan.durationDays,/g, '');
content = content.replace(/maxConcurrentClassesSnapshot: plan.maxConcurrentClasses,/g, '');
content = content.replace(/classNameSnapshot: cls.name,/g, 'classNameSnapshot: cls.name,'); // keep it

// getSepayCheckout
// payment.subscriptionId check
// Wait, getSepayCheckout doesn't have subscriptionId, it had it in return?
content = content.replace(/classId: payment\.classId,\s*paidAt: payment\.paidAt,\s*\}/g, 'classId: payment.classId,\n    paidAt: payment.paidAt,\n  }');

// Settlement type
content = content.replace(/subscriptionId\?: string;/g, '');
content = content.replace(/subscriptionId: params\.subscriptionId,/g, '');

// handleSepayWebhook
// retrySepayActivation
content = content.replace(/if \(payment\.subscriptionId\) \{\s*throw new AppError\("Giao dịch đã được kích hoạt gói trước đó\.", 400\);\s*\}/g, '');
content = content.replace(/if \(!plan\) \{[\s\S]*?gateway: SEPAY_GATEWAY \}\s*\);\s*\}/g, `if (!cls) {
    throw new AppError(
      "Không tìm thấy gói của đơn (có thể đã bị xoá) — cần xử lý thủ công/hoàn tiền.",
      409,
      { code: "SEPAY_PLAN_MISSING", gateway: SEPAY_GATEWAY }
    );
  }`);

content = content.replace(/const fresh = await tx\.payment\.findUnique\(\{ where: \{ id: payment\.id \} \}\);\s*if \(!fresh \|\| fresh\.subscriptionId\) \{\s*throw new AppError\("Giao dịch đã được kích hoạt bởi thao tác khác\.", 409\);\s*\}/g, `const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!fresh) {
        throw new AppError("Giao dịch không tồn tại.", 409);
      }`);

content = content.replace(/const \{ subscription \} = await enrollWholeCourseFromPayment\(tx, \{[\s\S]*?\}\);/g, `const schedules = await tx.classSchedule.findMany({
        where: { classId: fresh.classId!, status: { in: ["SCHEDULED", "ONGOING"] } },
      });
      for (const schedule of schedules) {
        await tx.enrollment.upsert({
          where: { memberId_scheduleId: { memberId: member.id, scheduleId: schedule.id } },
          create: { memberId: member.id, classId: fresh.classId!, scheduleId: schedule.id, status: "BOOKED" },
          update: {},
        });
      }`);

content = content.replace(/return \{ payment: updated, subscription \};/g, 'return { payment: updated };');

// In settleSepayTransfer
content = content.replace(/if \(!plan\) \{[\s\S]*?processed: true,\s*\}\);\s*\}/g, `if (!cls) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          paidAt: now,
          activationStatus: "REQUIRES_REVIEW",
          reviewReason: "PLAN_MISSING",
          note: "Đã thu tiền nhưng KHÔNG tìm thấy gói để kích hoạt — cần xử lý thủ công (REQUIRES_REVIEW).",
        },
      });
      return finish({
        status: "PROCESSED",
        reason: "PLAN_MISSING",
        paymentId: payment.id,
        memberId: payment.memberId,
        paymentStatus: "SUCCESS",
        processed: true,
      });
    }`);

content = content.replace(/let subscriptionId: string;\s*try \{[\s\S]*?subscriptionId = subscription\.id;\s*\} catch \(err\) \{/g, `try {
      const schedules = await tx.classSchedule.findMany({
        where: { classId: payment.classId!, status: { in: ["SCHEDULED", "ONGOING"] } },
      });
      for (const schedule of schedules) {
        await tx.enrollment.upsert({
          where: { memberId_scheduleId: { memberId: member.id, scheduleId: schedule.id } },
          create: { memberId: member.id, classId: payment.classId!, scheduleId: schedule.id, status: "BOOKED" },
          update: {},
        });
      }
    } catch (err) {`);

content = content.replace(/subscriptionId,/g, '');

content = content.replace(/planNameSnapshot/g, 'classNameSnapshot');

fs.writeFileSync('src/modules/payments/sepay-payments.service.ts', content);
