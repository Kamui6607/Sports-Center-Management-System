import { resolveAssetUrl } from "../../../shared/resolveAssetUrl";
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Package, Pencil, Plus } from "lucide-react";
import { api } from "../../../shared/api";
import { DataTable, Dialog, ErrorBox, Field, fieldErrors, PageHead, Pager, Panel, Pill, QueryView, RowAction, SearchBox, Select, num, str, useUrlState, vnd } from "../kit";
import type { Row } from "../kit";

export function ProductThumb({ url, size = 36 }: { url: unknown; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken)
    return (
      <span className="cr-thumb" style={{ width: size, height: size }} aria-hidden="true">
        <Package size={Math.round(size * 0.45)} strokeWidth={1.6} />
      </span>
    );
  return <img className="cr-thumb" src={str(url)} alt="" style={{ width: size, height: size }} onError={() => setBroken(true)} loading="lazy" />;
}

/** Trạng thái tồn kho (khác trạng thái kinh doanh): theo số có thể bán so với ngưỡng cảnh báo. */
export function StockPill({ p }: { p: Row }) {
  const available = Number(p.availableStock ?? 0);
  if (available <= 0) return <Pill tone="bad">Hết hàng</Pill>;
  if (available <= Number(p.lowStockThreshold ?? 0)) return <Pill tone="warn">Sắp hết</Pill>;
  return <span className="cr-muted">Còn hàng</span>;
}

export function SellPill({ active }: { active: unknown }) {
  return active ? <span className="cr-muted">Đang bán</span> : <Pill>Ngừng bán</Pill>;
}

