import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Lock, Trash2, Unlock } from "lucide-react";
import { api } from "../../../shared/api";
import {
  ActivePill,
  ApprovalPill,
  ConfirmDialog,
  Dl,
  ErrorBox,
  Field,
  fieldErrors,
  GENDER_LABEL,
  LEVEL_LABEL,
  PageHead,
  Panel,
  Pill,
  QueryView,
  ROLE_LABEL,
  dateOnly,
  dateTime,
  get,
  num,
  str,
} from "../kit";
import type { Row } from "../kit";

const HISTORY_LABEL: Record<string, string> = {
  enrollments: "Lượt giữ chỗ buổi học",
  payments: "Giao dịch thanh toán",
  memberships: "Gói thành viên",
  attendances: "Lượt điểm danh",
  refunds: "Yêu cầu hoàn tiền",
  trainingPlans: "Lộ trình tập",
  feedbacks: "Đánh giá HLV",
  penalties: "Hình phạt chuyên cần",
  classes: "Khóa học phụ trách",
  walletTransactions: "Giao dịch ví HLV",
  orders: "Đơn hàng",
  products: "Sản phẩm đã tạo",
  reviews: "Đánh giá sản phẩm",
  chatMessages: "Tin nhắn",
};

export default function UserDetailPage({ selfId }: { selfId: string }) {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["admin", "users", "detail", id], queryFn: ({ signal }) => api<Row>("GET /users/{id}", { params: { id }, signal }) });
  return (
    <QueryView q={q} rows={8}>
      {(res) => <UserDetail user={res.data} selfId={selfId} />}
    </QueryView>
  );
}

type Action = "lock" | "unlock" | "reset" | "delete" | "role" | null;

