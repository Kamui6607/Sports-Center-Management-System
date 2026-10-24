import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/** Keep the off-canvas navigation keyboard accessible without exposing hidden links. */
export function useSidebar() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const sidebar = sidebarRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled)",
        ) || [],
      ).filter((e) => e.getClientRects().length);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open, mobile]);
  return { open, setOpen, mobile, sidebarRef, triggerRef };
}
