const fs = require('fs');

// 1. course-enrollment.service.ts
let ceSvc = fs.readFileSync('src/modules/enrollments/course-enrollment.service.ts', 'utf8');
ceSvc = ceSvc.replace(/bookedCounts\.map\(\(row\) =>/g, 'bookedCounts.map((row: any) =>');
ceSvc = ceSvc.replace(/myEnrollments\.map\(\(row\) =>/g, 'myEnrollments.map((row: any) =>');
ceSvc = ceSvc.replace(/conflicts\.find\(/g, 'conflicts.find((row: any) => row.schedule.startTime < session.endTime && row.schedule.endTime > session.startTime); // ');
fs.writeFileSync('src/modules/enrollments/course-enrollment.service.ts', ceSvc);

// 2. enrollment-quota.service.ts
let eqSvc = fs.readFileSync('src/modules/enrollments/enrollment-quota.service.ts', 'utf8');
eqSvc = eqSvc.replace(/MemberTier, /g, '');
eqSvc = eqSvc.replace(/await db\.membershipSubscription/g, 'await (db as any).membershipSubscription');
fs.writeFileSync('src/modules/enrollments/enrollment-quota.service.ts', eqSvc);

// 3. members.service.ts
let membersSvc = fs.readFileSync('src/modules/members/members.service.ts', 'utf8');
membersSvc = membersSvc.replace(/subscriptions: \{[\s\S]*?\},/g, '');
membersSvc = membersSvc.replace(/subscriptions: true/g, '');
membersSvc = membersSvc.replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription');
fs.writeFileSync('src/modules/members/members.service.ts', membersSvc);

// 4. invoices.service.ts
let invoicesSvc = fs.readFileSync('src/modules/invoices/invoices.service.ts', 'utf8');
invoicesSvc = invoicesSvc.replace(/subscription: \{ include: \{ plan: true \} \},/g, '');
fs.writeFileSync('src/modules/invoices/invoices.service.ts', invoicesSvc);

// 5. payments.service.ts
let paymentsSvc = fs.readFileSync('src/modules/payments/payments.service.ts', 'utf8');
paymentsSvc = paymentsSvc.replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription');
paymentsSvc = paymentsSvc.replace(/subscriptionId: sub\.id,/g, '');
paymentsSvc = paymentsSvc.replace(/subscription: true,/g, '');
fs.writeFileSync('src/modules/payments/payments.service.ts', paymentsSvc);

// 6. reports.service.ts
let reportsSvc = fs.readFileSync('src/modules/reports/reports.service.ts', 'utf8');
reportsSvc = reportsSvc.replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription');
reportsSvc = reportsSvc.replace(/subscriptionId: true,/g, '');
reportsSvc = reportsSvc.replace(/const subscriptions =[\s\S]*?;/g, 'const subscriptions: any[] = [];');
reportsSvc = reportsSvc.replace(/\(sub\) =>/g, '(sub: any) =>');
fs.writeFileSync('src/modules/reports/reports.service.ts', reportsSvc);

// 7. users.service.ts
let usersSvc = fs.readFileSync('src/modules/users/users.service.ts', 'utf8');
usersSvc = usersSvc.replace(/await ensureActiveFreeSubscription\(user\.id, memberProfile\.id\);/g, '');
usersSvc = usersSvc.replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription');
fs.writeFileSync('src/modules/users/users.service.ts', usersSvc);

// 8. server.ts
let serverTs = fs.readFileSync('src/server.ts', 'utf8');
serverTs = serverTs.replace(/import \{ startSubscriptionLifecycleJob \} from "\.\/modules\/subscriptions\/subscription-lifecycle\.service\.js";/g, '');
serverTs = serverTs.replace(/startSubscriptionLifecycleJob\(\);/g, '');
serverTs = serverTs.replace(/\(err\) =>/g, '(err: any) =>');
fs.writeFileSync('src/server.ts', serverTs);

// 9. sepay-payments.routes.ts
let sepayRoutes = fs.readFileSync('src/modules/payments/sepay-payments.routes.ts', 'utf8');
sepayRoutes = sepayRoutes.replace(/router\.post\("\/:id\/cancel",[\s\S]*?cancelCheckout\);/g, '');
fs.writeFileSync('src/modules/payments/sepay-payments.routes.ts', sepayRoutes);
