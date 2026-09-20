import { formatMemberDate } from "../../shared/memberFormat";
import { ErrorState } from "../../shared/feedback";
import { useQuery } from "@tanstack/react-query";
import { enrollmentsApi } from "../../api/enrollments.api";
import { CheckCheck} from "lucide-react";
import { LoadingSpinner, EmptyState, StatusBadge } from "../../components/common";

export function AttendancePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-enrollments", "COMPLETED", 50],
    queryFn: () => enrollmentsApi.getMyEnrollments({ status: "COMPLETED", limit: 50 }),
  });

  const attendances = data?.enrollments || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* HEADER */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "24px 28px",
          border: "1px solid #e7ece9",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#203d31", margin: "0 0 6px" }}>
          Lịch sử Điểm danh & Tham gia
        </h1>
        <p style={{ margin: 0, color: "#58695f", fontSize: 13 }}>
          Theo dõi hành trình chuyên cần rèn luyện qua các buổi học đã hoàn thành
        </p>
      </div>

      {isLoading ? (
        <LoadingSpinner text="Đang tải dữ liệu điểm danh..." />
      ) : error ? <ErrorState error={error} /> : attendances.length === 0 ? (
        <EmptyState
          icon={<CheckCheck size={40} />}
          title="Chưa có dữ liệu điểm danh"
          description="Sau khi tham gia các ca học được huấn luyện viên điểm danh hoàn thành, lịch sử sẽ xuất hiện tại đây."
        />
      ) : (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 18,
            border: "1px solid #e7ece9",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #f0f4f2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#203d31" }}>
              Tổng số buổi đã hoàn thành: <strong>{attendances.length} buổi</strong>
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {attendances.map((item, idx) => {
              const sch = item.schedule;
              const date = sch?.startTime ? new Date(sch.startTime) : new Date(item.bookedAt);

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 24px",
                    borderBottom: idx === attendances.length - 1 ? "none" : "1px solid #f2f5f3",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        backgroundColor: "#edfcf2",
                        color: "#267346",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <CheckCheck size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#203d31" }}>
                        {sch?.class?.name || "Ca học thể thao"}
                      </div>
                      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#58695f", marginTop: 2 }}>
                        <span>Bộ môn: {sch?.class?.sport?.name || "Thể thao"}</span>
                        <span>Phòng: {sch?.room?.name || "Khu vực tập"}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#203d31" }}>
                        {formatMemberDate(date)}
                      </div>
                      <div style={{ fontSize: 11, color: "#58695f" }}>
                        {formatMemberDate(date, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <StatusBadge status="COMPLETED" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
