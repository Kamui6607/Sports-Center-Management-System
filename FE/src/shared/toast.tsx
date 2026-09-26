import { useSyncExternalStore } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import "./toast.css";

type Kind = "success" | "error" | "info";
type Notice = { id: number; kind: Kind; message: string };
let notices: Notice[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
const recent = new Map<string, number>();
const emit = () => listeners.forEach((listener) => listener());
function dismiss(id: number) {
  notices = notices.filter((notice) => notice.id !== id);
  emit();
}
export function toast(kind: Kind, message: string, key = `${kind}:${message}`) {
  const now = Date.now();
  for (const [entry, timestamp] of recent)
    if (now - timestamp > 15000) recent.delete(entry);
  if (recent.has(key)) return;
  recent.set(key, now);
  const id = ++sequence;
  notices = [...notices.slice(-3), { id, kind, message }];
  emit();
  globalThis.setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000);
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => notices;
export function ToastViewport() {
  const items = useSyncExternalStore(subscribe, snapshot);
  return (
    <section className="toast-viewport" aria-label="Thông báo thao tác">
      {items.map(({ id, kind, message }) => (
        <div
          key={id}
          className={`toast-notice toast-${kind}`}
          role={kind === "error" ? "alert" : "status"}
        >
          {kind === "success" ? (
            <CheckCircle2 size={22} />
          ) : kind === "error" ? (
            <CircleAlert size={22} />
          ) : (
            <Info size={22} />
          )}
          <div>
            <strong>
              {kind === "success"
                ? "Thành công"
                : kind === "error"
                  ? "Có lỗi xảy ra"
                  : "Thông báo"}
            </strong>
            <p>{message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(id)}
            aria-label="Đóng thông báo"
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </section>
  );
}
