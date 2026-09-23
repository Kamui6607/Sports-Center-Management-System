import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, type RecordData } from "../../shared/api";
import { allPages } from "../../shared/pagedApi";
import { at, display, money } from "../../shared/config";
import { Details, Empty, ErrorState, Loading, Modal } from "../../shared/ui";
import { InvoiceDialog } from "../../features/reception/payments/PaymentsPage";
export function MemberPaymentsPage() {
  const { user } = useAuth();
  const memberId = String(at(user, "memberProfile.id") || "");
  const [invoiceId, setInvoiceId] = useState(""),
    [paymentId, setPaymentId] = useState("");
  const list = useQuery({
    queryKey: ["member-invoices", memberId],
    enabled: Boolean(memberId),
    queryFn: ({ signal }) =>
      allPages<RecordData>("GET /invoices/member/{memberId}", {
        params: { memberId },
        signal,
      }),
  });
  const payment = useQuery({
    queryKey: ["member-payment", paymentId],
    enabled: Boolean(paymentId),
    queryFn: ({ signal }) =>
      api("GET /payments/{id}", { params: { id: paymentId }, signal }),
  });
  return (
    <div className="workflow-page">
      <h1>Thanh toán & hóa đơn</h1>
      <p>
        Các khoản thu được ghi nhận tại quầy. Liên hệ trung tâm nếu cần đối
        chiếu hoặc hoàn tiền.
      </p>
      {!memberId ? (
        <Empty text="Chưa có hồ sơ hội viên." />
      ) : list.isPending ? (
        <Loading variant="cards" />
      ) : list.error ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : !list.data.data.length ? (
        <Empty text="Chưa có hóa đơn." />
      ) : (
        list.data.data.map((r) => (
          <article className="panel workflow-card" key={String(r.id)}>
            <h2>{display(r.invoiceNumber)}</h2>
            <p>
              {display(r.issuedAt)} · {display(r.status)} · {money(r.total)}
            </p>
            <div className="workflow-actions">
              <button
                className="button"
                onClick={() => setInvoiceId(String(r.id))}
              >
                Xem / In hóa đơn
              </button>
              {Boolean(r.paymentId) && (
                <button
                  className="button"
                  onClick={() => setPaymentId(String(r.paymentId))}
                >
                  Chi tiết thanh toán
                </button>
              )}
            </div>
          </article>
        ))
      )}
      {invoiceId && (
        <InvoiceDialog id={invoiceId} onClose={() => setInvoiceId("")} />
      )}
      {paymentId && (
        <Modal title="Chi tiết thanh toán" onClose={() => setPaymentId("")}>
          {payment.isPending ? (
            <Loading variant="details" />
          ) : payment.error ? (
            <ErrorState error={payment.error} retry={() => payment.refetch()} />
          ) : (
            <Details value={payment.data.data} />
          )}
        </Modal>
      )}
    </div>
  );
}
