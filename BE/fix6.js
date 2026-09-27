const fs = require('fs');

let membersSvc = fs.readFileSync('src/modules/members/members.service.ts', 'utf8');
membersSvc = membersSvc.replace(/subscriptions: \{[\s\S]*?take: 1,[\s\S]*?\},[\s\S]*?\},/g, ''); // no this is risky.
// Better: just remove lines containing subscriptions and the nested block.
