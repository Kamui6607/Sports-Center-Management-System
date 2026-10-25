import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, PackagePlus, Pencil, Power, Trash2 } from "lucide-react";
import { api } from "../../../shared/api";
import { EmptyState, ActivePill, ConfirmDialog, DataTable, Dialog, Dl, ErrorBox, Field, PageHead, Pager, Panel, Pill, QueryView, dateTime, num, str, vnd } from "../kit";
import type { Row } from "../kit";
import { ProductDialog, ProductThumb, StockPill } from "./ProductsPage";

const TX: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  IN: ["Nhập hàng", "ok"],
  ADJUST: ["Điều chỉnh", "warn"],
  RESERVE: ["Giữ cho đơn", "info"],
  RELEASE: ["Nhả hàng giữ", "info"],
  SALE: ["Bán", "ok"],
  RETURN: ["Trả về kho", "warn"],
};

export default function ProductDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["admin", "products", "detail", id], queryFn: ({ signal }) => api<Row>("GET /products/{id}", { params: { id }, signal }) });
  return <QueryView q={q} rows={8}>{(res) => <ProductDetail p={res.data} />}</QueryView>;
}

function ProductDetail({ p }: { p: Row }) {
  const id = str(p.id);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"edit" | "stock" | "toggle" | "delete" | null>(null);
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "products"] });
    void cache.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
  const toggle = useMutation({
    mutationFn: () => api("PATCH /products/{id}", { params: { id }, body: { isActive: !p.isActive } }),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api("DELETE /products/{id}", { params: { id } }),
    onSuccess: () => {
      refresh();
      navigate("/manager/products", { replace: true });
    },
  });
  const images = ((p.imageUrls as string[]) ?? []).filter(Boolean);
  return (
    <>
      <PageHead
        back={
          <Link className="cr-crumb" to="/manager/products">
            <ArrowLeft size={15} /> Sản phẩm
          </Link>
        }
        eyebrow={`Sản phẩm · ${vnd(p.price)}`}
        title={str(p.name)}
        desc={
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <ActivePill active={p.isActive} on="Đang bán" off="Ngừng bán" />
            <StockPill p={p} />
          </span>
        }
        actions={
          <>
            <button className="cr-btn primary" onClick={() => setDialog("stock")}>
              <PackagePlus size={16} /> Nhập / điều chỉnh kho
            </button>
            <button className="cr-btn" onClick={() => setDialog("edit")}>
              <Pencil size={16} /> Sửa
            </button>
            <button className={"cr-btn " + (p.isActive ? "danger" : "")} onClick={() => setDialog("toggle")}>
              <Power size={16} /> {p.isActive ? "Ngừng bán" : "Bán lại"}
            </button>
            <button className="cr-btn danger" onClick={() => setDialog("delete")}>
              <Trash2 size={16} /> Xóa
            </button>
          </>
        }
      />
      <div className="cr-kpis">
        {[
          ["Tồn trên kệ", p.stockQuantity, "số lượng thực tế"],
          ["Đang giữ cho đơn", p.reservedStock, "đơn chờ thanh toán"],
          ["Có thể bán", p.availableStock, `cảnh báo khi ≤ ${num(p.lowStockThreshold)}`],
          ["Đánh giá", p.reviewCount, Number(p.reviewCount) > 0 ? `★ ${Number(p.rating ?? 0).toFixed(1)} trung bình` : "chưa có đánh giá"],
        ].map(([l, v, n]) => (
          <div className={"cr-kpi" + (l === "Có thể bán" && Number(v) <= Number(p.lowStockThreshold) ? " alert" : "")} key={str(l)}>
            <div className="cr-kpi-label">{str(l)}</div>
            <div className="cr-kpi-value">{num(v)}</div>
            <div className="cr-kpi-note">{str(n)}</div>
          </div>
        ))}
      </div>
      <div className="cr-grid-side">
        <div style={{ display: "grid", gap: 20 }}>
          <Ledger id={id} />
          <Reviews id={id} onChanged={refresh} />
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          <Panel title="Thông tin">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {images.length ? images.map((u) => <ProductThumb key={u} url={u} size={72} />) : <ProductThumb url={null} size={72} />}
            </div>
            <Dl
              items={[
                ["Giá bán", vnd(p.price)],
                ["Tối đa / đơn", num(p.maxPerOrder)],
                ["Tối đa / người / ngày", num(p.maxPerDay)],
                ["Cập nhật", dateTime(p.updatedAt)],
              ]}
            />
            {str(p.description).trim() && (
              <div className="cr-desc">
                <span>Mô tả</span>
                <p>{str(p.description)}</p>
              </div>
            )}
          </Panel>
        </div>
      </div>
      {dialog === "edit" && <ProductDialog product={p} onClose={() => setDialog(null)} />}
      {dialog === "stock" && <StockDialog p={p} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === "toggle" && (
        <ConfirmDialog
          title={p.isActive ? "Ngừng bán sản phẩm" : "Bán lại sản phẩm"}
          target={str(p.name)}
          consequence={
            p.isActive
              ? "Sản phẩm ẩn khỏi cửa hàng, không đặt mới được. Đơn đã đặt, đánh giá và nhật ký kho được giữ nguyên."
              : "Sản phẩm hiển thị lại trên cửa hàng của ứng dụng."
          }
          confirmLabel={p.isActive ? "Ngừng bán" : "Bán lại"}
          danger={Boolean(p.isActive)}
          busy={toggle.isPending}
          error={toggle.error}
          onConfirm={() => toggle.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Xóa vĩnh viễn sản phẩm"
          target={str(p.name)}
          consequence="Chỉ xóa được sản phẩm chưa có đơn hàng/đánh giá (tạo nhầm) — nhật ký kho của sản phẩm cũng bị xóa. Sản phẩm đã bán hãy dùng Ngừng bán."
          confirmLabel="Xóa vĩnh viễn"
          danger
          reason={{ label: `Nhập tên "${str(p.name)}" để xác nhận`, required: true, match: str(p.name) }}
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function StockDialog({ p, onClose, onDone }: { p: Row; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<"IN" | "ADJUST">("IN");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const cache = useQueryClient();
  const n = Number(qty);
  const qtyBad = !Number.isInteger(n) || (type === "IN" ? n <= 0 : n === 0);
  const after = Number(p.stockQuantity) + (Number.isInteger(n) ? n : 0);
  const belowReserved = type === "ADJUST" && after < Number(p.reservedStock);
  const m = useMutation({
    mutationFn: () => api("POST /shop/manage/inventory/{productId}", { params: { productId: str(p.id) }, body: { type, quantity: n, note: note.trim() } }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "products"] });
      onDone();
      onClose();
    },
  });
  const invalid = qtyBad || belowReserved || note.trim().length < 3;
  return (
    <Dialog
      title="Nhập / điều chỉnh kho"
      eyebrow={str(p.name)}
      onClose={onClose}
      busy={m.isPending}
      onSubmit={() => !invalid && m.mutate()}
      footer={
        <>
          <button type="button" className="cr-btn ghost" onClick={onClose} disabled={m.isPending}>
            Hủy
          </button>
          <button className="cr-btn primary" disabled={invalid || m.isPending}>
            {m.isPending ? "Đang ghi…" : "Ghi vào nhật ký kho"}
          </button>
        </>
      }
    >
      <div className="cr-seg" role="group" aria-label="Loại thay đổi">
        <button type="button" aria-pressed={type === "IN"} onClick={() => setType("IN")}>
          Nhập hàng (+)
        </button>
        <button type="button" aria-pressed={type === "ADJUST"} onClick={() => setType("ADJUST")}>
          Điều chỉnh (±)
        </button>
      </div>
      <div className="cr-form">
        <Field
          label={type === "IN" ? "Số lượng nhập" : "Chênh lệch (âm = giảm)"}
          required
          error={qty && qtyBad ? (type === "IN" ? "Số nguyên lớn hơn 0." : "Số nguyên khác 0.") : belowReserved ? `Tồn sau điều chỉnh không được thấp hơn số đang giữ (${num(p.reservedStock)}).` : undefined}
        >
          <input type="number" step={1} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="Tồn sau thay đổi">
          <input value={qtyBad ? "—" : num(after)} disabled className="cr-mono" />
        </Field>
        <Field label="Lý do / ghi chú" required wide error={note && note.trim().length < 3 ? "Tối thiểu 3 ký tự." : undefined} hint="VD: Nhập lô tháng 10, Kiểm kê hư hỏng 2 chai…">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
      {m.error ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}

function Ledger({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin", "products", "ledger", id, page],
    queryFn: ({ signal }) => api<Row[]>("GET /shop/manage/inventory/{productId}/transactions", { params: { productId: id }, query: { page: String(page), limit: "10" }, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel title="Nhật ký kho">
      <QueryView q={q} rows={4}>
        {(res) => (
          <>
            <DataTable
              rows={res.data}
              empty={<p className="cr-muted" style={{ margin: 0 }}>Chưa có biến động kho.</p>}
              columns={[
                { key: "t", title: "Thời điểm", render: (r) => <span className="cr-mono">{dateTime(r.createdAt)}</span> },
                {
                  key: "k",
                  title: "Loại",
                  render: (r) => {
                    const [l, t] = TX[str(r.type)] ?? [str(r.type), "info"];
                    return <Pill tone={t}>{l}</Pill>;
                  },
                },
                {
                  key: "q",
                  title: "Thay đổi",
                  className: "num",
                  render: (r) => {
                    const q = Math.abs(Number(r.quantity));
                    return ({ IN: `tồn +${num(q)}`, RETURN: `tồn +${num(q)}`, SALE: `tồn −${num(q)}`, RESERVE: `giữ +${num(q)}`, RELEASE: `giữ −${num(q)}` } as Record<string, string>)[str(r.type)] ?? `tồn ${Number(r.quantity) > 0 ? "+" : "−"}${num(q)}`;
                  },
                },
                { key: "a", title: "Tồn / giữ sau", className: "num", render: (r) => `${num(r.stockAfter)} / ${num(r.reservedAfter)}` },
                { key: "n", title: "Ghi chú", render: (r) => <span className="cr-muted">{str(r.note) || (r.order ? `Đơn ${str((r.order as Row).code)}` : "—")}</span> },
              ]}
            />
            <Pager meta={res.pagination} onPage={setPage} />
          </>
        )}
      </QueryView>
    </Panel>
  );
}

function Reviews({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Row | null>(null);
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "products", "reviews", id, page],
    queryFn: ({ signal }) => api<Row[]>("GET /shop/manage/reviews", { query: { productId: id, page: String(page), limit: "8" }, signal }),
    placeholderData: keepPreviousData,
  });
  const m = useMutation({
    mutationFn: (reason: string) => api("PATCH /shop/manage/reviews/{id}", { params: { id: str(target!.id) }, body: { isHidden: !target!.isHidden, ...(reason ? { reason } : {}) } }),
    onSuccess: () => {
      setTarget(null);
      void cache.invalidateQueries({ queryKey: ["admin", "products", "reviews", id] });
      onChanged();
    },
  });
  return (
    <Panel title="Đánh giá của khách">
      <QueryView q={q} rows={3}>
        {(res) => (
          <>
            <DataTable
              rows={res.data}
              empty={<EmptyState title="Chưa có đánh giá" text="Đánh giá của khách sau khi nhận hàng sẽ hiện tại đây." />}
              columns={[
                {
                  key: "u",
                  title: "Khách",
                  render: (r) => (
                    <div className="cr-cell-main">
                      <strong>{str((r.user as Row)?.fullName)}</strong>
                      <small>{dateTime(r.createdAt)}</small>
                    </div>
                  ),
                },
                { key: "r", title: "Điểm", render: (r) => <span className="cr-mono" style={{ color: "var(--warning)", letterSpacing: 1 }} aria-label={`${Number(r.rating)} sao`}>{"★".repeat(Number(r.rating))}</span> },
                { key: "c", title: "Nhận xét", render: (r) => str(r.comment) || <span className="cr-muted">—</span> },
                { key: "s", title: "Hiển thị", render: (r) => (r.isHidden ? <Pill tone="bad">Đã ẩn</Pill> : <Pill tone="ok">Công khai</Pill>) },
                {
                  key: "x",
                  title: "",
                  className: "actions",
                  render: (r) => (
                    <button className="cr-btn sm" onClick={() => setTarget(r)}>
                      {r.isHidden ? "Hiện lại" : "Ẩn"}
                    </button>
                  ),
                },
              ]}
            />
            <Pager meta={res.pagination} onPage={setPage} />
          </>
        )}
      </QueryView>
      {target && (
        <ConfirmDialog
          title={target.isHidden ? "Hiện lại đánh giá" : "Ẩn đánh giá"}
          target={`${str((target.user as Row)?.fullName)}: “${str(target.comment) || "—"}”`}
          consequence={target.isHidden ? "Đánh giá hiển thị công khai và được tính lại vào điểm trung bình." : "Đánh giá bị ẩn khỏi cửa hàng và không tính điểm trung bình."}
          confirmLabel={target.isHidden ? "Hiện lại" : "Ẩn đánh giá"}
          reason={target.isHidden ? undefined : { label: "Lý do ẩn" }}
          busy={m.isPending}
          error={m.error}
          onConfirm={(r) => m.mutate(r)}
          onClose={() => setTarget(null)}
        />
      )}
    </Panel>
  );
}
