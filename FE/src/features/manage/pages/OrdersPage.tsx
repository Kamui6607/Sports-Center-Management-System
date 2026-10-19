import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api";
import { DataTable, Dialog, Dl, ErrorBox, Field, PageHead, Pager, Panel, Pill, QueryView, SearchBox, Select, Skeleton, dateTime, get, num, str, useUrlState, vnd } from "../kit";
import type { Row } from "../kit";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  PROCESSING: "Đang chuẩn bị",
  READY_FOR_PICKUP: "Sẵn sàng nhận",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn tất",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã hủy",
  NOT_PICKED_UP: "Không đến lấy",
  REFUND_REQUESTED: "Chờ hoàn tiền",
  REFUNDED: "Đã hoàn tiền",
};
const TONE: Record<string, "ok" | "warn" | "bad" | "info"> = {
  PAID: "warn",
  PROCESSING: "warn",
  READY_FOR_PICKUP: "info",
  SHIPPING: "info",
  DELIVERED: "ok",
  COMPLETED: "ok",
  EXPIRED: "bad",
  CANCELLED: "bad",
  NOT_PICKED_UP: "bad",
  REFUND_REQUESTED: "warn",
  REFUNDED: "info",
};
const statusPill = (s: unknown) => <Pill tone={TONE[str(s)] ?? "info"}>{STATUS_LABEL[str(s)] ?? str(s)}</Pill>;

