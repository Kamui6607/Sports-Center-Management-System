import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function createProduct(data: any, createdById: string) {
  return prisma.product.create({
    data: {
      ...data,
      createdById,
    },
  });
}

export async function listProducts(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.search) {
    where.name = { contains: query.search, mode: "insensitive" };
  }
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === "true";
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { products, pagination: buildPaginationMeta(total, page, limit) };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      reviews: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

export async function updateProduct(id: string, data: any) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);

  return prisma.product.update({
    where: { id },
    data,
  });
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError("Product not found", 404);

  return prisma.product.delete({ where: { id } });
}

// ── Mua sản phẩm ─────────────────────────────────────────────────────────────

export async function createProductOrder(userId: string, productId: string, quantity: number) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError("Product not found", 404);
    if (!product.isActive) throw new AppError("Product is no longer active", 400);

    if (product.stockQuantity < quantity) {
      throw new AppError(`Not enough stock. Only ${product.stockQuantity} items left.`, 400);
    }

    const totalPrice = Number(product.price) * quantity;

    // Giảm số lượng trong kho
    await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: { decrement: quantity } },
    });

    const order = await tx.productOrder.create({
      data: {
        productId,
        userId,
        quantity,
        totalPrice,
        status: "SUCCESS", // Mặc định SUCCESS (có thể mở rộng tích hợp thanh toán online sau)
      },
    });

    return order;
  });
}

export async function listMyProductOrders(userId: string, query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const skip = (page - 1) * limit;

  const [total, orders] = await Promise.all([
    prisma.productOrder.count({ where: { userId } }),
    prisma.productOrder.findMany({
      where: { userId },
      include: { product: true },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { orders, pagination: buildPaginationMeta(total, page, limit) };
}

// ── Đánh giá ─────────────────────────────────────────────────────────────────

export async function addProductReview(userId: string, productId: string, data: { rating: number; comment?: string }) {
  // Chỉ cho đánh giá nếu đã từng mua thành công sản phẩm này
  const orderCount = await prisma.productOrder.count({
    where: { userId, productId, status: "SUCCESS" },
  });
  if (orderCount === 0) {
    throw new AppError("You can only review products that you have successfully purchased.", 403);
  }

  // Check đã review chưa
  const existingReview = await prisma.productReview.findUnique({
    where: { productId_userId: { productId, userId } },
  });
  if (existingReview) {
    throw new AppError("You have already reviewed this product. Please update your existing review.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.productReview.create({
      data: {
        userId,
        productId,
        rating: data.rating,
        comment: data.comment,
      },
    });

    // Tính toán lại rating 5 sao trung bình
    const aggregations = await tx.productReview.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const newRating = aggregations._avg.rating ?? 0;
    const newCount = aggregations._count.rating;

    await tx.product.update({
      where: { id: productId },
      data: {
        rating: newRating,
        reviewCount: newCount,
      },
    });

    return review;
  });
}
