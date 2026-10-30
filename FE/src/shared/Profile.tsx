import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { SchemaForm } from "./ui";
import { UserAvatar } from "../components/UserAvatar";
import { api } from "./api";
import type { ProfileOk } from "./generated";

export function Profile({ user }: { user: ProfileOk["data"] }) {
  const client = useQueryClient();
  const [tab, setTab] = useState("profile");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh đại diện không được vượt quá 5MB.");
      return;
    }

    setUploadingAvatar(true);
    setSuccess("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      await api<ProfileOk["data"]>("POST /auth/me/avatar", { body: formData as any });
      void client.invalidateQueries({ queryKey: ["me"] });
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
      setSuccess("Cập nhật ảnh đại diện thành công.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Tải ảnh đại diện thất bại.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TÀI KHOẢN CỦA BẠN</div>
          <h1>Thông tin cá nhân</h1>
          <p>Quản lý hồ sơ và bảo mật tài khoản.</p>
        </div>
      </div>
      <div className="tabs" aria-label="Thông tin tài khoản">
        <button
          className={tab === "profile" ? "active" : ""}
          aria-pressed={tab === "profile"}
          disabled={busy}
          onClick={() => {
            setTab("profile");
            setSuccess("");
            setError("");
          }}
        >
          Hồ sơ
        </button>
        <button
          className={tab === "password" ? "active" : ""}
          aria-pressed={tab === "password"}
          disabled={busy}
          onClick={() => {
            setTab("password");
            setSuccess("");
            setError("");
          }}
        >
          Đổi mật khẩu
        </button>
      </div>
      <section className="panel profile-panel">
        {success && (
          <div className="success" role="status">
            {success}
          </div>
        )}
        {error && (
          <div className="error" role="alert" style={{ color: "#b42318", marginBottom: 16 }}>
            {error}
          </div>
        )}
        {tab === "profile" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              paddingBottom: 20,
              borderBottom: "1px solid var(--cr-border, #e7ece9)",
              marginBottom: 20,
            }}
          >
            <UserAvatar name={user.fullName} url={user.avatarUrl} size={72} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                Ảnh đại diện
              </div>
              <div style={{ fontSize: 12, color: "var(--cr-subtle, #667085)", marginBottom: 10 }}>
                Hỗ trợ JPG, PNG, WEBP, GIF (tối đa 5MB)
              </div>
              <label
                className="cr-btn sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: uploadingAvatar ? "not-allowed" : "pointer",
                }}
              >
                <Camera size={14} />
                {uploadingAvatar ? "Đang tải ảnh..." : "Đổi ảnh đại diện"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploadingAvatar}
                  onChange={handleAvatarChange}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        )}
        <SchemaForm
          key={tab}
          operation={
            tab === "profile"
              ? "PATCH /auth/me"
              : "PATCH /auth/me/change-password"
          }
          initial={tab === "profile" ? user : {}}
          onBusyChange={setBusy}
          onSuccess={() => {
            setSuccess("Cập nhật thành công.");
            void client.invalidateQueries({ queryKey: ["me"] });
          }}
          onCancel={() => {
            setTab("profile");
          }}
        />
      </section>
    </>
  );
}
