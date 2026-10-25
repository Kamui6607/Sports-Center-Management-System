import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api";
import { ConfirmDialog, DataTable, EmptyState, PageHead, Pager, Panel, Pill, QueryView, Select, dateTime, get, str, useUrlState } from "../kit";
import type { Row } from "../kit";

const STATUS: Record<string, [string, "bad" | "ok" | "plain"]> = {
  APPLIED: ["Đang áp dụng", "bad"],
  REVOKED: ["Đã gỡ", "ok"],
  EXPIRED: ["Hết hạn", "plain"],
};
const APPEAL: [string, string][] = [
  ["yes", "Có khiếu nại"],
  ["no", "Không khiếu nại"],
];

/** Hình phạt chuyên cần (vắng nhiều ⇒ khóa đặt chỗ) và khiếu nại hội viên gửi từ ứng dụng. */
export default function AttendancePenaltiesPage() {
  const s = useUrlState({ status: "APPLIED" });
  const cache = useQueryClient();
  const [revoking, setRevoking] = useState<Row | null>(null);
  const query = { status: s.value("status"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "penalties", query],
    queryFn: ({ signal }) => api<Row[]>("GET /attendance/penalties", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const scan = useMutation({
    mutationFn: () => api("POST /attendance/warnings/scan", { body: {} }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "penalties"] }),
  });
  const revoke = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api("POST /attendance/penalties/{id}/revoke", { params: { id }, body: { reason, restoreSlots: true } }),
    onSuccess: () => {
      setRevoking(null);
      void cache.invalidateQueries({ queryKey: ["admin", "penalties"] });
    },
  });
  const appeal = s.value("appeal");

  return (
    <>
      <PageHead
        title="Chuyên cần & khiếu nại"
        desc="Hình phạt do vắng nhiều buổi và khiếu nại hội viên gửi từ ứng dụng. Gỡ phạt để hội viên đặt chỗ lại."
        actions={
          <button className="cr-btn" disabled={scan.isPending} onClick={() => scan.mutate()}>
            {scan.isPending ? "Đang quét…" : "Quét cảnh báo vắng"}
          </button>
        }
      />
      <Panel flush>
        <div className="cr-toolbar">
          <Select label="Trạng thái" all="Mọi trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS).map(([k, [l]]) => [k, l])} />
          <Select label="Khiếu nại" all="Mọi hình phạt" value={appeal} onChange={(v) => s.set({ appeal: v }, false)} options={APPEAL} />
        </div>
        <QueryView q={q}>
          {(res) => {
            // BE chưa lọc theo khiếu nại ⇒ lọc trên trang hiện tại (ghi rõ trong ghi chú bên dưới).
            const rows = appeal ? res.data.filter((p) => Boolean(p.appealedAt) === (appeal === "yes")) : res.data;
            return (
              <>
                <DataTable
                  label="Hình phạt chuyên cần"
                  rows={rows}
                  empty={<EmptyState title="Không có hình phạt" text="Chưa có hình phạt nào ở trạng thái này." />}
                  columns={[
                    {
                      key: "m",
                      title: "Hội viên",
                      render: (p) => (
                        <div className="cr-cell-main">
                          <Link to={`/manager/users/${str(get(p, "member.user.id"))}`}>{str(get(p, "member.user.fullName"))}</Link>
                          <small>{str(get(p, "class.name"))}</small>
                        </div>
                      ),
                    },
                    { key: "r", title: "Chuyên cần", className: "num", render: (p) => `${Math.round(Number(p.attendanceRate) || 0)}%` },
                    { key: "u", title: "Khóa đặt chỗ đến", className: "nowrap", render: (p) => (p.blockedUntil ? dateTime(p.blockedUntil) : "—") },
                    {
                      key: "a",
                      title: "Khiếu nại",
                      render: (p) =>
                        p.appealedAt ? (
                          <div className="cr-cell-main" style={{ minWidth: 200, maxWidth: 360 }}>
                            <strong title={str(p.appealReason)} style={{ whiteSpace: "normal" }}>
                              {str(p.appealReason).length > 120 ? `${str(p.appealReason).slice(0, 120)}…` : str(p.appealReason)}
                            </strong>
                            <small>{dateTime(p.appealedAt)}</small>
                          </div>
                        ) : (
                          <span className="cr-muted">—</span>
                        ),
                    },
                    {
                      key: "s",
                      title: "Trạng thái",
                      render: (p) => <Pill tone={STATUS[str(p.status)]?.[1] ?? "plain"}>{STATUS[str(p.status)]?.[0] ?? str(p.status)}</Pill>,
                    },
                    {
                      key: "x",
                      title: "",
                      className: "actions",
                      render: (p) =>
                        p.status === "APPLIED" ? (
                          <button className={"cr-btn sm" + (p.appealedAt ? " primary" : "")} onClick={() => setRevoking(p)}>
                            {p.appealedAt ? "Xét khiếu nại" : "Gỡ phạt"}
                          </button>
                        ) : null,
                    },
                  ]}
                />
                <Pager meta={res.pagination} onPage={s.setPage} />
                {appeal ? <p className="cr-note" style={{ padding: "0 18px 14px" }}>Bộ lọc khiếu nại áp dụng trên trang đang xem.</p> : null}
              </>
            );
          }}
        </QueryView>
      </Panel>
      {revoking && (
        <ConfirmDialog
          title={revoking.appealedAt ? "Chấp nhận khiếu nại & gỡ phạt" : "Gỡ hình phạt"}
          target={`${str(get(revoking, "member.user.fullName"))} · ${str(get(revoking, "class.name"))}`}
          consequence={
            <>
              {revoking.appealedAt ? (
                <>
                  Khiếu nại: “{str(revoking.appealReason)}”
                  <br />
                </>
              ) : null}
              Hội viên được đặt chỗ lại ngay; các chỗ đã bị hủy do phạt được khôi phục nếu buổi còn chỗ. Không gỡ phạt thì cứ đóng hộp này — hình phạt tự hết hạn theo thời hạn khóa.
            </>
          }
          confirmLabel="Gỡ phạt"
          reason={{ label: "Lý do (lưu vào lịch sử)", required: true, min: 5 }}
          busy={revoke.isPending}
          error={revoke.error}
          onConfirm={(reason) => revoke.mutate({ id: str(revoking.id), reason })}
          onClose={() => setRevoking(null)}
        />
      )}
    </>
  );
}
