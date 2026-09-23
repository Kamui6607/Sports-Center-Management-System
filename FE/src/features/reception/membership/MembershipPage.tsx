import { CancelSubscription } from "../../../shared/CancelSubscription";
import { downgradeReason } from "../../../shared/businessRules";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { RecordData } from "../../../shared/api";
import { display, money } from "../../../shared/config";
import { Details, ErrorState, Loading } from "../../../shared/ui";
import { useReceptionDetail, useReceptionList } from "../api";
import { subscriptionTransitions } from "../../../shared/businessRules";
import { StatusAction } from "../../../shared/StatusAction";
import {
  ActionForm,
  Heading,
  ListState,
  MemberPicker,
  Table,
} from "../components";
export function MembershipPage({ role = "STAFF" }: { role?: string }) {
  const [search, setSearch] = useSearchParams();
  const linkedId = search.get("memberId") || "";
  const linked = useReceptionDetail(
    "GET /members/{id}",
    { id: linkedId },
    Boolean(linkedId),
  );
  const [selected, setSelected] = useState<RecordData | null>(null);
  const member = selected || linked.data?.data || null;
  const [action, setAction] = useState<{ id?: string } | null>(null);
  const id = String(member?.id || "");
  const status = useReceptionDetail(
    "GET /members/{id}/membership-status",
    { id },
    Boolean(id),
  );
  const subscriptions = useReceptionList(
    "GET /subscriptions/member/{memberId}",
    {},
    { memberId: id },
    Boolean(id),
  );
  const plans = useReceptionList("GET /membership-plans", { isActive: "true" });
  const hasPlans = (plans.data?.data || []).some(
    (p) => p.id && p.isActive !== false,
  );
  const current = subscriptions.data?.data.find((s) => s.status === "ACTIVE");
  const choices = (plans.data?.data || [])
    .filter((p) => p.id && p.isActive !== false)
    .filter(
      (p) =>
        action?.id ||
        !downgradeReason(
          current as
            { tier: unknown; plan?: { durationDays?: unknown } } | undefined,
          { tier: p.tier, durationDays: p.durationDays },
        ),
    )
    .map((p) => ({
      value: String(p.id),
      label: `${display(p.name)} · ${money(p.price)} · ${display(p.durationDays)} ngày`,
    }));
  return (
    <>
      <Heading title="Gói thành viên" />
      {linkedId && linked.isError && (
        <ErrorState error={linked.error} retry={() => linked.refetch()} />
      )}
      <MemberPicker
        value={member}
        onChange={(m) => {
          setSelected(m);
          setSearch({});
          setAction(null);
        }}
      />
      {id && (
        <>
          <section className="panel reception-section">
            <h2>Trạng thái và thời hạn gói</h2>
            {status.isPending ? (
              <Loading variant="details" />
            ) : status.isError ? (
              <ErrorState error={status.error} retry={() => status.refetch()} />
            ) : (
              <Details value={status.data.data} />
            )}
          </section>
          <section className="panel reception-section">
            <h2>Đăng ký và gia hạn</h2>
            {plans.isError && (
              <ErrorState error={plans.error} retry={() => plans.refetch()} />
            )}
            <p>
              Đăng ký hoặc gia hạn sẽ ghi nhận đã thu tiền và phát hành hóa đơn
              ngay. Chỉ xác nhận sau khi đã nhận đủ tiền. Đăng ký gói mới sẽ tạm
              dừng gói ACTIVE và cộng ngày dư vào gói mới, không cho phép hạ
              hạng hoặc giảm thời hạn cùng hạng. Gia hạn tạo một kỳ gói mới.
            </p>
            <button
              className="button primary"
              disabled={
                !choices.length ||
                subscriptions.isPending ||
                subscriptions.isError
              }
              onClick={() => setAction({})}
            >
              Đăng ký gói
            </button>
            {!plans.isPending && !plans.isError && !choices.length && (
              <p>
                {hasPlans
                  ? "Không có gói phù hợp để mua mới. Gói mới cần cùng hạng với thời hạn không ngắn hơn, hoặc có hạng cao hơn."
                  : "Chưa có gói đang hoạt động."}
              </p>
            )}
            <ListState result={subscriptions}>
              {(rows) => (
                <Table
                  rows={rows}
                  columns={[
                    ["plan.name", "Gói tập"],
                    ["startDate", "Bắt đầu"],
                    ["endDate", "Hết hạn"],
                    ["status", "Trạng thái"],
                  ]}
                  actions={(row) => (
                    <>
                      <button
                        className="button small"
                        disabled={!hasPlans || !row.id}
                        onClick={() => setAction({ id: String(row.id) })}
                      >
                        Gia hạn
                      </button>
                      {role === "MANAGER" && row.status === "ACTIVE" && (
                        <CancelSubscription
                          role="MANAGER"
                          subscription={
                            row as unknown as {
                              id: string;
                              endDate: string;
                              status: string;
                              plan: { price: number; durationDays: number };
                            }
                          }
                        />
                      )}
                      <StatusAction
                        operation="PATCH /subscriptions/{id}/status"
                        id={String(row.id)}
                        statuses={subscriptionTransitions(
                          {
                            status: row.status,
                            remainingDays: row.remainingDays,
                          },
                          role,
                        ).filter(
                          (s) => s !== "CANCELLED" || row.status !== "ACTIVE",
                        )}
                        explanation="Tạm dừng sẽ lưu số ngày còn lại. Tiếp tục sẽ khôi phục thời hạn được bảo lưu. Hủy gói tạm dừng sẽ chấm dứt quyền lợi; backend hiện chưa áp dụng hoàn tiền và hủy lịch tự động cho gói tạm dừng."
                      />
                    </>
                  )}
                />
              )}
            </ListState>
          </section>
        </>
      )}
      {action && (
        <ActionForm
          title={action.id ? "Gia hạn gói" : "Đăng ký gói"}
          operation={
            action.id ? "POST /subscriptions/{id}/renew" : "POST /subscriptions"
          }
          params={action.id ? { id: action.id } : undefined}
          fixed={action.id ? {} : { memberId: id }}
          choices={{ planId: choices }}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
