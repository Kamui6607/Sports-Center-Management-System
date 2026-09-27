import fs from "fs";
import path from "path";

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, "utf-8");
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

replaceInFile("src/modules/payments/sepay-payments.service.ts", [
  { from: /import \{ MembershipPlan,\s*Payment/g, to: "import { Payment" },
  { from: /const planView =[\s\S]*?: undefined;/g, to: 'const classView = payment.classNameSnapshot ? { id: payment.classId ?? "", name: payment.classNameSnapshot } : cls ? { id: cls.id, name: cls.name } : undefined;' },
  { from: /payment\.subscriptionId/g, to: "undefined" },
  { from: /activateSubscriptionForPayment/g, to: "// activate logic removed" },
  { from: /planTierSnapshot/g, to: "undefined" },
  { from: /durationDaysSnapshot/g, to: "undefined" },
  { from: /maxConcurrentClassesSnapshot/g, to: "undefined" },
  { from: /plan,/g, to: "cls," }
]);

replaceInFile("src/modules/reports/reports.service.ts", [
  { from: /prisma\.membershipSubscription\.count/g, to: "prisma.payment.count" },
  { from: /prisma\.membershipSubscription\.groupBy/g, to: "prisma.payment.groupBy" },
  { from: /subscriptionId: \{ not: null \}/g, to: "classId: { not: null }" },
  { from: /sub: any/g, to: "sub: any" },
  { from: /sub =>/g, to: "(sub: any) =>" }
]);

replaceInFile("src/modules/members/members.service.ts", [
  { from: /include: \{\s*user.*,\s*subscriptions: \{\s*include: \{ plan: true \},\s*\},\s*\}/g, to: "include: { user: { select: { id: true, fullName: true, phone: true, email: true, gender: true, dateOfBirth: true, avatarUrl: true, isActive: true } } }" },
  { from: /subscriptions: true,/g, to: "" },
  { from: /prisma\.membershipSubscription/g, to: "prisma.payment" }
]);

replaceInFile("src/modules/payments/payments.service.ts", [
  { from: /subscription: true/g, to: "" },
  { from: /subscriptionId: pending\.subscriptionId,/g, to: "" },
  { from: /prisma\.membershipSubscription\.update/g, to: "prisma.payment.update" }
]);

replaceInFile("src/modules/notifications/notifications.service.ts", [
  { from: /SUBSCRIPTION_EXPIRING/g, to: "GENERAL" }
]);
