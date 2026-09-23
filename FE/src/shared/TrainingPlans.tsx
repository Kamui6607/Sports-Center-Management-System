import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RecordData } from "./api";
import { display, at } from "./config";
import { Empty, ErrorState, Loading, Modal, SchemaForm } from "./ui";
import "./workflow.css";

type Plan = {
  id: string;
  memberId: string;
  coachId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  coach?: { user?: { fullName: string } };
  results: {
    id: string;
    date: string;
    coachNote?: string;
    metrics?: Record<string, unknown>;
  }[];
};
export function TrainingPlans({
  memberId,
  coachId,
  role,
}: {
  memberId: string;
  coachId?: string;
  role: string;
}) {
  const cache = useQueryClient(),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Plan | null>(null),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["training-plans", memberId],
    enabled: Boolean(memberId),
    queryFn: async ({ signal }) => {
      const res = await api<Plan[]>("GET /training-plans", {
        query: { memberId },
        signal,
      });
      // Keep the requested scope even if a backend query filter regresses.
      return res.data.filter((p) => p.memberId === memberId);
    },
  });
  const writable = role === "MANAGER" || (role === "COACH" && Boolean(coachId));
  if (!memberId)
    return <Empty text="Chưa có hồ sơ hội viên để xem kế hoạch." />;
  return (
    <section className="workflow-page">
      <div className="workflow-actions">
        <h2>Kế hoạch tập luyện</h2>
        {writable && (
          <button className="button primary" onClick={() => setCreate(true)}>
            Thêm kế hoạch
          </button>
        )}
      </div>
      {q.isPending ? (
        <Loading variant="cards" />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data.length ? (
        <Empty text="Chưa có kế hoạch tập luyện." />
      ) : (
        q.data.map((p) => (
          <article key={p.id} className="panel workflow-card">
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <p>
              {display(p.startDate)} – {display(p.endDate)}
            </p>
            <p>
              Huấn luyện viên: {p.coach?.user?.fullName || "Chưa có thông tin"}
            </p>
            <h4>Kết quả tập luyện</h4>
            {!p.results?.length ? (
              <p>Chưa ghi nhận kết quả.</p>
            ) : (
              [...p.results]
                .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
                .map((r) => (
                  <div key={r.id}>
                    <strong>{display(r.date)}</strong>
                    <p>{r.coachNote}</p>
                    <dl className="details">
                      {Object.entries(r.metrics || {})
                        .filter(([, v]) =>
                          ["string", "number", "boolean"].includes(typeof v),
                        )
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{String(v)}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ))
            )}
            {writable && (role === "MANAGER" || p.coachId === coachId) && (
              <button className="button" onClick={() => setSelected(p)}>
                Ghi nhận kết quả
              </button>
            )}
          </article>
        ))
      )}
      {create && (
        <Modal
          title="Thêm kế hoạch tập luyện"
          onClose={() => setCreate(false)}
          dismissible={!busy}
        >
          <SchemaForm
            operation="POST /training-plans"
            fixed={{ memberId, ...(role === "COACH" ? { coachId } : {}) }}
            onBusyChange={setBusy}
            onCancel={() => setCreate(false)}
            onSuccess={() => {
              setCreate(false);
              void cache.invalidateQueries({
                queryKey: ["training-plans", memberId],
              });
            }}
          />
        </Modal>
      )}
      {selected && (
        <ResultForm plan={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
function ResultForm({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [note, setNote] = useState(""),
    [metric, setMetric] = useState(""),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: (body: RecordData) =>
      api("POST /training-plans/results", { body }),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: ["training-plans", plan.memberId],
      });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    if (
      !date ||
      date < plan.startDate.slice(0, 10) ||
      date > plan.endDate.slice(0, 10) ||
      Date.parse(date) > Date.now()
    ) {
      setError(
        "Ngày ghi nhận phải trong thời hạn kế hoạch và không ở tương lai.",
      );
      return;
    }
    if (Boolean(metric.trim()) !== Boolean(value.trim())) {
      setError("Điền cả tên chỉ số và kết quả hoặc để trống cả hai.");
      return;
    }
    if (!note.trim() && !metric.trim()) {
      setError("Nhập nhận xét hoặc một chỉ số tập luyện.");
      return;
    }
    save.mutate({
      planId: plan.id,
      date: new Date(date).toISOString(),
      coachNote: note.trim(),
      ...(metric.trim() ? { metrics: { [metric.trim()]: value.trim() } } : {}),
    });
  }
  return (
    <Modal
      title={`Kết quả · ${plan.name}`}
      onClose={onClose}
      dismissible={!save.isPending}
    >
      <form className="workflow-card workflow-page" onSubmit={submit}>
        <fieldset disabled={save.isPending}>
          <label>
            Ngày ghi nhận
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={plan.startDate.slice(0, 10)}
              max={
                [
                  plan.endDate.slice(0, 10),
                  new Date().toISOString().slice(0, 10),
                ].sort()[0]
              }
            />
          </label>
          <label>
            Nhận xét
            <textarea
              maxLength={3000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label>
            Chỉ số (ví dụ: cân nặng)
            <input
              maxLength={80}
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            />
          </label>
          <label>
            Kết quả và đơn vị (ví dụ: 65 kg)
            <input
              maxLength={120}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {save.error && <ErrorState error={save.error} />}
          <button className="button primary">
            {save.isPending ? "Đang lưu…" : "Lưu kết quả"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}

export function memberIdFromProfile(user: unknown) {
  return String(at(user, "memberProfile.id") || "");
}
