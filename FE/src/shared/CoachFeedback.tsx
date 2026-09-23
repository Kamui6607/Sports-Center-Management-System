import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RecordData } from "./api";
import { at } from "./config";
import { ErrorState, Loading, Modal } from "./ui";

export function CoachFeedback({
  coachId,
  classId,
  role,
  canReview = false,
}: {
  coachId: string;
  classId?: string;
  role: string;
  canReview?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [removeId, setRemoveId] = useState("");
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ["feedback", coachId, classId, page],
    queryFn: ({ signal }) =>
      api<{
        feedbacks: RecordData[];
        summary: { averageRating: number | null; totalFeedbacks: number };
      }>("GET /feedbacks", {
        query: {
          coachId,
          ...(classId ? { classId } : {}),
          page: String(page),
          limit: "5",
        },
        signal,
      }),
  });
  const mine = useQuery({
    queryKey: ["my-feedback"],
    enabled: role === "MEMBER",
    queryFn: ({ signal }) => api<RecordData[]>("GET /feedbacks/my", { signal }),
  });
  const own = mine.data?.data.find(
    (f) => f.coachId === coachId && (!classId || f.classId === classId),
  );
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["feedback"] });
    void cache.invalidateQueries({ queryKey: ["my-feedback"] });
  };
  const save = useMutation({
    mutationFn: () =>
      api("POST /feedbacks", {
        body: {
          coachId,
          ...(classId ? { classId } : {}),
          rating,
          comment: comment.trim(),
          isAnonymous: anonymous,
        },
      }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api(
        role === "MANAGER"
          ? "DELETE /feedbacks/{id}/manager"
          : "DELETE /feedbacks/{id}",
        { params: { id: removeId } },
      ),
    onSuccess: () => {
      setRemoveId("");
      refresh();
    },
  });
  return (
    <section className="workflow-page">
      <h3>Đánh giá huấn luyện viên</h3>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <p>
            <strong>{q.data.data.summary.averageRating ?? "—"} / 5</strong> ·{" "}
            {q.data.data.summary.totalFeedbacks} đánh giá của HLV
          </p>
          {q.data.data.feedbacks.length === 0 && (
            <p>Chưa có đánh giá cho lựa chọn này.</p>
          )}
          {q.data.data.feedbacks.map((f) => (
            <article className="feedback-card" key={String(f.id)}>
              <strong>
                {f.isAnonymous
                  ? "Ẩn danh"
                  : String(at(f, "member.user.fullName") || "Hội viên")}{" "}
                · {String(f.rating)}/5
              </strong>
              <p>{String(f.comment || "Không có nhận xét.")}</p>
              {(role === "MANAGER" ||
                mine.data?.data.some((m) => m.id === f.id)) && (
                <button
                  className="button small danger-text"
                  onClick={() => {
                    remove.reset();
                    setRemoveId(String(f.id));
                  }}
                >
                  {role === "MANAGER" ? "Xóa đánh giá vi phạm" : "Xóa đánh giá"}
                </button>
              )}
            </article>
          ))}
          {(q.data.pagination?.totalPages || 0) > 1 && (
            <div className="workflow-actions">
              <button
                className="button"
                disabled={page <= 1 || q.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Trước
              </button>
              <span>Trang {page}</span>
              <button
                className="button"
                disabled={
                  page >= (q.data.pagination?.totalPages || 1) || q.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                Sau
              </button>
            </div>
          )}
        </>
      )}
      {role === "MEMBER" && (canReview || own) && (
        <button
          className="button"
          disabled={mine.isPending || mine.isError}
          onClick={() => {
            save.reset();
            setRating(Number(own?.rating || 5));
            setComment(String(own?.comment || ""));
            setAnonymous(Boolean(own?.isAnonymous));
            setEditing(true);
          }}
        >
          {own ? "Sửa đánh giá của tôi" : "Viết đánh giá"}
        </button>
      )}
      {mine.error && (
        <ErrorState error={mine.error} retry={() => mine.refetch()} />
      )}
      {save.isSuccess && (
        <p className="success" role="status">
          Đã lưu đánh giá của bạn.
        </p>
      )}
      {editing && (
        <Modal
          title="Đánh giá huấn luyện viên"
          onClose={() => setEditing(false)}
          dismissible={!save.isPending}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!save.isPending) save.mutate();
            }}
          >
            <fieldset className="form-grid" disabled={save.isPending}>
              <label>
                Số sao
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} sao
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hiển thị tên
                <select
                  value={String(anonymous)}
                  onChange={(e) => setAnonymous(e.target.value === "true")}
                >
                  <option value="false">Tên của tôi</option>
                  <option value="true">Ẩn danh</option>
                </select>
              </label>
              <label className="wide">
                Nhận xét
                <textarea
                  maxLength={1000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
            </fieldset>
            {save.error && <ErrorState error={save.error} />}
            <div className="modal-footer">
              <button
                type="button"
                className="button"
                disabled={save.isPending}
                onClick={() => setEditing(false)}
              >
                Quay lại
              </button>
              <button className="button primary" disabled={save.isPending}>
                {save.isPending ? "Đang gửi…" : "Gửi đánh giá"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removeId && (
        <Modal
          title="Xóa đánh giá"
          onClose={() => setRemoveId("")}
          dismissible={!remove.isPending}
        >
          <p className="confirm-copy">
            Đánh giá này sẽ bị xóa. Bạn có muốn tiếp tục?
          </p>
          {remove.error && <ErrorState error={remove.error} />}
          <div className="modal-footer">
            <button
              className="button"
              disabled={remove.isPending}
              onClick={() => setRemoveId("")}
            >
              Quay lại
            </button>
            <button
              className="button danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Xác nhận xóa
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
