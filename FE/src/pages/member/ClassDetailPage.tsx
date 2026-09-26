import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, Users } from "lucide-react";
import { classesApi } from "../../api/classes.api";
import { enrollmentsApi } from "../../api/enrollments.api";
import {
  AlertBanner,
  ConfirmModal,
  EmptyState,
  LoadingSpinner,
  StatusBadge,
} from "../../components/common";
import { CoachFeedback } from "../../shared/CoachFeedback";
import { ErrorState } from "../../shared/feedback";
import { formatMemberDate } from "../../shared/memberFormat";
import { sportNames } from "../../shared/sports";
import type {
  CoursePlanSession,
  CourseRegistrationBlocker,
} from "../../types/member";

function courseBlockers(error: unknown): CourseRegistrationBlocker[] {
  const raw =
    (error as { details?: unknown; errors?: unknown } | undefined)?.details ??
    (error as { errors?: unknown } | undefined)?.errors;
  const details = (raw as { details?: unknown } | undefined)?.details;
  return Array.isArray(details) ? (details as CourseRegistrationBlocker[]) : [];
}

function blockerText(blocker: CourseRegistrationBlocker) {
  if (!blocker.startTime) return blocker.message;
  return `${blocker.message} (${formatMemberDate(blocker.startTime, {
    hour: "2-digit",
    minute: "2-digit",
  })}${blocker.roomName ? ` · ${blocker.roomName}` : ""})`;
}

function sessionLabel(session: CoursePlanSession) {
  if (session.myEnrollmentStatus === "BOOKED")
    return { text: "Đã đặt", color: "#267346", background: "#edfcf2" };
  if (session.myEnrollmentStatus === "COMPLETED")
    return { text: "Đã hoàn thành", color: "#026aa2", background: "#f0f9ff" };
  if (session.isFull)
    return { text: "Hết chỗ", color: "#d92d20", background: "#fef3f2" };
  if (session.conflictWith)
    return {
      text: `Trùng giờ với ${session.conflictWith.className}`,
      color: "#b54708",
      background: "#fffaeb",
    };
  return { text: "Chưa đặt", color: "#475467", background: "#f2f4f7" };
}

const cardStyle = {
  background: "#ffffff",
  borderRadius: 20,
  border: "1px solid #e7ece9",
  padding: 28,
};

