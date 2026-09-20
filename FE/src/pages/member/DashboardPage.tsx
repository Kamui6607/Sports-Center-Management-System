import { formatMemberDate } from "../../shared/memberFormat";
import { ErrorState } from "../../shared/feedback";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { enrollmentsApi } from "../../api/enrollments.api";
import { membershipApi } from "../../api/membership.api";
import {
  CreditCard,
  Volleyball,
  CalendarDays,
  UserCircle,
  ArrowRight,
  Clock,
  MapPin,
  Sparkles,
  Dumbbell,
} from "lucide-react";
import { StatusBadge, LoadingSpinner } from "../../components/common";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // 1. Fetch member's subscriptions
  const { data: subData, isLoading: subLoading, error: subError } = useQuery({
    queryKey: ["current-membership", user?.id],
    queryFn: () => (user?.id ? membershipApi.getMySubscriptions(user.id) : null),
    enabled: Boolean(user?.id),
  });

  // 2. Fetch member's upcoming enrollments
  const { data: enrollmentData, isLoading: enrollLoading, error: enrollError } = useQuery({
    queryKey: ["my-enrollments", "BOOKED", 5],
    queryFn: () => enrollmentsApi.getMyEnrollments({ status: "BOOKED", limit: 5 }),
  });

  const activeSub = subData?.subscriptions?.find(
    (s) => s.status === "ACTIVE" && new Date(s.endDate) >= new Date(),
  );

  const upcomingClasses = enrollmentData?.enrollments || [];
  const nextClass = upcomingClasses[0];

  // Calculate days remaining
  const daysRemaining = activeSub
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeSub.endDate).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* WELCOME BANNER */}
      <div
        style={{
          background: "linear-gradient(135deg, #203d31 0%, #152720 100%)",
          borderRadius: 20,
          padding: "28px 32px",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 20,
          boxShadow: "0 12px 24px -6px rgba(32, 61, 49, 0.25)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span
              style={{
                backgroundColor: "#315444",
                color: "#d3f879",
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={13} /> Member Portal
            </span>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px", color: "#ffffff" }}>
            Chào mừng trở lại, {user?.fullName || "Học viên"}!
          </h2>
          <p style={{ margin: 0, color: "#b2c5bc", fontSize: 14, maxWidth: 520 }}>
            Sẵn sàng cho buổi tập tiếp theo hôm nay. Hãy theo dõi lịch và duy trì năng lượng tích cực!
          </p>
        </div>

        <div className="member-hero-actions" style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => navigate("/member/classes")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              backgroundColor: "#d3f879",
              color: "#203d31",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <Volleyball size={18} /> Đặt lịch lớp học
          </button>
          <button
            onClick={() => navigate("/member/schedule")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              backgroundColor: "rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <CalendarDays size={18} /> Lịch tuần
          </button>
        </div>
      </div>

      {/* 2 MAIN HIGHLIGHT CARDS: MEMBERSHIP & NEXT CLASS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* MEMBERSHIP CARD */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 24,
            border: "1px solid #e7ece9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: "#f0f8ed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#376228",
                  }}
                >
                  <CreditCard size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#203d31" }}>
                    Gói hội viên hiện tại
                  </h3>
                  <span style={{ fontSize: 12, color: "#58695f" }}>Trạng thái tài khoản</span>
                </div>
              </div>

              {subLoading ? (
                <LoadingSpinner variant="field" text="Đang kiểm tra gói tập…" />
              ) : subError ? <ErrorState error={subError} /> : activeSub ? (
                <StatusBadge status={activeSub.status} />
              ) : (
                <span style={{ backgroundColor: "#fef3f2", color: "#d92d20", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>
                  Chưa có gói hoạt động
                </span>
              )}
            </div>

            {subLoading ? <LoadingSpinner variant="details" /> : subError ? <ErrorState error={subError} /> : activeSub ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#203d31" }}>
                    {activeSub.plan.name}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#376228", backgroundColor: "#eef8e6", padding: "2px 8px", borderRadius: 6 }}>
                    Hạng {activeSub.tier}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#54655d" }}>
                  <Clock size={16} color="#58695f" />
                  <span>
                    Còn lại: <strong>{daysRemaining} ngày</strong> (Hết hạn {formatMemberDate(activeSub.endDate)})
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ padding: "12px 0", color: "#667085", fontSize: 13 }}>
                Bạn chưa đăng ký gói hội viên hoặc gói đã hết hạn. Hãy khám phá các gói để mở khóa toàn bộ quyền lợi tập luyện.
              </div>
            )}
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f4f2" }}>
            <Link
              to="/member/membership"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#203d31",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Xem chi tiết gói & gia hạn <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* UPCOMING CLASS CARD */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 24,
            border: "1px solid #e7ece9",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: "#f4f3ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#5925dc",
                  }}
                >
                  <Volleyball size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#203d31" }}>
                    Buổi tập tiếp theo
                  </h3>
                  <span style={{ fontSize: 12, color: "#58695f" }}>Lịch đã xác nhận</span>
                </div>
              </div>

              {nextClass && <StatusBadge status={nextClass.status} />}
            </div>

            {enrollLoading ? (
              <div style={{ padding: 12 }}><LoadingSpinner text="Đang tải lịch tập..." /></div>
            ) : enrollError ? <ErrorState error={enrollError} /> : nextClass ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#203d31" }}>
                  {nextClass.schedule?.class?.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#475467" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Clock size={15} color="#58695f" />
                    {formatMemberDate(nextClass.schedule.startTime, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    - {formatMemberDate(nextClass.schedule.endTime, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    ({formatMemberDate(nextClass.schedule.startTime)})
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475467" }}>
                  <MapPin size={15} color="#58695f" />
                  <span>Phòng: <strong>{nextClass.schedule?.room?.name || "Khu tập trung"}</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ padding: "12px 0", color: "#667085", fontSize: 13 }}>
                Bạn chưa đặt lịch buổi tập nào sắp tới. Hãy xem danh sách lớp để chọn giờ học phù hợp nhất.
              </div>
            )}
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f4f2" }}>
            <Link
              to="/member/my-classes"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#203d31",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Quản lý lớp học của tôi ({upcomingClasses.length}) <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS ROW */}
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#203d31", marginBottom: 14 }}>
          Thao tác nhanh
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          <div
            onClick={() => navigate("/member/classes")}
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e7ece9",
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 14,
              transition: "transform 0.15s, border-color 0.15s",
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#f2f8eb", color: "#376228", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Volleyball size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#203d31" }}>Tìm kiếm lớp</div>
              <div style={{ fontSize: 12, color: "#58695f" }}>Đặt chỗ ca học mới</div>
            </div>
          </div>

          <div
            onClick={() => navigate("/member/schedule")}
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e7ece9",
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#eef4ff", color: "#3538cd", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarDays size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#203d31" }}>Lịch tập tuần</div>
              <div style={{ fontSize: 12, color: "#58695f" }}>Theo dõi thời khóa biểu</div>
            </div>
          </div>

          <div
            onClick={() => navigate("/member/training")}
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e7ece9",
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#fdf2fa", color: "#c11574", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Dumbbell size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#203d31" }}>Mục tiêu tập</div>
              <div style={{ fontSize: 12, color: "#58695f" }}>Kế hoạch & cấp độ</div>
            </div>
          </div>

          <div
            onClick={() => navigate("/member/profile")}
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e7ece9",
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#f9fafb", color: "#344054", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserCircle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#203d31" }}>Hồ sơ cá nhân</div>
              <div style={{ fontSize: 12, color: "#58695f" }}>Cập nhật thông tin</div>
            </div>
          </div>
        </div>
      </div>

      {/* UPCOMING CLASSES LIST */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 18,
          border: "1px solid #e7ece9",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#203d31", margin: 0 }}>
            Lớp học sắp tới của bạn
          </h2>
          <Link
            to="/member/my-classes"
            style={{ fontSize: 13, fontWeight: 600, color: "#376228", textDecoration: "none" }}
          >
            Xem tất cả ({upcomingClasses.length})
          </Link>
        </div>

        {enrollLoading ? <LoadingSpinner variant="table" /> : enrollError ? <ErrorState error={enrollError} /> : upcomingClasses.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#667085", fontSize: 13 }}>
            Chưa có lịch đăng ký sắp tới. Hãy nhấn vào <strong>Tìm kiếm lớp học</strong> để đặt ca tập mới.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {upcomingClasses.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: 12,
                  backgroundColor: "#f9fbfa",
                  border: "1px solid #edf2ee",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#203d31" }}>
                    {item.schedule?.class?.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 4, fontSize: 13, color: "#54655d" }}>
                    <span>
                      📅 {formatMemberDate(item.schedule?.startTime)}
                    </span>
                    <span>
                      ⏰ {formatMemberDate(item.schedule?.startTime, { hour: "2-digit", minute: "2-digit" })} -{" "}
                      {formatMemberDate(item.schedule?.endTime, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>🏛️ Phòng {item.schedule?.room?.name}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StatusBadge status={item.status} />
                  <button
                    onClick={() => navigate(`/member/classes/${item.classId}`)}
                    style={{
                      padding: "7px 14px",
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
