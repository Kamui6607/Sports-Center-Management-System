import re
with open('src/modules/payments/sepay-payments.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the specific import
old_import = '''import {
  activateSubscriptionForPayment,
  inspectPlanPurchase,
  planAmount,
} from "../subscriptions/subscription-purchase.service.js";'''
new_import = 'import { enrollWholeCourseFromPayment } from "../enrollments/course-enrollment.service.js";'
content = content.replace(old_import, new_import)

content = content.replace('export async function createSepayCheckout(userId: string, planId: string) {', 'export async function createSepayCheckout(userId: string, classId: string) {')
content = content.replace('const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });', 'const cls = await prisma.class.findUnique({ where: { id: classId } });')
content = content.replace('if (!plan || !plan.isActive) throw new AppError("Membership plan not found or inactive", 404);', 'if (!cls || !cls.isActive) throw new AppError("Class not found or inactive", 404);')
content = content.replace('if (plan.tier === "FREE" || planAmount(plan) <= 0) {', 'if (Number(cls.price) <= 0) {')
content = content.replace('amount = Number(planAmount(plan));', 'amount = Number(cls.price);')
content = content.replace('planId: plan.id', 'classId: cls.id')
content = content.replace('planId: planId', 'classId: classId')
content = content.replace('plan.name', 'cls.name')
content = content.replace('planId: payment.planId', 'classId: payment.classId')
content = content.replace('payment.planNameSnapshot', 'payment.classNameSnapshot')
content = content.replace('planNameSnapshot:', 'classNameSnapshot:')
content = content.replace('planTierSnapshot:', '// planTierSnapshot:')
content = content.replace('durationDaysSnapshot:', '// durationDaysSnapshot:')
content = content.replace('maxConcurrentClassesSnapshot:', '// maxConcurrentClassesSnapshot:')
content = content.replace('activateSubscriptionForPayment', 'enrollWholeCourseFromPayment')

# Replace inline plan finds
content = content.replace('const plan = payment.planId\n    ? await prisma.membershipPlan.findUnique({ where: { id: payment.planId } })\n    : null;', 'const cls = payment.classId\n    ? await prisma.class.findUnique({ where: { id: payment.classId } })\n    : null;')
content = content.replace('const plan = payment.planId\n      ? await tx.membershipPlan.findUnique({ where: { id: payment.planId } })\n      : null;', 'const cls = payment.classId\n      ? await tx.class.findUnique({ where: { id: payment.classId } })\n      : null;')
content = content.replace('buildSepayCheckoutView(payment, plan)', 'buildSepayCheckoutView(payment, cls)')

# Fix subscriptionId assignments
content = re.sub(r'subscriptionId:\s*payment\.subscriptionId,', '', content)

with open('src/modules/payments/sepay-payments.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
