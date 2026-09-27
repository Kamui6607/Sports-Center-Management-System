const fs = require('fs');

// 1. course-enrollment.service.ts
let ceSvc = fs.readFileSync('src/modules/enrollments/course-enrollment.service.ts', 'utf8');
ceSvc = ceSvc.replace(/bookedCounts\.map\(\(row\) =>/g, 'bookedCounts.map((row: any) =>');
ceSvc = ceSvc.replace(/myEnrollments\.map\(\(row\) =>/g, 'myEnrollments.map((row: any) =>');
ceSvc = ceSvc.replace(/conflicts\.find\(\s*\n\s*\(row\) => row\.schedule\.startTime/g, 'conflicts.find(\n      (row: any) => row.schedule.startTime');
fs.writeFileSync('src/modules/enrollments/course-enrollment.service.ts', ceSvc);

// 3. members.service.ts
let membersSvc = fs.readFileSync('src/modules/members/members.service.ts', 'utf8');
membersSvc = membersSvc.replace(/subscriptions:\s*\{[\s\S]*?\},/g, '');
membersSvc = membersSvc.replace(/subscriptions:\s*true/g, '');
fs.writeFileSync('src/modules/members/members.service.ts', membersSvc);

// 9. payments.routes.ts
let routesPath = 'src/modules/payments/payments.routes.ts';
if (fs.existsSync(routesPath)) {
    let routes = fs.readFileSync(routesPath, 'utf8');
    routes = routes.replace(/router\.post\("\/sepay\/:id\/cancel",[\s\S]*?cancelCheckout\);/g, '');
    fs.writeFileSync(routesPath, routes);
}
