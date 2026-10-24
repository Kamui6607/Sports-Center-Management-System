import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api } from "../../../shared/api";
import { ActivePill, ApprovalPill, DataTable, PageHead, Pager, Panel, QueryView, SearchBox, Select, dateTime, get, str, useUrlState } from "../kit";
import type { Row } from "../kit";
import { CreateUserDialog } from "./UsersPage";

export default function CoachesPage() {
  const s = useUrlState({ tab: "list" });
  const tab = s.value("tab");
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHead
        eyebrow="Con người · Đội ngũ"
        title="Huấn luyện viên"
        actions={
          <button className="cr-btn primary" onClick={() => setCreating(true)}>
            <UserPlus size={17} /> Tạo tài khoản HLV
          </button>
        }
      />
      <div className="cr-tabs" role="tablist">
        {[
          ["list", "Danh sách HLV"],
          ["cv", "Hồ sơ CV"],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => s.set({ tab: k, status: "", search: "", isActive: "" })}>
            {l}
          </button>
        ))}
      </div>
      {tab === "cv" ? <CvQueue /> : <CoachList />}
      {creating && <CreateUserDialog role="COACH" onClose={() => setCreating(false)} />}
    </>
  );
}

function CoachList() {
  const s = useUrlState({ tab: "list" });
  const query = { role: "COACH", isActive: s.value("isActive"), search: s.value("search"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "coaches", "list", query],
    queryFn: ({ signal }) => api<Row[]>("GET /users", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel>
      <div className="cr-filters" style={{ marginBottom: 14 }}>
        <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tìm HLV theo tên hoặc email" />
        <Select
          label="Tài khoản"
          value={s.value("isActive")}
          onChange={(v) => s.set({ isActive: v })}
          options={[
            ["true", "Đang hoạt động"],
            ["false", "Bị khóa / chờ duyệt"],
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
                  key: "name",
                  title: "Huấn luyện viên",
                  render: (u) => (
                    <div className="cr-cell-main">
                      <Link to={`/manager/coaches/${str(u.id)}`}>{str(u.fullName)}</Link>
                      <small>{str(u.email)}</small>
                    </div>
                  ),
                },
                { key: "spec", title: "Chuyên môn", render: (u) => str(get(u, "coachProfile.specialization")) || <span className="cr-muted">Chưa cập nhật</span> },
                {
                  key: "exp",
                  title: "Kinh nghiệm",
                  className: "num",
                  render: (u) => (get(u, "coachProfile.experienceYears") != null ? `${str(get(u, "coachProfile.experienceYears"))} năm` : "—"),
                },
                {
                  key: "cv",
                  title: "Hồ sơ CV",
                  render: (u) => <ApprovalPill status={get(u, "coachProfile.certification") ? get(u, "coachProfile.approvalStatus") : "NOT_SUBMITTED"} />,
                },
                { key: "acc", title: "Tài khoản", render: (u) => <ActivePill active={u.isActive} off="Chưa hoạt động" /> },
                {
                  key: "act",
                  title: "",
                  className: "actions",
                  render: (u) => (
                    <Link className="cr-btn sm" to={`/manager/coaches/${str(u.id)}`}>
                      Hồ sơ
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
  );
}

function CvQueue() {
  const s = useUrlState({ tab: "list", status: "PENDING" });
  const query = { status: s.value("status"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "coaches", "cv", query],
    queryFn: ({ signal }) => api<Row[]>("GET /coaches/cv/pending", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel>
      <div className="cr-filters" style={{ marginBottom: 14 }}>
        <Select
          label="Trạng thái hồ sơ"
          all={null}
          value={s.value("status")}
          onChange={(v) => s.set({ status: v })}
          options={[
            ["PENDING", "Chờ duyệt"],
            ["APPROVED", "Đã duyệt"],
            ["REJECTED", "Bị từ chối"],
          ]}
        />
      </div>
      <QueryView q={q}>
        {(res) => (
          <>
            <DataTable
              rows={res.data}
              empty={<div className="cr-state"><h3>Không có hồ sơ</h3><p>Không có hồ sơ CV nào ở trạng thái này.</p></div>}
              columns={[
                {
                  key: "name",
                  title: "Ứng viên",
                  render: (p) => (
                    <div className="cr-cell-main">
                      <Link to={`/manager/coaches/${str(get(p, "user.id"))}`}>{str(get(p, "user.fullName"))}</Link>
                      <small>{str(get(p, "user.email"))}</small>
                    </div>
                  ),
                },
                { key: "spec", title: "Chuyên môn", render: (p) => str(p.specialization) || "—" },
                { key: "sub", title: "Nộp lúc", render: (p) => dateTime(get(p, "certification.submittedAt")) },
                { key: "st", title: "Trạng thái", render: (p) => <ApprovalPill status={p.approvalStatus} /> },
                { key: "why", title: "Lý do từ chối", render: (p) => str(get(p, "certification.rejectReason")) || "—" },
                {
                  key: "act",
                  title: "",
                  className: "actions",
                  render: (p) => (
                    <Link className="cr-btn sm primary" to={`/manager/coaches/${str(get(p, "user.id"))}#cv`}>
                      {p.approvalStatus === "PENDING" ? "Xem & duyệt" : "Xem"}
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
  );
}
