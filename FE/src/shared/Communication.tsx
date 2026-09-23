import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BASE_URL, type RecordData } from "./api";
import { Empty, ErrorState, Loading } from "./ui";
import { display } from "./config";
import "./workflow.css";

type Notification = {
  id: string;
  title: string;
  body: string;
  reason?: string;
  isRead: boolean;
  createdAt: string;
};
export function Notifications({ role }: { role: string }) {
  const [page, setPage] = useState(1),
    [unread, setUnread] = useState(false);
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ["notifications", page, unread],
    queryFn: ({ signal }) =>
      api<Notification[]>("GET /notifications", {
        query: {
          page: String(page),
          limit: "20",
          ...(unread ? { isRead: "false" } : {}),
        },
        signal,
      }),
  });
  const count = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: ({ signal }) =>
      api<{ unreadCount: number }>("GET /notifications/unread-count", {
        signal,
      }),
  });
  const action = useMutation({
    mutationFn: (id: string) =>
      api(
        id === "all"
          ? "PATCH /notifications/mark-all-read"
          : "PATCH /notifications/{id}/read",
        { params: { id } },
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const reminders = useMutation({
    mutationFn: () =>
      api<{ sent: number }>("POST /notifications/trigger-upcoming-reminders"),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <div className="workflow-page">
      <div className="page-heading">
        <div>
          <h1>Thông báo</h1>
          <p>
            {count.data
              ? `${count.data.data.unreadCount} thông báo chưa đọc`
              : "Cập nhật từ trung tâm"}
          </p>
        </div>
      </div>
      <div className="workflow-actions">
        <label>
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              setPage(1);
            }}
          />{" "}
          Chỉ xem chưa đọc
        </label>
        <button
          className="button"
          disabled={action.isPending || !count.data?.data.unreadCount}
          onClick={() => action.mutate("all")}
        >
          Đánh dấu tất cả đã đọc
        </button>
      </div>
      {action.error && <ErrorState error={action.error} />}
      {list.isPending ? (
        <Loading variant="cards" />
      ) : list.error ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : !list.data.data.length ? (
        <Empty text="Không có thông báo." />
      ) : (
        list.data.data.map((n) => (
          <article className="panel workflow-card" key={n.id}>
            <div className="workflow-actions">
              <h2>{n.title}</h2>
              {!n.isRead && <span className="badge">Chưa đọc</span>}
            </div>
            <NotificationBody text={n.body} />
            {n.reason && <p>Lý do: {n.reason}</p>}
            <small>{display(n.createdAt)}</small>
            {!n.isRead && (
              <button
                className="button small"
                disabled={action.isPending}
                onClick={() => action.mutate(n.id)}
              >
                Đánh dấu đã đọc
              </button>
            )}
          </article>
        ))
      )}
      <div className="workflow-actions">
        <button
          className="button"
          disabled={page === 1 || list.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Trước
        </button>
        <span>Trang {page}</span>
        <button
          className="button"
          disabled={
            list.isFetching ||
            !list.data?.pagination ||
            page >= list.data.pagination.totalPages
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </button>
      </div>
      {["MANAGER", "STAFF"].includes(role) && (
        <section className="panel workflow-card">
          <h2>Nhắc lịch tập sắp tới</h2>
          <p>
            Gửi thông báo trong hệ thống cho hội viên đã đặt lớp trong 24 giờ
            tới.
          </p>
          <button
            className="button"
            disabled={reminders.isPending}
            onClick={() => reminders.mutate()}
          >
            {reminders.isPending ? "Đang gửi…" : "Gửi nhắc lịch"}
          </button>
          {reminders.error && <ErrorState error={reminders.error} />}
          {reminders.isSuccess && (
            <p role="status">Đã gửi {reminders.data.data.sent} thông báo.</p>
          )}
        </section>
      )}
    </div>
  );
}

function NotificationBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return <><p className={expanded ? "" : "workflow-notification-preview"}>{text}</p>{text.length > 240 && <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? "Thu gọn" : "Xem đầy đủ"}</button>}</>;
}

type Contact = { id: string; fullName: string; role: string };
type Message = {
  id: string;
  senderId: string;
  sender: Contact;
  content?: string;
  fileUrl?: string;
  createdAt: string;
};
function attachmentUrl(value?: string) {
  if (!value) return null;
  try {
    const u = new URL(value);
    const base = new URL(BASE_URL);
    return u.origin === base.origin &&
      u.pathname.startsWith("/uploads/") &&
      ["https:", "http:"].includes(u.protocol)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function Chat({ userId }: { userId: string }) {
  const [target, setTarget] = useState("");
  const contacts = useQuery({
    queryKey: ["chat", "contacts"],
    queryFn: ({ signal }) => api<Contact[]>("GET /chat/contacts", { signal }),
  });
  const conversations = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: ({ signal }) =>
      api<{ user: Contact; unreadCount: number }[]>("GET /chat/conversations", {
        signal,
      }),
  });
  return (
    <div className="workflow-page">
      <div className="page-heading">
        <div>
          <h1>Tin nhắn</h1>
          <p>Trao đổi riêng hoặc chia sẻ trong phòng chung của trung tâm.</p>
        </div>
      </div>
      {contacts.isPending ? (
        <Loading variant="field" />
      ) : contacts.error ? (
        <ErrorState error={contacts.error} retry={() => contacts.refetch()} />
      ) : (
        <label>
          Cuộc trò chuyện
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Phòng chung · tất cả thành viên</option>
            {contacts.data.data.map((c) => (
              <option value={c.id} key={c.id}>
                {c.fullName} · {display(c.role)}
                {conversations.data?.data.find((v) => v.user.id === c.id)
                  ?.unreadCount
                  ? " · có tin chưa đọc"
                  : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {!contacts.isPending && !contacts.isError && (
        <Conversation key={target} target={target} userId={userId} />
      )}
    </div>
  );
}
function Conversation({ target, userId }: { target: string; userId: string }) {
  const cache = useQueryClient();
  const [content, setContent] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [validation, setValidation] = useState("");
  const messages = useQuery({
    queryKey: ["chat", "messages", target],
    queryFn: ({ signal }) =>
      api<Message[]>("GET /chat/messages", {
        query: { targetId: target },
        signal,
      }),
    refetchInterval: 15000,
  });
  const read = useMutation({
    mutationFn: () =>
      api("PATCH /chat/messages/read", { body: { targetId: target } }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["chat"] }),
  });
  const send = useMutation({
    mutationFn: (body: FormData) =>
      api<RecordData>("POST /chat/messages", { body }),
    onSuccess: () => {
      setContent("");
      setFile(null);
      void cache.invalidateQueries({ queryKey: ["chat"] });
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (send.isPending) return;
    setValidation("");
    if (!content.trim() && !file) {
      setValidation("Nhập nội dung hoặc chọn tệp đính kèm.");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setValidation("Tệp tối đa 10 MB.");
      return;
    }
    const body = new FormData();
    if (target) body.set("receiverId", target);
    if (content.trim()) body.set("content", content.trim());
    if (file) body.set("file", file);
    send.mutate(body);
  }
  return (
    <section className="panel workflow-card">
      <div className="workflow-actions">
        <h2>{target ? "Trao đổi riêng" : "Phòng chung"}</h2>
        {target && (
          <button
            className="button small"
            disabled={read.isPending}
            onClick={() => read.mutate()}
          >
            Đánh dấu đã đọc
          </button>
        )}
      </div>
      {read.error && <ErrorState error={read.error} />}
      <div
        className="workflow-messages"
        role="log"
        aria-label="Lịch sử trò chuyện"
      >
        {messages.isPending ? (
          <Loading variant="cards" />
        ) : messages.error ? (
          <ErrorState error={messages.error} retry={() => messages.refetch()} />
        ) : !messages.data.data.length ? (
          <Empty text="Chưa có tin nhắn." />
        ) : (
          messages.data.data.map((m) => (
            <article
              className={
                "workflow-message " + (m.senderId === userId ? "own" : "")
              }
              key={m.id}
            >
              <strong>{m.sender?.fullName}</strong>
              <p>{m.content}</p>
              {attachmentUrl(m.fileUrl) && (
                <a
                  href={attachmentUrl(m.fileUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mở tệp đính kèm
                </a>
              )}
              <small>{display(m.createdAt)}</small>
            </article>
          ))
        )}
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={send.isPending}>
          <label>
            Nội dung
            <textarea
              maxLength={5000}
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <label>
            Tệp đính kèm · tối đa 10 MB
            <input
              key={send.isSuccess && !file ? "empty" : "file"}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {validation && <p role="alert">{validation}</p>}
          {send.error && <ErrorState error={send.error} />}
          <button
            className="button primary"
            disabled={send.isPending || (!content.trim() && !file)}
          >
            {send.isPending ? "Đang gửi…" : "Gửi tin nhắn"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
