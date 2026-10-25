import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, FileText, X } from "lucide-react";
import { api, apiBlob } from "../../../shared/api";
import {
  EmptyState,
  SalePill,
  ActivePill,
  ApprovalPill,
  ConfirmDialog,
  DataTable,
  Dl,
  ErrorBox,
  Field,
  fieldErrors,
  PageHead,
  Pager,
  Panel,
  QueryView,
  Skeleton,
  CLASS_TYPE_LABEL,
  dateTime,
  get,
  num,
  str,
  vnd,
} from "../kit";
import type { Row } from "../kit";

export default function CoachDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["admin", "coaches", "detail", id], queryFn: ({ signal }) => api<Row>("GET /coaches/{id}", { params: { id }, signal }) });
  return (
    <QueryView q={q} rows={8}>
      {(res) => <CoachDetail coach={res.data} />}
    </QueryView>
  );
}

function CoachDetail({ coach }: { coach: Row }) {
  const userId = str(coach.id);
  const profile = (coach.coachProfile ?? {}) as Row;
  const profileId = str(profile.id);
  const cert = profile.certification as Row | null;
  const status = cert ? str(profile.approvalStatus) : "NOT_SUBMITTED";
  return (
    <>
      <PageHead
        back={
          <Link className="cr-crumb" to="/manager/coaches">
            <ArrowLeft size={15} /> Huấn luyện viên
          </Link>
        }
        eyebrow={`Huấn luyện viên · ${str(coach.email)}`}
        title={str(coach.fullName)}
        desc={
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <ActivePill active={coach.isActive} off="Chưa hoạt động" />
            <ApprovalPill status={status} />
          </span>
        }
        actions={
          <Link className="cr-btn" to={`/manager/users/${userId}`}>
            Quản lý tài khoản
          </Link>
        }
      />
      <div className="cr-grid-side">
        <div style={{ display: "grid", gap: 20 }}>
          <CoachProfileForm coach={coach} />
          <CoachClasses profileId={profileId} />
          <UpcomingSessions userId={userId} />
        </div>
        <div style={{ display: "grid", gap: 20 }} id="cv">
          <CvPanel profileId={profileId} cert={cert} status={status} name={str(coach.fullName)} />
          <CoachFeedbackPanel profileId={profileId} />
        </div>
      </div>
    </>
  );
}

function CoachProfileForm({ coach }: { coach: Row }) {
  const id = str(coach.id);
  const p = (coach.coachProfile ?? {}) as Row;
  const initial = { specialization: str(p.specialization), experienceYears: p.experienceYears == null ? "" : str(p.experienceYears), bio: str(p.bio), phone: str(coach.phone) };
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [coach]); // eslint-disable-line react-hooks/exhaustive-deps
  const cache = useQueryClient();
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { bio: f.bio.trim() };
      if (f.specialization.trim()) body.specialization = f.specialization.trim();
      if (f.experienceYears !== "") body.experienceYears = Number(f.experienceYears);
      if (f.phone.trim() && f.phone.trim() !== initial.phone) body.phone = f.phone.trim();
      return api("PATCH /coaches/{id}", { params: { id }, body });
    },
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "coaches"] }),
  });
  const errs = fieldErrors(m.error);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const expInvalid = f.experienceYears !== "" && (!Number.isInteger(Number(f.experienceYears)) || Number(f.experienceYears) < 0);
  return (
    <Panel title="Hồ sơ chuyên môn">
      <form
        className="cr-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !expInvalid && !m.isPending) m.mutate();
        }}
        noValidate
      >
        <Field label="Chuyên môn" error={errs.specialization}>
          <input value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} placeholder="VD: Yoga, Bơi, HIIT" />
        </Field>
        <Field label="Số năm kinh nghiệm" error={expInvalid ? "Nhập số nguyên không âm." : errs.experienceYears}>
          <input type="number" min={0} step={1} value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} />
        </Field>
        <Field label="Số điện thoại" error={errs.phone}>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Giới thiệu" wide error={errs.bio}>
          <textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        </Field>
        <div className="wide" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
          <button className="cr-btn primary" disabled={!dirty || expInvalid || m.isPending}>
            {m.isPending ? "Đang lưu…" : "Lưu hồ sơ"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

/** Tải PDF CV qua API có Bearer token (file CV không có URL công khai). */
function useCvBlob(profileId: string, enabled: boolean) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let revoked = false;
    let objectUrl = "";
    setLoading(true);
    setError(undefined);
    apiBlob(`/coaches/${encodeURIComponent(profileId)}/cv/file`)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => !revoked && setError(e))
      .finally(() => !revoked && setLoading(false));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profileId, enabled]);
  return { url, error, loading };
}

