import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanAttendanceQr } from "../../shared/QrAttendance";
import { api, type RecordData } from "../../shared/api";
import { allPages } from "../../shared/pagedApi";
import { display } from "../../shared/config";
import { Empty, ErrorState, Loading, Modal } from "../../shared/ui";
import "../../shared/workflow.css";

type AttendanceRecord = RecordData & {
  id: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  note?: string | null;
  schedule?: { startTime: string; class?: { name?: string } };
};
type AttendanceBucket = {
  classId: string;
  className: string;
  sampleSize: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  noShowCount: number;
  excusedCount: number;
  attendanceRate: number;
  status: "OK" | "WARN" | "RELEASE";
};
type AttendancePenalty = {
  id: string;
  className: string;
  status: "PENDING" | "APPLIED" | "REVOKED" | "EXPIRED";
  reason: string;
  attendanceRate: number;
  sampleSize: number;
  blockedUntil?: string | null;
  canAppeal: boolean;
  appealedAt?: string | null;
  appealReason?: string | null;
};
type AttendanceSummary = {
  thresholds: {
    minSample: number;
    warnBelow: number;
    releaseBelow: number;
    appealWindowHours: number;
  };
  buckets: AttendanceBucket[];
  penalties: AttendancePenalty[];
};
const statusLabels: Record<string, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng mặt",
  LATE: "Đi muộn",
  EXCUSED: "Vắng có phép",
  OK: "Đạt",
  WARN: "Cần cải thiện",
  RELEASE: "Dưới ngưỡng",
};

export function AttendancePage() {
  const cache = useQueryClient();
  const [appeal, setAppeal] = useState<AttendancePenalty | null>(null);
  const [reason, setReason] = useState("");
  const history = useQuery({
    queryKey: ["my-attendance"],
    queryFn: async ({ signal }) => {
      try {
        return await allPages<AttendanceRecord>("GET /attendance/my", { signal });
      } catch (error) {
        // Backward-compatible fallback for an older deployment during rolling updates.
        const enrollments = await allPages<RecordData>("GET /enrollments/my", { signal });
        const eligible = enrollments.data.filter(
          (entry) =>
            entry.status !== "CANCELLED" &&
            Date.parse(String((entry.schedule as RecordData)?.startTime || "")) <= Date.now(),
        );
        const records: AttendanceRecord[] = [];
        for (const enrollment of eligible) {
          const schedule = enrollment.schedule as RecordData;
          const scheduleId = String(enrollment.scheduleId || schedule?.id || "");
          const result = await api<AttendanceRecord[]>("GET /attendance", {
            query: { scheduleId },
            signal,
          });
          const own = result.data.find(
            (record) => record.memberId === enrollment.memberId,
          );
          if (own)
            records.push({
              ...own,
              schedule: (own.schedule as AttendanceRecord["schedule"]) ||
                (schedule as AttendanceRecord["schedule"]),
            });
        }
        if (!records.length && error) throw error;
        return { data: records };
      }
    },
  });
  const summary = useQuery({
    queryKey: ["my-attendance-summary"],
    queryFn: ({ signal }) =>
      api<AttendanceSummary>("GET /attendance/my/summary", { signal }),
  });
  const appealMutation = useMutation({
    mutationFn: () =>
      api("POST /attendance/penalties/{id}/appeal", {
        params: { id: appeal!.id },
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      setAppeal(null);
      setReason("");
      void cache.invalidateQueries({ queryKey: ["my-attendance-summary"] });
    },
  });
  return (
    <div className="workflow-page">
      <h1>Điểm danh & chuyên cần</h1>
      <ScanAttendanceQr />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Tỷ lệ chuyên cần theo lớp</h2>
            <p>Tính trên tối đa 10 buổi đã kết thúc; vắng có phép không làm giảm tỷ lệ.</p>
          </div>
        </div>
        {summary.isPending ? (
          <Loading variant="cards" />
        ) : summary.isError ? (
          <ErrorState error={summary.error} retry={() => summary.refetch()} />
        ) : !summary.data?.data?.buckets?.length ? (
          <Empty text="Chưa đủ dữ liệu chuyên cần" />
        ) : (
          <div className="detail-list">
            {summary.data.data.buckets.map((bucket) => (
              <article className="workflow-card" key={bucket.classId}>
                <div className="panel-heading">
                  <div><h3>{bucket.className}</h3><p>{bucket.sampleSize} buổi được tính</p></div>
                  <strong style={{ fontSize: 24 }}>{bucket.attendanceRate.toLocaleString("vi-VN")} %</strong>
                </div>
                <span className={`badge ${bucket.status === "OK" ? "" : "muted"}`}>{statusLabels[bucket.status]}</span>{" "}
                <small>Có mặt {bucket.presentCount} · muộn {bucket.lateCount} · vắng {bucket.absentCount} · không điểm danh {bucket.noShowCount} · có phép {bucket.excusedCount}</small>
              </article>
            ))}
          </div>
        )}
      </section>
      {summary.data?.data?.penalties?.length ? (
        <section className="panel">
          <h2>Quyết định chuyên cần</h2>
          <div className="detail-list">
            {summary.data.data.penalties.map((penalty) => (
              <article className="workflow-card" key={penalty.id}>
                <div className="panel-heading">
                  <div><h3>{penalty.className}</h3><p>{penalty.reason}</p></div>
                  <span className="badge muted">{display(penalty.status)}</span>
                </div>
                {penalty.blockedUntil && <p>Không thể đặt lại lớp đến {display(penalty.blockedUntil)}.</p>}
                {penalty.appealedAt ? (
                  <p className="success">Đã gửi khiếu nại: {penalty.appealReason}</p>
                ) : penalty.canAppeal ? (
                  <button className="button" onClick={() => { appealMutation.reset(); setAppeal(penalty); }}>Gửi khiếu nại</button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="panel">
        <h2>Lịch sử điểm danh</h2>
        {history.isPending ? (
          <Loading variant="cards" />
        ) : history.isError ? (
          <ErrorState error={history.error} retry={() => history.refetch()} />
        ) : !history.data.data.length ? (
          <Empty text="Chưa có bản ghi điểm danh." />
        ) : (
          <div className="detail-list">
            {history.data.data.map((record) => (
              <article className="workflow-card" key={record.id}>
                <h3>{record.schedule?.class?.name || "Buổi học"}</h3>
                <p>{display(record.schedule?.startTime)}</p>
                <span className="badge">{statusLabels[record.status] || record.status}</span>
                {record.note && <p>{record.note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
      {appeal && (
        <Modal title={`Khiếu nại quyết định · ${appeal.className}`} dismissible={!appealMutation.isPending} onClose={() => setAppeal(null)}>
          <p className="confirm-copy">Nêu rõ lý do và thông tin cần quản lý kiểm tra. Gửi khiếu nại không tự động gỡ quyết định.</p>
          <label>Lý do khiếu nại <b className="required">*</b><textarea value={reason} minLength={5} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
          {appealMutation.error && <ErrorState error={appealMutation.error} />}
          <div className="modal-footer">
            <button className="button" onClick={() => setAppeal(null)}>Đóng</button>
            <button className="button primary" disabled={reason.trim().length < 5 || appealMutation.isPending} onClick={() => appealMutation.mutate()}>{appealMutation.isPending ? "Đang gửi…" : "Gửi khiếu nại"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
