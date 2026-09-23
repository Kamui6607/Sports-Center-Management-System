import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { display, label, money } from "./config";
import { classSports } from "./sports";
export { Empty, ErrorState, Loading } from "./feedback";
export { SchemaForm, FilterField } from "./forms/SchemaForm";
export function Modal({
  title,
  children,
  onClose,
  dismissible = true,
  maxWidth,
  eyebrow = "PULSE / QUẢN LÝ TRUNG TÂM",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  maxWidth?: number;
  eyebrow?: string;
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
        if (
          (!dialog?.isConnected || !dialog.open) &&
          !document.querySelector("dialog[open]") &&
          opener.current?.isConnected
        )
          opener.current.focus({ preventScroll: true });
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
          <small>{eyebrow}</small>
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
const privateField = /password|token|secret|^__|^_count$/i;
const technicalField = /(^id$|Id$|Ids$|^createdAt$|^updatedAt$)/;
const moneyFields = [
  "price",
  "amount",
  "totalRevenue",
  "total",
  "subtotal",
  "discount",
  "refundAmount",
];
export function Details({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  if (value == null) return <span>—</span>;
  if (typeof value !== "object") return <span>{display(value)}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="detail-list">
        {value.slice(0, 3).map((v, i) => (
          <Details key={i} value={v} depth={depth + 1} />
        ))}
        {value.length > 3 && (
          <details className="detail-disclosure">
            <summary>Xem thêm {value.length - 3} mục</summary>
            {value.slice(3).map((v, i) => (
              <Details key={i} value={v} depth={depth + 1} />
            ))}
          </details>
        )}
      </div>
    ) : (
      <span>Chưa có dữ liệu</span>
    );
  const entries = Object.entries(value).filter(
    ([k, v]) => !privateField.test(k) && v != null && v !== "",
  );
  const primary = entries.filter(
    ([k, v]) =>
      !technicalField.test(k) &&
      (typeof v !== "object" ||
        ["user", "plan", "room", "class", "sport", "sports"].includes(k)),
  );
  const secondary = entries.filter(
    ([k, v]) =>
      !technicalField.test(k) &&
      typeof v === "object" &&
      !["user", "plan", "room", "class", "sport", "sports"].includes(k),
  );
  const render = ([k, v]: [string, unknown]) => (
    <div key={k}>
      <dt>{label(k)}</dt>
      <dd>
        {k === "sports" && Array.isArray(v) ? (
          <div className="workflow-actions">
            {classSports({ sports: v }).map((sport) => (
              <span className="badge" key={sport.id || sport.name}>
                {sport.name}
              </span>
            ))}
          </div>
        ) : typeof v === "object" && v !== null ? (
          depth > 1 ? (
            <details className="detail-disclosure">
              <summary>Xem {label(k).toLowerCase()}</summary>
              <Details value={v} depth={depth + 1} />
            </details>
          ) : (
            <Details value={v} depth={depth + 1} />
          )
        ) : moneyFields.includes(k) ? (
          money(v)
        ) : ["status", "tier", "classType", "role"].includes(k) ? (
          <span className="badge">{display(v)}</span>
        ) : (
          display(v)
        )}
      </dd>
    </div>
  );
  return (
    <div className="detail-content">
      <dl className="details">{primary.map(render)}</dl>
      {secondary.map(([k, v]) => (
        <details className="detail-disclosure" key={k}>
          <summary>
            {label(k)}
            {Array.isArray(v) ? <span>{v.length} mục</span> : null}
          </summary>
          <Details value={v} depth={depth + 1} />
        </details>
      ))}
      {depth === 0 && entries.some(([k]) => technicalField.test(k)) && (
        <details className="detail-disclosure detail-meta">
          <summary>Thông tin bổ sung</summary>
          <dl className="details">
            {entries.filter(([k]) => technicalField.test(k)).map(render)}
          </dl>
        </details>
      )}
    </div>
  );
}
