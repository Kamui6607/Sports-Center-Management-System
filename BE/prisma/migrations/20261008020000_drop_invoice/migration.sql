-- Nghiệp vụ mới: bỏ hẳn hóa đơn. XÓA bảng Invoice (kèm toàn bộ hóa đơn cũ) và enum InvoiceStatus. Idempotent.
DROP TABLE IF EXISTS "Invoice";
DROP TYPE IF EXISTS "InvoiceStatus";
