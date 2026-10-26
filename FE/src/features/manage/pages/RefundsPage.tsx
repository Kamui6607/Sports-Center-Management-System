import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api";
import { SearchBox, periodQuery, PERIOD_OPTIONS, ConfirmDialog, DataTable, DetailColumns, DetailSection, DetailTotal, Dialog, Dl, ErrorBox, Field, PageHead, Pager, Panel, Pill, QueryView, Select, dateTime, get, num, str, useUrlState, vnd } from "../kit";
import type { Row } from "../kit";

/** Lý do hoàn tiền (BE `RefundReason`) — xem Doc/GYM_SCOPE_CHANGES.md §11. */
export const REFUND_REASON: Record<string, string> = {
  MEMBER_CANCEL_COURSE: "Hủy khóa ≥ 3 ngày (hoàn 100%)",
  MEMBER_CANCEL_COURSE_LATE: "Hủy khóa muộn — hoàn ngoại lệ",
  MEMBER_CANCEL_SESSION: "Hủy 1 buổi ≥ 24h (hoàn 80%)",
  SESSION_RESCHEDULED: "Hủy buổi bị dời lịch (hoàn 100%)",
  SESSION_CANCELLED: "Buổi bị hủy, không dạy bù",
  ORDER_CANCELLED: "Hủy đơn hàng đã thanh toán",
  ORDER_NOT_PICKED_UP: "Không đến lấy hàng",
  ORDER_LATE_PAYMENT: "Chuyển khoản sau khi đơn hết hạn",
  COURSE_NOT_FULFILLED: "Không ghi danh đủ buổi đã thanh toán",
};
const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  PENDING: ["Chờ duyệt", "warn"],
  COMPLETED: ["Đã hoàn", "ok"],
  REJECTED: ["Từ chối", "bad"],
  CANCELLED: ["Người gửi đã hủy", "info"],
};
const DEFAULT_LATE_FEE = 30;

function StatusPill({ status }: { status: unknown }) {
  const [l, t] = STATUS[str(status)] ?? [str(status), "info"];
  return <Pill tone={t}>{l}</Pill>;
}

