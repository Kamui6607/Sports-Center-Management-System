import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Eye, EyeOff, MailCheck, ShieldAlert } from "lucide-react";
import { api } from "../../shared/api";
import { PulseLine } from "../../shared/PulseLine";
import { PulseMark } from "../../shared/PulseMark";
import { ErrorBox, fieldErrors } from "./kit";
import { ThemeToggle, useThemePref } from "./theme";
import "./admin.css";
import "./motion.css";
import "./auth.css";

// Nguồn media: docs/PUBLIC_MEDIA.md (Mixkit + Unsplash, giấy phép miễn phí) — minh họa, không phải ảnh của trung tâm.
const AUTH_VIDEO = "https://assets.mixkit.co/videos/44414/44414-720.mp4";
const AUTH_POSTER = "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=75";

type Center = { name?: string; openingHours?: string | null };

/** Thông tin trung tâm công khai (`GET /center`) — hiện dưới khung video, không có thì ẩn. */
function useCenter() {
  return useQuery({
    queryKey: ["public", "center"],
    queryFn: ({ signal }) => api<Center>("GET /center", { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function AuthMedia() {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    setMotion(!reduce.matches && !saveData);
  }, []);
  return motion ? (
    <video src={AUTH_VIDEO} poster={AUTH_POSTER} autoPlay muted loop playsInline preload="metadata" />
  ) : (
    <img src={AUTH_POSTER} alt="" width={1400} height={933} />
  );
}

/** Khung chung của màn công khai: trái là câu chuyện thương hiệu (nền rêu + video), phải là biểu mẫu. */
function AuthFrame({ title, lead, children }: { title: [string, string]; lead: string; children: ReactNode }) {
  useThemePref();
  const center = useCenter().data?.data;
  return (
    <div className="cr cr-solo">
      <div className="pa">
        <section className="pa-story">
          <Link to="/" className="pa-word" aria-label="Pulse — về trang chủ">
            <PulseMark size={34} className="pa-mark" />
            pulse<span>.</span>
            <small>Manager</small>
          </Link>
          <div className="pa-copy">
            <h1 className="pa-lines">
              <span className="pa-line">
                <span style={{ "--i": 0 } as CSSProperties}>{title[0]}</span>
              </span>
              <span className="pa-line">
                <span style={{ "--i": 1 } as CSSProperties}>{title[1]}</span>
              </span>
            </h1>
            <p className="pa-rise" style={{ "--d": "380ms" } as CSSProperties}>
              {lead}
            </p>
          </div>
          <PulseLine className="pa-pulse" />
          <figure className="pa-film">
            <div className="pa-shutter">
              <AuthMedia />
            </div>
            {center?.name ? (
              <figcaption>
                <strong>{center.name}</strong>
                {center.openingHours ? <span>{center.openingHours}</span> : null}
              </figcaption>
            ) : null}
          </figure>
        </section>
        <section className="pa-side">
          <div className="pa-side-top">
            <Link className="pa-back" to="/">
              <ArrowLeft size={16} aria-hidden="true" /> Trang chủ
            </Link>
            <ThemeToggle />
          </div>
          <div className="pa-form-wrap">{children}</div>
          <p className="pa-foot">Hội viên và Huấn luyện viên dùng ứng dụng Pulse trên điện thoại.</p>
        </section>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const detectCaps = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return (
    <>
      <div className="cr-pass">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={detectCaps}
          onKeyDown={detectCaps}
          onBlur={() => setCaps(false)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          aria-invalid={invalid || undefined}
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {caps ? <small className="pa-caps">Caps Lock đang bật.</small> : null}
    </>
  );
}

/** Ô nhập có nhãn — nhãn và phần phụ (VD "Quên mật khẩu?") cùng một hàng. */
function Row({ id, label, aside, error, hint, children }: { id: string; label: string; aside?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="pa-field pa-rise">
      <div className="pa-label">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children}
      {error ? <span className="cr-err">{error}</span> : hint ? <small>{hint}</small> : null}
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
  const forgot = `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`;
  return (
    <AuthFrame title={["Cả phòng gym,", "trên một màn hình."]} lead="Duyệt khóa học, xếp lịch HLV, theo dõi gói tập, cửa hàng và doanh thu của trung tâm.">
      <form className="pa-form" onSubmit={submit} aria-busy={busy}>
        <div className="pa-head pa-rise">
          <h2>Đăng nhập quản lý</h2>
          <p>Dùng tài khoản Quản lý trung tâm được cấp.</p>
        </div>
        <Row id="login-email" label="Email">
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </Row>
        <Row
          id="login-password"
          label="Mật khẩu"
          aside={
            <Link className="pa-link" to={forgot}>
              Quên mật khẩu?
            </Link>
          }
        >
          <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Row>
        {error ? <ErrorBox error={error} /> : null}
        <button className="cr-btn primary pa-submit pa-rise" disabled={busy || !email || !password} aria-busy={busy || undefined}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </AuthFrame>
  );
}

/** Ô mã 6 số: một input thật (dán, tự điền OTP, đọc màn hình đều chạy), 6 ô chỉ để hiển thị. */
function OtpInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <div className={"pa-otp" + (focused ? " focused" : "") + (invalid ? " invalid" : "")} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="one-time-code"
        aria-invalid={invalid || undefined}
        required
      />
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={i === Math.min(value.length, 5) ? "active" : value[i] ? "filled" : ""} aria-hidden="true">
          {value[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(seconds)] as const;
}

type ForgotOk = { message?: string; resendAfterSeconds?: number; expiresInSeconds?: number };

/**
 * Quên / đặt lại mật khẩu cho mọi vai trò (Manager trên Web, Hội viên/HLV mở liên kết từ email):
 * - `?token=` (liên kết trong email) ⇒ chỉ nhập mật khẩu mới: `PATCH /auth/reset-password { token, newPassword }`.
 * - Không có token ⇒ bước 1 gửi mã `POST /auth/forgot-password`, bước 2 nhập mã 6 số + mật khẩu mới `{ email, otp, newPassword }`.
 */
export function ResetPasswordScreen() {
  const [params, setParams] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState(params.get("email") ?? "");
  // `/forgot-password` (từ nút "Quên mật khẩu?") luôn bắt đầu ở bước gửi mã; `/reset-password?email=` (đã có mã) vào thẳng bước nhập mã.
  const fromForgot = useLocation().pathname === "/forgot-password";
  const [step, setStep] = useState<"request" | "verify">(params.get("email") && !fromForgot ? "verify" : "request");
  const [sentNote, setSentNote] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState(false);
  const [resendLeft, startResend] = useCountdown(60);
  const mismatch = confirm.length > 0 && confirm !== password;
  const errs = fieldErrors(error);
  const longEnough = password.length >= 6;

  useEffect(() => {
    document.title = (token ? "Đặt mật khẩu mới" : "Quên mật khẩu") + " · Pulse";
  }, [token]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<ForgotOk>("POST /auth/forgot-password", { body: { email: email.trim().toLowerCase() }, silent: true });
      setSentNote(res.data?.message ?? "Nếu email đã được đăng ký, mã xác nhận đã được gửi tới email của bạn.");
      startResend();
      setStep("verify");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault();
    if (busy || mismatch || !longEnough) return;
    setBusy(true);
    setError(undefined);
    try {
      const body = token ? { token, newPassword: password } : { email: email.trim().toLowerCase(), otp: otp.trim(), newPassword: password };
      await api("PATCH /auth/reset-password", { body, silent: true });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  /** Liên kết hết hạn ⇒ quay về bước gửi mã mới, bỏ token khỏi URL. */
  function restart() {
    setParams({}, { replace: true });
    setError(undefined);
    setStep("request");
  }

  const passwordFields = (
    <>
      <Row
        id="reset-new"
        label="Mật khẩu mới"
        error={errs.newPassword}
        hint={
          <span className={"pa-check" + (longEnough ? " ok" : "")}>
            <Check size={14} aria-hidden="true" /> Tối thiểu 6 ký tự
          </span>
        }
      >
        <PasswordInput id="reset-new" value={password} onChange={setPassword} autoComplete="new-password" autoFocus={Boolean(token)} />
      </Row>
      <Row id="reset-confirm" label="Nhập lại mật khẩu mới" error={mismatch ? "Mật khẩu nhập lại không khớp." : undefined}>
        <PasswordInput id="reset-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} />
      </Row>
    </>
  );

  let body: ReactNode;
  if (done) {
    body = (
      <div className="pa-form pa-done">
        <span className="pa-done-mark pa-rise" aria-hidden="true">
          <Check size={26} strokeWidth={2.6} />
        </span>
        <div className="pa-head pa-rise">
          <h2>Đã đặt mật khẩu mới</h2>
          <p>Mọi phiên đăng nhập cũ của tài khoản đã được đăng xuất. Quản lý đăng nhập lại trên Web; Hội viên và HLV đăng nhập lại trong ứng dụng Pulse.</p>
        </div>
        <Link className="cr-btn primary pa-submit pa-rise" to="/login">
          Đến trang đăng nhập
        </Link>
      </div>
    );
  } else if (token) {
    body = (
      <form className="pa-form" onSubmit={submitNew} noValidate aria-busy={busy}>
        <div className="pa-head pa-rise">
          <h2>Đặt mật khẩu mới</h2>
          <p>Liên kết trong email có hiệu lực 15 phút và chỉ dùng được một lần.</p>
        </div>
        {passwordFields}
        {error ? (
          <div className="pa-rise">
            <ErrorBox error={error} />
            <button type="button" className="pa-link pa-inline" onClick={restart}>
              Liên kết đã hết hạn? Gửi mã mới
            </button>
          </div>
        ) : null}
        <button className="cr-btn primary pa-submit pa-rise" disabled={busy || !longEnough || mismatch || !confirm} aria-busy={busy || undefined}>
          {busy ? "Đang lưu…" : "Đặt mật khẩu mới"}
        </button>
      </form>
    );
  } else if (step === "request") {
    body = (
      <form className="pa-form" onSubmit={requestCode} noValidate aria-busy={busy}>
        <div className="pa-head pa-rise">
          <h2>Quên mật khẩu</h2>
          <p>Nhập email tài khoản. Chúng tôi gửi mã 6 số và liên kết đặt lại, hiệu lực trong 15 phút.</p>
        </div>
        <Row id="reset-email" label="Email" error={errs.email}>
          <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </Row>
        {error ? <ErrorBox error={error} /> : null}
        <button className="cr-btn primary pa-submit pa-rise" disabled={busy || !/\S+@\S+\.\S+/.test(email)} aria-busy={busy || undefined}>
          {busy ? "Đang gửi…" : "Gửi mã xác nhận"}
        </button>
        <div className="pa-alt pa-rise">
          <button type="button" className="pa-link" onClick={() => setStep("verify")} disabled={!email.trim()}>
            Đã có mã? Nhập mã
          </button>
          <Link className="pa-link" to="/login">
            Quay lại đăng nhập
          </Link>
        </div>
      </form>
    );
  } else {
    body = (
      <form className="pa-form" onSubmit={submitNew} noValidate aria-busy={busy}>
        <div className="pa-head pa-rise">
          <h2>Nhập mã xác nhận</h2>
          <p>
            Mã 6 số được gửi tới <strong>{email || "email của bạn"}</strong>. Không thấy thư? Xem thêm mục Spam.{" "}
            <button type="button" className="pa-link pa-inline" onClick={() => setStep("request")}>
              Đổi email
            </button>
          </p>
        </div>
        {sentNote ? (
          <div className="cr-alert info pa-rise" role="status">
            <MailCheck size={16} aria-hidden="true" />
            <div>{sentNote}</div>
          </div>
        ) : null}
        <Row
          id="reset-otp"
          label="Mã xác nhận"
          error={errs.otp}
          aside={
            <button type="button" className="pa-link" onClick={() => void requestCode()} disabled={busy || resendLeft > 0}>
              {resendLeft > 0 ? `Gửi lại sau ${resendLeft} giây` : "Gửi lại mã"}
            </button>
          }
        >
          <OtpInput id="reset-otp" value={otp} onChange={setOtp} invalid={Boolean(errs.otp)} />
        </Row>
        {passwordFields}
        {error ? <ErrorBox error={error} /> : null}
        <button
          className="cr-btn primary pa-submit pa-rise"
          disabled={busy || otp.length !== 6 || !longEnough || mismatch || !confirm}
          aria-busy={busy || undefined}
        >
          {busy ? "Đang lưu…" : "Đặt mật khẩu mới"}
        </button>
        <div className="pa-alt pa-rise">
          <Link className="pa-link" to="/login">
            Quay lại đăng nhập
          </Link>
        </div>
      </form>
    );
  }

  return (
    <AuthFrame title={["Lấy lại tài khoản", "trong hai bước."]} lead="Mã xác nhận và liên kết đặt lại được gửi trong cùng một email. Đặt mật khẩu mới sẽ đăng xuất mọi phiên cũ.">
      {body}
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
