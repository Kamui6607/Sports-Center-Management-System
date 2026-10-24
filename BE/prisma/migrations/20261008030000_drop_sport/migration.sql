-- Nghiệp vụ mới: bộ môn nằm trong tên lớp, KHÔNG còn bảng bộ môn / quan hệ nhiều-nhiều.
-- XÓA bảng nối "_ClassToFitness" và bảng "Fitness" (model Sport) cùng toàn bộ dữ liệu bộ môn. Idempotent.
DROP TABLE IF EXISTS "_ClassToFitness";
DROP TABLE IF EXISTS "Fitness";
