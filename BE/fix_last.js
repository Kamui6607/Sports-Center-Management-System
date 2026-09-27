const fs = require('fs');

let ce = fs.readFileSync('src/modules/enrollments/course-enrollment.service.ts', 'utf8');
ce = ce.replace(/tier:\s*;/g, 'tier: string;');
ce = ce.replace(/tier:\s*\|\s*null;/g, 'tier: string | null;');
fs.writeFileSync('src/modules/enrollments/course-enrollment.service.ts', ce);

let us = fs.readFileSync('src/modules/users/users.service.ts', 'utf8');
us = us.replace(/await\s*\n\s*\}/g, '}');
fs.writeFileSync('src/modules/users/users.service.ts', us);
