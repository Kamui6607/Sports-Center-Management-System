import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, BASE_URL, getAccessToken, type RecordData } from "./api";
import { Empty, ErrorState, Loading } from "./ui";
import { display } from "./config";
import "./workflow.css";
import "./communication.css";

type Notification = {
  id: string;
  title: string;
  body: string;
  reason?: string;
  isRead: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cache = useQueryClient();
  const count = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: ({ signal }) =>
      api<{ unreadCount: number }>("GET /notifications/unread-count", {
        signal,
      }),
    refetchInterval: 20_000,
  });
  const list = useQuery({
    queryKey: ["notifications", "popover"],
    queryFn: ({ signal }) =>
      api<Notification[]>("GET /notifications", {
        query: { page: "1", limit: "8" },
        signal,
      }),
    enabled: open,
  });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(
        id === "all"
          ? "PATCH /notifications/mark-all-read"
          : "PATCH /notifications/{id}/read",
        { params: { id } },
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["notifications"] }),
  });
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const unreadCount = count.data?.data.unreadCount || 0;
  return (
    <div className="notification-bell" ref={root}>
      <button
        type="button"
        className={`topbar-icon ${unreadCount ? "has-unread attention" : ""}`}
        aria-label={
          unreadCount ? `${unreadCount} thông báo chưa đọc` : "Thông báo"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="utility-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notification-popover"
          aria-label="Thông báo gần đây"
        >
          <header>
            <div>
              <strong>Thông báo</strong>
              <small>{unreadCount} chưa đọc</small>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Đánh dấu tất cả đã đọc"
              aria-label="Đánh dấu tất cả đã đọc"
              disabled={!unreadCount || markRead.isPending}
              onClick={() => markRead.mutate("all")}
            >
              <CheckCheck size={18} />
            </button>
          </header>
          <div className="notification-popover-list">
            {list.isPending ? (
              <Loading variant="cards" />
            ) : list.error ? (
              <ErrorState error={list.error} retry={() => list.refetch()} />
            ) : !list.data.data.length ? (
              <Empty text="Không có thông báo." />
            ) : (
              list.data.data.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`notification-popover-item ${item.isRead ? "" : "unread"}`}
                  onClick={() => {
                    if (!item.isRead) markRead.mutate(item.id);
                  }}
                >
                  <span className="notification-dot" />
                  <span>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <small>{display(item.createdAt)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

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
  return (
    <>
      <p className={expanded ? "" : "workflow-notification-preview"}>{text}</p>
      {text.length > 240 && (
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : "Xem đầy đủ"}
        </button>
      )}
    </>
  );
}

type Contact = { id: string; fullName: string; role: string; email?: string };
type Message = {
  id: string;
  senderId: string;
  receiverId?: string | null;
  sender: Contact;
  content?: string;
  fileUrl?: string;
  createdAt: string;
  isRead?: boolean;
};
type ConversationItem = {
  user: Contact;
  unreadCount: number;
  latestMessage?: Message;
};

export function FloatingChat({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const cache = useQueryClient();
  const unread = useQuery({
    queryKey: ["chat", "unread-count"],
    queryFn: ({ signal }) =>
      api<{ unreadCount: number }>("GET /chat/messages/unread-count", {
        signal,
      }),
    refetchInterval: open ? false : 20_000,
  });
  useEffect(() => {
    const socket = io(BASE_URL.replace(/\/api\/v1$/, ""), {
      transports: ["websocket", "polling"],
      auth: (done) => done({ token: getAccessToken() }),
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socket.on("newMessage", () => {
      void cache.invalidateQueries({ queryKey: ["chat"] });
    });
    socket.on("messagesRead", () => {
      void cache.invalidateQueries({ queryKey: ["chat"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [cache]);
  const unreadCount = unread.data?.data.unreadCount || 0;
  return (
    <div className={`floating-chat ${open ? "open" : ""}`}>
      {open && (
        <section className="floating-chat-panel" aria-label="Cửa sổ tin nhắn">
          <header className="floating-chat-header">
            <div>
              <MessageCircle size={19} />
              <strong>Tin nhắn</strong>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Đóng tin nhắn"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <Chat userId={userId} compact />
        </section>
      )}
      <button
        type="button"
        className={`floating-chat-button ${unreadCount ? "has-unread attention" : ""}`}
        aria-label={
          open
            ? "Đóng tin nhắn"
            : unreadCount
              ? `${unreadCount} tin nhắn chưa đọc`
              : "Mở tin nhắn"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={24} /> : <MessageCircle size={25} />}
        {!open && unreadCount > 0 && (
          <span className="utility-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

function attachmentUrl(value?: string) {
  if (!value) return null;
  try {
    const u = new URL(value, BASE_URL.replace(/\/api\/v1$/, "") + "/");
    const base = new URL(BASE_URL);
    if (u.hostname === base.hostname && base.protocol === "https:")
      u.protocol = "https:";
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function Chat({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const [target, setTarget] = useState("");
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const cache = useQueryClient();
  const contacts = useQuery({
    queryKey: ["chat", "contacts"],
    queryFn: ({ signal }) => api<Contact[]>("GET /chat/contacts", { signal }),
  });
  const conversations = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: ({ signal }) =>
      api<ConversationItem[]>("GET /chat/conversations", {
        signal,
      }),
  });
  useEffect(() => {
    const socketUrl = BASE_URL.replace(/\/api\/v1$/, "");
    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: (done) => done({ token: getAccessToken() }),
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("presence:list", (ids: string[]) => setOnline(new Set(ids)));
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("newMessage", () => {
      void cache.invalidateQueries({ queryKey: ["chat"] });
    });
    socket.on("messageSent", () => {
      void cache.invalidateQueries({ queryKey: ["chat"] });
    });
    socket.on("messagesRead", () => {
      void cache.invalidateQueries({ queryKey: ["chat"] });
    });
    socket.on("presenceChanged", ({ userId: id, online: isOnline }) => {
      setOnline((current) => {
        const next = new Set(current);
        if (isOnline) next.add(id);
        else next.delete(id);
        return next;
      });
    });
    socket.on("typing", ({ userId: id, isTyping }) => {
      setTyping((current) => {
        const next = new Set(current);
        if (isTyping) next.add(id);
        else next.delete(id);
        return next;
      });
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [cache]);
  const conversationById = new Map(
    (conversations.data?.data || []).map((item) => [item.user.id, item]),
  );
  const orderedContacts = useMemo(() => {
    const rows = contacts.data?.data || [];
    return [...rows]
      .filter((contact) =>
        `${contact.fullName} ${contact.email || ""}`
          .toLocaleLowerCase("vi")
          .includes(search.trim().toLocaleLowerCase("vi")),
      )
      .sort((a, b) => {
        const aTime = Date.parse(
          conversationById.get(a.id)?.latestMessage?.createdAt || "",
        );
        const bTime = Date.parse(
          conversationById.get(b.id)?.latestMessage?.createdAt || "",
        );
        return (
          (Number.isFinite(bTime) ? bTime : 0) -
          (Number.isFinite(aTime) ? aTime : 0)
        );
      });
  }, [contacts.data, conversations.data, search]);
  const selectedContact = contacts.data?.data.find(
    (item) => item.id === target,
  );
  return (
    <div className={`workflow-page chat-page ${compact ? "compact" : ""}`}>
      {!compact && (
        <div className="page-heading">
          <div>
            <h1>Tin nhắn</h1>
            <p>
              Trao đổi tức thời với đội ngũ và huấn luyện viên của trung tâm.
            </p>
          </div>
          <span
            className={`chat-connection ${connected ? "online" : ""}`}
            role="status"
          >
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            {connected ? "Đang kết nối realtime" : "Đang kết nối lại…"}
          </span>
        </div>
      )}
      {compact && (
        <span
          className={`chat-connection ${connected ? "online" : ""}`}
          role="status"
        >
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? "Realtime" : "Đang kết nối lại…"}
        </span>
      )}
      {contacts.isPending ? (
        <Loading variant="field" />
      ) : contacts.error ? (
        <ErrorState error={contacts.error} retry={() => contacts.refetch()} />
      ) : contacts.isError ? null : (
        <div className="chat-shell panel">
          <aside className="chat-sidebar" aria-label="Danh sách trò chuyện">
            <div className="chat-sidebar-head">
              <label>
                Cuộc trò chuyện
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">Phòng chung · tất cả thành viên</option>
                  {contacts.data.data.map((contact) => (
                    <option value={contact.id} key={contact.id}>
                      {contact.fullName} · {display(contact.role)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="chat-search">
                <Search size={16} />
                <input
                  aria-label="Tìm người nhắn tin"
                  placeholder="Tìm người…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <button
              className={`chat-contact ${target === "" ? "active" : ""}`}
              onClick={() => setTarget("")}
            >
              <span className="chat-avatar group">
                <Users size={18} />
              </span>
              <span>
                <strong>Phòng chung</strong>
                <small>Không gian trao đổi của trung tâm</small>
              </span>
            </button>
            {orderedContacts.map((contact) => {
              const item = conversationById.get(contact.id);
              return (
                <button
                  className={`chat-contact ${target === contact.id ? "active" : ""}`}
                  key={contact.id}
                  onClick={() => setTarget(contact.id)}
                >
                  <span className="chat-avatar">
                    {contact.fullName.slice(0, 2).toUpperCase()}
                    <i className={online.has(contact.id) ? "online" : ""} />
                  </span>
                  <span>
                    <strong>{contact.fullName}</strong>
                    <small>
                      {item?.latestMessage?.content || display(contact.role)}
                    </small>
                  </span>
                  {item?.unreadCount ? (
                    <b className="chat-unread">{item.unreadCount}</b>
                  ) : null}
                </button>
              );
            })}
          </aside>
          <Conversation
            key={target}
            target={target}
            userId={userId}
            contact={selectedContact}
            online={target ? online.has(target) : connected}
            isTyping={target ? typing.has(target) : false}
            socket={socketRef.current}
            connected={connected}
          />
        </div>
      )}
    </div>
  );
}
function Conversation({
  target,
  userId,
  contact,
  online,
  isTyping,
  socket,
  connected,
}: {
  target: string;
  userId: string;
  contact?: Contact;
  online: boolean;
  isTyping: boolean;
  socket: Socket | null;
  connected: boolean;
}) {
  const cache = useQueryClient();
  const [content, setContent] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [validation, setValidation] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const messages = useQuery({
    queryKey: ["chat", "messages", target],
    queryFn: ({ signal }) =>
      api<Message[]>("GET /chat/messages", {
        query: { targetId: target },
        signal,
      }),
    refetchInterval: connected ? false : 15000,
  });
  const read = useMutation({
    mutationFn: () =>
      api("PATCH /chat/messages/read", { body: { targetId: target } }),
    onSuccess: () => {
      socket?.emit("markAsRead", { targetId: target || undefined });
      void cache.invalidateQueries({ queryKey: ["chat"] });
    },
  });
  const send = useMutation({
    mutationFn: (body: FormData) =>
      api<RecordData>("POST /chat/messages", { body }),
    onSuccess: () => {
      setContent("");
      setFile(null);
      socket?.emit("typing", {
        receiverId: target || undefined,
        isTyping: false,
      });
      void cache.invalidateQueries({ queryKey: ["chat"] });
    },
  });
  useEffect(() => {
    if (target && messages.isSuccess) read.mutate();
  }, [target, messages.isSuccess]);
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.data?.data.length, isTyping]);
  useEffect(
    () => () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      socket?.emit("typing", {
        receiverId: target || undefined,
        isTyping: false,
      });
    },
    [socket, target],
  );
  function updateTyping(value: string) {
    setContent(value);
    if (!socket || !connected) return;
    socket.emit("typing", {
      receiverId: target || undefined,
      isTyping: Boolean(value.trim()),
    });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(
      () =>
        socket.emit("typing", {
          receiverId: target || undefined,
          isTyping: false,
        }),
      1600,
    );
  }
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
    <section className="chat-conversation">
      <header className="chat-conversation-head">
        <span className={`chat-avatar ${target ? "" : "group"}`}>
          {target ? (
            contact?.fullName.slice(0, 2).toUpperCase()
          ) : (
            <Users size={18} />
          )}
          {target && <i className={online ? "online" : ""} />}
        </span>
        <div>
          <h2>
            {target ? contact?.fullName || "Trao đổi riêng" : "Phòng chung"}
          </h2>
          <small>
            {target
              ? online
                ? "Đang hoạt động"
                : display(contact?.role)
              : "Không gian chung của trung tâm"}
          </small>
        </div>
        {target && (
          <button
            className="button small"
            disabled={read.isPending}
            onClick={() => read.mutate()}
          >
            Đánh dấu đã đọc
          </button>
        )}
      </header>
      {read.error && <ErrorState error={read.error} />}
      <div
        className="workflow-messages chat-log"
        role="log"
        aria-label="Lịch sử trò chuyện"
        ref={log}
      >
        {messages.isPending ? (
          <Loading variant="cards" />
        ) : messages.error ? (
          <ErrorState error={messages.error} retry={() => messages.refetch()} />
        ) : !messages.data.data.length ? (
          <Empty text="Chưa có tin nhắn." />
        ) : (
          messages.data.data.map((m, index) => (
            <article
              className={
                "workflow-message " + (m.senderId === userId ? "own" : "")
              }
              key={m.id}
            >
              {m.senderId !== userId && <strong>{m.sender?.fullName}</strong>}
              {m.content && <p>{m.content}</p>}
              {attachmentUrl(m.fileUrl) && (
                <a
                  href={attachmentUrl(m.fileUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/\.(png|jpe?g|gif|webp|avif)(?:\?|$)/i.test(
                    m.fileUrl || "",
                  ) ? (
                    <img
                      className="chat-image"
                      src={attachmentUrl(m.fileUrl)!}
                      alt="Ảnh đính kèm"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.alt =
                          "Không tải được ảnh — nhấn để mở tệp";
                      }}
                      onLoad={() => {
                        if (log.current)
                          log.current.scrollTop = log.current.scrollHeight;
                      }}
                    />
                  ) : (
                    <span className="chat-document">
                      <Paperclip size={18} />{" "}
                      {m.fileUrl?.split("/").pop()?.split("?")[0] ||
                        "Mở tệp đính kèm"}
                    </span>
                  )}
                </a>
              )}
              <small>
                {new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {m.senderId === userId &&
                index === messages.data.data.length - 1
                  ? " · Đã gửi"
                  : ""}
              </small>
            </article>
          ))
        )}
        {isTyping && (
          <div className="chat-typing" aria-live="polite">
            <i />
            <i />
            <i />
            <span>đang nhập…</span>
          </div>
        )}
      </div>
      <form className="chat-composer" onSubmit={submit} ref={form}>
        <fieldset disabled={send.isPending}>
          {file && (
            <div className="chat-file">
              <Paperclip size={15} /> <span>{file.name}</span>
              <button
                type="button"
                aria-label="Bỏ tệp"
                onClick={() => setFile(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="chat-compose-row">
            <label className="chat-attach" title="Đính kèm tệp">
              <Paperclip size={19} />
              <span className="sr-only">Tệp đính kèm · tối đa 10 MB</span>
              <input
                aria-label="Tệp đính kèm · tối đa 10 MB"
                key={send.isSuccess && !file ? "empty" : "file"}
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>
            <label className="chat-input">
              <span className="sr-only">Nội dung</span>
              <textarea
                aria-label="Nội dung"
                placeholder={`Nhắn tin tới ${target ? contact?.fullName || "người nhận" : "phòng chung"}…`}
                maxLength={5000}
                rows={1}
                value={content}
                onChange={(event) => updateTyping(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    form.current?.requestSubmit();
                  }
                }}
              />
            </label>
            <button
              className="chat-send"
              aria-label="Gửi tin nhắn"
              disabled={send.isPending || (!content.trim() && !file)}
            >
              <Send size={19} />
            </button>
          </div>
          {validation && <p role="alert">{validation}</p>}
          {send.error && <ErrorState error={send.error} />}
          {send.isPending && <small role="status">Đang gửi tin nhắn…</small>}
        </fieldset>
      </form>
    </section>
  );
}
