import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Power, X } from "lucide-react";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import {
  ActivePill,
  ApprovalPill,
  AREA_LABEL,
  CLASS_TYPE_LABEL,
  ConfirmDialog,
  DataTable,
  Dl,
  ErrorBox,
  Field,
  fieldErrors,
  LEVEL_LABEL,
  PageHead,
  Panel,
  Pill,
  QueryView,
  SchedulePill,
  clock,
  dateOnly,
  dateTime,
  get,
  goalLabels,
  num,
  str,
  vnd,
} from "../kit";
import type { Row } from "../kit";
import { ScheduleDetailDialog } from "./scheduleKit";

export default function ClassDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["admin", "classes", "detail", id], queryFn: ({ signal }) => api<Row>("GET /classes/{id}", { params: { id }, signal }) });
  return <QueryView q={q} rows={8}>{(res) => <ClassDetail cls={res.data} />}</QueryView>;
}

function ClassDetail({ cls }: { cls: Row }) {
  const id = str(cls.id);
  const cache = useQueryClient();
  const [dialog, setDialog] = useState<"APPROVE" | "REJECT" | "toggle" | null>(null);
  const [selected, setSelected] = useState("");
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "classes"] });
    void cache.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
  const review = useMutation({
    mutationFn: (reason: string) => api("PATCH /classes/{id}/review", { params: { id }, body: { action: dialog, ...(reason ? { reason } : {}) } }),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: () => (cls.isActive ? api("DELETE /classes/{id}", { params: { id } }) : api("PATCH /classes/{id}", { params: { id }, body: { isActive: true } })),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
  });
  const sessions = useQuery({
    queryKey: ["admin", "schedules", "byClass", id],
    queryFn: ({ signal }) => allPages<Row>("GET /class-schedules", { query: { classId: id }, signal }),
  });
  const students = useQuery({ queryKey: ["admin", "classes", "students", id], queryFn: ({ signal }) => api<Row>("GET /classes/{id}/students", { params: { id }, signal }) });
  const upcoming = (sessions.data?.data ?? []).filter((s) => s.status === "SCHEDULED" && new Date(str(s.startTime)) > new Date()).length;
  const pending = cls.status === "PENDING";

  return (
    <>
      <PageHead
        back={
          <Link className="cr-crumb" to="/manager/classes">
            <ArrowLeft size={15} /> Khóa học & lớp
          </Link>
        }
        eyebrow={`Gym · ${CLASS_TYPE_LABEL[str(cls.classType)] ?? ""}${cls.startDate && cls.endDate ? ` · ${dateOnly(cls.startDate)} – ${dateOnly(cls.endDate)}` : ""}`}
        title={str(cls.name)}
        desc={
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <ApprovalPill status={cls.status} />
            <ActivePill active={cls.isActive} on="Đang mở bán" off="Ngừng mở bán" />
          </span>
        }
        actions={
          <>
            {pending && (
              <>
                <button className="cr-btn primary" onClick={() => setDialog("APPROVE")}>
                  <Check size={16} /> Duyệt khóa học
                </button>
                <button className="cr-btn danger" onClick={() => setDialog("REJECT")}>
                  <X size={16} /> Từ chối
                </button>
              </>
            )}
            <button className={"cr-btn " + (cls.isActive ? "danger" : "")} onClick={() => setDialog("toggle")}>
              <Power size={16} /> {cls.isActive ? "Ngừng mở bán" : "Mở bán lại"}
            </button>
          </>
        }
      />
      {cls.status === "REJECTED" && cls.rejectReason ? (
        <div className="cr-alert warn">
          <div>
            <strong>Lý do từ chối đã gửi HLV</strong>
            <p>{str(cls.rejectReason)}</p>
          </div>
        </div>
      ) : null}
      <div className="cr-kpis">
        <div className="cr-kpi">
          <div className="cr-kpi-label">Giá khóa</div>
          <div className="cr-kpi-value">{vnd(cls.price)}</div>
          <div className="cr-kpi-note">HLV định giá</div>
        </div>
        <div className="cr-kpi">
          <div className="cr-kpi-label">Học viên</div>
          <div className="cr-kpi-value">{students.isPending ? "…" : num(((get(students.data, "data.students") as Row[]) ?? []).length)}</div>
          <div className="cr-kpi-note">sức chứa {num(cls.capacity)} / buổi</div>
        </div>
        <div className="cr-kpi">
          <div className="cr-kpi-label">Buổi học</div>
          <div className="cr-kpi-value">{sessions.isPending ? "…" : num(sessions.data?.data.length)}</div>
          <div className="cr-kpi-note">{num(upcoming)} buổi sắp diễn ra</div>
        </div>
        <div className="cr-kpi amber">
          <div className="cr-kpi-label">Đã thu</div>
          <div className="cr-kpi-value">{students.isPending ? "…" : vnd(get(students.data, "data.grossRevenue"))}</div>
          <div className="cr-kpi-note">đã hoàn {vnd(get(students.data, "data.refundedAmount"))}</div>
        </div>
      </div>
      <div className="cr-grid-side">
        <div style={{ display: "grid", gap: 20 }}>
          <ClassForm cls={cls} onSaved={refresh} />
          <Panel title="Buổi học" desc="Chọn buổi để xem học viên">
            <QueryView q={sessions} rows={4}>
              {(res) => (
                <DataTable
                  rows={res.data}
                  empty={<p className="cr-muted" style={{ margin: 0 }}>Khóa chưa có buổi học.</p>}
                  columns={[
                    { key: "t", title: "Thời gian", render: (s) => <span className="cr-mono">{dateOnly(s.startTime)} · {clock(s.startTime)}–{clock(s.endTime)}</span> },
                    { key: "r", title: "Phòng", render: (s) => str(get(s, "room.name")) },
                    {
                      key: "s",
                      title: "Trạng thái",
                      render: (s) => (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <SchedulePill status={s.status} />
                          {s.makeupForId ? <Pill tone="warn">Dạy bù</Pill> : null}
                        </span>
                      ),
                    },
                    { key: "b", title: "Giữ chỗ", className: "num", render: (s) => `${num(get(s, "_count.enrollments"))}/${num(cls.capacity)}` },
                    {
                      key: "x",
                      title: "",
                      className: "actions",
                      render: (s) => (
                        <button className="cr-btn sm" onClick={() => setSelected(str(s.id))}>
                          Học viên
                        </button>
                      ),
                    },
                  ]}
                />
              )}
            </QueryView>
          </Panel>
          <Panel title="Học viên của khóa">
            <QueryView q={students} rows={4}>
              {(res) => (
                <DataTable
                  rows={(res.data.students ?? []) as Row[]}
                  empty={<p className="cr-muted" style={{ margin: 0 }}>Chưa có học viên mua khóa.</p>}
                  columns={[
                    {
                      key: "n",
                      title: "Học viên",
                      render: (m) => (
                        <div className="cr-cell-main">
                          <Link to={`/manager/users/${str(get(m, "user.id"))}`}>{str(get(m, "user.fullName"))}</Link>
                          <small>{str(get(m, "user.email"))}</small>
                        </div>
                      ),
                    },
                    { key: "l", title: "Trình độ", render: (m) => LEVEL_LABEL[str(m.trainingLevel)] ?? "—" },
                    { key: "b", title: "Buổi đã giữ", className: "num", render: (m) => num(m.bookedCount) },
                    { key: "a", title: "Chuyên cần", className: "num", render: (m) => (Number(m.pastSessionCount) ? `${num(m.attendedCount)}/${num(m.pastSessionCount)}` : "—") },
                  ]}
                />
              )}
            </QueryView>
          </Panel>
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          <Panel title="Huấn luyện viên">
            <Dl
              items={[
                ["Phụ trách", <div key="c" className="cr-cell-main"><Link key="c" to={`/manager/coaches/${str(get(cls, "coach.user.id"))}`}>{str(get(cls, "coach.user.fullName"))}</Link><small>{str(get(cls, "coach.user.email"))}</small></div>],
              ]}
            />
          </Panel>
          <Panel title="Mục tiêu & lịch">
            <Dl
              items={[
                ["Mục tiêu", goalLabels(cls.goalTags).join(", ")],
                ["Mô tả mục tiêu", str(cls.goal)],
                ["Trình độ", cls.targetLevel ? LEVEL_LABEL[str(cls.targetLevel)] ?? str(cls.targetLevel) : "Mọi trình độ"],
                ["Khai giảng", cls.startDate ? dateOnly(cls.startDate) : ""],
                ["Kết thúc", cls.endDate ? dateOnly(cls.endDate) : ""],
              ]}
            />
          </Panel>
          <Panel title="Thông tin">
            <Dl items={[["Tạo lúc", dateTime(cls.createdAt)], ["Cập nhật", dateTime(cls.updatedAt)]]} />
          </Panel>
        </div>
      </div>
      {selected && <ScheduleDetailDialog id={selected} onClose={() => setSelected("")} />}
      {(dialog === "APPROVE" || dialog === "REJECT") && (
        <ConfirmDialog
          title={dialog === "APPROVE" ? "Duyệt khóa học" : "Từ chối khóa học"}
          target={`${str(cls.name)} · ${str(get(cls, "coach.user.fullName"))}`}
          consequence={
            dialog === "APPROVE"
              ? "Khóa được mở bán cho Hội viên trên ứng dụng và HLV được thông báo. Hội viên được thông báo khóa mới."
              : "HLV nhận lý do từ chối và có thể chỉnh sửa rồi gửi duyệt lại."
          }
          confirmLabel={dialog === "APPROVE" ? "Duyệt" : "Từ chối"}
          danger={dialog === "REJECT"}
          reason={dialog === "REJECT" ? { label: "Lý do từ chối", required: true, min: 3 } : undefined}
          busy={review.isPending}
          error={review.error}
          onConfirm={(r) => review.mutate(r)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "toggle" && (
        <ConfirmDialog
          title={cls.isActive ? "Ngừng mở bán khóa học" : "Mở bán lại"}
          target={str(cls.name)}
          consequence={
            cls.isActive
              ? upcoming
                ? `Khóa còn ${num(upcoming)} buổi sắp diễn ra — hệ thống sẽ từ chối. HLV cần hoàn tất hoặc hủy các buổi (theo quy trình dạy bù/hoàn tiền) trước.`
                : "Khóa không còn hiển thị để mua. Học viên, thanh toán và lịch sử được giữ nguyên."
              : "Khóa hiển thị trở lại (nếu đã được duyệt)."
          }
          confirmLabel={cls.isActive ? "Ngừng mở bán" : "Mở bán lại"}
          danger={Boolean(cls.isActive)}
          busy={toggle.isPending}
          error={toggle.error}
          onConfirm={() => toggle.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function ClassForm({ cls, onSaved }: { cls: Row; onSaved: () => void }) {
  const id = str(cls.id);
  const initial = {
    name: str(cls.name),
    fitness: str(cls.fitness),
    description: str(cls.description),
    goal: str(cls.goal),
    capacity: str(cls.capacity),
    classType: str(cls.classType),
    areaType: str(cls.areaType),
    price: String(Number(cls.price ?? 0)),
  };
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (f.name !== initial.name) body.name = f.name.trim();
      if (f.fitness !== initial.fitness) body.fitness = f.fitness.trim();
      if (f.description !== initial.description) body.description = f.description.trim();
      if (f.goal !== initial.goal && f.goal.trim()) body.goal = f.goal.trim();
      if (f.capacity !== initial.capacity) body.capacity = Number(f.capacity);
      if (f.classType !== initial.classType) body.classType = f.classType;
      if (f.areaType !== initial.areaType) body.areaType = f.areaType;
      if (f.price !== initial.price) body.price = Number(f.price);
      return api("PATCH /classes/{id}", { params: { id }, body });
    },
    onSuccess: onSaved,
  });
  const errs = fieldErrors(m.error);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const capBad = !Number.isInteger(Number(f.capacity)) || Number(f.capacity) <= 0 || Number(f.capacity) > 200;
  const priceBad = !(Number(f.price) >= 0);
  const set = (k: keyof typeof initial) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Panel title="Nội dung khóa học">
      <form
        className="cr-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !capBad && !priceBad && !m.isPending) m.mutate();
        }}
        noValidate
      >
        <Field label="Tên khóa" required error={errs.name}>
          <input value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Sức chứa / buổi" required error={capBad ? "Từ 1 đến 200." : errs.capacity}>
          <input type="number" min={1} max={200} value={f.capacity} onChange={set("capacity")} />
        </Field>
        <Field label="Giá (VND)" required error={priceBad ? "Giá không âm." : errs.price}>
          <input type="number" min={0} step={1000} value={f.price} onChange={set("price")} />
        </Field>
        <Field label="Hạng lớp" error={errs.classType}>
          <select value={f.classType} onChange={set("classType")}>
            {Object.entries(CLASS_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Khu vực" error={errs.areaType}>
          <select value={f.areaType} onChange={set("areaType")}>
            {Object.entries(AREA_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mục tiêu khóa học" wide error={errs.goal}>
          <textarea value={f.goal} onChange={set("goal")} />
        </Field>
        <Field label="Mô tả" wide error={errs.description}>
          <textarea value={f.description} onChange={set("description")} />
        </Field>
        <div className="wide" style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
          <button type="button" className="cr-btn ghost" disabled={!dirty || m.isPending} onClick={() => setF(initial)}>
            Hoàn tác
          </button>
          <button className="cr-btn primary" disabled={!dirty || capBad || priceBad || m.isPending}>
            {m.isPending ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
