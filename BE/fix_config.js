const fs = require('fs');
let cm = fs.readFileSync('src/config/membership.ts', 'utf8');
cm = cm.replace(/tier: provided\?\:/g, 'tier: string, provided?:');
cm = cm.replace(/export const DEFAULT_MAX_CONCURRENT_CLASSES: Record<, number> =/g, 'export const DEFAULT_MAX_CONCURRENT_CLASSES: Record<string, number> =');
fs.writeFileSync('src/config/membership.ts', cm);
