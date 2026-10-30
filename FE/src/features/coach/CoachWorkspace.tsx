import { sportNames } from "../../shared/sports";
import { Attendance } from "../../shared/Attendance";
import { TrainingPlans } from "../../shared/TrainingPlans";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Users,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { api } from "../../shared/api";
import { Empty, ErrorState, Loading, Modal } from "../../shared/ui";
import {
  addDays,
  all,
  dateKey,
  fmt,
  idOf,
  monday,
  obj,
  state,
  str,
  useClasses,
  useSchedules,
  type Row,
} from "./data";

export function Heading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">KHÔNG GIAN HUẤN LUYỆN</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Badge({ value }: { value: unknown }) {
  return (
    <span className={`coach-badge coach-state-${String(value).toLowerCase()}`}>
      {state(value)}
    </span>
  );
}
export function CoachWorkspace({
  coachId,
  mode,
}: {
  coachId: string;
  mode: "dashboard" | "schedule" | "classes";
}) {
  const today = dateKey();
  const [day, setDay] = useState(today);
  const [searchParams] = useSearchParams();
  const [classFilter, setClassFilter] = useState(
    searchParams.get("classId") || "",
  );
  const [status, setStatus] = useState("");
  const [view, setView] = useState("week");
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const classes = useClasses(coachId);
  const start = monday(day),
    end = addDays(start, 6);
  const schedules = useSchedules(
    coachId,
    mode === "classes" ? undefined : classes.data,
    start,
    end,
  );
  const list = (schedules.data || []).filter(
    (s) =>
      (!classFilter ||
        s.classId === classFilter ||
        idOf(s.class) === classFilter) &&
      (!status || s.status === status),
  );
  const titles = {
    dashboard: "Tổng quan huấn luyện viên",
    schedule: "Lịch dạy",
    classes: "Lớp phụ trách",
  };
  if (!coachId)
    return (
      <>
        <Heading
          title={titles[mode]}
          description="Quản lý hoạt động huấn luyện của bạn."
        />
        <Empty text="Tài khoản chưa có hồ sơ huấn luyện viên. Vui lòng liên hệ quản lý để được phân công." />
      </>
    );
  return (
    <div className="coach-workspace">
      <Heading
        title={titles[mode]}
        description={
          mode === "schedule"
            ? "Sắp xếp tuần dạy và theo dõi học viên của từng buổi. Giờ Việt Nam (GMT+7)."
            : mode === "classes"
              ? "Theo dõi các lớp được phân công và mục tiêu của từng học viên."
              : "Một góc nhìn rõ ràng cho tuần dạy của bạn. Giờ Việt Nam (GMT+7)."
        }
      />
      {classes.isPending ? (
        <Loading variant="cards" />
      ) : classes.error ? (
        <ErrorState error={classes.error} retry={() => classes.refetch()} />
      ) : (
        <>
          {mode === "dashboard" && (
            <>
              <section className="coach-welcome">
                <div>
                  <span className="eyebrow">MỖI BUỔI TẬP, MỘT BƯỚC TIẾN</span>
                  <h2>Sẵn sàng cho buổi dạy tiếp theo.</h2>
                  <p>
                    Xem lịch, hiểu mục tiêu học viên và chuẩn bị cho từng buổi
                    tập.
                  </p>
                  <Link className="button primary" to="/coach/schedule">
                    Mở lịch dạy <ArrowRight size={16} />
                  </Link>
                </div>
                <CalendarDays size={84} aria-hidden="true" />
              </section>
              <div className="coach-stats">
                <Stat
                  icon={<BookOpen />}
                  title="Lớp phụ trách"
                  value={classes.data.length}
                />
                <Stat
                  icon={<CalendarDays />}
                  title="Buổi trong tuần"
                  value={
                    schedules.isPending
                      ? "…"
                      : schedules.error
                        ? "—"
                        : list.filter((s) => s.status !== "CANCELLED").length
                  }
                />
                <Stat
                  icon={<CheckCircle2 />}
                  title="Đã hoàn thành trong tuần"
                  value={
                    schedules.isPending
                      ? "…"
                      : schedules.error
                        ? "—"
                        : list.filter((s) => s.status === "COMPLETED").length
                  }
                />
              </div>
            </>
          )}
          {mode === "classes" ? (
            <>
              <div className="coach-toolbar">
                <label>
                  Tìm lớp
                  <input
                    type="search"
                    maxLength={100}
                    placeholder="Tên lớp hoặc bộ môn"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <span>{classes.data.length} lớp được phân công</span>
              </div>
              <div className="coach-class-grid">
                {classes.data
                  .filter((c) =>
                    (str(c.name) + sportNames(c))
                      .toLocaleLowerCase("vi")
                      .includes(search.trim().toLocaleLowerCase("vi")),
                  )
                  .map((c) => (
                    <article className="panel coach-class-card" key={idOf(c)}>
                      <div className="coach-card-top">
                        <BookOpen size={25} />
                        <Badge value={c.classType} />
                      </div>
                      <h2>{str(c.name)}</h2>
                      <p>{sportNames(c)}</p>
                      <p className="coach-clamp">
                        {str(
                          c.description,
                          "Lớp tập luyện được phân công cho bạn.",
                        )}
                      </p>
                      <div className="coach-meta">
                        <span>
                          <Users size={16} /> {String(c.capacity ?? "—")} học
                          viên / buổi
                        </span>
                        <span>
                          {c.isActive === false
                            ? "Ngừng hoạt động"
                            : "Đang hoạt động"}
                        </span>
                      </div>
                      <button className="button" onClick={() => setDetail(c)}>
                        Chi tiết lớp
                      </button>
                      <Link
                        className="button primary"
                        to={
                          "/coach/schedule?classId=" +
                          encodeURIComponent(idOf(c))
                        }
                      >
                        Xem lịch dạy
                      </Link>
                    </article>
                  ))}
              </div>
              {!classes.data.length && (
                <Empty text="Bạn chưa được phân công lớp nào. Lớp mới sẽ xuất hiện sau khi quản lý phân công." />
              )}
              {!!classes.data.length &&
                !classes.data.some((c) =>
                  (str(c.name) + sportNames(c))
                    .toLocaleLowerCase("vi")
                    .includes(search.trim().toLocaleLowerCase("vi")),
                ) && <Empty text="Không tìm thấy lớp phù hợp." />}
            </>
          ) : (
            <>
              <section className="panel coach-calendar">
                <div className="coach-calendar-heading">
                  <div>
                    <h2>
                      {mode === "dashboard"
                        ? "Lịch dạy tuần này"
                        : "Thời khóa biểu"}
                    </h2>
                    <p>
                      {fmt(start)} — {fmt(end)}
                    </p>
                  </div>
                  <div className="coach-actions">
                    <button
                      className="button"
                      aria-label="Tuần trước"
                      onClick={() => setDay(addDays(day, -7))}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button className="button" onClick={() => setDay(today)}>
                      Tuần này
                    </button>
                    <button
                      className="button"
                      aria-label="Tuần sau"
                      onClick={() => setDay(addDays(day, 7))}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="coach-toolbar">
                  <label>
                    Ngày cần xem
                    <input
                      type="date"
                      value={day}
                      min="2000-01-01"
                      max="2100-12-31"
                      onChange={(e) => {
                        if (e.target.value && e.target.validity.valid)
                          setDay(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Lớp học
                    <select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                    >
                      <option value="">Tất cả lớp của tôi</option>
                      {classes.data.map((c) => (
                        <option key={idOf(c)} value={idOf(c)}>
                          {str(c.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Trạng thái
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">Tất cả trạng thái</option>
                      {["SCHEDULED", "COMPLETED", "CANCELLED"].map((v) => (
                        <option key={v} value={v}>
                          {state(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="coach-actions" aria-label="Chế độ xem">
                    {[
                      ["week", "Theo tuần"],
                      ["list", "Danh sách"],
                    ].map(([v, t]) => (
                      <button
                        key={v}
                        className={`button ${view === v ? "primary" : ""}`}
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {schedules.isPending ? (
                  <Loading variant="cards" />
                ) : schedules.error ? (
                  <ErrorState
                    error={schedules.error}
                    retry={() => schedules.refetch()}
                  />
                ) : !list.length ? (
                  <Empty text="Không có buổi dạy trong tuần hoặc bộ lọc này." />
                ) : (
                  <div
                    className={view === "week" ? "coach-week" : "coach-agenda"}
                  >
                    {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map(
                      (d, i) => {
                        const items = list.filter(
                          (s) => dateKey(s.startTime) === d,
                        );
                        return (
                          <section
                            className={`coach-day ${d === today ? "is-today" : ""}`}
                            key={d}
                          >
                            <header>
                              <strong>
                                {
                                  [
                                    "Thứ hai",
                                    "Thứ ba",
                                    "Thứ tư",
                                    "Thứ năm",
                                    "Thứ sáu",
                                    "Thứ bảy",
                                    "Chủ nhật",
                                  ][i]
                                }
                              </strong>
                              <span>
                                {fmt(d).slice(0, 5)}
                                {d === today ? " · Hôm nay" : ""}
                              </span>
                            </header>
                            <div>
                              {items.length ? (
                                items.map((s) => (
                                  <button
                                    key={idOf(s)}
                                    className={`coach-session ${s.status === "CANCELLED" ? "is-cancelled" : ""}`}
                                    onClick={() => setSession(s)}
                                  >
                                    <span className="coach-time">
                                      <Clock3 size={14} />
                                      {fmt(s.startTime, true)} –{" "}
                                      {fmt(s.endTime, true)}
                                    </span>
                                    <strong>{str(obj(s.class).name)}</strong>
                                    <span>
                                      <MapPin size={13} />{" "}
                                      {str(obj(s.room).name)}
                                    </span>
                                    <Badge value={s.status} />
                                    <small>Xem học viên →</small>
                                  </button>
                                ))
                              ) : (
                                <p className="coach-day-empty">
                                  Không có buổi dạy
                                </p>
                              )}
                            </div>
                          </section>
                        );
                      },
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
      {session && (
        <SessionDetails
          session={session}
          coachId={coachId}
          onClose={() => setSession(null)}
        />
      )}
      {detail && (
        <Modal
          eyebrow="PULSE / HUẤN LUYỆN VIÊN"
          title={str(detail.name)}
          onClose={() => setDetail(null)}
        >
          <div className="coach-detail">
            <Badge value={detail.classType} />
            <p>{str(detail.description, "Chưa có mô tả lớp.")}</p>
            <dl>
              <dt>Tên lớp</dt>
              <dd>{str(detail.name)}</dd>
              <dt>Bộ môn</dt>
              <dd>{sportNames(detail)}</dd>
              <dt>Sức chứa mỗi buổi</dt>
              <dd>{String(detail.capacity ?? "—")}</dd>
              <dt>Trạng thái</dt>
              <dd>
                {detail.isActive === false
                  ? "Ngừng hoạt động"
                  : "Đang hoạt động"}
              </dd>
            </dl>
            <p>
              Chọn một buổi trong lịch dạy để xem danh sách học viên và mục tiêu
              tập luyện.
            </p>
            <Link
              className="button primary"
              to={"/coach/schedule?classId=" + encodeURIComponent(idOf(detail))}
              onClick={() => setDetail(null)}
            >
              Đến lịch dạy
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <article className="panel coach-stat">
      {icon}
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SessionDetails({
  session,
  coachId,
  onClose,
}: {
  session: Row;
  coachId: string;
  onClose: () => void;
}) {
  const [student, setStudent] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const sid = idOf(session);
  const roster = useQuery({
    queryKey: ["coach", "roster", sid],
    queryFn: ({ signal }) =>
      all("GET /enrollments/schedule/{scheduleId}", {}, signal, {
        scheduleId: sid,
      }),
  });
  const booked = (roster.data || []).filter((r) => r.status !== "CANCELLED");
  const filtered = booked.filter((r) => {
    const u = obj(obj(r.member).user);
    return (str(u.fullName) + str(u.email))
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });
  if (student)
    return (
      <StudentDetails
        member={student}
        coachId={coachId}
        onClose={() => setStudent(null)}
      />
    );
  return (
    <Modal
      eyebrow="PULSE / HUẤN LUYỆN VIÊN"
      title={str(obj(session.class).name)}
      onClose={onClose}
      maxWidth={850}
    >
      <div className="coach-detail">
        <div className="coach-session-summary">
          <Badge value={session.status} />
          <span>
            {fmt(session.startTime)} · {fmt(session.startTime, true)} –{" "}
            {fmt(session.endTime, true)}
          </span>
          <span>
            <MapPin size={16} /> {str(obj(session.room).name)}
          </span>
        </div>
        <p>{str(obj(session.class).name)}</p>
        <h3>Danh sách học viên</h3>
        <p>
          Chọn học viên để xem thông tin cá nhân, mục tiêu và sở thích tập
          luyện.
        </p>
        <label>
          Tìm học viên
          <input
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên hoặc email"
          />
        </label>
        {roster.isPending ? (
          <Loading variant="table" />
        ) : roster.error ? (
          <ErrorState error={roster.error} retry={() => roster.refetch()} />
        ) : (
          <>
            <p>
              {filtered.length} / {booked.length} học viên
            </p>
            <Attendance schedule={session} roster={booked} role="COACH" />
            <div className="coach-roster">
              {filtered.map((r) => {
                const member = obj(r.member),
                  mid = idOf(member) || str(r.memberId, "");
                return (
                  <div className="coach-student-row" key={idOf(r)}>
                    <button
                      className="coach-student-link"
                      disabled={!mid}
                      onClick={() => setStudent({ ...member, id: mid })}
                    >
                      <span className="avatar">
                        {str(obj(member.user).fullName).slice(0, 1)}
                      </span>
                      <span>
                        <strong>{str(obj(member.user).fullName)}</strong>
                        <small>{str(obj(member.user).email)}</small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                    <Badge value={r.status} />
                  </div>
                );
              })}
              {!filtered.length && (
                <Empty
                  text={
                    booked.length
                      ? "Không tìm thấy học viên phù hợp."
                      : "Chưa có học viên đăng ký buổi này."
                  }
                />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function StudentDetails({
  member,
  coachId,
  onClose,
}: {
  member: Row;
  coachId: string;
  onClose: () => void;
}) {
  const mid = idOf(member);
  const profile = useQuery({
    queryKey: ["coach", "member", mid],
    queryFn: ({ signal }) =>
      api<Row>("GET /members/{id}", { params: { id: mid }, signal }),
  });
  const p = profile.data?.data,
    u = obj(p?.user || member.user);
  return (
    <Modal
      eyebrow="PULSE / HUẤN LUYỆN VIÊN"
      title={"Học viên · " + str(u.fullName)}
      onClose={onClose}
      maxWidth={750}
    >
      <div className="coach-detail">
        <button className="button" onClick={onClose}>
          <ArrowLeft size={16} /> Trở lại danh sách
        </button>
        {profile.isPending ? (
          <Loading variant="details" />
        ) : profile.error ? (
          <ErrorState error={profile.error} retry={() => profile.refetch()} />
        ) : (
          <>
            <dl>
              <dt>Họ và tên</dt>
              <dd>{str(u.fullName)}</dd>
              <dt>Email</dt>
              <dd>{str(u.email)}</dd>
              <dt>Điện thoại</dt>
              <dd>{str(u.phone)}</dd>
              <dt>Trình độ</dt>
              <dd>{state(p?.trainingLevel)}</dd>
              <dt>Ngày sinh</dt>
              <dd>{fmt(u.dateOfBirth)}</dd>
            </dl>
            <TrainingPlans memberId={mid} coachId={coachId} role="COACH" />
            <section className="coach-goal">
              <h3>Mục tiêu tập luyện</h3>
              <p>{str(p?.fitnessGoal)}</p>
              <h3>Sở thích & lưu ý</h3>
              <p>{str(p?.trainingPreference)}</p>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
