import { useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api";
import { InvoiceDialog } from "../../../shared/InvoiceDialog";
import {
  periodQuery,
  PERIOD_OPTIONS,
  ConfirmDialog,
  DataTable,
  Dialog,
  Dl,
  ErrorBox,
  Field,
  PageHead,
  Pager,
  Panel,
  Pill,
  QueryView,
  SearchBox,
  Select,
  Skeleton,
  Tag,
  dateOnly,
  dateTime,
  get,
  num,
  str,
  useUrlState,
  vnd,
} from "../kit";
import type { Row } from "../kit";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Chờ chuẩn bị · trả tại quầy",
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
  CONFIRMED: "warn",
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
const QUEUE_LABEL: Record<string, string> = {
  PICKUP_TODAY: "Khách hẹn lấy hôm nay",
  REFUND_PENDING: "Đang chờ hoàn tiền",
  STALE_REFUND: "Hoàn tiền tồn đọng",
};
const REFUND_REASON: Record<string, string> = {
  ORDER_CANCELLED: "Hủy đơn đã thanh toán",
  ORDER_NOT_PICKED_UP: "Không đến lấy hàng",
  ORDER_LATE_PAYMENT: "Tiền về sau khi đơn đóng",
  COURSE_NOT_FULFILLED: "Không ghi danh đủ buổi",
};
const REFUND_STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  PENDING: ["Chờ hoàn", "warn"],
  COMPLETED: ["Đã hoàn", "ok"],
  REJECTED: ["Từ chối", "bad"],
  CANCELLED: ["Đã hủy", "info"],
};
const statusPill = (s: unknown) => <Pill tone={TONE[str(s)] ?? "info"}>{STATUS_LABEL[str(s)] ?? str(s)}</Pill>;
const payLabel = (r: Row) =>
  r.paymentMethod === "CASH" ? (r.isPaid ? "Tiền mặt tại quầy · đã thu" : "Trả tại quầy · chưa thu") : r.isPaid ? "Chuyển khoản · đã trả" : "Chuyển khoản";

/** VietQR để Manager quét chuyển khoản hoàn tiền (cùng định dạng trang Hoàn tiền). */
function refundQr(r: Row) {
  const bank = str(r.bankName).replace(/\s+/g, "").toUpperCase();
  const acc = str(r.bankAccountNumber).replace(/\s+/g, "");
  if (!bank || !acc) return null;
  const info = encodeURIComponent(`HOANTIEN ${str(r.id).slice(0, 8).toUpperCase()}`);
  return `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${Number(r.amount) || 0}&addInfo=${info}&accountName=${encodeURIComponent(str(r.bankAccountName))}`;
}

