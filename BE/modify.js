const fs = require('fs');
const file = 'd:/FPT/ky8/PRM/du_an/Sports-Center-Management-System/BE/prisma/schema.prisma';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/  bio             String\?/, '  bio             String?\n  cvUrl           String?\n  approvalStatus  CoachApprovalStatus @default(PENDING)');
fs.writeFileSync(file, content);
console.log('Updated');