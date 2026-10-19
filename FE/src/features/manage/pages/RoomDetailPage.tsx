import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, Pencil, Power } from "lucide-react";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import { ActivePill, AREA_LABEL, ConfirmDialog, Dialog, Dl, ErrorBox, Field, PageHead, Panel, Pill, QueryView, dateTime, num, str } from "../kit";
import type { Row } from "../kit";
import { RoomDialog } from "./RoomsPage";
import { ScheduleDetailDialog, ScheduleLegend, WeekCalendar, WeekNav, mondayOf, todayKey, useWeekSchedules } from "./scheduleKit";

export default function RoomDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["admin", "rooms", "detail", id], queryFn: ({ signal }) => api<Row>("GET /rooms/{id}", { params: { id }, signal }) });
  return <QueryView q={q} rows={6}>{(res) => <RoomDetail room={res.data} />}</QueryView>;
}

function RoomDetail({ room }: { room: Row }) {
  const id = str(room.id);
  const [week, setWeek] = useState(mondayOf(todayKey()));
  const [selected, setSelected] = useState("");
  const [dialog, setDialog] = useState<"edit" | "toggle" | "transfer" | null>(null);
  const cache = useQueryClient();
  const sched = useWeekSchedules(week, { roomId: id });
  const upcoming = useQuery({
    queryKey: ["admin", "schedules", "roomUpcoming", id],
    queryFn: ({ signal }) => api<Row[]>("GET /class-schedules", { query: { roomId: id, status: "SCHEDULED", from: new Date().toISOString(), limit: "1" }, signal }),
  });
  const upcomingCount = upcoming.data?.pagination?.total ?? 0;
  const toggle = useMutation({
    mutationFn: () => (room.isActive ? api("DELETE /rooms/{id}", { params: { id } }) : api("PATCH /rooms/{id}", { params: { id }, body: { isActive: true } })),
    onSuccess: () => {
      setDialog(null);
      void cache.invalidateQueries({ queryKey: ["admin", "rooms"] });
    },
  });
  return (
    <>
      <PageHead
        back={
          <Link className="cr-crumb" to="/manager/rooms">
            <ArrowLeft size={15} /> Phòng tập
          </Link>
        }
        eyebrow={`Phòng tập · ${AREA_LABEL[str(room.areaType)] ?? str(room.areaType)}`}
        title={str(room.name)}
        desc={<ActivePill active={room.isActive} on="Đang sử dụng" off="Ngừng sử dụng" />}
        actions={
          <>
            <button className="cr-btn" onClick={() => setDialog("edit")}>
              <Pencil size={16} /> Sửa
            </button>
            <button className="cr-btn" onClick={() => setDialog("transfer")} disabled={!upcomingCount}>
              <ArrowRightLeft size={16} /> Chuyển lịch sang phòng khác
            </button>
            <button className={"cr-btn " + (room.isActive ? "danger" : "")} onClick={() => setDialog("toggle")}>
              <Power size={16} /> {room.isActive ? "Ngừng sử dụng" : "Mở lại"}
            </button>
          </>
        }
      />
      <div className="cr-kpis">
        <div className="cr-kpi">
          <div className="cr-kpi-label">Sức chứa</div>
          <div className="cr-kpi-value">{num(room.capacity)}</div>
          <div className="cr-kpi-note">người / buổi</div>
        </div>
        <div className="cr-kpi">
          <div className="cr-kpi-label">Buổi sắp tới</div>
          <div className="cr-kpi-value">{upcoming.isPending ? "…" : num(upcomingCount)}</div>
          <div className="cr-kpi-note">đang lên lịch tại phòng</div>
        </div>
        <div className="cr-kpi">
          <div className="cr-kpi-label">Vị trí</div>
          <div className="cr-kpi-value" style={{ fontSize: 18, fontFamily: "inherit" }}>{[room.floor, room.location].filter(Boolean).map(str).join(" · ") || "—"}</div>
          <div className="cr-kpi-note">Cập nhật {dateTime(room.updatedAt)}</div>
        </div>
      </div>
      <Panel title="Lịch sử dụng phòng" desc="Chọn một buổi để xem học viên." actions={<WeekNav week={week} onWeek={setWeek} />}>
        <div style={{ display: "grid", gap: 12 }}>
          <ScheduleLegend />
          <QueryView q={sched}>{(res) => <WeekCalendar week={week} rows={res.data} onSelect={setSelected} showRoom={false} />}</QueryView>
        </div>
      </Panel>
      {selected && <ScheduleDetailDialog id={selected} onClose={() => setSelected("")} />}
      {dialog === "edit" && <RoomDialog room={room} onClose={() => setDialog(null)} />}
      {dialog === "transfer" && <TransferDialog room={room} onClose={() => setDialog(null)} />}
      {dialog === "toggle" && (
        <ConfirmDialog
          title={room.isActive ? "Ngừng sử dụng phòng" : "Mở lại phòng"}
          target={str(room.name)}
          consequence={
            room.isActive
              ? upcomingCount
                ? `Phòng còn ${num(upcomingCount)} buổi sắp tới — hệ thống sẽ từ chối. Hãy chuyển lịch sang phòng khác trước.`
                : "Phòng không nhận lịch mới. Lịch sử sử dụng được giữ nguyên."
              : "Phòng có thể được HLV xếp lịch trở lại."
          }
          confirmLabel={room.isActive ? "Ngừng sử dụng" : "Mở lại"}
          danger={Boolean(room.isActive)}
          busy={toggle.isPending}
          error={toggle.error}
          onConfirm={() => toggle.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function TransferDialog({ room, onClose }: { room: Row; onClose: () => void }) {
  const id = str(room.id);
  const [f, setF] = useState({ targetRoomId: "", from: "", to: "", reason: "" });
  const cache = useQueryClient();
  const rooms = useQuery({
    queryKey: ["admin", "rooms", "all-active", str(room.areaType)],
    queryFn: ({ signal }) => allPages<Row>("GET /rooms", { query: { isActive: "true" }, signal }),
  });
  const body = () => ({
    targetRoomId: f.targetRoomId,
    ...(f.from ? { from: new Date(f.from).toISOString() } : {}),
    ...(f.to ? { to: new Date(f.to).toISOString() } : {}),
    ...(f.reason.trim() ? { reason: f.reason.trim() } : {}),
  });
  const preview = useMutation({ mutationFn: () => api<Row>("POST /rooms/{roomId}/transfer-schedules/preview", { params: { roomId: id }, body: body() }) });
  const commit = useMutation({
    mutationFn: () => api<Row>("POST /rooms/{roomId}/transfer-schedules", { params: { roomId: id }, body: body() }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "schedules"] });
      onClose();
    },
  });
  const p = preview.data?.data;
  const conflicts = (p?.conflicts ?? []) as Row[];
  const reset = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch });
    preview.reset();
  };
  return (
    <Dialog
      title={`Chuyển lịch khỏi ${str(room.name)}`}
      eyebrow="Phòng tập · Chuyển lịch"
      wide
      onClose={onClose}
      busy={preview.isPending || commit.isPending}
      footer={
        <>
          <button className="cr-btn ghost" onClick={onClose} disabled={commit.isPending}>
            Hủy
          </button>
          <button className="cr-btn" disabled={!f.targetRoomId || preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending ? "Đang kiểm tra…" : "Kiểm tra xung đột"}
          </button>
          <button className="cr-btn primary" disabled={!p?.canTransfer || !Number(p?.totalSchedules) || commit.isPending} onClick={() => commit.mutate()}>
            {commit.isPending ? "Đang chuyển…" : `Chuyển ${num(p?.validSchedules ?? 0)} buổi`}
          </button>
        </>
      }
    >
      <div className="cr-form">
        <Field label="Phòng đích" required wide hint="Phải cùng loại khu vực và đủ sức chứa của từng lớp.">
          <select value={f.targetRoomId} onChange={(e) => reset({ targetRoomId: e.target.value })}>
            <option value="">— Chọn phòng —</option>
            {(rooms.data?.data ?? [])
              .filter((r) => r.id !== id)
              .map((r) => (
                <option key={str(r.id)} value={str(r.id)}>
                  {str(r.name)} · {AREA_LABEL[str(r.areaType)]} · {num(r.capacity)} chỗ
                </option>
              ))}
          </select>
        </Field>
        <Field label="Từ thời điểm" hint="Bỏ trống = từ bây giờ.">
          <input type="datetime-local" value={f.from} onChange={(e) => reset({ from: e.target.value })} />
        </Field>
        <Field label="Đến thời điểm" hint="Bỏ trống = mọi buổi sắp tới.">
          <input type="datetime-local" value={f.to} onChange={(e) => reset({ to: e.target.value })} />
        </Field>
        <Field label="Lý do (gửi kèm thông báo cho học viên)" wide>
          <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="VD: Phòng đang bảo trì" maxLength={500} />
        </Field>
      </div>
      {rooms.isError ? <ErrorBox error={rooms.error} /> : null}
      {preview.error ? <ErrorBox error={preview.error} /> : null}
      {p && (
        <div style={{ display: "grid", gap: 10 }}>
          <Dl
            items={[
              ["Buổi trong phạm vi", num(p.totalSchedules)],
              ["Hợp lệ", num(p.validSchedules)],
              ["Xung đột", num(p.invalidSchedules)],
              ["Kết quả", p.canTransfer ? (Number(p.totalSchedules) ? <Pill tone="ok" key="k">Có thể chuyển toàn bộ</Pill> : "Không có buổi nào") : <Pill tone="bad" key="k">Không chuyển được</Pill>],
            ]}
          />
          {conflicts.length > 0 && (
            <>
              <div className="cr-alert">
                <div>Việc chuyển là "tất cả hoặc không": còn xung đột thì không buổi nào bị dời. Chọn phòng khác hoặc thu hẹp khoảng thời gian.</div>
              </div>
              <ul className="cr-list">
                {conflicts.map((c) => (
                  <li key={str(c.scheduleId)}>
                    <span className="cr-mono">{dateTime(c.startTime)}</span>
                    <span className="cr-muted" style={{ textAlign: "right" }}>{str(c.reason)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {commit.error ? <ErrorBox error={commit.error} /> : null}
    </Dialog>
  );
}
