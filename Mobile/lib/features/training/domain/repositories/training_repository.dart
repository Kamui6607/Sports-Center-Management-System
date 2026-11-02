import 'dart:typed_data';

import '../../../../core/data/picked_file.dart';
import '../entities/training.dart';

/// Lộ trình tập luyện — module `training-plans`.
abstract interface class TrainingRepository {
  /// Lộ trình của Member đang đăng nhập (`GET /training-plans?memberId=`).
  Future<List<TrainingPlan>> myPlans();

  Future<TrainingPlan> plan(String planId);

  /// Lộ trình HLV lập cho một học viên.
  Future<List<TrainingPlan>> plansForMember(String memberProfileId);

  /// `POST /training-plans`.
  Future<TrainingPlan> createPlan(PlanDraft draft);

  /// `POST /training-plans/results`.
  Future<void> addResult(String planId, ResultDraft draft);

  /// `POST /training-plans/:id/attachments` — HLV đính kèm PDF/Excel (≤ 10 MB, tối đa 20 tệp).
  Future<PlanAttachment> addAttachment(String planId, PickedFile file);

  /// `GET /training-plans/:id/attachments/:attachmentId` — tải nội dung tệp (có xác thực).
  Future<Uint8List> attachmentFile(String planId, String attachmentId);

  /// `DELETE /training-plans/:id/attachments/:attachmentId` — chỉ HLV phụ trách.
  Future<void> deleteAttachment(String planId, String attachmentId);
}
