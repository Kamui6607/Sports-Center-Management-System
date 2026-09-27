const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`UPDATE "User" SET role = 'MANAGER' WHERE role = 'STAFF'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Notification" WHERE type::text IN ('SUBSCRIPTION_EXPIRING','SUBSCRIPTION_EXPIRED','SUBSCRIPTION_CANCELLED')`);
  console.log('Database updated successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());