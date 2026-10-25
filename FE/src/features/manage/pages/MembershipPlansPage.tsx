import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Star } from "lucide-react";
import { api } from "../../../shared/api";
import { ActivePill, ConfirmDialog, DataTable, Dialog, ErrorBox, Field, fieldErrors, PageHead, Panel, Pill, QueryView, get, num, str, vnd } from "../kit";
import type { Row } from "../kit";

/**
 * Gói thành viên (tập gym tự do) — Manager thêm / sửa / bật-tắt / xóa gói (Doc/MEMBERSHIP_FLOW.md §2.1).
 * Đổi giá hoặc số ngày chỉ áp dụng giao dịch mới; gói đã có người mua thì không xóa được (chỉ tắt bán).
 */
export default function MembershipPlansPage() {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "delete"; plan: Row } | null>(null);
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "membership-plans"],
    queryFn: ({ signal }) => api<Row[]>("GET /membership-plans/manage", { signal }),
  });
  const done = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "membership-plans"] });
    setConfirm(null);
  };
  const toggle = useMutation({
    mutationFn: (p: Row) => api("PATCH /membership-plans/{id}/toggle", { params: { id: str(p.id) }, body: { isActive: !p.isActive } }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (p: Row) => api("DELETE /membership-plans/{id}", { params: { id: str(p.id) } }),
    onSuccess: done,
  });
  return (
    <>
      <PageHead
        eyebrow="Kinh doanh · Gói thành viên"
        title="Gói thành viên"
        desc="Gói tập gym tự do cho hội viên không học khóa với HLV. Đổi giá / số ngày chỉ áp dụng cho giao dịch mới — hóa đơn và gói đã bán giữ nguyên."
        actions={
          <span style={{ display: "inline-flex", gap: 8 }}>
            <Link className="cr-btn" to="/manager/memberships">
              Hội viên & thẻ
            </Link>
            <button className="cr-btn primary" onClick={() => setEditing("new")}>
              <Plus size={17} /> Thêm gói
            </button>
          </span>
        }
      />
      <Panel>
        <QueryView q={q}>
          {(res) => (
            <DataTable
              rows={res.data}
              empty={<p className="cr-muted" style={{ margin: 0 }}>Chưa có gói nào — bấm “Thêm gói” để mở bán.</p>}
              columns={[
                {
                  key: "n",
                  title: "Gói",
                  render: (p) => (
                    <div className="cr-cell-main">
                      <strong>
                        {str(p.name)} {p.isFeatured ? <Pill tone="info"><Star size={12} /> Phổ biến</Pill> : null}
                      </strong>
                      <small>{(p.benefits as string[] | undefined)?.join(" · ") || str(p.description) || "—"}</small>
                    </div>
                  ),
                },
                { key: "d", title: "Thời hạn", className: "num", render: (p) => `${num(p.durationDays)} ngày` },
                {
                  key: "p",
                  title: "Giá",
                  className: "num",
                  render: (p) => (
                    <div className="cr-cell-main">
                      <strong>{vnd(p.price)}</strong>
                      <small>≈ {vnd(p.pricePer30Days)}/30 ngày</small>
                    </div>
                  ),
                },
                { key: "a", title: "Đang dùng", className: "num", render: (p) => `${num(get(p, "stats.activeMembers"))} hội viên` },
                { key: "s", title: "Đã bán", className: "num", render: (p) => num(get(p, "stats.soldCount")) },
                {
                  key: "r",
                  title: "Thực thu",
                  className: "num",
                  render: (p) => (
                    <div className="cr-cell-main">
                      <strong>{vnd(get(p, "stats.netRevenue"))}</strong>
                      {Number(get(p, "stats.refunded")) ? <small>đã hoàn {vnd(get(p, "stats.refunded"))}</small> : null}
                    </div>
                  ),
                },
                { key: "o", title: "Thứ tự", className: "num", render: (p) => num(p.sortOrder) },
                { key: "st", title: "Mở bán", render: (p) => <ActivePill active={p.isActive} on="Đang bán" off="Đã tắt" /> },
                {
                  key: "x",
                  title: "",
                  className: "actions",
                  render: (p) => (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button className="cr-btn sm" onClick={() => setEditing(p)}>
                        Sửa
                      </button>
                      <button className="cr-btn sm" onClick={() => setConfirm({ kind: "toggle", plan: p })}>
                        {p.isActive ? "Tắt bán" : "Mở bán"}
                      </button>
                      <button
                        className="cr-btn sm danger"
                        disabled={Number(get(p, "stats.soldCount")) > 0}
                        title={Number(get(p, "stats.soldCount")) > 0 ? "Gói đã có người mua — chỉ tắt bán được" : undefined}
                        onClick={() => setConfirm({ kind: "delete", plan: p })}
                      >
                        Xóa
                      </button>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      {editing && <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {confirm?.kind === "toggle" && (
        <ConfirmDialog
          title={confirm.plan.isActive ? "Tắt bán gói" : "Mở bán lại gói"}
          target={str(confirm.plan.name)}
          consequence={
            confirm.plan.isActive
              ? "Hội viên không mua được gói này nữa. Gói đã bán vẫn còn hiệu lực tới hết hạn."
              : "Gói hiển thị trở lại trong ứng dụng để hội viên mua."
          }
          confirmLabel={confirm.plan.isActive ? "Tắt bán" : "Mở bán"}
          danger={Boolean(confirm.plan.isActive)}
          busy={toggle.isPending}
          error={toggle.error}
          onConfirm={() => toggle.mutate(confirm.plan)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "delete" && (
        <ConfirmDialog
          title="Xóa gói thành viên"
          target={str(confirm.plan.name)}
          consequence="Gói chưa từng được bán nên sẽ bị xóa hẳn. Thao tác không hoàn tác được."
          confirmLabel="Xóa gói"
          danger
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(confirm.plan)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function PlanDialog({ plan, onClose }: { plan: Row | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: str(plan?.name),
    durationDays: plan ? str(plan.durationDays) : "30",
    price: plan ? str(plan.price) : "",
    description: str(plan?.description),
    benefits: ((plan?.benefits as string[] | undefined) ?? []).join("\n"),
    isFeatured: Boolean(plan?.isFeatured),
    sortOrder: plan ? str(plan.sortOrder) : "0",
  });
  const cache = useQueryClient();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(),
        durationDays: Number(f.durationDays),
        price: Number(f.price),
        description: f.description.trim(),
        benefits: f.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
        isFeatured: f.isFeatured,
        sortOrder: Number(f.sortOrder) || 0,
      };
      return plan ? api("PATCH /membership-plans/{id}", { params: { id: str(plan.id) }, body }) : api("POST /membership-plans", { body });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "membership-plans"] });
      onClose();
    },
  });
  const errs = fieldErrors(m.error);
  const days = Number(f.durationDays);
  const price = Number(f.price);
  const benefitLines = f.benefits.split("\n").filter((b) => b.trim());
  const daysInvalid = !Number.isInteger(days) || days < 1 || days > 3650;
  const priceInvalid = !Number.isInteger(price) || price < 1000;
  const invalid = !f.name.trim() || daysInvalid || priceInvalid || benefitLines.length > 8;
  const changesPrice = plan && (Number(plan.price) !== price || Number(plan.durationDays) !== days);
  return (
    <Dialog
      title={plan ? `Sửa gói ${str(plan.name)}` : "Thêm gói thành viên"}
      eyebrow="Gói thành viên"
      onClose={onClose}
      busy={m.isPending}
      onSubmit={() => !invalid && m.mutate()}
      footer={
        <>
          <button type="button" className="cr-btn ghost" onClick={onClose} disabled={m.isPending}>
            Hủy
          </button>
          <button className="cr-btn primary" disabled={m.isPending || invalid}>
            {m.isPending ? "Đang lưu…" : plan ? "Lưu thay đổi" : "Thêm gói"}
          </button>
        </>
      }
    >
      <div className="cr-form">
        <Field label="Tên gói" required error={errs.name}>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: Gói 3 tháng" maxLength={100} autoFocus />
        </Field>
        <Field label="Thời hạn (ngày)" required error={f.durationDays && daysInvalid ? "Từ 1 đến 3650 ngày." : errs.durationDays}>
          <input type="number" min={1} max={3650} value={f.durationDays} onChange={(e) => setF({ ...f, durationDays: e.target.value })} />
        </Field>
        <Field
          label="Giá (VNĐ)"
          required
          error={f.price && priceInvalid ? "Tối thiểu 1.000đ, số nguyên." : errs.price}
          hint={!priceInvalid && !daysInvalid ? `≈ ${vnd(Math.round((price * 30) / days))} / 30 ngày` : undefined}
        >
          <input type="number" min={1000} step={1000} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </Field>
        <Field label="Thứ tự hiển thị" hint="Số nhỏ hiển thị trước; cùng thứ tự thì gói rẻ trước." error={errs.sortOrder}>
          <input type="number" min={0} max={999} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
        </Field>
        <Field label="Mô tả ngắn" wide error={errs.description}>
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} placeholder="VD: Tập tự do mọi khung giờ mở cửa." />
        </Field>
        <Field
          label="Quyền lợi (mỗi dòng một ý, tối đa 8)"
          wide
          error={benefitLines.length > 8 ? "Tối đa 8 dòng." : errs.benefits}
          hint="Hiển thị dạng danh sách có dấu ✓ trên thẻ gói trong ứng dụng."
        >
          <textarea value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} rows={4} placeholder={"Tập không giới hạn giờ mở cửa\nTủ đồ & khăn miễn phí"} />
        </Field>
        <label className="cr-check wide">
          <input type="checkbox" checked={f.isFeatured} onChange={(e) => setF({ ...f, isFeatured: e.target.checked })} /> Đánh dấu “Phổ biến” (nổi bật trên màn chọn gói)
        </label>
      </div>
      {changesPrice ? (
        <p className="cr-muted" style={{ marginTop: 12 }}>
          Giá / thời hạn mới chỉ áp dụng cho giao dịch tạo sau khi lưu. Hội viên đang chờ chuyển khoản và các gói đã bán giữ nguyên điều kiện lúc mua.
        </p>
      ) : null}
      {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}
