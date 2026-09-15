import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  app.listen(env.PORT, () => {
    console.log(`Server health running at http://localhost:${env.PORT}/api/v1/health`);
    console.log(`Swagger docs at http://localhost:${env.PORT}/api/v1/docs`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});