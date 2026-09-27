const fs = require('fs');

function replaceBlock(content, regex) {
  return content.replace(regex, '');
}

// 1. members.service.ts
let m = fs.readFileSync('src/modules/members/members.service.ts', 'utf8');
m = m.replace(/subscriptions:\s*\{\s*where:\s*\{\s*status:\s*"ACTIVE"[\s\S]*?take:\s*1,\s*include:\s*\{\s*plan:\s*true\s*\},\s*\},\s*/g, '');
m = m.replace(/subscriptions:\s*\{\s*where:\s*\{\s*status:\s*"ACTIVE"[\s\S]*?take:\s*1,\s*\},\s*/g, '');
m = m.replace(/const activeSub = await prisma\.membershipSubscription\.findFirst\(\{[\s\S]*?\}\);/g, 'const activeSub = null;');
fs.writeFileSync('src/modules/members/members.service.ts', m);

// 2. payments.service.ts
let p = fs.readFileSync('src/modules/payments/payments.service.ts', 'utf8');
p = p.replace(/const sub = await prisma\.membershipSubscription\.findUnique\(\{[\s\S]*?\}\);/g, 'const sub: any = null;');
p = p.replace(/subscriptionId: sub\.id,/g, '');
p = p.replace(/subscription:\s*true,/g, '');
fs.writeFileSync('src/modules/payments/payments.service.ts', p);

// 3. users.service.ts
let u = fs.readFileSync('src/modules/users/users.service.ts', 'utf8');
u = u.replace(/await ensureActiveFreeSubscription\(user\.id, memberProfile\.id\);/g, '');
u = u.replace(/const sub = await prisma\.membershipSubscription\.findFirst\(\{[\s\S]*?\}\);/g, 'const sub: any = null;');
fs.writeFileSync('src/modules/users/users.service.ts', u);

// 4. config/membership.ts
let cm = fs.readFileSync('src/config/membership.ts', 'utf8');
cm = cm.replace(/MemberTier,\s*/g, '');
fs.writeFileSync('src/config/membership.ts', cm);

