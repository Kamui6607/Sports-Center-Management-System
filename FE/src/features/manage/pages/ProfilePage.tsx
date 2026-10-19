import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api";
import type { ProfileOk } from "../../../shared/generated";
import { Dl, ErrorBox, Field, fieldErrors, PageHead, Panel, dateTime, str } from "../kit";
import { ThemeSwitcher } from "../theme";

export default function ProfilePage({ user }: { user: ProfileOk["data"] }) {
  const cache = useQueryClient();
  const [name, setName] = useState(user.fullName);
  const [phone, setPhone] = useState(str(user.phone));
  const info = useMutation({
    mutationFn: () => api("PATCH /auth/me", { body: { fullName: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) } }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["me"] }),
  });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const change = useMutation({
    mutationFn: () => api("PATCH /auth/me/change-password", { body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }),
    onSuccess: () => setPw({ currentPassword: "", newPassword: "", confirm: "" }),
  });
  const pwErr = fieldErrors(change.error);
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.newPassword;
  return (
    <>
      <PageHead eyebrow="Tài khoản" title={user.fullName} desc="Quản lý trung tâm" />
      <div className="cr-grid-2">
        <Panel title="Thông tin cá nhân">
          <form
            className="cr-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!info.isPending && name.trim().length >= 2) info.mutate();
            }}
          >
            <Field label="Họ và tên" required error={fieldErrors(info.error).fullName}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Số điện thoại" error={fieldErrors(info.error).phone} hint="9–15 chữ số.">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
            <div className="wide" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {info.error && !Object.keys(fieldErrors(info.error)).length ? <ErrorBox error={info.error} /> : null}
              <button className="cr-btn primary" disabled={info.isPending || name.trim().length < 2}>
                {info.isPending ? "Đang lưu…" : "Lưu thông tin"}
              </button>
            </div>
          </form>
          <div style={{ marginTop: 16 }}>
            <Dl items={[["Email đăng nhập", user.email], ["Tạo lúc", dateTime(user.createdAt)]]} />
          </div>
        </Panel>
        <Panel title="Đổi mật khẩu" desc="Sau khi đổi, bạn cần đăng nhập lại trên mọi thiết bị.">
          <form
            className="cr-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!change.isPending && !mismatch && pw.newPassword.length >= 6 && pw.currentPassword) change.mutate();
            }}
          >
            <Field label="Mật khẩu hiện tại" required wide error={pwErr.currentPassword}>
              <input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="Mật khẩu mới" required error={pwErr.newPassword} hint="Tối thiểu 6 ký tự.">
              <input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Nhập lại" required error={mismatch ? "Không khớp." : undefined}>
              <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            </Field>
            <div className="wide" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {change.error && !Object.keys(pwErr).length ? <ErrorBox error={change.error} /> : null}
              <button className="cr-btn primary" disabled={change.isPending || mismatch || pw.newPassword.length < 6 || !pw.currentPassword}>
                {change.isPending ? "Đang đổi…" : "Đổi mật khẩu"}
              </button>
            </div>
          </form>
        </Panel>
      </div>
      <Panel title="Giao diện">
        <ThemeSwitcher />
      </Panel>
    </>
  );
}
