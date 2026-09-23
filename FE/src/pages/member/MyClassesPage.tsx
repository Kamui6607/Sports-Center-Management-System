import { sportNames } from "../../shared/sports";
import { formatMemberDate } from "../../shared/memberFormat";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { enrollmentsApi } from "../../api/enrollments.api";
import type { Enrollment, EnrollmentStatus } from "../../types/member";
import {
  CalendarCheck,
  CalendarX,
  Clock,
  MapPin,
  Volleyball,
  CheckCircle2,
} from "lucide-react";
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch enrollments by status
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-enrollments", activeTab],
    queryFn: () => enrollmentsApi.getMyEnrollments({ status: activeTab }),
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
    </div>
  );
}
