import { Table } from "../../shared/Table";
export { Table } from "../../shared/Table";
import { useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, contract } from "../../shared/api";
import type { RecordData } from "../../shared/api";
import { at, display } from "../../shared/config";
import { ErrorState, Loading, Modal, SchemaForm } from "../../shared/ui";
import { useReceptionList } from "./api";
import { useDebouncedValue } from "../../shared/useDebouncedValue";
export function Heading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">KHÔNG GIAN LỄ TÂN</div>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function ListState({
  result,
  children,
}: {
  result: ReturnType<typeof useReceptionList>;
  children: (rows: RecordData[]) => ReactNode;
}) {
  if (result.isPending) return <Loading />;
  if (result.isError)
    return <ErrorState error={result.error} retry={() => result.refetch()} />;
  return (
    <>
      {children(result.data.data)}
      {result.data.pagination && result.data.pagination.totalPages > 1 && (
        <p className="field-note">
          Đang hiển thị trang {result.data.pagination.page} /{" "}
          {result.data.pagination.totalPages} ({result.data.pagination.total}{" "}
          kết quả).
        </p>
      )}
    </>
  );
}
export function MemberPicker({
  value,
  onChange,
}: {
  value: RecordData | null;
  onChange: (row: RecordData | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const q = useReceptionList(
    "GET /members",
    {
      search: debouncedSearch,
      page: String(page),
      limit: "10",
    },
    {},
    !value,
  );
  return (
    <section className="panel reception-section">
      <h2>Chọn hội viên</h2>
      {value ? (
        <div className="reception-actions">
          <strong>
            {display(at(value, "user.fullName"))} ·{" "}
            {display(at(value, "user.email"))}
          </strong>
          <button className="button" onClick={() => onChange(null)}>
            Đổi hội viên
          </button>
        </div>
      ) : (
        <>
          <label>
            Tìm hội viên
            <input
              type="search"
              placeholder="Tên, email hoặc số điện thoại"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <ListState result={q}>
            {(rows) => (
              <Table
                rows={rows}
                columns={[
                  ["user.fullName", "Hội viên"],
                  ["user.email", "Email"],
                  ["user.phone", "Điện thoại"],
                ]}
                actions={(row) => (
                  <button
                    className="button small"
                    onClick={() => onChange(row)}
                  >
                    Chọn
                  </button>
                )}
              />
            )}
          </ListState>
          <div className="pagination">
            <button
              className="button"
              disabled={page <= 1 || q.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Trang trước
            </button>
            <span>Trang {page}</span>
            <button
              className="button"
              disabled={
                q.isFetching ||
                !q.data?.pagination ||
                page >= q.data.pagination.totalPages
              }
              onClick={() => setPage(page + 1)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function ActionForm({
  title,
  operation,
  params,
  fixed,
  choices,
  onClose,
}: {
  title: string;
  operation: string;
  params?: Record<string, string>;
  fixed?: RecordData;
  choices?: Record<string, { value: string; label: string }[]>;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const done = () => {
    setSuccess(true);
    void cache.invalidateQueries({ queryKey: ["reception"] });
  };
  return (
    <Modal title={title} onClose={onClose} dismissible={!busy}>
      {success ? (
        <>
          <p className="success" role="status">
            Đã lưu thay đổi thành công.
          </p>
          <button className="button" onClick={onClose}>
            Đóng
          </button>
        </>
      ) : contract[operation]?.body ? (
        <SchemaForm
          operation={operation}
          params={params}
          fixed={fixed}
          choices={choices}
          onSuccess={done}
          onCancel={onClose}
          onBusyChange={setBusy}
        />
      ) : (
        <>
          <p>
            Xác nhận {title.toLowerCase()}? Thao tác sẽ được lưu tại trung tâm.
          </p>
          {error != null && <ErrorState error={error} />}
          <div className="modal-footer">
            <button className="button" disabled={busy} onClick={onClose}>
              Quay lại
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(operation, { params });
                  done();
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Đang lưu…" : "Xác nhận"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
