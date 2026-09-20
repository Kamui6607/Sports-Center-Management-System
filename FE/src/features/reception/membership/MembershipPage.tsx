import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { RecordData } from "../../../shared/api";
import { display, money } from "../../../shared/config";
import { Details, ErrorState, Loading } from "../../../shared/ui";
import { useReceptionDetail, useReceptionList } from "../api";
import {
  ActionForm,
  Heading,
  ListState,
  MemberPicker,
  Table,
} from "../components";
export function MembershipPage() {
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
  const choices = (plans.data?.data || [])
    .filter((p) => p.id && p.isActive !== false)
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
              Chọn gói để đăng ký hoặc gia hạn cho hội viên. Kiểm tra lịch sử
              thanh toán sau khi hoàn tất.
            </p>
            <button
              className="button primary"
              disabled={!choices.length}
              onClick={() => setAction({})}
            >
              Đăng ký gói
            </button>
            {!plans.isPending && !plans.isError && !choices.length && (
              <p>Chưa có gói đang hoạt động.</p>
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
                    <button
                      className="button small"
                      disabled={!choices.length || !row.id}
                      onClick={() => setAction({ id: String(row.id) })}
                    >
                      Gia hạn
                    </button>
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
