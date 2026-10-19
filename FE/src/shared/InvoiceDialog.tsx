import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { at, display, money } from "./config";
import { Details, ErrorState, Loading, Modal } from "./ui";

/** Hóa đơn thanh toán (in / lưu PDF). Chuyển từ không gian Lễ tân cũ (đã bỏ vai trò Staff). */
export function InvoiceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["invoice", id],
    queryFn: ({ signal }) => api("GET /invoices/{id}", { params: { id }, signal }),
  });
  return (
    <Modal title="Hóa đơn thanh toán" onClose={onClose}>
      {q.isPending ? (
        <Loading variant="details" />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <article className="invoice-print">
            <div className="eyebrow">PULSE SPORTS CENTER</div>
            <h2>HÓA ĐƠN THANH TOÁN</h2>
            <p>{display(q.data.data.invoiceNumber)}</p>
            <Details
              value={{
                memberName: q.data.data.memberName || at(q.data.data, "member.user.fullName"),
                planName: q.data.data.planName || at(q.data.data, "payment.subscription.plan.name"),
                planTier: q.data.data.planTier || at(q.data.data, "payment.subscription.tier"),
                issuedAt: q.data.data.issuedAt,
                status: q.data.data.status,
                method: at(q.data.data, "payment.method"),
                subtotal: q.data.data.subtotal,
                discount: q.data.data.discount,
                total: q.data.data.total,
              }}
            />
            <h3>Tổng thanh toán: {money(q.data.data.total)}</h3>
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
