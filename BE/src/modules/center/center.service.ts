import { prisma } from "../../config/prisma.js";
import type { UpdateCenterInput } from "./center.schema.js";

const CENTER_ID = "default";

/** Link mở bản đồ: dùng `mapUrl` của Manager, không có thì tìm theo địa chỉ trên Google Maps. */
function withMapLink<T extends { address: string; mapUrl: string | null }>(center: T) {
  return {
    ...center,
    mapLink: center.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center.address)}`,
  };
}

/** Thông tin trung tâm (công khai) — Member/Coach biết nơi tập. Chưa cấu hình ⇒ tạo bản mặc định. */
export async function getCenter() {
  const center = await prisma.centerSetting.upsert({
    where: { id: CENTER_ID },
    create: {
      id: CENTER_ID,
      name: "Pulse Gym Center",
      address: "Cập nhật địa chỉ trung tâm tại Web quản trị › Cài đặt trung tâm",
      openingHours: "05:30 – 22:00 hằng ngày",
    },
    update: {},
  });
  return withMapLink(center);
}

/** Manager cập nhật thông tin trung tâm. */
export async function updateCenter(data: UpdateCenterInput) {
  const center = await prisma.centerSetting.upsert({
    where: { id: CENTER_ID },
    create: { id: CENTER_ID, ...data },
    update: data,
  });
  return withMapLink(center);
}