export default function ProductsPage() {
  const s = useUrlState({ isActive: "all" });
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const query = { search: s.value("search"), isActive: s.value("isActive"), page: String(s.page), limit: "20" };
  const q = useQuery({
    queryKey: ["admin", "products", "list", query],
    queryFn: ({ signal }) => api<Row[]>("GET /products", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHead
        title="Sản phẩm"
        actions={
          <button className="cr-btn primary" onClick={() => setEditing("new")}>
            <Plus size={16} /> Thêm sản phẩm
          </button>
        }
      />
      <Panel flush>
        <div className="cr-toolbar">
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tìm sản phẩm" />
          <Select
            label="Trạng thái kinh doanh"
            all={null}
            value={s.value("isActive")}
            onChange={(v) => s.set({ isActive: v })}
            options={[
              ["all", "Tất cả trạng thái"],
              ["true", "Đang bán"],
              ["false", "Ngừng bán"],
            ]}
          />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                label="Danh sách sản phẩm"
                rows={res.data}
                empty={
                  <div className="cr-state">
                    <Package size={24} strokeWidth={1.6} aria-hidden="true" />
                    <h3>{s.value("search") || s.value("isActive") !== "all" ? "Không có sản phẩm phù hợp" : "Chưa có sản phẩm"}</h3>
                    <p>{s.value("search") ? "Thử từ khóa khác hoặc bỏ bộ lọc." : "Thêm sản phẩm đầu tiên để bắt đầu bán trên ứng dụng."}</p>
                  </div>
                }
                columns={[
                  {
                    key: "n",
                    title: "Sản phẩm",
                    render: (p) => (
                      <div className="cr-cell-media">
                        <ProductThumb url={p.imageUrl} />
                        <div className="cr-cell-main">
                          <Link to={`/manager/products/${str(p.id)}`}>{str(p.name)}</Link>
                          {Number(p.reviewCount) > 0 && (
                            <small>
                              {Number(p.rating).toFixed(1)}/5 · {num(p.reviewCount)} đánh giá
                            </small>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  { key: "p", title: "Giá bán", className: "num", render: (p) => vnd(p.price) },
                  {
                    key: "st",
                    title: "Tồn kho",
                    className: "num",
                    render: (p) => (
                      <div className="cr-cell-main" style={{ minWidth: 0, justifyItems: "end" }}>
                        <span>{num(p.stockQuantity)}</span>
                        {Number(p.reservedStock) > 0 && <small>{num(p.availableStock)} có thể bán</small>}
                      </div>
                    ),
                  },
                  { key: "av", title: "Kho", render: (p) => <StockPill p={p} /> },
                  { key: "a", title: "Kinh doanh", render: (p) => <SellPill active={p.isActive} /> },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (p) => (
                      <span className="cr-row-actions">
                        <RowAction label={`Sửa ${str(p.name)}`} onClick={() => setEditing(p)}>
                          <Pencil size={15} />
                        </RowAction>
                        <RowAction label={`Mở ${str(p.name)}`} to={`/manager/products/${str(p.id)}`}>
                          <ChevronRight size={16} />
                        </RowAction>
                      </span>
                    ),
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {editing && <ProductDialog product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const urlOk = (u: string) => /^https?:\/\/\S+$/i.test(u);

export function ProductDialog({ product, onClose }: { product: Row | null; onClose: () => void }) {
  const editing = Boolean(product);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [f, setF] = useState({
    name: str(product?.name),
    description: str(product?.description),
    price: product ? String(Number(product.price)) : "",
    stockQuantity: "0",
    imageUrl: str(product?.imageUrl),
    extraImages: ((product?.imageUrls as string[] | undefined) ?? []).filter((u) => u !== product?.imageUrl).join("\n"),
    maxPerOrder: product ? str(product.maxPerOrder) : "10",
    maxPerDay: product ? str(product.maxPerDay) : "20",
    lowStockThreshold: product ? str(product.lowStockThreshold) : "5",
    isActive: product ? Boolean(product.isActive) : true,
  });
  const cache = useQueryClient();
  const navigate = useNavigate();
  const extra = f.extraImages.split(/\s+/).map((u) => u.trim()).filter(Boolean);
  const intOk = (v: string, min: number) => Number.isInteger(Number(v)) && Number(v) >= min;
  const problems = {
    name: f.name.trim().length < 2 ? "Tối thiểu 2 ký tự." : "",
    description: f.description.trim().length < 5 ? "Tối thiểu 5 ký tự." : "",
    price: !(f.price !== "" && Number(f.price) >= 0) ? "Giá không âm." : "",
    stockQuantity: !editing && !intOk(f.stockQuantity, 0) ? "Số nguyên ≥ 0." : "",
    imageUrl: !imageFile && f.imageUrl && !urlOk(f.imageUrl) ? "URL ảnh phải bắt đầu bằng http:// hoặc https://" : "",
    extraImages: extra.some((u) => !urlOk(u)) ? "Mỗi dòng là một URL http(s)." : extra.length > 9 ? "Tối đa 9 ảnh phụ." : "",
    maxPerOrder: !intOk(f.maxPerOrder, 1) ? "Số nguyên ≥ 1." : "",
    maxPerDay: !intOk(f.maxPerDay, 1) ? "Số nguyên ≥ 1." : "",
    lowStockThreshold: !intOk(f.lowStockThreshold, 0) ? "Số nguyên ≥ 0." : "",
  };
  const invalid = Object.values(problems).some(Boolean);
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setF((prev) => ({ ...prev, imageUrl: "" }));
    }
  };

  const m = useMutation({
    mutationFn: () => {
      if (imageFile) {
        const formData = new FormData();
        formData.append("name", f.name.trim());
        formData.append("description", f.description.trim());
        formData.append("price", String(Number(f.price)));
        if (!editing) formData.append("stockQuantity", String(Number(f.stockQuantity)));
        formData.append("maxPerOrder", String(Number(f.maxPerOrder)));
        formData.append("maxPerDay", String(Number(f.maxPerDay)));
        formData.append("lowStockThreshold", String(Number(f.lowStockThreshold)));
        formData.append("isActive", String(f.isActive));
        formData.append("imageUrl", imageFile);
        if (extra.length > 0) formData.append("imageUrls", JSON.stringify(extra));
        return editing ? api<Row>("PATCH /products/{id}", { params: { id: str(product!.id) }, body: formData as any }) : api<Row>("POST /products", { body: formData as any });
      }
      const imageUrl = f.imageUrl.trim() || null;
      const body: Record<string, unknown> = {
        name: f.name.trim(),
        description: f.description.trim(),
        price: Number(f.price),
        imageUrl,
        imageUrls: imageUrl ? [imageUrl, ...extra] : extra,
        maxPerOrder: Number(f.maxPerOrder),
        maxPerDay: Number(f.maxPerDay),
        lowStockThreshold: Number(f.lowStockThreshold),
        isActive: f.isActive,
      };
      if (!editing) body.stockQuantity = Number(f.stockQuantity);
      return editing ? api<Row>("PATCH /products/{id}", { params: { id: str(product!.id) }, body }) : api<Row>("POST /products", { body });
    },
    onSuccess: (res) => {
      void cache.invalidateQueries({ queryKey: ["admin", "products"] });
      void cache.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      onClose();
      if (!editing) navigate(`/manager/products/${str(res.data.id)}`);
    },
  });
  const errs = fieldErrors(m.error);
  const show = (k: keyof typeof problems, touched: boolean) => (touched ? problems[k] : "") || errs[k];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog
      title={editing ? `Sửa ${str(product!.name)}` : "Thêm sản phẩm"}
      eyebrow="Cửa hàng"
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
            {m.isPending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm sản phẩm"}
          </button>
        </>
      }
    >
      <div className="cr-form">
        <Field label="Tên sản phẩm" required error={show("name", f.name !== "")}>
          <input value={f.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Giá bán (VND)" required error={show("price", f.price !== "")} hint={editing ? "Đơn đã đặt giữ nguyên giá lúc mua." : undefined}>
          <input type="number" min={0} step={1000} value={f.price} onChange={set("price")} />
        </Field>
        <Field label="Mô tả" required wide error={show("description", f.description !== "")}>
          <textarea value={f.description} onChange={set("description")} />
        </Field>
        {!editing && (
          <Field label="Tồn đầu" required error={show("stockQuantity", true)} hint="Số lượng nhập kho ban đầu">
            <input type="number" min={0} value={f.stockQuantity} onChange={set("stockQuantity")} />
          </Field>
        )}
        <Field label="Cảnh báo sắp hết khi còn ≤" error={show("lowStockThreshold", true)}>
          <input type="number" min={0} value={f.lowStockThreshold} onChange={set("lowStockThreshold")} />
        </Field>
        <Field label="Tối đa / đơn" error={show("maxPerOrder", true)}>
          <input type="number" min={1} value={f.maxPerOrder} onChange={set("maxPerOrder")} />
        </Field>
        <Field label="Tối đa / người / ngày" error={show("maxPerDay", true)}>
          <input type="number" min={1} value={f.maxPerDay} onChange={set("maxPerDay")} />
        </Field>
        <Field label="Ảnh chính sản phẩm" wide error={show("imageUrl", true)} hint="Chọn tệp ảnh (JPEG, PNG, WEBP, GIF) hoặc dán đường dẫn ảnh">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <ProductThumb url={imagePreview || (urlOk(f.imageUrl) ? f.imageUrl : null)} size={44} />
            <label className="cr-btn sm">
              Chọn ảnh…
              <input type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
            </label>
            <span className="cr-subtle" style={{ fontSize: 12.5 }}>hoặc dán URL</span>
            <input
              value={f.imageUrl}
              onChange={(e) => {
                setImageFile(null);
                setImagePreview(null);
                setF({ ...f, imageUrl: e.target.value });
              }}
              placeholder="https://…"
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>
        </Field>
        <Field label="Ảnh phụ (mỗi dòng một URL)" wide error={show("extraImages", true)}>
          <textarea value={f.extraImages} onChange={set("extraImages")} style={{ minHeight: 64 }} />
        </Field>
        <label className="cr-check wide">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Đang bán (hiển thị trên ứng dụng)
        </label>
      </div>
      {m.error && !Object.keys(errs).length ? <ErrorBox error={m.error} /> : null}
    </Dialog>
  );
}
