import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api";
import { SearchBox, periodQuery, PERIOD_OPTIONS, ConfirmDialog, DataTable, Dl, PageHead, Pager, Panel, Pill, QueryView, Select, dateTime, get, str, useUrlState, vnd } from "../kit";
import type { Row } from "../kit";

const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  PENDING: ["Chờ duyệt", "warn"],
  COMPLETED: ["Đã chuyển", "ok"],
  REJECTED: ["Từ chối", "bad"],
  FAILED: ["Lỗi", "bad"],
};

/** Lệnh rút tiền của HLV: Manager chuyển khoản thật rồi duyệt (ví bị trừ) hoặc từ chối kèm lý do. */
export default function WithdrawalsPage() {
  const s = useUrlState();
  const [action, setAction] = useState<{ row: Row; kind: "APPROVE" | "REJECT" } | null>(null);
  const cache = useQueryClient();
  const query = { type: "WITHDRAWAL", status: s.value("status"), search: s.value("search"), ...periodQuery(s.value("period")), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "withdrawals", query],
    queryFn: ({ signal }) => api<Row[]>("GET /coaches/wallet/transactions", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const review = useMutation({
    mutationFn: ({ id, kind, reason }: { id: string; kind: "APPROVE" | "REJECT"; reason: string }) =>
      api("PATCH /coaches/wallet/transactions/{txId}/review", { params: { txId: id }, body: { action: kind, ...(reason ? { reason } : {}) } }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
      setAction(null);
    },
  });
  return (
    <>
      <PageHead eyebrow="Kinh doanh · Tài chính" title="Rút tiền HLV" desc="HLV chỉ rút được tiền của khóa đã kết thúc; số dư khả dụng đã trừ khoản hoàn tiền đang chờ." />
      <Panel>
        <div className="cr-filters" style={{ marginBottom: 14 }}>
          <SearchBox value={s.value("search")} onChange={(v) => s.set({ search: v })} placeholder="Tên hoặc email HLV" />
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS).map(([k, [l]]) => [k, l])} />
          <Select label="Ngày yêu cầu" all="Mọi thời gian" value={s.value("period")} onChange={(v) => s.set({ period: v })} options={PERIOD_OPTIONS} />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                label="Lệnh rút tiền"
                columns={[
                  {
                    key: "coach",
                    title: "HLV",
                    render: (r) => (
                      <div className="cr-cell-main">
                        <strong>{str(get(r, "coach.fullName")) || "—"}</strong>
                        <small>Khả dụng: {vnd(get(r, "wallet.available"))}</small>
                      </div>
                    ),
                  },
                  { key: "amount", title: "Số tiền", className: "num", render: (r) => vnd(r.amount) },
                  {
                    key: "bank",
                    title: "Tài khoản nhận",
                    render: (r) => {
                      const b = (r.bankInfo ?? {}) as Row;
                      return [b.bankName, b.accountNumber, b.accountName].filter(Boolean).map(str).join(" · ") || "—";
                    },
                  },
                  { key: "at", title: "Tạo lúc", render: (r) => dateTime(r.createdAt) },
                  {
                    key: "st",
                    title: "Trạng thái",
                    render: (r) => {
                      const [l, t] = STATUS[str(r.status)] ?? [str(r.status), "info"];
                      return <Pill tone={t}>{l}</Pill>;
                    },
                  },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (r) =>
                      r.status === "PENDING" ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button className="cr-btn sm primary" onClick={() => setAction({ row: r, kind: "APPROVE" })}>
                            Duyệt
                          </button>
                          <button className="cr-btn sm danger" onClick={() => setAction({ row: r, kind: "REJECT" })}>
                            Từ chối
                          </button>
                        </span>
                      ) : null,
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {action && (
        <ConfirmDialog
          title={action.kind === "APPROVE" ? "Duyệt lệnh rút tiền" : "Từ chối lệnh rút tiền"}
          target={
            <>
              {str(get(action.row, "coach.fullName"))} · {vnd(action.row.amount)}
              <Dl
                items={[
                  ["Ngân hàng", str(get(action.row, "bankInfo.bankName"))],
                  ["Số tài khoản", str(get(action.row, "bankInfo.accountNumber"))],
                  ["Chủ tài khoản", str(get(action.row, "bankInfo.accountName"))],
                ]}
              />
            </>
          }
          consequence={
            action.kind === "APPROVE"
              ? "Xác nhận bạn ĐÃ chuyển khoản cho HLV. Ví của HLV sẽ bị trừ số tiền này."
              : "Lệnh rút bị hủy, ví HLV giữ nguyên. HLV nhận thông báo kèm lý do."
          }
          confirmLabel={action.kind === "APPROVE" ? "Đã chuyển khoản — Duyệt" : "Từ chối"}
          danger={action.kind === "REJECT"}
          reason={action.kind === "REJECT" ? { label: "Lý do từ chối", required: true, min: 3 } : undefined}
          busy={review.isPending}
          error={review.error}
          onConfirm={(reason) => review.mutate({ id: str(action.row.id), kind: action.kind, reason })}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
