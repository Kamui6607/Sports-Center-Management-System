import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import type { CreatePlanInput, UpdatePlanInput } from "./membership-plans.schema.js";

export async function listPlans(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.tier) where.tier = query.tier;
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";

  const [total, plans] = await Promise.all([
    prisma.membershipPlan.count({ where }),
    prisma.membershipPlan.findMany({
      where,
      skip,
      take: limit,
      orderBy: { price: "asc" },
    }),
  ]);

  return { plans, pagination: buildPaginationMeta(total, page, limit) };
}

export async function createPlan(data: CreatePlanInput) {
  const existing = await prisma.membershipPlan.findFirst({ where: { name: data.name } });
  if (existing) throw new AppError("A plan with this name already exists", 409);

  return prisma.membershipPlan.create({ data });
}

export async function getPlanById(id: string) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan) throw new AppError("Membership plan not found", 404);
  return plan;
}

export async function updatePlan(id: string, data: UpdatePlanInput) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan) throw new AppError("Membership plan not found", 404);
  return prisma.membershipPlan.update({ where: { id }, data });
}

export async function deletePlan(id: string) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan) throw new AppError("Membership plan not found", 404);

  const activeSubs = await prisma.membershipSubscription.count({
    where: { planId: id, status: "ACTIVE" },
  });
  if (activeSubs > 0)
    throw new AppError("Cannot deactivate plan with active subscriptions", 400);

  return prisma.membershipPlan.update({ where: { id }, data: { isActive: false } });
}
