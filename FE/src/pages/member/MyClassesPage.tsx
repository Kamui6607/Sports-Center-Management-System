import { sportNames } from "../../shared/sports";
import { formatMemberDate } from "../../shared/memberFormat";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { enrollmentsApi } from "../../api/enrollments.api";
import { classesApi } from "../../api/classes.api";
import type { Enrollment, EnrollmentStatus } from "../../types/member";
import {
  CalendarCheck,
  CalendarX,
  Clock,
  MapPin,
  Volleyball,
  CheckCircle2,
  ArrowRightLeft,
} from "lucide-react";
import { ErrorState, Loading, Modal } from "../../shared/ui";
import {
  LoadingSpinner,
  EmptyState,
  StatusBadge,
  ConfirmModal,
  AlertBanner,
} from "../../components/common";

export function MyClassesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<EnrollmentStatus>("BOOKED");
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetScheduleId, setTargetScheduleId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch enrollments by status
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-enrollments", activeTab],
    queryFn: () => enrollmentsApi.getMyEnrollments({ status: activeTab }),
  });

  const quota = useQuery({
    queryKey: ["my-enrollment-quota"],
    queryFn: () => enrollmentsApi.getMyQuota(),
  });

  const transferSchedules = useQuery({
    queryKey: ["transfer-schedules", selectedEnrollment?.classId],
    enabled: transferOpen && Boolean(selectedEnrollment?.classId),
    queryFn: () =>
      classesApi.getSchedules({
        classId: selectedEnrollment!.classId,
        status: "SCHEDULED",
        from: new Date().toISOString(),
      }),
  });

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentsApi.cancelEnrollment(enrollmentId),
    onSuccess: () => {
      setMessage({ type: "success", text: "Đã hủy đăng ký ca học thành công." });
      setConfirmCancelOpen(false);
      setSelectedEnrollment(null);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["member-schedule"] });
    },
    onError: (err: unknown) => {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Không thể hủy đăng ký ca học này.",
      });
      setConfirmCancelOpen(false);
    },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      enrollmentsApi.transferEnrollment(
        selectedEnrollment!.id,
        targetScheduleId,
      ),
    onSuccess: () => {
      setMessage({ type: "success", text: "Đã đổi buổi học thành công." });
      setTransferOpen(false);
      setSelectedEnrollment(null);
      setTargetScheduleId("");
      void queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      void queryClient.invalidateQueries({ queryKey: ["member-schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["class-schedules"] });
      void queryClient.invalidateQueries({ queryKey: ["my-enrollment-quota"] });
    },
  });

  const enrollments = data?.enrollments || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* HEADER */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "24px 28px",
          border: "1px solid #e7ece9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#203d31", margin: "0 0 6px" }}>
            Lớp học của tôi
          </h1>
          <p style={{ margin: 0, color: "#58695f", fontSize: 13 }}>
            Theo dõi danh sách các buổi học bạn đã đăng ký, buổi đã tham gia và lịch sử hủy lớp
          </p>
        </div>

        <button
          onClick={() => navigate("/member/classes")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            backgroundColor: "#203d31",
            color: "#ffffff",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Volleyball size={16} /> Đặt thêm lớp mới
        </button>
      </div>

      {/* FEEDBACK ALERT */}
      {message && (
        <AlertBanner
          type={message.type}
          message={message.text}
        />
      )}

      {quota.isSuccess && (
        <section className="panel" aria-label="Hạn mức lớp học">
          <div className="panel-heading">
            <div>
              <h2>Hạn mức lớp đang giữ</h2>
              <p>
                {quota.data.used}/{quota.data.limit} lớp · còn {quota.data.remaining}
                {" "}lớp với gói {quota.data.tier || "chưa kích hoạt"}
              </p>
            </div>
            <span className="badge">
              {quota.data.hasActiveSubscription ? "Đang hiệu lực" : "Cần mua gói"}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Mức sử dụng hạn mức lớp"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, quota.data.limit)}
            aria-valuenow={quota.data.used}
            style={{ height: 8, borderRadius: 99, background: "#e7ece9", overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                width: `${quota.data.limit ? Math.min(100, (quota.data.used / quota.data.limit) * 100) : 100}%`,
                background: quota.data.remaining ? "#376228" : "#d97706",
              }}
            />
          </div>
        </section>
      )}

      {/* TABS */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1px solid #e7ece9",
          paddingBottom: 2,
        }}
      >
        {[
          { key: "BOOKED" as EnrollmentStatus, label: "Sắp tới (Đã đặt)", icon: CalendarCheck },
          { key: "COMPLETED" as EnrollmentStatus, label: "Đã hoàn thành", icon: CheckCircle2 },
          { key: "CANCELLED" as EnrollmentStatus, label: "Đã hủy", icon: CalendarX },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setMessage(null);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                border: "none",
                background: "none",
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#203d31" : "#58695f",
                borderBottom: isActive ? "3px solid #203d31" : "3px solid transparent",
                cursor: "pointer",
                borderRadius: "4px 4px 0 0",
              }}
            >
              <Icon size={16} color={isActive ? "#203d31" : "#58695f"} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ENROLLMENTS LIST */}
      {isLoading ? (
        <LoadingSpinner text="Đang tải danh sách lớp của bạn..." />
      ) : error ? (
        <EmptyState
          title="Lỗi tải dữ liệu"
          description={(error as Error).message}
        />
      ) : enrollments.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={40} />}
          title={
            activeTab === "BOOKED"
              ? "Bạn chưa có lớp học nào sắp tới"
              : activeTab === "COMPLETED"
              ? "Chưa có buổi học nào đã hoàn thành"
              : "Không có lịch sử hủy lớp"
          }
          description={
            activeTab === "BOOKED"
              ? "Hãy bấm vào Tìm kiếm lớp học để đăng ký buổi tập rèn luyện sức khỏe."
              : undefined
          }
          action={
            activeTab === "BOOKED" ? (
              <button
                onClick={() => navigate("/member/classes")}
                style={{
                  padding: "9px 18px",
                  backgroundColor: "#203d31",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Khám phá các lớp học
              </button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {enrollments.map((item) => {
            const sch = item.schedule;
            const startTime = sch ? new Date(sch.startTime) : null;
            const endTime = sch ? new Date(sch.endTime) : null;
            const isFuture = startTime ? startTime > new Date() : false;
            const canCancel = item.status === "BOOKED" && isFuture;

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 16,
                  border: "1px solid #e7ece9",
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  {/* Date badge */}
                  {startTime && (
                    <div
                      style={{
                        textAlign: "center",
                        minWidth: 68,
                        backgroundColor: "#f2f8eb",
                        border: "1px solid #d4ebbf",
                        borderRadius: 12,
                        padding: "10px 8px",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#376228", textTransform: "uppercase" }}>
                        {startTime.toLocaleDateString("vi-VN", { weekday: "short" })}
                      </div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: "#203d31" }}>
                        {startTime.getDate()}/{startTime.getMonth() + 1}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#203d31" }}>
                        {sch?.class?.name || "Lớp học thể thao"}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#54655d", flexWrap: "wrap" }}>
                      {startTime && endTime && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Clock size={15} color="#58695f" />
                          {formatMemberDate(startTime, { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {formatMemberDate(endTime, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={15} color="#58695f" />
                        Phòng: <strong>{sch?.room?.name || "Sân tập"}</strong>
                      </span>
                      <span>
                        Môn: <strong>{sportNames(sch?.class)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => navigate(`/member/classes/${item.classId}`)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid #d0d7d3",
                      backgroundColor: "#ffffff",
                      color: "#203d31",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Xem lớp
                  </button>

                  {canCancel && (
                    <button
                      onClick={() => {
                        setSelectedEnrollment(item);
                        setTargetScheduleId("");
                        transferMutation.reset();
                        setTransferOpen(true);
                      }}
                      className="button small"
                    >
                      <ArrowRightLeft size={14} /> Đổi buổi
                    </button>
                  )}

                  {canCancel && (
                    <button
                      onClick={() => {
                        setSelectedEnrollment(item);
                        setConfirmCancelOpen(true);
                      }}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "1px solid #fecdca",
                        backgroundColor: "#fef3f2",
                        color: "#d92d20",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Hủy đặt chỗ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CANCEL CONFIRM MODAL */}
      <ConfirmModal
        isOpen={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={() => {
          if (selectedEnrollment) {
            cancelMutation.mutate(selectedEnrollment.id);
          }
        }}
        title="Xác nhận Hủy Đăng Ký Ca Học"
        message={`Bạn có chắc chắn muốn hủy đăng ký lớp "${selectedEnrollment?.schedule?.class?.name}"? Sau khi hủy, chỗ trống sẽ được nhường lại cho học viên khác.`}
        confirmText="Đồng ý hủy"
        cancelText="Giữ chỗ"
        isDanger={true}
        loading={cancelMutation.isPending}
      />

      {transferOpen && selectedEnrollment && (
        <Modal
          title="Đổi buổi trong cùng lớp"
          dismissible={!transferMutation.isPending}
          onClose={() => setTransferOpen(false)}
          maxWidth={680}
        >
          <p className="confirm-copy">
            Chọn một buổi khác của lớp “{selectedEnrollment.schedule?.class?.name}”.
            Chỗ cũ chỉ được hủy khi máy chủ xác nhận chỗ mới hợp lệ.
          </p>
          {transferSchedules.isPending ? (
            <Loading variant="cards" />
          ) : transferSchedules.isError ? (
            <ErrorState
              error={transferSchedules.error}
              retry={() => transferSchedules.refetch()}
            />
          ) : (
            <div className="detail-list" role="radiogroup" aria-label="Buổi học mới">
              {(transferSchedules.data?.schedules || [])
                .filter((schedule) => schedule.id !== selectedEnrollment.scheduleId)
                .map((schedule) => {
                  const count = schedule._count?.enrollments ?? 0;
                  const remaining =
                    schedule.availableSlots ??
                    Math.max(0, schedule.class.capacity - count);
                  const disabled =
                    schedule.isFull === true ||
                    remaining <= 0 ||
                    new Date(schedule.startTime) <= new Date();
                  return (
                    <label className="assignment" key={schedule.id}>
                      <input
                        type="radio"
                        name="targetSchedule"
                        value={schedule.id}
                        checked={targetScheduleId === schedule.id}
                        disabled={disabled || transferMutation.isPending}
                        onChange={() => setTargetScheduleId(schedule.id)}
                      />
                      <span>
                        <strong>{formatMemberDate(schedule.startTime)}</strong>{" "}
                        · {formatMemberDate(schedule.startTime, { hour: "2-digit", minute: "2-digit" })}
                        {" – "}{formatMemberDate(schedule.endTime, { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{schedule.room?.name || "Chưa có phòng"}
                      </span>
                      <span className={`badge ${disabled ? "muted" : ""}`}>
                        {disabled ? "Hết chỗ" : `Còn ${remaining} chỗ`}
                      </span>
                    </label>
                  );
                })}
              {!transferSchedules.data?.schedules.some(
                (schedule) => schedule.id !== selectedEnrollment.scheduleId,
              ) && <p>Hiện chưa có buổi khác để chuyển.</p>}
            </div>
          )}
          {transferMutation.error && <ErrorState error={transferMutation.error} />}
          <div className="modal-footer">
            <button
              className="button"
              disabled={transferMutation.isPending}
              onClick={() => setTransferOpen(false)}
            >
              Giữ buổi hiện tại
            </button>
            <button
              className="button primary"
              disabled={!targetScheduleId || transferMutation.isPending}
              onClick={() => transferMutation.mutate()}
            >
              {transferMutation.isPending ? "Đang đổi buổi…" : "Xác nhận đổi buổi"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
