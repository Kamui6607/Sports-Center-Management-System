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
}
