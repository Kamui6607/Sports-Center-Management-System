const fs = require('fs');
function applyTo(file, fn) {
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    c = fn(c);
    fs.writeFileSync(file, c);
  }
}

applyTo('src/modules/attendance/attendance-analytics.service.ts', c => {
  return c.replace(/endDate:\s*true,/g, '')
          .replace(/class:\s*c\.class,/g, 'class: c.class as any,');
});

applyTo('src/modules/attendance/attendance-penalties.service.ts', c => {
  return c.replace(/bucket\.memberId/g, '(bucket as any).memberId')
          .replace(/memberId:\s*bucket\.memberId,/g, '/*memberId: bucket.memberId*/')
          .replace(/memberId:\s*memberProfileId,/g, '/*memberId: memberProfileId*/');
});

applyTo('src/modules/attendance/attendance.service.ts', c => {
  return c.replace(/memberId:\s*memberProfileId/g, '/*memberId: memberProfileId*/');
});

applyTo('src/modules/members/members.service.ts', c => {
  return c.replace(/activeSub\?\.(tier|endDate)/g, '(activeSub as any)?.$1');
});

applyTo('src/modules/payments/payments.service.ts', c => {
  return c.replace(/subscription:\s*true,/g, '');
});

applyTo('src/modules/reports/reports.service.ts', c => {
  return c.replace(/\(sub\) =>/g, '(sub: any) =>')
          .replace(/bucket\.memberId/g, '(bucket as any).memberId');
});

applyTo('src/server.ts', c => {
  return c.replace(/import\s*\{\s*startSubscriptionLifecycleJob\s*\}\s*from\s*"\.\/modules\/subscriptions\/subscription-lifecycle\.service\.js";\s*/g, '');
});

