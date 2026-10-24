import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SchemaForm } from "./ui";
import type { ProfileOk } from "./generated";
export function Profile({ user }: { user: ProfileOk["data"] }) {
  const client = useQueryClient();
  const [tab, setTab] = useState("profile");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
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
