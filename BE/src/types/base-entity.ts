import type * as Models from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * BaseEntity — field chung của MỌI bảng trong hệ thống.
 *
 * Prisma không hỗ trợ kế thừa model, nên mỗi model trong `prisma/schema.prisma` tự khai báo
 * đủ 3 field này với ĐÚNG định nghĩa:
 *
 *   id        String   @id @default(uuid())
 *   createdAt DateTime @default(now())
 *   updatedAt DateTime @default(now()) @updatedAt
 *
 * File này là "hợp đồng" ở tầng TypeScript: `npx tsc --noEmit` báo lỗi nếu có model thiếu field
 * hoặc có model mới chưa được khai báo trong `BaseEntityModels` bên dưới.
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Field do DB/Prisma tự quản — không nhận từ client khi tạo/sửa. */
export type BaseEntityKeys = keyof BaseEntity;

/** Dữ liệu nghiệp vụ của một entity (bỏ id, createdAt, updatedAt). */
export type EntityData<T extends BaseEntity> = Omit<T, BaseEntityKeys>;

/**
 * Danh sách MỌI model kế thừa BaseEntity. Thêm model mới vào schema ⇒ thêm 1 dòng ở đây.
 * Key phải trùng tên model trong schema (VD `Sport`, dù bảng dưới DB tên `Fitness`).
 */
type BaseEntityModels = {
  Role: Models.Role;
  User: Models.User;
  RefreshToken: Models.RefreshToken;
  MemberProfile: Models.MemberProfile;
  CoachProfile: Models.CoachProfile;
  Certification: Models.Certification;
  ManagerProfile: Models.ManagerProfile;
  Sport: Models.Sport;
  Room: Models.Room;
  Class: Models.Class;
  ClassMember: Models.ClassMember;
  ClassSchedule: Models.ClassSchedule;
  Enrollment: Models.Enrollment;
  Payment: Models.Payment;
  SepayBankTransaction: Models.SepayBankTransaction;
  NotificationOutbox: Models.NotificationOutbox;
  SepayWebhookEvent: Models.SepayWebhookEvent;
  Invoice: Models.Invoice;
  ChatMessage: Models.ChatMessage;
  ChatAttachment: Models.ChatAttachment;
  Attendance: Models.Attendance;
  AttendanceManualCode: Models.AttendanceManualCode;
  AttendanceManualCodeAttempt: Models.AttendanceManualCodeAttempt;
  AttendancePenalty: Models.AttendancePenalty;
  TrainingPlan: Models.TrainingPlan;
  TrainingResult: Models.TrainingResult;
  CoachFeedback: Models.CoachFeedback;
  Notification: Models.Notification;
  CoachWallet: Models.CoachWallet;
  WalletTransaction: Models.WalletTransaction;
  Refund: Models.Refund;
  Product: Models.Product;
  ProductReview: Models.ProductReview;
  ProductOrder: Models.ProductOrder;
};

// ── Kiểm tra lúc biên dịch (không sinh code chạy) ────────────────────────────
type Expect<T extends true> = T;

/** Model có trong `BaseEntityModels` VÀ có đủ field BaseEntity. */
type ValidBaseEntityModels = {
  [K in keyof BaseEntityModels]: BaseEntityModels[K] extends BaseEntity ? K : never;
}[keyof BaseEntityModels];

/** Model Prisma chưa khai báo ở trên hoặc thiếu field BaseEntity — phải rỗng. */
type ModelsBreakingBaseEntity = Exclude<Prisma.ModelName, ValidBaseEntityModels>;

/**
 * Lỗi kiểu `Type '"Xyz"' does not satisfy the constraint 'true'` ⇒ model `Xyz` thiếu
 * id/createdAt/updatedAt hoặc chưa được thêm vào `BaseEntityModels`.
 */
export type AssertAllModelsAreBaseEntity = Expect<
  [ModelsBreakingBaseEntity] extends [never] ? true : ModelsBreakingBaseEntity
>;
