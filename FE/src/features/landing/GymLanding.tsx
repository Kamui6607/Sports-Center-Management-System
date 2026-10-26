import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { api } from "../../shared/api";
import { PulseLine } from "../../shared/PulseLine";
import "./landing.css";

/*
 * Trang giới thiệu công khai của phòng gym (Web chỉ có Quản lý đăng nhập; Hội viên/HLV dùng ứng dụng Pulse).
 * Ảnh & video là minh họa có giấy phép miễn phí (Unsplash, Mixkit — xem docs/PUBLIC_MEDIA.md), không phải ảnh của trung tâm.
 * Thông tin trung tâm và danh sách khóa học lấy thật từ BE (`GET /center`, `GET /classes`).
 */

const img = (id: string, w: number, h: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;
const MEDIA = {
  heroVideo: "https://assets.mixkit.co/videos/44414/44414-720.mp4",
  heroPoster: img("1534438327276-14e5300c3a48", 1600, 400),
  floor: img("1593079831268-3381b0db4a77", 900, 1200),
  weights: img("1558611848-73f7eb4001a1", 720, 800),
  rack: img("1576678927484-cc907957088c", 800, 1000),
  choose: img("1583454110551-21f2fa2afe61", 2000, 1300),
  scan: img("1599058917212-d750089bc07e", 2000, 1300),
  progress: img("1517836357463-d25dfeac3438", 2000, 1300),
};
/** Tiêu đề phần giới thiệu; bản chữ trắng (vẽ trên ảnh) đọc lại chuỗi này. */
const PAPER_TEXT = "Tập trước giờ làm,\ntập cả sau giờ tan.";
const CREDITS = "Ảnh minh họa: Unsplash (Unsplash License) · Video: Mixkit (Mixkit Free License).";

type Center = {
  name: string;
  address: string;
  hotline?: string | null;
  email?: string | null;
  openingHours?: string | null;
  parkingNote?: string | null;
  description?: string | null;
  mapLink?: string;
};
type ClassRow = {
  id: string;
  name: string;
  fitness?: string | null;
  targetLevel?: string | null;
  price?: string | number;
  coach?: { user?: { fullName?: string } };
  summary?: { saleState?: string; weekdays?: number[]; startDate?: string; currentPrice?: number; upcomingSessionCount?: number; minRemainingSlots?: number };
};

// ── Giờ mở cửa: đọc chuỗi tự do "05:30 – 22:00 hằng ngày (CN đến 20:00)" ⇒ trạng thái trực tiếp ──
type Hours = { open: number; close: number; sundayClose?: number };
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
function parseHours(text?: string | null): Hours | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const sun = text.match(/CN[^0-9]*(\d{1,2}:\d{2})/i);
  return { open: toMin(m[1]), close: toMin(m[2]), sundayClose: sun ? toMin(sun[1]) : undefined };
}
/** Giờ hiện tại ở TP.HCM, không phụ thuộc múi giờ máy người xem. */
function saigonNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")), sunday: get("weekday") === "Sun" };
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ""}` : `${m} phút`);
function openStatus(hours: Hours | null, now: { minutes: number; sunday: boolean }) {
  if (!hours) return null;
  const close = now.sunday && hours.sundayClose ? hours.sundayClose : hours.close;
  if (now.minutes >= hours.open && now.minutes < close) return { open: true, text: `Đang mở cửa · đóng lúc ${hhmm(close)}, còn ${span(close - now.minutes)}` };
  const until = now.minutes < hours.open ? hours.open - now.minutes : 24 * 60 - now.minutes + hours.open;
  return { open: false, text: `Đang đóng cửa · mở lại lúc ${hhmm(hours.open)}, sau ${span(until)}` };
}
function useClock() {
  const [now, setNow] = useState(saigonNow);
  useEffect(() => {
    const t = window.setInterval(() => setNow(saigonNow()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const DAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const LEVEL: Record<string, string> = { BEGINNER: "Người mới", INTERMEDIATE: "Trung bình", ADVANCED: "Nâng cao" };
const money = (v?: number | string) => (v == null || v === "" ? "—" : new Intl.NumberFormat("vi-VN").format(Number(v)) + " đ");
const dayMonth = (iso?: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
const phone = (p: string) => p.replace(/\D/g, "").replace(/^(\d{4})(\d{3})(\d+)$/, "$1 $2 $3");

/** Thêm `is-in` khi phần tử vào khung nhìn — chạy một lần (motion: reveal on scroll). */
function useReveal(deps: unknown[]) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll("[data-reveal]:not(.is-in)");
    if (!els?.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return root;
}

/** Video nền chỉ chạy khi nhìn thấy, tôn trọng giảm chuyển động / tiết kiệm dữ liệu (ảnh poster thay thế). */
function LoopVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    setMotion(!matchMedia("(prefers-reduced-motion: reduce)").matches && !saveData);
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? void v.play().catch(() => {}) : v.pause()));
    io.observe(v);
    return () => io.disconnect();
  }, [motion]);
  return motion ? (
    <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" aria-label={label} />
  ) : (
    <img src={poster} alt={label} width={1600} height={400} fetchPriority="high" />
  );
}

const STEPS = [
  {
    verb: "Chọn gói.",
    photo: MEDIA.choose,
    alt: "Tay cầm quả tạ đơn trên giá tạ",
    text: "Mua gói tập tự do hoặc đăng ký khóa học với HLV ngay trong ứng dụng Pulse, thanh toán chuyển khoản VietQR và được xác nhận tự động.",
  },
  {
    verb: "Quét mã.",
    photo: MEDIA.scan,
    alt: "Người tập dây thừng chiến đấu trong phòng tập",
    text: "Đến quầy, mở thẻ hội viên trong ứng dụng và đưa mã QR, vào phòng tập trong vài giây, buổi học được điểm danh luôn.",
  },
  {
    verb: "Tiến bộ.",
    photo: MEDIA.progress,
    alt: "Người tập nâng tạ đòn trên sàn cao su",
    text: "HLV giao lộ trình tập, ghi nhận từng buổi và nhận xét riêng cho bạn; bạn xem lại tất cả trên điện thoại.",
  },
];

export default function GymLanding({ signedIn }: { signedIn: boolean }) {
  const center = useQuery({
    queryKey: ["public", "center"],
    queryFn: ({ signal }) => api<Center>("GET /center", { signal }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const classes = useQuery({
    queryKey: ["public", "classes"],
    queryFn: ({ signal }) => api<ClassRow[]>("GET /classes", { query: { status: "APPROVED", isActive: "true", limit: "30" }, signal }),
    staleTime: 60_000,
    retry: 1,
  });
  const c = center.data?.data;
  const now = useClock();
  const status = openStatus(parseHours(c?.openingHours), now);
  const rows = (classes.data?.data ?? []).filter((k) => k.summary?.saleState === "ON_SALE" && (k.summary.upcomingSessionCount ?? 0) > 0).slice(0, 8);
  const root = useReveal([center.status, classes.status]);
  const mapLink = c?.mapLink;
  const contactLine = c?.email || (c?.hotline ? phone(c.hotline) : "");
  const contactHref = c?.email ? `mailto:${c.email}?subject=${encodeURIComponent("Hỏi về phòng tập Pulse")}` : c?.hotline ? `tel:${c.hotline.replace(/\s/g, "")}` : undefined;

  useEffect(() => {
    document.title = "Pulse Gym · Phòng gym cho hội viên và huấn luyện viên";
  }, []);

  const staffLink = signedIn ? (
    <Link to="/manager/dashboard">Vào trang quản lý</Link>
  ) : (
    <Link to="/login">Đăng nhập quản lý</Link>
  );
  const at = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <div className="gl" ref={root}>
      <a className="gl-skip" href="#gioi-thieu">
        Bỏ qua tới nội dung
      </a>

      {/* ── Màn đầu: câu "Pulse [phòng tập] Gym" ── */}
      <header className="gl-hero">
        <nav className="gl-nav" aria-label="Điều hướng chính">
          <Link to="/" className="gl-word" aria-label="Pulse — trang chủ">
            pulse<span>.</span>
          </Link>
          <div className="gl-nav-links">
            <a href="#khoa-hoc" className="gl-hide-sm">
              Khóa học
            </a>
            <a href="#lien-he" className="gl-hide-sm">
              Liên hệ
            </a>
            {staffLink}
          </div>
        </nav>

        <h1 className="gl-sentence" aria-label="Pulse Gym">
          <span className="gl-mask" aria-hidden="true">
            <span style={at(0)}>Pulse</span>
          </span>
          <span className="gl-strip" aria-hidden="true">
            <span className="gl-strip-in">
              <LoopVideo src={MEDIA.heroVideo} poster={MEDIA.heroPoster} label="Người tập nâng tạ trong phòng gym" />
            </span>
          </span>
          <span className="gl-mask" aria-hidden="true">
            <span style={at(1)}>Gym</span>
          </span>
        </h1>

        <div className="gl-hero-foot">
          <p className="gl-lead gl-load" style={{ "--d": "420ms" } as CSSProperties}>
            Phòng gym cho hội viên và huấn luyện viên. Mua gói, đặt khóa học và check-in bằng ứng dụng Pulse.
          </p>
          <p className={"gl-status gl-load" + (status?.open ? " is-open" : "")} style={{ "--d": "500ms" } as CSSProperties} aria-live="polite">
            <i aria-hidden="true" />
            {status ? status.text : c?.openingHours ? `Giờ mở cửa: ${c.openingHours}` : center.isError ? "Chưa tải được giờ mở cửa." : "Đang xem giờ mở cửa…"}
          </p>
          <div className="gl-actions gl-load" style={{ "--d": "580ms" } as CSSProperties}>
            {mapLink ? (
              <a className="gl-btn" href={mapLink} target="_blank" rel="noreferrer">
                Chỉ đường tới phòng tập <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ) : (
              <a className="gl-btn" href="#lien-he">
                Xem địa chỉ <ArrowDown size={18} aria-hidden="true" />
              </a>
            )}
            <a className="gl-textlink" href="#khoa-hoc">
              Khóa học đang mở
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ── Giới thiệu: tiêu đề băng qua ảnh ── */}
        <section className="gl-intro" id="gioi-thieu" aria-labelledby="gl-intro-h">
          {/* Quan sát khung ngoài (không bị cắt) — khung trong mới chạy hiệu ứng cửa chớp. */}
          <div className="gl-intro-photo gl-shutter" data-reveal>
            <div className="gl-shutter-in">
              <img src={MEDIA.floor} alt="Khu máy chạy bộ và cardio trong một phòng gym rộng" width={900} height={1200} />
            </div>
          </div>
          <h2 id="gl-intro-h" className="gl-intro-h">
            <span className="gl-ink" data-reveal style={at(0)}>
              Tập trước giờ làm,
              <br />
              tập cả sau giờ tan.
            </span>
            {/* Bản chữ trắng chỉ để vẽ phần tiêu đề nằm trên ảnh (pseudo-element, trình đọc màn hình bỏ qua). */}
            <span className="gl-paper" aria-hidden="true" data-reveal style={at(0)} data-text={PAPER_TEXT} />
          </h2>
          <div className="gl-intro-body">
            <p data-reveal style={at(1)}>
              {c?.openingHours ? `Mở cửa ${c.openingHours}. ` : ""}
              {c?.description || "Khu tạ tự do, máy cardio và khu tập riêng với huấn luyện viên, một thẻ hội viên dùng cho tất cả."}
            </p>
            <dl className="gl-facts" data-reveal style={at(2)}>
              <div>
                <dt>Địa chỉ</dt>
                <dd>{c?.address ?? "—"}</dd>
              </div>
              {c?.parkingNote ? (
                <div>
                  <dt>Gửi xe</dt>
                  <dd>{c.parkingNote}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <figure className="gl-intro-small" data-reveal style={at(3)}>
            <img src={MEDIA.weights} alt="Giá tạ và ghế đẩy ngực cạnh cửa sổ" width={720} height={800} loading="lazy" />
          </figure>
        </section>

        {/* ── Khóa học đang mở: bảng đẩy sang phải ── */}
        <section className="gl-list" id="khoa-hoc" aria-labelledby="gl-list-h">
          <h2 id="gl-list-h" className="gl-h2" data-reveal>
            Khóa học đang mở,
            <br />
            tập cùng HLV.
          </h2>
          <div className="gl-list-grid">
            <figure className="gl-list-photo" data-reveal style={at(2)}>
              <img src={MEDIA.rack} alt="Hàng tạ đơn xếp trên giá" width={800} height={1000} loading="lazy" />
            </figure>
            <p className="gl-list-name" aria-hidden="true">
              Khóa học
            </p>
            <div className="gl-table" data-reveal style={at(1)}>
              {classes.isPending ? (
                <p className="gl-note">Đang tải danh sách khóa học…</p>
              ) : classes.isError ? (
                <p className="gl-note">
                  Chưa tải được danh sách khóa học.{" "}
                  <button type="button" className="gl-textlink" onClick={() => void classes.refetch()}>
                    Thử lại
                  </button>
                </p>
              ) : rows.length === 0 ? (
                <p className="gl-note">Hiện chưa có khóa nào mở bán. HLV đang chuẩn bị lịch mới, ghé lại sau nhé.</p>
              ) : (
                <ul>
                  {rows.map((k) => (
                    <li key={k.id}>
                      <span className="gl-kind">
                        {k.fitness || "Gym"}
                        {k.targetLevel && LEVEL[k.targetLevel] ? ` · ${LEVEL[k.targetLevel]}` : ""}
                      </span>
                      <span className="gl-what">
                        <strong>{k.name}</strong>
                        <small>
                          {k.coach?.user?.fullName ? `HLV ${k.coach.user.fullName}` : "Huấn luyện viên Pulse"}
                          {k.summary?.weekdays?.length ? ` · ${k.summary.weekdays.map((d) => DAY[d]).join(", ")}` : ""}
                          {k.summary?.startDate ? ` · từ ${dayMonth(k.summary.startDate)}` : ""}
                        </small>
                      </span>
                      <span className="gl-price">{money(k.summary?.currentPrice ?? k.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="gl-note">Đăng ký và thanh toán khóa học trong ứng dụng Pulse.</p>
            </div>
          </div>
        </section>

        {/* ── Cách tập: mỗi bước một màn, động từ giữ giữa màn hình ── */}
        <section className="gl-steps" id="cach-tap" aria-labelledby="gl-steps-h">
          <h2 id="gl-steps-h" className="gl-steps-h">
            Tập ở Pulse, ba việc trong ứng dụng
          </h2>
          {STEPS.map((s) => (
            <article className="gl-step" key={s.verb}>
              <img src={s.photo} alt={s.alt} width={2000} height={1300} loading="lazy" />
              <h3 className="gl-verb">{s.verb}</h3>
              <p className="gl-step-text">{s.text}</p>
            </article>
          ))}
        </section>

        {/* ── Liên hệ: email / hotline làm chữ lớn ── */}
        <section className="gl-contact" id="lien-he" aria-labelledby="gl-contact-h">
          <h2 id="gl-contact-h" data-reveal>
            Hỏi về gói tập, lịch HLV hay giờ mở cửa ngày lễ? Gọi hoặc viết cho chúng tôi.
          </h2>
          {contactLine && contactHref ? (
            <a className="gl-display" href={contactHref} data-reveal style={at(1)}>
              {contactLine}
            </a>
          ) : (
            <p className="gl-display muted">{center.isError ? "Chưa tải được thông tin liên hệ." : "…"}</p>
          )}
          <div className="gl-contact-foot" data-reveal style={at(2)}>
            <div>
              <strong>{c?.name ?? "Pulse Gym"}</strong>
              <span>{c?.address}</span>
              {c?.email && c.hotline ? <a href={`tel:${c.hotline.replace(/\s/g, "")}`}>Hotline {phone(c.hotline)}</a> : null}
            </div>
            <div className="gl-contact-right">
              {mapLink ? (
                <a href={mapLink} target="_blank" rel="noreferrer">
                  Mở bản đồ <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              ) : null}
              {c?.openingHours ? <span>{c.openingHours}</span> : null}
            </div>
          </div>
        </section>
      </main>

      {/* ── Kết: lời mời + tên thương hiệu bị cắt ở mép dưới ── */}
      <footer className="gl-foot">
        <div className="gl-foot-top">
          <div>
            <h2 data-reveal>
              Hẹn bạn
              <br />ở phòng tập.
            </h2>
            {mapLink ? (
              <a className="gl-btn dark" href={mapLink} target="_blank" rel="noreferrer" data-reveal style={at(1)}>
                Chỉ đường <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <ul className="gl-foot-links">
            <li>
              <a href="#gioi-thieu">Phòng tập</a>
            </li>
            <li>
              <a href="#khoa-hoc">Khóa học</a>
            </li>
            <li>
              <a href="#lien-he">Liên hệ</a>
            </li>
            <li>{staffLink}</li>
          </ul>
        </div>
        <div className="gl-foot-pulse" data-reveal>
          <PulseLine />
        </div>
        <div className="gl-legal">
          <span>© {new Date().getFullYear()} Pulse Sports Center</span>
          <span>{CREDITS}</span>
        </div>
        <p className="gl-giant" aria-hidden="true">
          pulse.
        </p>
      </footer>
    </div>
  );
}