function CvPanel({ profileId, cert, status, name }: { profileId: string; cert: Row | null; status: string; name: string }) {
  const hasFile = Boolean(cert?.fileUrl);
  const [show, setShow] = useState(false);
  const cv = useCvBlob(profileId, show && hasFile);
  const [action, setAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const cache = useQueryClient();
  const m = useMutation({
    mutationFn: (reason: string) =>
      api("PATCH /coaches/{profileId}/cv/review", { params: { profileId }, body: { action, ...(reason ? { reason } : {}) } }),
    onSuccess: () => {
      setAction(null);
      void cache.invalidateQueries({ queryKey: ["admin", "coaches"] });
      void cache.invalidateQueries({ queryKey: ["admin", "users"] });
      void cache.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });
  return (
    <Panel title="Hồ sơ CV">
      {!cert ? (
        <p className="cr-muted" style={{ margin: 0 }}>HLV chưa nộp CV.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <Dl
            items={[
              ["Trạng thái", <ApprovalPill status={status} key="s" />],
              ["Nộp lúc", dateTime(cert.submittedAt)],
              ["Lý do từ chối", str(cert.rejectReason) || "—"],
              ["Tệp", hasFile ? "PDF đã nộp" : "Không có tệp"],
            ]}
          />
          {hasFile && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="cr-btn" onClick={() => setShow((v) => !v)}>
                <FileText size={16} /> {show ? "Ẩn CV" : "Xem CV"}
              </button>
              {cv.url && (
                <a className="cr-btn ghost" href={cv.url} download={`CV-${name}.pdf`}>
                  Tải xuống
                </a>
              )}
            </div>
          )}
          {show && cv.loading && <Skeleton rows={3} />}
          {show && cv.error ? <ErrorBox error={cv.error} /> : null}
          {show && cv.url && <iframe title={`CV của ${name}`} src={cv.url} className="cr-frame" />}
          {status === "PENDING" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="cr-btn primary" onClick={() => setAction("APPROVE")}>
                <Check size={16} /> Duyệt hồ sơ
              </button>
              <button className="cr-btn danger" onClick={() => setAction("REJECT")}>
                <X size={16} /> Từ chối
              </button>
            </div>
          )}
        </div>
      )}
      {action && (
        <ConfirmDialog
          title={action === "APPROVE" ? "Duyệt hồ sơ HLV" : "Từ chối hồ sơ HLV"}
          target={name}
          consequence={
            action === "APPROVE"
              ? "Tài khoản HLV được kích hoạt, HLV có thể đăng nhập ứng dụng và tạo khóa học (khóa học vẫn cần Quản lý duyệt)."
              : "HLV nhận thông báo kèm lý do và có thể nộp lại CV. Tài khoản vẫn chưa hoạt động."
          }
          confirmLabel={action === "APPROVE" ? "Duyệt" : "Từ chối"}
          danger={action === "REJECT"}
          reason={action === "REJECT" ? { label: "Lý do từ chối", required: true, min: 3 } : undefined}
          busy={m.isPending}
          error={m.error}
          onConfirm={(reason) => m.mutate(reason)}
          onClose={() => setAction(null)}
        />
      )}
    </Panel>
  );
}

