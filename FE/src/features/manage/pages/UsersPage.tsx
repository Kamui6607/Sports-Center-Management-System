import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, UserPlus } from "lucide-react";
import { api } from "../../../shared/api";
import {
  ActivePill,
  ApprovalPill,
  DataTable,
  Dialog,
  ErrorBox,
  Field,
  fieldErrors,
  GENDER_LABEL,
  LEVEL_LABEL,
  PageHead,
  Pager,
  Panel,
  QueryView,
  ROLE_LABEL,
  RowAction,
  SearchBox,
  Select,
  dateOnly,
  get,
  str,
  useUrlState,
} from "../kit";
import type { Row } from "../kit";

export default function UsersPage({ selfId }: { selfId: string }) {
  const s = useUrlState();
  const [creating, setCreating] = useState(false);
  const query = { role: s.value("role"), isActive: s.value("isActive"), search: s.value("search"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: ({ signal }) => api<Row[]>("GET /users", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHead
        eyebrow="Con người · Tài khoản"
        title="Người dùng"
        actions={
          <button className="cr-btn primary" onClick={() => setCreating(true)}>
            <UserPlus size={16} /> Tạo tài khoản
          </button>
        }
      />
      <Panel flush>
        <div className="cr-toolbar">
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tìm theo tên hoặc email" />
          <Select label="Vai trò" all="Mọi vai trò" value={s.value("role")} onChange={(v) => s.set({ role: v })} options={Object.entries(ROLE_LABEL)} />
          <Select
            label="Trạng thái"
            all="Mọi trạng thái"
            value={s.value("isActive")}
            onChange={(v) => s.set({ isActive: v })}
            options={[
              ["true", "Đang hoạt động"],
              ["false", "Đã khóa / chờ duyệt"],
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
                    title: "Người dùng",
                    render: (u) => (
                      <div className="cr-cell-media">
                        <span className="cr-avatar" aria-hidden="true">{str(u.fullName).trim().slice(0, 1).toUpperCase()}</span>
                        <div className="cr-cell-main">
                          <Link to={`/manager/users/${str(u.id)}`}>
                            {str(u.fullName)} {u.id === selfId && <span className="cr-subtle">(bạn)</span>}
                          </Link>
                          <small>{str(u.email)}</small>
                        </div>
                      </div>
                    ),
                  },
                  { key: "phone", title: "Điện thoại", className: "nowrap", render: (u) => <span className="cr-num">{str(u.phone) || <span className="cr-subtle">—</span>}</span> },
                  { key: "role", title: "Vai trò", className: "nowrap", render: (u) => ROLE_LABEL[str(u.role)] ?? str(u.role) },
                  {
                    key: "status",
                    title: "Trạng thái",
                    render: (u) =>
                      u.role === "COACH" && !u.isActive && get(u, "coachProfile.approvalStatus") !== "APPROVED" ? (
                        <ApprovalPill status={get(u, "coachProfile.certification") ? get(u, "coachProfile.approvalStatus") : "NOT_SUBMITTED"} />
                      ) : (
                        <ActivePill active={u.isActive} />
                      ),
                  },
                  { key: "created", title: "Ngày tạo", className: "num", render: (u) => dateOnly(u.createdAt) },
                  {
                    key: "act",
                    title: "",
                    className: "actions",
                    render: (u) => (
                      <RowAction label={`Mở ${str(u.fullName)}`} to={`/manager/users/${str(u.id)}`}>
                        <ChevronRight size={16} />
                      </RowAction>
                    ),
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {creating && <CreateUserDialog onClose={() => setCreating(false)} />}
    </>
  );
}

/** Manager chỉ tạo tài khoản Hội viên và HLV; tài khoản Quản lý không tạo trên Web. */
const CREATABLE_ROLES = ["MEMBER", "COACH"] as const;
const EMPTY = { fullName: "", email: "", password: "", phone: "", gender: "", dateOfBirth: "", role: "MEMBER", fitnessGoal: "", trainingLevel: "", trainingPreference: "" };

export function CreateUserDialog({ onClose, role }: { onClose: () => void; role?: "COACH" }) {
  const [f, setF] = useState({ ...EMPTY, role: role ?? "MEMBER" });
  const cache = useQueryClient();
  const navigate = useNavigate();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { fullName: f.fullName.trim(), email: f.email.trim().toLowerCase(), password: f.password, role: f.role };
      for (const k of ["phone", "gender", "dateOfBirth"] as const) if (f[k].trim()) body[k] = f[k].trim();
      if (f.role === "MEMBER") for (const k of ["fitnessGoal", "trainingLevel", "trainingPreference"] as const) if (f[k].trim()) body[k] = f[k].trim();
      return api<Row>("POST /users", { body });
    },
    onSuccess: (res) => {
      void cache.invalidateQueries({ queryKey: ["admin", "users"] });
      void cache.invalidateQueries({ queryKey: ["admin", "coaches"] });
      navigate(f.role === "COACH" ? `/manager/coaches/${str(res.data.id)}` : `/manager/users/${str(res.data.id)}`);
    },
  });
  const errs = fieldErrors(m.error);
  const invalid =
    f.fullName.trim().length < 2 || !/^S+@S+.S+$/.test(f.email) || f.password.length < 6 || !(CREATABLE_ROLES as readonly string[]).includes(f.role);
  return (
    <Dialog
      title={role === "COACH" ? "Tạo tài khoản huấn luyện viên" : "Tạo tài khoản"}
      eyebrow="Người dùng"
      wide
      onClose={onClose}
      busy={m.isPending}
      onSubmit={() => !invalid && m.mutate()}
      footer={
        <>
          <button type="button" className="cr-btn ghost" onClick={onClose} disabled={m.isPending}>
            Hủy
          </button>
          <button className="cr-btn primary" disabled={m.isPending || invalid}>
            {m.isPending ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </>
      }
    >
      <div className="cr-form">
        <Field label="Họ và tên" required error={errs.fullName}>
          <input value={f.fullName} onChange={set("fullName")} autoFocus />
        </Field>
        <Field label="Email đăng nhập" required error={errs.email}>
          <input type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Mật khẩu ban đầu" required error={errs.password} hint="Tối thiểu 6 ký tự.">
          <input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        {!role && (
          <Field label="Vai trò" required error={errs.role}>
            <select value={f.role} onChange={set("role")}>
              {CREATABLE_ROLES.map((v) => (
                <option key={v} value={v}>
                  {ROLE_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Số điện thoại" error={errs.phone}>
          <input value={f.phone} onChange={set("phone")} inputMode="tel" />
        </Field>
        <Field label="Giới tính" error={errs.gender}>
          <select value={f.gender} onChange={set("gender")}>
            <option value="">—</option>
            {Object.entries(GENDER_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày sinh" error={errs.dateOfBirth}>
          <input type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        {f.role === "MEMBER" && (
          <>
            <Field label="Trình độ">
              <select value={f.trainingLevel} onChange={set("trainingLevel")}>
                <option value="">—</option>
                {Object.entries(LEVEL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mục tiêu tập luyện" wide>
              <input value={f.fitnessGoal} onChange={set("fitnessGoal")} />
            </Field>
          </>
        )}
      </div>
      {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}
