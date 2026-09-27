const fs = require('fs');
let content = fs.readFileSync('src/modules/payments/sepay-payments.service.ts', 'utf8');

content = content.replace(/subscriptionId:\s*settlement\.\s*\n/g, '\n');
content = content.replace(/subscriptionId:\s*settlement\.\s*\.\.\./g, '...');
content = content.replace(/subscriptionId:\s*params\. /g, '');
content = content.replace(/subscriptionId\?: string;/g, '');

fs.writeFileSync('src/modules/payments/sepay-payments.service.ts', content);
