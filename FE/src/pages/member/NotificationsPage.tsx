import { formatMemberDate } from "../../shared/memberFormat";
import { ErrorState } from "../../shared/feedback";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { enrollmentsApi } from "../../api/enrollments.api";
import { membershipApi } from "../../api/membership.api";
import { Bell, Clock, CreditCard, ArrowRight } from "lucide-react";
import { LoadingSpinner } from "../../components/common";

export function NotificationsPage() {
  const { user } = useAuth();

  const { data: enrollData, isLoading: enrollLoading, error: enrollError } = useQuery({
    queryKey: ["my-enrollments", "BOOKED", 5],
    queryFn: () => enrollmentsApi.getMyEnrollments({ status: "BOOKED", limit: 5 }),
  });

  const { data: subData, isLoading: subLoading, error: subError } = useQuery({
    queryKey: ["current-membership", user?.id],
    queryFn: () => (user?.id ? membershipApi.getMySubscriptions(user.id) : null),
    enabled: Boolean(user?.id),
  });

  const activeSub = subData?.subscriptions?.find(
    (s) => s.status === "ACTIVE" && new Date(s.endDate) >= new Date(),
  );
  const upcomingClasses = enrollData?.enrollments || [];

  const daysRemaining = activeSub
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeSub.endDate).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  const notifications = [
    ...(activeSub
      ? [
          {
            id: "sub-status",
            title: `Gói hội viên ${activeSub.plan?.name} đang kích hoạt`,
            message: `Gói tập của bạn còn ${daysRemaining} ngày sử dụng (hạn đến ${formatMemberDate(
              activeSub.endDate,
            )}).`,
            type: "membership",
            time: "Cập nhật hôm nay",
            link: "/member/membership",
          },
        ]
      : [
          {
            id: "sub-none",
            title: "Chưa kích hoạt gói hội viên",
            message: "Hãy đăng ký gói hội viên để mở khóa toàn bộ các lớp học và tiện ích tại Pulse Sports.",
            type: "alert",
            time: "Hôm nay",
            link: "/member/membership",
          },
        ]),
    ...upcomingClasses.map((item) => ({
      id: `class-${item.id}`,
      title: `Nhắc lịch: Ca học ${item.schedule?.class?.name} sắp diễn ra`,
      message: `Ca học vào lúc ${formatMemberDate(item.schedule?.startTime, {
        hour: "2-digit",
        minute: "2-digit",
      })} ngày ${formatMemberDate(item.schedule?.startTime)} tại phòng ${
        item.schedule?.room?.name || "Khu vực tập"
      }. Đừng quên mang theo trang phục phù hợp!`,
      type: "class",
      time: "Sắp diễn ra",
      link: `/member/classes/${item.classId}`,
    })),
    {
      id: "system-welcome",
      title: "Chào mừng bạn đến với Pulse Sports Center!",
      message: "Chúng tôi luôn sẵn sàng hỗ trợ bạn trên hành trình chinh phục thể hình và sức khỏe tối ưu.",
      type: "system",
      time: "Hệ thống",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 840 }}>
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "24px 28px",
          border: "1px solid #e7ece9",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#203d31", margin: "0 0 6px" }}>
          Thông báo của bạn
        </h1>
        <p style={{ margin: 0, color: "#58695f", fontSize: 13 }}>
          Nhắc lịch ca học sắp tới, tình trạng gói hội viên và các thông báo mới từ trung tâm
        </p>
      </div>

      {enrollLoading || subLoading ? (
        <LoadingSpinner text="Đang tải thông báo..." />
      ) : enrollError || subError ? <ErrorState error={enrollError || subError} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e7ece9",
                borderRadius: 16,
                padding: "18px 22px",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor:
                    n.type === "class"
                      ? "#f4f3ff"
                      : n.type === "membership"
                      ? "#f2f8eb"
                      : "#f8faf9",
                  color:
                    n.type === "class"
                      ? "#5925dc"
                      : n.type === "membership"
                      ? "#376228"
                      : "#475467",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {n.type === "class" ? (
                  <Clock size={20} />
                ) : n.type === "membership" ? (
                  <CreditCard size={20} />
                ) : (
                  <Bell size={20} />
                )}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#203d31" }}>
                    {n.title}
                  </h4>
                  <span style={{ fontSize: 11, color: "#58695f" }}>{n.time}</span>
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#54655d", lineHeight: 1.5 }}>
                  {n.message}
                </p>

                {n.link && (
                  <Link
                    to={n.link}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#376228",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      textDecoration: "none",
                    }}
                  >
                    Xem chi tiết <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
