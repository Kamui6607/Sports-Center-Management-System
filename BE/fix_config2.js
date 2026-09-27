const fs = require('fs');

let cm = fs.readFileSync('src/config/membership.ts', 'utf8');
cm = cm.replace(/import\s*\{\s*MemberTier\s*\}\s*from\s*"@prisma\/client";/g, '');
cm = cm.replace(/tier:\s*MemberTier/g, 'tier: string');
cm = cm.replace(/Record<MemberTier,\s*number>/g, 'Record<string, number>');
cm = cm.replace(/as\s*MemberTier/g, 'as string');
fs.writeFileSync('src/config/membership.ts', cm);
