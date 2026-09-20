import { useState } from "react";
import type { RecordData } from "../../../shared/api";
import { at, display, money } from "../../../shared/config";
import { Details, ErrorState, Loading, Modal } from "../../../shared/ui";
import { useReceptionDetail, useReceptionList } from "../api";
import {
  ActionForm,
  Heading,
  ListState,
  MemberPicker,
  Table,
} from "../components";
export function PaymentsPage() {
  const [member, setMember] = useState<RecordData | null>(null);
  const [record, setRecord] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [status, setStatus] = useState("");
  const id = String(member?.id || "");
  const payments = useReceptionList(
    "GET /payments",
    { memberId: id, status },
    {},
    Boolean(id),
  );
  const invoices = useReceptionList(
    "GET /invoices/member/{memberId}",
    {},
    { memberId: id },
    Boolean(id),
  );
  const subscriptions = useReceptionList(
    "GET /subscriptions/member/{memberId}",
    {},
    { memberId: id },
    Boolean(id),
  );
  const payment = useReceptionDetail(
    "GET /payments/{id}",
    { id: paymentId },
    Boolean(paymentId),
  );
  const choices = (subscriptions.data?.data || [])
    .filter((r) => r.id)
    .map((r) => ({
      value: String(r.id),
      label: `${display(at(r, "plan.name"))} · ${display(r.endDate)} · ${display(r.status)}`,
    }));
  return (
    <>
      <Heading title="Thanh toán & hóa đơn" />
      <MemberPicker
        value={member}
        onChange={(m) => {
          setMember(m);
          setRecord(false);
          setInvoiceId("");
          setPaymentId("");
        }}
      />
      {id && (
        <>
          <section className="panel reception-section">
            <h2>Lịch sử thanh toán</h2>
            <p>
              Đối chiếu khoản đã thu khi đăng ký hoặc gia hạn gói trước khi ghi
              thêm thanh toán.
            </p>
            <button
              className="button primary"
              disabled={subscriptions.isPending || subscriptions.isError}
              onClick={() => setRecord(true)}
            >
              Ghi nhận thanh toán
            </button>
            {subscriptions.isError && (
              <ErrorState
                error={subscriptions.error}
                retry={() => subscriptions.refetch()}
              />
            )}
            <label>
              Lọc trạng thái
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Tất cả</option>
                {["PENDING", "SUCCESS", "FAILED", "REFUNDED"].map((s) => (
                  <option key={s} value={s}>
                    {display(s)}
                  </option>
                ))}
              </select>
            </label>
            <ListState result={payments}>
              {(rows) => (
                <Table
                  rows={rows}
                  columns={[
                    ["amount", "Số tiền"],
                    ["method", "Phương thức"],
                    ["status", "Trạng thái"],
                    ["createdAt", "Ngày tạo"],
                  ]}
                  actions={(row) => (
                    <button
                      className="button small"
                      onClick={() => setPaymentId(String(row.id))}
                    >
                      Chi tiết
                    </button>
                  )}
                />
              )}
            </ListState>
          </section>
          <section className="panel reception-section">
            <h2>Hóa đơn hội viên</h2>
            <ListState result={invoices}>
              {(rows) => (
                <Table
                  rows={rows}
                  columns={[
                    ["invoiceNumber", "Số hóa đơn"],
                    ["total", "Tổng tiền"],
                    ["status", "Trạng thái"],
                    ["issuedAt", "Ngày phát hành"],
                  ]}
                  actions={(row) => (
                    <button
                      className="button small"
                      onClick={() => setInvoiceId(String(row.id))}
                    >
                      Xem / In hóa đơn
                    </button>
                  )}
                />
              )}
            </ListState>
          </section>
        </>
      )}
      {record && (
        <ActionForm
          title="Ghi nhận thanh toán"
          operation="POST /payments"
          fixed={{ memberId: id }}
          choices={{ subscriptionId: choices }}
          onClose={() => setRecord(false)}
        />
      )}
      {invoiceId && (
        <InvoiceDialog id={invoiceId} onClose={() => setInvoiceId("")} />
      )}
      {paymentId && (
        <Modal title="Chi tiết thanh toán" onClose={() => setPaymentId("")}>
          {payment.isPending ? (
            <Loading variant="details" />
          ) : payment.isError ? (
            <ErrorState error={payment.error} retry={() => payment.refetch()} />
          ) : (
            <Details value={payment.data.data} />
          )}
        </Modal>
      )}
    </>
  );
}
export function InvoiceDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const q = useReceptionDetail("GET /invoices/{id}", { id });
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
            <Details value={q.data.data} />
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
