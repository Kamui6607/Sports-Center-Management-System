import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

import http from "http";
import { Server } from "socket.io";
import { setupSocket } from "./modules/chat/chat.socket.js";

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  setupSocket(io);

  server.listen(env.PORT, () => {
    console.log(`Server health running at http://localhost:${env.PORT}/api/v1/health`);
    console.log(`Swagger docs at http://localhost:${env.PORT}/api/v1/docs`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});