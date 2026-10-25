import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { display, money } from "./config";
import { ErrorState, Loading, Modal } from "./ui";

const dateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }) : "—";

type Party = { name?: string; fullName?: string; address?: string | null; hotline?: string | null; phone?: string | null; email?: string | null };
type Line = { no: number; name: string; description: string | null; unit: string; quantity: number; unitPrice: number; amount: number };
type RefundRow = { id: string; reasonLabel: string; amount: number; statusLabel: string; status: string; createdAt: string; processedAt: string | null };
type Invoice = {
  invoiceNumber: string;
  statusLabel: string;
  paidAt: string | null;
  createdAt: string;
  methodLabel: string;
  transactionCode: string | null;
  gatewayTransId: string | null;
  seller: Party | null;
  buyer: Party | null;
  lines: Line[];
  subtotal: number;
  discount: number;
  discountLabel: string | null;
  shippingFee: number;
  total: number;
  kind: string;
  refunds: RefundRow[];
  refundedAmount: number;
  netAmount: number;
  note: string;
  membership: { startDate: string | null; endDate: string | null } | null;
  course: { coachName: string | null; startDate: string | null; endDate: string | null } | null;
};

/**
 * Hóa đơn bán hàng (in / lưu PDF) — BE dựng từ ẢNH CHỤP lúc mua (`GET /payments/:id/invoice`, chủ giao dịch dùng
 * `/payments/my/:id/invoice`): đổi giá/tên/thông tin trung tâm sau này không làm đổi hóa đơn cũ.
 */
export function InvoiceDialog({ id, onClose, mine = false }: { id: string; onClose: () => void; mine?: boolean }) {
  const q = useQuery({
    queryKey: ["invoice", id, mine],
    queryFn: ({ signal }) =>
      api<Invoice>(mine ? "GET /payments/my/{id}/invoice" : "GET /payments/{id}/invoice", { params: { id }, signal }),
  });
  const inv = q.data?.data;
  const period = inv?.membership ?? inv?.course;
  return (
    <Modal title="Hóa đơn bán hàng" onClose={onClose}>
      {q.isPending ? (
        <Loading variant="details" />
      ) : q.isError || !inv ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <article className="invoice-print">
            <div className="eyebrow">{display(inv.seller?.name ?? "PULSE SPORTS CENTER")}</div>
            {inv.seller?.address ? <p className="muted">{inv.seller.address}</p> : null}
            {inv.seller?.hotline || inv.seller?.email ? (
              <p className="muted">{[inv.seller?.hotline, inv.seller?.email].filter(Boolean).join(" · ")}</p>
            ) : null}
            <h2>HÓA ĐƠN BÁN HÀNG</h2>
            <dl className="invoice-meta">
              <dt>Số hóa đơn</dt>
              <dd>{inv.invoiceNumber}</dd>
              <dt>Trạng thái</dt>
              <dd>{inv.statusLabel}</dd>
              <dt>Ngày thanh toán</dt>
              <dd>{dateTime(inv.paidAt ?? inv.createdAt)}</dd>
              <dt>Phương thức</dt>
              <dd>{inv.methodLabel}</dd>
              {inv.gatewayTransId || inv.transactionCode ? (
                <>
                  <dt>Mã giao dịch</dt>
                  <dd>{inv.gatewayTransId ?? inv.transactionCode}</dd>
                </>
              ) : null}
              <dt>Khách hàng</dt>
              <dd>{[inv.buyer?.fullName, inv.buyer?.phone, inv.buyer?.email].filter(Boolean).join(" · ") || "—"}</dd>
              {period?.startDate && period?.endDate ? (
                <>
                  <dt>{inv.kind === "MEMBERSHIP" ? "Hiệu lực" : "Thời gian khóa"}</dt>
                  <dd>
                    {dateTime(period.startDate)} – {dateTime(period.endDate)}
                  </dd>
                </>
              ) : null}
            </dl>
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên hàng</th>
                  <th>ĐVT</th>
                  <th className="num">SL</th>
                  <th className="num">Đơn giá</th>
                  <th className="num">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.no}>
                    <td>{l.no}</td>
                    <td>
                      {l.name}
                      {l.description ? <div className="muted">{l.description}</div> : null}
                    </td>
                    <td>{l.unit}</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{money(l.unitPrice)}</td>
                    <td className="num">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Tạm tính</td>
                  <td className="num">{money(inv.subtotal)}</td>
                </tr>
                {inv.discount > 0 ? (
                  <tr>
                    <td colSpan={5}>{inv.discountLabel ?? "Giảm giá"}</td>
                    <td className="num">−{money(inv.discount)}</td>
                  </tr>
                ) : null}
                {inv.kind === "ORDER" ? (
                  <tr>
                    <td colSpan={5}>Phí giao hàng</td>
                    <td className="num">{inv.shippingFee ? money(inv.shippingFee) : "Miễn phí"}</td>
                  </tr>
                ) : null}
                <tr>
                  <th colSpan={5}>Tổng thanh toán</th>
                  <th className="num">{money(inv.total)}</th>
                </tr>
                {inv.refunds.map((r) => (
                  <tr key={r.id}>
                    <td colSpan={5}>
                      Hoàn: {r.reasonLabel} · {r.statusLabel} · {dateTime(r.processedAt ?? r.createdAt)}
                    </td>
                    <td className="num">−{money(r.amount)}</td>
                  </tr>
                ))}
                {inv.refunds.length ? (
                  <tr>
                    <th colSpan={5}>Thực trả sau hoàn</th>
                    <th className="num">{money(inv.netAmount)}</th>
                  </tr>
                ) : null}
              </tfoot>
            </table>
            <p className="muted">{inv.note}</p>
          </article>
          <div className="modal-footer">
            <button className="button primary" onClick={() => window.print()}>
              In / Lưu PDF
            </button>
            <button className="button" onClick={onClose}>
              Đóng
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
