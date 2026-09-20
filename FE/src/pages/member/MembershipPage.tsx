import { formatMemberDate } from "../../shared/memberFormat";
import { ErrorState } from "../../shared/feedback";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { membershipApi } from "../../api/membership.api";
import {
  CreditCard,
  Check,
} from "lucide-react";
import { LoadingSpinner, EmptyState, StatusBadge } from "../../components/common";

export function MembershipPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"current" | "plans">("current");

  // Fetch current user subscriptions
  const { data: subData, isLoading: subLoading, error: subError } = useQuery({
    queryKey: ["current-membership", user?.id],
    queryFn: () => (user?.id ? membershipApi.getMySubscriptions(user.id) : null),
    enabled: Boolean(user?.id),
  });

  // Fetch all plans
  const { data: plansData, isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ["membership-plans"],
    queryFn: () => membershipApi.getPlans(),
  });

  const subscriptions = subData?.subscriptions || [];
  const activeSub = subscriptions.find(
    (s) => s.status === "ACTIVE" && new Date(s.endDate) >= new Date(),
  );
  const plans = plansData?.plans || [];

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
            Quản lý Gói hội viên
          </h1>
          <p style={{ margin: 0, color: "#58695f", fontSize: 13 }}>
            Xem thông tin gói tập đang sử dụng, thời hạn còn lại và bảng giá các gói tập luyện tại Pulse Sports
          </p>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", backgroundColor: "#f2f5f3", borderRadius: 8, padding: 3 }}>
          <button
            onClick={() => setTab("current")}
            style={{
              border: "none",
              background: tab === "current" ? "#ffffff" : "transparent",
              color: tab === "current" ? "#203d31" : "#58695f",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Gói của tôi
          </button>
          <button
            onClick={() => setTab("plans")}
            style={{
              border: "none",
              background: tab === "plans" ? "#ffffff" : "transparent",
              color: tab === "plans" ? "#203d31" : "#58695f",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Bảng giá các gói
          </button>
        </div>
      </div>

      {tab === "current" ? (
        /* CURRENT MEMBERSHIP TAB */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {subLoading ? (
            <LoadingSpinner text="Đang kiểm tra gói hội viên..." />
          ) : subError ? <ErrorState error={subError} /> : activeSub ? (
            /* ACTIVE MEMBERSHIP HERO */
            <div
              style={{
                background: "linear-gradient(135deg, #203d31 0%, #152720 100%)",
                borderRadius: 20,
                padding: "32px",
                color: "#ffffff",
                boxShadow: "0 10px 25px -5px rgba(32, 61, 49, 0.2)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                  <span
                    style={{
                      backgroundColor: "#d3f879",
                      color: "#203d31",
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: 6,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    GÓI ĐANG HOẠT ĐỘNG
                  </span>
                  <h2 style={{ fontSize: 28, fontWeight: 800, margin: "12px 0 6px", color: "#ffffff" }}>
                    {activeSub.plan?.name}
                  </h2>
                  <p style={{ margin: 0, color: "#b2c5bc", fontSize: 14 }}>
                    {activeSub.plan?.description || "Toàn quyền sử dụng trang thiết bị và đăng ký các lớp học tiêu chuẩn."}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#b2c5bc", marginBottom: 4 }}>Thời hạn còn lại</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#d3f879" }}>
                    {daysRemaining} <span style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>ngày</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 16,
                  paddingTop: 24,
                  borderTop: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#8ca89b" }}>Hạng hội viên</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Hạng {activeSub.tier}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#8ca89b" }}>Ngày bắt đầu</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                    {formatMemberDate(activeSub.startDate)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#8ca89b" }}>Ngày kết thúc</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                    {formatMemberDate(activeSub.endDate)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#8ca89b" }}>Trạng thái</div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={activeSub.status} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<CreditCard size={40} />}
              title="Bạn chưa có gói hội viên đang kích hoạt"
              description="Hãy xem Bảng giá các gói để đăng ký gói tập luyện phù hợp với mục tiêu của bạn."
              action={
                <button
                  onClick={() => setTab("plans")}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#203d31",
                    color: "#ffffff",
                    borderRadius: 8,
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Xem các gói tập ngay
                </button>
              }
            />
          )}

          {/* SUBSCRIPTION HISTORY */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              border: "1px solid #e7ece9",
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#203d31", margin: "0 0 16px" }}>
              Lịch sử các gói hội viên
            </h3>

            {subscriptions.length === 0 ? (
              <div style={{ color: "#58695f", fontSize: 13 }}>Chưa có lịch sử đăng ký gói nào.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: 10,
                      backgroundColor: "#f9fbfa",
                      border: "1px solid #edf2ee",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#203d31" }}>
                        {sub.plan?.name || "Gói tập"} ({sub.tier})
                      </div>
                      <div style={{ fontSize: 12, color: "#58695f", marginTop: 2 }}>
                        {formatMemberDate(sub.startDate)} -{" "}
                        {formatMemberDate(sub.endDate)}
                      </div>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MEMBERSHIP PLANS TAB */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {plansLoading ? (
            <LoadingSpinner text="Đang tải danh sách gói tập..." />
          ) : plansError ? <ErrorState error={plansError} /> : plans.length === 0 ? (
            <EmptyState title="Hiện chưa có gói tập nào mở bán" />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 24,
              }}
            >
              {plans.map((p) => {
                const isPremium = p.tier === "PREMIUM";
                const priceFormatted = Number(p.price).toLocaleString("vi-VN");

                return (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: 18,
                      border: isPremium ? "2px solid #203d31" : "1px solid #e7ece9",
                      padding: 28,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      position: "relative",
                      boxShadow: isPremium
                        ? "0 10px 25px -5px rgba(32, 61, 49, 0.12)"
                        : "0 2px 4px rgba(0, 0, 0, 0.02)",
                    }}
                  >
                    {isPremium && (
                      <span
                        style={{
                          position: "absolute",
                          top: -12,
                          right: 24,
                          backgroundColor: "#203d31",
                          color: "#d3f879",
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "3px 12px",
                          borderRadius: 999,
                          letterSpacing: 0.5,
                        }}
                      >
                        PHỔ BIẾN NHẤT
                      </span>
                    )}

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#376228", marginBottom: 6 }}>
                        HẠNG {p.tier}
                      </div>
                      <h3 style={{ fontSize: 22, fontWeight: 800, color: "#203d31", margin: "0 0 8px" }}>
                        {p.name}
                      </h3>
                      <p style={{ fontSize: 13, color: "#667085", lineHeight: 1.5, margin: "0 0 20px" }}>
                        {p.description || "Gói tập toàn diện giúp học viên thoải mái trải nghiệm cơ sở vật chất và các lớp học chuyên sâu."}
                      </p>

                      <div style={{ marginBottom: 24 }}>
                        <span style={{ fontSize: 32, fontWeight: 900, color: "#203d31" }}>
                          {priceFormatted}
                        </span>
                        <span style={{ fontSize: 14, color: "#58695f", marginLeft: 4 }}>
                          VNĐ / {p.durationDays} ngày
                        </span>
                      </div>

                      {/* Benefits */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "#344054" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Check size={16} color="#267346" />
                          <span>Thời hạn sử dụng: <strong>{p.durationDays} ngày</strong></span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Check size={16} color="#267346" />
                          <span>Quyền đặt lịch lớp học: <strong>Không giới hạn</strong></span>
                        </div>
                        {isPremium && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Check size={16} color="#267346" />
                            <span>Mở khóa toàn bộ các lớp <strong>Premium Class ★</strong></span>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Check size={16} color="#267346" />
                          <span>Sử dụng tủ đồ, phòng tắm nước nóng miễn phí</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid #f2f5f3" }}>
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: 12,
                          color: "#58695f",
                          lineHeight: 1.4,
                          padding: "8px 12px",
                          backgroundColor: "#f9fbfa",
                          borderRadius: 8,
                        }}
                      >
                        ℹ️ Vui lòng liên hệ Lễ tân (Reception Desk) hoặc Hotline trung tâm để đăng ký / gia hạn trực tiếp qua chuyển khoản hoặc tiền mặt.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
