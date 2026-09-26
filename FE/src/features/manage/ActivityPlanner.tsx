import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { api, type RecordData } from "../../shared/api";
import { allPages } from "../../shared/pagedApi";
import { at, display } from "../../shared/config";
import { ErrorState, Loading } from "../../shared/ui";

type AreaType = "INDOOR" | "OUTDOOR" | "POOL";
type Step = { label: string; state: "waiting" | "running" | "done" | "error"; detail?: string };
type Slot = { id: number; start: string; end: string };
const weekdays = [
  [1, "Thứ 2"], [2, "Thứ 3"], [3, "Thứ 4"], [4, "Thứ 5"],
  [5, "Thứ 6"], [6, "Thứ 7"], [0, "Chủ nhật"],
] as const;
function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function datesBetween(from: string, to: string, selected: number[]) {
  if (!from || !to || from > to) return [];
  const result: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  while (cursor <= last && result.length <= 180) {
    if (selected.includes(cursor.getDay())) result.push(localDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function PlannerErrorDialog({
  open,
  error,
  validationErrors,
  partialDataSaved,
  onClose,
}: {
  open: boolean;
  error?: unknown;
  validationErrors: string[];
  partialDataSaved: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="planner-error-dialog" onClose={onClose}>
      <div className="modal-head">
        <div>
          <small>CHƯA THỂ TẠO LỊCH</small>
          <h2><AlertTriangle size={21} /> Kiểm tra lại thông tin</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}><X size={18} /></button>
      </div>
      {validationErrors.length > 0 ? (
        <div className="planner-error-summary" role="alert">
          <p>Vui lòng bổ sung hoặc sửa các mục sau:</p>
          <ul>{validationErrors.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      ) : error != null ? <ErrorState error={error} /> : null}
      {error != null && <p className="field-note planner-rollback-note">{partialDataSaved
        ? "Các bước đã hoàn tất trước khi phát sinh lỗi có thể đã được lưu. Hãy kiểm tra danh sách bộ môn, lớp và lịch trước khi tạo lại để tránh trùng dữ liệu."
        : "Chưa có dữ liệu mới nào được lưu. Thông tin bạn đã nhập vẫn được giữ nguyên để sửa."}</p>}
      <div className="modal-footer">
        <button type="button" className="button primary" onClick={onClose}>Quay lại chỉnh sửa</button>
      </div>
    </dialog>
  );
}

export function ActivityPlanner({ role }: { role: "MANAGER" | "STAFF" }) {
  const cache = useQueryClient();
  const [sportMode, setSportMode] = useState<"existing" | "new">("existing");
  const [sportId, setSportId] = useState("");
  const [sportName, setSportName] = useState("");
  const [sportDescription, setSportDescription] = useState("");
  const [sportAreaType, setSportAreaType] = useState<AreaType>("INDOOR");
  const [className, setClassName] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [classType, setClassType] = useState<"REGULAR" | "PREMIUM">("REGULAR");
  const [areaType, setAreaType] = useState<AreaType>("INDOOR");
  const [coachId, setCoachId] = useState("");
  const [supportCoachId, setSupportCoachId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [slots, setSlots] = useState<Slot[]>([
    { id: 1, start: "18:00", end: "19:00" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [createdClass, setCreatedClass] = useState<RecordData>();
  const [creationCompleted, setCreationCompleted] = useState(false);
  const [partialDataSaved, setPartialDataSaved] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const sports = useQuery({ queryKey: ["planner", "sports"], queryFn: ({ signal }) => allPages<RecordData>("GET /sports", { query: { isActive: "true" }, signal }) });
  const rooms = useQuery({ queryKey: ["planner", "rooms"], queryFn: ({ signal }) => allPages<RecordData>("GET /rooms", { query: { isActive: "true" }, signal }) });
  const coaches = useQuery({ queryKey: ["planner", "coaches"], queryFn: ({ signal }) => allPages<RecordData>("GET /coaches", { signal }) });
  const dates = useMemo(() => datesBetween(fromDate, toDate, selectedDays), [fromDate, toDate, selectedDays]);
  const compatibleRooms = (rooms.data?.data || []).filter(
    (room) => room.areaType === areaType && Number(room.capacity) >= capacity,
  );
  const selectedSport = sports.data?.data.find((sport) => sport.id === sportId);
  const sportCompatible = sportMode === "new"
    ? sportAreaType === areaType
    : !Array.isArray(selectedSport?.areaTypes) ||
      (selectedSport.areaTypes as unknown[]).includes(areaType);
  const validSlots =
    slots.length > 0 &&
    slots.every((slot) => slot.start < slot.end) &&
    slots.every(
      (slot, index) =>
        !slots.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            slot.start < other.end &&
            slot.end > other.start,
        ),
    );
  const totalSchedules = dates.length * slots.length;
  const currentValidationErrors = useMemo(() => {
    const issues: string[] = [];
    if (sportMode === "new" ? sportName.trim().length < 2 : !sportId)
      issues.push(sportMode === "new" ? "Tên bộ môn phải có ít nhất 2 ký tự." : "Chưa chọn bộ môn.");
    if (className.trim().length < 2) issues.push("Tên lớp phải có ít nhất 2 ký tự.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)
      issues.push("Sức chứa phải là số nguyên từ 1 đến 200.");
    if (!sportCompatible) issues.push("Bộ môn không hỗ trợ khu vực đã chọn.");
    if (!coachId) issues.push("Chưa chọn huấn luyện viên chính.");
    if (supportCoachId && supportCoachId === coachId)
      issues.push("Huấn luyện viên hỗ trợ phải khác huấn luyện viên chính.");
    if (!roomId) issues.push("Chưa chọn phòng tập phù hợp.");
    if (!fromDate || !toDate) issues.push("Chưa chọn đủ ngày bắt đầu và ngày kết thúc.");
    else if (fromDate > toDate) issues.push("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
    if (!validSlots) issues.push("Khung giờ phải hợp lệ và không được chồng lấn.");
    if (!selectedDays.length) issues.push("Chưa chọn thứ học trong tuần.");
    else if (fromDate && toDate && fromDate <= toDate && !dates.length)
      issues.push("Khoảng ngày đã chọn không chứa thứ học nào.");
    return issues;
  }, [areaType, capacity, className, coachId, dates.length, fromDate, roomId, selectedDays.length, slots, sportAreaType, sportCompatible, sportId, sportMode, sportName, supportCoachId, toDate, validSlots]);
  const valid = currentValidationErrors.length === 0;
  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) => current.map((step, stepIndex) =>
      stepIndex === index ? { ...step, ...patch } : step,
    ));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      setError(undefined);
      setValidationErrors(currentValidationErrors);
      setErrorDialogOpen(true);
      return;
    }
    setBusy(true); setError(undefined); setCreatedClass(undefined);
    setCreationCompleted(false); setPartialDataSaved(false);
    setValidationErrors([]);
    const labels = [
      sportMode === "new" ? "Tạo bộ môn" : "Dùng bộ môn đã chọn",
      "Tạo lớp học",
      "Phân công HLV chính",
      ...(supportCoachId ? ["Phân công HLV hỗ trợ"] : []),
      `Tạo ${totalSchedules} buổi lịch`,
    ];
    setSteps(labels.map((label, index) => ({
      label,
      state: index === 0 ? "running" : "waiting",
    })));
    let activeStep = 0;
    let hasSavedData = false;
    try {
      let resolvedSportId = sportId;
      if (sportMode === "new") {
        const result = await api<RecordData>("POST /sports", {
          body: {
            name: sportName.trim(),
            description: sportDescription.trim() || undefined,
            areaTypes: [sportAreaType],
          },
        });
        resolvedSportId = String(result.data.id);
        hasSavedData = true;
      }
      updateStep(activeStep++, { state: "done" });

      updateStep(activeStep, { state: "running" });
      const created = await api<RecordData>("POST /classes", {
        body: {
          name: className.trim(),
          description: classDescription.trim() || undefined,
          sportIds: [resolvedSportId],
          capacity,
          classType,
          areaType,
        },
      });
      setCreatedClass(created.data);
      hasSavedData = true;
      const classId = String(created.data.id);
      updateStep(activeStep++, { state: "done" });

      updateStep(activeStep, { state: "running" });
      await api("POST /classes/{id}/coaches", {
        params: { id: classId },
        body: { coachId, isPrimary: true },
      });
      updateStep(activeStep++, { state: "done" });

      if (supportCoachId) {
        updateStep(activeStep, { state: "running" });
        await api("POST /classes/{id}/coaches/support", {
          params: { id: classId },
          body: { coachId: supportCoachId },
        });
        updateStep(activeStep++, { state: "done" });
      }

      updateStep(activeStep, {
        state: "running",
        detail: `0/${totalSchedules} buổi`,
      });
      let createdCount = 0;
      for (const date of dates) {
        for (const slot of slots) {
          await api("POST /class-schedules", {
            body: {
              classId,
              roomId,
              startTime: new Date(`${date}T${slot.start}:00+07:00`).toISOString(),
              endTime: new Date(`${date}T${slot.end}:00+07:00`).toISOString(),
            },
          });
          createdCount += 1;
          updateStep(activeStep, { detail: `${createdCount}/${totalSchedules} buổi` });
        }
      }
      updateStep(activeStep, {
        state: "done",
        detail: `${totalSchedules}/${totalSchedules} buổi`,
      });
      setCreationCompleted(true);
      void cache.invalidateQueries({ queryKey: ["resource"] });
      void cache.invalidateQueries({ queryKey: ["planner"] });
    } catch (caught) {
      updateStep(activeStep, { state: "error" });
      setPartialDataSaved(hasSavedData);
      setError(caught);
      setErrorDialogOpen(true);
    } finally { setBusy(false); }
  }
  if (sports.isPending || rooms.isPending || coaches.isPending) return <Loading variant="page" text="Đang chuẩn bị dữ liệu cho biểu mẫu…" />;
  const loadError = sports.error || rooms.error || coaches.error;
  if (loadError) return <ErrorState error={loadError} />;
  return (
    <div className="workflow-page planner-page">
      <div className="page-heading"><div><div className="eyebrow">MỘT FORM · TRỌN VẸN MỘT LỊCH HOẠT ĐỘNG</div><h1>Tạo lịch hoạt động nhanh</h1><p>Tạo bộ môn (nếu cần), lớp, phân công HLV và toàn bộ lịch lặp chỉ trong một lần nhập.</p></div></div>
      <form noValidate onSubmit={submit}>
        <fieldset disabled={busy} className="planner-grid">
          <section className="panel planner-section"><span className="planner-number">1</span><div><h2>Bộ môn</h2><p>Chọn bộ môn có sẵn hoặc tạo mới.</p></div><div className="form-grid wide">
            <label>Phương án<select value={sportMode} onChange={(event) => setSportMode(event.target.value as "existing" | "new")}><option value="existing">Dùng bộ môn có sẵn</option>{role === "MANAGER" && <option value="new">Tạo bộ môn mới</option>}</select></label>
            {sportMode === "existing" ? <label>Bộ môn <b className="required">*</b><select value={sportId} onChange={(event) => setSportId(event.target.value)}><option value="">Chọn bộ môn</option>{sports.data.data.map((sport) => <option key={String(sport.id)} value={String(sport.id)}>{display(sport.name)}</option>)}</select></label> : <><label>Tên bộ môn <b className="required">*</b><input value={sportName} minLength={2} onChange={(event) => setSportName(event.target.value)} /></label><label>Loại khu vực <b className="required">*</b><select value={sportAreaType} onChange={(event) => setSportAreaType(event.target.value as AreaType)}><option value="INDOOR">Trong nhà</option><option value="OUTDOOR">Ngoài trời</option><option value="POOL">Hồ bơi</option></select></label><label className="wide">Mô tả bộ môn<textarea value={sportDescription} onChange={(event) => setSportDescription(event.target.value)} /></label></>}
            {role === "STAFF" && <p className="field-note wide">Lễ tân có thể dùng bộ môn sẵn có. Chỉ quản lý được tạo bộ môn mới.</p>}
          </div></section>
          <section className="panel planner-section"><span className="planner-number">2</span><div><h2>Thông tin lớp</h2><p>Khu vực quyết định phòng nào có thể sử dụng.</p></div><div className="form-grid wide">
            <label>Tên lớp <b className="required">*</b><input value={className} minLength={2} onChange={(event) => setClassName(event.target.value)} /></label>
            <label>Loại lớp<select value={classType} onChange={(event) => setClassType(event.target.value as "REGULAR" | "PREMIUM")}><option value="REGULAR">Tiêu chuẩn</option><option value="PREMIUM">Cao cấp</option></select></label>
            <label>Khu vực<select value={areaType} onChange={(event) => { setAreaType(event.target.value as AreaType); setRoomId(""); }}><option value="INDOOR">Trong nhà</option><option value="OUTDOOR">Ngoài trời</option><option value="POOL">Hồ bơi</option></select></label>
            <label>Sức chứa<input type="number" min={1} max={200} value={capacity} onChange={(event) => { setCapacity(Number(event.target.value)); setRoomId(""); }} /></label>
            <label className="wide">Mô tả lớp<textarea value={classDescription} onChange={(event) => setClassDescription(event.target.value)} /></label>
            {!sportCompatible && <p className="error wide" role="alert">Bộ môn đã chọn không hỗ trợ khu vực này.</p>}
          </div></section>
          <section className="panel planner-section"><span className="planner-number">3</span><div><h2>Huấn luyện viên & phòng</h2><p>Phòng được lọc theo khu vực và sức chứa.</p></div><div className="form-grid wide">
            <label>HLV chính <b className="required">*</b><select value={coachId} onChange={(event) => { setCoachId(event.target.value); if (supportCoachId === event.target.value) setSupportCoachId(""); }}><option value="">Chọn HLV chính</option>{coaches.data.data.map((coach) => { const id = at(coach, "coachProfile.id"); return id ? <option key={String(id)} value={String(id)}>{display(coach.fullName)}</option> : null; })}</select></label>
            <label>HLV hỗ trợ<select value={supportCoachId} onChange={(event) => setSupportCoachId(event.target.value)}><option value="">Không có</option>{coaches.data.data.map((coach) => { const id = at(coach, "coachProfile.id"); return id && id !== coachId ? <option key={String(id)} value={String(id)}>{display(coach.fullName)}</option> : null; })}</select></label>
            <label>Phòng tập <b className="required">*</b><select value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Chọn phòng phù hợp</option>{compatibleRooms.map((room) => <option key={String(room.id)} value={String(room.id)}>{display(room.name)} · {display(room.capacity)} chỗ</option>)}</select></label>
            {!compatibleRooms.length && <p className="field-note">Không có phòng đang hoạt động phù hợp khu vực và sức chứa.</p>}
          </div></section>
          <section className="panel planner-section"><span className="planner-number">4</span><div><h2>Lịch lặp</h2><p>Chọn khoảng ngày, nhiều thứ và một khung giờ cho mỗi buổi.</p></div><div className="form-grid wide">
            <label>Từ ngày <b className="required">*</b><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>Đến ngày <b className="required">*</b><input type="date" min={fromDate} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
            <div className="wide"><span className="field-label">Các khung giờ trong mỗi ngày <b className="required">*</b></span><div className="slot-list">{slots.map((slot, slotIndex) => <div key={slot.id}><label>Slot {slotIndex + 1} bắt đầu<input type="time" value={slot.start} onChange={(event) => setSlots((current) => current.map((item) => item.id === slot.id ? { ...item, start: event.target.value } : item))} /></label><label>Slot {slotIndex + 1} kết thúc<input type="time" min={slot.start} value={slot.end} onChange={(event) => setSlots((current) => current.map((item) => item.id === slot.id ? { ...item, end: event.target.value } : item))} /></label><button type="button" className="icon-button danger-text" aria-label={`Xóa slot ${slotIndex + 1}`} disabled={slots.length === 1} onClick={() => setSlots((current) => current.filter((item) => item.id !== slot.id))}><Trash2 size={16} /></button></div>)}</div><button type="button" className="button small" onClick={() => setSlots((current) => [...current, { id: Math.max(...current.map((slot) => slot.id)) + 1, start: "19:00", end: "20:00" }])}><Plus size={15} /> Thêm slot giờ</button>{!validSlots && <p className="error" role="alert">Các slot phải có giờ kết thúc sau giờ bắt đầu và không được chồng lấn.</p>}</div>
            <div className="wide"><span className="field-label">Học vào các thứ <b className="required">*</b></span><div className="weekday-picker">{weekdays.map(([value, text]) => <label key={value}><input type="checkbox" checked={selectedDays.includes(value)} onChange={(event) => setSelectedDays((current) => event.target.checked ? [...current, value] : current.filter((day) => day !== value))} />{text}</label>)}</div></div>
            <div className="planner-preview wide"><CalendarDays size={18} /><span>{dates.length ? `${totalSchedules} buổi sẽ được tạo (${dates.length} ngày × ${slots.length} slot) · ${dates.slice(0, 3).map((date) => new Date(`${date}T12:00:00`).toLocaleDateString("vi-VN")).join(", ")}${dates.length > 3 ? "…" : ""}` : "Chọn khoảng ngày và thứ học để xem số buổi."}</span></div>
          </div></section>
        </fieldset>
        {steps.length > 0 && <section className="panel planner-progress"><h2>Tiến độ tạo dữ liệu</h2>{steps.map((step) => <div key={step.label} className={step.state}>{step.state === "running" ? <LoaderCircle className="spin" size={18} /> : step.state === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}<span>{step.label}</span><small>{step.detail}</small></div>)}</section>}
        {error != null && <ErrorState error={error} />}
        {creationCompleted && createdClass && error == null && !busy && <p className="success" role="status">Đã tạo lớp “{display(createdClass.name)}” và {totalSchedules} buổi lịch thành công.</p>}
        {partialDataSaved && error != null && <p className="field-note">Một số bước trước lỗi đã hoàn tất. Hãy kiểm tra dữ liệu đã tạo trước khi thực hiện lại.</p>}
        <div className="planner-submit"><div><strong>{totalSchedules} buổi lịch</strong><small>Hệ thống sẽ tạo lần lượt bộ môn, lớp, phân công HLV và từng buổi lịch.</small></div>{creationCompleted || partialDataSaved ? <button type="button" className="button" onClick={() => { setCreatedClass(undefined); setCreationCompleted(false); setPartialDataSaved(false); setSteps([]); setError(undefined); setClassName(""); setClassDescription(""); setFromDate(""); setToDate(""); setSelectedDays([]); }}>Bắt đầu lịch khác</button> : <button className="button primary" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Đang tạo dữ liệu…</> : "Tạo toàn bộ lịch hoạt động"}</button>}</div>
      </form>
      <PlannerErrorDialog open={errorDialogOpen} error={error} validationErrors={validationErrors} partialDataSaved={partialDataSaved} onClose={() => setErrorDialogOpen(false)} />
    </div>
  );
}
