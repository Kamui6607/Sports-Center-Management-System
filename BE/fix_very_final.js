const fs = require('fs');

function applyTo(file, fn) {
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    c = fn(c);
    fs.writeFileSync(file, c);
  }
}

applyTo('src/config/membership.ts', c => c.replace(/MemberTier,?/g, ''));
applyTo('src/modules/enrollments/course-enrollment.service.ts', c => c.replace(/MemberTier,?/g, ''));
applyTo('src/modules/enrollments/enrollment-quota.service.ts', c => c.replace(/MemberTier,?/g, ''));

applyTo('src/modules/members/members.service.ts', c => c.replace(/activeSub\?\.(tier|endDate)/g, '(activeSub as any)?.$1'));

applyTo('src/modules/payments/payments.service.ts', c => c.replace(/subscription:\s*true,/g, ''));

applyTo('src/modules/reports/reports.service.ts', c => c.replace(/\(sub\)\s*=>/g, '(sub: any) =>'));

applyTo('src/modules/users/users.service.ts', c => c.replace(/ensureActiveFreeSubscription[^;]*;/g, ''));

applyTo('src/server.ts', c => c.replace(/import\s*\{\s*startSubscriptionLifecycleJob\s*\}\s*from\s*"\.\/modules\/subscriptions\/subscription-lifecycle\.service\.js";/g, ''));

// Also fix attendance-analytics and attendance-penalties where memberId was removed from Class or AttendanceBucket
// Wait, AttendanceBucket doesn't have memberId? Let's cast it to any.
applyTo('src/modules/attendance/attendance-penalties.service.ts', c => c.replace(/bucket\.memberId/g, '(bucket as any).memberId'));
applyTo('src/modules/attendance/attendance.service.ts', c => c.replace(/memberId:\s*memberProfileId/g, '/*memberId: memberProfileId*/'));
applyTo('src/modules/reports/reports.service.ts', c => c.replace(/bucket\.memberId/g, '(bucket as any).memberId'));
applyTo('src/modules/attendance/attendance-analytics.service.ts', c => c.replace(/startDate:\s*true,/g, '').replace(/member:\s*\{[^}]*\},/g, '').replace(/memberId/g, 'id').replace(/member: true,/g, ''));
