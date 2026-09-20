import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Target, Sparkles, Award, ArrowRight, HeartPulse } from "lucide-react";

export function TrainingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const profile = user?.memberProfile;
  const level = profile?.trainingLevel || "BEGINNER";
  const goal = profile?.fitnessGoal || "Rèn luyện sức khỏe tổng thể";
  const preference = profile?.trainingPreference || "Tập các bộ môn cơ bản và nâng cao thể lực";

  const recommendations = {
    BEGINNER: [
      { title: "Yoga căn bản", desc: "Tập trung vào hít thở, kéo giãn cơ bắp và cân bằng tư thế." },
      { title: "Cardio khởi động", desc: "20-30 phút làm nóng cơ thể và tăng sức bền tim mạch mỗi buổi." },
      { title: "Kỹ thuật cử tạ nền tảng", desc: "Học đúng tư thế Squat, Hinge, Push, Pull cùng huấn luyện viên." },
    ],
    INTERMEDIATE: [
      { title: "Pilates & Core Training", desc: "Tăng cường sức mạnh nhóm cơ lõi và độ linh hoạt cột sống." },
      { title: "HIIT Thể lực", desc: "Bài tập ngắt quãng cường độ cao kích thích trao đổi chất và giảm mỡ." },
      { title: "Gym phân nhóm cơ", desc: "Lịch tập 3-4 buổi/tuần luân phiên Upper body & Lower body." },
    ],
    ADVANCED: [
      { title: "Functional Conditioning", desc: "Các bài tập vận động đa khớp với tải trọng và tốc độ cao." },
      { title: "Boxing & Kickfit đối kháng", desc: "Rèn luyện phản xạ, thể lực chiến đấu và sự bền bỉ." },
      { title: "Tối ưu hóa phục hồi", desc: "Dinh dưỡng đa lượng chuẩn xác và giãn cơ sâu sau buổi tập nặng." },
    ],
  }[level] || [];

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
            Kế hoạch & Mục tiêu Tập luyện
          </h1>
          <p style={{ margin: 0, color: "#58695f", fontSize: 13 }}>
            Định hướng mục tiêu cá nhân và lộ trình rèn luyện thể thao khoa học
          </p>
        </div>

        <button
          onClick={() => navigate("/member/profile")}
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
          Cập nhật mục tiêu <ArrowRight size={15} />
        </button>
      </div>

      {/* OVERVIEW CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        {/* LEVEL */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e7ece9",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#f2f8eb", color: "#376228", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Award size={22} />
            </div>
            <div>
              <span style={{ fontSize: 12, color: "#58695f" }}>Cấp độ tập luyện</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#203d31" }}>
                {level === "BEGINNER" ? "Mới bắt đầu" : level === "INTERMEDIATE" ? "Trung bình" : "Nâng cao"}
              </h3>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#667085", lineHeight: 1.5 }}>
            Lộ trình bài tập và ca học đề xuất sẽ được tự động điều chỉnh phù hợp với khả năng chịu lực của bạn.
          </p>
        </div>

        {/* FITNESS GOAL */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e7ece9",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#eef4ff", color: "#3538cd", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target size={22} />
            </div>
            <div>
              <span style={{ fontSize: 12, color: "#58695f" }}>Mục tiêu chính</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#203d31" }}>
                {goal}
              </h3>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#667085", lineHeight: 1.5 }}>
            Duy trì cam kết ít nhất 3-4 buổi mỗi tuần để sớm đạt được kết quả thể hình mong muốn.
          </p>
        </div>

        {/* PREFERENCES */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e7ece9",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#fdf2fa", color: "#c11574", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <HeartPulse size={22} />
            </div>
            <div>
              <span style={{ fontSize: 12, color: "#58695f" }}>Ghi chú & Sở thích</span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#203d31" }}>
                Ghi nhớ chuyên môn
              </h3>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#667085", lineHeight: 1.5 }}>
            {preference}
          </p>
        </div>
      </div>

      {/* RECOMMENDATIONS LIST */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 18,
          border: "1px solid #e7ece9",
          padding: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Sparkles size={20} color="#376228" />
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "#203d31", margin: 0 }}>
            Gợi ý rèn luyện cho cấp độ {level}
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {recommendations.map((rec, i) => (
            <div
              key={i}
              style={{
                backgroundColor: "#f9fbfa",
                border: "1px solid #edf2ee",
                borderRadius: 14,
                padding: 18,
              }}
            >
              <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#203d31" }}>
                {i + 1}. {rec.title}
              </h4>
              <p style={{ margin: 0, fontSize: 13, color: "#54655d", lineHeight: 1.5 }}>
                {rec.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
