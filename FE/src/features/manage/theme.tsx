import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "pulse.theme";
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const media = () => window.matchMedia?.("(prefers-color-scheme: dark)");

/** Gán `data-theme` trên <html> — mọi token của design system đọc theo thuộc tính này. */
function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && Boolean(media()?.matches));
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.style.background = dark ? "#0f1a16" : "#f6f8f7";
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* trình duyệt chặn storage: vẫn áp dụng cho phiên hiện tại */
  }
  apply(pref);
  listeners.forEach((l) => l());
}

export function useThemePref(): ThemePref {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system" as ThemePref,
  );
  useEffect(() => {
    apply(pref);
    if (pref !== "system") return;
    const m = media();
    const onChange = () => apply("system");
    m?.addEventListener("change", onChange);
    return () => m?.removeEventListener("change", onChange);
  }, [pref]);
  return pref;
}

const OPTIONS: [ThemePref, string, typeof Sun][] = [
  ["light", "Giao diện sáng", Sun],
  ["dark", "Giao diện tối", Moon],
  ["system", "Theo hệ điều hành", Monitor],
];

/** Chọn Sáng / Tối / Theo hệ điều hành (trang Tài khoản). */
export function ThemeSwitcher() {
  const pref = useThemePref();
  return (
    <div className="cr-theme" role="group" aria-label="Chế độ giao diện">
      {OPTIONS.map(([value, label, Icon]) => (
        <button key={value} type="button" aria-pressed={pref === value} onClick={() => setThemePref(value)}>
          <Icon size={15} aria-hidden="true" /> {label.replace("Giao diện ", "").replace(/^./, (c) => c.toUpperCase())}
        </button>
      ))}
    </div>
  );
}

/** Nút chuyển nhanh sáng ⇄ tối trên thanh trên cùng (theo theme đang hiển thị). */
export function ThemeToggle() {
  useThemePref();
  const dark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";
  const label = dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";
  return (
    <button type="button" className="cr-round" aria-label={label} title={label} onClick={() => setThemePref(dark ? "light" : "dark")}>
      {dark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
