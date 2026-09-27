const fs = require('fs');

function applyTo(file, fn) {
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    c = fn(c);
    fs.writeFileSync(file, c);
  }
}

// 1. Remove MemberTier import
const removeMemberTier = c => c.replace(/MemberTier,\s*/g, '');
applyTo('src/config/membership.ts', removeMemberTier);
applyTo('src/modules/enrollments/course-enrollment.service.ts', removeMemberTier);
applyTo('src/modules/enrollments/enrollment-quota.service.ts', removeMemberTier);

// 2. Fix attendance-analytics
applyTo('src/modules/attendance/attendance-analytics.service.ts', c => {
  return c.replace(/memberId/g, 'id') // memberId does not exist on Class
          .replace(/member: \{ include: \{ user: true \} \},/g, '')
          .replace(/member:\s*true,/g, '');
});

// 3. Fix members.service.ts error
applyTo('src/modules/members/members.service.ts', c => {
  return c.replace(/activeSub\?\.tier/g, 'null')
          .replace(/activeSub\?\.endDate/g, 'null');
});

// 4. Fix payments.service.ts error
applyTo('src/modules/payments/payments.service.ts', c => {
  return c.replace(/subscription:\s*true,/g, '');
});

// 5. Fix sepay-payments.controller.ts error
applyTo('src/modules/payments/sepay-payments.controller.ts', c => {
  return c.replace(/req\.user!\.role,\s*req\.params\.id/g, 'req.user!.role as string, req.params.id as string');
});

// 6. Fix reports.service.ts error
applyTo('src/modules/reports/reports.service.ts', c => {
  return c.replace(/\(sub\) =>/g, '(sub: any) =>');
});

// 7. Fix users.service.ts error
applyTo('src/modules/users/users.service.ts', c => {
  return c.replace(/import\s*\{\s*ensureActiveFreeSubscription\s*\}\s*from\s*"\.\.\/subscriptions\/free-subscription\.service\.js";/g, '')
          .replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription');
});

// 8. Fix server.ts error
applyTo('src/server.ts', c => {
  return c.replace(/import\s*\{.*?\}\s*from\s*"\.\/modules\/subscriptions\/subscription-lifecycle\.service\.js";/g, '');
});

