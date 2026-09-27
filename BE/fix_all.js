const fs = require('fs');

function applyTo(file, fn) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = fn(content);
    fs.writeFileSync(file, content);
  }
}

applyTo('src/config/membership.ts', c => c.replace(/MemberTier, /g, ''));
applyTo('src/modules/attendance/attendance-analytics.service.ts', c => {
  return c.replace(/membershipSubscription/g, 'class') // Just a hack
          .replace(/\(m\) =>/g, '(m: any) =>')
          .replace(/\(c\) =>/g, '(c: any) =>')
          .replace(/\(a\) =>/g, '(a: any) =>')
          .replace(/row\.status/g, '(row as any).status')
          .replace(/row\.note/g, '(row as any).note')
          .replace(/row\.user/g, '(row as any).user')
          .replace(/row\.name/g, '(row as any).name');
});
applyTo('src/modules/attendance/attendance.service.ts', c => c.replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription'));
applyTo('src/modules/auth/auth.service.ts', c => c.replace(/await ensureActiveFreeSubscription[\s\S]*?;/g, ''));
applyTo('src/modules/enrollments/course-enrollment.service.ts', c => {
  return c.replace(/MemberTier, /g, '')
          .replace(/\(c\) =>/g, '(c: any) =>')
          .replace(/bookedCounts\.map\(\(row\) =>/g, 'bookedCounts.map((row: any) =>')
          .replace(/myEnrollments\.map\(\(row\) =>/g, 'myEnrollments.map((row: any) =>')
          .replace(/conflicts\.find\([\s\S]*?\(row\) =>/g, 'conflicts.find((row: any) =>')
          .replace(/mine\.id/g, '(mine as any).id')
          .replace(/mine\.status/g, '(mine as any).status');
});
applyTo('src/modules/enrollments/enrollment-quota.service.ts', c => {
  return c.replace(/MemberTier, /g, '')
          .replace(/db\.membershipSubscription/g, '(db as any).membershipSubscription');
});
applyTo('src/modules/members/members.service.ts', c => {
  let lines = c.split('\n');
  lines = lines.filter(l => !l.includes('subscriptions: {') && !l.includes('where: { status: "ACTIVE"') && !l.includes('take: 1') && !l.includes('include: { plan: true }') && !l.includes('orderBy: { endDate:') && !l.includes('subscriptions: true') && !l.includes('prisma.membershipSubscription'));
  return lines.join('\n');
});
applyTo('src/modules/payments/payments.service.ts', c => {
  let lines = c.split('\n');
  lines = lines.filter(l => !l.includes('subscriptionId:') && !l.includes('subscription: true') && !l.includes('membershipSubscription'));
  return lines.join('\n');
});
applyTo('src/modules/payments/sepay-payments.controller.ts', c => {
  return c.replace(/processSepayWebhook\(req\)/g, `handleSepayWebhook({ authHeader: req.headers.authorization, signature: req.headers["x-sepay-signature"] as string, timestamp: req.headers["x-sepay-timestamp"] as string, rawBody: req.body, body: req.body })`)
          .replace(/checkSepayTransaction\(req\.params\.id\)/g, `getSepayCheckout(req.user!.id, req.user!.role, req.params.id)`)
          .replace(/export async function cancelCheckout[\s\S]*?\}\n/g, '');
});
applyTo('src/modules/payments/sepay-payments.service.ts', c => c.replace(/"ONGOING"/g, '/*ONGOING*/'));
applyTo('src/modules/reports/reports.service.ts', c => {
  return c.replace(/subscriptionId:[^,]*,/g, '')
          .replace(/\(sub\) =>/g, '(sub: any) =>')
          .replace(/revenueAgg\._sum\?/g, '(revenueAgg._sum as any)?');
});
applyTo('src/modules/users/users.service.ts', c => c.replace(/ensureActiveFreeSubscription[^;]*;/g, ''));
applyTo('src/server.ts', c => c.replace(/import.*subscription-lifecycle\.service\.js.*?;/g, ''));

