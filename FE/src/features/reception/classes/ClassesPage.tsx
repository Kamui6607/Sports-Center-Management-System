import { useState } from "react";
import type { RecordData } from "../../../shared/api";
import { at, display } from "../../../shared/config";
import { useReceptionList } from "../api";
import {
  ActionForm,
  Heading,
  ListState,
  MemberPicker,
  Table,
} from "../components";
export function ClassesPage() {
  const [member, setMember] = useState<RecordData | null>(null);
  const [page, setPage] = useState(1);
  const [schedule, setSchedule] = useState<RecordData | null>(null);
  const [action, setAction] = useState<{ cancelId?: string } | null>(null);
  const schedules = useReceptionList("GET /class-schedules", {
    page: String(page),
    limit: "10",
  });
  const enrollments = useReceptionList(
    "GET /enrollments/schedule/{scheduleId}",
    {},
    { scheduleId: String(schedule?.id || "") },
    Boolean(schedule),
  );
  return (
    <>
      <Heading title="Đăng ký lớp học" />
      <MemberPicker
        value={member}
        onChange={(m) => {
          setMember(m);
          setAction(null);
        }}
      />
      <section className="panel reception-section">
        <h2>Lịch học</h2>
        <ListState result={schedules}>
          {(rows) => (
            <Table
              rows={rows}
              columns={[
                ["class.name", "Lớp học"],
                ["room.name", "Phòng"],
                ["startTime", "Bắt đầu"],
                ["endTime", "Kết thúc"],
                ["status", "Trạng thái"],
              ]}
              actions={(row) => (
                <button
                  className="button small"
                  onClick={() => setSchedule(row)}
                >
                  Xem đăng ký
                </button>
              )}
            />
          )}
        </ListState>
        <div className="pagination">
          <button
            className="button"
            disabled={page <= 1 || schedules.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </button>
          <span>Trang {page}</span>
          <button
            className="button"
            disabled={
              schedules.isFetching ||
              !schedules.data?.pagination ||
              page >= schedules.data.pagination.totalPages
            }
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </button>
        </div>
      </section>
      {schedule && (
        <section className="panel reception-section">
          <h2>
            {display(at(schedule, "class.name"))} ·{" "}
            {display(schedule.startTime)}
          </h2>
          <button
            className="button primary"
            disabled={
              !member ||
              schedule.status !== "SCHEDULED" ||
              new Date(String(schedule.startTime)).getTime() <= Date.now()
            }
            onClick={() => setAction({})}
          >
            Đăng ký cho hội viên đã chọn
          </button>
          <p>
            Danh sách dưới đây gồm tất cả hội viên của buổi học. Kiểm tra đúng
            tên và email trước khi hủy.
          </p>
          <ListState result={enrollments}>
            {(rows) => (
              <Table
                rows={rows}
                columns={[
                  ["member.user.fullName", "Hội viên"],
                  ["member.user.email", "Email"],
                  ["status", "Trạng thái"],
                  ["bookedAt", "Đăng ký lúc"],
                ]}
                actions={(row) => (
                  <button
                    className="button small"
                    disabled={row.status !== "BOOKED" || !row.id}
                    onClick={() => setAction({ cancelId: String(row.id) })}
                  >
                    Hủy đăng ký của {display(at(row, "member.user.fullName"))}
                  </button>
                )}
              />
            )}
          </ListState>
        </section>
      )}
      {action && schedule && (
        <ActionForm
          title={
            action.cancelId
              ? "Hủy đăng ký lớp"
              : `Đăng ký ${display(at(schedule, "class.name"))} cho ${display(at(member, "user.fullName"))}`
          }
          operation={
            action.cancelId ? "DELETE /enrollments/{id}" : "POST /enrollments"
          }
          params={action.cancelId ? { id: action.cancelId } : undefined}
          fixed={
            action.cancelId
              ? undefined
              : { scheduleId: schedule.id, memberId: member?.id }
          }
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
