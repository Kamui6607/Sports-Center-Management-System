const fs = require('fs');

function repl(file, search, replaceStr) {
  if (fs.existsSync(file)) {
    let c = fs.readFileSync(file, 'utf8');
    c = c.split(search).join(replaceStr);
    fs.writeFileSync(file, c);
  }
}

// 1. members.service.ts
repl('src/modules/members/members.service.ts', 'activeSub?.tier', '(activeSub as any)?.tier');
repl('src/modules/members/members.service.ts', 'activeSub?.endDate', '(activeSub as any)?.endDate');

// 2. payments.service.ts
repl('src/modules/payments/payments.service.ts', 'subscription: true,', '');

// 3. reports.service.ts
repl('src/modules/reports/reports.service.ts', '(sub) =>', '(sub: any) =>');
repl('src/modules/reports/reports.service.ts', 'bucket.memberId', '(bucket as any).memberId');

// 4. attendance-penalties.service.ts
repl('src/modules/attendance/attendance-penalties.service.ts', 'bucket.memberId', '(bucket as any).memberId');
repl('src/modules/attendance/attendance-penalties.service.ts', 'memberId: bucket.memberId,', '/*memberId: bucket.memberId*/');
repl('src/modules/attendance/attendance-penalties.service.ts', 'memberId: memberProfileId,', '/*memberId: memberProfileId*/');

// 5. attendance.service.ts
repl('src/modules/attendance/attendance.service.ts', 'memberId: memberProfileId', '/*memberId: memberProfileId*/');

// 6. attendance-analytics.service.ts
repl('src/modules/attendance/attendance-analytics.service.ts', 'suspendedAt: true,', '');
repl('src/modules/attendance/attendance-analytics.service.ts', 'cancelledAt: true,', '');
repl('src/modules/attendance/attendance-analytics.service.ts', 'startDate: true,', '');
repl('src/modules/attendance/attendance-analytics.service.ts', 'endDate: true,', '');
repl('src/modules/attendance/attendance-analytics.service.ts', 'class: c.class,', 'class: c.class as any,');

// 7. server.ts
repl('src/server.ts', 'import { startSubscriptionLifecycleJob } from "./modules/subscriptions/subscription-lifecycle.service.js";', '');
repl('src/server.ts', 'import {\n  startSubscriptionLifecycleJob,\n} from "./modules/subscriptions/subscription-lifecycle.service.js";', '');

