const fs = require('fs');
const path = require('path');

function replaceAll(file, replacements) {
    let content = fs.readFileSync(file, 'utf8');
    for (let r of replacements) {
        content = content.replace(r[0], r[1]);
    }
    fs.writeFileSync(file, content, 'utf8');
}

// 1. sepay-payments.service.ts
const sepaySvc = 'src/modules/payments/sepay-payments.service.ts';
let content = fs.readFileSync(sepaySvc, 'utf8');
// Replace import
content = content.replace(/import \{.*activateSubscriptionForPayment.*\} from "\.\.\/subscriptions\/subscription-purchase\.service\.js";/s, 'import { enrollWholeCourseFromPayment } from "../enrollments/course-enrollment.service.js";');
// Replace createSepayCheckout signature
content = content.replace(/export async function createSepayCheckout\(userId: string, planId: string\) \{/g, 'export async function createSepayCheckout(userId: string, classId: string) {');
// Replace plan with cls
content = content.replace(/const plan = await prisma\.membershipPlan\.findUnique\(\{ where: \{ id: planId \} \}\);/g, 'const cls = await prisma.class.findUnique({ where: { id: classId } });');
content = content.replace(/if \(!plan \|\| !plan\.isActive\) throw new AppError\("Membership plan not found or inactive", 404\);/g, 'if (!cls || !cls.isActive) throw new AppError("Class not found or inactive", 404);');
content = content.replace(/if \(plan\.tier === "FREE" \|\| planAmount\(plan\) <= 0\) \{/g, 'if (Number(cls.price) <= 0) {');
content = content.replace(/amount = Number\(planAmount\(plan\)\);/g, 'amount = Number(cls.price);');
content = content.replace(/plan\.name/g, 'cls.name');
content = content.replace(/planId: plan\.id/g, 'classId: cls.id');
content = content.replace(/planId:/g, 'classId:');
content = content.replace(/planId/g, 'classId');
content = content.replace(/membershipPlan/g, 'class');
content = content.replace(/planNameSnapshot: payment\.planNameSnapshot/g, 'classNameSnapshot: payment.classNameSnapshot');
content = content.replace(/payment\.planNameSnapshot/g, 'payment.classNameSnapshot');
content = content.replace(/planTierSnapshot:.*?,/g, '');
content = content.replace(/durationDaysSnapshot:.*?,/g, '');
content = content.replace(/maxConcurrentClassesSnapshot:.*?,/g, '');
content = content.replace(/subscriptionId:\s*payment\.subscriptionId/g, '');
content = content.replace(/activateSubscriptionForPayment/g, 'enrollWholeCourseFromPayment');

fs.writeFileSync(sepaySvc, content, 'utf8');

// 2. payments.controller.ts
const paymentsCtrl = 'src/modules/payments/payments.controller.ts';
let content2 = fs.readFileSync(paymentsCtrl, 'utf8');
content2 = content2.replace(/req\.body\.planId/g, 'req.body.classId');
content2 = content2.replace(/planId:/g, 'classId:');
content2 = content2.replace(/createPayment\(userId, req\.body\.planId\)/g, 'createPayment(userId, req.body.classId)');
fs.writeFileSync(paymentsCtrl, content2, 'utf8');

// 3. sepay-payments.controller.ts
const sepayCtrl = 'src/modules/payments/sepay-payments.controller.ts';
let content3 = fs.readFileSync(sepayCtrl, 'utf8');
content3 = content3.replace(/req\.query\.planId/g, 'req.query.classId');
fs.writeFileSync(sepayCtrl, content3, 'utf8');
