/** Nét nhịp tim kết thúc bằng dấu chấm của "pulse." — nguồn gốc ở `Doc/brand/pulse-mark.svg` (đồng bộ Mobile). */
const TRACE = "M10 33H20L25.5 18L32.5 48L37.5 33H41";

/**
 * Logo biểu tượng Pulse. `boxed` (mặc định) vẽ ô vuông bo góc; màu ô / nét lấy từ biến CSS
 * `--pm-bg` / `--pm-fg` để từng nơi tự đổi theo nền. `boxed={false}` chỉ vẽ nét, màu theo `currentColor`.
 */
export function PulseMark({ size = 32, boxed = true, className = "" }: { size?: number; boxed?: boolean; className?: string }) {
  const fg = boxed ? "var(--pm-fg, #d3f879)" : "currentColor";
  return (
    <svg className={"pulse-mark " + className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {boxed && <rect width="64" height="64" rx="16" fill="var(--pm-bg, #203d31)" />}
      <path d={TRACE} fill="none" stroke={fg} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="33" r="4.5" fill={fg} />
    </svg>
  );
}
