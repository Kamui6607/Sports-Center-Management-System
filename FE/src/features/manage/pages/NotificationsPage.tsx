import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, CheckCheck } from "lucide-react";
import { api } from "../../../shared/api";
import type { Notification } from "../../../shared/Communication";
import { EmptyState, ErrorBox, PageHead, Pager, Panel, QueryView, clock, num, useUrlState, vnDateKey } from "../kit";
import { managerNotificationLink } from "../notificationLinks";

/** Nhãn ngày cho nhóm thông báo: Hôm nay / Hôm qua / Thứ, dd/mm/yyyy (giờ Việt Nam). */
function dayLabel(key: string, today: string, yesterday: string) {
  if (key === today) return "Hôm nay";
  if (key === yesterday) return "Hôm qua";
  const [y, m, d] = key.split("-");
  const wd = new Date(`${key}T12:00:00+07:00`).getDay();
  return `${wd === 0 ? "Chủ nhật" : "Thứ " + (wd + 1)}, ${d}/${m}/${y}`;
}

/** Toàn bộ thông báo của Quản lý: lọc chưa đọc, đánh dấu đã đọc, mở trang liên quan. */
export default function NotificationsPage() {
  const s = useUrlState({ view: "all" });
  const unreadOnly = s.value("view") === "unread";
  const cache = useQueryClient();
  const query = { page: String(s.page), limit: "20", ...(unreadOnly ? { isRead: "false" } : {}) };
  const list = useQuery({
    queryKey: ["notifications", "page", query],
    queryFn: ({ signal }) => api<Notification[]>("GET /notifications", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const count = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: ({ signal }) => api<{ unreadCount: number }>("GET /notifications/unread-count", { signal }),
  });
  const mark = useMutation({
    mutationFn: (id: string) =>
      api(id === "all" ? "PATCH /notifications/mark-all-read" : "PATCH /notifications/{id}/read", { params: { id }, silent: id !== "all" }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = count.data?.data.unreadCount ?? 0;
  const now = new Date();
  const today = vnDateKey(now);
  const yesterday = vnDateKey(new Date(now.getTime() - 86_400_000));

  return (
    <>
      <PageHead
        title="Thông báo"
        desc={count.data ? (unread ? `${num(unread)} thông báo chưa đọc` : "Bạn đã đọc hết thông báo") : "Cập nhật từ hệ thống và hội viên"}
        actions={
          <button className="cr-btn" disabled={!unread || mark.isPending} aria-busy={(mark.isPending && mark.variables === "all") || undefined} onClick={() => mark.mutate("all")}>
            <CheckCheck size={16} aria-hidden="true" /> Đánh dấu tất cả đã đọc
          </button>
        }
      />
      <Panel
        flush
        title={unreadOnly ? "Chưa đọc" : "Tất cả thông báo"}
        actions={
          <div className="cr-seg" role="group" aria-label="Lọc thông báo">
            <button type="button" aria-pressed={!unreadOnly} onClick={() => s.set({ view: "all" })}>
              Tất cả
            </button>
            <button type="button" aria-pressed={unreadOnly} onClick={() => s.set({ view: "unread" })}>
              Chưa đọc{unread ? ` (${num(unread)})` : ""}
            </button>
          </div>
        }
      >
        {mark.isError ? (
          <div style={{ padding: "0 22px 12px" }}>
            <ErrorBox error={mark.error} />
          </div>
        ) : null}
        <QueryView q={list} rows={8}>
          {(res) => {
            if (!res.data.length)
              return (
                <div style={{ padding: "8px 22px 22px" }}>
                  <EmptyState
                    title={unreadOnly ? "Không còn thông báo chưa đọc" : "Chưa có thông báo"}
                    text={unreadOnly ? "Mọi thông báo đã được xem." : "Yêu cầu hoàn tiền, khóa học chờ duyệt, đơn hàng… sẽ hiện ở đây."}
                  />
                </div>
              );
            const groups: [string, Notification[]][] = [];
            for (const n of res.data) {
              const key = vnDateKey(new Date(n.createdAt));
              const last = groups[groups.length - 1];
              if (last && last[0] === key) last[1].push(n);
              else groups.push([key, [n]]);
            }
            return (
              <div className="cr-notes">
                {groups.map(([key, items]) => (
                  <section key={key} aria-label={dayLabel(key, today, yesterday)}>
                    <h3 className="cr-notes-day">{dayLabel(key, today, yesterday)}</h3>
                    <ul>
                      {items.map((n) => {
                        const to = managerNotificationLink(n);
                        return (
                          <li key={n.id} className={n.isRead ? "" : "unread"}>
                            <span className="cr-notes-dot" aria-label={n.isRead ? undefined : "Chưa đọc"} />
                            <div className="cr-notes-main">
                              <strong>{n.title}</strong>
                              <p>{n.body}</p>
                              {n.reason ? <p className="cr-notes-reason">Lý do: {n.reason}</p> : null}
                            </div>
                            <time dateTime={n.createdAt}>{clock(n.createdAt)}</time>
                            <div className="cr-notes-actions">
                              {to ? (
                                <Link className="cr-btn sm" to={to} onClick={() => !n.isRead && mark.mutate(n.id)}>
                                  Mở <ArrowUpRight size={14} aria-hidden="true" />
                                </Link>
                              ) : null}
                              {!n.isRead ? (
                                <button
                                  type="button"
                                  className="cr-btn sm ghost icon"
                                  aria-label="Đánh dấu đã đọc"
                                  title="Đánh dấu đã đọc"
                                  disabled={mark.isPending && mark.variables === n.id}
                                  onClick={() => mark.mutate(n.id)}
                                >
                                  <Check size={16} />
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                <div style={{ padding: "4px 22px 16px" }}>
                  <Pager meta={res.pagination} onPage={s.setPage} />
                </div>
              </div>
            );
          }}
        </QueryView>
      </Panel>
    </>
  );
}
