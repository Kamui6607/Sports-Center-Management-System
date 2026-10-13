import fs from "fs";
import path from "path";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { PLAN_UPLOAD_DIR } from "../../middlewares/upload.js";

type Actor = { id: string; role: string };

const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const MIME = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

/** Nhận diện loại thật từ magic bytes + đuôi khai báo: PDF (%PDF), xlsx (ZIP), xls (OLE2). */
export function sniffPlanDocument(filePath: string, originalName: string): { ext: "pdf" | "xlsx" | "xls"; mime: string } | null {
  let head: Buffer;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(8);
      const n = fs.readSync(fd, buf, 0, 8, 0);
      head = buf.subarray(0, n);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  const ext = path.extname(originalName).toLowerCase().replace(".", "");
  if (ext === "pdf" && head.length >= 4 && head.subarray(0, 4).toString("ascii") === "%PDF") return { ext: "pdf", mime: MIME.pdf };
  if (ext === "xlsx" && head.length >= 4 && head.subarray(0, 4).equals(ZIP_SIG)) return { ext: "xlsx", mime: MIME.xlsx };
  if (ext === "xls" && head.length >= 8 && head.equals(OLE_SIG)) return { ext: "xls", mime: MIME.xls };
  return null;
}

function removeFile(filePath: string) {
  fs.promises.unlink(filePath).catch(() => {});
}

function cleanName(name: string) {
  const base = path.basename(name).replace(/[\u0000-\u001f"\\/]/g, "_").trim();
  return base.slice(0, 200) || "file";
}

/** Quyền đọc: Coach phụ trách / Member của kế hoạch / Manager. Quyền ghi: chỉ Coach phụ trách. */
async function loadPlan(planId: string, actor: Actor, write: boolean) {
  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    include: { coach: { select: { userId: true } }, member: { select: { userId: true } } },
  });
  if (!plan) throw new AppError("Training plan not found", 404);
  const isCoach = actor.role === "COACH" && plan.coach.userId === actor.id;
  const isMember = actor.role === "MEMBER" && plan.member.userId === actor.id;
  const isManager = actor.role === "MANAGER";
  if (write ? !isCoach : !(isCoach || isMember || isManager)) {
    throw new AppError(write ? "Forbidden: Chỉ Coach phụ trách mới được đính kèm tệp" : "Forbidden", 403);
  }
  return plan;
}

const MAX_FILES_PER_PLAN = 20;

export async function addAttachment(planId: string, file: Express.Multer.File | undefined, actor: Actor) {
  if (!file) throw new AppError("Thiếu tệp (field `file`).", 400);
  try {
    await loadPlan(planId, actor, true);
    const detected = sniffPlanDocument(file.path, file.originalname);
    if (!detected) throw new AppError("Nội dung tệp không phải PDF/Excel hợp lệ.", 400, { code: "INVALID_FILE_CONTENT" });
    const count = await prisma.trainingPlanAttachment.count({ where: { planId } });
    if (count >= MAX_FILES_PER_PLAN) throw new AppError(`Mỗi lộ trình tối đa ${MAX_FILES_PER_PLAN} tệp.`, 400);

    const storedName = `${path.basename(file.filename, ".upload")}.${detected.ext}`;
    await fs.promises.rename(file.path, path.join(PLAN_UPLOAD_DIR, storedName));
    try {
      return await prisma.trainingPlanAttachment.create({
        data: { planId, uploadedById: actor.id, originalName: cleanName(file.originalname), storedName, mimeType: detected.mime, size: file.size },
        select: { id: true, planId: true, originalName: true, mimeType: true, size: true, createdAt: true },
      });
    } catch (e) {
      removeFile(path.join(PLAN_UPLOAD_DIR, storedName));
      throw e;
    }
  } catch (e) {
    removeFile(file.path);
    throw e;
  }
}

export async function listAttachments(planId: string, actor: Actor) {
  await loadPlan(planId, actor, false);
  return prisma.trainingPlanAttachment.findMany({
    where: { planId },
    orderBy: { createdAt: "desc" },
    select: { id: true, planId: true, originalName: true, mimeType: true, size: true, createdAt: true },
  });
}

export async function getAttachmentForDownload(planId: string, attachmentId: string, actor: Actor) {
  await loadPlan(planId, actor, false);
  const att = await prisma.trainingPlanAttachment.findFirst({ where: { id: attachmentId, planId } });
  if (!att) throw new AppError("Attachment not found", 404);
  const filePath = path.resolve(PLAN_UPLOAD_DIR, path.basename(att.storedName));
  if (!fs.existsSync(filePath)) throw new AppError("Tệp không còn trên máy chủ", 404);
  return { filePath, originalName: att.originalName, mimeType: att.mimeType };
}

export async function deleteAttachment(planId: string, attachmentId: string, actor: Actor) {
  await loadPlan(planId, actor, true);
  const att = await prisma.trainingPlanAttachment.findFirst({ where: { id: attachmentId, planId } });
  if (!att) throw new AppError("Attachment not found", 404);
  await prisma.trainingPlanAttachment.delete({ where: { id: att.id } });
  removeFile(path.resolve(PLAN_UPLOAD_DIR, path.basename(att.storedName)));
}
