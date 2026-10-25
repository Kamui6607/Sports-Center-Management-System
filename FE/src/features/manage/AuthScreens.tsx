import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, Eye, EyeOff, LogIn, ShieldAlert } from "lucide-react";
import { api } from "../../shared/api";
import { ErrorBox, Field, fieldErrors } from "./kit";
import "./admin.css";

// Nguồn media: docs/PUBLIC_MEDIA.md (Mixkit + Unsplash, giấy phép miễn phí).
const AUTH_VIDEO = "https://assets.mixkit.co/videos/44414/44414-720.mp4";
const AUTH_POSTER = "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=80";

function AuthMedia() {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    setMotion(!reduce.matches && !saveData);
  }, []);
  return (
    <div className="cr-auth-media">
      {motion ? (
        <video src={AUTH_VIDEO} poster={AUTH_POSTER} autoPlay muted loop playsInline preload="auto" />
      ) : (
        <img src={AUTH_POSTER} alt="" />
      )}
    </div>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  const story = useRef<HTMLElement>(null);
  function tilt(e: PointerEvent<HTMLElement>) {
    const el = story.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${y * -6}deg`);
    el.style.setProperty("--ry", `${x * 8}deg`);
    el.style.setProperty("--mx", `${x * -14}px`);
    el.style.setProperty("--my", `${y * -10}px`);
  }
  function reset() {
    for (const k of ["--mx", "--my"]) story.current?.style.setProperty(k, "0px");
    story.current?.style.setProperty("--rx", "0deg");
    story.current?.style.setProperty("--ry", "0deg");
  }
  return (
    <div className="cr cr-solo">
      <div className="cr-auth">
        <section className="cr-auth-story" aria-hidden="true" ref={story} onPointerMove={tilt} onPointerLeave={reset}>
          <div className="cr-auth-stage">
            <AuthMedia />
            <div className="cr-auth-shade" />
          </div>
          <div className="cr-brand">
            <span className="cr-brand-mark">
              <Activity size={19} strokeWidth={2.4} />
            </span>
            <span className="cr-brand-name">
              Pulse
              <small>Sports Center Manager</small>
            </span>
          </div>
          <div>
            <div className="cr-sublabel">Không gian quản lý trung tâm</div>
            <h1>
              Mọi phòng tập, lớp học và <em>nhịp vận hành</em> trên một màn hình.
            </h1>
            <p>Quản lý người dùng, huấn luyện viên, khóa học, lịch, cửa hàng và doanh thu của Pulse Sports Center.</p>
          </div>
          <div className="cr-mono cr-muted" style={{ fontSize: 12 }}>
            Chỉ dành cho tài khoản Quản lý · Hội viên và HLV dùng ứng dụng Pulse trên điện thoại
          </div>
        </section>
        <section className="cr-auth-form">{children}</section>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, invalid }: { value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="cr-pass">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        aria-invalid={invalid || undefined}
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function AdminLogin({ onLogin, busy, error }: { onLogin: (e: string, p: string) => Promise<void>; busy: boolean; error: unknown }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    document.title = "Đăng nhập · Pulse Manager";
  }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy) void onLogin(email.trim(), password);
  }
  return (
    <AuthFrame>
      <form className="cr-auth-card" onSubmit={submit}>
        <div className="cr-sublabel">Đăng nhập quản trị</div>
        <h2>Chào mừng trở lại</h2>
        <p>Đăng nhập bằng tài khoản Quản lý trung tâm.</p>
        <Field label="Email" required>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Mật khẩu" required>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        {error ? <ErrorBox error={error} /> : null}
        <button className="cr-btn primary" disabled={busy || !email || !password}>
          <LogIn size={17} />
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
        <Link className="cr-crumb" to="/reset-password">
          Đã nhận mã đặt lại mật khẩu? Đặt mật khẩu mới
        </Link>
      </form>
    </AuthFrame>
  );
}

/**
 * Trang công khai tối thiểu để người nhận email (do Manager gửi hoặc tự yêu cầu) tự đặt mật khẩu mới:
 * `PATCH /auth/reset-password { email, otp, newPassword }`. Không xây portal Member/Coach.
 */
export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;
  const errs = fieldErrors(error);
  useEffect(() => {
    document.title = "Đặt lại mật khẩu · Pulse";
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || mismatch) return;
    setBusy(true);
    setError(undefined);
    try {
      await api("PATCH /auth/reset-password", { body: { email: email.trim().toLowerCase(), otp: otp.trim(), newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame>
      {done ? (
        <div className="cr-auth-card">
          <div className="cr-sublabel">Hoàn tất</div>
          <h2>Đã đặt mật khẩu mới</h2>
          <p>Mọi phiên đăng nhập cũ của tài khoản đã bị đăng xuất. Hãy đăng nhập lại bằng mật khẩu mới (Web cho Quản lý, ứng dụng Pulse cho Hội viên/HLV).</p>
          <Link className="cr-btn primary" to="/login">
            Đến trang đăng nhập
          </Link>
        </div>
      ) : (
        <form className="cr-auth-card" onSubmit={submit} noValidate>
          <div className="cr-sublabel">Đặt lại mật khẩu</div>
          <h2>Đặt mật khẩu mới</h2>
          <p>Nhập email và mã 6 số trong email đặt lại mật khẩu. Mã có hiệu lực 15 phút và chỉ dùng một lần.</p>
          <Field label="Email" required error={errs.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Mã xác nhận" required error={errs.otp}>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              className="cr-mono"
              required
            />
          </Field>
          <Field label="Mật khẩu mới" required error={errs.newPassword} hint="Tối thiểu 6 ký tự.">
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <Field label="Nhập lại mật khẩu mới" required error={mismatch ? "Mật khẩu nhập lại không khớp." : undefined}>
            <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} />
          </Field>
          {error ? <ErrorBox error={error} /> : null}
          <button className="cr-btn primary" disabled={busy || !email || otp.length !== 6 || password.length < 6 || mismatch}>
            {busy ? "Đang lưu…" : "Đặt mật khẩu mới"}
          </button>
          <Link className="cr-crumb" to="/login">
            Quay lại đăng nhập
          </Link>
        </form>
      )}
    </AuthFrame>
  );
}

export function NotManager({ name, onLogout }: { name: string; onLogout: () => Promise<void> }) {
  return (
    <div className="cr cr-solo">
      <div className="cr-fullscreen">
        <div>
          <ShieldAlert size={44} style={{ color: "var(--danger)" }} />
          <h1>Không có quyền truy cập</h1>
          <p>
            Tài khoản <strong>{name}</strong> không phải Quản lý đang hoạt động. Web quản trị chỉ dành cho Quản lý — Hội viên và Huấn luyện viên
            vui lòng dùng ứng dụng Pulse trên điện thoại.
          </p>
          <button className="cr-btn primary" onClick={() => void onLogout()}>
            Đăng xuất và dùng tài khoản khác
          </button>
        </div>
      </div>
    </div>
  );
}