function UserDetail({ user, selfId }: { user: Row; selfId: string }) {
  const id = str(user.id);
  const isSelf = id === selfId;
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [action, setAction] = useState<Action>(null);
  const [newRole, setNewRole] = useState(str(user.role));
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "users"] });
    void cache.invalidateQueries({ queryKey: ["admin", "coaches"] });
  };
  const history = useQuery({ queryKey: ["admin", "users", "history", id], queryFn: ({ signal }) => api<Row>("GET /users/{id}/history", { params: { id }, signal }) });
  const resetStatus = useQuery({
    queryKey: ["admin", "users", "reset", id],
    queryFn: ({ signal }) => api<Row>("GET /users/{id}/password-reset", { params: { id }, signal }),
    refetchInterval: (query) => (get(query.state.data, "data.email.status") === "PENDING" ? 4000 : false),
  });

  const lock = useMutation({ mutationFn: () => api("DELETE /users/{id}", { params: { id } }), onSuccess: () => { setAction(null); refresh(); } });
  const unlock = useMutation({ mutationFn: () => api("PATCH /users/{id}", { params: { id }, body: { isActive: true } }), onSuccess: () => { setAction(null); refresh(); } });
  const role = useMutation({ mutationFn: () => api("PATCH /users/{id}", { params: { id }, body: { role: newRole } }), onSuccess: () => { setAction(null); refresh(); } });
  const reset = useMutation({
    mutationFn: () => api<Row>("POST /users/{id}/password-reset", { params: { id } }),
    onSuccess: () => {
      setAction(null);
      void cache.invalidateQueries({ queryKey: ["admin", "users", "reset", id] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api("DELETE /users/{id}/permanent", { params: { id } }),
    onSuccess: () => {
      refresh();
      navigate("/manager/users", { replace: true });
    },
  });

  const r = str(user.role);
  const coachStatus = get(user, "coachProfile.certification") ? str(get(user, "coachProfile.approvalStatus")) : "NOT_SUBMITTED";
  const pendingCoach = r === "COACH" && !user.isActive && coachStatus !== "APPROVED";
  const canDelete = Boolean(get(history.data, "data.canDeletePermanently"));
  const req = get(resetStatus.data, "data.request") as Row | null | undefined;
  const mail = get(resetStatus.data, "data.email") as Row | null | undefined;

  return (
    <>
      <PageHead
        back={
          <Link className="cr-crumb" to="/manager/users">
            <ArrowLeft size={15} /> Người dùng
          </Link>
        }
        eyebrow={`${ROLE_LABEL[r] ?? r} · ${str(user.email)}`}
        title={str(user.fullName)}
        desc={
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <ActivePill active={user.isActive} />
            {r === "COACH" && <ApprovalPill status={coachStatus} />}
            {isSelf && <Pill tone="info">Tài khoản của bạn</Pill>}
          </span>
        }
        actions={
          <>
            <button className="cr-btn" onClick={() => setAction("reset")}>
              <KeyRound size={16} /> Cấp lại mật khẩu
            </button>
            {user.isActive ? (
              <button className="cr-btn danger" disabled={isSelf} title={isSelf ? "Không thể tự khóa tài khoản" : undefined} onClick={() => setAction("lock")}>
                <Lock size={16} /> Khóa tài khoản
              </button>
            ) : (
              <button className="cr-btn" disabled={pendingCoach} title={pendingCoach ? "Phải duyệt CV trước" : undefined} onClick={() => setAction("unlock")}>
                <Unlock size={16} /> Mở khóa
              </button>
            )}
          </>
        }
      />
      {pendingCoach && (
        <div className="cr-alert warn">
          <div>
            <strong>HLV chưa được duyệt hồ sơ</strong>
            <p>
              Tài khoản đang chờ duyệt CV nên không mở khóa trực tiếp được. <Link to={`/manager/coaches/${id}`}>Mở hồ sơ HLV để duyệt CV →</Link>
            </p>
          </div>
        </div>
      )}
      <div className="cr-grid-side">
        <div style={{ display: "grid", gap: 20 }}>
          <ProfileForm user={user} onSaved={refresh} />
          {r === "MEMBER" && user.memberProfile ? <MemberProfileForm user={user} onSaved={refresh} /> : null}
          {r === "COACH" && (
            <Panel title="Hồ sơ huấn luyện viên">
              <Link className="cr-btn" to={`/manager/coaches/${id}`}>
                Mở hồ sơ HLV
              </Link>
            </Panel>
          )}
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          <Panel title="Vai trò">
            <div style={{ display: "grid", gap: 10 }}>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} disabled={isSelf} aria-label="Vai trò mới">
                {Object.entries(ROLE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="cr-btn" disabled={isSelf || newRole === r} onClick={() => setAction("role")}>
                Đổi vai trò
              </button>
              {isSelf && <small className="cr-muted">Không thể tự đổi vai trò của chính mình.</small>}
            </div>
          </Panel>
          <Panel title="Đặt lại mật khẩu">
            <QueryView q={resetStatus} rows={2}>
              {() =>
                req ? (
                  <Dl
                    items={[
                      ["Yêu cầu gần nhất", dateTime(req.requestedAt)],
                      [
                        "Mã",
                        <Pill tone={req.state === "ACTIVE" ? "ok" : req.state === "USED" ? "info" : "bad"} key="s">
                          {({ ACTIVE: "Còn hiệu lực", USED: "Đã dùng — mật khẩu đã đổi", EXPIRED: "Hết hạn", LOCKED: "Khóa do nhập sai" } as Record<string, string>)[str(req.state)] ?? str(req.state)}
                        </Pill>,
                      ],
                      ["Hết hạn lúc", dateTime(req.expiresAt)],
                      [
                        "Email",
                        mail ? (
                          <Pill tone={mail.status === "SENT" ? "ok" : mail.status === "FAILED" ? "bad" : "warn"} key="m">
                            {({ PENDING: "Đang chờ gửi", SENDING: "Đang gửi", SENT: "Đã gửi tới nhà cung cấp", FAILED: "Gửi thất bại" } as Record<string, string>)[str(mail.status)] ?? str(mail.status)}
                            {Number(mail.attempts) > 0 ? ` · ${num(mail.attempts)} lần thử` : ""}
                          </Pill>
                        ) : (
                          "—"
                        ),
                      ],
                    ]}
                  />
                ) : (
                  <p className="cr-muted" style={{ margin: 0 }}>Chưa có yêu cầu đặt lại mật khẩu nào.</p>
                )
              }
            </QueryView>
          </Panel>
          <Panel title="Xóa tài khoản">
            <QueryView q={history} rows={2}>
              {(h) => {
                const items = Object.entries((h.data.history ?? {}) as Record<string, number>);
                return (
                  <div style={{ display: "grid", gap: 10 }}>
                    {items.length ? (
                      <ul className="cr-list">
                        {items.map(([k, n]) => (
                          <li key={k}>
                            <span>{HISTORY_LABEL[k] ?? k}</span>
                            <b className="cr-mono">{num(n)}</b>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cr-muted" style={{ margin: 0 }}>Tài khoản chưa có dữ liệu nghiệp vụ.</p>
                    )}
                    <button className="cr-btn danger" disabled={!canDelete || isSelf} onClick={() => setAction("delete")}>
                      <Trash2 size={16} /> Xóa vĩnh viễn
                    </button>
                  </div>
                );
              }}
            </QueryView>
          </Panel>
          <Panel title="Thông tin hệ thống">
            <Dl items={[["Ngày tạo", dateTime(user.createdAt)], ["Mã tài khoản", <span className="cr-mono" key="id" style={{ fontSize: 12 }}>{id}</span>]]} />
          </Panel>
        </div>
      </div>

      {action === "lock" && (
        <ConfirmDialog
          title="Khóa tài khoản"
          target={`${str(user.fullName)} · ${str(user.email)}`}
          consequence={
            <>
              Người dùng bị đăng xuất và không thể đăng nhập Web/Mobile cho tới khi được mở khóa. Dữ liệu (lớp, thanh toán, đơn hàng) được giữ nguyên; khóa
              không tự hủy lịch, hoàn tiền hay hủy đơn.{r === "COACH" ? " Nếu HLV còn buổi dạy sắp tới, hãy sắp xếp lại lịch với HLV." : ""}
            </>
          }
          confirmLabel="Khóa tài khoản"
          danger
          busy={lock.isPending}
          error={lock.error}
          onConfirm={() => lock.mutate()}
          onClose={() => setAction(null)}
        />
      )}
      {action === "unlock" && (
        <ConfirmDialog
          title="Mở khóa tài khoản"
          target={`${str(user.fullName)} · ${str(user.email)}`}
          consequence="Người dùng có thể đăng nhập lại bằng mật khẩu hiện tại."
          confirmLabel="Mở khóa"
          busy={unlock.isPending}
          error={unlock.error}
          onConfirm={() => unlock.mutate()}
          onClose={() => setAction(null)}
        />
      )}
      {action === "role" && (
        <ConfirmDialog
          title="Đổi vai trò"
          target={`${str(user.fullName)}: ${ROLE_LABEL[r]} → ${ROLE_LABEL[newRole]}`}
          consequence="Người dùng bị đăng xuất khỏi mọi thiết bị và phải đăng nhập lại. Hồ sơ và lịch sử của vai trò cũ được giữ nguyên."
          confirmLabel="Đổi vai trò"
          busy={role.isPending}
          error={role.error}
          onConfirm={() => role.mutate()}
          onClose={() => setAction(null)}
        />
      )}
      {action === "reset" && (
        <ConfirmDialog
          title="Cấp lại mật khẩu"
          target={str(user.email)}
          consequence="Hệ thống gửi email chứa mã 6 số (hiệu lực 15 phút) và liên kết trang đặt mật khẩu. Mật khẩu hiện tại chưa đổi cho tới khi người dùng tự đặt mật khẩu mới; khi đó mọi phiên cũ bị đăng xuất."
          confirmLabel="Gửi email đặt lại"
          busy={reset.isPending}
          error={reset.error}
          onConfirm={() => reset.mutate()}
          onClose={() => setAction(null)}
        />
      )}
      {action === "delete" && (
        <ConfirmDialog
          title="Xóa vĩnh viễn tài khoản"
          target={`${str(user.fullName)} · ${str(user.email)}`}
          consequence="Tài khoản và hồ sơ bị xóa vĩnh viễn, không khôi phục được. Hệ thống chỉ cho phép khi tài khoản chưa có dữ liệu nghiệp vụ."
          confirmLabel="Xóa vĩnh viễn"
          danger
          reason={{ label: `Nhập email "${str(user.email)}" để xác nhận`, required: true, match: str(user.email) }}
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

function ProfileForm({ user, onSaved }: { user: Row; onSaved: () => void }) {
  const id = str(user.id);
  const initial = {
    fullName: str(user.fullName),
    phone: str(user.phone),
    gender: str(user.gender),
    dateOfBirth: user.dateOfBirth ? str(user.dateOfBirth).slice(0, 10) : "",
  };
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { fullName: f.fullName.trim() };
      // Số điện thoại là UNIQUE — không gửi chuỗi rỗng (hai tài khoản rỗng sẽ trùng nhau).
      if (f.phone.trim() && f.phone.trim() !== initial.phone) body.phone = f.phone.trim();
      if (f.gender) body.gender = f.gender;
      if (f.dateOfBirth) body.dateOfBirth = f.dateOfBirth;
      return api("PATCH /users/{id}", { params: { id }, body });
    },
    onSuccess: onSaved,
  });
  const errs = fieldErrors(m.error);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <Panel title="Thông tin tài khoản">
      <form
        className="cr-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.isPending && dirty) m.mutate();
        }}
        noValidate
      >
        <Field label="Họ và tên" required error={errs.fullName}>
          <input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </Field>
        <Field label="Email" hint="Không thể thay đổi email đăng nhập.">
          <input value={str(user.email)} disabled />
        </Field>
        <Field label="Số điện thoại" error={errs.phone}>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
        </Field>
        <Field label="Giới tính" error={errs.gender}>
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="">—</option>
            {Object.entries(GENDER_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày sinh" error={errs.dateOfBirth}>
          <input type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} />
        </Field>
        <div className="wide" style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
          <button type="button" className="cr-btn ghost" disabled={!dirty || m.isPending} onClick={() => setF(initial)}>
            Hoàn tác
          </button>
          <button className="cr-btn primary" disabled={!dirty || m.isPending || f.fullName.trim().length < 2}>
            {m.isPending ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function MemberProfileForm({ user, onSaved }: { user: Row; onSaved: () => void }) {
  const profile = (user.memberProfile ?? {}) as Row;
  const initial = { fitnessGoal: str(profile.fitnessGoal), trainingLevel: str(profile.trainingLevel), trainingPreference: str(profile.trainingPreference) };
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () =>
      api("PATCH /members/{id}", {
        params: { id: str(profile.id) },
        body: { fitnessGoal: f.fitnessGoal.trim(), trainingPreference: f.trainingPreference.trim(), ...(f.trainingLevel ? { trainingLevel: f.trainingLevel } : {}) },
      }),
    onSuccess: onSaved,
  });
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <Panel title="Hồ sơ hội viên">
      <form
        className="cr-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.isPending && dirty) m.mutate();
        }}
      >
        <Field label="Trình độ">
          <select value={f.trainingLevel} onChange={(e) => setF({ ...f, trainingLevel: e.target.value })}>
            <option value="">—</option>
            {Object.entries(LEVEL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Thời gian tập ưa thích">
          <input value={f.trainingPreference} onChange={(e) => setF({ ...f, trainingPreference: e.target.value })} />
        </Field>
        <Field label="Mục tiêu tập luyện" wide>
          <textarea value={f.fitnessGoal} onChange={(e) => setF({ ...f, fitnessGoal: e.target.value })} />
        </Field>
        <div className="wide" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {m.error ? <ErrorBox error={m.error} /> : null}
          <button className="cr-btn primary" disabled={!dirty || m.isPending}>
            {m.isPending ? "Đang lưu…" : "Lưu hồ sơ"}
          </button>
        </div>
      </form>
      <p className="cr-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>Hội viên từ: {dateOnly(user.createdAt)}</p>
    </Panel>
  );
}