/** Hoàn tiền: Manager chuyển khoản tay cho hội viên rồi duyệt (kèm mã giao dịch); hoàn ngoại lệ chốt phí chiết khấu. */
export default function RefundsPage() {
  const s = useUrlState();
  const [open, setOpen] = useState<Row | null>(null);
  const query = { status: s.value("status"), reason: s.value("reason"), search: s.value("search"), ...periodQuery(s.value("period")), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "refunds", query],
    queryFn: ({ signal }) => api<Row[]>("GET /refunds", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ["admin", "refunds", "summary"],
    queryFn: ({ signal }) => api<Row>("GET /refunds/summary", { signal }),
  });
  const pending = get(summary.data?.data, "pending") as Row | undefined;
  return (
    <>
      <PageHead
        eyebrow="Kinh doanh · Tài chính"
        title="Hoàn tiền"
        desc={
          pending
            ? `${num(pending.count)} yêu cầu chờ duyệt · ${vnd(pending.amount)}`
            : "Chuyển khoản hoàn tiền cho hội viên rồi xác nhận trên hệ thống."
        }
      />
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tên hoặc email hội viên" />
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS).map(([k, [l]]) => [k, l])} />
          <Select label="Ngày yêu cầu" all="Mọi thời gian" value={s.value("period")} onChange={(v) => s.set({ period: v })} options={PERIOD_OPTIONS} />
          <Select label="Lý do" value={s.value("reason")} onChange={(v) => s.set({ reason: v })} options={Object.entries(REFUND_REASON)} />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                label="Yêu cầu hoàn tiền"
                columns={[
                  {
                    key: "who",
                    title: "Người nhận",
                    render: (r) => (
                      <div className="cr-cell-main">
                        <button type="button" className="cr-link" onClick={() => setOpen(r)}>
                          {str(get(r, "member.user.fullName") || get(r, "order.user.fullName")) || "—"}
                        </button>
                        <small>{str(get(r, "class.name")) || (get(r, "order.code") ? `Đơn ${str(get(r, "order.code"))}` : "")}</small>
                      </div>
                    ),
                  },
                  { key: "reason", title: "Lý do", render: (r) => REFUND_REASON[str(r.reason)] ?? str(r.reason) },
                  {
                    key: "amount",
                    title: "Số tiền hoàn",
                    className: "num",
                    render: (r) => (
                      <>
                        {vnd(r.amount)}
                        {r.feePercent != null && <small style={{ display: "block" }}>Phí {num(r.feePercent)}%</small>}
                      </>
                    ),
                  },
                  { key: "at", title: "Gửi lúc", render: (r) => dateTime(r.createdAt) },
                  { key: "st", title: "Trạng thái", render: (r) => <StatusPill status={r.status} /> },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (r) => (
                      <button className="cr-btn sm" onClick={() => setOpen(r)}>
                        {r.status === "PENDING" ? "Xử lý" : "Chi tiết"}
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
      {open && <RefundDialog refund={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function RefundDialog({ refund, onClose }: { refund: Row; onClose: () => void }) {
  const cache = useQueryClient();
  const late = refund.reason === "MEMBER_CANCEL_COURSE_LATE";
  const pending = refund.status === "PENDING";
  const gross = Number(refund.grossAmount ?? refund.amount ?? 0);
  const [fee, setFee] = useState(str(refund.feePercent ?? DEFAULT_LATE_FEE));
  const [tx, setTx] = useState("");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const feeNum = Number(fee);
  const feeInvalid = late && (!Number.isInteger(feeNum) || feeNum < 0 || feeNum > 99);
  const amount = late && !feeInvalid ? Math.round((gross * (100 - feeNum)) / 100) : Number(refund.amount ?? 0);
  const done = () => {
    void cache.invalidateQueries({ queryKey: ["admin", "refunds"] });
    onClose();
  };
  const approve = useMutation({
    mutationFn: () =>
      api("PATCH /refunds/{id}/approve", {
        params: { id: str(refund.id) },
        body: { transactionRef: tx.trim() || undefined, note: note.trim() || undefined, ...(late ? { feePercent: feeNum } : {}) },
      }),
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: (reason: string) => api("PATCH /refunds/{id}/reject", { params: { id: str(refund.id) }, body: { reason } }),
    onSuccess: done,
  });
  const bank = refund.bankInfo as Row | null | undefined;
  if (rejecting)
    return (
      <ConfirmDialog
        title="Từ chối hoàn tiền"
        target={`${str(get(refund, "member.user.fullName") || get(refund, "order.user.fullName"))} · ${vnd(refund.amount)}`}
        consequence={late ? "Hội viên không được hoàn tiền; khóa học vẫn ở trạng thái đã hủy." : "Không trừ ví HLV, giao dịch giữ nguyên. Người gửi nhận thông báo kèm lý do."}
        confirmLabel="Từ chối"
        danger
        reason={{ label: "Lý do từ chối", required: true, min: 3 }}
        busy={reject.isPending}
        error={reject.error}
        onConfirm={(r) => reject.mutate(r)}
        onClose={() => setRejecting(false)}
      />
    );
  return (
    <Dialog
      title="Yêu cầu hoàn tiền"
      eyebrow={REFUND_REASON[str(refund.reason)] ?? str(refund.reason)}
      badge={<StatusPill status={refund.status} />}
      onClose={onClose}
      busy={approve.isPending}
      size="detail"
      onSubmit={() => pending && !feeInvalid && approve.mutate()}
      footer={
        pending ? (
          <>
            <button type="button" className="cr-btn danger" onClick={() => setRejecting(true)} disabled={approve.isPending}>
              Từ chối
            </button>
            <button className="cr-btn primary" disabled={approve.isPending || feeInvalid || amount <= 0}>
              {approve.isPending ? "Đang xử lý…" : `Đã chuyển khoản ${vnd(amount)} — Duyệt`}
            </button>
          </>
        ) : (
          <button type="button" className="cr-btn" onClick={onClose}>
            Đóng
          </button>
        )
      }
    >
      <DetailColumns
        main={
          <>
            <DetailSection title="Người nhận & giao dịch gốc">
              <Dl
                compact
                items={[
                  ["Người nhận", str(get(refund, "member.user.fullName") || get(refund, "order.user.fullName"))],
                  ["Liên hệ", [get(refund, "member.user.phone") || get(refund, "order.user.phone"), get(refund, "member.user.email") || get(refund, "order.user.email")].filter(Boolean).join(" · ")],
                  ["Khóa học / đơn", str(get(refund, "class.name")) || str(get(refund, "order.code"))],
                  ["HLV", str(get(refund, "class.coach.user.fullName"))],
                  ["Gửi lúc", dateTime(refund.createdAt)],
                  ["Xử lý lúc", refund.processedAt ? dateTime(refund.processedAt) : ""],
                ]}
              />
            </DetailSection>
            <DetailSection title="Ghi chú">
              <Dl
                compact
                items={[
                  ["Ghi chú hội viên", str(refund.memberNote)],
                  ["Ghi chú quản lý", str(refund.managerNote)],
                  ["Lý do từ chối", str(refund.rejectReason)],
                ]}
              />
            </DetailSection>
          </>
        }
        side={
          <>
            <DetailSection>
              <DetailTotal
                label="Số tiền hoàn"
                value={vnd(amount)}
                extra={<StatusPill status={refund.status} />}
                rows={[
                  ["Đã thanh toán", vnd(get(refund, "payment.amount"))],
                  ["Trừ ví HLV", vnd(refund.coachDebitAmount)],
                ]}
              />
            </DetailSection>
            {bank && (
              <DetailSection title="Tài khoản nhận tiền">
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <Dl
                    compact
                    items={[
                      ["Ngân hàng", str(bank.bankName)],
                      ["Số tài khoản", str(bank.bankAccountNumber)],
                      ["Chủ tài khoản", str(bank.bankAccountName)],
                    ]}
                  />
                  {bank.vietQrUrl ? <img src={str(bank.vietQrUrl)} alt="Mã VietQR chuyển khoản hoàn tiền" style={{ maxWidth: 160 }} /> : null}
                </div>
              </DetailSection>
            )}
            {pending && (
              <DetailSection title="Duyệt hoàn tiền" tone="accent">
                <div className="cr-form">
                  {late && (
                    <>
                      <p className="cr-muted wide" style={{ margin: 0 }}>
                        Hoàn ngoại lệ: giá trị buổi chưa học <b>{vnd(gross)}</b>. Số tiền hoàn = giá trị gốc × (100% − phí chiết khấu).
                      </p>
                      <Field label="Phí chiết khấu (%)" required error={feeInvalid ? "Nhập số nguyên từ 0 đến 99." : undefined} hint={`Hoàn cho hội viên: ${vnd(amount)}`}>
                        <input type="number" min={0} max={99} value={fee} onChange={(e) => setFee(e.target.value)} />
                      </Field>
                    </>
                  )}
                  <Field label="Mã giao dịch chuyển khoản" hint="FT/Ref code để đối soát">
                    <input value={tx} onChange={(e) => setTx(e.target.value)} maxLength={100} />
                  </Field>
                  <Field label="Ghi chú" wide>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
                  </Field>
                </div>
              </DetailSection>
            )}
            {approve.error ? <ErrorBox error={approve.error} /> : null}
          </>
        }
      />
    </Dialog>
  );
}
