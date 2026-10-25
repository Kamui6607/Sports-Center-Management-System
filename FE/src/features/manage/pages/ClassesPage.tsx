import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import {
  ActivePill,
  ApprovalPill,
  ErrorBox,
  Pill,
  CLASS_TYPE_LABEL,
  GOAL_LABEL,
  dateOnly,
  goalLabels,
  DataTable,
  PageHead,
  Pager,
  Panel,
  QueryView,
  SearchBox,
  Select,
  get,
  num,
  str,
  useUrlState,
  vnd,
} from "../kit";
import type { Row } from "../kit";

/** Trạng thái mở bán (`summary.saleState` — BE tính). */
const SALE_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "plain"> = {
  ON_SALE: "ok",
  FULL: "info",
  SALE_CLOSED: "warn",
  ENDED: "plain",
  NOT_OPEN: "plain",
};
/** Lý do hệ thống tự đóng khóa (job bảo trì khóa học). */
const CLOSED_REASON: Record<string, string> = {
  REVIEW_EXPIRED: "tự từ chối: quá hạn duyệt",
  NO_ENROLLMENT: "tự đóng: không có học viên",
  ENDED: "đã kết thúc",
};

/** Danh sách HLV đầy đủ (mọi trang) cho bộ lọc — giá trị là CoachProfile.id. */
export function useCoachOptions() {
  return useQuery({
    queryKey: ["admin", "coaches", "options"],
    queryFn: ({ signal }) => allPages<Row>("GET /users", { query: { role: "COACH" }, signal }),
    staleTime: 60_000,
    select: (res) =>
      res.data
        .filter((u) => get(u, "coachProfile.id"))
        .map((u) => [str(get(u, "coachProfile.id")), str(u.fullName)] as [string, string]),
  });
}

export default function ClassesPage() {
  const s = useUrlState();
  const coaches = useCoachOptions();
  const query = {
    search: s.value("search"),
    status: s.value("status"),
    coachId: s.value("coachId"),
    goal: s.value("goal"),
    classType: s.value("classType"),
    isActive: s.value("isActive"),
    page: String(s.page),
    limit: "15",
  };
  const q = useQuery({
    queryKey: ["admin", "classes", "list", query],
    queryFn: ({ signal }) => api<Row[]>("GET /classes", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const qc = useQueryClient();
  const maintenance = useMutation({
    mutationFn: () => api("POST /classes/maintenance"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "classes"] }),
  });
  return (
    <>
      <PageHead
        eyebrow="Đào tạo · Khóa học"
        title="Khóa học & lớp"
        desc="Khóa quá hạn duyệt, khóa không có học viên khi hết hạn mở bán và khóa đã hết buổi được hệ thống tự xử lý mỗi 5 phút."
        actions={
          <button className="cr-btn" onClick={() => maintenance.mutate()} disabled={maintenance.isPending}>
            {maintenance.isPending ? "Đang chạy…" : "Chạy bảo trì ngay"}
          </button>
        }
      />
      {maintenance.error ? <ErrorBox error={maintenance.error} /> : null}
      {maintenance.data ? (
        <p className="cr-muted">
          Đã xử lý: {num(get(maintenance.data, "data.reviewExpired"))} khóa quá hạn duyệt ·{" "}
          {num(get(maintenance.data, "data.closedNoEnrollment"))} khóa tự đóng · {num(get(maintenance.data, "data.completed"))} khóa kết thúc ·{" "}
          {num(Number(get(maintenance.data, "data.alertedPreStart") ?? 0) + Number(get(maintenance.data, "data.alertedStarted") ?? 0))} cảnh báo HLV.
        </p>
      ) : null}
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tìm theo tên khóa" />
          <Select
            label="Duyệt"
            value={s.value("status")}
            onChange={(v) => s.set({ status: v })}
            options={[
              ["PENDING", "Chờ duyệt"],
              ["APPROVED", "Đã duyệt"],
              ["REJECTED", "Bị từ chối"],
              ["COMPLETED", "Đã kết thúc"],
            ]}
          />
          <Select label="Huấn luyện viên" value={s.value("coachId")} onChange={(v) => s.set({ coachId: v })} options={coaches.data ?? []} />
          <Select label="Mục tiêu" value={s.value("goal")} onChange={(v) => s.set({ goal: v })} options={Object.entries(GOAL_LABEL)} />
          <Select label="Hạng" value={s.value("classType")} onChange={(v) => s.set({ classType: v })} options={Object.entries(CLASS_TYPE_LABEL)} />
          <Select
            label="Mở bán"
            value={s.value("isActive")}
            onChange={(v) => s.set({ isActive: v })}
            options={[
              ["true", "Đang mở"],
              ["false", "Đã ngừng"],
            ]}
          />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                columns={[
                  {
                    key: "n",
                    title: "Khóa học",
                    render: (c) => (
                      <div className="cr-cell-main">
                        <Link to={`/manager/classes/${str(c.id)}`}>{str(c.name)}</Link>
                        <small>
                          {[
                            goalLabels(c.goalTags).join(", "),
                            CLASS_TYPE_LABEL[str(c.classType)] ?? str(c.classType),
                            c.startDate && c.endDate ? `${dateOnly(c.startDate)} – ${dateOnly(c.endDate)}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                    ),
                  },
                  { key: "h", title: "HLV", render: (c) => str(get(c, "coach.user.fullName")) },
                  { key: "p", title: "Giá", className: "num", render: (c) => vnd(c.price) },
                  { key: "cap", title: "Sức chứa", className: "num", render: (c) => num(c.capacity) },
                  { key: "b", title: "Buổi", className: "num", render: (c) => num(get(c, "_count.schedules")) },
                  { key: "s", title: "Duyệt", render: (c) => <ApprovalPill status={c.status} /> },
                  {
                    key: "a",
                    title: "Mở bán",
                    render: (c) => {
                      const sale = str(get(c, "summary.saleState"));
                      const students = Number(get(c, "summary.studentCount") ?? 0);
                      return sale ? (
                        <div className="cr-cell-main">
                          <Pill tone={SALE_TONE[sale] ?? "plain"}>{str(get(c, "summary.saleStateLabel")) || sale}</Pill>
                          <small>
                            {students} học viên
                            {str(c.closedReason) ? ` · ${CLOSED_REASON[str(c.closedReason)] ?? str(c.closedReason)}` : ""}
                          </small>
                        </div>
                      ) : (
                        <ActivePill active={c.isActive} on="Đang mở" off="Ngừng" />
                      );
                    },
                  },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (c) => (
                      <Link className={"cr-btn sm" + (c.status === "PENDING" ? " primary" : "")} to={`/manager/classes/${str(c.id)}`}>
                        {c.status === "PENDING" ? "Xem & duyệt" : "Chi tiết"}
                      </Link>
                    ),
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
    </>
  );
}
