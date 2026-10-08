-- Outbox hỗ trợ kênh EMAIL (Brevo) bên cạnh thông báo trong app. Idempotent.
DO $$ BEGIN
  CREATE TYPE "OutboxChannel" AS ENUM ('IN_APP', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "channel" "OutboxChannel" NOT NULL DEFAULT 'IN_APP';
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "email" TEXT;
