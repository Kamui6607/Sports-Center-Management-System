import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, MapPin, PhoneCall, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../../shared/api";
import { PulseLine } from "../../shared/PulseLine";
import { PulseMark } from "../../shared/PulseMark";
import "./landing.css";

/*
 * Trang giới thiệu công khai của phòng tập Pulse Sports Center — hướng nghệ thuật "One motif" (seed 1104067200).
 * Hình mẫu chủ đạo (motif): Khối Vòm Sân Vận Động & Vòng Bánh Tạ (Stadium Arch & Concentric Ring),
 * lấy cảm hứng từ khung giờ mở cửa xuyên suốt 05:30 – 22:00 và vòng mã QR động tự xoay mỗi 60 giây trên ứng dụng Pulse.
 * Dữ liệu lấy trực tiếp từ BE công khai: GET /center, GET /classes, GET /classes/goal-options,
 * GET /classes/:id/course-plan, GET /coaches/:id/profile, GET /products.
 */

const img = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=76`;

const MEDIA = {
  heroVideo: "https://assets.mixkit.co/videos/44414/44414-720.mp4",
  heroPoster: img("1534438327276-14e5300c3a48", 1400, 1600),
  floor: img("1593079831268-3381b0db4a77", 1200, 1500),
  weights: img("1558611848-73f7eb4001a1", 1000, 1250),
  rack: img("1576678927484-cc907957088c", 1000, 1250),
  choose: img("1583454110551-21f2fa2afe61", 1400, 1000),
  scan: img("1599058917212-d750089bc07e", 1400, 1000),
  progress: img("1517836357463-d25dfeac3438", 1400, 1000),
  yoga: img("1544367567-0f2fcb009e0b", 1200, 1500),
  outdoor: img("1546519638-68e109498ffc", 1200, 1500),
};

const CREDITS =
  "Ảnh minh họa: Unsplash (Unsplash License) · Video: Mixkit (Mixkit Stock Video Free License).";

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

type GoalOption = {
  code: string;
  label: string;
  description?: string;
};

type ClassQuote = {
  listPrice: number;
  totalSessions: number;
  unitPrice: number;
  sessionsPurchased: number;
  sessionsMissed: number;
  discount: number;
  amount: number;
  isLate: boolean;
};

type ClassRow = {
  id: string;
  name: string;
  description?: string | null;
  goal?: string | null;
  goalTags?: string[];
  fitness?: string | null;
  targetLevel?: string | null;
  classType?: "REGULAR" | "PREMIUM";
  areaType?: "INDOOR" | "OUTDOOR" | "POOL";
  capacity?: number;
  price?: string | number;
  coachId?: string;
  coach?: {
    id?: string;
    specialization?: string | null;
    experienceYears?: number | null;
    bio?: string | null;
    ratingAverage?: number;
    ratingCount?: number;
    user?: { fullName?: string; avatarUrl?: string | null };
  };
  summary?: {
    saleState?: string;
    saleStateLabel?: string;
    weekdays?: number[];
    startDate?: string;
    endDate?: string;
    currentPrice?: number;
    upcomingSessionCount?: number;
    mainSessionCount?: number;
    minRemainingSlots?: number;
    quote?: ClassQuote;
  };
  isSample?: boolean;
};

type CoursePlanResponse = {
  course?: {
    classId: string;
    className: string;
    goal?: string | null;
    fitness?: string | null;
    targetLevel?: string | null;
    areaType?: string | null;
    capacity?: number;
    totalSessions?: number;
    pastSessionCount?: number;
    weekdayLabels?: string[];
    rooms?: { id: string; name: string; areaType?: string }[];
    slots?: {
      weekday: number;
      weekdayLabel: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      roomName: string;
      sessionCount: number;
    }[];
  };
  sale?: {
    state?: string;
    label?: string;
    quote?: ClassQuote;
  };
};

type CoachPublicProfile = {
  coachProfileId: string;
  fullName: string;
  specialization?: string | null;
  experienceYears?: number | null;
  bio?: string | null;
  stats?: {
    openCourses: number;
    totalCourses: number;
    totalStudents: number;
    completedSessions: number;
  };
  rating?: {
    average: number;
    count: number;
  };
};

type ProductRow = {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  availableStock?: number;
  stockQuantity?: number;
  isActive?: boolean;
};

// ── Dữ liệu mẫu bổ trợ (hiển thị rõ nhãn "Lịch mẫu tham khảo" khi bộ lọc chưa có khóa tương ứng trong DB) ──
const FALLBACK_GOALS: GoalOption[] = [
  { code: "MUSCLE_GAIN", label: "Tăng cơ", description: "Phát triển khối cơ, tăng cân nạc." },
  { code: "STRENGTH", label: "Tăng sức mạnh", description: "Nâng mức tạ các bài compound." },
  { code: "WEIGHT_LOSS", label: "Giảm mỡ", description: "Đốt mỡ, kiểm soát cân nặng." },
  { code: "ENDURANCE", label: "Tăng sức bền", description: "Cải thiện tim mạch, thể lực." },
  { code: "MOBILITY", label: "Linh hoạt & tư thế", description: "Giãn cơ, cải thiện biên độ khớp." },
  { code: "REHAB", label: "Phục hồi chấn thương", description: "Tập phục hồi chức năng an toàn." },
];

const SAMPLE_COURSES: ClassRow[] = [
  {
    id: "sample-strength-compound",
    name: "Strength & Barbell Chuẩn Kỹ Thuật",
    goal: "Làm chủ Squat, Bench Press, Deadlift và tăng 15–20% mức tạ nền tảng sau 8 tuần.",
    goalTags: ["STRENGTH", "MUSCLE_GAIN"],
    fitness: "Strength",
    targetLevel: "INTERMEDIATE",
    classType: "PREMIUM",
    areaType: "INDOOR",
    capacity: 12,
    price: 1200000,
    coach: {
      specialization: "Strength & Conditioning",
      experienceYears: 6,
      bio: "Chuyên gia huấn luyện sức mạnh và kỹ thuật tạ rời.",
      ratingAverage: 5,
      ratingCount: 18,
      user: { fullName: "Trần Hoàng Minh" },
    },
    summary: {
      saleState: "ON_SALE",
      saleStateLabel: "Lịch mẫu tham khảo",
      weekdays: [2, 4, 6],
      startDate: "2026-11-03",
      endDate: "2026-12-26",
      currentPrice: 1050000,
      upcomingSessionCount: 21,
      mainSessionCount: 24,
      minRemainingSlots: 4,
      quote: {
        listPrice: 1200000,
        totalSessions: 24,
        unitPrice: 50000,
        sessionsPurchased: 21,
        sessionsMissed: 3,
        discount: 150000,
        amount: 1050000,
        isLate: true,
      },
    },
    isSample: true,
  },
  {
    id: "sample-yoga-mobility",
    name: "Yoga Flow & Mở Khớp Vai Lưng",
    goal: "Giải tỏa căng cứng cổ vai gáy cho dân văn phòng, tăng độ linh hoạt cột sống.",
    goalTags: ["MOBILITY", "REHAB", "WEIGHT_LOSS"],
    fitness: "Yoga",
    targetLevel: "BEGINNER",
    classType: "REGULAR",
    areaType: "INDOOR",
    capacity: 16,
    price: 720000,
    coach: {
      specialization: "Yoga, Pilates",
      experienceYears: 5,
      bio: "Chuyên gia Yoga phục hồi và kiểm soát nhịp thở.",
      ratingAverage: 5,
      ratingCount: 12,
      user: { fullName: "Nguyễn Văn Cường" },
    },
    summary: {
      saleState: "ON_SALE",
      saleStateLabel: "Lịch mẫu tham khảo",
      weekdays: [1, 3, 5],
      startDate: "2026-11-02",
      endDate: "2026-12-11",
      currentPrice: 720000,
      upcomingSessionCount: 18,
      mainSessionCount: 18,
      minRemainingSlots: 6,
      quote: {
        listPrice: 720000,
        totalSessions: 18,
        unitPrice: 40000,
        sessionsPurchased: 18,
        sessionsMissed: 0,
        discount: 0,
        amount: 720000,
        isLate: false,
      },
    },
    isSample: true,
  },
  {
    id: "sample-hiit-burn",
    name: "Metabolic HIIT & Đốt Mỡ Toàn Thân",
    goal: "Tăng nhịp tim vùng đốt mỡ, cải thiện VO2 Max và săn chắc cơ bụng sau 6 tuần.",
    goalTags: ["WEIGHT_LOSS", "ENDURANCE"],
    fitness: "HIIT",
    targetLevel: "INTERMEDIATE",
    classType: "REGULAR",
    areaType: "OUTDOOR",
    capacity: 15,
    price: 900000,
    coach: {
      specialization: "Functional & HIIT",
      experienceYears: 4,
      bio: "Huấn luyện viên thể lực cường độ cao và tim mạch.",
      ratingAverage: 4.9,
      ratingCount: 9,
      user: { fullName: "Lê Thanh Thảo" },
    },
    summary: {
      saleState: "ON_SALE",
      saleStateLabel: "Lịch mẫu tham khảo",
      weekdays: [2, 5, 7],
      startDate: "2026-10-29",
      endDate: "2026-12-10",
      currentPrice: 800000,
      upcomingSessionCount: 16,
      mainSessionCount: 18,
      minRemainingSlots: 5,
      quote: {
        listPrice: 900000,
        totalSessions: 18,
        unitPrice: 50000,
        sessionsPurchased: 16,
        sessionsMissed: 2,
        discount: 100000,
        amount: 800000,
        isLate: true,
      },
    },
    isSample: true,
  },
];

const ZONES = [
  {
    id: "indoor-strength",
    name: "Sàn Tạ & Cardio",
    area: "Khu trong nhà · Tầng 1",
    hours: "05:30 – 22:00 hằng ngày",
    photo: MEDIA.floor,
    secondaryPhoto: MEDIA.weights,
    alt: "Khu máy chạy bộ và sàn tạ tự do rộng rãi trong phòng tập",
    summary:
      "Hệ thống khung Squat Rack, tạ đòn chuẩn Olympic, dải tạ đơn tới 50kg và dàn máy chạy bộ hướng sáng tự nhiên.",
    specs: ["Sàn cao su giảm chấn 30mm", "Dàn máy Cardio & Rowing", "Tủ khóa từ & phòng tắm nóng lạnh"],
  },
  {
    id: "studio-functional",
    name: "Phòng Studio & HLV",
    area: "Khu lớp học · Tầng 2",
    hours: "Theo lịch khóa học đã duyệt",
    photo: MEDIA.yoga,
    secondaryPhoto: MEDIA.rack,
    alt: "Không gian tập Yoga và Functional ngập ánh sáng tự nhiên",
    summary:
      "Phòng tập tách biệt âm thanh dành riêng cho các khóa Yoga, Pilates, Rehab và nhóm nhỏ kèm sát cùng huấn luyện viên.",
    specs: ["Giới hạn 10–16 học viên/khóa", "Thảm TPE, bóng Bosu, dây TRX", "Bảng theo dõi nhịp tập trực quan"],
  },
  {
    id: "outdoor-athletic",
    name: "Khu Thể Lực Mở",
    area: "Sân tập thoáng · Khu mở",
    hours: "05:30 – 21:00 hằng ngày",
    photo: MEDIA.outdoor,
    secondaryPhoto: MEDIA.scan,
    alt: "Khu vực vận động thể lực và bài tập tốc độ",
    summary:
      "Không gian thoáng khí cho các bài đẩy xe trượt Sled, quăng dây thừng chiến đấu Battle Ropes, lật lốp và biến tốc.",
    specs: ["Đường chạy cỏ nhân tạo 25m", " Khu Battle Ropes & Kettlebell", "Trạm cấp nước điện giải tại chỗ"],
  },
];

const STAGES = [
  {
    id: "enroll",
    tab: "Chọn gói & VietQR",
    titleLine1: "Chọn gói tập,",
    titleLine2: "quét VietQR.",
    photo: MEDIA.choose,
    alt: "Hội viên chọn mức tạ trên giá đỡ trong phòng tập",
    summary:
      "Mua gói tập tự do hoặc giữ chỗ khóa học cùng HLV ngay trên ứng dụng. Hệ thống tự động giữ chỗ 15 phút và đối soát thanh toán SePay tức thì.",
    bullet1: "Tự động khấu trừ tiền các buổi đã qua nếu bạn đăng ký vào khóa muộn.",
    bullet2: "Hóa đơn lưu giá gốc, ưu đãi và số buổi thực nhận minh bạch.",
  },
  {
    id: "qrpass",
    tab: "Thẻ QR 60 giây",
    titleLine1: "Mở thẻ QR động,",
    titleLine2: "xoay mỗi 60 giây.",
    photo: MEDIA.scan,
    alt: "Hội viên tập dây thừng chiến đấu cường độ cao",
    summary:
      "Không cần thẻ nhựa. Mở ứng dụng Pulse tại quầy lễ tân, mã JWT QR tự làm mới mỗi 60 giây giúp chống chụp màn hình và ghi nhận điểm danh luôn.",
    bullet1: "Một mã duy nhất dùng cho cả vào cửa tập tự do và điểm danh lớp HLV.",
    bullet2: "Tự động cộng dồn ngày dùng khi bạn gia hạn gói tập sớm.",
  },
  {
    id: "schedule",
    tab: "Lịch & Điểm danh",
    titleLine1: "Lịch học cố định,",
    titleLine2: "điểm danh tự động.",
    photo: MEDIA.floor,
    alt: "Không gian sàn tập buổi sáng sớm",
    summary:
      "Xem trọn khung lịch lặp lại theo tuần (ví dụ Thứ 2, Thứ 4, Thứ 6) và trạng thái từng buổi: Đã điểm danh, Sắp diễn ra hoặc Lịch dạy bù.",
    bullet1: "Nếu HLV bận đột xuất, hệ thống bắt buộc xếp buổi dạy bù hoặc hoàn tiền 100% buổi đó.",
    bullet2: "Nhắc lịch tự động trước giờ vào lớp và cảnh báo chuyên cần rõ ràng.",
  },
  {
    id: "progress",
    tab: "Lộ trình & Quầy đồ",
    titleLine1: "Lộ trình riêng,",
    titleLine2: "nhận đồ tại quầy.",
    photo: MEDIA.progress,
    alt: "Hội viên thực hiện bài nâng tạ đòn trên sàn",
    summary:
      "Sau mỗi buổi, HLV cập nhật giáo án và nhận xét riêng cho từng khóa. Cần nước, khăn tập hay Whey? Đặt trên app, lấy ngay tại quầy bằng mã nhận hàng.",
    bullet1: "Chỉ học viên đã hoàn thành khóa học mới được gửi đánh giá sao cho HLV.",
    bullet2: "Mã nhận hàng một lần (SCMS-PICKUP) bảo vệ đơn đồ tập tại quầy lễ tân.",
  },
];

// ── Giờ mở cửa theo múi giờ TP.HCM (Asia/Ho_Chi_Minh) ──
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
function saigonNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hh = Number(get("hour")) % 24;
  const mm = Number(get("minute"));
  return {
    minutes: hh * 60 + mm,
    sunday: get("weekday") === "Sun",
    clockText: `${hh < 10 ? "0" + hh : hh}:${mm < 10 ? "0" + mm : mm}`,
  };
}
const hhmm = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h < 10 ? "0" + h : h}:${min < 10 ? "0" + min : min}`;
};
const span = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ""}` : `${m} phút`;

function openStatus(hours: Hours | null, now: { minutes: number; sunday: boolean }) {
  const effective = hours ?? { open: 5 * 60 + 30, close: 22 * 60 };
  const close = now.sunday && effective.sundayClose ? effective.sundayClose : effective.close;
  const totalOpenWindow = Math.max(1, close - effective.open);
  if (now.minutes >= effective.open && now.minutes < close) {
    const progress = Math.min(100, Math.max(4, Math.round(((now.minutes - effective.open) / totalOpenWindow) * 100)));
    return {
      open: true,
      progress,
      headline: "Đang mở cửa đón hội viên",
      text: `Đang mở cửa · đóng lúc ${hhmm(close)}, còn ${span(close - now.minutes)}`,
    };
  }
  const until =
    now.minutes < effective.open
      ? effective.open - now.minutes
      : 24 * 60 - now.minutes + effective.open;
  return {
    open: false,
    progress: 100,
    headline: `Mở cửa lại lúc ${hhmm(effective.open)}`,
    text: `Đang nghỉ đêm · mở lại lúc ${hhmm(effective.open)}, sau ${span(until)}`,
  };
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
const LEVEL: Record<string, string> = {
  BEGINNER: "Người mới",
  INTERMEDIATE: "Trung bình",
  ADVANCED: "Nâng cao",
};
const AREA: Record<string, string> = {
  INDOOR: "Trong nhà",
  OUTDOOR: "Ngoài trời",
  POOL: "Hồ bơi",
};
const money = (v?: number | string | null) =>
  v == null || v === "" ? "Liên hệ" : new Intl.NumberFormat("vi-VN").format(Number(v)) + " đ";
const dayMonth = (iso?: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
const phone = (p: string) => p.replace(/\D/g, "").replace(/^(\d{4})(\d{3})(\d+)$/, "$1 $2 $3");

function useReveal(deps: unknown[]) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.classList.add("js");
    const els = root.current?.querySelectorAll("[data-reveal]:not(.is-in)");
    if (!els?.length) return;
    const revealAll = () => {
      root.current?.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => el.classList.add("is-in"));
    };
    if (!("IntersectionObserver" in window)) {
      revealAll();
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
      { rootMargin: "0px 0px 12% 0px", threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      if (window.scrollY > 80) {
        revealAll();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return root;
}

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
    const io = new IntersectionObserver(([e]) =>
      e.isIntersecting ? void v.play().catch(() => {}) : v.pause(),
    );
    io.observe(v);
    return () => io.disconnect();
  }, [motion]);
  return motion ? (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={label}
    />
  ) : (
    <img src={poster} alt={label} width={1400} height={1600} fetchPriority="high" />
  );
}

export default function GymLanding({ signedIn }: { signedIn: boolean }) {
  // ── 1. Fetch dữ liệu công khai từ BE ──
  const centerQuery = useQuery({
    queryKey: ["public", "center"],
    queryFn: ({ signal }) => api<Center>("GET /center", { signal }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const classesQuery = useQuery({
    queryKey: ["public", "classes"],
    queryFn: ({ signal }) =>
      api<ClassRow[]>("GET /classes", {
        query: { status: "APPROVED", isActive: "true", limit: "30" },
        signal,
      }),
    staleTime: 60_000,
    retry: 1,
  });

  const goalsQuery = useQuery({
    queryKey: ["public", "goal-options"],
    queryFn: ({ signal }) => api<GoalOption[]>("GET /classes/goal-options", { signal }),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const productsQuery = useQuery({
    queryKey: ["public", "products"],
    queryFn: ({ signal }) =>
      api<ProductRow[]>("GET /products", {
        query: { isActive: "true", limit: "12" },
        signal,
      }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const c = centerQuery.data?.data;
  const now = useClock();
  const status = openStatus(parseHours(c?.openingHours), now);

  // Lọc bỏ các bản ghi rác sinh ra từ bộ test tự động (e2e-*)
  const realClasses = useMemo(() => {
    const raw = classesQuery.data?.data ?? [];
    return raw.filter(
      (k) =>
        !/^e2e[-_]/i.test(k.name) &&
        !/^e2e[-_]/i.test(k.fitness ?? "") &&
        (k.summary?.saleState === "ON_SALE" || (k.summary?.upcomingSessionCount ?? 0) > 0),
    );
  }, [classesQuery.data]);

  // Kết hợp khóa học thật từ DB với khóa mẫu (đánh dấu rõ isSample) để bộ lọc mục tiêu luôn sống động
  const allCourses = useMemo(() => {
    return [...realClasses, ...SAMPLE_COURSES];
  }, [realClasses]);

  const goalOptions = useMemo(() => {
    const fromApi = goalsQuery.data?.data ?? [];
    return fromApi.length ? fromApi.slice(0, 7) : FALLBACK_GOALS;
  }, [goalsQuery.data]);

  const realProducts = useMemo(() => {
    const raw = productsQuery.data?.data ?? [];
    return raw.filter((p) => !/^e2e[-_]/i.test(p.name) && !/^demo\s+/i.test(p.name)).slice(0, 6);
  }, [productsQuery.data]);

  // ── 2. State tương tác trên trang ──
  // Hero ca tập
  const [shiftIndex, setShiftIndex] = useState<number>(() => {
    if (now.minutes < 11 * 60) return 0;
    if (now.minutes < 17 * 60) return 1;
    return 2;
  });

  // Section 1: Khu vực không gian
  const [zoneIdx, setZoneIdx] = useState(0);
  const activeZone = ZONES[zoneIdx] ?? ZONES[0];

  // Section 2 ("One live thing"): Chế độ khám phá khóa học vs Tính học phí vào muộn
  const [showcaseMode, setShowcaseMode] = useState<"courses" | "calculator">("courses");
  const [selectedGoal, setSelectedGoal] = useState<string>("ALL");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("sample-strength-compound");
  const [simMissedSessions, setSimMissedSessions] = useState<number>(2);

  const filteredCourses = useMemo(() => {
    if (selectedGoal === "ALL") return allCourses;
    return allCourses.filter((item) => item.goalTags?.includes(selectedGoal));
  }, [allCourses, selectedGoal]);

  const activeCourse = useMemo(() => {
    return (
      filteredCourses.find((item) => item.id === selectedCourseId) ??
      filteredCourses[0] ??
      allCourses[0]
    );
  }, [filteredCourses, selectedCourseId, allCourses]);

  // Fetch chi tiết lịch trình thật từ GET /classes/:id/course-plan khi chọn khóa học thật trong DB
  const coursePlanQuery = useQuery({
    queryKey: ["public", "course-plan", activeCourse?.id],
    queryFn: ({ signal }) =>
      api<CoursePlanResponse>(`GET /classes/${activeCourse?.id}/course-plan`, { signal }),
    enabled: Boolean(activeCourse && !activeCourse.isSample),
    staleTime: 60_000,
    retry: 1,
  });

  // Fetch hồ sơ công khai của HLV thật từ GET /coaches/:id/profile
  const primaryCoachId = realClasses[0]?.coach?.id || realClasses[0]?.coachId;
  const coachProfileQuery = useQuery({
    queryKey: ["public", "coach-profile", primaryCoachId],
    queryFn: ({ signal }) =>
      api<CoachPublicProfile>(`GET /coaches/${primaryCoachId}/profile`, { signal }),
    enabled: Boolean(primaryCoachId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Section 3: Thanh kéo 4 bước ứng dụng + đồng hồ đếm ngược QR 60 giây
  const [stageIdx, setStageIdx] = useState(0);
  const [qrSeconds, setQrSeconds] = useState(54);
  const [qrSeed, setQrSeed] = useState(1);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setQrSeconds((prev) => {
        if (prev <= 1) {
          setQrSeed((s) => s + 1);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Section 5: Chọn thử đồ tập nhận tại quầy
  const [pickedProductIds, setPickedProductIds] = useState<string[]>(["prd-yogamat-001", "prd-bottle-001"]);
  const toggleProduct = (id: string) => {
    setPickedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };
  const pickedTotal = useMemo(() => {
    return realProducts
      .filter((p) => pickedProductIds.includes(p.id))
      .reduce((sum, p) => sum + Number(p.price || 0), 0);
  }, [realProducts, pickedProductIds]);

  // Section 6: Phiếu hẹn tư vấn tại phòng tập
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorGoal, setVisitorGoal] = useState("Tăng cơ & Sức mạnh");
  const [visitorShift, setVisitorShift] = useState("Ca sáng (05:30 – 09:00)");
  const [couponSubmitted, setCouponSubmitted] = useState(false);

  // Trạng thái cuộn trang cho Header bám dính (Sticky Header) & Nút cuộn nhanh lên đầu trang
  const [isScrolled, setIsScrolled] = useState(false);
  const [showToTop, setShowToTop] = useState(false);
  const [scrollRatio, setScrollRatio] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setIsScrolled(y > 28);
      setShowToTop(y > 320);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setScrollRatio(Math.min(1, Math.max(0, y / maxScroll)));
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const root = useReveal([
    centerQuery.status,
    classesQuery.status,
    productsQuery.status,
    selectedGoal,
    showcaseMode,
  ]);

  useEffect(() => {
    document.title = "Pulse Sports Center · Phòng tập, Khóa học HLV & Ứng dụng thẻ QR động";
  }, []);

  const mapLink =
    c?.mapLink ||
    "https://www.google.com/maps/search/?api=1&query=346%20T%C3%B4%20K%C3%BD%2C%20Trung%20M%E1%BB%B9%20T%C3%A2y%2C%20H%E1%BB%93%20Ch%C3%AD%20Minh";
  const hotlineRaw = c?.hotline || "0889555559";
  const hotlineFormatted = phone(hotlineRaw);
  const centerName = c?.name || "Pulse Sports Center · Tô Ký";
  const centerAddress = c?.address || "346 Tô Ký, Trung Mỹ Tây, TP. Hồ Chí Minh";
  const centerHours = c?.openingHours || "05:30 – 22:00 hằng ngày";

  const handleCouponSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCouponSubmitted(true);
    if (c?.email) {
      const subject = encodeURIComponent(`Đăng ký lịch hẹn tham quan & tư vấn — ${visitorName || "Hội viên mới"}`);
      const body = encodeURIComponent(
        `Họ và tên: ${visitorName}\nSố điện thoại: ${visitorPhone}\nMục tiêu ưu tiên: ${visitorGoal}\nKhung giờ dự kiến: ${visitorShift}\nTrung tâm: ${centerName} (${centerAddress})`,
      );
      window.location.href = `mailto:${c.email}?subject=${subject}&body=${body}`;
    }
  };

  const at = (i: number) => ({ "--i": i }) as CSSProperties;

  // Tính toán học phí vào muộn cho khóa đang chọn
  const calcTotalSessions = activeCourse?.summary?.mainSessionCount || activeCourse?.summary?.quote?.totalSessions || 20;
  const calcListPrice = Number(activeCourse?.summary?.quote?.listPrice || activeCourse?.price || 800000);
  const calcUnitPrice = Math.round(calcListPrice / Math.max(1, calcTotalSessions));
  const maxMissedAllowed = Math.max(1, Math.floor(calcTotalSessions * 0.45));
  const clampedMissed = Math.min(simMissedSessions, maxMissedAllowed);
  const calcRemainingSessions = Math.max(1, calcTotalSessions - clampedMissed);
  const calcDiscount = clampedMissed * calcUnitPrice;
  const calcFinalAmount = Math.max(0, calcListPrice - calcDiscount);

  const livePlan = coursePlanQuery.data?.data?.course;
  const liveCoach = coachProfileQuery.data?.data;

  const SHIFTS = [
    {
      label: "Ca sáng · 05:30",
      title: "Khởi động trước giờ làm",
      desc: "Sàn tạ tự do thông thoáng, ánh sáng tự nhiên và các lớp Yoga / Gym nền tảng khung 06:00 – 09:00.",
      crowd: "Mật độ thoáng · Máy sẵn sàng",
    },
    {
      label: "Ca trưa · 11:00",
      title: "Tập kỹ thuật & Phục hồi",
      desc: "Khung giờ yên tĩnh lý tưởng để tập kèm sát 1-kèm-nhóm nhỏ cùng HLV hoặc giãn cơ Mobility.",
      crowd: "Mật độ rất thoáng · Yên tĩnh",
    },
    {
      label: "Ca tối · 17:00",
      title: "Năng lượng sau giờ tan tầm",
      desc: "Sôi động các khóa Strength, HIIT đốt mỡ và cộng đồng hội viên tập luyện tới 22:00 đêm.",
      crowd: "Không khí sôi động · Đủ thiết bị",
    },
  ];
  const currentShift = SHIFTS[shiftIndex] ?? SHIFTS[0];
  const currentStage = STAGES[stageIdx] ?? STAGES[0];

  return (
    <div className="gl" ref={root}>
      <a className="gl-skip" href="#khong-gian">
        Bỏ qua tới nội dung chính
      </a>

      {/* ── THANH HEADER BÁM DÍNH (STICKY HEADER ĐI THEO KHI CUỘN TRANG) ── */}
      <header className={"gl-topbar" + (isScrolled ? " is-scrolled" : "")}>
        <nav className="gl-nav" aria-label="Điều hướng chính">
          <div className="gl-nav-left">
            <Link to="/" className="gl-word" aria-label="Pulse Sports Center — trang chủ">
              <PulseMark size={30} className="gl-word-mark" />
              pulse<span>.</span>
            </Link>
            <span className="gl-nav-status gl-hide-sm">
              <i className={status.open ? "is-open" : ""} aria-hidden="true" />
              {status.open ? "Đang mở cửa" : "Mở cửa 05:30"}
            </span>
          </div>

          <div className="gl-nav-links">
            <a href="#khong-gian" className="gl-hide-sm">
              Không gian
            </a>
            <a href="#khoa-hoc" className="gl-hide-sm">
              Khóa học
            </a>
            <a href="#quy-inh-app" className="gl-hide-sm">
              Ứng dụng
            </a>
            <a href="#cua-hang" className="gl-hide-sm">
              Cửa hàng
            </a>
            <a href="#lien-he" className="gl-hide-sm">
              Liên hệ
            </a>
            {signedIn ? (
              <Link to="/manager/dashboard" className="gl-nav-cta">
                Vào trang quản lý
              </Link>
            ) : (
              <Link to="/login" className="gl-nav-cta">
                Đăng nhập
              </Link>
            )}
          </div>
        </nav>
        <div
          className="gl-scroll-progress"
          style={{ transform: `scaleX(${scrollRatio})` }}
          aria-hidden="true"
        />
      </header>

      <main>
        {/* ── MÀN ĐẦU (HERO): Giant Cropped Motif (Vòm Sân Vận Động & Vòng Đồng Hồ Sài Gòn) ── */}
        <section className="gl-hero" aria-label="Giới thiệu trung tâm">
          <div className="gl-hero-grid">
          <div className="gl-hero-copy">
            <h1 className="gl-h1">
              <span className="gl-line">
                <span data-line style={at(0)}>
                  Sàn tập mở sớm,
                </span>
              </span>
              <span className="gl-line">
                <span data-line style={at(1)}>
                  học cùng HLV.
                </span>
              </span>
            </h1>

            <p className="gl-lead gl-load" style={{ "--d": "360ms" } as CSSProperties}>
              Tổ hợp gym tự do, khóa học có lộ trình và quầy đồ tập tại{" "}
              <strong>{centerAddress}</strong>. Mua gói bằng VietQR, vào cửa bằng mã QR động 60 giây
              và được trừ tiền những buổi đã qua nếu bạn vào khóa muộn.
            </p>

            <div className="gl-actions gl-load" style={{ "--d": "460ms" } as CSSProperties}>
              <a className="gl-btn" href="#khoa-hoc">
                Khám phá khóa học đang mở <ArrowDown size={18} aria-hidden="true" />
              </a>
              <a className="gl-btn ghost" href={mapLink} target="_blank" rel="noreferrer">
                Chỉ đường tới phòng tập <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>

            <div className="gl-hero-facts gl-load" style={{ "--d": "540ms" } as CSSProperties}>
              <div className="gl-fact-pill">
                <span className={"gl-dot" + (status.open ? " is-open" : "")} aria-hidden="true" />
                <span>{status.text}</span>
              </div>
              <div className="gl-hero-metrics">
                <div>
                  <strong>{centerHours.split(" ")[0] || "05:30"} – 22:00</strong>
                  <span>Khung giờ mở cửa mỗi ngày</span>
                </div>
                <div>
                  <strong>{realClasses.length > 0 ? `${realClasses.length} khóa thật` : "Đủ 3 cấp độ"}</strong>
                  <span>Đang mở tuyển sinh trên hệ thống</span>
                </div>
                <div>
                  <strong>60 giây</strong>
                  <span>Chu kỳ tự xoay mã thẻ QR động</span>
                </div>
              </div>
            </div>
          </div>

          {/* Khối Motif Vòm Đôi khổng lồ bên phải: Vòm Video + Bảng nhịp độ phòng tập trực tiếp (data-ui) */}
          <div className="gl-hero-motif">
            <div className="gl-arch-backdrop" aria-hidden="true" />
            <div className="gl-arch-video gl-shutter-hero">
              <LoopVideo
                src={MEDIA.heroVideo}
                poster={MEDIA.heroPoster}
                label="Hội viên tập tạ đòn trong không gian phòng tập Pulse"
              />
              <div className="gl-arch-scrim">
                <span>{centerName}</span>
                <strong>{now.clockText} · Giờ Sài Gòn</strong>
              </div>
            </div>

            <div className="gl-hero-dial" data-ui aria-label="Bảng trạng thái ca tập trực tiếp">
              <div className="gl-dial-head">
                <span className="gl-dial-state">
                  <i className={status.open ? "is-open" : ""} aria-hidden="true" />
                  {status.headline}
                </span>
                <span className="gl-dial-clock">{now.clockText}</span>
              </div>
              <div className="gl-dial-tabs" role="tablist" aria-label="Chọn ca tập trong ngày">
                {SHIFTS.map((s, idx) => (
                  <button
                    key={s.label}
                    type="button"
                    role="tab"
                    aria-selected={shiftIndex === idx}
                    className={shiftIndex === idx ? "is-active" : ""}
                    onClick={() => setShiftIndex(idx)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="gl-dial-body">
                <strong>{currentShift.title}</strong>
                <p>{currentShift.desc}</p>
                <div className="gl-dial-foot">
                  <span>{currentShift.crowd}</span>
                  <a href={`tel:${hotlineRaw.replace(/\s/g, "")}`}>Gọi {hotlineFormatted}</a>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

        {/* ── MỤC 1 (ABOUT): Inset panel, shaped portrait — Ba khu vực không gian, một thẻ hội viên ── */}
        <section className="gl-about-wrap" id="khong-gian" aria-labelledby="gl-about-h">
          <div className="gl-about-panel">
            <div className="gl-about-left">
              <h2 id="gl-about-h" className="gl-h2 light" data-reveal>
                Ba khu vực tập,
                <br />
                một thẻ hội viên.
              </h2>

              <div className="gl-zone-tabs" data-reveal style={at(1)} role="tablist" aria-label="Khu vực phòng tập">
                {ZONES.map((z, idx) => (
                  <button
                    key={z.id}
                    type="button"
                    role="tab"
                    aria-selected={zoneIdx === idx}
                    className={"gl-zone-tab" + (zoneIdx === idx ? " is-active" : "")}
                    onClick={() => setZoneIdx(idx)}
                  >
                    {z.name}
                  </button>
                ))}
              </div>

              <div className="gl-about-photos" data-reveal style={at(2)}>
                <figure className="gl-arch-portrait">
                  <img
                    src={activeZone.photo}
                    alt={activeZone.alt}
                    width={1200}
                    height={1500}
                    loading="lazy"
                  />
                </figure>
                <figure className="gl-arch-mini">
                  <img
                    src={activeZone.secondaryPhoto}
                    alt="Thiết bị tạ và không gian tập luyện chi tiết"
                    width={1000}
                    height={1250}
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>

            <div className="gl-about-right">
              <div className="gl-about-block" data-reveal style={at(1)}>
                <strong className="gl-subhead light">
                  {activeZone.name} · {activeZone.area}
                </strong>
                <p>{activeZone.summary}</p>
                <ul className="gl-motif-list light">
                  {activeZone.specs.map((spec) => (
                    <li key={spec}>{spec}</li>
                  ))}
                </ul>
              </div>

              <div className="gl-about-block" data-reveal style={at(2)}>
                <strong className="gl-subhead light">Thông tin vận hành trực tiếp từ trung tâm</strong>
                <p>
                  {c?.description ||
                    "Không gian được thiết kế tách biệt giữa khu tập tạ tự do, khu máy chạy cardio và phòng học chuyên đề cùng huấn luyện viên. Hội viên dùng chung một ứng dụng để vào cửa và theo dõi lịch."}
                </p>
                <dl className="gl-center-dl">
                  <div>
                    <dt>Địa chỉ phòng tập</dt>
                    <dd>{centerAddress}</dd>
                  </div>
                  <div>
                    <dt>Giờ mở cửa</dt>
                    <dd>{centerHours}</dd>
                  </div>
                  <div>
                    <dt>Hotline lễ tân</dt>
                    <dd>{hotlineFormatted}</dd>
                  </div>
                  {c?.parkingNote ? (
                    <div>
                      <dt>Bãi gửi xe</dt>
                      <dd>{c.parkingNote}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="gl-about-actions" data-reveal style={at(3)}>
                <a className="gl-btn" href={mapLink} target="_blank" rel="noreferrer">
                  Mở bản đồ đường đi <ArrowUpRight size={18} aria-hidden="true" />
                </a>
                <a className="gl-textlink light" href="#khoa-hoc">
                  Xem lịch khóa học tại trung tâm
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── MỤC 2 (SHOWCASE — ONE LIVE THING): Bộ lọc Mục tiêu & Trình khám phá Khóa học + Tính học phí vào muộn ── */}
        <section
          className={"gl-showcase" + (showcaseMode === "calculator" ? " is-alt" : "")}
          id="khoa-hoc"
          aria-labelledby="gl-showcase-h"
        >
          <div className="gl-showcase-top">
            <div>
              <h2 id="gl-showcase-h" className="gl-h2" data-reveal>
                {showcaseMode === "courses" ? (
                  <>
                    Chọn mục tiêu,
                    <br />
                    ra đúng khóa học.
                  </>
                ) : (
                  <>
                    Vào khóa muộn,
                    <br />
                    trừ tiền buổi vắng.
                  </>
                )}
              </h2>
              <p className="gl-showcase-sub" data-reveal style={at(1)}>
                {showcaseMode === "courses"
                  ? "Mỗi khóa học tại Pulse được gắn nhãn mục tiêu thể hình rõ ràng, công khai huấn luyện viên phụ trách, lịch học cố định hàng tuần và số chỗ trống thực tế."
                  : "Hệ thống tự động tính đơn giá từng buổi (Giá niêm yết ÷ Tổng số buổi). Khi bạn đăng ký sau ngày khai giảng, những buổi đã qua được trừ thẳng vào số tiền thanh toán."}
              </p>
            </div>

            <div className="gl-mode-switch" data-ui role="tablist" aria-label="Chế độ xem khóa học">
              <button
                type="button"
                role="tab"
                aria-selected={showcaseMode === "courses"}
                className={showcaseMode === "courses" ? "is-active" : ""}
                onClick={() => setShowcaseMode("courses")}
              >
                Lịch khóa học & Mục tiêu
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showcaseMode === "calculator"}
                className={showcaseMode === "calculator" ? "is-active" : ""}
                onClick={() => setShowcaseMode("calculator")}
              >
                Tính thử học phí vào muộn
              </button>
            </div>
          </div>

          {/* Bảng điều khiển tương tác lớn (One control, blown up) */}
          <div className="gl-showcase-board">
            <div className="gl-goal-bar" role="group" aria-label="Lọc khóa học theo mục tiêu">
              <button
                type="button"
                className={"gl-goal-chip" + (selectedGoal === "ALL" ? " is-active" : "")}
                onClick={() => setSelectedGoal("ALL")}
              >
                Tất cả mục tiêu ({allCourses.length})
              </button>
              {goalOptions.map((g) => (
                <button
                  key={g.code}
                  type="button"
                  className={"gl-goal-chip" + (selectedGoal === g.code ? " is-active" : "")}
                  onClick={() => setSelectedGoal(g.code)}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="gl-explorer-grid">
              {/* Cột trái: Danh sách khóa học khớp mục tiêu */}
              <div className="gl-course-list">
                {classesQuery.isPending ? (
                  <p className="gl-ui-note">Đang đồng bộ danh sách khóa học từ máy chủ…</p>
                ) : filteredCourses.length === 0 ? (
                  <div className="gl-ui-empty">
                    <p>Chưa có khóa học nào gắn trực tiếp mục tiêu này.</p>
                    <button
                      type="button"
                      className="gl-ui-reset"
                      onClick={() => setSelectedGoal("ALL")}
                    >
                      Xem tất cả khóa học đang mở
                    </button>
                  </div>
                ) : (
                  filteredCourses.map((course) => {
                    const isSelected = activeCourse?.id === course.id;
                    const priceNow = course.summary?.currentPrice ?? course.price;
                    const hasLateDiscount =
                      course.summary?.quote?.isLate && (course.summary.quote.discount ?? 0) > 0;
                    return (
                      <button
                        key={course.id}
                        type="button"
                        className={"gl-course-card" + (isSelected ? " is-selected" : "")}
                        onClick={() => setSelectedCourseId(course.id)}
                      >
                        <div className="gl-course-card-top">
                          <span className={"gl-badge" + (course.isSample ? " is-sample" : " is-live")}>
                            {course.isSample ? "Lịch mẫu tham khảo" : "Đang mở bán trực tiếp"}
                          </span>
                          <span className="gl-course-meta">
                            {course.fitness || "Gym"} ·{" "}
                            {course.targetLevel ? LEVEL[course.targetLevel] || course.targetLevel : "Mọi cấp độ"}
                          </span>
                        </div>
                        <strong className="gl-course-title">{course.name}</strong>
                        <p className="gl-course-coach">
                          HLV {course.coach?.user?.fullName || "Huấn luyện viên Pulse"}
                          {course.summary?.weekdays?.length
                            ? ` · ${course.summary.weekdays.map((d) => DAY[d]).join(", ")}`
                            : ""}
                          {course.summary?.startDate ? ` · Khai giảng ${dayMonth(course.summary.startDate)}` : ""}
                        </p>
                        <div className="gl-course-card-foot">
                          <span className="gl-course-slots">
                            Còn {course.summary?.minRemainingSlots ?? 8}/
                            {course.capacity ?? 12} chỗ trống ·{" "}
                            {course.summary?.upcomingSessionCount ?? 18} buổi sắp tới
                          </span>
                          <span className="gl-course-price">
                            {hasLateDiscount ? (
                              <del>{money(course.summary?.quote?.listPrice)}</del>
                            ) : null}
                            <b>{money(priceNow)}</b>
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Cột phải: Chi tiết lịch trình (GET /classes/:id/course-plan) & Mô phỏng học phí vào muộn */}
              {activeCourse ? (
                <div className="gl-course-inspector">
                  <div className="gl-inspector-head">
                    <div>
                      <span className="gl-inspector-tag">
                        {activeCourse.isSample
                          ? "Bản xem trước cấu trúc khóa học"
                          : "Dữ liệu trực tiếp từ GET /classes/:id/course-plan"}
                      </span>
                      <strong className="gl-inspector-title">{activeCourse.name}</strong>
                    </div>
                    <span className="gl-inspector-tier">
                      {activeCourse.classType === "PREMIUM" ? "Khóa Premium" : "Khóa Tiêu chuẩn"} ·{" "}
                      {activeCourse.areaType ? AREA[activeCourse.areaType] || activeCourse.areaType : "Trong nhà"}
                    </span>
                  </div>

                  <p className="gl-inspector-goal">
                    {activeCourse.goal ||
                      "Nắm vững kỹ thuật nền tảng, lịch tập cố định theo tuần và được huấn luyện viên theo dõi sát tiến độ."}
                  </p>

                  {/* Khung giờ lặp lại hàng tuần từ API course-plan */}
                  <div className="gl-inspector-slots">
                    <strong className="gl-inspector-label">Khung lịch cố định hàng tuần</strong>
                    {livePlan?.slots?.length ? (
                      <div className="gl-slot-pills">
                        {livePlan.slots.map((s) => (
                          <div key={`${s.weekday}-${s.startTime}`} className="gl-slot-pill">
                            <b>
                              {s.weekdayLabel} · {s.startTime} – {s.endTime}
                            </b>
                            <span>
                              Phòng {s.roomName} · {s.sessionCount} buổi còn lại
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="gl-slot-pills">
                        {(activeCourse.summary?.weekdays ?? [1, 3, 5]).map((wd) => (
                          <div key={wd} className="gl-slot-pill">
                            <b>{DAY[wd]} · 08:00 – 09:00</b>
                            <span>
                              {activeCourse.areaType === "OUTDOOR"
                                ? "Sân Thể Lực Mở"
                                : "Khu Tạ Tự Do A"}{" "}
                              · 60 phút/buổi
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bộ mô phỏng khấu trừ học phí vào muộn trực tiếp */}
                  <div className="gl-prorate-box" data-ui>
                    <div className="gl-prorate-top">
                      <strong>Mô phỏng chính sách trừ tiền khi vào khóa muộn</strong>
                      <span>
                        Đơn giá: {money(calcUnitPrice)}/buổi ({calcTotalSessions} buổi)
                      </span>
                    </div>

                    <label className="gl-prorate-slider-label" htmlFor="prorate-missed-range">
                      <span>
                        Giả sử khóa đã học qua: <b>{clampedMissed} buổi</b> (còn {calcRemainingSessions} buổi)
                      </span>
                      <span>Được trừ ngay: -{money(calcDiscount)}</span>
                    </label>
                    <input
                      id="prorate-missed-range"
                      type="range"
                      min={0}
                      max={maxMissedAllowed}
                      value={clampedMissed}
                      onChange={(e) => {
                        setSimMissedSessions(Number(e.target.value));
                        setShowcaseMode("calculator");
                      }}
                    />

                    <div className="gl-prorate-summary">
                      <div>
                        <small>Học phí trọn khóa</small>
                        <span>{money(calcListPrice)}</span>
                      </div>
                      <div>
                        <small>Khấu trừ {clampedMissed} buổi đã qua</small>
                        <span className="gl-discount-val">-{money(calcDiscount)}</span>
                      </div>
                      <div className="gl-prorate-final">
                        <small>Số tiền thực đóng ({calcRemainingSessions} buổi)</small>
                        <strong>{money(calcFinalAmount)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── MỤC 3 (HOW-IT-WORKS): Drag through the stages — 4 bước trải nghiệm trên ứng dụng Pulse ── */}
        <section className="gl-stages" id="quy-inh-app" aria-labelledby="gl-stages-h">
          <div className="gl-stages-split">
            {/* Nửa trái: Tiêu đề 2 dòng + câu chuyện + ảnh cắt vòm */}
            <div className="gl-stages-left">
              <h2 id="gl-stages-h" className="gl-h2 light" data-reveal>
                {currentStage.titleLine1}
                <br />
                {currentStage.titleLine2}
              </h2>

              <p className="gl-stages-lead" data-reveal style={at(1)}>
                {currentStage.summary}
              </p>

              <ul className="gl-motif-list light" data-reveal style={at(2)}>
                <li>{currentStage.bullet1}</li>
                <li>{currentStage.bullet2}</li>
              </ul>

              <figure className="gl-stage-photo" data-reveal style={at(3)}>
                <img
                  src={currentStage.photo}
                  alt={currentStage.alt}
                  width={1400}
                  height={1000}
                  loading="lazy"
                />
              </figure>
            </div>

            {/* Nửa phải: Giao diện ứng dụng thật ở kích thước chuẩn (data-ui) */}
            <div className="gl-stages-right">
              <div className="gl-app-stage" data-ui aria-live="polite">
                <div className="gl-app-bar">
                  <span className="gl-app-brand">pulse. mobile</span>
                  <span className="gl-app-step-tag">{currentStage.tab}</span>
                </div>

                {stageIdx === 0 ? (
                  <div className="gl-app-screen">
                    <div className="gl-app-card-head">
                      <span>Thanh toán chuyển khoản SePay · VietQR</span>
                      <strong>Giữ chỗ tự động 15:00</strong>
                    </div>
                    <div className="gl-app-invoice">
                      <div>
                        <span>Khóa đăng ký</span>
                        <b>{activeCourse?.name || "Gym cho người mới"}</b>
                      </div>
                      <div>
                        <span>Số buổi thanh toán</span>
                        <b>
                          {calcRemainingSessions}/{calcTotalSessions} buổi
                        </b>
                      </div>
                      <div>
                        <span>Khấu trừ vào muộn</span>
                        <b>-{money(calcDiscount)}</b>
                      </div>
                      <div className="gl-app-invoice-total">
                        <span>Tổng chuyển khoản</span>
                        <strong>{money(calcFinalAmount)}</strong>
                      </div>
                    </div>
                    <div className="gl-app-qr-preview">
                      <div className="gl-qr-matrix" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div>
                        <strong>Nội dung: SEVQR PULSE{1024 + qrSeed}</strong>
                        <p>Tự động kích hoạt thẻ hội viên & lịch học ngay khi ngân hàng báo có.</p>
                      </div>
                    </div>
                  </div>
                ) : stageIdx === 1 ? (
                  <div className="gl-app-screen">
                    <div className="gl-app-card-head">
                      <span>Thẻ hội viên điện tử · Chống chụp màn hình</span>
                      <strong>Hiệu lực: Đang hoạt động</strong>
                    </div>
                    <div className="gl-pass-ring-wrap">
                      <div className="gl-pass-ring">
                        <div className="gl-qr-matrix large" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <div className="gl-pass-meta">
                        <strong>Tự đổi mã sau {qrSeconds} giây</strong>
                        <p>
                          Đưa mã này tại quầy lễ tân hoặc máy quét của HLV để vào phòng tập và điểm
                          danh buổi học.
                        </p>
                        <button
                          type="button"
                          className="gl-app-mini-btn"
                          onClick={() => {
                            setQrSeconds(60);
                            setQrSeed((s) => s + 1);
                          }}
                        >
                          <RefreshCw size={15} aria-hidden="true" /> Làm mới mã QR ngay (Mã #{qrSeed})
                        </button>
                      </div>
                    </div>
                  </div>
                ) : stageIdx === 2 ? (
                  <div className="gl-app-screen">
                    <div className="gl-app-card-head">
                      <span>Chuyên cần & Bảo vệ quyền lợi học viên</span>
                      <strong>Tỷ lệ có mặt: 95%</strong>
                    </div>
                    <div className="gl-app-sessions">
                      <div className="gl-session-row is-done">
                        <span>Thứ 2 · 08:00</span>
                        <div>
                          <b>Buổi 1: Đánh giá thể lực & Squat cơ bản</b>
                          <small>Khu Tạ Tự Do A · Đã điểm danh đúng giờ</small>
                        </div>
                        <span className="gl-session-pill ok">Có mặt</span>
                      </div>
                      <div className="gl-session-row is-makeup">
                        <span>Thứ 5 · 18:00</span>
                        <div>
                          <b>Buổi 2: Lịch dạy bù (HLV dời lịch trước 24h)</b>
                          <small>Phòng Functional · Giữ nguyên quyền lợi buổi học</small>
                        </div>
                        <span className="gl-session-pill warn">Buổi bù</span>
                      </div>
                      <div className="gl-session-row">
                        <span>Thứ 6 · 08:00</span>
                        <div>
                          <b>Buổi 3: Kỹ thuật Bench Press & Kiểm soát bả vai</b>
                          <small>Khu Tạ Tự Do A · Sắp diễn ra</small>
                        </div>
                        <span className="gl-session-pill">Sắp tới</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="gl-app-screen">
                    <div className="gl-app-card-head">
                      <span>Lộ trình cá nhân & Nhận đồ tại quầy</span>
                      <strong>Cập nhật bởi HLV phụ trách</strong>
                    </div>
                    <div className="gl-app-plan">
                      <strong>Ghi chú huấn luyện sau buổi tập</strong>
                      <p>
                        “Giữ lưng trung lập tốt ở mức tạ 50kg. Tuần tới tăng thêm 2.5kg mỗi bên và bổ
                        sung 15 phút giãn cơ khớp hông sau buổi tập.”
                      </p>
                    </div>
                    <div className="gl-app-pickup">
                      <div>
                        <span>Đơn đồ tập nhận tại quầy lễ tân</span>
                        <strong>Mã nhận: SCMS-PICKUP:ORD-208:8942</strong>
                        <small>Đưa mã hoặc 4 số cuối SĐT tại quầy để nhận nước & khăn tập.</small>
                      </div>
                      <Check size={22} aria-hidden="true" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Thanh trượt (Range Slider) điều khiển cả hai nửa màn hình */}
          <div className="gl-stages-control" data-ui>
            <label htmlFor="gl-stage-slider" className="gl-sr-only">
              Kéo để xem từng bước sử dụng ứng dụng Pulse
            </label>
            <input
              id="gl-stage-slider"
              className="gl-range"
              type="range"
              min={0}
              max={STAGES.length - 1}
              step={1}
              value={stageIdx}
              onChange={(e) => setStageIdx(Number(e.target.value))}
            />
            <div className="gl-stage-stops" role="tablist" aria-label="Các bước sử dụng ứng dụng">
              {STAGES.map((st, idx) => (
                <button
                  key={st.id}
                  type="button"
                  role="tab"
                  aria-selected={stageIdx === idx}
                  className={"gl-stage-stop" + (stageIdx === idx ? " is-active" : "")}
                  onClick={() => setStageIdx(idx)}
                >
                  {st.tab}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── MỤC 4 (FEATURES): Close-ups on a board — Bảng 8 ô đại cảnh hệ sinh thái & Huấn luyện viên ── */}
        <section className="gl-board-sec" aria-labelledby="gl-board-h">
          <div className="gl-board">
            {/* Tile 1 (6×2): Tiêu đề của mục */}
            <div className="gl-tile gl-tile-6x2 is-ground" data-reveal>
              <h2 id="gl-board-h" className="gl-h2">
                Mọi quy tắc,
                <br />
                rõ từng con số.
              </h2>
              <p className="gl-tile-lead">
                Từ cách tính học phí, hoàn tiền buổi nghỉ cho tới tiêu chuẩn duyệt hồ sơ huấn luyện
                viên đều được vận hành tự động trên hệ thống.
              </p>
            </div>

            {/* Tile 2 (6×4): Hồ sơ Huấn luyện viên trực tiếp từ GET /coaches/:id/profile */}
            <div className="gl-tile gl-tile-6x4 is-forest" data-reveal style={at(1)}>
              <div className="gl-coach-macro" data-ui>
                <div className="gl-coach-macro-top">
                  <span className="gl-coach-badge">Hồ sơ HLV công khai · Đã duyệt CV</span>
                  <span className="gl-coach-rating">
                    Điểm {liveCoach?.rating?.average ?? 5}.0/5 ({liveCoach?.rating?.count ?? 1} đánh giá)
                  </span>
                </div>
                <strong className="gl-coach-name">
                  HLV {liveCoach?.fullName || realClasses[0]?.coach?.user?.fullName || "Nguyễn Văn Cường"}
                </strong>
                <p className="gl-coach-spec">
                  Chuyên môn: {liveCoach?.specialization || "Yoga, Pilates & Gym nền tảng"} ·{" "}
                  {liveCoach?.experienceYears ?? 5} năm kinh nghiệm
                </p>
                <p className="gl-coach-bio">
                  {liveCoach?.bio ||
                    "Mỗi huấn luyện viên tại Pulse phải nộp hồ sơ năng lực, được quản lý phê duyệt trước khi mở khóa học và chịu sự giám sát lịch dạy từng kỳ."}
                </p>
                <div className="gl-coach-stats">
                  <div>
                    <b>{liveCoach?.stats?.openCourses ?? 1}</b>
                    <span>Khóa đang mở</span>
                  </div>
                  <div>
                    <b>{liveCoach?.stats?.totalCourses ?? 3}</b>
                    <span>Tổng khóa phụ trách</span>
                  </div>
                  <div>
                    <b>{liveCoach?.stats?.completedSessions ?? 20}+</b>
                    <span>Buổi huấn luyện</span>
                  </div>
                </div>
              </div>
              <div className="gl-tile-caption light">
                <strong>Huấn luyện viên được kiểm duyệt hồ sơ & lịch dạy</strong>
                <span>Chỉ học viên đã học xong khóa mới được gửi đánh giá công khai.</span>
              </div>
            </div>

            {/* Tile 3 (3×4): Khấu trừ vào muộn */}
            <div className="gl-tile gl-tile-3x4 is-lime" data-reveal style={at(2)}>
              <div className="gl-macro-figure" data-ui>
                <span>Đơn giá minh bạch</span>
                <strong>-40.000đ</strong>
                <small>trên mỗi buổi đã qua</small>
              </div>
              <div className="gl-tile-caption">
                <strong>Tự động trừ tiền buổi vắng</strong>
                <span>Đăng ký sau ngày khai giảng chỉ trả tiền số buổi còn lại.</span>
              </div>
            </div>

            {/* Tile 4 (3×2): Bảo vệ học viên khi HLV nghỉ */}
            <div className="gl-tile gl-tile-3x2 is-soft" data-reveal style={at(3)}>
              <div className="gl-macro-pill" data-ui>
                <span>DẠY BÙ</span>
                <span>HOÀN 100%</span>
              </div>
              <div className="gl-tile-caption">
                <strong>Không mất buổi học</strong>
                <span>HLV hủy lịch bắt buộc bù buổi hoặc hoàn tiền.</span>
              </div>
            </div>

            {/* Tile 5 (3×2): Giữ chỗ 15 phút */}
            <div className="gl-tile gl-tile-3x2 is-deep" data-reveal style={at(1)}>
              <div className="gl-macro-figure light" data-ui>
                <strong>15 phút</strong>
                <small>giữ chỗ VietQR</small>
              </div>
              <div className="gl-tile-caption light">
                <strong>Không lo hết suất khi đang chuyển khoản</strong>
                <span>Hệ thống khóa suất tạm thời ngay khi tạo mã QR.</span>
              </div>
            </div>

            {/* Tile 6 (3×2): Cổng thanh toán & Hóa đơn Snapshot */}
            <div className="gl-tile gl-tile-3x2 is-soft" data-reveal style={at(2)}>
              <div className="gl-macro-row" data-ui>
                <span>VietQR SePay</span>
                <span>Cộng dồn ngày</span>
              </div>
              <div className="gl-tile-caption">
                <strong>Gia hạn gói tập sớm không mất ngày còn lại</strong>
                <span>Gói mới tự động xếp hàng nối tiếp ngay sau ngày hết hạn hiện tại.</span>
              </div>
            </div>

            {/* Tile 7 (3×2): Ảnh thực tế + 10 mục tiêu */}
            <div className="gl-tile gl-tile-3x2 is-photo" data-reveal style={at(3)}>
              <img
                src={MEDIA.weights}
                alt="Giá tạ đơn và ghế tập tại trung tâm"
                width={1000}
                height={1250}
                loading="lazy"
              />
              <div className="gl-tile-scrim">
                <strong>10 mục tiêu thể hình chuẩn hóa</strong>
                <span>Tăng cơ, Giảm mỡ, Sức mạnh, Sức bền, Phục hồi…</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── MỤC 5 (GALLERY): Wall of word tiles — Tường sản phẩm Pro Shop & Con số đặc trưng ── */}
        <section className="gl-wall-sec" id="cua-hang" aria-labelledby="gl-wall-h">
          <div className="gl-wall-head">
            <div>
              <h2 id="gl-wall-h" className="gl-h2" data-reveal>
                Đồ tập tại quầy,
                <br />
                đặt trước qua app.
              </h2>
              <p className="gl-wall-sub" data-reveal style={at(1)}>
                Quên mang khăn, cần bình nước mới hay bổ sung Whey Protein ngay sau buổi tập? Chọn
                trước món đồ đang có sẵn trong kho trung tâm để xem tổng đơn nhận tại quầy lễ tân.
              </p>
            </div>

            <div className="gl-pickup-bar" data-ui>
              <div>
                <span>Giỏ thử nghiệm nhận tại quầy ({pickedProductIds.length} món)</span>
                <strong>Tổng tạm tính: {money(pickedTotal)}</strong>
              </div>
              <a className="gl-pickup-link" href="#lien-he">
                Thanh toán VietQR hoặc tiền mặt tại quầy
              </a>
            </div>
          </div>

          <div className="gl-wall-grid">
            {/* Ô 1: Con số mở cửa trên nền trang (--ground) */}
            <div className="gl-wall-cell is-ground" data-reveal>
              <strong className="gl-wall-big">05:30</strong>
              <span className="gl-wall-cap">Giờ mở cửa sáng</span>
            </div>

            {/* Ô 2..7: Sản phẩm thật từ GET /products (bấm để chọn/bỏ chọn vào giỏ thử nghiệm) */}
            {(realProducts.length ? realProducts : [
              { id: "prd-yogamat-001", name: "Thảm Yoga TPE 6mm", price: 250000, availableStock: 15, description: "Thảm chống trượt, nhẹ, dễ cuộn." },
              { id: "prd-gloves-001", name: "Găng tay tập gym", price: 150000, availableStock: 23, description: "Chống chai tay khi tập tạ." },
              { id: "prd-bottle-001", name: "Bình nước thể thao 750ml", price: 120000, availableStock: 30, description: "Nhựa không BPA, nắp chống tràn." },
              { id: "prd-towel-001", name: "Khăn tập thể thao", price: 60000, availableStock: 40, description: "Cotton thấm hút mồ hôi 30x90cm." },
              { id: "prd-whey-001", name: "Whey Protein Isolate 1kg", price: 850000, availableStock: 20, description: "Phục hồi và tăng cơ sau buổi tập." },
              { id: "prd-water-001", name: "Nước suối ướp lạnh 500ml", price: 10000, availableStock: 95, description: "Nhận ngay tại quầy lễ tân." },
            ]).map((prod, idx) => {
              const selected = pickedProductIds.includes(prod.id);
              const stock = prod.availableStock ?? prod.stockQuantity ?? 20;
              return (
                <button
                  key={prod.id}
                  type="button"
                  className={"gl-wall-cell is-product" + (selected ? " is-picked" : "")}
                  onClick={() => toggleProduct(prod.id)}
                  data-reveal
                  style={at((idx % 3) + 1)}
                >
                  <span className="gl-prod-stock">
                    {selected ? "Đã chọn nhận tại quầy" : `Còn ${stock} tại quầy`}
                  </span>
                  <strong className="gl-prod-price">{money(prod.price)}</strong>
                  <span className="gl-wall-cap">
                    <b>{prod.name}</b>
                    {prod.description ? ` · ${prod.description}` : ""}
                  </span>
                </button>
              );
            })}

            {/* Ô 8: Ảnh không gian */}
            <div className="gl-wall-cell is-photo" data-reveal style={at(1)}>
              <img
                src={MEDIA.rack}
                alt="Hàng tạ đơn chuẩn bị sẵn trên giá"
                width={1000}
                height={1250}
                loading="lazy"
              />
              <span className="gl-wall-cap light">Dàn tạ đơn tiêu chuẩn</span>
            </div>

            {/* Ô 9: Con số QR */}
            <div className="gl-wall-cell is-lime" data-reveal style={at(2)}>
              <strong className="gl-wall-big">60s</strong>
              <span className="gl-wall-cap">Chu kỳ đổi mã QR</span>
            </div>

            {/* Ô 10: Ảnh tập luyện */}
            <div className="gl-wall-cell is-photo" data-reveal style={at(1)}>
              <img
                src={MEDIA.progress}
                alt="Hội viên tập Deadlift trên sàn cao su"
                width={1400}
                height={1000}
                loading="lazy"
              />
              <span className="gl-wall-cap light">Sàn nâng tạ giảm chấn</span>
            </div>

            {/* Ô 11: Ảnh dây thừng */}
            <div className="gl-wall-cell is-photo" data-reveal style={at(2)}>
              <img
                src={MEDIA.scan}
                alt="Bài tập dây thừng thể lực"
                width={1400}
                height={1000}
                loading="lazy"
              />
              <span className="gl-wall-cap light">Khu Functional & HIIT</span>
            </div>

            {/* Ô 12: Con số đóng cửa */}
            <div className="gl-wall-cell is-deep" data-reveal style={at(3)}>
              <strong className="gl-wall-big">22:00</strong>
              <span className="gl-wall-cap light">Giờ đóng cửa mỗi tối</span>
            </div>
          </div>
        </section>

        {/* ── MỤC 6 (CONTACT): Clip-out coupon form — Phiếu hẹn tham quan & Tư vấn lộ trình ── */}
        <section className="gl-coupon-sec" id="lien-he" aria-labelledby="gl-coupon-h">
          <div className="gl-coupon">
            {/* Cuống vé bên trái: Thông tin liên hệ trực tiếp */}
            <div className="gl-coupon-left" data-reveal>
              <div>
                <h2 id="gl-coupon-h" className="gl-h2 light">
                  Hẹn lịch tư vấn
                  <br />
                  tại phòng tập.
                </h2>
                <p className="gl-coupon-lead">
                  Ghé trực tiếp quầy lễ tân để xem sàn tập, đo chỉ số cơ thể và chọn khóa học cùng
                  huấn luyện viên phù hợp nhất với lịch sinh hoạt của bạn.
                </p>
              </div>

              <div className="gl-coupon-direct">
                <a className="gl-hotline-big" href={`tel:${hotlineRaw.replace(/\s/g, "")}`}>
                  <PhoneCall size={26} aria-hidden="true" /> {hotlineFormatted}
                </a>
                <div className="gl-coupon-address">
                  <strong>{centerName}</strong>
                  <span>
                    <MapPin size={16} aria-hidden="true" /> {centerAddress}
                  </span>
                  <span>Giờ mở cửa: {centerHours}</span>
                </div>
                <div className="gl-coupon-links">
                  <a className="gl-btn" href={mapLink} target="_blank" rel="noreferrer">
                    Mở Google Maps <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>

            {/* Cuống vé bên phải: Biểu mẫu đặt lịch tham quan / nhận tư vấn */}
            <form className="gl-coupon-form" onSubmit={handleCouponSubmit} data-reveal style={at(1)}>
              <strong className="gl-form-title">Phiếu đăng ký tham quan & tư vấn lộ trình</strong>

              <div className="gl-field">
                <label className="gl-sr-only" htmlFor="gl-visitor-name">
                  Họ và tên của bạn
                </label>
                <input
                  id="gl-visitor-name"
                  type="text"
                  required
                  placeholder="Họ và tên của bạn (ví dụ: Nguyễn Minh Anh)"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                />
              </div>

              <div className="gl-field">
                <label className="gl-sr-only" htmlFor="gl-visitor-phone">
                  Số điện thoại liên hệ
                </label>
                <input
                  id="gl-visitor-phone"
                  type="tel"
                  required
                  placeholder="Số điện thoại liên hệ (ví dụ: 0909 123 456)"
                  value={visitorPhone}
                  onChange={(e) => setVisitorPhone(e.target.value)}
                />
              </div>

              <div className="gl-field">
                <label className="gl-sr-only" htmlFor="gl-visitor-goal">
                  Mục tiêu tập luyện ưu tiên
                </label>
                <select
                  id="gl-visitor-goal"
                  value={visitorGoal}
                  onChange={(e) => setVisitorGoal(e.target.value)}
                >
                  <option value="Tăng cơ & Sức mạnh">Mục tiêu: Tăng cơ & Sức mạnh</option>
                  <option value="Giảm mỡ & Săn chắc vóc dáng">Mục tiêu: Giảm mỡ & Săn chắc vóc dáng</option>
                  <option value="Yoga, Linh hoạt & Tư thế">Mục tiêu: Yoga, Linh hoạt & Tư thế</option>
                  <option value="Làm quen phòng gym cho người mới">Mục tiêu: Làm quen phòng gym cho người mới</option>
                  <option value="Tập tự do theo gói tháng">Mục tiêu: Tập tự do theo gói tháng</option>
                </select>
              </div>

              <div className="gl-field">
                <label className="gl-sr-only" htmlFor="gl-visitor-shift">
                  Khung giờ thuận tiện ghé phòng tập
                </label>
                <select
                  id="gl-visitor-shift"
                  value={visitorShift}
                  onChange={(e) => setVisitorShift(e.target.value)}
                >
                  <option value="Ca sáng (05:30 – 09:00)">Khung giờ: Ca sáng (05:30 – 09:00)</option>
                  <option value="Ca trưa (11:00 – 14:00)">Khung giờ: Ca trưa (11:00 – 14:00)</option>
                  <option value="Ca tối (17:30 – 21:00)">Khung giờ: Ca tối (17:30 – 21:00)</option>
                  <option value="Cuối tuần (Thứ 7 / Chủ nhật)">Khung giờ: Cuối tuần (Thứ 7 / Chủ nhật)</option>
                </select>
              </div>

              <button type="submit" className="gl-submit-bar">
                <Sparkles size={18} aria-hidden="true" /> Nhận phiếu hẹn tham quan phòng tập
              </button>

              {couponSubmitted ? (
                <div className="gl-coupon-confirm" role="status">
                  <strong>
                    Đã ghi nhận phiếu hẹn cho {visitorName || "bạn"} ({visitorShift})!
                  </strong>
                  <span>
                    Đưa màn hình này tại lễ tân {centerAddress} hoặc gọi trực tiếp{" "}
                    <a href={`tel:${hotlineRaw.replace(/\s/g, "")}`}>{hotlineFormatted}</a> để được
                    đón tiếp ngay.
                  </span>
                </div>
              ) : null}
            </form>
          </div>
        </section>
      </main>

      {/* ── CHÂN TRANG (FOOTER): The mark, built large — Khối chữ kiến trúc khổng lồ ── */}
      <footer className="gl-foot">
        <div className="gl-foot-top">
          <div className="gl-foot-cta">
            <h2 className="gl-h2" data-reveal>
              Sẵn sàng vào ca
              <br />
              tập hôm nay.
            </h2>
            <div className="gl-foot-actions" data-reveal style={at(1)}>
              <a className="gl-btn dark" href={mapLink} target="_blank" rel="noreferrer">
                Chỉ đường tới {centerName} <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <a className="gl-btn ghost-dark" href={`tel:${hotlineRaw.replace(/\s/g, "")}`}>
                Gọi {hotlineFormatted}
              </a>
            </div>
          </div>

          <div className="gl-foot-cols" data-reveal style={at(2)}>
            <div>
              <strong>Khám phá</strong>
              <a href="#khong-gian">Ba khu vực phòng tập</a>
              <a href="#khoa-hoc">Khóa học & Mục tiêu</a>
              <a href="#quy-inh-app">Ứng dụng thẻ QR 60s</a>
              <a href="#cua-hang">Cửa hàng Pro Shop</a>
            </div>
            <div>
              <strong>Hệ thống</strong>
              <a href="#lien-he">Đặt lịch tham quan</a>
              {signedIn ? (
                <Link to="/manager/dashboard">Bảng điều khiển Quản lý</Link>
              ) : (
                <Link to="/login">Đăng nhập</Link>
              )}
              <a href={mapLink} target="_blank" rel="noreferrer">
                Bản đồ Google Maps
              </a>
            </div>
            <div>
              <strong>Địa chỉ & Giờ mở cửa</strong>
              <span>{centerName}</span>
              <span>{centerAddress}</span>
              <span>Mở cửa: {centerHours}</span>
              <span>Hotline: {hotlineFormatted}</span>
            </div>
          </div>
        </div>

        <div className="gl-foot-pulse" data-reveal>
          <PulseLine />
        </div>

        {/* Chữ PULSE. dựng bằng các khối kiến trúc cao thấp theo đúng blueprint "The mark, built large" */}
        <div className="gl-mark-blocks" aria-hidden="true">
          <div className="gl-mark-block h-100">
            <span>P</span>
          </div>
          <div className="gl-mark-block h-82">
            <span>U</span>
          </div>
          <div className="gl-mark-block h-92">
            <span>L</span>
          </div>
          <div className="gl-mark-block h-76">
            <span>S</span>
          </div>
          <div className="gl-mark-block h-96">
            <span>E</span>
          </div>
          <div className="gl-mark-block h-64 is-dot">
            <span>.</span>
          </div>
        </div>

        <div className="gl-legal">
          <span>© {new Date().getFullYear()} Pulse Sports Center · Mọi quyền được bảo lưu.</span>
          <span>{CREDITS}</span>
        </div>
      </footer>

      {/* ── NÚT THAO TÁC NHANH KÉO LÊN ĐẦU TRANG (GÓC PHẢI DƯỚI) ── */}
      <button
        type="button"
        className={"gl-totop" + (showToTop ? " is-visible" : "")}
        data-ui
        onClick={scrollToTop}
        aria-label="Kéo nhanh lên đầu trang"
        title="Kéo nhanh lên đầu trang"
      >
        <span className="gl-totop-ring" aria-hidden="true">
          <ArrowUp size={18} />
        </span>
        <span className="gl-totop-text gl-hide-sm">Đầu trang</span>
      </button>
    </div>
  );
}