/** Đơn hàng cửa hàng: xử lý theo trạng thái, thu tiền + giao tại quầy bằng mã, hoàn tiền ngay trong đơn. */
export default function OrdersPage() {
  const s = useUrlState();
  const [openId, setOpenId] = useState<string | null>(null);
  const query = {
    search: s.value("search"),
    status: s.value("status"),
    fulfillmentType: s.value("fulfillmentType"),
    queue: s.value("queue"),
    ...periodQuery(s.value("period")),
    page: String(s.page),
    limit: "15",
  };
  const q = useQuery({
    queryKey: ["admin", "orders", query],
    queryFn: ({ signal }) => api<Row[]>("GET /shop/manage/orders", { query, signal }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHead
        eyebrow="Kinh doanh · Cửa hàng"
        title="Đơn hàng"
        desc="Giá và tên sản phẩm trên đơn là ảnh chụp lúc đặt. Đơn trả tại quầy thu tiền khi giao; đơn đã trả mà bị hủy hoặc khách không đến lấy được hoàn ngay trong chi tiết đơn."
      />
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Mã đơn, tên, SĐT" />
          <Select label="Cần xử lý" value={s.value("queue")} onChange={(v) => s.set({ queue: v })} options={Object.entries(QUEUE_LABEL)} />
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS_LABEL)} />
          <Select label="Ngày đặt" all="Mọi thời gian" value={s.value("period")} onChange={(v) => s.set({ period: v })} options={PERIOD_OPTIONS} />
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
                  {
                    key: "type",
                    title: "Nhận hàng",
                    render: (r) =>
                      r.fulfillmentType === "DELIVERY" ? (
                        "Giao tận nơi"
                      ) : (
                        <div className="cr-cell-main">
                          <span>Tại quầy</span>
                          {r.preferredPickupDate ? <small>Hẹn {dateOnly(`${str(r.preferredPickupDate)}T00:00:00+07:00`)}</small> : null}
                        </div>
                      ),
                  },
                  { key: "pay", title: "Thanh toán", render: (r) => payLabel(r) },
                  { key: "total", title: "Tổng tiền", className: "num", render: (r) => vnd(r.totalPrice) },
                  { key: "at", title: "Đặt lúc", render: (r) => dateTime(r.createdAt) },
                  {
                    key: "st",
                    title: "Trạng thái",
                    render: (r) => {
                      const refund = r.pendingRefund as Row | null | undefined;
                      return (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {statusPill(r.status)}
                          {refund?.isStale ? <Tag tone="bad">Tồn đọng</Tag> : null}
                          {refund?.awaitingBankInfo ? <Tag tone="warn">Chờ STK</Tag> : null}
                        </div>
                      );
                    },
                  },
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
  const [invoiceId, setInvoiceId] = useState("");
  const [last4, setLast4] = useState("");
  const [cashCollected, setCashCollected] = useState(false);
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "orders"] });
    void cache.invalidateQueries({ queryKey: ["admin", "refunds"] });
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
    mutationFn: () =>
      api("POST /shop/manage/orders/{id}/pickup", {
        params: { id },
        body: { code: code.trim(), phoneLast4: last4.trim(), ...(cashCollected ? { cashCollected: true } : {}) },
      }),
    onSuccess: refresh,
  });
  const o = q.data?.data;
  const allowed = ((o?.allowedTransitions as Row[] | undefined) ?? []).map((t) => [str(t.status), str(t.label), Boolean(t.requiresTrackingCode)] as const);
  const busy = transition.isPending || pickup.isPending;
  const pickupInfo = o?.pickup as Row | null | undefined;
  const needCash = Boolean(pickupInfo?.requiresCashCollection);
  const amountDue = Number(o?.amountDueAtCounter ?? 0);
  const refunds = (o?.refunds as Row[] | undefined) ?? [];
  const noShows = Number(get(o, "buyer.noShowCount") ?? 0);
  const cashLock = get(o, "buyer.cashPickupLockedUntil");
  const reasonOk = reason.trim().length >= 3;
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
              [
                "Người mua",
                <span key="buyer">
                  {[get(o, "buyer.fullName"), get(o, "buyer.phone")].filter(Boolean).map(str).join(" · ")}
                  {noShows > 0 ? (
                    <>
                      {" "}
                      <Tag tone={noShows >= 2 ? "bad" : "warn"}>Bùng hàng {noShows} lần / 90 ngày</Tag>
                    </>
                  ) : null}
                  {cashLock ? (
                    <>
                      {" "}
                      <Tag tone="bad">Khóa trả tại quầy tới {dateOnly(cashLock)}</Tag>
                    </>
                  ) : null}
                </span>,
              ],
              ["Người nhận", [o.recipientName, o.recipientPhone].filter(Boolean).map(str).join(" · ")],
              ["Hình thức", o.fulfillmentType === "DELIVERY" ? "Giao tận nơi" : "Nhận tại quầy"],
              ["Địa chỉ giao", str(o.shippingAddress)],
              [
                "Ngày hẹn lấy",
                o.preferredPickupDate
                  ? `${dateOnly(`${str(o.preferredPickupDate)}T00:00:00+07:00`)}${Number(o.pickupRescheduleCount) > 0 ? " (khách đã đổi ngày)" : ""}`
                  : "",
              ],
              ["Hạn nhận hàng", o.pickupDeadline ? dateTime(o.pickupDeadline) : ""],
              ["Tạm tính", vnd(o.subtotal)],
              ["Phí giao", vnd(o.shippingFee)],
              ["Tổng tiền", vnd(o.totalPrice)],
              ["Trạng thái", statusPill(o.status)],
              ["Mã vận đơn", [o.carrier, o.trackingCode].filter(Boolean).map(str).join(" · ")],
              ["Ghi chú", str(o.note)],
            ].filter(([, v]) => v !== "") as [string, ReactNode][]}
          />
          <Panel title="Thanh toán">
            <Dl
              items={[
                ["Phương thức", payLabel(o)],
                ["Số tiền", o.payment ? vnd(get(o, "payment.amount")) : amountDue > 0 ? `${vnd(amountDue)} — thu khi khách nhận hàng` : ""],
                ["Trạng thái", str(get(o, "payment.status")) ? <PaymentPill key="pay" status={get(o, "payment.status")} /> : amountDue > 0 ? <Pill tone="warn">Chưa thu</Pill> : ""],
                ["Thời điểm trả", get(o, "payment.paidAt") ? dateTime(get(o, "payment.paidAt")) : ""],
                ["Mã giao dịch", str(get(o, "payment.transactionCode"))],
              ].filter(([, v]) => v !== "") as [string, ReactNode][]}
            />
            {get(o, "payment.id") && ["SUCCESS", "REFUNDED"].includes(str(get(o, "payment.status"))) ? (
              <button className="cr-btn sm" style={{ marginTop: 8 }} onClick={() => setInvoiceId(str(get(o, "payment.id")))}>
                Xem hóa đơn (đơn giá, phí giao, tổng)
              </button>
            ) : null}
            {invoiceId ? <InvoiceDialog id={invoiceId} onClose={() => setInvoiceId("")} /> : null}
            {get(o, "payment.requiresReview") ? (
              <p className="cr-muted" style={{ marginTop: 8 }}>
                Giao dịch cần đối soát: {str(get(o, "payment.reviewReason"))}
              </p>
            ) : null}
          </Panel>
          {refunds.length > 0 && (
            <Panel title="Hoàn tiền">
              {refunds.map((r) => (
                <RefundBlock key={str(r.id)} orderId={id} refund={r} onDone={refresh} />
              ))}
            </Panel>
          )}
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
            <Panel title={needCash ? "Thu tiền & giao hàng tại quầy" : "Xác nhận khách nhận hàng tại quầy"}>
              <div className="cr-form">
                <Field label="Mã nhận hàng" required>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã/QR khách xuất trình" />
                </Field>
                <Field label="4 số cuối SĐT người nhận" required>
                  <input value={last4} inputMode="numeric" maxLength={4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
                </Field>
                {needCash && (
                  <label className="wide" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                    <input type="checkbox" checked={cashCollected} onChange={(e) => setCashCollected(e.target.checked)} />
                    Đã thu đủ {vnd(amountDue)} tiền mặt của khách
                  </label>
                )}
              </div>
              <button
                className="cr-btn primary"
                disabled={busy || code.trim().length < 6 || last4.length !== 4 || (needCash && !cashCollected)}
                onClick={() => pickup.mutate()}
              >
                {needCash ? `Đã thu ${vnd(amountDue)} — Giao hàng` : "Xác nhận đã giao hàng"}
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
                <Field
                  label="Ghi chú / lý do"
                  wide
                  hint={allowed.some(([st]) => st === "REFUND_REQUESTED") ? "Bắt buộc khi hủy & hoàn tiền — khách nhận được lý do này." : undefined}
                >
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {allowed.map(([status, label, needTrack]) => (
                  <button
                    key={status}
                    className={"cr-btn " + (["REFUND_REQUESTED", "NOT_PICKED_UP", "CANCELLED"].includes(status) ? "danger" : "primary")}
                    disabled={busy || (needTrack && tracking.trim().length < 3) || (status === "REFUND_REQUESTED" && !reasonOk)}
                    onClick={() => transition.mutate(status)}
                  >
                    {status === "REFUND_REQUESTED" ? "Hủy & hoàn tiền" : status === "CANCELLED" ? "Hủy đơn" : label}
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

function PaymentPill({ status }: { status: unknown }) {
  const s = str(status);
  const map: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
    PENDING: ["Chờ chuyển khoản", "warn"],
    SUCCESS: ["Đã thu", "ok"],
    FAILED: ["Thất bại", "bad"],
    REFUNDED: ["Đã hoàn", "info"],
  };
  const [label, tone] = map[s] ?? [s, "info"];
  return <Pill tone={tone}>{label}</Pill>;
}

/** Một yêu cầu hoàn tiền của đơn: thông tin, STK của khách (hoặc nhắc khách gửi), duyệt chuyển khoản / tiền mặt, từ chối. */
function RefundBlock({ orderId, refund: r, onDone }: { orderId: string; refund: Row; onDone: () => void }) {
  const pending = r.status === "PENDING";
  const [payout, setPayout] = useState<"BANK_TRANSFER" | "CASH">(r.hasBankInfo ? "BANK_TRANSFER" : "CASH");
  const [txRef, setTxRef] = useState("");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const approve = useMutation({
    mutationFn: () =>
      api("PATCH /refunds/{id}/approve", {
        params: { id: str(r.id) },
        body: { payoutMethod: payout, transactionRef: txRef.trim() || undefined, note: note.trim() || undefined },
      }),
    onSuccess: onDone,
  });
  const reject = useMutation({
    mutationFn: (reason: string) => api("PATCH /refunds/{id}/reject", { params: { id: str(r.id) }, body: { reason } }),
    onSuccess: () => {
      setRejecting(false);
      onDone();
    },
  });
  const remind = useMutation({
    mutationFn: () => api("POST /shop/manage/orders/{id}/remind-refund-bank", { params: { id: orderId } }),
    onSuccess: onDone,
  });
  const [statusLabel, statusTone] = REFUND_STATUS[str(r.status)] ?? [str(r.status), "info"];
  const qr = r.hasBankInfo ? refundQr(r) : null;
  const fee = Number(r.feePercent ?? 0);
  const transferBlocked = payout === "BANK_TRANSFER" && !r.hasBankInfo;
  return (
    <div style={{ borderTop: "1px solid var(--line, rgba(127,127,127,.2))", paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <strong>{vnd(r.amount)}</strong>
        <Pill tone={statusTone}>{statusLabel}</Pill>
        <span className="cr-muted">{REFUND_REASON[str(r.reason)] ?? str(r.reason)}</span>
        {r.isStale ? <Tag tone="bad">Tồn đọng {num(r.pendingDays)} ngày</Tag> : pending && r.pendingDays != null ? <Tag>Chờ {num(r.pendingDays)} ngày</Tag> : null}
      </div>
      <Dl
        items={[
          ["Giá trị gốc", fee > 0 ? `${vnd(r.grossAmount)} − ${fee}% phí giữ hàng` : ""],
          ["Ghi chú", str(r.note)],
          ["Ngân hàng", r.hasBankInfo ? `${str(r.bankName)} · ${str(r.bankAccountNumber)} · ${str(r.bankAccountName)}` : pending ? "Khách chưa cung cấp số tài khoản" : ""],
          ["Đã nhắc khách", r.bankInfoRequestedAt ? dateTime(r.bankInfoRequestedAt) : ""],
          ["Cách hoàn", r.payoutMethod === "CASH" ? "Tiền mặt tại quầy" : r.payoutMethod === "BANK_TRANSFER" ? "Chuyển khoản" : ""],
          ["Xử lý lúc", r.processedAt ? dateTime(r.processedAt) : ""],
          ["Ghi chú quản lý", str(r.managerNote)],
          ["Lý do từ chối", str(r.rejectReason)],
        ].filter(([, v]) => v !== "") as [string, ReactNode][]}
      />
      {pending && (
        <>
          {qr && payout === "BANK_TRANSFER" ? <img src={qr} alt="Mã VietQR chuyển khoản hoàn tiền" style={{ maxWidth: 200, marginTop: 10 }} /> : null}
          <div className="cr-form" style={{ marginTop: 10 }}>
            <Field label="Cách hoàn tiền" required>
              <select value={payout} onChange={(e) => setPayout(e.target.value as "BANK_TRANSFER" | "CASH")}>
                <option value="BANK_TRANSFER">Chuyển khoản vào STK của khách</option>
                <option value="CASH">Tiền mặt khi khách đến quầy</option>
              </select>
            </Field>
            {payout === "BANK_TRANSFER" && (
              <Field label="Mã giao dịch chuyển khoản" hint="FT/Ref code để đối soát">
                <input value={txRef} onChange={(e) => setTxRef(e.target.value)} maxLength={100} />
              </Field>
            )}
            <Field label="Ghi chú" wide>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {!r.hasBankInfo && (
              <button type="button" className="cr-btn" disabled={remind.isPending} onClick={() => remind.mutate()}>
                {remind.isPending ? "Đang gửi…" : "Nhắc khách gửi STK"}
              </button>
            )}
            <button type="button" className="cr-btn danger" disabled={approve.isPending} onClick={() => setRejecting(true)}>
              Từ chối
            </button>
            <button type="button" className="cr-btn primary" disabled={approve.isPending || transferBlocked} onClick={() => approve.mutate()}>
              {approve.isPending ? "Đang xử lý…" : payout === "CASH" ? `Đã trả ${vnd(r.amount)} tiền mặt — Duyệt` : `Đã chuyển khoản ${vnd(r.amount)} — Duyệt`}
            </button>
          </div>
          {transferBlocked ? (
            <p className="cr-muted" style={{ marginTop: 8 }}>
              Chưa có số tài khoản: nhắc khách cập nhật trong app, hoặc chọn hoàn tiền mặt khi khách đến quầy.
            </p>
          ) : null}
          {approve.error ? <ErrorBox error={approve.error} /> : null}
          {remind.error ? <ErrorBox error={remind.error} /> : null}
        </>
      )}
      {rejecting && (
        <ConfirmDialog
          title="Từ chối hoàn tiền"
          target={`${vnd(r.amount)} · ${REFUND_REASON[str(r.reason)] ?? str(r.reason)}`}
          consequence={
            r.reason === "ORDER_CANCELLED"
              ? "Đơn quay lại trạng thái trước khi yêu cầu hủy để Trung tâm xử lý tiếp. Khách nhận thông báo kèm lý do."
              : "Khách không được hoàn khoản này và nhận thông báo kèm lý do."
          }
          confirmLabel="Từ chối"
          danger
          reason={{ label: "Lý do từ chối", required: true, min: 3 }}
          busy={reject.isPending}
          error={reject.error}
          onConfirm={(reason) => reject.mutate(reason)}
          onClose={() => setRejecting(false)}
        />
      )}
    </div>
  );
}
