import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

/** Bận ngắn hơn ngưỡng này thì không hiện thanh (tránh nháy khi dữ liệu đã có trong cache). */
const SHOW_DELAY = 150;
const DONE_FADE = 460;

/**
 * Thanh tiến trình mảnh trên cùng: chạy khi đổi trang, khi một truy vấn tải lần đầu (chưa có dữ liệu) hoặc khi đang lưu.
 * Không tính các lần làm mới nền (thông báo, polling) để thanh không nhấp nháy liên tục.
 */
export function RouteProgress() {
  const { pathname } = useLocation();
  const loading = useIsFetching({ predicate: (q) => q.state.data === undefined });
  const saving = useIsMutating();
  const [navigating, setNavigating] = useState(false);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const first = useRef(true);

  // Đổi trang ⇒ coi như bận một nhịp ngắn (chunk lazy + truy vấn đầu tiên sẽ nối tiếp).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setNavigating(true);
    const t = window.setTimeout(() => setNavigating(false), 260);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const busy = navigating || loading > 0 || saving > 0;
  useEffect(() => {
    if (busy) {
      const t = window.setTimeout(() => setState("running"), SHOW_DELAY);
      return () => window.clearTimeout(t);
    }
    setState((s) => (s === "running" ? "done" : s));
    const t = window.setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), DONE_FADE);
    return () => window.clearTimeout(t);
  }, [busy]);

  return <div className="cr-progress" data-state={state} aria-hidden="true" />;
}
