import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { swaggerSpec } from "./config/swagger.js";
import { errorHandler } from "./middlewares/errorHandler.js";

// Routes
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/users.routes.js";
import memberRoutes from "./modules/members/members.routes.js";
import coachRoutes from "./modules/coaches/coaches.routes.js";
import membershipPlanRoutes from "./modules/membership-plans/membership-plans.routes.js";
import subscriptionRoutes from "./modules/subscriptions/subscriptions.routes.js";
import sportRoutes from "./modules/sports/sports.routes.js";
import roomRoutes from "./modules/rooms/rooms.routes.js";
import classRoutes from "./modules/classes/classes.routes.js";
import classScheduleRoutes from "./modules/class-schedules/class-schedules.routes.js";
import enrollmentRoutes from "./modules/enrollments/enrollments.routes.js";
import paymentRoutes from "./modules/payments/payments.routes.js";
import invoiceRoutes from "./modules/invoices/invoices.routes.js";
import reportRoutes from "./modules/reports/reports.routes.js";

const app = express();

// Global middlewares
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger
app.use(
  "/api/v1/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss:
      // "Copy path to clipboard" on the operation summary — hidden, shown on hover
      ".swagger-ui .opblock .opblock-summary .view-line-link.copy-to-clipboard { opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }\n" +
      ".swagger-ui .opblock .opblock-summary:hover .view-line-link.copy-to-clipboard { opacity: 1; pointer-events: auto; }\n" +
      ".swagger-ui .opblock .opblock-summary .view-line-link.copy-to-clipboard:has(button:focus-visible) { opacity: 1; }",
  })
);

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "Sports Center API is running" });
});

// API routes
const v1 = "/api/v1";
app.use(`${v1}/auth`, authRoutes);
app.use(`${v1}/users`, userRoutes);
app.use(`${v1}/members`, memberRoutes);
app.use(`${v1}/coaches`, coachRoutes);
app.use(`${v1}/membership-plans`, membershipPlanRoutes);
app.use(`${v1}/subscriptions`, subscriptionRoutes);
app.use(`${v1}/sports`, sportRoutes);
app.use(`${v1}/rooms`, roomRoutes);
app.use(`${v1}/classes`, classRoutes);
app.use(`${v1}/class-schedules`, classScheduleRoutes);
app.use(`${v1}/enrollments`, enrollmentRoutes);
app.use(`${v1}/payments`, paymentRoutes);
app.use(`${v1}/invoices`, invoiceRoutes);
app.use(`${v1}/reports`, reportRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use(errorHandler);

export default app;