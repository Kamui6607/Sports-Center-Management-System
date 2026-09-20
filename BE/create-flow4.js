const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'modules');

// ATTENDANCE
const attendanceCode = {
  'attendance.schema.ts': `
import { z } from "zod";

export const CreateAttendanceSchema = z.object({
  scheduleId: z.string().uuid(),
  memberId: z.string().uuid(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  note: z.string().optional()
});

export const UpdateAttendanceSchema = z.object({
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).optional(),
  note: z.string().optional()
});
  `,
  'attendance.service.ts': `
import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";

export const createAttendance = async (data: Prisma.AttendanceUncheckedCreateInput) => {
  return prisma.attendance.create({ data });
};

export const getAttendancesBySchedule = async (scheduleId: string) => {
  return prisma.attendance.findMany({ where: { scheduleId }, include: { member: { include: { user: true } } } });
};

export const updateAttendance = async (id: string, data: Prisma.AttendanceUpdateInput) => {
  return prisma.attendance.update({ where: { id }, data });
};
  `,
  'attendance.controller.ts': `
import { Request, Response, NextFunction } from "express";
import * as service from "./attendance.service.js";

export const createAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendance = await service.createAttendance(req.body);
    res.status(201).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

export const getAttendances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAttendancesBySchedule(req.query.scheduleId as string);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attendance = await service.updateAttendance(req.params.id, req.body);
    res.json({ success: true, data: attendance });
  } catch (error) { next(error); }
};
  `,
  'attendance.routes.ts': `
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./attendance.controller.js";
import { CreateAttendanceSchema, UpdateAttendanceSchema } from "./attendance.schema.js";

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Attendance
 */

/**
 * @swagger
 * /attendance:
 *   get:
 *     tags: [Attendance]
 *     parameters:
 *       - in: query
 *         name: scheduleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Success" }
 */
router.get("/", controller.getAttendances);

/**
 * @swagger
 * /attendance:
 *   post:
 *     tags: [Attendance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduleId: { type: string }
 *               memberId: { type: string }
 *               status: { type: string, enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"] }
 *     responses:
 *       201: { description: "Success" }
 */
router.post("/", authorize("COACH", "MANAGER"), validate(CreateAttendanceSchema), controller.createAttendance);

/**
 * @swagger
 * /attendance/{id}:
 *   patch:
 *     tags: [Attendance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"] }
 *     responses:
 *       200: { description: "Success" }
 */
router.patch("/:id", authorize("COACH", "MANAGER"), validate(UpdateAttendanceSchema), controller.updateAttendance);

export default router;
  `
};

// TRAINING PLANS
const trainingCode = {
  'training-plans.schema.ts': `
import { z } from "zod";

export const CreateTrainingPlanSchema = z.object({
  memberId: z.string().uuid(),
  coachId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

export const CreateTrainingResultSchema = z.object({
  planId: z.string().uuid(),
  date: z.string().datetime(),
  metrics: z.record(z.any()).optional(),
  coachNote: z.string().optional()
});
  `,
  'training-plans.service.ts': `
import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";

export const createPlan = async (data: Prisma.TrainingPlanUncheckedCreateInput) => {
  return prisma.trainingPlan.create({ data });
};

export const getPlans = async (memberId?: string) => {
  return prisma.trainingPlan.findMany({ 
    where: memberId ? { memberId } : undefined,
    include: { coach: { include: { user: true } }, results: true }
  });
};

export const createResult = async (data: Prisma.TrainingResultUncheckedCreateInput) => {
  return prisma.trainingResult.create({ data });
};
  `,
  'training-plans.controller.ts': `
import { Request, Response, NextFunction } from "express";
import * as service from "./training-plans.service.js";

export const createPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.createPlan(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
};

export const getPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await service.getPlans(req.query.memberId as string);
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
};

export const createResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createResult(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
};
  `,
  'training-plans.routes.ts': `
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./training-plans.controller.js";
import { CreateTrainingPlanSchema, CreateTrainingResultSchema } from "./training-plans.schema.js";

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Training
 */

/**
 * @swagger
 * /training-plans:
 *   get:
 *     tags: [Training]
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Success" }
 */
router.get("/", controller.getPlans);

/**
 * @swagger
 * /training-plans:
 *   post:
 *     tags: [Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberId: { type: string }
 *               coachId: { type: string }
 *               name: { type: string }
 *               startDate: { type: string }
 *               endDate: { type: string }
 *     responses:
 *       201: { description: "Success" }
 */
router.post("/", authorize("COACH", "MANAGER"), validate(CreateTrainingPlanSchema), controller.createPlan);

/**
 * @swagger
 * /training-plans/results:
 *   post:
 *     tags: [Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId: { type: string }
 *               date: { type: string }
 *     responses:
 *       201: { description: "Success" }
 */
router.post("/results", authorize("COACH", "MANAGER"), validate(CreateTrainingResultSchema), controller.createResult);

export default router;
  `
};

for (const [file, content] of Object.entries(attendanceCode)) {
  fs.writeFileSync(path.join(srcDir, 'attendance', file), content.trim());
}

for (const [file, content] of Object.entries(trainingCode)) {
  fs.writeFileSync(path.join(srcDir, 'training-plans', file), content.trim());
}

console.log("Created successfully!");
