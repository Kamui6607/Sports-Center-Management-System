import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  Menu,
  Play,
  ShieldCheck,
  Users,
  Wallet,
  X,
  Zap,
  Activity,
  LayoutGrid,
  Bell,
  TrendingUp,
} from "lucide-react";
import { Brand } from "../../shared/Brand";
import { SportFilm } from "./SportFilm";
import "./public.css";

const photos = {
  hero: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2000&q=85",
  strength:
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=850&q=80",
  yoga: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=850&q=80",
  basketball:
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=850&q=80",
};
const features = [
  {
    icon: Users,
    name: "Hội viên trong tầm tay",
    text: "Hồ sơ, mục tiêu và gói tập. Tất cả kết nối trong một không gian.",
    tag: "MEMBERSHIP",
  },
  {
    icon: CalendarDays,
    name: "Lịch tập theo nhịp bạn",
    text: "Khám phá lớp học, sắp xếp lịch và đăng ký buổi tập thuận tiện.",
    tag: "SMART SCHEDULING",
  },
  {
    icon: Dumbbell,
    name: "Kết nối huấn luyện viên",
    text: "Tìm lớp học cùng huấn luyện viên phù hợp với hành trình của bạn.",
    tag: "COACH & CONNECT",
  },
  {
    icon: Wallet,
    name: "Quản lý thật rõ ràng",
    text: "Theo dõi gói thành viên, thanh toán và hóa đơn ở cùng một nơi.",
    tag: "PAYMENTS & REPORTS",
  },
];

function Counter({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(value);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / 1000, 1);
        setCount(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      observer.disconnect();
    });
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <div ref={ref} className="p-stat">
      <strong>
        {String(count).padStart(2, "0")}
        <span> /</span>
      </strong>
      <span>{label}</span>
    </div>
  );
}

