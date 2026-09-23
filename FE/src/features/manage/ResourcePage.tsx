import { CoachFeedback } from "../../shared/CoachFeedback";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { api, contract } from "../../shared/api";
import { canCompleteSchedule } from "../../shared/businessRules";
import { Attendance } from "../../shared/Attendance";
import { allPages } from "../../shared/pagedApi";
import { TrainingPlans } from "../../shared/TrainingPlans";
import type { RecordData } from "../../shared/api";
import type { Resource } from "./config";
import { at, display, money } from "../../shared/config";
import { useDebouncedValue } from "../../shared/useDebouncedValue";
import {
  Details,
  Empty,
  ErrorState,
  FilterField,
  Loading,
  Modal,
  SchemaForm,
} from "../../shared/ui";
export function ResourcePage({
  resource: r,
  role = "MANAGER",
  userId,
}: {
  resource: Resource;
  role?: string;
  userId?: string;
}) {
  const client = useQueryClient();
  const [query, setQuery] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(query.search);
  const [modal, setModal] = useState<{ kind: string; row?: RecordData } | null>(
    null,
  );
  const [detailTab, setDetailTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const [bError, setBError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const listKey = "GET " + r.path;
  const params = contract[listKey].parameters.filter((p) => p.in === "query");
  const paginated = params.some((p) => p.name === "page");
  const filters = params.filter(
    (p) =>
      !["page", "limit"].includes(p.name) && !(p.name === "role" && r.role),
  );
  const requestQuery = {
    ...query,
    ...(query.search !== undefined ? { search } : {}),
    ...(r.slug === "staff" ? { role: "STAFF" } : {}),
    ...(paginated ? { page: String(page), limit: "10" } : {}),
  };
  const q = useQuery({
    queryKey: ["resource", r.slug, requestQuery],
    queryFn: ({ signal }) =>
      api<RecordData[]>(listKey, { query: requestQuery, signal }),
  });
  const create = "POST " + (r.create || r.path);
  const update = "PATCH " + r.path + "/{id}";
  const remove = "DELETE " + r.path + "/{id}";
  const detailKey = "GET " + r.path + "/{id}";
  const detail = useQuery({
    queryKey: ["detail", r.path, modal?.row?.id],
    queryFn: ({ signal }) =>
      api(detailKey, { params: { id: String(modal!.row!.id) }, signal }),
    enabled: Boolean(modal?.kind === "detail" && modal.row?.id),
  });
  function done() {
    setModal(null);
    setNotice("Đã lưu thay đổi thành công.");
    void client.invalidateQueries();
  }
  async function deactivate() {
    setBusy(true);
    setBError(undefined);
    try {
      await api(
        modal?.kind === "complete"
          ? "PATCH /class-schedules/{id}/complete"
          : remove,
        { params: { id: String(modal!.row!.id) } },
      );
      done();
    } catch (e) {
      setBError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KHÔNG GIAN QUẢN LÝ</div>
          <h1>{r.title}</h1>
          <p>{r.subtitle}</p>
        </div>
        {contract[create]?.body && (
          <button
            className="button primary"
            onClick={() => setModal({ kind: "create" })}
          >
            <Plus size={18} />
            Thêm {r.title.toLowerCase()}
          </button>
        )}
      </div>
      {notice && (
        <div className="success" role="status">
          {notice}
          <button className="text-button" onClick={() => setNotice("")}>
            Đóng
          </button>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Danh sách {r.title.toLowerCase()}</h2>
            <p>
              {q.data?.pagination
                ? `${q.data.pagination.total} kết quả`
                : "Dữ liệu trung tâm"}
            </p>
          </div>
          <button
            aria-label="Tải lại dữ liệu"
            className="icon-button"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw size={18} className={q.isFetching ? "spin" : ""} />
          </button>
        </div>
        <div className="filters">
          {filters.map((p) => (
            <FilterField
              key={p.name}
              name={p.name}
              schema={p.schema}
              value={query[p.name] || ""}
              onChange={(v) => {
                setQuery((prev) => ({ ...prev, [p.name]: v }));
                setPage(1);
              }}
            />
          ))}
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data.data.length ? (
          <Empty
            text="Không tìm thấy kết quả"
            detail="Thử thay đổi bộ lọc hoặc thêm dữ liệu mới."
          />
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={`Danh sách ${r.title.toLowerCase()}, có thể cuộn ngang`}
          >
            <table>
              <thead>
                <tr>
                  {r.columns.map(([k, title]) => (
                    <th key={k}>{title}</th>
                  ))}
                  <th className="right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((row) => (
                  <tr key={String(row.id)}>
                    {r.columns.map(([k], i) => (
                      <td key={k}>
                        {i === 0 ? (
                          <div className="name-cell">
                            <span
                              className={
                                "avatar color-" +
                                (String(row.id).charCodeAt(0) % 4)
                              }
                            >
                              {String(at(row, k) || "?")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <strong>{display(at(row, k))}</strong>
                          </div>
                        ) : [
                            "isActive",
                            "status",
                            "tier",
                            "classType",
                            "role",
                            "trainingLevel",
                          ].includes(k) ? (
                          <span
                            className={
                              "badge " +
                              (at(row, k) === false ||
                              at(row, k) === "CANCELLED"
                                ? "muted"
                                : "")
                            }
                          >
                            {display(at(row, k))}
                          </span>
                        ) : k === "price" ? (
                          money(at(row, k))
                        ) : (
                          display(at(row, k))
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="row-actions">
                        <button
                          title="Xem chi tiết"
                          aria-label="Xem chi tiết"
                          className="icon-button"
                          onClick={() => {
                            setDetailTab("overview");
                            setModal({ kind: "detail", row });
                          }}
                        >
                          <Eye size={17} />
                        </button>
                        {contract[update]?.body && (
                          <button
                            disabled={
                              r.slug === "schedules" &&
                              row.status !== "SCHEDULED"
                            }
                            aria-label="Chỉnh sửa"
                            title="Chỉnh sửa"
                            className="icon-button"
                            onClick={() => setModal({ kind: "edit", row })}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {r.slug === "classes" && (
                          <button
                            aria-label="Phân công huấn luyện viên"
                            title="Phân công huấn luyện viên"
                            className="icon-button"
                            onClick={() => setModal({ kind: "assign", row })}
                          >
                            <UserPlus size={17} />
                          </button>
                        )}
                        {r.slug === "schedules" && (
                          <button
                            className="button small"
                            disabled={!canCompleteSchedule(row)}
                            onClick={() => {
                              setBError(undefined);
                              setModal({ kind: "complete", row });
                            }}
                          >
                            Hoàn tất
                          </button>
                        )}
                        {contract[remove] && (
                          <button
                            aria-label={
                              r.slug === "schedules"
                                ? "Hủy lịch"
                                : "Ngừng hoạt động"
                            }
                            title={
                              r.slug === "schedules"
                                ? "Hủy lịch"
                                : "Ngừng hoạt động"
                            }
                            className="icon-button danger-text"
                            disabled={
                              row.isActive === false ||
                              row.status === "CANCELLED" ||
                              row.status === "COMPLETED" ||
                              (r.path === "/users" && row.id === userId)
                            }
                            onClick={() => {
                              setBError(undefined);
                              setModal({ kind: "delete", row });
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.data?.pagination && (
          <div className="pagination">
            <span>
              Trang {q.data.pagination.page} /{" "}
              {Math.max(1, q.data.pagination.totalPages)} ·{" "}
              {q.data.pagination.total} kết quả
            </span>
            {paginated && (
              <div>
                <button
                  className="button small"
                  disabled={page <= 1 || q.isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ArrowLeft size={15} />
                  Trước
                </button>
                <button
                  className="button small"
                  disabled={
                    page >= q.data.pagination.totalPages || q.isFetching
                  }
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {!paginated && q.data?.pagination && q.data.pagination.totalPages > 1 && (
        <p className="footnote">
          Máy chủ còn dữ liệu ở trang khác nhưng chưa công bố tham số phân trang
          cho danh sách này.
        </p>
      )}
      {["users", "members", "staff", "membership-plans"].includes(r.slug) &&
        !contract[update]?.body && (
          <p className="footnote">
            Chỉnh sửa {r.title.toLowerCase()} sẽ được mở khi backend bổ sung hợp
            đồng cập nhật.
          </p>
        )}
      {modal && (
        <Modal
          dismissible={!busy}
          title={
            modal.kind === "complete"
              ? "Hoàn tất buổi học"
              : modal.kind === "create"
                ? "Thêm " + r.title.toLowerCase()
                : modal.kind === "assign"
                  ? "Phân công huấn luyện viên"
                  : modal.kind === "edit"
                    ? "Chỉnh sửa thông tin"
                    : modal.kind === "delete"
                      ? r.slug === "schedules"
                        ? "Hủy lịch hoạt động"
                        : "Ngừng hoạt động"
                      : "Chi tiết " + r.title.toLowerCase()
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          {["create", "edit", "assign"].includes(modal.kind) ? (
            <SchemaForm
              operation={
                modal.kind === "create"
                  ? create
                  : modal.kind === "assign"
                    ? "POST /classes/{id}/coaches"
                    : update
              }
              params={{ id: String(modal.row?.id) }}
              initial={
                modal.kind === "edit"
                  ? r.slug === "coaches"
                    ? (modal.row?.coachProfile as RecordData)
                    : r.slug === "members"
                      ? { ...modal.row, ...(modal.row?.user as RecordData) }
                      : modal.row
                  : {}
              }
              fixed={
                modal.kind === "create" && r.role
                  ? { role: r.role }
                  : modal.kind === "edit" &&
                      r.path === "/users" &&
                      modal.row?.id === userId
                    ? { role: modal.row?.role, isActive: true }
                    : {}
              }
              onSuccess={done}
              onBusyChange={setBusy}
              onCancel={() => setModal(null)}
            />
          ) : ["delete", "complete"].includes(modal.kind) ? (
            <>
              <p className="confirm-copy">
                {modal.kind === "complete"
                  ? "Chỉ hoàn tất khi buổi học đã kết thúc. Các đăng ký BOOKED sẽ chuyển thành COMPLETED; kết quả điểm danh được lưu riêng."
                  : r.slug === "schedules"
                    ? "Hủy lịch này sẽ tự động hủy tất cả lượt đăng ký BOOKED."
                    : "Bản ghi sẽ được ngừng hoạt động và được lưu lại trong hệ thống."}{" "}
                Bạn có muốn tiếp tục?
              </p>
              {bError != null && <ErrorState error={bError} />}
              <div className="modal-footer">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Quay lại
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={deactivate}
                >
                  {busy ? "Đang xử lý…" : "Xác nhận"}
                </button>
              </div>
            </>
          ) : detail.isPending ? (
            <Loading variant="details" />
          ) : detail.isError ? (
            <ErrorState error={detail.error} retry={() => detail.refetch()} />
          ) : (
            <>
              {["members", "schedules", "classes", "coaches"].includes(
                r.slug,
              ) && (
                <div
                  className="detail-tabs"
                  role="group"
                  aria-label="Nội dung chi tiết"
                >
                  <button
                    className="button small"
                    aria-pressed={detailTab === "overview"}
                    onClick={() => setDetailTab("overview")}
                  >
                    Tổng quan
                  </button>
                  <button
                    className="button small"
                    aria-pressed={detailTab === "related"}
                    onClick={() => setDetailTab("related")}
                  >
                    {r.slug === "members"
                      ? "Gói & tập luyện"
                      : r.slug === "schedules"
                        ? "Học viên & điểm danh"
                        : r.slug === "coaches"
                          ? "Đánh giá"
                          : "Phân công HLV"}
                  </button>
                </div>
              )}
              {detailTab === "overview" && <Details value={detail.data.data} />}
              {detailTab === "related" &&
                r.slug === "coaches" &&
                Boolean(at(detail.data.data, "coachProfile.id")) && (
                  <div className="workflow-card">
                    <CoachFeedback
                      coachId={String(at(detail.data.data, "coachProfile.id"))}
                      role={role}
                    />
                  </div>
                )}
              {detailTab === "related" && r.slug === "members" && (
                <>
                  <MemberStatus id={String(modal.row?.id)} />
                  <div className="workflow-card">
                    <TrainingPlans
                      memberId={String(modal.row?.id)}
                      role={role}
                    />
                  </div>
                </>
              )}
              {detailTab === "related" && r.slug === "schedules" && (
                <Enrollments
                  id={String(modal.row?.id)}
                  schedule={detail.data.data}
                  role={role}
                />
              )}
              {detailTab === "related" && r.slug === "classes" && (
                <CoachAssignments
                  id={String(modal.row?.id)}
                  data={detail.data.data}
                  onUpdate={() => {
                    void detail.refetch();
                    void client.invalidateQueries({ queryKey: ["resource"] });
                  }}
                />
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function MemberStatus({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["membership-status", id],
    queryFn: ({ signal }) =>
      api("GET /members/{id}/membership-status", { params: { id }, signal }),
  });
  return (
    <section className="detail-section">
      <h3>Tình trạng thành viên</h3>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Details value={q.data.data} />
      )}
    </section>
  );
}
function Enrollments({
  id,
  schedule,
  role,
}: {
  id: string;
  schedule: RecordData;
  role: string;
}) {
  const q = useQuery({
    queryKey: ["enrollments", id],
    queryFn: ({ signal }) =>
      allPages<RecordData>("GET /enrollments/schedule/{scheduleId}", {
        params: { scheduleId: id },
        signal,
      }),
  });
  return (
    <section className="detail-section">
      <h3>Danh sách đăng ký</h3>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data.data.length ? (
        <Attendance schedule={schedule} roster={q.data.data} role={role} />
      ) : (
        <Empty text="Chưa có hội viên đăng ký" />
      )}
    </section>
  );
}
function CoachAssignments({
  id,
  data,
  onUpdate,
}: {
  id: string;
  data: RecordData;
  onUpdate: () => void;
}) {
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState("");
  const [confirm, setConfirm] = useState("");
  const coaches = Array.isArray(data.coaches)
    ? (data.coaches as RecordData[])
    : [];
  async function remove(coachId: string) {
    setPending(coachId);
    try {
      await api("DELETE /classes/{id}/coaches/{coachId}", {
        params: { id, coachId },
      });
      setConfirm("");
      onUpdate();
    } catch (e) {
      setError(e);
    } finally {
      setPending("");
    }
  }
  return (
    <section className="detail-section">
      <h3>Điều chỉnh phân công</h3>
      <p className="field-note">
        Hội viên đã đặt các buổi học sắp tới sẽ nhận thông báo khi thay đổi huấn
        luyện viên.
      </p>
      {coaches.map((c, i) => {
        const coachId = String(at(c, "coach.id") || "");
        return (
          <div className="assignment" key={i}>
            <span>{display(at(c, "coach.user.fullName"))}</span>
            {coachId ? (
              <button
                className="button small"
                disabled={Boolean(pending)}
                onClick={() =>
                  confirm === coachId
                    ? void remove(coachId)
                    : setConfirm(coachId)
                }
              >
                {confirm === coachId ? "Xác nhận gỡ" : "Gỡ phân công"}
              </button>
            ) : (
              <small>API chưa trả mã hồ sơ để gỡ phân công.</small>
            )}
          </div>
        );
      })}
      {error != null && <ErrorState error={error} />}
    </section>
  );
}