function CoachClasses({ profileId }: { profileId: string }) {
  const q = useQuery({
    queryKey: ["admin", "classes", "byCoach", profileId],
    queryFn: ({ signal }) => api<Row[]>("GET /classes", { query: { coachId: profileId, limit: "100" }, signal }),
    enabled: Boolean(profileId),
  });
  return (
    <Panel title="Khóa học phụ trách">
      <QueryView q={q} rows={3}>
        {(res) => (
          <DataTable
            rows={res.data}
            empty={<p className="cr-muted" style={{ margin: 0 }}>HLV chưa có khóa học nào.</p>}
            columns={[
              {
                key: "n",
                title: "Khóa học",
                render: (c) => (
                  <div className="cr-cell-main">
                    <Link to={`/manager/classes/${str(c.id)}`}>{str(c.name)}</Link>
                    <small>
                      {str(c.fitness)} · {CLASS_TYPE_LABEL[str(c.classType)]}
                    </small>
                  </div>
                ),
              },
              { key: "s", title: "Duyệt", render: (c) => <ApprovalPill status={c.status} /> },
              { key: "p", title: "Giá", className: "num", render: (c) => vnd(c.price) },
              { key: "b", title: "Số buổi", className: "num", render: (c) => num(get(c, "_count.schedules")) },
              { key: "a", title: "Mở bán", render: (c) => <SalePill row={c} /> },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

function UpcomingSessions({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin", "coaches", "upcoming", userId, page],
    queryFn: ({ signal }) => api<Row[]>("GET /coaches/{id}/upcoming-sessions", { params: { id: userId }, query: { page: String(page), limit: "8" }, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel title="Buổi dạy sắp tới">
      <QueryView q={q} rows={3}>
        {(res) => (
          <>
            <DataTable
              rows={res.data}
              empty={<p className="cr-muted" style={{ margin: 0 }}>Không có buổi dạy sắp tới.</p>}
              columns={[
                { key: "d", title: "Thời gian", render: (s) => <span className="cr-mono">{str(s.weekdayLabel)} {str(s.date).split("-").reverse().join("/")} · {str(s.startClock)}–{str(s.endClock)}</span> },
                { key: "c", title: "Khóa", render: (s) => <Link to={`/manager/classes/${str(get(s, "class.id"))}`}>{str(get(s, "class.name"))}</Link> },
                { key: "r", title: "Phòng", render: (s) => str(get(s, "room.name")) },
                { key: "b", title: "Đã giữ chỗ", className: "num", render: (s) => `${num(s.bookedCount)}` },
              ]}
            />
            <Pager meta={res.pagination} onPage={setPage} />
          </>
        )}
      </QueryView>
    </Panel>
  );
}

/** M2: đánh giá của hội viên về HLV — Quản lý gỡ đánh giá vi phạm. */
function CoachFeedbackPanel({ profileId }: { profileId: string }) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["admin", "coach-feedbacks", profileId, page],
    queryFn: ({ signal }) => api<Row>("GET /feedbacks", { query: { coachId: profileId, page: String(page), limit: "5" }, signal }),
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
  const del = useMutation({
    mutationFn: (id: string) => api("DELETE /feedbacks/{id}/manager", { params: { id } }),
    onSuccess: () => {
      setRemoving(null);
      void cache.invalidateQueries({ queryKey: ["admin", "coach-feedbacks", profileId] });
    },
  });
  const avg = get(q.data, "data.summary.averageRating");
  return (
    <Panel title="Đánh giá từ hội viên" desc={q.data ? `${avg != null ? `${str(avg)} ★ trung bình · ` : ""}${num(get(q.data, "data.summary.totalFeedbacks"))} đánh giá` : undefined}>
      <QueryView q={q} rows={3}>
        {(res) => {
          const rows = (get(res, "data.feedbacks") as Row[]) ?? [];
          return rows.length ? (
            <>
              <ul className="cr-list">
                {rows.map((f) => (
                  <li key={str(f.id)} style={{ alignItems: "flex-start" }}>
                    <div className="cr-cell-main" style={{ minWidth: 0 }}>
                      <strong>
                        <span style={{ color: "var(--warning)" }} aria-label={`${str(f.rating)} sao`}>
                          {"★".repeat(Number(f.rating) || 0)}
                        </span>{" "}
                        {f.isAnonymous ? "Ẩn danh" : str(get(f, "member.user.fullName")) || "Hội viên"}
                      </strong>
                      {str(f.comment) ? <span style={{ overflowWrap: "anywhere" }}>{str(f.comment)}</span> : null}
                      <small>{dateTime(f.createdAt)}</small>
                    </div>
                    <button className="cr-btn sm danger" onClick={() => setRemoving(f)}>
                      Gỡ
                    </button>
                  </li>
                ))}
              </ul>
              <Pager meta={res.pagination} onPage={setPage} />
            </>
          ) : (
            <EmptyState title="Chưa có đánh giá" text="Đánh giá hội viên gửi từ ứng dụng sẽ hiện tại đây." />
          );
        }}
      </QueryView>
      {removing && (
        <ConfirmDialog
          title="Gỡ đánh giá"
          target={str(removing.comment) || `${str(removing.rating)} sao`}
          consequence="Đánh giá bị xóa khỏi hồ sơ HLV trên ứng dụng và không khôi phục được."
          confirmLabel="Gỡ đánh giá"
          danger
          busy={del.isPending}
          error={del.error}
          onConfirm={() => del.mutate(str(removing.id))}
          onClose={() => setRemoving(null)}
        />
      )}
    </Panel>
  );
}
