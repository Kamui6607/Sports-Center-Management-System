import { ScanAttendanceQr } from "../../shared/QrAttendance";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, type RecordData } from "../../shared/api";
import { allPages } from "../../shared/pagedApi";
import { at, display } from "../../shared/config";
import { Empty, ErrorState, Loading } from "../../shared/ui";
import type { AttendanceRecord } from "../../shared/Attendance";
import "../../shared/workflow.css";
export function AttendancePage() {
  const { user } = useAuth();
  const memberId = String(at(user, "memberProfile.id") || "");
  const q = useQuery({
    queryKey: ["my-attendance", memberId],
    enabled: Boolean(memberId),
    queryFn: async ({ signal }) => {
      const enrollments = await allPages<RecordData>("GET /enrollments/my", {
        signal,
      });
      const result: {
        enrollment: RecordData;
        attendance?: AttendanceRecord;
      }[] = [];
      const eligible = enrollments.data.filter(
        (e) =>
          e.status !== "CANCELLED" &&
          Date.parse(String(at(e, "schedule.startTime"))) <= Date.now(),
      );
      for (let i = 0; i < eligible.length; i += 4) {
        result.push(
          ...(await Promise.all(
            eligible.slice(i, i + 4).map(async (enrollment) => {
              const scheduleId = String(
                enrollment.scheduleId || at(enrollment, "schedule.id"),
              );
              const records = await api<AttendanceRecord[]>("GET /attendance", {
                query: { scheduleId },
                signal,
              });
              return {
                enrollment,
                attendance: records.data.find(
                  (a) => a.memberId === memberId && a.scheduleId === scheduleId,
                ),
              };
            }),
          )),
        );
      }
      return result.sort(
        (a, b) =>
          Date.parse(String(at(b.enrollment, "schedule.startTime"))) -
          Date.parse(String(at(a.enrollment, "schedule.startTime"))),
      );
    },
  });
  const statuses: Record<string, string> = {
    PRESENT: "Có mặt",
    ABSENT: "Vắng mặt",
    LATE: "Đi muộn",
    EXCUSED: "Vắng có phép",
  };
  return (
    <div className="workflow-page">
      <h1>Điểm danh</h1>
      <ScanAttendanceQr />
      <h2>Lịch sử điểm danh</h2>
      <p>
        Kết quả do huấn luyện viên hoặc quản lý ghi nhận. Buổi học hoàn thành
        chưa đồng nghĩa với có mặt.
      </p>
      {!memberId ? (
        <Empty text="Chưa có hồ sơ hội viên." />
      ) : q.isPending ? (
        <Loading variant="cards" />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data.length ? (
        <Empty text="Chưa có buổi học để hiển thị." />
      ) : (
        q.data.map(({ enrollment: e, attendance: a }) => (
          <article className="panel workflow-card" key={String(e.id)}>
            <h2>{String(at(e, "schedule.class.name") || "Buổi học")}</h2>
            <p>{display(at(e, "schedule.startTime"))}</p>
            <span className="badge">
              {a ? statuses[a.status] || a.status : "Chưa điểm danh"}
            </span>
            {a?.note && <p>{a.note}</p>}
          </article>
        ))
      )}
    </div>
  );
}
