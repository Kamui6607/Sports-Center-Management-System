import '../../../../core/data/paged.dart';
import '../entities/coach_class.dart';
import '../entities/course.dart';

/// Khóa học — module `classes` (+ `course-plan`, `class-schedules/activity-plan`).
abstract interface class CourseRepository {
  /// `GET /classes` — Member/Guest chỉ thấy `APPROVED` (Guest không cần token — BE-1).
  Future<Paged<CourseClass>> browse(ClassQuery query);

  /// `GET /classes/:id` + `GET /classes/:id/course-plan`.
  Future<CourseDetail> detail(String classId);

  /// Khóa Member đã mua (suy từ payment SUCCESS + enrollments).
  Future<List<MyCourse>> myCourses();

  /// `GET /classes?createdByMe=true` (Coach).
  Future<List<CourseClass>> coachClasses();

  /// Chi tiết khóa ở góc nhìn HLV.
  Future<CoachClassDetail> coachClassDetail(String classId);

  /// `POST /class-schedules/activity-plan` ⇒ khóa `PENDING` chờ duyệt.
  Future<CourseClass> createClass(ClassDraft draft);

  /// Bản nháp từ khóa có sẵn (để sửa & gửi lại).
  Future<ClassDraft> draftOf(String classId);

  /// `PATCH /classes/:id/resubmit` — sửa & gửi lại khóa bị từ chối ⇒ `PENDING` (BE-3).
  Future<CourseClass> resubmitClass(String classId, ClassDraft draft);

  /// `GET /coaches/:id/profile` — hồ sơ công khai HLV (bảng thông tin ở chi tiết khóa).
  Future<CoachPublicProfile> coachProfile(String coachProfileId);

  /// `GET /enrollments/my/courses` — lịch sử khóa học đã mua (snapshot lúc mua) gồm cả đang chờ thanh toán.
  Future<List<MemberCourse>> courseHistory();

  /// Tự lưu bản nháp (`POST /classes/drafts` khi [draftId] null, ngược lại `PATCH /classes/drafts/:id`).
  /// [state] = toàn bộ trạng thái wizard (để mở lại đúng chỗ). Trả id bản nháp.
  Future<String> saveDraft(String? draftId, ClassDraft draft, Map<String, Object?> state);

  /// Trạng thái wizard đã lưu của bản nháp (null nếu không còn là nháp).
  Future<Map<String, Object?>?> loadDraftState(String draftId);

  /// `DELETE /classes/drafts/:id`.
  Future<void> deleteDraft(String draftId);

  /// `POST /classes/drafts/:id/submit` — kiểm tra đủ, giữ phòng, tạo buổi ⇒ `PENDING`.
  Future<CourseClass> submitDraft(String draftId, ClassDraft draft);
}
