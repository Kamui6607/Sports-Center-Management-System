import { AttendanceQr } from "./QrAttendance";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RecordData } from "./api";
import { at, display } from "./config";
import { Empty, ErrorState, Loading } from "./ui";
import "./workflow.css";
const statuses: Record<string, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng mặt",
  LATE: "Đi muộn",
  EXCUSED: "Vắng có phép",
};
export type AttendanceRecord = {
  id: string;
  memberId: string;
  scheduleId: string;
  status: string;
  note?: string;
};
export function Attendance({
  schedule,
  roster,
  role,
}: {
  schedule: RecordData;
  roster: RecordData[];
  role: string;
}) {
  const id = String(schedule.id),
    cache = useQueryClient();
  const q = useQuery({
    queryKey: ["attendance", id],
    queryFn: ({ signal }) =>
      api<AttendanceRecord[]>("GET /attendance", {
        query: { scheduleId: id },
        signal,
      }),
  });
  const canWrite =
    ["MANAGER", "COACH"].includes(role) &&
    schedule.status !== "CANCELLED" &&
    Date.parse(String(schedule.startTime)) <= Date.now();
  return (
    <section className="workflow-page">
      <h3>Điểm danh buổi học</h3>
      {["MANAGER", "COACH"].includes(role) &&
        schedule.status === "SCHEDULED" && <AttendanceQr scheduleId={id} />}
      <p>
        Hoàn tất lịch học không tự xác nhận hội viên có mặt. Mỗi học viên cần
        được ghi nhận riêng.
      </p>
      {!canWrite && (
        <p>
          Chỉ quản lý hoặc huấn luyện viên phụ trách được điểm danh khi buổi học
          đã bắt đầu.
        </p>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !roster.length ? (
        <Empty text="Chưa có học viên." />
      ) : (
        roster
          .filter((r) => ["BOOKED", "COMPLETED"].includes(String(r.status)))
          .map((r) => {
            const mid = String(r.memberId || at(r, "member.id") || ""),
              record = q.data.data.find(
                (a) => a.memberId === mid && a.scheduleId === id,
              );
            return (
              <AttendanceRow
                key={`${mid}-${record?.id}-${record?.status}-${record?.note}`}
                name={String(at(r, "member.user.fullName") || "Học viên")}
                memberId={mid}
                scheduleId={id}
                record={record}
                writable={canWrite}
                onSave={() => {
                  void cache.invalidateQueries({
                    queryKey: ["attendance", id],
                  });
                }}
              />
            );
          })
      )}
    </section>
  );
}
function AttendanceRow({
  name,
  memberId,
  scheduleId,
  record,
  writable,
  onSave,
}: {
  name: string;
  memberId: string;
  scheduleId: string;
  record?: AttendanceRecord;
  writable: boolean;
  onSave: () => void;
}) {
  const [status, setStatus] = useState(record?.status || ""),
    [note, setNote] = useState(record?.note || "");
  const save = useMutation({
    mutationFn: () =>
      api(record ? "PATCH /attendance/{id}" : "POST /attendance", {
        params: { id: record?.id || "" },
        body: {
          ...(record ? {} : { memberId, scheduleId }),
          status,
          note: note.trim(),
        },
      }),
    onSuccess: onSave,
  });
  return (
    <details className="feedback-card">
      <summary>
        <strong>{name}</strong> ·{" "}
        {record
          ? statuses[record.status] || display(record.status)
          : "Chưa điểm danh"}
      </summary>
      {writable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!save.isPending && status) save.mutate();
          }}
        >
          <fieldset disabled={save.isPending}>
            <label>
              Kết quả điểm danh
              <select
                required
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Chưa điểm danh</option>
                {Object.entries(statuses).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ghi chú
              <input
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button className="button small" disabled={!status}>
              {save.isPending ? "Đang lưu…" : "Lưu điểm danh"}
            </button>
          </fieldset>
        </form>
      ) : (
        <p>
          {record
            ? statuses[record.status] || display(record.status)
            : "Chưa điểm danh"}
          {record?.note ? ` · ${record.note}` : ""}
        </p>
      )}
      {save.error && <ErrorState error={save.error} />}
    </details>
  );
}
