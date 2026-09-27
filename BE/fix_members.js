const fs = require('fs');
let text = fs.readFileSync('src/modules/members/members.service.ts', 'utf8');

text = text.replace(/subscriptions: \{[\s\S]*?take: 1,[\s\S]*?include: \{ plan: true \},[\s\S]*?\},/g, '');
text = text.replace(/subscriptions: \{[\s\S]*?take: 1,[\s\S]*?\},/g, '');
text = text.replace(/subscriptions: true,/g, '');
text = text.replace(/prisma\.membershipSubscription/g, '(prisma as any).membershipSubscription');
fs.writeFileSync('src/modules/members/members.service.ts', text);
