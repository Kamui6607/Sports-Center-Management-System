import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api";
import { allPages } from "../../../shared/pagedApi";
import {
  ActivePill,
  ApprovalPill,
  AREA_LABEL,
  CLASS_TYPE_LABEL,
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
  const fitness = useQuery({ queryKey: ["admin", "classes", "fitness"], queryFn: ({ signal }) => api<string[]>("GET /classes/fitness", { signal }) });
  const query = {
    search: s.value("search"),
    status: s.value("status"),
    coachId: s.value("coachId"),
    fitness: s.value("fitness"),
    classType: s.value("classType"),
    areaType: s.value("areaType"),
    isActive: s.value("isActive"),
    page: String(s.page),
    limit: "15",
  };
  const q = useQuery({
    queryKey: ["admin", "classes", "list", query],
    queryFn: ({ signal }) => api<Row[]>("GET /classes", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHead
        eyebrow="Đào tạo · Khóa học"
        title="Khóa học & lớp"
      />
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
          <Select label="Môn tập" value={s.value("fitness")} onChange={(v) => s.set({ fitness: v })} options={(fitness.data?.data ?? []).map((f) => [f, f])} />
          <Select label="Khu vực" value={s.value("areaType")} onChange={(v) => s.set({ areaType: v })} options={Object.entries(AREA_LABEL)} />
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
                          {str(c.fitness)} · {CLASS_TYPE_LABEL[str(c.classType)] ?? str(c.classType)} · {AREA_LABEL[str(c.areaType)] ?? str(c.areaType)}
                        </small>
                      </div>
                    ),
                  },
                  { key: "h", title: "HLV", render: (c) => str(get(c, "coach.user.fullName")) },
                  { key: "p", title: "Giá", className: "num", render: (c) => vnd(c.price) },
                  { key: "cap", title: "Sức chứa", className: "num", render: (c) => num(c.capacity) },
                  { key: "b", title: "Buổi", className: "num", render: (c) => num(get(c, "_count.schedules")) },
                  { key: "s", title: "Duyệt", render: (c) => <ApprovalPill status={c.status} /> },
                  { key: "a", title: "Mở bán", render: (c) => <ActivePill active={c.isActive} on="Đang mở" off="Ngừng" /> },
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