function PlatformPreview() {
  const [tab, setTab] = useState(0);
  const tabs = ["Lịch tập", "Hội viên", "Báo cáo"];
  return (
    <div className="p-preview">
      <div className="p-preview-top">
        <span>
          <Activity size={18} /> pulse<span className="p-dot">.</span>
        </span>
        <span className="p-preview-label">BẢN XEM TRƯỚC MINH HỌA</span>
        <Bell size={16} />
      </div>
      <div className="p-preview-body">
        <aside aria-hidden="true">
          <LayoutGrid />
          <CalendarDays />
          <Users />
          <TrendingUp />
        </aside>
        <div className="p-preview-main">
          <div className="p-preview-heading">
            <div>
              <small>KHÔNG GIAN CỦA BẠN</small>
              <h3>Mỗi ngày, tốt hơn một chút.</h3>
            </div>
            <span className="p-avatar">P</span>
          </div>
          <div
            className="p-preview-tabs"
            role="tablist"
            aria-label="Xem trước nền tảng"
          >
            {tabs.map((name, i) => (
              <button
                key={name}
                id={`preview-tab-${i}`}
                role="tab"
                aria-selected={tab === i}
                aria-controls="preview-panel"
                onClick={() => setTab(i)}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="preview-panel"
            aria-labelledby={`preview-tab-${tab}`}
          >
            {tab === 0 ? (
              <>
                <div className="p-week">
                  {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d, i) => (
                    <span className={i === 2 ? "selected" : ""} key={d}>
                      {d}
                      <b>{14 + i}</b>
                    </span>
                  ))}
                </div>
                <div className="p-workout">
                  <span>
                    06:30
                    <br />
                    <small>07:30</small>
                  </span>
                  <div>
                    <b>Strength & Conditioning</b>
                    <small>
                      <Dumbbell size={12} /> Phòng Functional · Coach Minh
                    </small>
                  </div>
                  <span className="p-status">Đã đăng ký</span>
                </div>
                <div className="p-workout muted">
                  <span>
                    17:00
                    <br />
                    <small>18:00</small>
                  </span>
                  <div>
                    <b>Yoga Flow</b>
                    <small>
                      <HeartPulse size={12} /> Studio 02 · Coach Linh
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </div>
              </>
            ) : tab === 1 ? (
              <div className="p-member-demo">
                <ShieldCheck size={34} />
                <small>THẺ HỘI VIÊN MINH HỌA</small>
                <h3>
                  Một tài khoản.
                  <br />
                  Cả thế giới vận động.
                </h3>
                <span>Gói tập · Hồ sơ · Lịch cá nhân</span>
              </div>
            ) : (
              <div className="p-report-demo">
                <small>LƯỢT THAM GIA · DỮ LIỆU MINH HỌA</small>
                <div
                  className="p-bars"
                  aria-label="Biểu đồ minh họa lượt tham gia tăng qua sáu tháng"
                >
                  {[38, 54, 44, 70, 62, 90].map((h, i) => (
                    <div key={i}>
                      <span style={{ height: h }} />
                      <small>T{i + 1}</small>
                    </div>
                  ))}
                </div>
                <p>Nhìn rõ hoạt động. Lên kế hoạch tốt hơn.</p>
              </div>
            )}
          </div>
          <div className="p-preview-bottom">
            <span className="p-live-dot" /> Một nơi cho mọi hoạt động của bạn{" "}
            <ArrowUpRight size={15} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Landing({ signedIn }: { signedIn: boolean }) {
  const [menu, setMenu] = useState(false);
  const hero = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = "Pulse Sports Center · Find your next level";
    window.scrollTo(0, 0);
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("p-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => {
      el.classList.add("p-reveal-ready");
      observer.observe(el);
    });
    let frame = 0;
    const scroll = () => {
      if (frame || matchMedia("(prefers-reduced-motion: reduce)").matches)
        return;
      frame = requestAnimationFrame(() => {
        hero.current?.style.setProperty(
          "--parallax",
          `${Math.min(window.scrollY * 0.16, 100)}px`,
        );
        frame = 0;
      });
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  const start = signedIn ? "/login" : "/register";
  return (
    <div className="pulse-public">
      <a className="p-skip" href="#main">
        Đến nội dung chính
      </a>
      <header className="p-header">
        <div className="p-container p-nav">
          <Link to="/" aria-label="Pulse Sports Center — Trang chủ">
            <Brand />
          </Link>
          <nav
            id="public-navigation"
            className={menu ? "is-open" : ""}
            aria-label="Điều hướng chính"
          >
            <a href="#platform" onClick={() => setMenu(false)}>
              Nền tảng
            </a>
            <a href="#sports" onClick={() => setMenu(false)}>
              Bộ môn
            </a>
            <a href="#features" onClick={() => setMenu(false)}>
              Tính năng
            </a>
            <a href="#community" onClick={() => setMenu(false)}>
              Cộng đồng
            </a>
          </nav>
          <div className="p-nav-actions">
            <Link className="p-login-link" to="/login">
              {signedIn ? "Không gian của tôi" : "Đăng nhập"}
            </Link>
            <Link className="p-button p-small" to={start}>
              Bắt đầu ngay <ArrowUpRight size={16} />
            </Link>
            <button
              className="p-menu"
              aria-label={menu ? "Đóng menu" : "Mở menu"}
              aria-controls="public-navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="p-hero" ref={hero}>
          <SportFilm />
          <div className="p-hero-shade" />
          <div className="p-hero-grid" aria-hidden="true" />
          <div className="p-container p-hero-inner">
            <div className="p-hero-copy">
              <div className="p-eyebrow">
                <span className="p-live-dot" /> KHỞI ĐẦU MỚI. NĂNG LƯỢNG MỚI.
              </div>
              <h1>
                Đánh thức
                <br />
                giới hạn.
                <br />
                <em>Bứt phá cùng nhau.</em>
              </h1>
              <p>
                Mỗi buổi tập là một bước tiến. Kết nối với lớp học,
                <br className="p-desktop-break" /> huấn luyện viên và cộng đồng
                của bạn — cùng Pulse.
              </p>
              <div className="p-hero-actions">
                <Link to={start} className="p-button">
                  Bắt đầu hành trình <ArrowUpRight size={19} />
                </Link>
                <a className="p-button p-button-ghost" href="#platform">
                  <Play size={15} fill="currentColor" /> Khám phá nền tảng
                </a>
              </div>
              <div className="p-hero-note">
                <ShieldCheck size={16} /> Đăng ký tài khoản miễn phí{" "}
                <span>·</span> Sẵn sàng cho bước đầu tiên
              </div>
            </div>
            <div className="p-hero-side">
              <span>01 / THE START OF SOMETHING GREAT</span>
              <div className="p-hero-card">
                <span className="p-card-icon">
                  <Activity size={23} />
                </span>
                <div>
                  <small>ONE PLATFORM. EVERY MOVE.</small>
                  <strong>Giữ nhịp đam mê.</strong>
                </div>
                <ArrowUpRight size={18} />
              </div>
            </div>
          </div>
          <div className="p-hero-bottom p-container">
            <span>TRAIN SMART. MOVE BETTER. GO FURTHER.</span>
            <a href="#sports">
              CUỘN ĐỂ KHÁM PHÁ <ArrowDown size={15} />
            </a>
          </div>
        </section>
        <div className="p-trust">
          <div className="p-container">
            <span>
              MỘT NHỊP KẾT NỐI.
              <br />
              <strong>CHO CẢ TRUNG TÂM.</strong>
            </span>
            {[
              { icon: Users, name: "Hội viên" },
              { icon: Dumbbell, name: "Huấn luyện viên" },
              { icon: ShieldCheck, name: "Quản lý trung tâm" },
              { icon: HeartPulse, name: "Lễ tân" },
            ].map(({ icon: Icon, name }) => (
              <div key={name}>
                <Icon size={21} />
                {name}
              </div>
            ))}
          </div>
        </div>
        <section id="sports" className="p-section p-container" data-reveal>
          <div className="p-section-head">
            <div>
              <div className="p-eyebrow">01 / FIND YOUR MOVEMENT</div>
              <h2>
                Đam mê của bạn.
                <br />
                <span>Không gian của bạn.</span>
              </h2>
            </div>
            <p>
              Từ những bước khởi đầu đến cột mốc mới.
              <br />
              Tìm nhịp vận động khiến bạn muốn quay lại mỗi ngày.
            </p>
          </div>
          <div className="p-sports-grid">
            {[
              {
                image: photos.strength,
                title: "SỨC MẠNH",
                sub: "Strength & Conditioning",
                num: "01",
              },
              {
                image: photos.yoga,
                title: "CÂN BẰNG",
                sub: "Yoga & Mindfulness",
                num: "02",
              },
              {
                image: photos.basketball,
                title: "ĐỒNG ĐỘI",
                sub: "Team Sports",
                num: "03",
              },
            ].map((s) => (
              <Link to={start} className="p-sport-card" key={s.num}>
                <img src={s.image} alt={s.sub} loading="lazy" />
                <span className="p-sport-number">/ {s.num}</span>
                <div>
                  <small>{s.sub}</small>
                  <h3>{s.title}</h3>
                </div>
                <span className="p-sport-arrow">
                  <ArrowUpRight />
                </span>
              </Link>
            ))}
          </div>
          <p className="p-section-caption">
            Khám phá tinh thần thể thao cùng Pulse. Lớp học khả dụng được hiển
            thị trong tài khoản.
          </p>
        </section>
        <section id="features" className="p-feature-section">
          <div className="p-container p-section" data-reveal>
            <div className="p-section-head">
              <div>
                <div className="p-eyebrow">
                  02 / LESS FRICTION. MORE ACTION.
                </div>
                <h2>
                  Tập trung vào đam mê.
                  <br />
                  <span>Pulse lo phần kết nối.</span>
                </h2>
              </div>
              <a href="#platform" className="p-text-link">
                Xem cách Pulse hoạt động <ArrowUpRight size={18} />
              </a>
            </div>
            <div className="p-features">
              {features.map(({ icon: Icon, name, text, tag }, i) => (
                <article className="p-feature" key={name}>
                  <div className="p-feature-top">
                    <Icon size={27} />
                    <span>0{i + 1}</span>
                  </div>
                  <small>{tag}</small>
                  <h3>{name}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          id="platform"
          className="p-section p-container p-platform"
          data-reveal
        >
          <div>
            <div className="p-eyebrow">03 / YOUR PERSONAL SPORTS HUB</div>
            <h2>
              Cả hành trình.
              <br />
              Một <span>điểm chạm.</span>
            </h2>
            <p>
              Không cần ghi nhớ mọi lịch tập. Không bỏ lỡ thông tin gói thành
              viên. Pulse giúp việc quản lý thể thao trở nên gọn gàng và liền
              mạch.
            </p>
            <ul className="p-checks">
              <li>
                <Check /> Lịch học và đăng ký lớp tập trung
              </li>
              <li>
                <Check /> Hồ sơ hội viên, gói tập rõ ràng
              </li>
              <li>
                <Check /> Không gian riêng theo từng vai trò
              </li>
            </ul>
            <Link to={start} className="p-button">
              Khám phá không gian của bạn <ArrowUpRight size={18} />
            </Link>
          </div>
          <PlatformPreview />
        </section>
        <section className="p-stats-section">
          <div className="p-container" data-reveal>
            <div className="p-eyebrow">BUILT TO KEEP EVERYONE MOVING</div>
            <div className="p-stats">
              <Counter value={4} label="Vai trò cùng kết nối" />
              <Counter value={3} label="Luồng quản lý cốt lõi" />
              <Counter value={1} label="Không gian tập trung" />
              <div className="p-stat">
                <strong>∞</strong>
                <span>Tinh thần tiến về phía trước</span>
              </div>
            </div>
            <p>
              Hội viên & gói tập · Lớp học & lịch tập · Thanh toán & báo cáo
            </p>
          </div>
        </section>
        <section className="p-section p-container p-why" data-reveal>
          <div>
            <div className="p-eyebrow">04 / MADE FOR YOUR EVERYDAY</div>
            <h2>
              Bớt phức tạp.
              <br />
              <span>Thêm động lực.</span>
            </h2>
            <p>
              Một trải nghiệm dễ bắt đầu,
              <br />
              đủ rõ ràng để gắn bó mỗi ngày.
            </p>
          </div>
          <div>
            {[
              {
                title: "Mọi thứ ở đúng nơi",
                text: "Từ hồ sơ đến lịch học, thông tin được tổ chức nhất quán và dễ tìm.",
              },
              {
                title: "Kết nối cả đội ngũ",
                text: "Hội viên, huấn luyện viên, lễ tân và quản lý cùng một nhịp hoạt động.",
              },
              {
                title: "Sẵn sàng ở mọi màn hình",
                text: "Trải nghiệm gọn gàng trên máy tính, máy tính bảng và điện thoại.",
              },
            ].map((item, i) => (
              <article key={item.title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <ArrowUpRight size={22} />
              </article>
            ))}
          </div>
        </section>
        <section id="community" className="p-community p-section">
          <div className="p-container" data-reveal>
            <div className="p-eyebrow">05 / STRONGER TOGETHER</div>
            <h2>
              Khác mục tiêu.
              <br />
              <span>Chung một nhịp.</span>
            </h2>
            <div className="p-quotes">
              {[
                {
                  quote:
                    "Tôi muốn tìm lớp phù hợp và chủ động sắp xếp thời gian cho bản thân.",
                  role: "Góc nhìn hội viên",
                  initials: "HV",
                },
                {
                  quote:
                    "Tôi cần một lịch dạy rõ ràng để dành nhiều thời gian hơn cho học viên.",
                  role: "Góc nhìn huấn luyện viên",
                  initials: "HL",
                },
                {
                  quote:
                    "Tôi muốn kết nối hoạt động của trung tâm trong một không gian dễ quản lý.",
                  role: "Góc nhìn quản lý",
                  initials: "QL",
                },
              ].map((item) => (
                <figure key={item.role}>
                  <span className="p-quote-mark">“</span>
                  <blockquote>{item.quote}</blockquote>
                  <figcaption>
                    <span className="p-avatar">{item.initials}</span>
                    <div>
                      <strong>{item.role}</strong>
                      <small>Tình huống sử dụng minh họa</small>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
        <section className="p-container p-cta-wrap" data-reveal>
          <div className="p-cta">
            <div className="p-cta-track" aria-hidden="true" />
            <div>
              <div className="p-eyebrow">
                <Zap size={15} /> MAKE YOUR NEXT MOVE
              </div>
              <h2>
                Khởi đầu nhỏ.
                <br />
                Bứt phá lớn.
              </h2>
              <p>Hành trình tiếp theo của bạn bắt đầu ngay tại đây.</p>
            </div>
            <div>
              <Link className="p-button p-button-dark" to={start}>
                Tạo tài khoản miễn phí <ArrowUpRight size={20} />
              </Link>
              <span>Không cần thẻ thanh toán để tạo tài khoản.</span>
            </div>
          </div>
        </section>
      </main>
      <footer className="p-footer p-container">
        <div>
          <Link to="/" aria-label="Pulse — Trang chủ">
            <Brand />
          </Link>
          <p>Kết nối đam mê. Nâng tầm mỗi chuyển động.</p>
        </div>
        <div>
          <strong>KHÁM PHÁ</strong>
          <a href="#platform">Nền tảng</a>
          <a href="#sports">Bộ môn</a>
          <a href="#features">Tính năng</a>
        </div>
        <div>
          <strong>CÙNG PULSE</strong>
          <Link to="/register">Trở thành hội viên</Link>
          <Link to="/login">Đăng nhập</Link>
          <a href="#community">Cộng đồng</a>
        </div>
        <div>
          <strong>LUÔN KẾT NỐI</strong>
          <p>
            Cần tư vấn lớp học hoặc gói tập?
            <br />
            Liên hệ lễ tân tại trung tâm.
          </p>
          <span className="p-footer-motto">
            KEEP YOUR PULSE GOING. <ArrowUpRight size={18} />
          </span>
        </div>
        <div className="p-footer-bottom">
          <span>
            © {new Date().getFullYear()} Pulse Sports Center. All rights
            reserved.
          </span>
          <span>
            DESIGNED FOR THE WAY YOU MOVE <Activity size={14} />
          </span>
        </div>
      </footer>
    </div>
  );
}