/** Đơn hàng cửa hàng: xử lý theo trạng thái (chuẩn bị, giao, sẵn sàng nhận), xác nhận nhận hàng tại quầy bằng mã. */
export default function OrdersPage() {
  const s = useUrlState();
  const [openId, setOpenId] = useState<string | null>(null);
  const query = { search: s.value("search"), status: s.value("status"), fulfillmentType: s.value("fulfillmentType"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "orders", query],
    queryFn: ({ signal }) => api<Row[]>("GET /shop/manage/orders", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHead eyebrow="Kinh doanh · Cửa hàng" title="Đơn hàng" desc="Giá và tên sản phẩm trên đơn là ảnh chụp lúc đặt — đổi giá sản phẩm không ảnh hưởng đơn cũ." />
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Mã đơn, tên, SĐT" />
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS_LABEL)} />
          <Select
            label="Hình thức"
            value={s.value("fulfillmentType")}
            onChange={(v) => s.set({ fulfillmentType: v })}
            options={[
              ["PICKUP", "Nhận tại quầy"],
              ["DELIVERY", "Giao tận nơi"],
            ]}
          />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                label="Đơn hàng"
                columns={[
                  {
                    key: "code",
                    title: "Mã đơn",
                    render: (r) => (
                      <div className="cr-cell-main">
                        <button type="button" className="cr-link" onClick={() => setOpenId(str(r.id))}>
                          {str(r.code)}
                        </button>
                        <small>{str(r.recipientName)}</small>
                      </div>
                    ),
                  },
                  { key: "type", title: "Hình thức", render: (r) => (r.fulfillmentType === "DELIVERY" ? "Giao tận nơi" : "Nhận tại quầy") },
                  { key: "total", title: "Tổng tiền", className: "num", render: (r) => vnd(r.totalPrice) },
                  { key: "at", title: "Đặt lúc", render: (r) => dateTime(r.createdAt) },
                  { key: "st", title: "Trạng thái", render: (r) => statusPill(r.status) },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (r) => (
                      <button className="cr-btn sm" onClick={() => setOpenId(str(r.id))}>
                        Xử lý
                      </button>
                    ),
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {openId && <OrderDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function OrderDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const cache = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "orders", "detail", id], queryFn: ({ signal }) => api<Row>("GET /shop/manage/orders/{id}", { params: { id }, signal }) });
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [last4, setLast4] = useState("");
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "orders"] });
  };
  const transition = useMutation({
    mutationFn: (status: string) =>
      api("POST /shop/manage/orders/{id}/status", {
        params: { id },
        body: {
          status,
          ...(status === "SHIPPING" ? { trackingCode: tracking.trim(), carrier: carrier.trim() || undefined } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      }),
    onSuccess: refresh,
  });
  const pickup = useMutation({
    mutationFn: () => api("POST /shop/manage/orders/{id}/pickup", { params: { id }, body: { code: code.trim(), phoneLast4: last4.trim() } }),
    onSuccess: refresh,
  });
  const o = q.data?.data;
  const allowed = ((o?.allowedTransitions as Row[] | undefined) ?? []).map((t) => [str(t.status), str(t.label), Boolean(t.requiresTrackingCode)] as const);
  const busy = transition.isPending || pickup.isPending;
  return (
    <Dialog title={o ? `Đơn ${str(o.code)}` : "Đơn hàng"} eyebrow={o ? STATUS_LABEL[str(o.status)] : undefined} onClose={onClose} busy={busy} wide>
      {q.isPending ? (
        <Skeleton rows={6} />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : o ? (
        <>
          <Dl
            items={[
              ["Người mua", [get(o, "buyer.fullName"), get(o, "buyer.phone")].filter(Boolean).map(str).join(" · ")],
              ["Người nhận", [o.recipientName, o.recipientPhone].filter(Boolean).map(str).join(" · ")],
              ["Hình thức", o.fulfillmentType === "DELIVERY" ? "Giao tận nơi" : "Nhận tại quầy"],
              ["Địa chỉ giao", str(o.shippingAddress)],
              ["Tạm tính", vnd(o.subtotal)],
              ["Phí giao", vnd(o.shippingFee)],
              ["Tổng tiền", vnd(o.totalPrice)],
              ["Trạng thái", statusPill(o.status)],
              ["Mã vận đơn", [o.carrier, o.trackingCode].filter(Boolean).map(str).join(" · ")],
              ["Hạn nhận hàng", o.pickupDeadline ? dateTime(o.pickupDeadline) : ""],
              ["Ghi chú", str(o.note)],
            ]}
          />
          <Panel title="Sản phẩm">
            <DataTable
              rows={(o.items as Row[] | undefined) ?? []}
              label="Dòng hàng"
              columns={[
                { key: "n", title: "Sản phẩm", render: (r) => str(r.productName) },
                { key: "q", title: "SL", className: "num", render: (r) => num(r.quantity) },
                { key: "p", title: "Đơn giá lúc đặt", className: "num", render: (r) => vnd(r.unitPrice) },
                { key: "t", title: "Thành tiền", className: "num", render: (r) => vnd(r.totalAmount) },
              ]}
            />
          </Panel>
          {o.status === "READY_FOR_PICKUP" && (
            <Panel title="Xác nhận khách nhận hàng tại quầy">
              <div className="cr-form">
                <Field label="Mã nhận hàng" required>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã/QR khách xuất trình" />
                </Field>
                <Field label="4 số cuối SĐT người nhận" required>
                  <input value={last4} inputMode="numeric" maxLength={4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
                </Field>
              </div>
              <button className="cr-btn primary" disabled={busy || code.trim().length < 6 || last4.length !== 4} onClick={() => pickup.mutate()}>
                Xác nhận đã giao hàng
              </button>
              {pickup.error ? <ErrorBox error={pickup.error} /> : null}
            </Panel>
          )}
          {allowed.length > 0 && (
            <Panel title="Chuyển trạng thái">
              <div className="cr-form">
                {allowed.some(([, , needTrack]) => needTrack) && (
                  <>
                    <Field label="Mã vận đơn" hint="Bắt buộc khi chuyển sang Đang giao">
                      <input value={tracking} onChange={(e) => setTracking(e.target.value)} />
                    </Field>
                    <Field label="Đơn vị vận chuyển">
                      <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="VD: GHN, GHTK" />
                    </Field>
                  </>
                )}
                <Field label="Ghi chú / lý do" wide>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {allowed.map(([status, label, needTrack]) => (
                  <button
                    key={status}
                    className={"cr-btn " + (status === "REFUND_REQUESTED" || status === "NOT_PICKED_UP" ? "danger" : "primary")}
                    disabled={busy || (needTrack && tracking.trim().length < 3)}
                    onClick={() => transition.mutate(status)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {transition.error ? <ErrorBox error={transition.error} /> : null}
            </Panel>
          )}
        </>
      ) : null}
    </Dialog>
  );
}