export function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const {
    data: cls,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["class", id],
    queryFn: () => (id ? classesApi.getClassById(id) : null),
    enabled: Boolean(id),
  });
  const {
    data: plan,
    isLoading: planLoading,
    error: planError,
  } = useQuery({
    queryKey: ["course-plan", id],
    queryFn: () => (id ? classesApi.getCoursePlan(id) : null),
    enabled: Boolean(id),
  });
  const enrollments = useQuery({
    queryKey: ["my-enrollments", "feedback-eligibility"],
    queryFn: () => enrollmentsApi.getMyEnrollments(),
  });

  const enrollCourseMutation = useMutation({
    mutationFn: () => enrollmentsApi.enrollWholeCourse(id!),
    onSuccess: (result) => {
      const { summary } = result;
      setActionSuccess(
        summary.enrolledNow > 0
          ? `Bạn đã đăng ký ${summary.enrolledNow} buổi của khóa "${result.className}". Hiện đã có ${summary.totalRegistered}/${summary.totalSessions} buổi trong khóa của bạn.`
          : `Bạn đã đăng ký đủ ${summary.totalSessions} buổi của khóa này trước đó.`,
      );
      setActionError(null);
      setConfirmOpen(false);
      for (const key of [
        ["class", id],
        ["course-plan", id],
        ["my-enrollments"],
        ["my-enrollment-quota"],
        ["member-schedule"],
        ["classes"],
      ])
        queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: unknown) => {
      setActionError(err);
      setConfirmOpen(false);
    },
  });

  if (isLoading) return <LoadingSpinner text="Đang tải thông tin lớp học..." />;
  if (error || !cls)
    return (
      <EmptyState
        title="Không tìm thấy thông tin lớp học"
        description={
          (error as Error)?.message ||
          "Lớp học không tồn tại hoặc đã ngừng hoạt động."
        }
        action={
          <button
            className="button primary"
            onClick={() => navigate("/member/classes")}
          >
            Quay lại danh sách lớp
          </button>
        }
      />
    );

  const coaches = cls.coaches || [];
  const course = plan?.course;
  const registration = plan?.registration;
  const mutationBlockers = courseBlockers(actionError);

  const blockerActions = (blockers: CourseRegistrationBlocker[]) => {
    const codes = blockers.map((blocker) => blocker.code);
    const needsMembership = codes.some((code) =>
      [
        "SUBSCRIPTION_ENDS_BEFORE_COURSE_END",
        "NO_ACTIVE_SUBSCRIPTION",
        "PREMIUM_REQUIRED",
      ].includes(code),
    );
    const membershipLabel = codes.includes("NO_ACTIVE_SUBSCRIPTION")
      ? "Mua gói"
      : codes.includes("PREMIUM_REQUIRED")
        ? "Nâng cấp gói"
        : "Gia hạn ngay";
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {needsMembership && (
          <button
            className="button primary"
            onClick={() => navigate("/member/membership")}
          >
            {membershipLabel}
          </button>
        )}
        {codes.includes("CONCURRENT_CLASS_LIMIT_REACHED") && (
          <button
            className="button"
            onClick={() => navigate("/member/my-classes")}
          >
            Xem các lớp đang giữ
          </button>
        )}
        {codes.includes("ATTENDANCE_PENALTY_ACTIVE") && (
          <span style={{ alignSelf: "center", fontSize: 13 }}>
            Vui lòng liên hệ quản lý trung tâm để được hỗ trợ.
          </span>
        )}
      </div>
    );
  };
  const blockerList = (blockers: CourseRegistrationBlocker[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ul style={{ margin: 0, paddingLeft: 22 }}>
        {blockers.map((blocker, index) => (
          <li key={`${blocker.code}-${blocker.sessionId || index}`}>
            {blockerText(blocker)}
          </li>
        ))}
      </ul>
      {blockerActions(blockers)}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <button
        onClick={() => navigate("/member/classes")}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          color: "#54655d",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <ArrowLeft size={16} /> Quay lại danh sách lớp
      </button>

      {actionSuccess && (
        <AlertBanner
          type="success"
          title="Đăng ký thành công"
          message={actionSuccess}
        />
      )}
      {actionError !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AlertBanner
            type="error"
            title="Không thể đăng ký trọn khóa"
            message={
              actionError instanceof Error
                ? actionError.message
                : "Đăng ký khóa học thất bại. Vui lòng thử lại."
            }
          />
          {mutationBlockers.length > 0 && blockerList(mutationBlockers)}
        </div>
      )}

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#203d31",
                backgroundColor: "#f2f8eb",
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #d4ebbf",
              }}
            >
              {sportNames(cls)}
            </span>
            <StatusBadge status={cls.classType} />
          </div>
          <span style={{ fontSize: 13, color: "#58695f" }}>
            Tối đa: <strong>{cls.capacity} học viên/ca</strong>
          </span>
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: "#203d31",
            margin: "0 0 10px",
          }}
        >
          {cls.name}
        </h1>
        <p
          style={{
            color: "#475467",
            fontSize: 14,
            lineHeight: 1.6,
            margin: "0 0 24px",
            maxWidth: 780,
          }}
        >
          {cls.description ||
            "Lớp học được thiết kế chuyên sâu giúp học viên nâng cao kỹ thuật, phát triển thể lực và giữ vững phong độ."}
        </p>
        <div style={{ paddingTop: 18, borderTop: "1px solid #f2f5f3" }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#203d31",
              marginBottom: 12,
            }}
          >
            Đội ngũ Huấn luyện viên
          </h3>
          {coaches.length === 0 ? (
            <span style={{ fontSize: 13, color: "#58695f" }}>
              Chưa chỉ định huấn luyện viên
            </span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {coaches.map((assigned) => (
                <div
                  key={assigned.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: "#f9fbfa",
                    border: "1px solid #e7ece9",
                    padding: "10px 16px",
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      backgroundColor: "#203d31",
                      color: "#d3f879",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {assigned.coach?.user?.fullName?.charAt(0) || "C"}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: "#203d31" }}>
                      {assigned.coach?.user?.fullName}
                    </strong>
                    <div style={{ fontSize: 11, color: "#58695f" }}>
                      {assigned.isPrimary ? "HLV chính" : "HLV hỗ trợ"}
                      {assigned.coach?.specialization
                        ? ` · ${assigned.coach.specialization}`
                        : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {coaches.map(
        (assigned) =>
          assigned.coach?.id && (
            <details className="detail-disclosure" key={assigned.coach.id}>
              <summary>Đánh giá · {assigned.coach.user?.fullName}</summary>
              <div className="workflow-card">
                <CoachFeedback
                  coachId={assigned.coach.id}
                  classId={cls.id}
                  role="MEMBER"
                  canReview={Boolean(
                    enrollments.data?.enrollments.some(
                      (enrollment) =>
                        ["BOOKED", "COMPLETED"].includes(enrollment.status) &&
                        (enrollment.classId === cls.id ||
                          enrollment.schedule?.class?.id === cls.id ||
                          enrollment.schedule?.class?.coaches?.some(
                            (coach) => coach.coach?.id === assigned.coach.id,
                          )),
                    ),
                  )}
                />
              </div>
            </details>
          ),
      )}

      <section style={cardStyle}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#203d31",
            margin: "0 0 4px",
          }}
        >
          Khóa học
        </h2>
        <p style={{ margin: "0 0 20px", color: "#58695f", fontSize: 13 }}>
          Toàn bộ lịch trình của lớp — đăng ký một lần cho cả khóa
        </p>
        {planError ? (
          <ErrorState error={planError} />
        ) : planLoading ? (
          <LoadingSpinner text="Đang tải lịch trình khóa học..." />
        ) : !course ? (
          <EmptyState
            icon={<Calendar size={36} />}
            title="Chưa có ca học sắp tới"
            description="Hiện chưa có ca học nào được lên lịch cho lớp này. Vui lòng quay lại sau."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                color: "#475467",
                fontSize: 13,
              }}
            >
              <strong>{course.totalSessions} buổi</strong>
              <span>·</span>
              <span>
                {formatMemberDate(course.firstSessionStart)} →{" "}
                {formatMemberDate(course.lastSessionStart)}
              </span>
              <span>·</span>
              <span>Tối đa {course.capacity} học viên/buổi</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {course.slots.map((slot) => (
                <div
                  key={`${slot.weekday}-${slot.startTime}-${slot.roomId}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    padding: "14px 16px",
                    border: "1px solid #d4ebbf",
                    background: "#f8fcef",
                    borderRadius: 12,
                  }}
                >
                  <div>
                    <strong style={{ color: "#203d31", fontSize: 14 }}>
                      {slot.weekdayLabel} · {slot.startTime}–{slot.endTime} ·{" "}
                      {slot.roomName}
                    </strong>
                    <div
                      style={{ color: "#667085", fontSize: 12, marginTop: 4 }}
                    >
                      {formatMemberDate(slot.firstSessionStart)} →{" "}
                      {formatMemberDate(slot.lastSessionStart)}
                    </div>
                  </div>
                  <span
                    style={{
                      background: "#ffffff",
                      border: "1px solid #d4ebbf",
                      borderRadius: 999,
                      padding: "5px 10px",
                      color: "#376228",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {slot.sessionCount} buổi
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color:
                    course.availability.minRemainingSlots === 0
                      ? "#d92d20"
                      : "#267346",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <Users size={16} /> Còn {course.availability.minRemainingSlots}/
                {course.capacity} chỗ/buổi
              </span>
              {course.availability.fullSessionCount > 0 && (
                <span style={{ color: "#d92d20", fontSize: 13 }}>
                  Có {course.availability.fullSessionCount} buổi đã hết chỗ
                </span>
              )}
            </div>
            {registration && !registration.eligible && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <AlertBanner
                  type="warning"
                  title="Chưa thể đăng ký trọn khóa"
                  message="Vui lòng xử lý các điều kiện dưới đây trước khi đăng ký."
                />
                {blockerList(registration.blockers)}
              </div>
            )}
            <button
              className="button primary"
              disabled={
                enrollCourseMutation.isPending ||
                !registration ||
                !registration.eligible ||
                course.availability.minRemainingSlots === 0
              }
              onClick={() => {
                setActionError(null);
                setActionSuccess(null);
                setConfirmOpen(true);
              }}
              style={{ alignSelf: "flex-start" }}
            >
              {!registration ||
              !registration.eligible ||
              course.availability.minRemainingSlots === 0
                ? "Chưa thể đăng ký"
                : "Đăng ký trọn khóa"}
            </button>
            <details className="detail-disclosure">
              <summary>Xem {course.totalSessions} buổi học</summary>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {plan.sessions.map((session) => {
                  const label = sessionLabel(session);
                  return (
                    <div
                      key={session.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 14,
                        padding: "14px 16px",
                        border: "1px solid #e7ece9",
                        borderRadius: 12,
                      }}
                    >
                      <div>
                        <strong style={{ color: "#203d31", fontSize: 13 }}>
                          <Clock
                            size={14}
                            style={{ verticalAlign: "middle" }}
                          />{" "}
                          {session.weekdayLabel} · {session.timeLabel}
                        </strong>
                        <div
                          style={{
                            color: "#667085",
                            fontSize: 12,
                            marginTop: 5,
                          }}
                        >
                          {formatMemberDate(session.startTime)} ·{" "}
                          <MapPin
                            size={13}
                            style={{ verticalAlign: "middle" }}
                          />{" "}
                          {session.room.name} ·{" "}
                          {session.isFull
                            ? "Hết chỗ"
                            : `Còn ${session.remainingSlots}/${course.capacity}`}
                        </div>
                      </div>
                      <span
                        style={{
                          padding: "5px 9px",
                          borderRadius: 999,
                          color: label.color,
                          background: label.background,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {label.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => enrollCourseMutation.mutate()}
        title="Xác nhận đăng ký trọn khóa"
        message={
          course
            ? `Bạn sẽ đăng ký khóa "${course.className}" gồm ${course.totalSessions} buổi, từ ${formatMemberDate(course.firstSessionStart)} đến ${formatMemberDate(course.lastSessionEnd)}. Lịch học: ${course.slots.map((slot) => `${slot.weekdayLabel} ${slot.startTime}–${slot.endTime}`).join("; ")}. Học phí theo gói hội viên hiện tại.`
            : ""
        }
        confirmText="Xác nhận đăng ký"
        cancelText="Để sau"
        loading={enrollCourseMutation.isPending}
      />
    </div>
  );
}
