import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { CornerDownLeft, DoorOpen, Dumbbell, GraduationCap, Package, Search, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../shared/api";
import { useDebouncedValue } from "../../shared/useDebouncedValue";
import { ROLE_LABEL, str, vnd } from "./kit";
import type { Row } from "./kit";

export type SearchPage = { path: string; label: string; icon: LucideIcon };
type Hit = { key: string; group: string; label: string; meta?: string; to: string; icon: LucideIcon };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Mỗi nguồn = một API danh sách có tham số `search` thật của BE. */
const SOURCES: { group: string; key: string; query: Record<string, string>; hit: (r: Row) => Omit<Hit, "key" | "group"> }[] = [
  {
    group: "Người dùng",
    key: "GET /users",
    query: { limit: "5" },
    hit: (u) => ({
      label: str(u.fullName),
      meta: `${ROLE_LABEL[str(u.role)] ?? str(u.role)} · ${str(u.email)}`,
      to: u.role === "COACH" ? `/manager/coaches/${str(u.id)}` : `/manager/users/${str(u.id)}`,
      icon: u.role === "COACH" ? Dumbbell : UserRound,
    }),
  },
  { group: "Khóa học", key: "GET /classes", query: { limit: "4" }, hit: (c) => ({ label: str(c.name), meta: vnd(c.price), to: `/manager/classes/${str(c.id)}`, icon: GraduationCap }) },
  { group: "Phòng tập", key: "GET /rooms", query: { limit: "4" }, hit: (r) => ({ label: str(r.name), meta: r.capacity != null ? `${str(r.capacity)} chỗ` : undefined, to: `/manager/rooms/${str(r.id)}`, icon: DoorOpen }) },
  { group: "Sản phẩm", key: "GET /products", query: { limit: "4", isActive: "all" }, hit: (p) => ({ label: str(p.name), meta: vnd(p.price), to: `/manager/products/${str(p.id)}`, icon: Package }) },
];

/** Ô tìm kiếm toàn cục (Ctrl/⌘ K): đi tới màn quản trị + tìm người dùng, khóa học, phòng, sản phẩm qua API. */
export function GlobalSearch({ pages }: { pages: SearchPage[] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = useDebouncedValue(text.trim(), 250);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const enabled = term.length >= 2;

  const results = useQueries({
    queries: SOURCES.map((s) => ({
      queryKey: ["admin", "global-search", s.key, term],
      queryFn: ({ signal }: { signal: AbortSignal }) => api<Row[]>(s.key, { query: { ...s.query, search: term }, signal }),
      enabled,
      staleTime: 30_000,
    })),
  });

  const hits = useMemo<Hit[]>(() => {
    const q = plain(text.trim());
    const nav = q
      ? pages.filter((p) => plain(p.label).includes(q)).map((p) => ({ key: "p" + p.path, group: "Đi tới", label: p.label, to: `/manager/${p.path}`, icon: p.icon }))
      : pages.map((p) => ({ key: "p" + p.path, group: "Đi tới", label: p.label, to: `/manager/${p.path}`, icon: p.icon }));
    if (!enabled) return nav;
    const found = SOURCES.flatMap((s, i) =>
      (results[i].data?.data ?? []).map((r) => ({ key: s.group + str(r.id), group: s.group, ...s.hit(r) })),
    );
    return [...nav, ...found];
  }, [text, enabled, pages, results]);

  const loading = enabled && results.some((r) => r.isFetching);
  const failed = enabled && results.every((r) => r.isError);

  useEffect(() => setActive(0), [term, text]);
  useEffect(() => {
    setOpen(false);
    setText("");
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const onDoc = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    navigate(h.to);
    setOpen(false);
    input.current?.blur();
  };

  const compact = useCompact();
  let lastGroup = "";
  return (
    <div className="cr-gsearch" ref={root}>
      <label className="cr-gsearch-box">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Tìm kiếm trong khu quản trị</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          placeholder={compact ? "Tìm kiếm…" : "Tìm người dùng, khóa học, phòng, sản phẩm…"}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
        />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </label>
      {open && (
        <div className="cr-gsearch-pop" role="listbox" id={listId} aria-label="Kết quả tìm kiếm">
          {hits.map((h, i) => {
            const head = h.group !== lastGroup ? <div className="cr-gsearch-group" role="presentation">{h.group}</div> : null;
            lastGroup = h.group;
            const Icon = h.icon;
            return (
              <div key={h.key} role="presentation">
                {head}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="cr-gsearch-item"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(h);
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{h.label}</span>
                  {h.meta ? <small>{h.meta}</small> : i === active ? <CornerDownLeft size={14} style={{ marginLeft: "auto" }} aria-hidden="true" /> : null}
                </div>
              </div>
            );
          })}
          {text.trim().length === 1 && <div className="cr-gsearch-note">Nhập ít nhất 2 ký tự để tìm trong dữ liệu.</div>}
          {loading && <div className="cr-gsearch-note">Đang tìm…</div>}
          {failed && <div className="cr-gsearch-note">Không tìm được lúc này. Kiểm tra kết nối và thử lại.</div>}
          {enabled && !loading && !failed && hits.length === 0 && <div className="cr-gsearch-note">Không có kết quả cho “{term}”.</div>}
        </div>
      )}
    </div>
  );
}

function useCompact() {
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 600px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 600px)");
    const update = () => setCompact(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return compact;
}
