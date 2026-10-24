import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../api/auth.api";
import {
  UserCircle,
  Lock,
  Save,
  KeyRound,
} from "lucide-react";
import { AlertBanner } from "../../components/common";

export function ProfilePage() {
  const { user, updateUser } = useAuth();

  // Profile Form state
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER">(
    (user?.gender as "MALE" | "FEMALE" | "OTHER") || "MALE",
  );
  const [dateOfBirth, setDateOfBirth] = useState(
    user?.dateOfBirth ? user.dateOfBirth.split("T")[0] : "",
  );
  const [fitnessGoal, setFitnessGoal] = useState(
    user?.memberProfile?.fitnessGoal || "",
  );
  const [trainingLevel, setTrainingLevel] = useState<
    "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
  >(user?.memberProfile?.trainingLevel || "BEGINNER");
  const [trainingPreference, setTrainingPreference] = useState(
    user?.memberProfile?.trainingPreference || "",
  );

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      const updated = await authApi.updateMe({
        fullName,
        phone: phone || undefined,
        gender,
        dateOfBirth: dateOfBirth || undefined,
        fitnessGoal: fitnessGoal || undefined,
        trainingLevel,
        trainingPreference: trainingPreference || undefined,
      });

      updateUser(updated);
      setProfileMsg({ type: "success", text: "Cập nhật thông tin cá nhân thành công!" });
    } catch (err: unknown) {
      setProfileMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Cập nhật hồ sơ thất bại.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPassMsg(null);

    if (newPassword.length < 6) {
      setPassMsg({ type: "error", text: "Mật khẩu mới phải có tối thiểu 6 ký tự." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassMsg({ type: "error", text: "Xác nhận mật khẩu mới không trùng khớp." });
      return;
    }

    setSavingPass(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPassMsg({ type: "success", text: "Đổi mật khẩu tài khoản thành công!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPassMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Đổi mật khẩu không thành công.",
      });
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
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
          Hồ sơ hội viên
        </h1>
        <p style={{ margin: 0, color: "#58695f", fontSize: 13 }}>
          Quản lý thông tin tài khoản, mục tiêu rèn luyện thể chất và bảo mật mật khẩu
        </p>
      </div>

      {/* EDIT PROFILE FORM */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 18,
          border: "1px solid #e7ece9",
          padding: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <UserCircle size={22} color="#203d31" />
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#203d31", margin: 0 }}>
            Thông tin cá nhân & Mục tiêu thể lực
          </h2>
        </div>

        {profileMsg && (
          <div style={{ marginBottom: 18 }}>
            <AlertBanner type={profileMsg.type} message={profileMsg.text} />
          </div>
        )}

        <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {/* Full name */}
            <div>
              <label htmlFor="member-profile-1" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Họ và tên *
              </label>
              <input id="member-profile-1"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            {/* Email (Readonly) */}
            <div>
              <label htmlFor="member-profile-2" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Email tài khoản (không thể đổi)
              </label>
              <input id="member-profile-2"
                type="email"
                disabled
                value={user?.email || ""}
                style={{ backgroundColor: "#f8faf9", color: "#667085" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {/* Phone */}
            <div>
              <label htmlFor="member-profile-3" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Số điện thoại
              </label>
              <input id="member-profile-3"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912345678"
              />
            </div>

            {/* Gender */}
            <div>
              <label htmlFor="member-profile-4" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Giới tính
              </label>
              <select id="member-profile-4"
                value={gender}
                onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE" | "OTHER")}
              >
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="member-profile-5" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Ngày sinh
              </label>
              <input id="member-profile-5"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: "#f0f4f2", margin: "8px 0" }} />

          {/* Fitness Goal & Level */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <div>
              <label htmlFor="member-profile-6" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Cấp độ rèn luyện (Training Level)
              </label>
              <select id="member-profile-6"
                value={trainingLevel}
                onChange={(e) =>
                  setTrainingLevel(
                    e.target.value as "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
                  )
                }
              >
                <option value="BEGINNER">Mới bắt đầu (Beginner)</option>
                <option value="INTERMEDIATE">Trung bình (Intermediate)</option>
                <option value="ADVANCED">Nâng cao (Advanced)</option>
              </select>
            </div>

            <div>
              <label htmlFor="member-profile-7" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Mục tiêu thể hình & sức khỏe (Fitness Goal)
              </label>
              <input id="member-profile-7"
                type="text"
                value={fitnessGoal}
                onChange={(e) => setFitnessGoal(e.target.value)}
                placeholder="Ví dụ: Tăng cơ giảm mỡ, Cải thiện sức bền, Học Yoga..."
              />
            </div>
          </div>

          <div>
            <label htmlFor="member-profile-8" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
              Sở thích & Lưu ý tập luyện (Training Preference)
            </label>
            <textarea id="member-profile-8"
              value={trainingPreference}
              onChange={(e) => setTrainingPreference(e.target.value)}
              placeholder="Ghi chú sở thích về môn học, huấn luyện viên hoặc chấn thương cần lưu ý..."
              rows={3}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={savingProfile}
              style={{
                padding: "11px 24px",
                backgroundColor: "#203d31",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Save size={16} />
              {savingProfile ? "Đang lưu..." : "Lưu thay đổi hồ sơ"}
            </button>
          </div>
        </form>
      </div>

      {/* CHANGE PASSWORD FORM */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 18,
          border: "1px solid #e7ece9",
          padding: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <KeyRound size={22} color="#203d31" />
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#203d31", margin: 0 }}>
            Đổi mật khẩu tài khoản
          </h2>
        </div>

        {passMsg && (
          <div style={{ marginBottom: 18 }}>
            <AlertBanner type={passMsg.type} message={passMsg.text} />
          </div>
        )}

        <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor="member-profile-9" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
              Mật khẩu hiện tại *
            </label>
            <input id="member-profile-9"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <div>
              <label htmlFor="member-profile-10" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Mật khẩu mới (tối thiểu 6 ký tự) *
              </label>
              <input id="member-profile-10"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="member-profile-11" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 6 }}>
                Xác nhận mật khẩu mới *
              </label>
              <input id="member-profile-11"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={savingPass}
              style={{
                padding: "11px 24px",
                backgroundColor: "#203d31",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Lock size={16} />
              {savingPass ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
