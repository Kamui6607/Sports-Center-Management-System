import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { display, label, money } from "./config";
export { Empty, ErrorState, Loading } from "./feedback";
export { SchemaForm, FilterField } from "./forms/SchemaForm";
export function Modal({
  title,
  children,
  onClose,
  dismissible = true,
  maxWidth,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (
      document.activeElement instanceof HTMLElement &&
      !dialog?.contains(document.activeElement)
    )
      opener.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (!dialog?.isConnected || !dialog.open) opener.current?.focus();
      });
    };
  }, []);
  return (
    <dialog
      style={maxWidth ? { maxWidth } : undefined}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        const bounds = ref.current?.getBoundingClientRect();
        if (
          dismissible &&
          e.target === ref.current &&
          bounds &&
          (e.clientX < bounds.left ||
            e.clientX > bounds.right ||
            e.clientY < bounds.top ||
            e.clientY > bounds.bottom)
        )
          onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <small>PULSE / QUẢN LÝ TRUNG TÂM</small>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          aria-label="Đóng"
          className="icon-button"
          disabled={!dismissible}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Details({ value }: { value: unknown }) {
  if (value == null) return <span>—</span>;
  if (typeof value !== "object") return <span>{display(value)}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="detail-list">
        {value.map((v, i) => (
          <div key={i}>
            <Details value={v} />
          </div>
        ))}
      </div>
    ) : (
      <span>Chưa có dữ liệu</span>
    );
  return (
    <dl className="details">
      {Object.entries(value)
        .filter(
          ([k]) =>
            ![
              "password",
              "passwordHash",
              "accessToken",
              "refreshToken",
            ].includes(k),
        )
        .map(([k, v]) => (
          <div key={k}>
            <dt>{label(k)}</dt>
            <dd>
              {typeof v === "object" && v !== null ? (
                <Details value={v} />
              ) : [
                  "price",
                  "amount",
                  "totalRevenue",
                  "total",
                  "subtotal",
                  "discount",
                ].includes(k) ? (
                money(v)
              ) : (
                display(v)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
