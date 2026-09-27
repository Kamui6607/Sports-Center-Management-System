const fs = require('fs');

function applyRegex(file, regex, replacement) {
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    c = c.replace(regex, replacement);
    fs.writeFileSync(file, c);
  }
}

applyRegex('src/modules/attendance/attendance-analytics.service.ts', /class:\s*c\.class/g, 'class: c.class as any');
applyRegex('src/modules/attendance/attendance-penalties.service.ts', /bucket\.memberId/g, '(bucket as any).memberId');
applyRegex('src/modules/attendance/attendance-penalties.service.ts', /memberId:\s*bucket\.memberId,/g, '');
applyRegex('src/modules/attendance/attendance-penalties.service.ts', /memberId:\s*memberProfileId,/g, '');
applyRegex('src/modules/attendance/attendance.service.ts', /memberId:\s*memberProfileId/g, '');
applyRegex('src/modules/members/members.service.ts', /activeSub\?\.(tier|endDate)/g, '(activeSub as any)?.$1');
applyRegex('src/modules/payments/payments.service.ts', /subscription:\s*true,/g, '');
applyRegex('src/modules/reports/reports.service.ts', /\(sub\) =>/g, '(sub: any) =>');
applyRegex('src/modules/reports/reports.service.ts', /bucket\.memberId/g, '(bucket as any).memberId');
applyRegex('src/server.ts', /import[\s\S]*?subscription-lifecycle\.service\.js";/g, '');

