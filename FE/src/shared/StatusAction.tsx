import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { display } from "./config";
import { ErrorState, Modal } from "./ui";

export function StatusAction({
  operation,
  id,
  statuses,
  explanation,
}: {
  operation: string;
  id: string;
  statuses: string[];
  explanation: string;
}) {
  const [target, setTarget] = useState("");
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api(operation, { params: { id }, body: { status: target } }),
    onSuccess: () => {
      setTarget("");
      void cache.invalidateQueries();
    },
  });
  return (
    <>
      <div className="workflow-actions">
        {statuses.map((s) => (
          <button
            key={s}
            className="button small"
            onClick={() => {
              mutation.reset();
              setTarget(s);
            }}
          >
            {display(s)}
          </button>
        ))}
      </div>
      {target && (
        <Modal
          title={`Chuyển trạng thái: ${display(target)}`}
          onClose={() => setTarget("")}
          dismissible={!mutation.isPending}
        >
          <p className="confirm-copy">{explanation}</p>
          {mutation.error && <ErrorState error={mutation.error} />}
          <div className="modal-footer">
            <button
              className="button"
              disabled={mutation.isPending}
              onClick={() => setTarget("")}
            >
              Quay lại
            </button>
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Đang cập nhật…" : "Xác nhận"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
