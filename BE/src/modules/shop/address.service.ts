import { prisma } from "../../config/prisma.js";
import { isDeliverableProvince, shopConfig } from "../../config/shop.js";
import { AppError } from "../../middlewares/errorHandler.js";
import type { AddressInput } from "./shop.schema.js";

/** Sổ địa chỉ giao hàng — mọi thao tác lọc theo chủ sở hữu (chặn IDOR: không phải của mình ⇒ 404). */

function view(a: Awaited<ReturnType<typeof prisma.userAddress.findFirstOrThrow>>) {
  return { ...a, fullAddress: formatAddress(a), deliverable: isDeliverableProvince(a.province) };
}

export function formatAddress(a: { street: string; ward?: string | null; district: string; province: string }): string {
  return [a.street, a.ward, a.district, a.province].filter((p) => p && p.trim()).join(", ");
}

export async function listAddresses(userId: string) {
  const rows = await prisma.userAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(view);
}

export async function getOwnAddress(userId: string, id: string) {
  const address = await prisma.userAddress.findFirst({ where: { id, userId } });
  if (!address) throw new AppError("Không tìm thấy địa chỉ.", 404, { code: "ADDRESS_NOT_FOUND" });
  return address;
}

export async function createAddress(userId: string, data: AddressInput) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.userAddress.count({ where: { userId } });
    if (count >= shopConfig().maxAddresses) {
      throw new AppError(`Sổ địa chỉ tối đa ${shopConfig().maxAddresses} địa chỉ.`, 400, { code: "ADDRESS_LIMIT" });
    }
    const makeDefault = count === 0 || data.isDefault === true;
    if (makeDefault) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    const created = await tx.userAddress.create({ data: { ...data, userId, isDefault: makeDefault } });
    return view(created);
  });
}

export async function updateAddress(userId: string, id: string, data: Partial<AddressInput>) {
  await getOwnAddress(userId, id);
  return prisma.$transaction(async (tx) => {
    if (data.isDefault === true) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    const { isDefault, ...rest } = data;
    const updated = await tx.userAddress.update({
      where: { id },
      // Bỏ mặc định bằng PATCH không được phép (luôn phải có 1 địa chỉ mặc định) ⇒ chỉ nhận isDefault=true.
      data: { ...rest, ...(isDefault === true ? { isDefault: true } : {}) },
    });
    return view(updated);
  });
}

export async function deleteAddress(userId: string, id: string) {
  const address = await getOwnAddress(userId, id);
  await prisma.$transaction(async (tx) => {
    await tx.userAddress.delete({ where: { id } });
    if (address.isDefault) {
      const next = await tx.userAddress.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
      if (next) await tx.userAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  return listAddresses(userId);
}

export async function setDefaultAddress(userId: string, id: string) {
  await getOwnAddress(userId, id);
  await prisma.$transaction([
    prisma.userAddress.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.userAddress.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return listAddresses(userId);
}
