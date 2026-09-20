import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

const invoiceInclude = {
  member: {
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
    },
  },
  payment: {
    include: {
      subscription: { include: { plan: true } },
    },
  },
};

export async function listInvoices(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.memberId) where.memberId = query.memberId;
  if (query.status) where.status = query.status;
  if (query.startDate || query.endDate) {
    where.issuedAt = {};
    if (query.startDate) where.issuedAt.gte = new Date(query.startDate);
    if (query.endDate) where.issuedAt.lte = new Date(query.endDate);
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where, skip, take: limit,
      include: invoiceInclude,
      orderBy: { issuedAt: "desc" },
    }),
  ]);
  return { invoices, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getInvoiceById(id: string, currentUser: any) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: invoiceInclude,
  });
  if (!invoice) throw new AppError("Invoice not found", 404);

  // IDOR: MEMBER can only view their own invoice
  if (currentUser.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: currentUser.id } });
    if (!memberProfile || invoice.memberId !== memberProfile.id) {
      throw new AppError("Forbidden: You can only view your own invoices", 403);
    }
  }
  if (currentUser.role === "COACH") {
    throw new AppError("Forbidden: Coaches cannot view invoices", 403);
  }

  return invoice;
}

export async function getMemberInvoices(memberId: string, query: any, currentUser: any) {
  // Accept userId or profileId
  const memberProfile = await prisma.memberProfile.findFirst({
    where: { OR: [{ id: memberId }, { userId: memberId }] },
  });
  if (!memberProfile) throw new AppError("Member not found", 404);

  // IDOR: MEMBER can only view their own invoices
  if (currentUser.role === "MEMBER" && memberProfile.userId !== currentUser.id) {
    throw new AppError("Forbidden: You can only view your own invoices", 403);
  }
  if (currentUser.role === "COACH") {
    throw new AppError("Forbidden: Coaches cannot view invoices", 403);
  }

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;
  const where: any = { memberId: memberProfile.id };
  if (query.status) where.status = query.status;

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where, skip, take: limit,
      include: invoiceInclude,
      orderBy: { issuedAt: "desc" },
    }),
  ]);
  return { invoices, pagination: buildPaginationMeta(total, page, limit) };
}
