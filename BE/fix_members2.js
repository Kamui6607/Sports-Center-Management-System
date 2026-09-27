const fs = require('fs');
let text = fs.readFileSync('src/modules/members/members.service.ts', 'utf8');

const s1 = `        subscriptions: {
          where: { status: "ACTIVE", startDate: { lte: new Date() }, endDate: { gte: new Date() } },
          orderBy: { endDate: "desc" },
          take: 1,
          include: { plan: true },
        },`;

const s2 = `      subscriptions: {
        where: { status: "ACTIVE", startDate: { lte: new Date() }, endDate: { gte: new Date() } },
        include: { plan: true },
        orderBy: { endDate: "desc" },
        take: 1,
      },`;

text = text.replace(s1, '');
text = text.replace(s2, '');
fs.writeFileSync('src/modules/members/members.service.ts', text);
