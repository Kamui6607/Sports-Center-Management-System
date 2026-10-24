-- D03: file chat không còn phục vụ tĩnh công khai — metadata owner/receiver quyết định quyền tải.
-- Additive: bảng mới + FK; dữ liệu cũ (file ở uploads/ gốc) không có metadata ⇒ cần upload lại.

CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "receiverId" TEXT,
    "messageId" TEXT,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatAttachment_messageId_key" ON "ChatAttachment"("messageId");
CREATE INDEX "ChatAttachment_ownerId_idx" ON "ChatAttachment"("ownerId");
CREATE INDEX "ChatAttachment_receiverId_idx" ON "ChatAttachment"("receiverId");

ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
